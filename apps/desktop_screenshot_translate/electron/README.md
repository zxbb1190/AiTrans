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

## Automated Releases

The standalone repo includes `.github/workflows/release.yml`. Pushing a tag like `v0.2.2` will:

- verify that `package.json` is also `0.2.2`
- verify that `release-notes/0.2.2.md` exists
- build the Windows installer and portable package on `windows-latest`
- create or update the matching GitHub Release
- upload `.exe`, `.blockmap`, `stable.yml`, and `release-manifest-*.json`

Recommended release flow:

```bash
npm run materialize:project
npm run check
npm run doctor
npm run release:check
git add package.json release-notes/0.2.2.md project-generated
git commit -m "release: v0.2.2"
git push origin main
git tag v0.2.2
git push origin v0.2.2
```

If the tag and `package.json` version do not match, the workflow fails early on purpose.

## Publish This As A Separate Repo

If you are splitting from a larger monorepo, a common workflow is:

```bash
git subtree split --prefix=apps/desktop_screenshot_translate/electron -b public/electron
git remote add public https://github.com/<you>/<repo>.git
git push -u public public/electron:main
```

Before publishing, review the bundled binaries in `vendor/tesseract/` and choose a license file for the new public repo.
