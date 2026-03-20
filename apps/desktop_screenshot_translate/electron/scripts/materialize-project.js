const fs = require('node:fs');
const path = require('node:path');

const { getLocalGeneratedDir, getReleaseNotesDir } = require('../lib/project-config');

const GENERATED_ARTIFACTS = [
  'product_spec.json',
  'generation_manifest.json',
  'implementation_bundle.py',
];

const PROJECT_METADATA_KEYS = [
  'project_id',
  'template',
  'display_name',
  'description',
  'version',
];

function resolveAppRoot() {
  return path.resolve(__dirname, '..');
}

function resolveLegacySourceDir(...segments) {
  const candidate = path.resolve(resolveAppRoot(), '../../..', ...segments);
  return fs.existsSync(candidate) ? candidate : null;
}

function resolveOptionalInputPath(rawValue) {
  if (!rawValue || !rawValue.trim()) {
    return null;
  }
  return path.isAbsolute(rawValue) ? rawValue : path.resolve(process.cwd(), rawValue);
}

function resolveSourceGeneratedDir() {
  return (
    resolveOptionalInputPath(process.env.AITRANS_PROJECT_GENERATED_SOURCE)
    || resolveLegacySourceDir('projects', 'desktop_screenshot_translate', 'generated')
  );
}

function resolveSourceReleaseNotesDir() {
  return (
    resolveOptionalInputPath(process.env.AITRANS_RELEASE_NOTES_SOURCE)
    || resolveLegacySourceDir('projects', 'desktop_screenshot_translate', 'release-notes')
  );
}

function resolveSourceProductSpecPath() {
  return (
    resolveOptionalInputPath(process.env.AITRANS_PRODUCT_SPEC_SOURCE)
    || resolveLegacySourceDir('projects', 'desktop_screenshot_translate', 'product_spec.toml')
  );
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function hashFile(filePath) {
  const crypto = require('node:crypto');
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function copyRequiredArtifacts(sourceDir, targetDir) {
  ensureDir(targetDir);

  const missing = GENERATED_ARTIFACTS
    .map((name) => path.join(sourceDir, name))
    .filter((filePath) => !fs.existsSync(filePath));

  if (missing.length > 0) {
    throw new Error(`missing generated source artifacts: ${missing.join(', ')}`);
  }

  for (const name of GENERATED_ARTIFACTS) {
    const sourcePath = path.join(sourceDir, name);
    const targetPath = path.join(targetDir, name);
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`[OK] copied ${sourcePath} -> ${targetPath}`);
  }
}

function parseProjectMetadataFromToml(productSpecPath) {
  const text = fs.readFileSync(productSpecPath, 'utf-8');
  const sectionMatch = text.match(/^\[project\]\s*([\s\S]*?)(?=^\[|\Z)/m);
  if (!sectionMatch) {
    throw new Error(`missing [project] section in ${productSpecPath}`);
  }

  const section = sectionMatch[1];
  const metadata = {};

  for (const key of PROJECT_METADATA_KEYS) {
    const pattern = new RegExp(`^${key}\\s*=\\s*\"([^\"]+)\"`, 'm');
    const match = section.match(pattern);
    if (match) {
      metadata[key] = match[1].trim();
    }
  }

  return metadata;
}

function synchronizeProjectMetadata(targetDir, metadata) {
  const productSpecPath = path.join(targetDir, 'product_spec.json');
  const implementationBundlePath = path.join(targetDir, 'implementation_bundle.py');

  if (fs.existsSync(productSpecPath)) {
    const productSpec = JSON.parse(fs.readFileSync(productSpecPath, 'utf-8'));
    productSpec.project = {
      ...(productSpec.project || {}),
      ...metadata,
    };
    fs.writeFileSync(productSpecPath, `${JSON.stringify(productSpec, null, 2)}\n`, 'utf-8');
    console.log(`[OK] synchronized product metadata -> ${productSpecPath}`);
  }

  if (fs.existsSync(implementationBundlePath)) {
    const text = fs.readFileSync(implementationBundlePath, 'utf-8');
    const names = ['PRODUCT_SPEC', 'RUNTIME_BUNDLE'];
    const parsed = {};

    for (const name of names) {
      const pattern = new RegExp(`${name} = json\\.loads\\(r'''([\\s\\S]*?)'''\\)`);
      const match = text.match(pattern);
      if (!match) {
        throw new Error(`missing ${name} payload in ${implementationBundlePath}`);
      }
      parsed[name] = JSON.parse(match[1]);
    }

    parsed.PRODUCT_SPEC.project = {
      ...(parsed.PRODUCT_SPEC.project || {}),
      ...metadata,
    };
    parsed.RUNTIME_BUNDLE.project = {
      ...(parsed.RUNTIME_BUNDLE.project || {}),
      ...metadata,
    };

    let output = text;
    for (const name of names) {
      const pattern = new RegExp(`${name} = json\\.loads\\(r'''([\\s\\S]*?)'''\\)`);
      output = output.replace(
        pattern,
        `${name} = json.loads(r'''${JSON.stringify(parsed[name])}''')`,
      );
    }

    fs.writeFileSync(implementationBundlePath, output, 'utf-8');
    console.log(`[OK] synchronized embedded project metadata -> ${implementationBundlePath}`);
  }
}

function sanitizeImplementationBundle(bundlePath) {
  const text = fs.readFileSync(bundlePath, 'utf-8');
  const names = ['PRODUCT_SPEC', 'IMPLEMENTATION_CONFIG', 'RUNTIME_BUNDLE'];
  const parsed = {};

  for (const name of names) {
    const pattern = new RegExp(`${name} = json\\.loads\\(r'''([\\s\\S]*?)'''\\)`);
    const match = text.match(pattern);
    if (!match) {
      throw new Error(`missing ${name} payload in ${bundlePath}`);
    }
    parsed[name] = JSON.parse(match[1]);
  }

  if (parsed.IMPLEMENTATION_CONFIG.artifacts) {
    delete parsed.IMPLEMENTATION_CONFIG.artifacts.framework_ir_json;
  }

  parsed.RUNTIME_BUNDLE.generated_artifacts = {
    directory: 'project-generated',
    product_spec_json: 'project-generated/product_spec.json',
    implementation_bundle_py: 'project-generated/implementation_bundle.py',
    generation_manifest_json: 'project-generated/generation_manifest.json',
  };

  const output = [
    'from __future__ import annotations',
    '',
    '# GENERATED FILE. DO NOT EDIT.',
    '# Sync from the private source or replace project-generated/*, then re-materialize.',
    '',
    'import json',
    '',
    `PRODUCT_SPEC = json.loads(r'''${JSON.stringify(parsed.PRODUCT_SPEC)}''')`,
    '',
    `IMPLEMENTATION_CONFIG = json.loads(r'''${JSON.stringify(parsed.IMPLEMENTATION_CONFIG)}''')`,
    '',
    `RUNTIME_BUNDLE = json.loads(r'''${JSON.stringify(parsed.RUNTIME_BUNDLE)}''')`,
    '',
  ].join('\n');

  fs.writeFileSync(bundlePath, output, 'utf-8');
  console.log(`[OK] sanitized implementation bundle metadata -> ${bundlePath}`);
}

function sanitizeGenerationManifest(targetDir) {
  const productSpecPath = path.join(targetDir, 'product_spec.json');
  const implementationBundlePath = path.join(targetDir, 'implementation_bundle.py');
  const manifestPath = path.join(targetDir, 'generation_manifest.json');
  const source = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  const sanitized = {
    project_id: source.project_id || 'desktop_screenshot_translate',
    template: source.template || 'desktop_screenshot_translate',
    source_mode: 'standalone_materialized',
    generator: {
      entry: 'electron/scripts/materialize-project.js',
      discipline: source.generator?.discipline
        || 'standalone repo keeps only the generated runtime inputs required by the Electron app',
    },
    generated_files: {
      product_spec_json: 'project-generated/product_spec.json',
      implementation_bundle_py: 'project-generated/implementation_bundle.py',
      generation_manifest_json: 'project-generated/generation_manifest.json',
    },
    content_sha256: {
      product_spec_json: hashFile(productSpecPath),
      implementation_bundle_py: hashFile(implementationBundlePath),
    },
  };

  fs.writeFileSync(manifestPath, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf-8');
  console.log(`[OK] sanitized generation manifest -> ${manifestPath}`);
}

function copyReleaseNotes(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    console.log(`[WARN] release notes source not found: ${sourceDir}`);
    return;
  }

  ensureDir(targetDir);
  const notes = fs.readdirSync(sourceDir)
    .filter((name) => name.toLowerCase().endsWith('.md'));

  for (const name of notes) {
    const sourcePath = path.join(sourceDir, name);
    const targetPath = path.join(targetDir, name);
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`[OK] copied ${sourcePath} -> ${targetPath}`);
  }
}

function validateLocalArtifacts(targetDir) {
  const missing = GENERATED_ARTIFACTS
    .map((name) => path.join(targetDir, name))
    .filter((filePath) => !fs.existsSync(filePath));

  if (missing.length > 0) {
    throw new Error(
      `missing local generated artifacts: ${missing.join(', ')}; `
      + 'set AITRANS_PROJECT_GENERATED_SOURCE or keep project-generated in the repo',
    );
  }
}

function main() {
  const localGeneratedDir = getLocalGeneratedDir();
  const localReleaseNotesDir = getReleaseNotesDir();
  const sourceGeneratedDir = resolveSourceGeneratedDir();
  const sourceReleaseNotesDir = resolveSourceReleaseNotesDir();
  const sourceProductSpecPath = resolveSourceProductSpecPath();

  console.log('desktop_screenshot_translate standalone materializer');
  console.log(`app root: ${resolveAppRoot()}`);

  if (sourceGeneratedDir) {
    console.log(`[INFO] syncing generated artifacts from: ${sourceGeneratedDir}`);
    copyRequiredArtifacts(sourceGeneratedDir, localGeneratedDir);
    if (sourceProductSpecPath && fs.existsSync(sourceProductSpecPath)) {
      const metadata = parseProjectMetadataFromToml(sourceProductSpecPath);
      synchronizeProjectMetadata(localGeneratedDir, metadata);
    } else {
      console.log('[WARN] source product_spec.toml not found; keeping copied generated project metadata as-is');
    }
    sanitizeImplementationBundle(path.join(localGeneratedDir, 'implementation_bundle.py'));
    sanitizeGenerationManifest(localGeneratedDir);
  } else {
    console.log('[INFO] no external generated source configured; validating local project-generated');
    validateLocalArtifacts(localGeneratedDir);
  }

  if (sourceReleaseNotesDir) {
    console.log(`[INFO] syncing release notes from: ${sourceReleaseNotesDir}`);
    copyReleaseNotes(sourceReleaseNotesDir, localReleaseNotesDir);
  } else {
    console.log('[INFO] no external release notes source configured; keeping local release-notes as-is');
  }

  console.log('[SUMMARY] standalone assets are ready');
}

main();
