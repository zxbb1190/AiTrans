const { loadRuntimeOverrides } = require('./runtime-overrides');

function resolveConfiguredUpdateBaseUrl() {
  const envValue = (process.env.AITRANS_UPDATE_BASE_URL || '').trim();
  if (envValue) {
    return envValue.replace(/\/+$/, '');
  }

  const runtimeOverrides = loadRuntimeOverrides().values;
  const overrideValue =
    runtimeOverrides
    && typeof runtimeOverrides.release === 'object'
    && typeof runtimeOverrides.release.update_base_url === 'string'
      ? runtimeOverrides.release.update_base_url.trim()
      : '';
  return overrideValue ? overrideValue.replace(/\/+$/, '') : '';
}

function createDisabledState(reason, detail = null) {
  return {
    enabled: false,
    configured: false,
    status: 'disabled',
    reason,
    detail,
    updateAvailable: false,
    updateDownloaded: false,
    currentVersion: null,
    latestVersion: null,
    downloadProgress: null,
    baseUrl: '',
  };
}

function createAutoUpdateRuntime(options) {
  const {
    app,
    appendStartupLog,
    appendPipelineEvent,
    refreshTrayMenu,
    dialog,
    implementationConfig,
  } = options;

  const releaseConfig = implementationConfig.release;
  const state = {
    enabled: false,
    configured: false,
    status: 'idle',
    reason: null,
    detail: null,
    updateAvailable: false,
    updateDownloaded: false,
    currentVersion: app.getVersion(),
    latestVersion: null,
    downloadProgress: null,
    baseUrl: '',
  };

  let updater = null;

  function assign(nextState) {
    Object.assign(state, nextState);
    refreshTrayMenu();
  }

  function emit(eventName, details = {}) {
    appendPipelineEvent(eventName, null, {
      resultState: details.resultState || state.status,
      stageStatus: details.stageStatus || state.status,
      provider: 'auto_update',
      ...details,
    });
  }

  function disable(reason, detail = null) {
    assign(createDisabledState(reason, detail));
    appendStartupLog('auto-update:disabled', { reason, detail });
  }

  function configureUpdater() {
    if (!releaseConfig.auto_update) {
      disable('auto_update_disabled');
      return false;
    }
    if (process.platform !== 'win32') {
      disable('unsupported_platform', process.platform);
      return false;
    }
    if (!app.isPackaged) {
      disable('unpackaged_app');
      return false;
    }

    const baseUrl = resolveConfiguredUpdateBaseUrl();
    if (!baseUrl) {
      disable('missing_update_feed');
      return false;
    }

    let NsisUpdater;
    try {
      ({ NsisUpdater } = require('electron-updater'));
    } catch (error) {
      disable('missing_electron_updater_dependency', error instanceof Error ? error.message : String(error));
      return false;
    }

    updater = new NsisUpdater({
      provider: 'generic',
      url: baseUrl,
      channel: releaseConfig.channel,
    });
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false;

    updater.on('checking-for-update', () => {
      assign({
        enabled: true,
        configured: true,
        status: 'checking',
        reason: null,
        detail: null,
        baseUrl,
      });
      appendStartupLog('auto-update:checking', { baseUrl });
      emit('update_check_started', {
        resultState: 'checking',
        stageStatus: 'checking',
      });
    });

    updater.on('update-available', (info) => {
      assign({
        enabled: true,
        configured: true,
        status: 'update_available',
        updateAvailable: true,
        updateDownloaded: false,
        latestVersion: info?.version || null,
        detail: 'downloading',
        baseUrl,
      });
      appendStartupLog('auto-update:available', { baseUrl, version: info?.version || null });
      emit('update_available', {
        resultState: 'update_available',
        stageStatus: 'update_available',
      });
      dialog.showMessageBox({
        type: 'info',
        title: 'AiTrans 更新可用',
        message: `检测到新版本 ${info?.version || ''}，正在后台下载。`,
        buttons: ['知道了'],
        defaultId: 0,
      }).catch(() => {});
    });

    updater.on('update-not-available', (info) => {
      assign({
        enabled: true,
        configured: true,
        status: 'idle',
        updateAvailable: false,
        updateDownloaded: false,
        latestVersion: info?.version || state.currentVersion,
        detail: 'latest',
        baseUrl,
      });
      appendStartupLog('auto-update:not-available', { baseUrl, version: info?.version || null });
      emit('update_not_available', {
        resultState: 'idle',
        stageStatus: 'idle',
      });
    });

    updater.on('download-progress', (progress) => {
      assign({
        enabled: true,
        configured: true,
        status: 'downloading',
        updateAvailable: true,
        updateDownloaded: false,
        detail: `${Math.round(progress.percent || 0)}%`,
        downloadProgress: progress.percent || 0,
        baseUrl,
      });
    });

    updater.on('update-downloaded', (info) => {
      assign({
        enabled: true,
        configured: true,
        status: 'downloaded',
        updateAvailable: true,
        updateDownloaded: true,
        latestVersion: info?.version || null,
        detail: 'ready_to_install',
        downloadProgress: 100,
        baseUrl,
      });
      appendStartupLog('auto-update:downloaded', { baseUrl, version: info?.version || null });
      emit('update_downloaded', {
        resultState: 'downloaded',
        stageStatus: 'downloaded',
      });
      dialog.showMessageBox({
        type: 'info',
        title: 'AiTrans 更新已就绪',
        message: `新版本 ${info?.version || ''} 已下载完成。可通过托盘菜单立即安装。`,
        buttons: ['知道了'],
        defaultId: 0,
      }).catch(() => {});
    });

    updater.on('error', (error) => {
      assign({
        enabled: true,
        configured: true,
        status: 'error',
        detail: error?.message || String(error),
        baseUrl,
      });
      appendStartupLog('auto-update:error', { baseUrl, message: error?.message || String(error) });
      emit('update_failed', {
        resultState: 'failed',
        stageStatus: 'failed',
        error: error?.message || String(error),
      });
    });

    assign({
      enabled: true,
      configured: true,
      status: 'idle',
      reason: null,
      detail: null,
      updateAvailable: false,
      updateDownloaded: false,
      latestVersion: null,
      downloadProgress: null,
      baseUrl,
    });
    appendStartupLog('auto-update:configured', { baseUrl, channel: releaseConfig.channel });
    return true;
  }

  async function checkForUpdates(manual = false) {
    if (!updater && !configureUpdater()) {
      const errorMessage = state.reason === 'missing_update_feed'
        ? '未配置自动更新源，请通过 AITRANS_UPDATE_BASE_URL 或 runtime-overrides.json 中的 release.update_base_url 提供更新地址。'
        : state.detail || state.reason || 'automatic update is unavailable';
      return {
        ok: false,
        error: errorMessage,
        state: { ...state },
      };
    }

    try {
      if (manual) {
        appendStartupLog('auto-update:manual-check-requested', { baseUrl: state.baseUrl });
      }
      await updater.checkForUpdates();
      return {
        ok: true,
        state: { ...state },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assign({
        enabled: true,
        configured: true,
        status: 'error',
        detail: message,
      });
      appendStartupLog('auto-update:check-failed', { message, baseUrl: state.baseUrl, manual });
      emit('update_failed', {
        resultState: 'failed',
        stageStatus: 'failed',
        error: message,
      });
      return {
        ok: false,
        error: message,
        state: { ...state },
      };
    }
  }

  function scheduleStartupCheck() {
    if (releaseConfig.update_check_trigger !== 'startup_delayed_and_tray_manual') {
      return;
    }
    if (!configureUpdater()) {
      return;
    }
    setTimeout(() => {
      checkForUpdates(false).catch(() => {});
    }, 15000);
  }

  function installDownloadedUpdate() {
    if (!updater || !state.updateDownloaded) {
      return {
        ok: false,
        error: 'update_not_downloaded',
      };
    }
    appendStartupLog('auto-update:quit-and-install', {
      version: state.latestVersion,
      baseUrl: state.baseUrl,
    });
    updater.quitAndInstall(false, true);
    return { ok: true };
  }

  function getTrayStatusLabel() {
    if (!releaseConfig.auto_update) {
      return '自动更新：未启用';
    }
    if (!state.configured) {
      return state.reason === 'missing_update_feed'
        ? '自动更新：未配置更新源'
        : '自动更新：当前不可用';
    }
    switch (state.status) {
      case 'checking':
        return '自动更新：正在检查';
      case 'update_available':
        return `自动更新：发现新版本${state.latestVersion ? ` ${state.latestVersion}` : ''}`;
      case 'downloading':
        return `自动更新：下载中${state.detail ? ` ${state.detail}` : ''}`;
      case 'downloaded':
        return `自动更新：已下载${state.latestVersion ? ` ${state.latestVersion}` : ''}`;
      case 'error':
        return '自动更新：检查失败';
      default:
        return '自动更新：已启用';
    }
  }

  return {
    checkForUpdates,
    getState() {
      return { ...state };
    },
    getTrayStatusLabel,
    installDownloadedUpdate,
    scheduleStartupCheck,
  };
}

module.exports = {
  createAutoUpdateRuntime,
  resolveConfiguredUpdateBaseUrl,
};
