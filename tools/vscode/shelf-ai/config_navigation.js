const fs = require("fs");
const path = require("path");
const workspaceGuard = require("./guarding");

const TOML_SECTION_PATTERN = /^\s*\[([A-Za-z0-9_.-]+)\]\s*$/;

function isProjectConfigFile(filePath, repoRoot) {
  const relPath = workspaceGuard.normalizeRelPath(path.relative(repoRoot, filePath));
  return /^projects\/[^/]+\/project\.toml$/.test(relPath);
}

function findCurrentTomlSection(text, line) {
  const lines = String(text || "").split(/\r?\n/);
  const targetLine = Math.max(0, Math.min(Number(line) || 0, Math.max(0, lines.length - 1)));
  let sectionName = "";
  let sectionLine = 0;
  let sectionChar = 0;
  for (let index = 0; index <= targetLine; index += 1) {
    const lineText = lines[index] || "";
    const match = TOML_SECTION_PATTERN.exec(lineText);
    if (!match) {
      continue;
    }
    sectionName = match[1];
    sectionLine = index;
    sectionChar = lineText.indexOf("[");
  }
  if (!sectionName) {
    return null;
  }
  return {
    sectionName,
    line: sectionLine,
    character: sectionChar,
    length: Math.max(1, (lines[sectionLine] || "").trim().length),
  };
}

function readProjectCanonical(projectFilePath) {
  const canonicalPath = workspaceGuard.canonicalPathForProjectFile(projectFilePath);
  if (!fs.existsSync(canonicalPath) || !fs.statSync(canonicalPath).isFile()) {
    return null;
  }
  try {
    const payload = JSON.parse(fs.readFileSync(canonicalPath, "utf8"));
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

function findBoundaryBindingBySection(canonical, sectionName) {
  const configModules = Array.isArray(canonical?.config?.modules) ? canonical.config.modules : [];
  for (const configModule of configModules) {
    const bindings = Array.isArray(configModule?.compiled_config_export?.boundary_bindings)
      ? configModule.compiled_config_export.boundary_bindings
      : [];
    for (const binding of bindings) {
      const primaryExactPath = String(binding?.primary_exact_path || "");
      const primaryCommunicationPath = String(binding?.primary_communication_path || "");
      if (sectionName !== primaryExactPath && sectionName !== primaryCommunicationPath) {
        continue;
      }
      return {
        moduleId: String(configModule?.module_id || ""),
        boundaryId: String(binding?.boundary_id || ""),
      };
    }
  }
  return null;
}

function normalizeSourceFilePath(repoRoot, value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  if (path.isAbsolute(text)) {
    return text;
  }
  return path.join(repoRoot, text);
}

function findCodeAnchorTarget(canonical, repoRoot, mapping) {
  const codeModules = Array.isArray(canonical?.code?.modules) ? canonical.code.modules : [];
  const module = codeModules.find(
    (item) => item && typeof item === "object" && String(item.module_id || "") === mapping.moduleId
  );
  if (!module) {
    return null;
  }
  const slots = Array.isArray(module?.code_bindings?.implementation_slots)
    ? module.code_bindings.implementation_slots
    : [];
  const boundarySlot = slots.find(
    (item) => item
      && typeof item === "object"
      && String(item.boundary_id || "") === mapping.boundaryId
      && String(item.slot_kind || "") === "exact_boundary"
  );
  const sourceRef = boundarySlot?.source_ref && typeof boundarySlot.source_ref === "object"
    ? boundarySlot.source_ref
    : module?.source_ref;
  if (!sourceRef || typeof sourceRef !== "object") {
    return null;
  }
  const filePath = normalizeSourceFilePath(repoRoot, sourceRef.file_path);
  if (!filePath) {
    return null;
  }
  const line = Math.max(0, Number(sourceRef.line || 1) - 1);
  return {
    filePath,
    line,
    character: 0,
    length: 1,
    moduleId: mapping.moduleId,
    boundaryId: mapping.boundaryId,
    anchorPath: String(boundarySlot?.anchor_path || ""),
    sourceSymbol: String(boundarySlot?.source_symbol || ""),
  };
}

function resolveConfigToCodeTarget({ repoRoot, filePath, text, line }) {
  if (!repoRoot || !filePath || !isProjectConfigFile(filePath, repoRoot)) {
    return null;
  }
  const sectionInfo = findCurrentTomlSection(text, line);
  if (!sectionInfo) {
    return null;
  }
  const sectionName = sectionInfo.sectionName;
  if (!sectionName.startsWith("exact.") && !sectionName.startsWith("communication.")) {
    return null;
  }
  const freshness = workspaceGuard.getProjectCanonicalFreshness(repoRoot, filePath);
  if (freshness.status !== "fresh") {
    return null;
  }
  const canonical = readProjectCanonical(filePath);
  if (!canonical) {
    return null;
  }
  const mapping = findBoundaryBindingBySection(canonical, sectionName);
  if (!mapping) {
    return null;
  }
  const codeTarget = findCodeAnchorTarget(canonical, repoRoot, mapping);
  if (!codeTarget) {
    return null;
  }
  return {
    ...codeTarget,
    sectionName,
    sectionLine: sectionInfo.line,
    sectionCharacter: sectionInfo.character,
    sectionLength: sectionInfo.length,
  };
}

module.exports = {
  findCurrentTomlSection,
  isProjectConfigFile,
  resolveConfigToCodeTarget,
};
