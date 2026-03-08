from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import HTMLResponse

from knowledge_base_demo.backend import build_knowledge_base_router, verify_knowledge_base_backend
from knowledge_base_demo.frontend import compose_knowledge_base_page, verify_knowledge_base_frontend
from knowledge_base_demo.workspace import compose_workspace_flow, verify_workspace_flow
from project_runtime.knowledge_base import (
    KnowledgeBaseProject,
    load_knowledge_base_project,
    materialize_knowledge_base_project,
)


def build_knowledge_base_demo_app(project: KnowledgeBaseProject | None = None) -> FastAPI:
    resolved = project or materialize_knowledge_base_project()
    app = FastAPI(
        title=resolved.metadata.display_name,
        summary=resolved.metadata.description,
        version=resolved.metadata.version,
    )
    app.include_router(build_knowledge_base_router(resolved))

    @app.get(resolved.route.home, include_in_schema=False)
    def root() -> dict[str, object]:
        return {
            "project": resolved.public_summary(),
            "frontend": resolved.route.workbench,
            "workbench_spec": resolved.route.workbench_spec,
        }

    @app.get(resolved.route.workbench, response_class=HTMLResponse, include_in_schema=False)
    def knowledge_base_page() -> str:
        return compose_knowledge_base_page(resolved)

    @app.get(resolved.route.workbench_spec)
    def workbench_spec() -> dict[str, object]:
        return {
            "project": resolved.to_spec_dict(),
            "workspace_flow": [item.to_dict() for item in compose_workspace_flow(resolved)],
            "frontend_verification": verify_knowledge_base_frontend(resolved).to_dict(),
            "workspace_verification": verify_workspace_flow(resolved).to_dict(),
            "backend_verification": verify_knowledge_base_backend(resolved).to_dict(),
        }

    return app


app = build_knowledge_base_demo_app()
