from __future__ import annotations

from importlib import import_module
from typing import Any


_EXPORTS = {
    "DEFAULT_KNOWLEDGE_BASE_PROJECT_FILE": ("project_runtime.pipeline", "DEFAULT_KNOWLEDGE_BASE_PROJECT_FILE"),
    "FrameworkDrivenProjectRecord": ("project_runtime.project_governance", "FrameworkDrivenProjectRecord"),
    "KnowledgeBaseCompilationState": ("project_runtime.knowledge_base", "KnowledgeBaseCompilationState"),
    "KnowledgeBaseRuntimeBundle": ("project_runtime.knowledge_base", "KnowledgeBaseRuntimeBundle"),
    "KnowledgeDocument": ("project_runtime.knowledge_base", "KnowledgeDocument"),
    "KnowledgeDocumentSection": ("project_runtime.knowledge_base", "KnowledgeDocumentSection"),
    "ProjectDiscoveryAuditEntry": ("project_runtime.project_governance", "ProjectDiscoveryAuditEntry"),
    "SeedDocumentSource": ("project_runtime.knowledge_base", "SeedDocumentSource"),
    "build_knowledge_base_runtime_app_from_project_file": (
        "project_runtime.pipeline",
        "build_knowledge_base_runtime_app_from_project_file",
    ),
    "build_project_runtime_app_from_project_file": (
        "project_runtime.pipeline",
        "build_project_runtime_app_from_project_file",
    ),
    "build_project_discovery_audit": ("project_runtime.project_governance", "build_project_discovery_audit"),
    "compile_knowledge_document_source": ("project_runtime.knowledge_base", "compile_knowledge_document_source"),
    "compile_project_runtime_bundle": ("project_runtime.pipeline", "compile_project_runtime_bundle"),
    "discover_framework_driven_projects": ("project_runtime.project_governance", "discover_framework_driven_projects"),
    "load_knowledge_base_runtime_bundle": ("project_runtime.pipeline", "load_knowledge_base_runtime_bundle"),
    "load_project_runtime_bundle": ("project_runtime.pipeline", "load_project_runtime_bundle"),
    "materialize_knowledge_base_runtime_bundle": ("project_runtime.pipeline", "materialize_knowledge_base_runtime_bundle"),
    "materialize_project_runtime_bundle": ("project_runtime.pipeline", "materialize_project_runtime_bundle"),
    "render_project_discovery_audit_markdown": ("project_runtime.project_governance", "render_project_discovery_audit_markdown"),
}

__all__ = sorted(_EXPORTS)


def __getattr__(name: str) -> Any:
    if name not in _EXPORTS:
        raise AttributeError(name)
    module_name, attr_name = _EXPORTS[name]
    module = import_module(module_name)
    value = getattr(module, attr_name)
    globals()[name] = value
    return value
