const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function resolveAppRoot() {
  return path.resolve(__dirname, '..');
}

function resolveRepoRoot() {
  return path.resolve(resolveAppRoot(), '../../..');
}

function resolveProjectGeneratedDir() {
  return path.join(resolveRepoRoot(), 'projects', 'desktop_screenshot_translate', 'generated');
}

function checkFile(label, filePath, failures) {
  if (fs.existsSync(filePath)) {
    console.log(`[OK] ${label}: ${filePath}`);
    return;
  }
  console.log(`[FAIL] ${label}: ${filePath}`);
  failures.push(`missing ${label}`);
}

function checkOpenAiKey(failures) {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) {
    console.log('[OK] OPENAI_API_KEY is set');
    return;
  }
  console.log('[WARN] OPENAI_API_KEY is not set; translation will fall back to local stub');
  failures.push('missing OPENAI_API_KEY');
}

function resolveTesseractExecutable() {
  return process.env.AITRANS_TESSERACT_PATH || 'tesseract';
}

function checkTesseract(failures) {
  const executable = resolveTesseractExecutable();
  try {
    const output = execFileSync(executable, ['--version'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const versionLine = output.split(/\r?\n/).find(Boolean) || 'unknown version';
    console.log(`[OK] tesseract available: ${executable} -> ${versionLine}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[FAIL] tesseract unavailable: ${executable}`);
    console.log(`       ${message}`);
    failures.push('missing tesseract');
  }
}

function checkPlatform() {
  if (process.platform === 'win32') {
    console.log('[OK] running on Windows');
    return;
  }
  console.log(`[WARN] current platform is ${process.platform}; Windows GUI validation still needs native Windows`);
}

function main() {
  const failures = [];
  const generatedDir = resolveProjectGeneratedDir();

  console.log('desktop_screenshot_translate Windows MVP doctor');
  console.log(`app root: ${resolveAppRoot()}`);
  console.log(`repo root: ${resolveRepoRoot()}`);

  checkPlatform();
  checkFile('generated/product_spec.json', path.join(generatedDir, 'product_spec.json'), failures);
  checkFile('generated/generation_manifest.json', path.join(generatedDir, 'generation_manifest.json'), failures);
  checkFile('generated/implementation_bundle.py', path.join(generatedDir, 'implementation_bundle.py'), failures);
  checkTesseract(failures);
  checkOpenAiKey(failures);

  if (failures.length > 0) {
    console.log('');
    console.log('[SUMMARY] doctor found issues:');
    for (const item of failures) {
      console.log(`- ${item}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log('[SUMMARY] doctor passed; Windows MVP can proceed to npm run dev');
}

main();
