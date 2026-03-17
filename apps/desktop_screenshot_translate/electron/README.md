# AiTrans Screenshot Translate Electron

Windows-first Electron desktop app for screenshot OCR and translation.

This directory is prepared to be published as its own repository. The app keeps the generated runtime inputs it needs under `project-generated/` and the public release notes it needs under `release-notes/`, so it can build without the rest of the private monorepo.

## What Is Included

- Electron main process, preload bridge, tray and overlay flows
- Vue 3 + Vite result panel UI
- Bundled Tesseract runtime under `vendor/tesseract/`
- Generated runtime inputs under `project-generated/`
- Release notes used by packaging under `release-notes/`

## Quick Start

Windows is the primary development and packaging target.

```bash
npm install
npm run doctor
npm run panel:build
npm run dev
```

## Standalone Asset Sync

`npm run materialize:project` keeps `project-generated/` and `release-notes/` ready for this standalone repo.

- When this project still lives inside the original monorepo layout, the script auto-detects the legacy source directories and copies the latest generated artifacts here.
- When this project is already split into its own repo, keep the local copies committed, or point the script at an external source with:

```bash
AITRANS_PROJECT_GENERATED_SOURCE=/path/to/generated
AITRANS_RELEASE_NOTES_SOURCE=/path/to/release-notes
npm run materialize:project
```

The sync step intentionally keeps only the generated files the Electron app needs for runtime and packaging.

## Packaging

```bash
npm run materialize:project
npm run release:check
npm run dist:win
```

Artifacts are written to `dist/`.

## Publish This As A Separate Repo

If you are splitting from a larger monorepo, a common workflow is:

```bash
git subtree split --prefix=apps/desktop_screenshot_translate/electron -b public/electron
git remote add public https://github.com/<you>/<repo>.git
git push -u public public/electron:main
```

Before publishing, review the bundled binaries in `vendor/tesseract/` and choose a license file for the new public repo.
