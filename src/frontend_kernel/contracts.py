from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from project_runtime.knowledge_base import KnowledgeBaseProject


def build_frontend_contract(project: "KnowledgeBaseProject") -> dict[str, Any]:
    interaction_actions = [
        {"action_id": "search_documents", "boundary": "INTERACT"},
        {"action_id": "filter_by_tag", "boundary": "INTERACT"},
        {"action_id": "select_document", "boundary": "INTERACT"},
        {"action_id": "jump_to_section", "boundary": "ROUTE"},
        {"action_id": "submit_chat", "boundary": "INTERACT"},
        {"action_id": "return_from_citation", "boundary": "ROUTE"},
    ]
    if project.library.allow_create:
        interaction_actions.append({"action_id": "create_document", "boundary": "INTERACT"})
    if project.library.allow_delete:
        interaction_actions.append({"action_id": "delete_document", "boundary": "INTERACT"})
    return {
        "module_id": project.frontend_ir.module_id,
        "shell": project.surface.shell,
        "preset": project.framework.preset,
        "layout_variant": project.surface.layout_variant,
        "surface_config": {
            "sidebar_width": project.surface.sidebar_width,
            "preview_mode": project.surface.preview_mode,
            "density": project.surface.density,
        },
        "visual_config": project.visual.to_dict(),
        "surface_composition": {
            "sidebar": ["library"],
            "main": ["chat"],
            "support": ["toc", "preview"],
        },
        "surface_regions": [
            {"region_id": "library", "title": project.copy["library_title"], "boundary": "SURFACE"},
            {"region_id": "preview", "title": project.copy["preview_title"], "boundary": "SURFACE"},
            {"region_id": "toc", "title": project.copy["toc_title"], "boundary": "SURFACE"},
            {"region_id": "chat", "title": project.copy["chat_title"], "boundary": "SURFACE"},
        ],
        "interaction_actions": interaction_actions,
        "state_channels": [
            {"state_id": "current_document", "sticky": project.context.sticky_document},
            {"state_id": "current_section", "sticky": True},
            {"state_id": "empty_state", "title": project.copy["empty_state_title"]},
            {"state_id": "chat_history", "sticky": True},
        ],
        "extend_slots": [
            {"slot_id": "domain_workbench", "module_id": project.domain_ir.module_id},
            {"slot_id": "backend_contract", "module_id": project.backend_ir.module_id},
        ],
        "route_contract": project.route.to_dict(),
        "a11y": project.a11y.to_dict(),
        "component_variants": {
            "library_list": project.library.list_variant,
            "preview_rail": project.preview.rail_variant,
            "chat_bubble": project.chat.bubble_variant,
            "chat_composer": project.chat.composer_variant,
            "citation_card": project.return_config.citation_card_variant,
        },
        "base_ids": [item.base_id for item in project.frontend_ir.bases],
        "rule_ids": [item.rule_id for item in project.frontend_ir.rules],
    }
