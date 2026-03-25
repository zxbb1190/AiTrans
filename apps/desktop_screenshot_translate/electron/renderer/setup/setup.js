const state = {
  displayName: 'AiTrans 截图翻译',
  configured: false,
  guide: {},
};

const DEFAULT_SERVICE_OPTIONS = ['openai', 'deepseek', 'zhipu', 'custom'];
const DEFAULT_PIPELINE_OPTIONS = ['auto', 'zh', 'en', 'ja'];
const DEFAULT_SEND_SHORTCUTS = ['enter', 'ctrl_enter', 'shift_enter'];
const DEFAULT_PADDLE_DEVICE_OPTIONS = ['cpu', 'gpu'];
const SERVICE_LABELS = {
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  zhipu: '智谱 AI',
  custom: '其他兼容服务',
};

function setStatus(message, tone = 'info') {
  const status = document.getElementById('status');
  status.textContent = message;
  status.dataset.tone = tone;
}

function setHint(message) {
  document.getElementById('hint').textContent = message;
}

function getGuide() {
  return state.guide || {};
}

function getTranslationPreset(serviceKey) {
  const presets = getGuide().translationServicePresets || {};
  const preset = presets[serviceKey];
  if (preset) {
    return preset;
  }
  return {
    key: serviceKey,
    label: SERVICE_LABELS[serviceKey] || serviceKey,
    baseUrl: '',
    requiresApiKey: false,
    modelExamples: [],
  };
}

function toSourceLanguageLabel(option) {
  if (option === 'auto') return '自动识别';
  if (option === 'zh') return '中文';
  if (option === 'en') return '英文';
  if (option === 'ja') return '日文';
  return option;
}

function toSendShortcutLabel(option) {
  if (option === 'enter') return 'Enter（默认）';
  if (option === 'ctrl_enter') return 'Ctrl+Enter';
  if (option === 'shift_enter') return 'Shift+Enter';
  return option;
}

function shouldAdoptPresetValue(input, previousValue, previousPresetValues = []) {
  const current = input.value.trim();
  return !current || current === previousValue || previousPresetValues.includes(current);
}

function refreshServiceCopy() {
  const serviceInput = document.getElementById('translationService');
  const preset = getTranslationPreset(serviceInput.value);
  const translationServiceHint = document.getElementById('translationServiceHint');
  const baseUrlHint = document.getElementById('baseUrlHint');
  const modelHint = document.getElementById('modelHint');
  const apiKeyHint = document.getElementById('apiKeyHint');

  translationServiceHint.textContent = `当前选择：${preset.label}。AiTrans 支持 OpenAI 官方、DeepSeek、智谱 AI，以及其他提供 OpenAI-compatible 接口的服务。`;
  if (serviceInput.value === 'custom') {
    baseUrlHint.textContent = '请填写兼容 API 的完整 base_url，例如企业网关、局域网网关或本地代理地址。';
  } else {
    baseUrlHint.textContent = `常用端点：${preset.baseUrl || '请按服务方文档填写'}。如果你在代理、网关或局域网环境中使用，也可以改成自己的兼容地址。`;
  }
  modelHint.textContent = preset.modelExamples && preset.modelExamples.length
    ? `常见模型示例：${preset.modelExamples.join(' / ')}。也可以填写该服务方支持的其他模型名称。`
    : '模型名称由服务方决定，请填写该服务提供的模型 ID。';
  apiKeyHint.textContent = preset.requiresApiKey
    ? `${preset.label} 通常需要 API Key，请优先通过本窗口保存。`
    : '如果你的兼容服务允许无密钥访问，可以留空；否则请填写对应 API Key。';
}

function syncServiceControls() {
  const guide = getGuide();
  const translationServiceInput = document.getElementById('translationService');
  const baseUrlInput = document.getElementById('baseUrl');
  const modelInput = document.getElementById('translationModel');
  const runtimeDraft = guide.runtimeDraft || {};
  const serviceOptions = Array.isArray(guide.translationServiceOptions)
    ? guide.translationServiceOptions
    : DEFAULT_SERVICE_OPTIONS;

  const currentService = translationServiceInput.value;
  translationServiceInput.innerHTML = '';
  for (const option of serviceOptions) {
    const preset = getTranslationPreset(option);
    const element = document.createElement('option');
    element.value = option;
    element.textContent = preset.label || SERVICE_LABELS[option] || option;
    translationServiceInput.appendChild(element);
  }

  const nextService = serviceOptions.includes(runtimeDraft.translationService)
    ? runtimeDraft.translationService
    : (serviceOptions[0] || 'openai');
  if (document.activeElement !== translationServiceInput || !serviceOptions.includes(currentService)) {
    translationServiceInput.value = nextService;
  }

  const selectedService = translationServiceInput.value;
  const preset = getTranslationPreset(selectedService);
  const previousService = translationServiceInput.dataset.previousService || '';
  const previousPreset = getTranslationPreset(previousService);

  if (document.activeElement !== baseUrlInput) {
    const nextBaseUrl = runtimeDraft.baseUrl || preset.baseUrl || '';
    if (nextBaseUrl) {
      baseUrlInput.value = nextBaseUrl;
    }
  }

  if (document.activeElement !== modelInput) {
    const nextModel = runtimeDraft.translationModel || (preset.modelExamples && preset.modelExamples[0]) || '';
    if (nextModel) {
      modelInput.value = nextModel;
    }
  }

  translationServiceInput.dataset.previousService = selectedService;
  translationServiceInput.dataset.previousBaseUrl = preset.baseUrl || '';
  translationServiceInput.dataset.previousModel = (preset.modelExamples && preset.modelExamples[0]) || '';

  translationServiceInput.onchange = () => {
    const nextPreset = getTranslationPreset(translationServiceInput.value);
    const previousBaseUrl = translationServiceInput.dataset.previousBaseUrl || '';
    const previousModel = translationServiceInput.dataset.previousModel || '';
    const previousExamples = previousService ? getTranslationPreset(previousService).modelExamples || [] : [];

    if (shouldAdoptPresetValue(baseUrlInput, previousBaseUrl, [previousBaseUrl])) {
      baseUrlInput.value = nextPreset.baseUrl || '';
    }
    if (shouldAdoptPresetValue(modelInput, previousModel, previousExamples)) {
      modelInput.value = (nextPreset.modelExamples && nextPreset.modelExamples[0]) || '';
    }

    translationServiceInput.dataset.previousService = translationServiceInput.value;
    translationServiceInput.dataset.previousBaseUrl = nextPreset.baseUrl || '';
    translationServiceInput.dataset.previousModel = (nextPreset.modelExamples && nextPreset.modelExamples[0]) || '';
    refreshServiceCopy();
  };

  refreshServiceCopy();
}

function syncForm(guide) {
  state.guide = guide || {};
  const runtimeDraft = guide?.runtimeDraft || {};
  const desktopDraft = guide?.desktopDraft || {};
  const pipelineDraft = guide?.pipelineDraft || {};
  const ocrDraft = guide?.ocrDraft || {};
  const pipelineOptions = Array.isArray(guide?.pipelineOptions) ? guide.pipelineOptions : DEFAULT_PIPELINE_OPTIONS;
  const sendShortcutOptions = Array.isArray(guide?.sendShortcutOptions) ? guide.sendShortcutOptions : DEFAULT_SEND_SHORTCUTS;
  const paddleDeviceOptions = Array.isArray(guide?.paddleDeviceOptions) ? guide.paddleDeviceOptions : DEFAULT_PADDLE_DEVICE_OPTIONS;

  const apiKeyInput = document.getElementById('apiKey');
  const captureShortcutInput = document.getElementById('captureShortcut');
  const sendShortcutInput = document.getElementById('sendShortcut');
  const sourceLanguageInput = document.getElementById('sourceLanguage');
  const paddlePythonInput = document.getElementById('paddlePython');
  const paddleDeviceInput = document.getElementById('paddleDevice');

  syncServiceControls();

  if (document.activeElement !== apiKeyInput) {
    apiKeyInput.value = '';
    apiKeyInput.placeholder = runtimeDraft.apiKeyPresent
      ? '已保存 API Key；留空保存会保持当前值'
      : '输入 API Key；若你的兼容服务允许无密钥可留空';
  }
  if (document.activeElement !== captureShortcutInput) {
    captureShortcutInput.value = desktopDraft.captureShortcut || 'CommandOrControl+Shift+1';
  }
  if (document.activeElement !== paddlePythonInput) {
    paddlePythonInput.value = ocrDraft.paddlePython || '';
  }

  const currentSendShortcut = sendShortcutInput.value;
  sendShortcutInput.innerHTML = '';
  for (const option of sendShortcutOptions) {
    const element = document.createElement('option');
    element.value = option;
    element.textContent = toSendShortcutLabel(option);
    sendShortcutInput.appendChild(element);
  }
  const nextSendShortcut = desktopDraft.sendShortcut || 'enter';
  if (document.activeElement !== sendShortcutInput || !sendShortcutOptions.includes(currentSendShortcut)) {
    sendShortcutInput.value = sendShortcutOptions.includes(nextSendShortcut) ? nextSendShortcut : 'enter';
  }

  const currentSourceLanguage = sourceLanguageInput.value;
  sourceLanguageInput.innerHTML = '';
  for (const option of pipelineOptions) {
    const element = document.createElement('option');
    element.value = option;
    element.textContent = toSourceLanguageLabel(option);
    sourceLanguageInput.appendChild(element);
  }
  const nextSourceLanguage = pipelineDraft.sourceLanguage || 'auto';
  if (document.activeElement !== sourceLanguageInput || !pipelineOptions.includes(currentSourceLanguage)) {
    sourceLanguageInput.value = pipelineOptions.includes(nextSourceLanguage) ? nextSourceLanguage : 'auto';
  }

  const currentPaddleDevice = paddleDeviceInput.value;
  paddleDeviceInput.innerHTML = '';
  for (const option of paddleDeviceOptions) {
    const element = document.createElement('option');
    element.value = option;
    element.textContent = option === 'gpu' ? 'GPU' : 'CPU（默认）';
    paddleDeviceInput.appendChild(element);
  }
  const nextPaddleDevice = ocrDraft.paddleDevice || 'cpu';
  if (document.activeElement !== paddleDeviceInput || !paddleDeviceOptions.includes(currentPaddleDevice)) {
    paddleDeviceInput.value = paddleDeviceOptions.includes(nextPaddleDevice) ? nextPaddleDevice : 'cpu';
  }
}


function render(payload) {
  const displayName = payload?.product?.displayName || state.displayName;
  const guide = payload?.guide || {};
  const configured = Boolean(guide.configured);
  const capabilities = guide.capabilities || {};

  state.displayName = displayName;
  state.configured = configured;
  state.guide = guide;

  document.getElementById('displayName').textContent = displayName;
  document.getElementById('configPath').textContent = guide.runtimeOverridesPath || '未检测到配置路径';
  document.getElementById('entryModeChip').textContent = `入口模式：${capabilities.entryMode || 'tray_and_shortcut'}`;
  document.getElementById('shortcutChip').textContent = `快捷键：${capabilities.shortcutAvailable === false ? '不可用' : '可用'}`;
  document.getElementById('captureChip').textContent = `截图能力：${capabilities.screenCaptureAvailable === false ? '不可用' : '可用'}`;

  syncForm(guide);

  if (capabilities.screenCaptureAvailable === false) {
    setStatus('当前无法获取屏幕内容，请先处理系统权限、远程桌面限制或显卡采集环境问题', 'error');
    setHint(capabilities.screenCaptureMessage || '截图主链已降级为引导模式；问题解决前不要继续发起截图。');
  } else if (capabilities.shortcutAvailable === false) {
    setStatus('全局快捷键暂不可用，当前已降级为仅托盘入口', 'warning');
    setHint(capabilities.shortcutMessage || '请在本窗口重新设置快捷键；在此之前仍可通过托盘入口开始截图。');
  } else if (!configured) {
    if (guide.credentialMode === 'missing_translation_endpoint') {
      setStatus('请先选择翻译服务并填写端点地址', 'warning');
      setHint('OpenAI、DeepSeek、智谱 AI 等兼容服务都需要正确的 base_url。');
    } else if (guide.credentialMode === 'missing_translation_model') {
      setStatus('请先填写模型名称', 'warning');
      setHint('模型名称由服务方决定；常见示例已显示在“模型名称”输入框提示里。');
    } else {
      setStatus('尚未完成翻译端点配置，请先填写并保存服务、模型、base_url / api_key', 'warning');
      setHint('优先通过本窗口完成配置；只有在高级排障时才需要手动打开配置文件。');
    }
  } else {
    setStatus('翻译端点已可用，可以直接开始截图或聊天', 'success');
    setHint('保存后立即生效，不需要重新安装。你可以直接回到托盘，拖选区域或使用整屏模式开始截图。');
  }
}

async function refreshGuide() {
  const guide = await window.aitransDesktop.getSetupGuideState();
  render({
    product: {
      displayName: state.displayName,
    },
    guide,
  });
}

window.aitransDesktop.onSetupData((payload) => {
  render(payload);
});

document.getElementById('setupForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  await saveConfig(false);
});

async function saveConfig(startCapture) {
  const saveButton = document.getElementById('save');
  const startButton = document.getElementById('saveAndStart');
  const translationService = document.getElementById('translationService').value;
  const baseUrl = document.getElementById('baseUrl').value.trim();
  const translationModel = document.getElementById('translationModel').value.trim();
  const apiKey = document.getElementById('apiKey').value.trim();
  const captureShortcut = document.getElementById('captureShortcut').value.trim();
  const sendShortcut = document.getElementById('sendShortcut').value;
  const sourceLanguage = document.getElementById('sourceLanguage').value;
  const paddlePython = document.getElementById('paddlePython').value.trim();
  const paddleDevice = document.getElementById('paddleDevice').value;

  saveButton.disabled = true;
  startButton.disabled = true;
  setStatus(startCapture ? '正在保存并准备截图…' : '正在保存配置…', 'info');

  try {
    const result = await window.aitransDesktop.saveSetupConfig({
      translationService,
      baseUrl,
      translationModel,
      apiKey,
      captureShortcut,
      sendShortcut,
      sourceLanguage,
      paddlePython,
      paddleDevice,
      startCapture,
    });
    if (!result?.ok) {
      setStatus(result?.error || '保存配置失败', 'error');
      return;
    }
    render({
      product: {
        displayName: state.displayName,
      },
      guide: result.guide || {},
    });
    setStatus(startCapture ? '配置已保存，正在进入截图' : '配置已保存，可以直接开始截图翻译', 'success');
  } finally {
    saveButton.disabled = false;
    startButton.disabled = false;
  }
}

document.getElementById('saveAndStart').addEventListener('click', async () => {
  await saveConfig(true);
});

document.getElementById('openFile').addEventListener('click', async () => {
  await window.aitransDesktop.openConfigFile();
});

document.getElementById('openDir').addEventListener('click', async () => {
  await window.aitransDesktop.openConfigDirectory();
});

document.getElementById('copyPath').addEventListener('click', async () => {
  await window.aitransDesktop.copyConfigPath();
});

document.getElementById('refresh').addEventListener('click', async () => {
  await refreshGuide();
});

document.getElementById('close').addEventListener('click', async () => {
  await window.aitransDesktop.closeSetupGuide();
});

refreshGuide();
