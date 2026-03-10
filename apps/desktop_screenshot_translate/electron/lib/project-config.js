const fs = require('node:fs');
const path = require('node:path');

function getRepoRoot() {
  return path.resolve(__dirname, '../../../../');
}

function getProjectRoot() {
  return path.join(getRepoRoot(), 'projects', 'desktop_screenshot_translate');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function extractEmbeddedJson(bundleText, variableName) {
  const pattern = new RegExp(`${variableName} = json\\.loads\\(r'''([\\s\\S]*?)'''\\)`);
  const match = bundleText.match(pattern);
  if (!match) {
    throw new Error(`missing embedded ${variableName} payload in implementation bundle`);
  }
  return JSON.parse(match[1]);
}

function loadProjectConfig() {
  const projectRoot = getProjectRoot();
  const generatedDir = path.join(projectRoot, 'generated');
  const productSpecPath = path.join(generatedDir, 'product_spec.json');
  const manifestPath = path.join(generatedDir, 'generation_manifest.json');
  const implementationBundlePath = path.join(generatedDir, 'implementation_bundle.py');

  if (!fs.existsSync(productSpecPath)) {
    throw new Error(`missing generated product spec: ${productSpecPath}`);
  }
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`missing generation manifest: ${manifestPath}`);
  }
  if (!fs.existsSync(implementationBundlePath)) {
    throw new Error(`missing generated implementation bundle: ${implementationBundlePath}`);
  }

  const productSpec = readJson(productSpecPath);
  const manifest = readJson(manifestPath);
  const implementationBundleText = fs.readFileSync(implementationBundlePath, 'utf-8');
  const implementationConfig = extractEmbeddedJson(implementationBundleText, 'IMPLEMENTATION_CONFIG');
  const runtimeBundle = extractEmbeddedJson(implementationBundleText, 'RUNTIME_BUNDLE');
  const shortcut = process.env.AITRANS_CAPTURE_SHORTCUT || 'CommandOrControl+Shift+1';

  return {
    repoRoot: getRepoRoot(),
    projectRoot,
    generatedDir,
    productSpecPath,
    manifestPath,
    implementationBundlePath,
    productSpec,
    manifest,
    implementationConfig,
    runtimeBundle,
    shortcut,
  };
}

module.exports = {
  getRepoRoot,
  getProjectRoot,
  loadProjectConfig,
};
