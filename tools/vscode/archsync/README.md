# ArchSync (VSCode Extension)

## What It Does
- Opens framework tree structure HTML in Webview (`docs/hierarchy/shelf_framework_tree.html`).
- Refreshes framework tree artifacts by running the generator script.
- Runs strict mapping validation automatically on startup.
- Runs strict mapping validation on save/create/rename/delete for relevant files.
- Runs strict mapping validation when watched files change outside VSCode and when window regains focus.
- Auto-disables validation for repositories that do not contain `specs/规范总纲与树形结构.md`.
- Shows validation issues in VSCode Problems panel.
- Status bar (`ArchSync issues`) is clickable and opens an issue picker for direct file/line jump.
- Auto-fail notification provides buttons: `Open Problems` / `Open Log`.
- Provides manual commands for validation and framework tree viewing.

## Install (Local)
1. Open `tools/vscode/archsync` in VSCode.
2. Press `F5` to launch Extension Development Host.
3. Open the repository in the launched host window.

## Commands
- `ArchSync: Open Framework Tree`
- `ArchSync: Refresh Framework Tree`
- `ArchSync: Validate Mapping Now`
- `ArchSync: Show Mapping Issues`

## Configuration
- `archSync.enableOnSave`
- `archSync.notifyOnAutoFail`
- `archSync.changeValidationCommand`
- `archSync.fullValidationCommand`
- `archSync.frameworkTreeHtmlPath`
- `archSync.frameworkTreeGenerateCommand`

Default commands use the repository validator:
- `uv run python scripts/validate_strict_mapping.py --check-changes --json`
- `uv run python scripts/validate_strict_mapping.py --json`

Default framework tree generation command:
- `uv run python scripts/generate_framework_tree_hierarchy.py --registry mapping/mapping_registry.json --output-json docs/hierarchy/shelf_framework_tree.json --output-html docs/hierarchy/shelf_framework_tree.html`
