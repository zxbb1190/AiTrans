from __future__ import annotations

from dataclasses import replace
import json
from pathlib import Path
from typing import Any

from framework_ir import FrameworkRegistry, load_framework_registry
from framework_packages.builtin_registry import load_builtin_package_registry
from framework_packages.contract import PackageCompileInput, PackageCompileResult, PackageSelectedRoot
from framework_packages.registry import FrameworkPackageRegistry
from project_runtime.config_loader import load_project_config
from project_runtime.knowledge_base_contract import KnowledgeBaseTemplateContract, load_knowledge_base_template_contract
from project_runtime.models import GeneratedArtifactOutputPaths, GeneratedArtifactPaths, KnowledgeBaseCompilationState, KnowledgeBaseRuntimeBundle, KnowledgeDocument, UnifiedProjectConfig
from project_runtime.module_tree import resolve_module_tree
from project_runtime.package_config import resolve_config_slice
from project_runtime.utils import cleanup_generated_output_dir, normalize_project_path, relative_path, sha256_text, tokenize
from rule_validation_models import ValidationReports


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_KNOWLEDGE_BASE_PROJECT_FILE = REPO_ROOT / "projects/knowledge_base_basic/project.toml"
KNOWLEDGE_BASE_RUNTIME_SCENE = "knowledge_base_workbench"
KNOWLEDGE_BASE_CANONICAL_SCHEMA_VERSION = "framework-package-canonical/v2"


def compile_project(project_file: str | Path) -> tuple[KnowledgeBaseCompilationState, KnowledgeBaseRuntimeBundle]:
    project_path = normalize_project_path(project_file)
    config = load_project_config(project_path)
    scene_contract = load_knowledge_base_template_contract()
    framework_registry = load_framework_registry()
    package_registry = load_builtin_package_registry()
    package_registry.validate_against_framework(framework_registry)
    module_tree = resolve_module_tree(framework_registry, config.selection)
    validate_project_config(config, module_tree.root_module_ids(), module_tree.modules, scene_contract)
    package_results = compile_package_results(
        config=config,
        package_registry=package_registry,
        module_tree=module_tree,
    )
    state = KnowledgeBaseCompilationState(
        project_file=config.project_file,
        config=config,
        scene_contract=scene_contract,
        package_registry=package_registry,
        module_tree=module_tree,
        package_results=package_results,
    )
    runtime_bundle = build_runtime_bundle(state)
    validation_reports = collect_validation_reports(runtime_bundle)
    raise_on_validation_failures(validation_reports)
    runtime_bundle = replace(runtime_bundle, validation_reports=validation_reports)
    runtime_bundle = replace(runtime_bundle, canonical_graph=build_canonical_graph(state, runtime_bundle))
    runtime_bundle = replace(
        runtime_bundle,
        project_config_payload=build_project_config_view(runtime_bundle),
        public_summary_payload=build_public_summary(runtime_bundle),
    )
    runtime_bundle = replace(runtime_bundle, canonical_graph=build_canonical_graph(state, runtime_bundle))
    return state, runtime_bundle


def compile_project_runtime_bundle(
    project_file: str | Path = DEFAULT_KNOWLEDGE_BASE_PROJECT_FILE,
) -> tuple[KnowledgeBaseCompilationState, KnowledgeBaseRuntimeBundle]:
    return compile_project(project_file)


def load_knowledge_base_runtime_bundle(
    project_file: str | Path = DEFAULT_KNOWLEDGE_BASE_PROJECT_FILE,
) -> KnowledgeBaseRuntimeBundle:
    _, runtime_bundle = compile_project(project_file)
    return runtime_bundle


def load_project_runtime_bundle(
    project_file: str | Path = DEFAULT_KNOWLEDGE_BASE_PROJECT_FILE,
) -> KnowledgeBaseRuntimeBundle:
    return load_knowledge_base_runtime_bundle(project_file)


def materialize_knowledge_base_runtime_bundle(
    project_file: str | Path = DEFAULT_KNOWLEDGE_BASE_PROJECT_FILE,
    output_dir: str | Path | None = None,
) -> KnowledgeBaseRuntimeBundle:
    from project_runtime.governance import build_derived_view_payloads

    state, project = compile_project(project_file)
    project_path = normalize_project_path(project_file)
    generated_dir = project_path.parent / "generated"
    output_path = normalize_project_path(output_dir) if output_dir is not None else generated_dir
    output_path.mkdir(parents=True, exist_ok=True)

    artifact_names = project.refinement.artifacts
    expected_file_names = set(artifact_names.file_names())
    cleanup_generated_output_dir(output_path, expected_file_names)
    output_paths = GeneratedArtifactOutputPaths.from_artifact_config(artifact_names, output_dir=output_path)
    generated_artifacts = GeneratedArtifactPaths.from_artifact_config(
        artifact_names,
        directory=generated_dir,
        path_renderer=relative_path,
    )
    project = replace(project, generated_artifacts=generated_artifacts)
    canonical_graph = build_canonical_graph(state, project)
    derived_view_payloads = build_derived_view_payloads(canonical_graph, generated_artifacts=generated_artifacts.to_dict())
    project = replace(project, derived_views=derived_view_payloads.generation_manifest["derived_views"])
    project = replace(project, canonical_graph=build_canonical_graph(state, project))
    project = replace(
        project,
        project_config_payload=build_project_config_view(project),
        public_summary_payload=build_public_summary(project),
    )
    project = replace(project, canonical_graph=build_canonical_graph(state, project))
    runtime_bundle_text = build_runtime_bundle_text(project, project.canonical_graph)

    output_paths.canonical_graph_json.write_text(json.dumps(project.canonical_graph, ensure_ascii=False, indent=2), encoding="utf-8")
    output_paths.runtime_bundle_py.write_text(runtime_bundle_text, encoding="utf-8")
    output_paths.generation_manifest_json.write_text(
        json.dumps(derived_view_payloads.generation_manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    output_paths.governance_manifest_json.write_text(
        json.dumps(derived_view_payloads.governance_manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    output_paths.governance_tree_json.write_text(
        json.dumps(derived_view_payloads.governance_tree, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    output_paths.strict_zone_report_json.write_text(
        json.dumps(derived_view_payloads.strict_zone_report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    output_paths.object_coverage_report_json.write_text(
        json.dumps(derived_view_payloads.object_coverage_report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return project


def materialize_project_runtime_bundle(
    project_file: str | Path = DEFAULT_KNOWLEDGE_BASE_PROJECT_FILE,
    output_dir: str | Path | None = None,
) -> KnowledgeBaseRuntimeBundle:
    return materialize_knowledge_base_runtime_bundle(project_file, output_dir=output_dir)


def build_knowledge_base_runtime_app_from_project_file(
    project_file: str | Path = DEFAULT_KNOWLEDGE_BASE_PROJECT_FILE,
) -> Any:
    from knowledge_base_runtime.app import build_knowledge_base_runtime_app

    return build_knowledge_base_runtime_app(materialize_project_runtime_bundle(project_file))


def build_project_runtime_app_from_project_file(
    project_file: str | Path = DEFAULT_KNOWLEDGE_BASE_PROJECT_FILE,
) -> Any:
    return build_knowledge_base_runtime_app_from_project_file(project_file)


def validate_project_config(
    config: UnifiedProjectConfig,
    root_module_ids: dict[str, str],
    resolved_modules: tuple[Any, ...],
    scene_contract: KnowledgeBaseTemplateContract,
) -> None:
    required_roles = {"frontend", "knowledge_base", "backend"}
    missing_roles = required_roles - set(root_module_ids)
    if missing_roles:
        raise ValueError(f"selection.roots missing runtime roles: {', '.join(sorted(missing_roles))}")
    if config.metadata.runtime_scene != KNOWLEDGE_BASE_RUNTIME_SCENE:
        raise ValueError(f"unsupported runtime_scene: {config.metadata.runtime_scene}")
    if config.surface.shell != scene_contract.required_surface_shell:
        raise ValueError(f"truth.surface.shell must be {scene_contract.required_surface_shell}")
    if config.surface.layout_variant != scene_contract.required_layout_variant:
        raise ValueError(f"truth.surface.layout_variant must be {scene_contract.required_layout_variant}")
    if config.surface.preview_mode != scene_contract.required_preview_mode:
        raise ValueError(f"truth.surface.preview_mode must be {scene_contract.required_preview_mode}")
    if not all(
        (
            config.library.enabled,
            config.preview.enabled,
            config.chat.enabled,
            config.chat.citations_enabled,
            config.return_config.enabled,
        )
    ):
        raise ValueError("knowledge_base_workbench requires library, preview, chat, citations, and return")
    if not config.route.home.startswith("/") or not config.route.workbench.startswith("/"):
        raise ValueError("truth.route.home and truth.route.workbench must start with '/'")
    if not config.route.api_prefix.startswith("/api"):
        raise ValueError("truth.route.api_prefix must start with '/api'")
    if not config.route.knowledge_detail.startswith(config.route.knowledge_list):
        raise ValueError("truth.route.knowledge_detail must stay under truth.route.knowledge_list")
    if not config.route.document_detail_prefix.startswith(config.route.knowledge_detail):
        raise ValueError("truth.route.document_detail_prefix must stay under truth.route.knowledge_detail")
    if not config.route.basketball_showcase.startswith(config.route.workbench):
        raise ValueError("truth.route.basketball_showcase must stay under truth.route.workbench")
    if config.library.default_focus != scene_contract.required_library_default_focus:
        raise ValueError(f"truth.library.default_focus must be {scene_contract.required_library_default_focus}")
    if config.preview.anchor_mode != scene_contract.required_preview_anchor_mode:
        raise ValueError(f"truth.preview.anchor_mode must be {scene_contract.required_preview_anchor_mode}")
    if config.preview.preview_variant != scene_contract.required_preview_variant:
        raise ValueError(f"truth.preview.preview_variant must be {scene_contract.required_preview_variant}")
    if config.chat.mode != scene_contract.required_chat_mode:
        raise ValueError(f"truth.chat.mode must be {scene_contract.required_chat_mode}")
    if config.chat.citation_style != scene_contract.required_chat_citation_style:
        raise ValueError(f"truth.chat.citation_style must be {scene_contract.required_chat_citation_style}")
    if tuple(config.a11y.reading_order) != scene_contract.required_reading_order:
        raise ValueError("truth.a11y.reading_order does not match scene contract")
    missing_return_targets = scene_contract.required_return_target_set() - set(config.return_config.targets)
    if missing_return_targets:
        raise ValueError(f"truth.return.targets missing required values: {', '.join(sorted(missing_return_targets))}")
    if config.refinement.frontend.renderer not in scene_contract.supported_frontend_renderers:
        raise ValueError(f"unsupported refinement.frontend.renderer: {config.refinement.frontend.renderer}")
    if config.refinement.frontend.style_profile not in scene_contract.supported_frontend_style_profiles:
        raise ValueError(f"unsupported refinement.frontend.style_profile: {config.refinement.frontend.style_profile}")
    if config.refinement.frontend.script_profile not in scene_contract.supported_frontend_script_profiles:
        raise ValueError(f"unsupported refinement.frontend.script_profile: {config.refinement.frontend.script_profile}")
    if config.refinement.backend.renderer not in scene_contract.supported_backend_renderers:
        raise ValueError(f"unsupported refinement.backend.renderer: {config.refinement.backend.renderer}")
    if config.refinement.backend.transport not in scene_contract.supported_backend_transports:
        raise ValueError(f"unsupported refinement.backend.transport: {config.refinement.backend.transport}")
    if config.refinement.backend.retrieval_strategy not in scene_contract.supported_backend_retrieval_strategies:
        raise ValueError(
            f"unsupported refinement.backend.retrieval_strategy: {config.refinement.backend.retrieval_strategy}"
        )
    if config.refinement.backend.retrieval_strategy != config.chat.mode:
        raise ValueError("refinement.backend.retrieval_strategy must match truth.chat.mode")
    if not config.refinement.evidence.project_config_endpoint.startswith(config.route.api_prefix):
        raise ValueError("refinement.evidence.project_config_endpoint must stay under truth.route.api_prefix")
    if not all(module.bases for module in resolved_modules):
        raise ValueError("selected framework modules must define bases")
    for document in config.documents:
        if len(tokenize(document.summary)) < 3:
            raise ValueError(f"document summary is too short for retrieval: {document.document_id}")
        if "## " not in document.body_markdown:
            raise ValueError(f"document body must contain level-2 headings: {document.document_id}")


def compile_package_results(
    *,
    config: UnifiedProjectConfig,
    package_registry: FrameworkPackageRegistry,
    module_tree: Any,
) -> dict[str, PackageCompileResult]:
    root_payload = config.root_payload()
    selected_roots = tuple(
        PackageSelectedRoot(
            slot_id=item.slot_id,
            role=item.role,
            module_id=item.module.module_id,
            framework_file=item.framework_file,
            entry_class_name=package_registry.get_by_module_id(item.module.module_id).entry_class_name,
        )
        for item in module_tree.roots
    )
    results: dict[str, PackageCompileResult] = {}
    for module in module_tree.modules:
        registration = package_registry.get_by_module_id(module.module_id)
        entry = registration.entry_class()
        child_slots = entry.child_slots(module)
        child_exports: dict[str, dict[str, Any]] = {}
        for slot in child_slots:
            child_result = results.get(slot.child_module_id)
            if child_result is None and slot.required:
                raise ValueError(f"missing compiled child package: {slot.child_module_id}")
            if child_result is not None:
                child_exports[slot.child_module_id] = child_result.export
        config_slice = resolve_config_slice(
            root_payload,
            contract=entry.config_contract(),
            package_id=entry.module_id(),
        )
        compiled = entry.compile(
            PackageCompileInput(
                framework_module=module,
                config_slice=config_slice,
                child_exports=child_exports,
                selected_roots=selected_roots,
            )
        )
        results[module.module_id] = compiled
    return results


def build_runtime_bundle(state: KnowledgeBaseCompilationState) -> KnowledgeBaseRuntimeBundle:
    runtime_exports = assemble_runtime_exports(state.package_results)
    document_exports = runtime_exports.get("documents")
    if not isinstance(document_exports, list) or not document_exports:
        raise ValueError("runtime exports must include compiled documents")
    documents = tuple(
        KnowledgeDocument.from_dict(item)
        for item in document_exports
        if isinstance(item, dict)
    )
    if not documents:
        raise ValueError("runtime exports must include at least one compiled document")
    runtime_bundle = KnowledgeBaseRuntimeBundle(
        project_file=state.project_file,
        config=state.config,
        scene_contract=state.scene_contract,
        documents=documents,
        package_compile_order=tuple(item.module_id for item in state.module_tree.modules),
        root_module_ids=state.module_tree.root_module_ids(),
        runtime_exports=runtime_exports,
        validation_reports=ValidationReports.empty(),
    )
    runtime_bundle = replace(runtime_bundle, project_config_payload=build_project_config_view(runtime_bundle))
    runtime_bundle = replace(runtime_bundle, public_summary_payload=build_public_summary(runtime_bundle))
    return runtime_bundle


def assemble_runtime_exports(package_results: dict[str, PackageCompileResult]) -> dict[str, Any]:
    runtime_exports: dict[str, Any] = {}
    providers: dict[str, str] = {}
    for module_id, result in sorted(package_results.items()):
        for export_key, export_value in sorted(result.runtime_exports.items()):
            previous_provider = providers.get(export_key)
            if previous_provider is not None:
                raise ValueError(
                    f"runtime export {export_key} declared by both {previous_provider} and {module_id}"
                )
            providers[export_key] = module_id
            runtime_exports[export_key] = export_value
    required_keys = {"frontend_contract", "workbench_contract", "ui_spec", "backend_spec", "derived_copy", "documents"}
    missing = sorted(required_keys - set(runtime_exports))
    if missing:
        raise ValueError(f"runtime exports missing required keys: {', '.join(missing)}")
    return runtime_exports


def collect_validation_reports(project: KnowledgeBaseRuntimeBundle) -> ValidationReports:
    from frontend_kernel import summarize_frontend_rules, validate_frontend_rules
    from knowledge_base_framework import summarize_workbench_rules, validate_workbench_rules

    frontend_results = validate_frontend_rules(project)
    workbench_results = validate_workbench_rules(project)
    return ValidationReports(
        frontend=summarize_frontend_rules(frontend_results),
        knowledge_base=summarize_workbench_rules(workbench_results),
    )


def raise_on_validation_failures(reports: ValidationReports) -> None:
    errors: list[str] = []
    for scope, report in (("frontend", reports.frontend), ("knowledge_base", reports.knowledge_base)):
        if report is None:
            continue
        for item in report.rules:
            if item.passed:
                continue
            reasons = ", ".join(item.reasons) or "unknown rule failure"
            errors.append(f"{scope}.{item.rule_id}: {reasons}")
    if errors:
        raise ValueError("framework rule validation failed: " + " | ".join(errors))


def build_project_config_view(project: KnowledgeBaseRuntimeBundle) -> dict[str, Any]:
    return {
        "project": project.metadata.to_dict(),
        "selection": project.selection.to_dict(),
        "truth": project.config.truth_payload(),
        "refinement": project.refinement.to_dict(),
        "narrative": project.config.narrative,
        "interaction_model": {
            "workspace_flow": project.workbench_contract.get("flow", []),
            "citation_return": project.workbench_contract.get("citation_return_contract", {}),
            "surface_regions": project.frontend_contract.get("surface_regions", []),
            "interaction_actions": project.frontend_contract.get("interaction_actions", []),
        },
    }


def build_public_summary(project: KnowledgeBaseRuntimeBundle) -> dict[str, Any]:
    return {
        "project_file": project.project_file,
        "project": project.metadata.to_dict(),
        "selection": project.selection.to_dict(),
        "route": project.route.to_dict(),
        "a11y": project.a11y.to_dict(),
        "routes": {
            **project.route.to_dict(),
            "pages": project._resolved_page_routes(),
            "api": project._resolved_api_routes(),
        },
        "document_count": len(project.documents),
        "resolved_module_ids": list(project.package_compile_order),
        "package_compile_order": list(project.package_compile_order),
        "ui_spec_summary": {
            "page_ids": list(project.ui_spec.get("pages", {}).keys()),
            "component_ids": list(project.ui_spec.get("components", {}).keys()),
        },
        "backend_spec_summary": {
            "retrieval": project.backend_spec.get("retrieval", {}),
            "answer_policy": {
                "citation_style": project.backend_spec.get("answer_policy", {}).get("citation_style"),
            },
        },
        "validation_reports": project.validation_reports.to_dict(),
        "generated_artifacts": project.generated_artifacts.to_dict() if project.generated_artifacts else None,
    }


def build_runtime_bundle_text(project: KnowledgeBaseRuntimeBundle, canonical_graph: dict[str, Any]) -> str:
    runtime_bundle = project.to_runtime_bundle_dict()
    return "\n".join(
        [
            "from __future__ import annotations",
            "",
            "# GENERATED FILE. DO NOT EDIT.",
            "# Change framework markdown or projects/*/project.toml, then re-materialize.",
            "",
            "import json",
            "",
            f"CANONICAL_GRAPH = json.loads(r'''{json.dumps(canonical_graph, ensure_ascii=False)}''')",
            f"RUNTIME_BUNDLE = json.loads(r'''{json.dumps(runtime_bundle, ensure_ascii=False)}''')",
            "PROJECT_CONFIG = RUNTIME_BUNDLE['project_config']",
            "",
        ]
    )


def build_canonical_graph(
    state: KnowledgeBaseCompilationState,
    project: KnowledgeBaseRuntimeBundle,
) -> dict[str, Any]:
    generated_artifacts = project.generated_artifacts.to_dict() if project.generated_artifacts else None
    return {
        "schema_version": KNOWLEDGE_BASE_CANONICAL_SCHEMA_VERSION,
        "project": project.metadata.to_dict(),
        "layers": {
            "framework": {
                "author_source": "framework/*.md",
                "selection": project.selection.to_dict(),
                "module_tree": {
                    "roots": [item.to_dict() for item in state.module_tree.roots],
                    "modules": [
                        {
                            "module_id": item.module_id,
                            "framework_file": item.path,
                            "title_cn": item.title_cn,
                            "title_en": item.title_en,
                            "intro": item.intro,
                            "upstream_module_ids": list(item.export_surface().upstream_module_ids),
                        }
                        for item in state.module_tree.modules
                    ],
                },
                "registry_binding": [item.to_dict() for item in state.package_registry.iter_registrations()],
            },
            "config": {
                "project_file": project.project_file,
                "section_sources": dict(project.config.section_sources),
                "selection": project.selection.to_dict(),
                "truth": project.config.truth_payload(),
                "refinement": project.refinement.to_dict(),
                "narrative": project.config.narrative,
                "projection": {
                    module_id: {
                        "config_contract": result.config_contract.to_dict(),
                        "config_slice": result.config_slice,
                    }
                    for module_id, result in sorted(state.package_results.items())
                },
            },
            "code": {
                "package_compile_order": [item.module_id for item in state.module_tree.modules],
                "root_packages": dict(project.root_module_ids),
                "package_results": {
                    module_id: result.to_dict()
                    for module_id, result in sorted(state.package_results.items())
                },
                "runtime_exports": project.runtime_exports,
            },
            "evidence": {
                "validation_reports": project.validation_reports.to_dict(),
                "document_digests": {
                    item.document_id: sha256_text(item.body_markdown)
                    for item in project.documents
                },
                "generated_artifacts": generated_artifacts,
                "derived_views": dict(project.derived_views),
            },
        },
    }
