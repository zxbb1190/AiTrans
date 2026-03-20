const fs = require('node:fs');
const path = require('node:path');

const { loadRuntimeOverrides, resolveAppRoot } = require('./runtime-overrides');

function getStandaloneRoot() {
  return resolveAppRoot();
}

function getLocalGeneratedDir() {
  return path.join(getStandaloneRoot(), 'project-generated');
}

function getReleaseNotesDir() {
  return path.join(getStandaloneRoot(), 'release-notes');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function getGeneratedDirCandidates() {
  const resourcesPath =
    typeof process.resourcesPath === 'string' && process.resourcesPath.trim()
      ? process.resourcesPath
      : '';

  return [
    resourcesPath ? path.join(resourcesPath, 'project-generated') : null,
    getLocalGeneratedDir(),
  ].filter(Boolean);
}

function extractEmbeddedJson(bundleText, variableName) {
  const pattern = new RegExp(`${variableName} = json\\.loads\\(r'''([\\s\\S]*?)'''\\)`);
  const match = bundleText.match(pattern);
  if (!match) {
    throw new Error(`missing embedded ${variableName} payload in implementation bundle`);
  }
  return JSON.parse(match[1]);
}

function resolveSelectedSourceLanguage(productSpec, runtimeOverrides) {
  const supported = Array.isArray(productSpec?.pipeline?.source_languages)
    ? productSpec.pipeline.source_languages
    : ['auto'];
  const override =
    runtimeOverrides && typeof runtimeOverrides.pipeline?.source_language === 'string'
      ? runtimeOverrides.pipeline.source_language.trim()
      : '';
  if (override && supported.includes(override)) {
    return override;
  }
  return supported.includes('auto') ? 'auto' : supported[0];
}

function resolveSelectedSendShortcut(runtimeOverrides) {
  const supported = ['enter', 'ctrl_enter', 'shift_enter'];
  const override =
    runtimeOverrides && typeof runtimeOverrides.desktop?.send_shortcut === 'string'
      ? runtimeOverrides.desktop.send_shortcut.trim()
      : '';
  if (override && supported.includes(override)) {
    return override;
  }
  return 'enter';
}

function loadProjectConfig() {
  let generatedDir = null;
  let productSpecPath = null;
  let manifestPath = null;
  let implementationBundlePath = null;

  for (const candidate of getGeneratedDirCandidates()) {
    const nextProductSpec = path.join(candidate, 'product_spec.json');
    const nextManifest = path.join(candidate, 'generation_manifest.json');
    const nextImplementationBundle = path.join(candidate, 'implementation_bundle.py');
    if (
      fs.existsSync(nextProductSpec)
      && fs.existsSync(nextManifest)
      && fs.existsSync(nextImplementationBundle)
    ) {
      generatedDir = candidate;
      productSpecPath = nextProductSpec;
      manifestPath = nextManifest;
      implementationBundlePath = nextImplementationBundle;
      break;
    }
  }

  if (!generatedDir || !productSpecPath || !manifestPath || !implementationBundlePath) {
    throw new Error(`missing generated project artifacts; searched: ${getGeneratedDirCandidates().join(', ')}`);
  }

  const productSpec = readJson(productSpecPath);
  const manifest = readJson(manifestPath);
  const implementationBundleText = fs.readFileSync(implementationBundlePath, 'utf-8');
  const implementationConfig = extractEmbeddedJson(implementationBundleText, 'IMPLEMENTATION_CONFIG');
  const runtimeBundle = extractEmbeddedJson(implementationBundleText, 'RUNTIME_BUNDLE');
  const runtimeOverrides = loadRuntimeOverrides().values;
  const selectedSourceLanguage = resolveSelectedSourceLanguage(productSpec, runtimeOverrides);
  const selectedSendShortcut = resolveSelectedSendShortcut(runtimeOverrides);
  productSpec.pipeline.selected_source_language = selectedSourceLanguage;
  if (!productSpec.conversation || typeof productSpec.conversation !== 'object') {
    productSpec.conversation = {};
  }
  productSpec.conversation.selected_send_shortcut = selectedSendShortcut;
  productSpec.conversation.send_shortcut_options = ['enter', 'ctrl_enter', 'shift_enter'];
  runtimeBundle.pipeline.selected_source_language = selectedSourceLanguage;
  runtimeBundle.conversation = {
    ...(runtimeBundle.conversation && typeof runtimeBundle.conversation === 'object'
      ? runtimeBundle.conversation
      : {}),
    selected_send_shortcut: selectedSendShortcut,
    send_shortcut_options: ['enter', 'ctrl_enter', 'shift_enter'],
  };
  const shortcut = (
    process.env.AITRANS_CAPTURE_SHORTCUT
    || runtimeOverrides.desktop?.capture_shortcut
    || 'CommandOrControl+Shift+1'
  ).trim();

  return {
    appRoot: getStandaloneRoot(),
    generatedDir,
    releaseNotesDir: getReleaseNotesDir(),
    productSpecPath,
    manifestPath,
    implementationBundlePath,
    productSpec,
    manifest,
    implementationConfig,
    runtimeBundle,
    selectedSourceLanguage,
    selectedSendShortcut,
    shortcut,
  };
}

module.exports = {
  getLocalGeneratedDir,
  getReleaseNotesDir,
  loadProjectConfig,
};
