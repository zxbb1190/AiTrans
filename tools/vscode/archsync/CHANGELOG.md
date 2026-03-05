# Changelog

## 0.0.4 - 2026-03-06
- Removed legacy tree compatibility; framework tree generation now only accepts `framework/<module>/Lx-Mn-*.md`.
- Aligned scaffold default output path to `Lx-Mn-*` naming.
- Added module-level source jump metadata consistency for generated framework tree.
- Updated framework docs to explicit upstream module references for growth edges.
- Kept Activity Bar Möbius icon + sidebar tree entry flow.

## 0.0.3 - 2026-03-06
- Added Activity Bar icon + sidebar home view for ArchSync.
- Sidebar supports one-click actions: open tree, refresh tree, validate, show issues.
- Removed `n/a` text from disabled status bar state.
- Updated sidebar icon to Möbius ring style.

## 0.0.2 - 2026-03-06
- Framework tree generation defaults to `framework/<module>/Lx-*.md` source.
- Tree edges are restricted to adjacent levels only (`Lx -> Lx+1`).
- Added node-level source metadata (`source_file`, `source_line`) in generated graph payload.
- Added graph detail action `打开源文件` to jump from node to markdown source line in VSCode.
- Updated ArchSync default tree generate command and README.

## 0.0.1
- Initial local release.
