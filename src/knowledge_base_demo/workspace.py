from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from framework_core import Base, BoundaryDefinition, BoundaryItem, Capability, VerificationInput, VerificationResult, verify
from project_runtime.knowledge_base import KnowledgeBaseProject, load_knowledge_base_project


def _resolve_project(project: KnowledgeBaseProject | None) -> KnowledgeBaseProject:
    return project or load_knowledge_base_project()


def _module_capabilities(project: KnowledgeBaseProject) -> tuple[Capability, ...]:
    return tuple(Capability(item.capability_id, item.statement) for item in project.domain_ir.capabilities)


def _module_boundary(project: KnowledgeBaseProject) -> BoundaryDefinition:
    return BoundaryDefinition(
        items=tuple(BoundaryItem(item.boundary_id, item.statement) for item in project.domain_ir.boundaries)
    )


def _module_bases(project: KnowledgeBaseProject) -> tuple[Base, ...]:
    return tuple(Base(item.base_id, item.name, item.inline_expr or item.statement) for item in project.domain_ir.bases)


KNOWLEDGE_BASE_WORKSPACE_CAPABILITIES = (
    Capability("C1", "将文件库、预览、TOC 与对话引用收敛为统一工作台场景。"),
    Capability("C2", "统一当前文件、当前章节、引用域与回合上下文的传递结构。"),
    Capability("C3", "支持基于知识库的对话、引用与来源回跳闭环。"),
)

KNOWLEDGE_BASE_WORKSPACE_BOUNDARY = BoundaryDefinition(
    items=(
        BoundaryItem("SURFACE", "文件管理区、文档预览区、目录区与对话区必须同时存在。"),
        BoundaryItem("LIBRARY", "当前文档焦点和查询过滤动作必须统一。"),
        BoundaryItem("PREVIEW", "正文、TOC 与章节锚点切换必须稳定。"),
        BoundaryItem("CHAT", "输入、回合顺序、引用附着与回看路径必须稳定。"),
        BoundaryItem("CONTEXT", "当前文件和当前章节上下文必须显式传递。"),
        BoundaryItem("RETURN", "引用必须返回到文档与章节锚点。"),
    )
)

KNOWLEDGE_BASE_WORKSPACE_BASES = (
    Base("B1", "文件预览场景基", "library + preview + toc chain"),
    Base("B2", "对话引用场景基", "chat turns + citations + return paths"),
    Base("B3", "工作台闭环场景基", "library -> preview -> chat context loop"),
)


@dataclass(frozen=True)
class WorkspaceScenario:
    scene_id: str
    title: str
    steps: tuple[str, ...]
    entry_path: str
    return_path: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def compose_workspace_flow(project: KnowledgeBaseProject | None = None) -> tuple[WorkspaceScenario, ...]:
    resolved = _resolve_project(project)
    return (
        WorkspaceScenario(
            scene_id="library",
            title="Library Focus",
            steps=("open workbench", "add or scan document cards", "select current document"),
            entry_path=resolved.route.workbench,
            return_path=resolved.route.workbench,
        ),
        WorkspaceScenario(
            scene_id="preview",
            title="Preview Focus",
            steps=("open selected document", "scan toc", "jump to section anchor"),
            entry_path=f"{resolved.route.workbench}?document={resolved.documents[0].document_id}",
            return_path=resolved.route.workbench,
        ),
        WorkspaceScenario(
            scene_id="chat",
            title="Chat With Citation",
            steps=("ask question", "inspect citations", "jump back to cited anchor"),
            entry_path=(
                f"{resolved.route.workbench}?document={resolved.documents[0].document_id}"
                f"&section={resolved.documents[0].sections[1].section_id}"
            ),
            return_path=resolved.route.workbench,
        ),
    )


def verify_workspace_flow(project: KnowledgeBaseProject | None = None) -> VerificationResult:
    resolved = _resolve_project(project)
    boundary = _module_boundary(resolved)
    boundary_valid, boundary_errors = boundary.validate()
    result = verify(
        VerificationInput(
            subject="knowledge base workbench flow",
            pass_criteria=[
                "library, preview, toc, and chat regions all exist",
                "the current document and current section stay explicit across preview and chat",
                "citations expose return paths back to preview anchors",
            ],
            evidence={
                "project": resolved.public_summary(),
                "capabilities": [item.to_dict() for item in _module_capabilities(resolved)],
                "boundary": boundary.to_dict(),
                "bases": [item.to_dict() for item in _module_bases(resolved)],
                "workbench_contract": resolved.workbench_contract,
                "workspace_flow": [item.to_dict() for item in compose_workspace_flow(resolved)],
                "rule_validation": resolved.validation_reports.get("knowledge_base", {}),
            },
        )
    )
    return VerificationResult(
        passed=boundary_valid and result.passed,
        reasons=[*boundary_errors, *result.reasons],
        evidence=result.evidence,
    )
