const fs = require('node:fs');
const path = require('node:path');

const { loadRuntimeOverrides, resolveAppRoot } = require('./runtime-overrides');

const OFFICIAL_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const TRANSLATION_SERVICE_PRESETS = {
  openai: {
    key: 'openai',
    label: 'OpenAI',
    baseUrl: OFFICIAL_OPENAI_BASE_URL,
    requiresApiKey: true,
    modelExamples: ['gpt-4.1-mini', 'gpt-5-mini'],
  },
  deepseek: {
    key: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    requiresApiKey: true,
    modelExamples: ['deepseek-chat', 'deepseek-reasoner'],
  },
  zhipu: {
    key: 'zhipu',
    label: '智谱 AI',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    requiresApiKey: true,
    modelExamples: ['glm-4.5-air', 'glm-4.6', 'glm-5'],
  },
  custom: {
    key: 'custom',
    label: '其他兼容服务',
    baseUrl: '',
    requiresApiKey: false,
    modelExamples: ['provider-specific-model-id'],
  },
};

function normalizeBaseUrl(input) {
  if (typeof input !== 'string') {
    return OFFICIAL_OPENAI_BASE_URL;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return OFFICIAL_OPENAI_BASE_URL;
  }
  return trimmed.replace(/\/+$/, '');
}

function normalizeTranslationService(input) {
  if (typeof input !== 'string') {
    return 'custom';
  }
  const normalized = input.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(TRANSLATION_SERVICE_PRESETS, normalized)
    ? normalized
    : 'custom';
}

function getTranslationServicePreset(service) {
  return TRANSLATION_SERVICE_PRESETS[normalizeTranslationService(service)] || TRANSLATION_SERVICE_PRESETS.custom;
}

function resolveTranslationService() {
  const runtimeOverrides = loadRuntimeOverrides().values;
  return normalizeTranslationService(
    runtimeOverrides.translation?.service
      || process.env.AITRANS_TRANSLATION_SERVICE
      || process.env.AITRANS_OPENAI_SERVICE
      || 'custom',
  );
}

function resolveOpenAiBaseUrl() {
  const runtimeOverrides = loadRuntimeOverrides().values;
  const service = resolveTranslationService();
  const preset = getTranslationServicePreset(service);
  const candidate =
    process.env.AITRANS_OPENAI_BASE_URL
    || process.env.OPENAI_BASE_URL
    || runtimeOverrides.translation?.base_url
    || preset.baseUrl
    || '';
  return normalizeBaseUrl(candidate);
}

function resolveOpenAiApiKey(baseUrl, service = null) {
  const runtimeOverrides = loadRuntimeOverrides().values;
  const normalizedService = normalizeTranslationService(service || resolveTranslationService());
  const preset = getTranslationServicePreset(normalizedService);
  const apiKey = (
    process.env.OPENAI_API_KEY
    || process.env.AITRANS_OPENAI_API_KEY
    || runtimeOverrides.translation?.api_key
    || ''
  ).trim();
  if (apiKey) {
    return apiKey;
  }
  if (preset.requiresApiKey || normalizeBaseUrl(baseUrl) === OFFICIAL_OPENAI_BASE_URL) {
    throw new Error(`missing api_key for ${preset.label}`);
  }
  return '';
}

function resolveTranslationModel(implementationConfig) {
  const runtimeOverrides = loadRuntimeOverrides().values;
  const override = typeof runtimeOverrides.translation?.model === 'string'
    ? runtimeOverrides.translation.model.trim()
    : '';
  if (override) {
    return override;
  }
  return implementationConfig?.providers?.translation_model || '';
}

function getBundledTesseractCandidates() {
  const appRoot = resolveAppRoot();
  const resourcesPath =
    typeof process.resourcesPath === 'string' && process.resourcesPath.trim()
      ? process.resourcesPath
      : null;

  const candidates = [
    path.join(appRoot, 'vendor', 'tesseract', 'tesseract.exe'),
    path.join(appRoot, 'vendor', 'tesseract', 'bin', 'tesseract.exe'),
  ];

  if (resourcesPath) {
    candidates.push(
      path.join(resourcesPath, 'tesseract', 'tesseract.exe'),
      path.join(resourcesPath, 'vendor', 'tesseract', 'tesseract.exe'),
      path.join(resourcesPath, 'vendor', 'tesseract', 'bin', 'tesseract.exe'),
    );
  }

  return [...new Set(candidates)];
}

function resolveTessdataDirectory(executable, runtimeOverrides) {
  const manualDir = runtimeOverrides.ocr?.tessdata_dir;
  if (typeof manualDir === 'string' && manualDir.trim()) {
    return manualDir.trim();
  }

  const executableDir = path.dirname(executable);
  const candidates = [
    path.join(executableDir, 'tessdata'),
    path.join(executableDir, '..', 'tessdata'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}


function getBundledPaddleOcrScriptCandidates() {
  const appRoot = resolveAppRoot();
  const resourcesPath =
    typeof process.resourcesPath === 'string' && process.resourcesPath.trim()
      ? process.resourcesPath
      : null;

  const candidates = [
    path.join(appRoot, 'vendor', 'paddleocr', 'paddleocr_local_runner.py'),
  ];

  if (resourcesPath) {
    candidates.push(
      path.join(resourcesPath, 'paddleocr', 'paddleocr_local_runner.py'),
    );
  }

  return [...new Set(candidates)];
}

function resolvePaddleOcrRuntime(implementationConfig) {
  const runtimeOverrides = loadRuntimeOverrides().values;
  const allowEnvFallback = implementationConfig?.providers?.ocr_dev_fallback === 'allow_env_binary_path';
  const scriptPath = getBundledPaddleOcrScriptCandidates().find((candidate) => fs.existsSync(candidate)) || null;
  const overridePython = (
    process.env.AITRANS_PADDLEOCR_PYTHON
    || runtimeOverrides.ocr?.paddleocr_python
    || ''
  ).trim();
  const device = (
    process.env.AITRANS_PADDLEOCR_DEVICE
    || runtimeOverrides.ocr?.paddleocr_device
    || 'cpu'
  ).trim() || 'cpu';

  if (allowEnvFallback && overridePython) {
    return {
      executable: overridePython,
      source: 'env_override',
      device,
      scriptPath,
    };
  }

  return {
    executable: 'python',
    source: 'path_lookup',
    device,
    scriptPath,
  };
}

function resolveTesseractExecutable(implementationConfig) {
  const runtimeOverrides = loadRuntimeOverrides().values;
  const allowEnvFallback = implementationConfig?.providers?.ocr_dev_fallback === 'allow_env_binary_path';
  const bundled = getBundledTesseractCandidates().find((candidate) => fs.existsSync(candidate));
  if (bundled) {
    return {
      executable: bundled,
      source: 'bundled',
      tessdataDir: resolveTessdataDirectory(bundled, runtimeOverrides),
    };
  }

  const overridePath = (
    process.env.AITRANS_TESSERACT_PATH
    || runtimeOverrides.ocr?.tesseract_path
    || ''
  ).trim();
  if (allowEnvFallback && overridePath) {
    return {
      executable: overridePath,
      source: 'env_override',
      tessdataDir: resolveTessdataDirectory(overridePath, runtimeOverrides),
    };
  }

  return {
    executable: 'tesseract',
    source: 'path_lookup',
    tessdataDir: resolveTessdataDirectory('tesseract', runtimeOverrides),
  };
}

module.exports = {
  OFFICIAL_OPENAI_BASE_URL,
  TRANSLATION_SERVICE_PRESETS,
  getBundledTesseractCandidates,
  getBundledPaddleOcrScriptCandidates,
  getTranslationServicePreset,
  loadRuntimeOverrides,
  normalizeBaseUrl,
  normalizeTranslationService,
  resolveAppRoot,
  resolveOpenAiApiKey,
  resolveOpenAiBaseUrl,
  resolveTranslationModel,
  resolveTranslationService,
  resolvePaddleOcrRuntime,
  resolveTesseractExecutable,
};
