from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys

REPO_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = REPO_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from generate_module_hierarchy_html import render_html
from hierarchy_models import HierarchyEdge, HierarchyGraph, HierarchyNode
from project_runtime import DEFAULT_PROJECT_FILE, materialize_project_runtime

MODULE_ID_PATTERN = re.compile(
    r"^(?P<framework>[A-Za-z][A-Za-z0-9_]*)\.L(?P<level>\d+)\.M(?P<module>\d+)$"
)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate evidence tree views derived from canonical.json.")
    parser.add_argument(
        "--project-file",
        default=str(DEFAULT_PROJECT_FILE.relative_to(REPO_ROOT)),
        help="path to the project.toml file",
    )
    parser.add_argument("--output-json", required=True, help="path to generated evidence tree JSON")
    parser.add_argument("--output-html", required=True, help="path to generated evidence tree HTML")
    return parser


def _parse_module_id(module_id: str) -> tuple[str, int, int]:
    match = MODULE_ID_PATTERN.fullmatch(module_id)
    if match is None:
        raise ValueError(f"invalid framework module id: {module_id}")
    return (
        match.group("framework"),
        int(match.group("level")),
        int(match.group("module")),
    )


def _find_first_h1_line(relative_file: str) -> int:
    file_path = REPO_ROOT / relative_file
    if not file_path.exists():
        return 1
    for index, line in enumerate(file_path.read_text(encoding="utf-8").splitlines(), start=1):
        if line.lstrip().startswith("# "):
            return index
    return 1


def _evidence_graph(project_file: str, canonical_path: str, canonical: dict[str, object]) -> HierarchyGraph:
    project = canonical["project"]
    if not isinstance(project, dict):
        raise ValueError("canonical.project must be an object")
    framework = canonical["framework"]
    if not isinstance(framework, dict):
        raise ValueError("canonical.framework must be an object")
    modules = framework["modules"]
    if not isinstance(modules, list):
        raise ValueError("canonical.framework.modules must be a list")
    links = canonical["links"]
    if not isinstance(links, dict):
        raise ValueError("canonical.links must be an object")

    config_class_by_module: dict[str, str] = {}
    for item in links.get("framework_to_config", []):
        if not isinstance(item, dict):
            continue
        module_id = str(item.get("framework_module_id") or "")
        class_name = str(item.get("config_module_class") or "")
        if module_id and class_name:
            config_class_by_module[module_id] = class_name

    code_class_by_module: dict[str, str] = {}
    for item in links.get("config_to_code", []):
        if not isinstance(item, dict):
            continue
        module_id = str(item.get("config_module_id") or "")
        class_name = str(item.get("code_module_class") or "")
        if module_id and class_name:
            code_class_by_module[module_id] = class_name

    evidence_class_by_module: dict[str, str] = {}
    for item in links.get("code_to_evidence", []):
        if not isinstance(item, dict):
            continue
        module_id = str(item.get("code_module_id") or "")
        class_name = str(item.get("evidence_module_class") or "")
        if module_id and class_name:
            evidence_class_by_module[module_id] = class_name

    project_id = str(project["project_id"])
    project_node_id = f"project:{project_id}"
    canonical_node_id = f"{project_node_id}:canonical"
    nodes = [
        HierarchyNode(
            node_id=project_node_id,
            label=f"project:{project_id}",
            level=0,
            description=f"project={project_id} | file={project_file}",
            metadata={
                "source_file": project_file,
                "source_line": 1,
                "doc_line": 1,
                "node_kind": "project",
                "module_title": f"Project {project_id}",
                "hover_kicker": "Project",
                "capability_items": [{"token": "Config", "text": project_file}],
                "base_items": [{"token": "Truth", "text": canonical_path}],
            },
        ),
        HierarchyNode(
            node_id=canonical_node_id,
            label="canonical.json",
            level=1,
            description=f"artifact=canonical.json | file={canonical_path}",
            metadata={
                "source_file": canonical_path,
                "source_line": 1,
                "doc_line": 1,
                "node_kind": "canonical",
                "module_title": "Canonical JSON",
                "hover_kicker": "Canonical Artifact",
                "capability_items": [{"token": "Schema", "text": "four-layer-canonical/v1"}],
                "base_items": [{"token": "Layers", "text": "framework / config / code / evidence"}],
            },
        ),
    ]
    edges = [
        HierarchyEdge(
            source=project_node_id,
            target=canonical_node_id,
            relation="tree_child",
            metadata={},
        )
    ]

    ordered_modules: list[tuple[str, int, int, dict[str, object]]] = []
    for item in modules:
        if not isinstance(item, dict):
            continue
        module_id = str(item["module_id"])
        framework_name, level_num, module_num = _parse_module_id(module_id)
        ordered_modules.append((framework_name, level_num, module_num, item))
    ordered_modules.sort(key=lambda item: (item[1], item[0], item[2]))

    for framework_name, level_num, module_num, item in ordered_modules:
        module_id = str(item["module_id"])
        framework_file = str(item["framework_file"])
        doc_line = _find_first_h1_line(framework_file)
        title_cn = str(item.get("title_cn") or "")
        title_en = str(item.get("title_en") or "")
        config_class = config_class_by_module.get(module_id, "")
        code_class = code_class_by_module.get(module_id, "")
        evidence_class = evidence_class_by_module.get(module_id, "")
        boundaries = item.get("boundaries")

        nodes.append(
            HierarchyNode(
                node_id=module_id,
                label=module_id,
                level=level_num + 2,
                order=module_num,
                description=(
                    f"module={module_id} | framework={framework_name} | level=L{level_num} | "
                    f"config={config_class or 'n/a'} | code={code_class or 'n/a'} | "
                    f"evidence={evidence_class or 'n/a'}"
                ),
                metadata={
                    "source_file": framework_file,
                    "source_line": doc_line,
                    "doc_line": doc_line,
                    "node_kind": "framework_module",
                    "module_name": framework_name,
                    "module_ref": f"L{level_num}.M{module_num}",
                    "module_title": title_cn or title_en or module_id,
                    "hover_kicker": "Evidence Trace Node",
                    "capability_items": [
                        {"token": "Config", "text": config_class or "未记录"},
                        {"token": "Code", "text": code_class or "未记录"},
                        {"token": "Evidence", "text": evidence_class or "未记录"},
                    ],
                    "base_items": [
                        {"token": "Framework", "text": framework_file},
                        {
                            "token": "Boundaries",
                            "text": ", ".join(
                                str(boundary.get("boundary_id") or "")
                                for boundary in boundaries
                                if isinstance(boundary, dict)
                            )
                            if isinstance(boundaries, list)
                            else "无",
                        },
                    ],
                },
            )
        )
        edges.append(
            HierarchyEdge(
                source=canonical_node_id,
                target=module_id,
                relation="tree_child",
                metadata={},
            )
        )

    max_level = max(node.level for node in nodes)
    level_labels = {
        0: "Project",
        1: "Canonical",
    }
    for level in range(2, max_level + 1):
        level_labels[level] = f"L{level - 2} Modules"

    return HierarchyGraph(
        title="Shelf Evidence Tree",
        description=(
            "从 canonical.json 派生，恢复旧交互式树图画布；"
            "保持当前 evidence tree 的 project/canonical/module 节点语义，只补回图形化浏览层。"
        ),
        foot_text="图中展示 project / canonical / framework module 的证据追踪关系，保持现有 evidence tree 节点语义。",
        level_labels=level_labels,
        nodes=nodes,
        edges=edges,
        storage_key_stem="evidenceTree",
    )


def main() -> int:
    args = _build_parser().parse_args()
    assembly = materialize_project_runtime(args.project_file)
    artifacts = assembly.generated_artifacts
    if artifacts is None:
        raise ValueError("generated artifact paths are required after materialization")
    graph = _evidence_graph(assembly.project_file, artifacts.canonical_json, assembly.canonical)
    payload = graph.to_payload_dict()
    output_json = Path(args.output_json)
    output_html = Path(args.output_html)
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_html.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    render_html(graph, output_html, width=1680, height=1080)
    print(f"[OK] evidence tree JSON generated: {output_json}")
    print(f"[OK] evidence tree HTML generated: {output_html}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
