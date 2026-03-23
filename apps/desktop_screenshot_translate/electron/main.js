const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, clipboard, screen, shell, dialog } = require('electron');

const { loadProjectConfig } = require('./lib/project-config');
const {
  captureSelectionImage,
  probeScreenCaptureCapability,
  recognizeText,
  translateText,
} = require('./lib/local-pipeline');
const {
  ensureRuntimeOverridesTemplate,
  getPrimaryRuntimeOverridePath,
  loadRuntimeOverrides,
  writeRuntimeOverrides,
} = require('./lib/runtime-overrides');
const {
  OFFICIAL_OPENAI_BASE_URL,
  TRANSLATION_SERVICE_PRESETS,
  getTranslationServicePreset,
  normalizeBaseUrl,
  normalizeTranslationService,
  resolveOpenAiApiKey,
  resolveOpenAiBaseUrl,
  resolveTranslationModel,
  resolveTranslationService,
} = require('./lib/provider-runtime');
const { createWindowStateStore } = require('./lib/window-state');
const { createConversationStore } = require('./lib/conversation-store');
const {
  isWindowsFocusSupported,
  restoreForegroundWindow,
  snapshotForegroundWindow,
} = require('./lib/windows-focus');
const { createAutoUpdateRuntime } = require('./lib/update-runtime');

app.setName('AiTrans');
const stateNamespace = 'AiTrans';
const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
  process.exit(0);
}

function resolveLogFilePath() {
  const appData = process.env.APPDATA || process.env.LOCALAPPDATA;
  const baseDir = appData
    ? path.join(appData, 'AiTrans', 'logs')
    : path.join(__dirname, '.runtime-logs');
  fs.mkdirSync(baseDir, { recursive: true });
  return path.join(baseDir, 'main.log');
}

function appendStartupLog(message, extra) {
  const logFile = resolveLogFilePath();
  const line = `[${new Date().toISOString()}] ${message}${extra ? ` ${JSON.stringify(extra)}` : ''}\n`;
  fs.appendFileSync(logFile, line, 'utf-8');
}

function resolveEventLogFilePath() {
  const appData = process.env.APPDATA || process.env.LOCALAPPDATA;
  const baseDir = appData
    ? path.join(appData, 'AiTrans', 'logs')
    : path.join(__dirname, '.runtime-logs');
  fs.mkdirSync(baseDir, { recursive: true });
  return path.join(baseDir, 'pipeline-events.jsonl');
}

function appendPipelineEvent(eventName, audit, details = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    event_name: eventName,
    capture_session_id: audit?.captureSessionId || null,
    task_id: audit?.taskId || null,
    provider: details.provider || null,
    result_state: details.resultState || null,
    stage_status: details.stageStatus || null,
    source_language: details.sourceLanguage || null,
    shortcut: currentCaptureShortcut || config?.shortcut || null,
    details,
  };
  fs.appendFileSync(resolveEventLogFilePath(), `${JSON.stringify(record)}\n`, 'utf-8');
}

let config;
try {
  appendStartupLog('boot:loadProjectConfig:start');
  config = loadProjectConfig();
  appendStartupLog('boot:loadProjectConfig:ok', { generatedDir: config.generatedDir });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  appendStartupLog('boot:loadProjectConfig:failed', { message });
  dialog.showErrorBox('AiTrans startup failed', `${message}\n\n日志位置：${resolveLogFilePath()}`);
  throw error;
}

const stateStore = createWindowStateStore(app, stateNamespace);
const conversationStore = createConversationStore(app, stateNamespace);

app.setAppUserModelId('com.aitrans.desktop_screenshot_translate');

let tray = null;
let anchorWindow = null;
let overlayWindow = null;
let panelWindow = null;
let setupWindow = null;
let lastSelection = null;
let lastPipelineState = null;
let runtimeBootstrap = null;
let currentCaptureShortcut = null;
let updateRuntime = null;
const runtimeCapabilities = {
  shortcutAvailable: null,
  shortcutMessage: null,
  screenCaptureAvailable: null,
  screenCaptureMessage: null,
  entryMode: 'tray_and_shortcut',
};
const focusRestoreState = {
  target: null,
  preferInactivePanel: false,
  pendingSnapshot: null,
  requestId: 0,
};
const captureUiState = {
  overlayVisible: false,
  pipelineBusy: false,
};
const panelUiState = {
  pinned: Boolean(stateStore.load().panelPreferences?.pinned),
  blurGuardUntil: 0,
  temporaryTopmostTimer: null,
};
const CAPTURE_SETTLE_MS = 180;
const RETRYABLE_OCR_ERROR_FRAGMENT = 'tesseract returned empty OCR text';
const PANEL_WIDTH = 460;
const PANEL_HEIGHT = 680;
const PANEL_GAP = 14;
const SUPPORTED_SEND_SHORTCUTS = ['enter', 'ctrl_enter', 'shift_enter'];

process.on('uncaughtException', (error) => {
  appendStartupLog('process:uncaughtException', { message: error.message, stack: error.stack });
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : null;
  appendStartupLog('process:unhandledRejection', { message, stack });
});

function getWindowIconPath() {
  return path.join(__dirname, 'assets', 'app-icon.ico');
}

function createTrayImage() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon@2x.png');
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    return nativeImage.createEmpty();
  }
  return image.resize({ width: 16, height: 16, quality: 'best' });
}

function createAnchorWindow() {
  const savedState = stateStore.load().anchor;
  if (anchorWindow && !anchorWindow.isDestroyed()) {
    return anchorWindow;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const defaultBounds = {
    width: 64,
    height: 64,
    x: primaryDisplay.workArea.x + primaryDisplay.workArea.width - 88,
    y: primaryDisplay.workArea.y + primaryDisplay.workArea.height - 124,
  };

  anchorWindow = new BrowserWindow({
    width: savedState?.width || defaultBounds.width,
    height: savedState?.height || defaultBounds.height,
    x: savedState?.x ?? defaultBounds.x,
    y: savedState?.y ?? defaultBounds.y,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    icon: getWindowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  anchorWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  anchorWindow.setAlwaysOnTop(true, 'floating');
  anchorWindow.loadFile(path.join(__dirname, 'renderer', 'anchor', 'index.html'));
  anchorWindow.on('moved', () => {
    if (!anchorWindow || anchorWindow.isDestroyed()) {
      return;
    }
    stateStore.save('anchor', anchorWindow.getBounds());
    if (panelWindow && !panelWindow.isDestroyed() && panelWindow.isVisible()) {
      positionPanelWindow();
    }
  });
  anchorWindow.on('closed', () => {
    anchorWindow = null;
  });
  return anchorWindow;
}

function resolvePanelRendererTarget() {
  const devServerUrl = process.env.AITRANS_PANEL_DEV_SERVER_URL?.trim();
  if (!devServerUrl) {
    return {
      kind: 'file',
      target: path.join(__dirname, 'renderer', 'panel-dist', 'index.html'),
    };
  }
  return {
    kind: 'url',
    target: devServerUrl.replace(/\/$/, ''),
  };
}

function getOverlayDisplay() {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function getVirtualOverlayBounds() {
  const displays = screen.getAllDisplays();
  const xs = displays.map((item) => item.bounds.x);
  const ys = displays.map((item) => item.bounds.y);
  const rights = displays.map((item) => item.bounds.x + item.bounds.width);
  const bottoms = displays.map((item) => item.bounds.y + item.bounds.height);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const right = Math.max(...rights);
  const bottom = Math.max(...bottoms);
  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
}

function createAuditContext(selection) {
  return {
    captureSessionId: `capture_${crypto.randomUUID()}`,
    taskId: `task_${crypto.randomUUID()}`,
    selection,
    startedAt: Date.now(),
  };
}

function createOverlayWindow() {
  const bounds = getVirtualOverlayBounds();
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setBounds(bounds);
    return overlayWindow;
  }

  overlayWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    show: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    movable: false,
    resizable: false,
    fullscreenable: false,
    backgroundColor: '#00000000',
    icon: getWindowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.loadFile(path.join(__dirname, 'renderer', 'overlay', 'index.html'));
  overlayWindow.on('show', () => {
    captureUiState.overlayVisible = true;
  });
  overlayWindow.on('hide', () => {
    captureUiState.overlayVisible = false;
  });
  overlayWindow.on('closed', () => {
    captureUiState.overlayVisible = false;
    overlayWindow = null;
  });
  return overlayWindow;
}

function createPanelWindow() {
  if (panelWindow && !panelWindow.isDestroyed()) {
    return panelWindow;
  }

  panelWindow = new BrowserWindow({
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    minWidth: PANEL_WIDTH,
    minHeight: PANEL_HEIGHT,
    show: false,
    frame: false,
    transparent: false,
    resizable: false,
    movable: false,
    alwaysOnTop: panelUiState.pinned,
    skipTaskbar: true,
    backgroundColor: '#f4f8f6',
    icon: getWindowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const panelRendererTarget = resolvePanelRendererTarget();
  if (panelRendererTarget.kind === 'url') {
    appendStartupLog('panel:load-dev-server', { url: panelRendererTarget.target });
    panelWindow.loadURL(panelRendererTarget.target);
  } else {
    panelWindow.loadFile(panelRendererTarget.target);
  }
  panelWindow.webContents.on('did-fail-load', (_event, code, description, validatedUrl) => {
    console.error('[panel] load failed', { code, description, validatedUrl });
  });
  panelWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[panel] render process gone', details);
  });
  panelWindow.on('blur', () => {
    if (app.isQuitting || panelUiState.pinned) {
      return;
    }
    if (Date.now() < panelUiState.blurGuardUntil) {
      return;
    }
    if (panelWindow && !panelWindow.isDestroyed() && panelWindow.isVisible()) {
      panelWindow.hide();
    }
  });
  panelWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      panelWindow.hide();
    }
  });
  panelWindow.on('closed', () => {
    if (panelUiState.temporaryTopmostTimer) {
      clearTimeout(panelUiState.temporaryTopmostTimer);
      panelUiState.temporaryTopmostTimer = null;
    }
    panelWindow = null;
  });
  applyPanelPinnedState(panelUiState.pinned, { persist: false });
  return panelWindow;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function computeAnchoredPanelBounds() {
  const anchor = createAnchorWindow();
  const anchorBounds = anchor.getBounds();
  const display = screen.getDisplayMatching(anchorBounds);
  const workArea = display.workArea;

  const spaceRight = workArea.x + workArea.width - (anchorBounds.x + anchorBounds.width);
  const spaceLeft = anchorBounds.x - workArea.x;
  const spaceBelow = workArea.y + workArea.height - (anchorBounds.y + anchorBounds.height);
  const spaceAbove = anchorBounds.y - workArea.y;

  let x;
  if (spaceRight >= PANEL_WIDTH + PANEL_GAP || spaceRight >= spaceLeft) {
    x = anchorBounds.x + anchorBounds.width + PANEL_GAP;
  } else {
    x = anchorBounds.x - PANEL_WIDTH - PANEL_GAP;
  }

  let y;
  if (spaceBelow >= PANEL_HEIGHT || spaceBelow >= spaceAbove) {
    y = anchorBounds.y;
  } else {
    y = anchorBounds.y + anchorBounds.height - PANEL_HEIGHT;
  }

  return {
    x: clamp(x, workArea.x, workArea.x + workArea.width - PANEL_WIDTH),
    y: clamp(y, workArea.y, workArea.y + workArea.height - PANEL_HEIGHT),
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
  };
}

function positionPanelWindow() {
  const window = createPanelWindow();
  window.setBounds(computeAnchoredPanelBounds(), false);
  return window;
}

function applyPanelPinnedState(nextPinned, { persist = true } = {}) {
  panelUiState.pinned = Boolean(nextPinned);
  if (persist) {
    stateStore.save('panelPreferences', { pinned: panelUiState.pinned });
  }
  if (panelUiState.pinned && panelUiState.temporaryTopmostTimer) {
    clearTimeout(panelUiState.temporaryTopmostTimer);
    panelUiState.temporaryTopmostTimer = null;
  }
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.setAlwaysOnTop(panelUiState.pinned, panelUiState.pinned ? 'floating' : 'normal');
    panelWindow.setVisibleOnAllWorkspaces(panelUiState.pinned, { visibleOnFullScreen: true });
  }
  return panelUiState.pinned;
}

function preparePanelForAutoOpen() {
  panelUiState.blurGuardUntil = Date.now() + 700;
  if (!panelWindow || panelWindow.isDestroyed() || panelUiState.pinned) {
    return;
  }
  panelWindow.setAlwaysOnTop(true, 'floating');
  panelWindow.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true });
  if (panelUiState.temporaryTopmostTimer) {
    clearTimeout(panelUiState.temporaryTopmostTimer);
  }
  panelUiState.temporaryTopmostTimer = setTimeout(() => {
    panelUiState.temporaryTopmostTimer = null;
    if (!panelWindow || panelWindow.isDestroyed() || panelUiState.pinned) {
      return;
    }
    panelWindow.setAlwaysOnTop(false, 'normal');
    panelWindow.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true });
  }, 1200);
}

function getPanelPayload(result = null) {
  return {
    product: {
      displayName: config.productSpec.project.display_name,
      presentation: config.productSpec.presentation,
      copy: config.productSpec.presentation.copy,
      conversation: {
        ...(config.productSpec.conversation || {}),
        sendShortcut: config.selectedSendShortcut || 'enter',
        sendShortcutOptions: SUPPORTED_SEND_SHORTCUTS,
        panelPinned: panelUiState.pinned,
      },
      surface: config.productSpec.surface || {},
    },
    result,
  };
}

function showConversationWindow() {
  clearFocusRestoreSession();
  const window = positionPanelWindow();
  const payload = getPanelPayload(null);

  const sendPayload = () => {
    panelUiState.blurGuardUntil = Date.now() + 300;
    window.webContents.send('panel:set-data', payload);
    window.show();
    window.focus();
  };

  if (window.webContents.isLoadingMainFrame()) {
    window.webContents.once('did-finish-load', sendPayload);
  } else {
    sendPayload();
  }
}

function toggleConversationWindow() {
  if (panelWindow && !panelWindow.isDestroyed() && panelWindow.isVisible()) {
    panelWindow.hide();
    return;
  }
  showConversationWindow();
}

function sendPanelCommand(command, payload = {}) {
  const window = createPanelWindow();
  const dispatch = () => {
    window.webContents.send('panel:command', { command, payload });
  };

  if (window.webContents.isLoadingMainFrame()) {
    window.webContents.once('did-finish-load', dispatch);
  } else {
    dispatch();
  }
}

function focusBestAvailableWindow() {
  clearFocusRestoreSession();
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.show();
    setupWindow.focus();
    return;
  }
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.show();
    panelWindow.focus();
    return;
  }
  if (!getSetupGuideState().configured) {
    showSetupGuide();
    return;
  }
  showConversationWindow();
}

function setShortcutCapability(available, message = null) {
  runtimeCapabilities.shortcutAvailable = available;
  runtimeCapabilities.shortcutMessage = message;
  runtimeCapabilities.entryMode = available ? 'tray_and_shortcut' : 'tray_only';
}

function setScreenCaptureCapability(available, message = null) {
  runtimeCapabilities.screenCaptureAvailable = available;
  runtimeCapabilities.screenCaptureMessage = message;
}

function createSetupWindow() {
  if (setupWindow && !setupWindow.isDestroyed()) {
    return setupWindow;
  }

  setupWindow = new BrowserWindow({
    width: 560,
    height: 620,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    title: `${config.productSpec.project.display_name} 首次配置`,
    backgroundColor: '#ecf8f4',
    icon: getWindowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  setupWindow.loadFile(path.join(__dirname, 'renderer', 'setup', 'index.html'));
  setupWindow.on('closed', () => {
    setupWindow = null;
  });
  return setupWindow;
}

function isFocusRestoreEnabled() {
  return Boolean(config.productSpec.desktop.focus_restore) && isWindowsFocusSupported();
}

function clearFocusRestoreSession() {
  focusRestoreState.requestId += 1;
  focusRestoreState.target = null;
  focusRestoreState.preferInactivePanel = false;
  focusRestoreState.pendingSnapshot = null;
}

function captureExternalFocusTarget() {
  if (!isFocusRestoreEnabled()) {
    clearFocusRestoreSession();
    return Promise.resolve();
  }

  const requestId = focusRestoreState.requestId + 1;
  focusRestoreState.requestId = requestId;
  focusRestoreState.target = null;
  focusRestoreState.preferInactivePanel = false;

  const snapshotTask = (async () => {
    try {
      const snapshot = await snapshotForegroundWindow(process.pid);
      if (focusRestoreState.requestId !== requestId) {
        return;
      }
      if (!snapshot || snapshot.isCurrentProcess) {
        clearFocusRestoreSession();
        appendStartupLog('focus-restore:snapshot-skipped', {
          reason: snapshot?.isCurrentProcess ? 'foreground_is_aitrans' : 'no_foreground_window',
        });
        return;
      }

      focusRestoreState.target = {
        hwnd: snapshot.hwnd,
        pid: snapshot.pid,
      };
      focusRestoreState.preferInactivePanel = true;
      appendStartupLog('focus-restore:snapshot-captured', {
        hwnd: snapshot.hwnd,
        pid: snapshot.pid,
      });
    } catch (error) {
      if (focusRestoreState.requestId !== requestId) {
        return;
      }
      clearFocusRestoreSession();
      appendStartupLog('focus-restore:snapshot-failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  const trackedTask = snapshotTask.finally(() => {
    if (focusRestoreState.pendingSnapshot === trackedTask) {
      focusRestoreState.pendingSnapshot = null;
    }
  });
  focusRestoreState.pendingSnapshot = trackedTask;
  return trackedTask;
}

async function restoreCapturedFocusTarget(reason) {
  if (focusRestoreState.pendingSnapshot) {
    try {
      await focusRestoreState.pendingSnapshot;
    } catch {
      // snapshot failure is already logged; keep restore best-effort
    }
  }

  if (!isFocusRestoreEnabled() || !focusRestoreState.target) {
    return false;
  }

  try {
    const outcome = await restoreForegroundWindow(focusRestoreState.target);
    appendStartupLog('focus-restore:restore-attempt', {
      reason,
      target: focusRestoreState.target,
      outcome,
    });
    if (outcome.ok || outcome.reason === 'missing_window') {
      focusRestoreState.target = null;
    }
    return Boolean(outcome.ok);
  } catch (error) {
    appendStartupLog('focus-restore:restore-failed', {
      reason,
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function scheduleFocusRestore(reason, clearAfterRestore = false) {
  void (async () => {
    try {
      await restoreCapturedFocusTarget(reason);
    } finally {
      if (clearAfterRestore) {
        clearFocusRestoreSession();
      }
    }
  })();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hideAuxiliaryWindowsForCapture() {
  if (setupWindow && !setupWindow.isDestroyed() && setupWindow.isVisible()) {
    setupWindow.hide();
  }
  if (panelWindow && !panelWindow.isDestroyed() && panelWindow.isVisible()) {
    panelWindow.hide();
  }
}

async function settleBeforeCapture() {
  await sleep(CAPTURE_SETTLE_MS);
}

function isRetryableOcrFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(RETRYABLE_OCR_ERROR_FRAGMENT);
}

function resolveConfiguredCaptureShortcut() {
  const overrides = loadRuntimeOverrides().values;
  const configuredShortcut = (
    process.env.AITRANS_CAPTURE_SHORTCUT
    || overrides.desktop?.capture_shortcut
    || config.shortcut
    || 'CommandOrControl+Shift+1'
  ).trim();
  return configuredShortcut || 'CommandOrControl+Shift+1';
}

function resolveConfiguredSendShortcut() {
  const overrides = loadRuntimeOverrides().values;
  const configuredShortcut = (
    overrides.desktop?.send_shortcut
    || config.selectedSendShortcut
    || 'enter'
  ).trim();
  return SUPPORTED_SEND_SHORTCUTS.includes(configuredShortcut) ? configuredShortcut : 'enter';
}

function buildTrayMenu() {
  const updateState = updateRuntime ? updateRuntime.getState() : null;
  const guideState = getSetupGuideState();
  const settingsLabel = guideState.configured ? '设置与连接' : '完成首次配置';
  const template = [
    { label: '开始截图翻译', click: () => showOverlay() },
    { label: '打开对话浮窗', click: () => showConversationWindow() },
    { label: '新聊天', click: () => { showConversationWindow(); sendPanelCommand('new_chat'); } },
    { label: '清空记录', click: () => { showConversationWindow(); sendPanelCommand('clear_history'); } },
    { label: settingsLabel, click: () => showSetupGuide() },
    {
      label: runtimeCapabilities.shortcutAvailable === false
        ? '快捷键暂不可用，当前已降级为托盘入口'
        : `快捷键：${currentCaptureShortcut || config.shortcut}`,
      enabled: false,
    },
  ];

  if (runtimeCapabilities.screenCaptureAvailable === false) {
    template.push({
      label: '截图能力当前不可用，请先完成引导修复',
      enabled: false,
    });
  }

  template.push(
    { type: 'separator' },
    {
      label: updateRuntime ? updateRuntime.getTrayStatusLabel() : '自动更新：未初始化',
      enabled: false,
    },
    {
      label: '检查更新',
      enabled: Boolean(updateState?.enabled || config.implementationConfig.release.auto_update),
      click: async () => {
        if (!updateRuntime) {
          return;
        }
        const outcome = await updateRuntime.checkForUpdates(true);
        if (!outcome.ok && outcome.error) {
          dialog.showErrorBox('AiTrans 检查更新失败', outcome.error);
        }
      },
    },
    {
      label: '安装已下载更新',
      enabled: Boolean(updateState?.updateDownloaded),
      click: () => {
        if (!updateRuntime) {
          return;
        }
        const outcome = updateRuntime.installDownloadedUpdate();
        if (!outcome.ok && outcome.error) {
          dialog.showErrorBox('AiTrans 安装更新失败', outcome.error);
        }
      },
    },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuitting = true; app.quit(); } },
  );

  return Menu.buildFromTemplate(template);
}

function showEntryMenu(targetWindow = null) {
  const menu = buildTrayMenu();
  if (targetWindow && !targetWindow.isDestroyed()) {
    menu.popup({ window: targetWindow });
    return;
  }
  if (tray) {
    tray.popUpContextMenu(menu);
  }
}

function refreshTrayMenu() {
  if (!tray) {
    return;
  }
  tray.setContextMenu(buildTrayMenu());
}

function applyCaptureShortcut(nextShortcut) {
  const normalized = (nextShortcut || '').trim() || 'CommandOrControl+Shift+1';
  const previousShortcut = currentCaptureShortcut || config.shortcut || 'CommandOrControl+Shift+1';

  globalShortcut.unregisterAll();

  try {
    const registered = globalShortcut.register(normalized, () => {
      showOverlay();
    });
    if (!registered) {
      throw new Error('shortcut registration was rejected by the operating system');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (previousShortcut && previousShortcut !== normalized) {
      try {
        const fallbackRegistered = globalShortcut.register(previousShortcut, () => {
          showOverlay();
        });
        if (fallbackRegistered) {
          currentCaptureShortcut = previousShortcut;
          config.shortcut = previousShortcut;
          setShortcutCapability(true, null);
          refreshTrayMenu();
          return { ok: false, error: `invalid shortcut: ${message}` };
        }
      } catch {
        // fall through to degraded tray-only mode
      }
    }
    currentCaptureShortcut = null;
    setShortcutCapability(false, message);
    refreshTrayMenu();
    return { ok: false, error: `invalid shortcut: ${message}` };
  }

  currentCaptureShortcut = normalized;
  config.shortcut = normalized;
  setShortcutCapability(true, null);
  refreshTrayMenu();
  return { ok: true, shortcut: normalized };
}

async function probeAndStoreScreenCaptureCapability() {
  const probe = await probeScreenCaptureCapability();
  setScreenCaptureCapability(Boolean(probe.available), probe.reason || null);
  if (!probe.available) {
    appendStartupLog('capture:probe-failed', { message: probe.reason || 'unknown capture error' });
  }
  return probe;
}

async function ensureScreenCaptureCapability() {
  if (runtimeCapabilities.screenCaptureAvailable === true) {
    return true;
  }
  if (runtimeCapabilities.screenCaptureAvailable === null) {
    void probeAndStoreScreenCaptureCapability();
    return true;
  }
  const probe = await probeAndStoreScreenCaptureCapability();
  return Boolean(probe.available);
}

async function captureAndRecognize(selection) {
  await settleBeforeCapture();
  let capture = await captureSelectionImage(selection);
  try {
    const ocrResult = await recognizeText(capture, config.productSpec, config.implementationConfig);
    return { capture, ocrResult, retries: 0 };
  } catch (error) {
    if (!isRetryableOcrFailure(error)) {
      throw error;
    }

    await settleBeforeCapture();
    capture = await captureSelectionImage(selection);
    const ocrResult = await recognizeText(capture, config.productSpec, config.implementationConfig);
    return { capture, ocrResult, retries: 1 };
  }
}

async function showOverlay() {
  if (captureUiState.overlayVisible || captureUiState.pipelineBusy) {
    appendStartupLog('overlay:show-skipped', {
      overlayVisible: captureUiState.overlayVisible,
      pipelineBusy: captureUiState.pipelineBusy,
    });
    return;
  }
  if (!(await ensureScreenCaptureCapability())) {
    showSetupGuide();
    return;
  }
  captureExternalFocusTarget();
  const display = getOverlayDisplay();
  const overlayBounds = getVirtualOverlayBounds();
  const displays = screen.getAllDisplays();
  const window = createOverlayWindow();
  hideAuxiliaryWindowsForCapture();
  window.setBounds(overlayBounds);
  window.show();
  window.focus();

  const payload = {
    hint: config.productSpec.surface.copy.capture_hint,
    display,
    displays,
    overlayBounds,
    modes: config.productSpec.capture.modes,
  };
  if (window.webContents.isLoadingMainFrame()) {
    window.webContents.once('did-finish-load', () => {
      window.webContents.send('overlay:start', payload);
    });
  } else {
    window.webContents.send('overlay:start', payload);
  }
}

function buildStubResult(selection) {
  return {
    sourceText: '等待本地主链输出结果。',
    translatedText: '纯 Electron 主链已启用，下一次截图会进入本地截图、OCR 和翻译 provider 流程。',
    sourceLanguage: 'auto',
    stageStatus: 'idle',
    errorOrigin: null,
    selection,
    shortcut: currentCaptureShortcut || config.shortcut,
    capturePreviewDataUrl: null,
    captureMeta: null,
  };
}

function buildStageResult(selection, overrides = {}) {
  return {
    ...buildStubResult(selection),
    ...overrides,
  };
}

function getSetupGuideState() {
  const overrides = loadRuntimeOverrides();
  const translationOverrides =
    overrides.values && typeof overrides.values.translation === 'object'
      ? overrides.values.translation
      : {};
  const desktopOverrides =
    overrides.values && typeof overrides.values.desktop === 'object'
      ? overrides.values.desktop
      : {};
  const pipelineOverrides =
    overrides.values && typeof overrides.values.pipeline === 'object'
      ? overrides.values.pipeline
      : {};
  const translationService =
    typeof translationOverrides.service === 'string' && translationOverrides.service.trim()
      ? normalizeTranslationService(translationOverrides.service)
      : resolveTranslationService();
  const translationServicePreset = getTranslationServicePreset(translationService);
  const rawBaseUrl =
    typeof translationOverrides.base_url === 'string' && translationOverrides.base_url.trim()
      ? translationOverrides.base_url.trim()
      : (translationServicePreset.baseUrl || '');
  const baseUrl = rawBaseUrl ? normalizeBaseUrl(rawBaseUrl) : '';
  const translationModel =
    typeof translationOverrides.model === 'string' && translationOverrides.model.trim()
      ? translationOverrides.model.trim()
      : resolveTranslationModel(config.implementationConfig);
  let configured = true;
  let credentialMode = 'configured';

  if (!baseUrl) {
    configured = false;
    credentialMode = 'missing_translation_endpoint';
  } else if (!translationModel) {
    configured = false;
    credentialMode = 'missing_translation_model';
  } else {
    try {
      const apiKey = resolveOpenAiApiKey(baseUrl, translationService);
      if (!apiKey && !translationServicePreset.requiresApiKey) {
        credentialMode = 'local_endpoint_without_key';
      }
    } catch {
      configured = false;
      credentialMode = 'missing_translation_credential';
    }
  }

  return {
    configured,
    credentialMode,
    translationService,
    translationModel,
    baseUrl,
    usingOfficialEndpoint: translationService === 'openai' && baseUrl === OFFICIAL_OPENAI_BASE_URL,
    runtimeOverridesPath: overrides.path || getPrimaryRuntimeOverridePath(),
    runtimeOverridesDetected: Boolean(overrides.path),
    bootstrapCreated: Boolean(runtimeBootstrap?.created),
    runtimeDraft: {
      translationService,
      baseUrl,
      translationModel,
      apiKeyPresent:
        typeof translationOverrides.api_key === 'string'
        && translationOverrides.api_key.trim().length > 0,
    },
    translationServiceOptions: Object.keys(TRANSLATION_SERVICE_PRESETS),
    translationServicePresets: Object.fromEntries(
      Object.entries(TRANSLATION_SERVICE_PRESETS).map(([key, preset]) => [
        key,
        {
          key: preset.key,
          label: preset.label,
          baseUrl: preset.baseUrl,
          requiresApiKey: Boolean(preset.requiresApiKey),
          modelExamples: Array.isArray(preset.modelExamples) ? preset.modelExamples : [],
        },
      ]),
    ),
    desktopDraft: {
      captureShortcut:
        typeof desktopOverrides.capture_shortcut === 'string' && desktopOverrides.capture_shortcut.trim()
          ? desktopOverrides.capture_shortcut.trim()
          : currentCaptureShortcut || config.shortcut,
      sendShortcut:
        typeof desktopOverrides.send_shortcut === 'string' && desktopOverrides.send_shortcut.trim()
          ? desktopOverrides.send_shortcut.trim()
          : config.selectedSendShortcut || 'enter',
    },
    pipelineDraft: {
      sourceLanguage:
        typeof pipelineOverrides.source_language === 'string' && pipelineOverrides.source_language.trim()
          ? pipelineOverrides.source_language.trim()
          : config.selectedSourceLanguage || 'auto',
    },
    pipelineOptions: Array.isArray(config.productSpec.pipeline.source_languages)
      ? config.productSpec.pipeline.source_languages
      : ['auto'],
    sendShortcutOptions: SUPPORTED_SEND_SHORTCUTS,
    capabilities: {
      shortcutAvailable: runtimeCapabilities.shortcutAvailable !== false,
      shortcutMessage: runtimeCapabilities.shortcutMessage,
      screenCaptureAvailable: runtimeCapabilities.screenCaptureAvailable !== false,
      screenCaptureMessage: runtimeCapabilities.screenCaptureMessage,
      entryMode: runtimeCapabilities.entryMode,
    },
  };
}

function shouldAutoOpenSetupGuide() {
  const guide = getSetupGuideState();
  return (
    !guide.configured
    || guide.capabilities.shortcutAvailable === false
    || guide.capabilities.screenCaptureAvailable === false
  );
}

function getActiveRuntimeOverridePath() {
  return loadRuntimeOverrides().path || getPrimaryRuntimeOverridePath();
}

function showSetupGuide() {
  clearFocusRestoreSession();
  const window = createSetupWindow();
  const payload = {
    product: {
      displayName: config.productSpec.project.display_name,
    },
    guide: getSetupGuideState(),
  };

  const sendPayload = () => {
    window.webContents.send('setup:set-data', payload);
    window.show();
    window.focus();
  };

  if (window.webContents.isLoadingMainFrame()) {
    window.webContents.once('did-finish-load', sendPayload);
  } else {
    sendPayload();
  }
}

function showPanel(result) {
  const window = positionPanelWindow();
  const payload = getPanelPayload(result);

  const sendPayload = () => {
    preparePanelForAutoOpen();
    window.webContents.send('panel:set-data', payload);
    window.show();
    window.focus();
  };

  if (window.webContents.isLoadingMainFrame()) {
    window.webContents.once('did-finish-load', sendPayload);
  } else {
    sendPayload();
  }
}

function rememberPipelineState(selection, capture, ocrResult, translatedText, translationDiagnostics, audit) {
  lastPipelineState = {
    selection,
    sourceText: ocrResult?.text?.trim() || '',
    sourceLanguage: ocrResult?.sourceLanguage || 'auto',
    capturePreviewDataUrl: capture?.dataUrl || null,
    captureMeta: {
      width: capture?.size?.width || null,
      height: capture?.size?.height || null,
      targetLanguage: config.productSpec.pipeline.target_language,
      captureSessionId: audit?.captureSessionId || null,
      taskId: audit?.taskId || null,
      ocrProvider: ocrResult?.provider || null,
      translationProvider: translationDiagnostics?.provider || null,
      ocrDiagnostics: ocrResult?.diagnostics || null,
      translationDiagnostics: translationDiagnostics?.diagnostics || null,
    },
    translatedText: translatedText || '',
  };
}

function createTray() {
  tray = new Tray(createTrayImage());
  tray.setToolTip(config.productSpec.project.display_name);
  appendStartupLog('tray:created');
  refreshTrayMenu();
  tray.on('click', () => {
    showEntryMenu();
  });
  tray.on('double-click', () => showOverlay());
}

function getFallbackSelection() {
  const display = getOverlayDisplay();
  return {
    displayId: display.id,
    x: display.bounds.x + 160,
    y: display.bounds.y + 140,
    width: 360,
    height: 220,
    scaleFactor: display.scaleFactor,
  };
}

function buildSourceEditAuditContext() {
  return {
    captureSessionId: lastPipelineState?.captureMeta?.captureSessionId || `capture_${crypto.randomUUID()}`,
    taskId: `task_${crypto.randomUUID()}`,
  };
}

function buildSourceEditCaptureMeta(audit, sourceLanguage) {
  return {
    ...(lastPipelineState?.captureMeta || {}),
    targetLanguage: config.productSpec.pipeline.target_language,
    captureSessionId: audit.captureSessionId,
    taskId: audit.taskId,
    ocrProvider: lastPipelineState?.captureMeta?.ocrProvider || 'manual_source',
    translationProvider: 'pending',
    sourceMode: 'manual_source_edit',
    sourceLanguage,
  };
}

function resolveRequestedSourceLanguage(rawValue) {
  const supported = Array.isArray(config.productSpec.pipeline.source_languages)
    ? config.productSpec.pipeline.source_languages
    : ['auto'];
  const candidate = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (candidate && supported.includes(candidate)) {
    return candidate;
  }
  return config.selectedSourceLanguage || 'auto';
}

async function translateFromSourceText(
  sourceText,
  requestedSourceLanguage,
  sourceMode = 'manual_source_edit',
  options = {},
) {
  const normalizedSourceText = typeof sourceText === 'string' ? sourceText.trim() : '';
  if (!normalizedSourceText) {
    return { ok: false, error: 'missing source text for translation' };
  }

  const sourceLanguage = resolveRequestedSourceLanguage(requestedSourceLanguage);
  const selection = lastPipelineState?.selection || getFallbackSelection();
  const audit = buildSourceEditAuditContext();
  const conversationRequestId =
    typeof options.conversationRequestId === 'string' && options.conversationRequestId.trim()
      ? options.conversationRequestId.trim()
      : null;

  const captureMeta = {
    ...buildSourceEditCaptureMeta(audit, sourceLanguage),
    sourceMode,
    conversationRequestId,
  };

  try {
    appendPipelineEvent('trans_requested', audit, {
      provider: config.implementationConfig.providers.translation_chain[0],
      resultState: 'translation_processing',
      stageStatus: 'translation_processing',
      sourceLanguage,
      sourceMode,
    });
    showPanel(buildStageResult(selection, {
      sourceLanguage,
      stageStatus: 'translation_processing',
      sourceText: normalizedSourceText,
      translatedText: '正在根据当前原文生成译文…',
      capturePreviewDataUrl: lastPipelineState?.capturePreviewDataUrl || null,
      captureMeta,
    }));

    const translationResult = await translateText(
      normalizedSourceText,
      config.productSpec,
      config.implementationConfig,
    );

    rememberPipelineState(
      selection,
      {
        dataUrl: lastPipelineState?.capturePreviewDataUrl || null,
        size: {
          width: lastPipelineState?.captureMeta?.width || null,
          height: lastPipelineState?.captureMeta?.height || null,
        },
      },
      {
        provider: lastPipelineState?.captureMeta?.ocrProvider || 'manual_source',
        diagnostics: {
          ...(lastPipelineState?.captureMeta?.ocrDiagnostics || {}),
          sourceMode,
        },
        text: normalizedSourceText,
        sourceLanguage,
      },
      translationResult.translatedText,
      translationResult,
      audit,
    );

    showPanel(buildStageResult(selection, {
      sourceLanguage,
      stageStatus: 'translation_ready',
      sourceText: normalizedSourceText,
      translatedText: translationResult.translatedText,
      capturePreviewDataUrl: lastPipelineState?.capturePreviewDataUrl || null,
      captureMeta: {
        ...captureMeta,
        translationProvider: translationResult.provider,
        translationDiagnostics: translationResult.diagnostics || null,
      },
    }));
    appendPipelineEvent('result_rendered', audit, {
      provider: translationResult.provider,
      resultState: 'translation_ready',
      stageStatus: 'translation_ready',
      sourceLanguage,
      sourceMode,
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showPanel(buildStageResult(selection, {
      sourceLanguage,
      stageStatus: 'failed',
      sourceText: normalizedSourceText,
      translatedText: config.productSpec.presentation.copy.failure_title,
      capturePreviewDataUrl: lastPipelineState?.capturePreviewDataUrl || null,
      captureMeta: {
        ...captureMeta,
        errorSourceMode: sourceMode,
      },
      errorOrigin: message,
    }));
    appendPipelineEvent('failure_raised', audit, {
      provider: lastPipelineState?.captureMeta?.translationProvider || null,
      resultState: 'failed',
      stageStatus: 'failed',
      sourceLanguage,
      sourceMode,
      error: message,
    });
    return { ok: false, error: message };
  }
}

function registerShortcuts() {
  const result = applyCaptureShortcut(resolveConfiguredCaptureShortcut());
  if (!result.ok) {
    throw new Error(result.error);
  }
}

ipcMain.handle('overlay:submit-selection', async (_event, selection) => {
  lastSelection = selection;
  lastPipelineState = null;
  const audit = createAuditContext(selection);
  captureUiState.pipelineBusy = true;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }
  try {
    appendPipelineEvent('capture_started', audit, {
      resultState: 'capturing',
      stageStatus: 'capturing',
    });
    showPanel(buildStageResult(selection, {
      sourceLanguage: 'auto',
      stageStatus: 'capturing',
      sourceText: '正在抓取选区位图…',
      translatedText: '正在从 Windows 桌面获取截图区域，请稍候。',
      captureMeta: {
        captureSessionId: audit.captureSessionId,
        taskId: audit.taskId,
        targetLanguage: config.productSpec.pipeline.target_language,
      },
    }));

    const { capture, ocrResult, retries } = await captureAndRecognize(selection);
    appendPipelineEvent('capture_completed', audit, {
      resultState: 'captured',
      stageStatus: 'capturing',
    });
    appendPipelineEvent('ocr_requested', audit, {
      provider: config.implementationConfig.providers.ocr_chain[0],
      resultState: 'ocr_processing',
      stageStatus: 'ocr_processing',
    });
    showPanel(buildStageResult(selection, {
      sourceLanguage: ocrResult.sourceLanguage || 'auto',
      stageStatus: 'ocr_processing',
      sourceText: retries > 0 ? '截图已稳定，正在执行本地 OCR…' : '截图完成，正在执行本地 OCR…',
      translatedText: retries > 0 ? '首次识别未返回文本，已自动重试一次并继续…' : 'OCR 完成后将进入翻译阶段…',
      capturePreviewDataUrl: capture.dataUrl,
      captureMeta: {
        width: capture.size.width,
        height: capture.size.height,
        targetLanguage: config.productSpec.pipeline.target_language,
        captureSessionId: audit.captureSessionId,
        taskId: audit.taskId,
        ocrProvider: 'pending',
        translationProvider: config.implementationConfig.providers.translation_chain[0],
        autoRetryCount: retries,
      },
    }));
    const recognizedText = ocrResult.text.trim();
    rememberPipelineState(selection, capture, ocrResult, '', null, audit);
    appendPipelineEvent('trans_requested', audit, {
      provider: config.implementationConfig.providers.translation_chain[0],
      resultState: 'translation_processing',
      stageStatus: 'translation_processing',
      sourceLanguage: ocrResult.sourceLanguage || 'auto',
    });

    showPanel(buildStageResult(selection, {
      sourceLanguage: ocrResult.sourceLanguage || 'auto',
      stageStatus: 'translation_processing',
      sourceText: recognizedText || 'OCR 未返回可用文本。',
      translatedText: '正在调用翻译 provider…',
      capturePreviewDataUrl: capture.dataUrl,
      captureMeta: {
        width: capture.size.width,
        height: capture.size.height,
        targetLanguage: config.productSpec.pipeline.target_language,
        captureSessionId: audit.captureSessionId,
        taskId: audit.taskId,
        ocrProvider: ocrResult.provider,
        translationProvider: 'pending',
        ocrDiagnostics: ocrResult.diagnostics || null,
        autoRetryCount: retries,
      },
    }));

    const translationResult = await translateText(
      recognizedText,
      config.productSpec,
      config.implementationConfig,
    );
    rememberPipelineState(selection, capture, ocrResult, translationResult.translatedText, translationResult, audit);

    const result = buildStageResult(selection, {
      sourceLanguage: ocrResult.sourceLanguage || 'auto',
      stageStatus: 'translation_ready',
      sourceText: recognizedText,
      translatedText: translationResult.translatedText,
      capturePreviewDataUrl: capture.dataUrl,
      captureMeta: {
        width: capture.size.width,
        height: capture.size.height,
        targetLanguage: config.productSpec.pipeline.target_language,
        captureSessionId: audit.captureSessionId,
        taskId: audit.taskId,
        ocrProvider: ocrResult.provider,
        translationProvider: translationResult.provider,
        ocrDiagnostics: ocrResult.diagnostics || null,
        translationDiagnostics: translationResult.diagnostics || null,
        autoRetryCount: retries,
      },
    });
    showPanel(result);
    appendPipelineEvent('result_rendered', audit, {
      provider: translationResult.provider,
      resultState: 'translation_ready',
      stageStatus: 'translation_ready',
      sourceLanguage: ocrResult.sourceLanguage || 'auto',
    });
    captureUiState.pipelineBusy = false;
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('no desktop capture source available')) {
      setScreenCaptureCapability(false, message);
      showSetupGuide();
    }
    const failureResult = {
      ...(lastPipelineState
        ? buildStageResult(lastPipelineState.selection || selection, {
            sourceText: lastPipelineState.sourceText || '等待本地主链输出结果。',
            sourceLanguage: lastPipelineState.sourceLanguage || 'auto',
            capturePreviewDataUrl: lastPipelineState.capturePreviewDataUrl,
            captureMeta: lastPipelineState.captureMeta,
          })
        : buildStubResult(selection)),
      stageStatus: 'failed',
      translatedText: 'OCR 或翻译主链执行失败，请检查 desktopCapturer、内置或外部 tesseract、OPENAI_API_KEY、AITRANS_OPENAI_BASE_URL 或当前 Windows 权限状态。',
      errorOrigin: message,
    };
    showPanel(failureResult);
    appendPipelineEvent('failure_raised', audit, {
      provider: lastPipelineState?.captureMeta?.translationProvider || lastPipelineState?.captureMeta?.ocrProvider || null,
      resultState: 'failed',
      stageStatus: 'failed',
      sourceLanguage: lastPipelineState?.sourceLanguage || 'auto',
      error: message,
    });
    captureUiState.pipelineBusy = false;
    return { ok: false, error: message };
  }
});

ipcMain.handle('overlay:cancel', async () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }
  captureUiState.pipelineBusy = false;
  scheduleFocusRestore('capture_cancelled', true);
  return { ok: true };
});

ipcMain.handle('panel:set-pinned', async (_event, payload) => {
  const nextPinned = Boolean(payload?.pinned);
  const pinned = applyPanelPinnedState(nextPinned);
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send('panel:set-data', getPanelPayload(null));
  }
  return { ok: true, pinned };
});

ipcMain.handle('panel:copy-translation', async (_event, payload) => {
  clipboard.writeText(payload.text || '');
  return { ok: true };
});

ipcMain.on('panel:load-conversation-state-sync', (event) => {
  const session = conversationStore.load();
  event.returnValue = {
    ok: true,
    session,
    path: conversationStore.getPath(),
  };
});

ipcMain.handle('panel:save-conversation-state', async (_event, payload) => {
  const saved = conversationStore.save(payload);
  return {
    ok: true,
    path: saved.path,
    session: saved.session,
  };
});

ipcMain.handle('panel:clear-conversation-state', async () => {
  const cleared = conversationStore.clear();
  return {
    ok: true,
    path: cleared.path,
  };
});

ipcMain.handle('panel:read-clipboard-text', async () => {
  return {
    ok: true,
    text: clipboard.readText(),
  };
});

ipcMain.handle('panel:close', async () => {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.hide();
  }
  scheduleFocusRestore('panel_closed', true);
  return { ok: true };
});

ipcMain.handle('panel:recapture', async () => {
  showOverlay();
  return { ok: true };
});

ipcMain.handle('panel:retry-translation', async (_event, payload) => {
  const sourceText =
    payload && typeof payload.sourceText === 'string' && payload.sourceText.trim()
      ? payload.sourceText
      : lastPipelineState?.sourceText || '';
  const sourceLanguage =
    payload && typeof payload.sourceLanguage === 'string'
      ? payload.sourceLanguage
      : lastPipelineState?.sourceLanguage || config.selectedSourceLanguage || 'auto';
  const conversationRequestId =
    payload && typeof payload.conversationRequestId === 'string'
      ? payload.conversationRequestId
      : null;
  if (!sourceText.trim()) {
    return { ok: false, error: 'missing OCR source text for retry' };
  }
  return translateFromSourceText(
    sourceText,
    sourceLanguage,
    'retry_translation',
    { conversationRequestId },
  );
});

ipcMain.handle('panel:translate-edited-source', async (_event, payload) => {
  const sourceText =
    payload && typeof payload.sourceText === 'string'
      ? payload.sourceText
      : '';
  const sourceLanguage =
    payload && typeof payload.sourceLanguage === 'string'
      ? payload.sourceLanguage
      : config.selectedSourceLanguage || 'auto';
  const conversationRequestId =
    payload && typeof payload.conversationRequestId === 'string'
      ? payload.conversationRequestId
      : null;
  return translateFromSourceText(sourceText, sourceLanguage, 'manual_source_edit', {
    conversationRequestId,
  });
});

ipcMain.handle('panel:send-text-message', async (_event, payload) => {
  const sourceText =
    payload && typeof payload.text === 'string'
      ? payload.text
      : '';
  const sourceLanguage =
    payload && typeof payload.sourceLanguage === 'string'
      ? payload.sourceLanguage
      : config.selectedSourceLanguage || 'auto';
  const conversationRequestId =
    payload && typeof payload.conversationRequestId === 'string'
      ? payload.conversationRequestId
      : null;
  return translateFromSourceText(sourceText, sourceLanguage, 'text_chat', {
    conversationRequestId,
  });
});

ipcMain.handle('panel:open-setup', async () => {
  showSetupGuide();
  return { ok: true };
});

ipcMain.handle('anchor:toggle-panel', async () => {
  toggleConversationWindow();
  return { ok: true };
});

ipcMain.handle('anchor:open-menu', async () => {
  showEntryMenu(anchorWindow);
  return { ok: true };
});

ipcMain.handle('anchor:get-bounds', async () => {
  if (!anchorWindow || anchorWindow.isDestroyed()) {
    return { ok: false, error: 'anchor window unavailable' };
  }
  return {
    ok: true,
    bounds: anchorWindow.getBounds(),
  };
});

ipcMain.handle('anchor:set-position', async (_event, payload) => {
  if (!anchorWindow || anchorWindow.isDestroyed()) {
    return { ok: false, error: 'anchor window unavailable' };
  }
  const x = Number.isFinite(payload?.x) ? Math.round(payload.x) : anchorWindow.getBounds().x;
  const y = Number.isFinite(payload?.y) ? Math.round(payload.y) : anchorWindow.getBounds().y;
  anchorWindow.setPosition(x, y);
  stateStore.save('anchor', anchorWindow.getBounds());
  if (panelWindow && !panelWindow.isDestroyed() && panelWindow.isVisible()) {
    positionPanelWindow();
  }
  return {
    ok: true,
    bounds: anchorWindow.getBounds(),
  };
});

ipcMain.handle('panel:get-project-summary', async () => {
  return {
    displayName: config.productSpec.project.display_name,
    shortcut: currentCaptureShortcut || config.shortcut,
    pipeline: config.productSpec.pipeline,
    governance: config.productSpec.governance,
  };
});

ipcMain.handle('setup:get-guide-state', async () => {
  return getSetupGuideState();
});

ipcMain.handle('setup:open-config-directory', async () => {
  const configDir = path.dirname(getActiveRuntimeOverridePath());
  await shell.openPath(configDir);
  return { ok: true, configDir };
});

ipcMain.handle('setup:open-config-file', async () => {
  const configPath = getActiveRuntimeOverridePath();
  await shell.openPath(configPath);
  return { ok: true, configPath };
});

ipcMain.handle('setup:copy-config-path', async () => {
  const configPath = getActiveRuntimeOverridePath();
  clipboard.writeText(configPath);
  return { ok: true, configPath };
});

ipcMain.handle('setup:save-config', async (_event, payload) => {
  const translationServiceInput =
    payload && typeof payload.translationService === 'string'
      ? payload.translationService.trim()
      : resolveTranslationService();
  const baseUrlInput =
    payload && typeof payload.baseUrl === 'string'
      ? payload.baseUrl.trim()
      : '';
  const translationModelInput =
    payload && typeof payload.translationModel === 'string'
      ? payload.translationModel.trim()
      : resolveTranslationModel(config.implementationConfig);
  const apiKeyInput =
    payload && typeof payload.apiKey === 'string'
      ? payload.apiKey.trim()
      : '';
  const shortcutInput =
    payload && typeof payload.captureShortcut === 'string'
      ? payload.captureShortcut.trim()
      : resolveConfiguredCaptureShortcut();
  const sendShortcutInput =
    payload && typeof payload.sendShortcut === 'string'
      ? payload.sendShortcut.trim()
      : resolveConfiguredSendShortcut();
  const sourceLanguageInput =
    payload && typeof payload.sourceLanguage === 'string'
      ? payload.sourceLanguage.trim()
      : (config.selectedSourceLanguage || 'auto');
  const startCapture = Boolean(payload && payload.startCapture);
  const supportedSourceLanguages = Array.isArray(config.productSpec.pipeline.source_languages)
    ? config.productSpec.pipeline.source_languages
    : ['auto'];
  const translationService = normalizeTranslationService(translationServiceInput);
  const translationPreset = getTranslationServicePreset(translationService);
  const rawBaseUrl = baseUrlInput || translationPreset.baseUrl || '';
  const currentValues = loadRuntimeOverrides().values;
  const existingApiKey =
    currentValues.translation && typeof currentValues.translation === 'object'
      && typeof currentValues.translation.api_key === 'string'
      ? currentValues.translation.api_key.trim()
      : '';
  const effectiveApiKey = apiKeyInput || existingApiKey;

  if (!rawBaseUrl) {
    return { ok: false, error: 'missing translation.base_url' };
  }
  if (!translationModelInput) {
    return { ok: false, error: 'missing translation.model' };
  }
  if (!supportedSourceLanguages.includes(sourceLanguageInput)) {
    return { ok: false, error: 'invalid pipeline.source_language' };
  }
  if (!SUPPORTED_SEND_SHORTCUTS.includes(sendShortcutInput)) {
    return { ok: false, error: 'invalid desktop.send_shortcut' };
  }

  const normalizedBaseUrl = normalizeBaseUrl(rawBaseUrl);
  if ((translationPreset.requiresApiKey || normalizedBaseUrl === OFFICIAL_OPENAI_BASE_URL) && !effectiveApiKey) {
    return { ok: false, error: `${translationPreset.label} requires api_key` };
  }

  const shortcutResult = applyCaptureShortcut(shortcutInput);
  if (!shortcutResult.ok) {
    return { ok: false, error: shortcutResult.error };
  }

  const saved = writeRuntimeOverrides({
    ...currentValues,
    translation: {
      ...(currentValues.translation && typeof currentValues.translation === 'object'
        ? currentValues.translation
        : {}),
      service: translationService,
      base_url: normalizedBaseUrl,
      api_key: effectiveApiKey,
      model: translationModelInput,
    },
    desktop: {
      ...(currentValues.desktop && typeof currentValues.desktop === 'object'
        ? currentValues.desktop
        : {}),
      capture_shortcut: shortcutResult.shortcut,
      send_shortcut: sendShortcutInput,
    },
    pipeline: {
      ...(currentValues.pipeline && typeof currentValues.pipeline === 'object'
        ? currentValues.pipeline
        : {}),
      source_language: sourceLanguageInput,
    },
  });
  config.selectedSourceLanguage = sourceLanguageInput;
  config.selectedSendShortcut = sendShortcutInput;
  config.productSpec.pipeline.selected_source_language = sourceLanguageInput;
  if (!config.productSpec.conversation || typeof config.productSpec.conversation !== 'object') {
    config.productSpec.conversation = {};
  }
  config.productSpec.conversation.selected_send_shortcut = sendShortcutInput;
  config.productSpec.conversation.send_shortcut_options = SUPPORTED_SEND_SHORTCUTS;
  if (!config.implementationConfig || typeof config.implementationConfig !== 'object') {
    config.implementationConfig = {};
  }
  if (!config.implementationConfig.providers || typeof config.implementationConfig.providers !== 'object') {
    config.implementationConfig.providers = {};
  }
  config.implementationConfig.providers.translation_model = translationModelInput;
  config.implementationConfig.providers.translation_service = translationService;
  if (config.runtimeBundle?.pipeline) {
    config.runtimeBundle.pipeline.selected_source_language = sourceLanguageInput;
  }
  if (config.runtimeBundle) {
    config.runtimeBundle.providers = {
      ...(config.runtimeBundle.providers && typeof config.runtimeBundle.providers === 'object'
        ? config.runtimeBundle.providers
        : {}),
      translation_model: translationModelInput,
      translation_service: translationService,
    };
    config.runtimeBundle.conversation = {
      ...(config.runtimeBundle.conversation && typeof config.runtimeBundle.conversation === 'object'
        ? config.runtimeBundle.conversation
        : {}),
      selected_send_shortcut: sendShortcutInput,
      send_shortcut_options: SUPPORTED_SEND_SHORTCUTS,
    };
  }

  appendStartupLog('setup-guide:config-saved', {
    configPath: saved.path,
    translationService,
    translationModel: translationModelInput,
    usingOfficialEndpoint: normalizedBaseUrl === OFFICIAL_OPENAI_BASE_URL,
    apiKeyPresent: Boolean(effectiveApiKey),
    apiKeyUpdated: Boolean(apiKeyInput),
    captureShortcut: shortcutResult.shortcut,
    sendShortcut: sendShortcutInput,
    sourceLanguage: sourceLanguageInput,
    startCapture,
  });

  if (startCapture) {
    if (setupWindow && !setupWindow.isDestroyed()) {
      setupWindow.hide();
    }
    await showOverlay();
  }

  return {
    ok: true,
    configPath: saved.path,
    guide: getSetupGuideState(),
  };
});

ipcMain.handle('setup:close', async () => {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.close();
  }
  return { ok: true };
});

app.on('second-instance', () => {
  focusBestAvailableWindow();
});

app.whenReady().then(async () => {
  appendStartupLog('app:ready');
  runtimeBootstrap = ensureRuntimeOverridesTemplate();
  appendStartupLog('runtime-overrides:bootstrap', runtimeBootstrap);
  updateRuntime = createAutoUpdateRuntime({
    app,
    appendStartupLog,
    appendPipelineEvent,
    refreshTrayMenu,
    dialog,
    implementationConfig: config.implementationConfig,
  });
  createTray();
  createPanelWindow();
  const anchor = createAnchorWindow();
  anchor.show();
  await probeAndStoreScreenCaptureCapability();
  try {
    registerShortcuts();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendStartupLog('shortcut:register-failed', { message });
    dialog.showErrorBox('AiTrans 快捷键注册失败', `${message}\n\n请在首次配置窗口中重新设置快捷键。`);
    showSetupGuide();
  }
  if (shouldAutoOpenSetupGuide()) {
    appendStartupLog('setup-guide:auto-open');
    showSetupGuide();
  }
  createOverlayWindow();
  if (updateRuntime) {
    updateRuntime.scheduleStartupCheck();
  }
});

app.on('activate', () => {
  if (!panelWindow || panelWindow.isDestroyed()) {
    createPanelWindow();
  }
  if (!anchorWindow || anchorWindow.isDestroyed()) {
    const anchor = createAnchorWindow();
    anchor.show();
  }
});

app.on('will-quit', () => {
  app.isQuitting = true;
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Keep the tray app alive; explicit quit is exposed via tray menu.
});
