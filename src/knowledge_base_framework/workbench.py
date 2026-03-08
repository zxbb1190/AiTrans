from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from project_runtime.knowledge_base import KnowledgeBaseProject


def build_workbench_contract(project: "KnowledgeBaseProject") -> dict[str, Any]:
    library_actions = ["search", "focus", "select"]
    if project.library.allow_create:
        library_actions.append("create_document")
    if project.library.allow_delete:
        library_actions.append("delete_document")
    return {
        "module_id": project.domain_ir.module_id,
        "layout_variant": project.surface.layout_variant,
        "regions": ["library", "preview", "toc", "chat"],
        "surface": {
            "sidebar_width": project.surface.sidebar_width,
            "preview_mode": project.surface.preview_mode,
            "density": project.surface.density,
        },
        "library": {
            **project.library.to_dict(),
            "actions": library_actions,
        },
        "preview": project.preview.to_dict(),
        "chat": project.chat.to_dict(),
        "context": project.context.to_dict(),
        "return": project.return_config.to_dict(),
        "flow": [
            {
                "stage_id": "library",
                "depends_on": [],
                "produces": ["document_id", "tag_filter"],
            },
            {
                "stage_id": "preview",
                "depends_on": ["document_id"],
                "produces": ["section_id", "anchor"],
            },
            {
                "stage_id": "chat",
                "depends_on": ["document_id", "section_id"],
                "produces": ["answer", "citations", "return_path"],
            },
        ],
        "citation_return_contract": {
            "query_keys": ["document", "section"],
            "targets": list(project.return_config.targets),
            "anchor_restore": project.return_config.anchor_restore,
        },
        "documents": [
            {
                "document_id": item.document_id,
                "title": item.title,
                "section_ids": [section.section_id for section in item.sections],
                "section_count": len(item.sections),
            }
            for item in project.documents
        ],
        "base_ids": [item.base_id for item in project.domain_ir.bases],
        "rule_ids": [item.rule_id for item in project.domain_ir.rules],
    }
