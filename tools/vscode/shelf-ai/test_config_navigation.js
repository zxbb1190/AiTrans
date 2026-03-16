const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  findCurrentTomlSection,
  isProjectConfigFile,
  resolveConfigToCodeTarget,
} = require("./config_navigation");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const projectFilePath = path.join(repoRoot, "projects", "knowledge_base_basic", "project.toml");

function findLineBySection(text, sectionName) {
  const lines = String(text || "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === `[${sectionName}]`) {
      return index;
    }
  }
  return -1;
}

function main() {
  assert(isProjectConfigFile(projectFilePath, repoRoot), "project.toml should be recognized as project config file");

  const text = fs.readFileSync(projectFilePath, "utf8");
  const exactSectionLine = findLineBySection(text, "exact.knowledge_base.fileset");
  assert(exactSectionLine >= 0, "exact.knowledge_base.fileset section should exist");

  const sectionInfo = findCurrentTomlSection(text, exactSectionLine + 1);
  assert(sectionInfo, "section info should be resolved inside exact boundary section");
  assert.strictEqual(sectionInfo.sectionName, "exact.knowledge_base.fileset");

  const codeTarget = resolveConfigToCodeTarget({
    repoRoot,
    filePath: projectFilePath,
    text,
    line: exactSectionLine + 1,
    character: 0,
  });
  assert(codeTarget, "config section should resolve to code anchor target");
  assert.strictEqual(codeTarget.boundaryId, "FILESET");
  assert(codeTarget.filePath.endsWith(path.join("src", "project_runtime", "code_layer.py")));
  assert(Number.isInteger(codeTarget.line) && codeTarget.line >= 0, "code target should include valid line");

  const projectSectionLine = findLineBySection(text, "project");
  assert(projectSectionLine >= 0, "project section should exist");
  const noTarget = resolveConfigToCodeTarget({
    repoRoot,
    filePath: projectFilePath,
    text,
    line: projectSectionLine,
    character: 0,
  });
  assert.strictEqual(noTarget, null, "non-boundary sections should not resolve to code anchors");
}

main();
