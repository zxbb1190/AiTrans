from __future__ import annotations

from html import escape
import json
from typing import TYPE_CHECKING

from framework_core import Base, BoundaryDefinition, BoundaryItem, Capability, VerificationInput, VerificationResult, verify
from project_runtime.knowledge_base import KnowledgeBaseProject, KnowledgeDocument, load_knowledge_base_project

if TYPE_CHECKING:
    from knowledge_base_demo.backend import KnowledgeBaseDetailResponse, KnowledgeRepository


def _resolve_project(project: KnowledgeBaseProject | None) -> KnowledgeBaseProject:
    return project or load_knowledge_base_project()


def _module_capabilities(project: KnowledgeBaseProject) -> tuple[Capability, ...]:
    return tuple(Capability(item.capability_id, item.statement) for item in project.frontend_ir.capabilities)


def _module_boundary(project: KnowledgeBaseProject) -> BoundaryDefinition:
    return BoundaryDefinition(
        items=tuple(BoundaryItem(item.boundary_id, item.statement) for item in project.frontend_ir.boundaries)
    )


def _module_bases(project: KnowledgeBaseProject) -> tuple[Base, ...]:
    return tuple(Base(item.base_id, item.name, item.inline_expr or item.statement) for item in project.frontend_ir.bases)


KNOWLEDGE_BASE_FRONTEND_CAPABILITIES = (
    Capability("C1", "把会话侧栏、消息流、输入器和引用抽屉装配为稳定知识问答客户端。"),
    Capability("C2", "以统一前端结构承接聊天、知识库切换、来源抽屉和文档详情页。"),
    Capability("C3", "为知识库领域输出 ChatGPT 风格但可追溯来源的稳定承载面。"),
)

KNOWLEDGE_BASE_FRONTEND_BOUNDARY = BoundaryDefinition(
    items=(
        BoundaryItem("SURFACE", "会话侧栏、聊天主区、引用抽屉和辅助页面职责必须明确。"),
        BoundaryItem("INTERACT", "新建会话、切换知识库、提问、打开引用和进入文档详情动作必须稳定。"),
        BoundaryItem("STATE", "当前会话、当前知识库、当前文档、当前章节和抽屉状态必须显式可见。"),
        BoundaryItem("EXTEND", "领域工作台和后端契约只能通过固定槽位接入。"),
        BoundaryItem("ROUTE", "聊天页、知识库页、文档详情页和来源返回路径必须可承接。"),
        BoundaryItem("A11Y", "阅读顺序、键盘路径和抽屉焦点切换必须稳定。"),
    )
)

KNOWLEDGE_BASE_FRONTEND_BASES = (
    Base("B1", "聊天界面装配基", "conversation sidebar / chat main / composer assembly"),
    Base("B2", "引用交互契约基", "inline refs / citation drawer / document detail routing"),
    Base("B3", "领域承接基", "knowledge base selector / secondary pages / backend extension slots"),
)


def verify_knowledge_base_frontend(project: KnowledgeBaseProject | None = None) -> VerificationResult:
    resolved = _resolve_project(project)
    boundary = _module_boundary(resolved)
    boundary_valid, boundary_errors = boundary.validate()
    result = verify(
        VerificationInput(
            subject="knowledge base frontend",
            pass_criteria=[
                "conversation sidebar, chat main, and citation drawer all exist in one chat shell",
                "knowledge base switch, inline citations, and document detail routing stay explicit in the page contract",
                "theme tokens and route contracts are compiled from one instance config",
            ],
            evidence={
                "project": resolved.public_summary(),
                "capabilities": [item.to_dict() for item in _module_capabilities(resolved)],
                "boundary": boundary.to_dict(),
                "bases": [item.to_dict() for item in _module_bases(resolved)],
                "frontend_contract": resolved.frontend_contract,
                "ui_spec": resolved.ui_spec,
                "rule_validation": resolved.validation_reports.get("frontend", {}),
            },
        )
    )
    return VerificationResult(
        passed=boundary_valid and result.passed,
        reasons=[*boundary_errors, *result.reasons],
        evidence=result.evidence,
    )


def _shared_style(project: KnowledgeBaseProject) -> str:
    visual = project.ui_spec["visual"]["tokens"]
    style = """
    :root {
      --bg: __BG__;
      --panel: __PANEL__;
      --panel-soft: __PANEL_SOFT__;
      --ink: __INK__;
      --muted: __MUTED__;
      --accent: __ACCENT__;
      --accent-soft: __ACCENT_SOFT__;
      --line: __LINE__;
      --radius: __RADIUS__;
      --shadow: __SHADOW__;
      --font-body: __FONT_BODY__;
      --font-title: __FONT_TITLE__;
      --font-hero: __FONT_HERO__;
      --sidebar-width: __SIDEBAR_WIDTH__;
      --drawer-width: __DRAWER_WIDTH__;
      --message-width: __MESSAGE_WIDTH__;
      --shell-gap: __SHELL_GAP__;
      --shell-padding: __SHELL_PADDING__;
      --panel-gap: __PANEL_GAP__;
      --sidebar-bg: #111827;
      --sidebar-ink: #f8fafc;
      --sidebar-muted: rgba(248, 250, 252, 0.68);
      --danger: #b42318;
      --success: #0f766e;
    }

    * { box-sizing: border-box; }

    html, body { margin: 0; }

    body {
      min-height: 100vh;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      font-size: var(--font-body);
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(37, 99, 235, 0.12), transparent 26%),
        radial-gradient(circle at bottom right, rgba(15, 118, 110, 0.08), transparent 20%),
        var(--bg);
    }

    button, input, textarea, select { font: inherit; }
    button { cursor: pointer; }
    a { color: inherit; text-decoration: none; }

    .chat-shell {
      min-height: 100vh;
      display: grid;
      grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
    }

    .conversation-sidebar {
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent 24%),
        var(--sidebar-bg);
      color: var(--sidebar-ink);
      padding: 22px 18px;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      gap: 18px;
      border-right: 1px solid rgba(255, 255, 255, 0.06);
    }

    .sidebar-brand {
      display: grid;
      gap: 10px;
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--sidebar-muted);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-size: 0.72rem;
    }

    .sidebar-brand h1,
    .aux-sidebar h1 {
      margin: 0;
      font-size: var(--font-hero);
      line-height: 1.08;
      overflow-wrap: anywhere;
    }

    .sidebar-brand p,
    .aux-sidebar p {
      margin: 0;
      color: var(--sidebar-muted);
      line-height: 1.58;
    }

    .sidebar-primary-btn,
    .primary-btn {
      border: 0;
      border-radius: 18px;
      padding: 12px 14px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--sidebar-ink);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .sidebar-primary-btn {
      width: 100%;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .primary-btn {
      background: var(--accent);
      color: white;
    }

    .ghost-btn,
    .ghost-link,
    .secondary-link {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 10px 14px;
      background: rgba(255, 255, 255, 0.82);
      color: var(--ink);
    }

    .ghost-link,
    .secondary-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .sidebar-section {
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 12px;
    }

    .sidebar-label {
      font-size: 0.76rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--sidebar-muted);
    }

    .conversation-groups {
      min-height: 0;
      overflow: auto;
      padding-right: 4px;
      display: grid;
      gap: 18px;
    }

    .conversation-group {
      display: grid;
      gap: 10px;
    }

    .conversation-group-title {
      color: var(--sidebar-muted);
      font-size: 0.78rem;
    }

    .conversation-item {
      width: 100%;
      border: 0;
      text-align: left;
      padding: 11px 12px;
      border-radius: 16px;
      background: transparent;
      color: var(--sidebar-ink);
      display: grid;
      gap: 4px;
    }

    .conversation-item:hover,
    .conversation-item.active {
      background: rgba(255, 255, 255, 0.08);
    }

    .conversation-title {
      font-weight: 600;
      line-height: 1.4;
    }

    .conversation-meta {
      font-size: 0.82rem;
      color: var(--sidebar-muted);
    }

    .sidebar-footer {
      display: grid;
      gap: 10px;
    }

    .sidebar-footer .secondary-link {
      border-color: rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.04);
      color: var(--sidebar-ink);
    }

    .chat-main {
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
    }

    .chat-header,
    .aux-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 28px;
      border-bottom: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.76);
      backdrop-filter: blur(14px);
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .header-copy {
      display: grid;
      gap: 4px;
    }

    .header-title {
      margin: 0;
      font-size: 1.02rem;
      font-weight: 700;
    }

    .header-subtitle {
      color: var(--muted);
      font-size: 0.9rem;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .pill-button,
    .kb-pill,
    .source-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.9);
      color: var(--ink);
    }

    .chat-content {
      min-height: 0;
      overflow: auto;
      padding: 28px 28px 24px;
    }

    .chat-stream {
      width: min(100%, calc(var(--message-width) + 80px));
      margin: 0 auto;
      display: grid;
      gap: 24px;
    }

    .welcome-state {
      min-height: calc(100vh - 280px);
      display: grid;
      place-items: center;
      padding: 20px 0 8px;
    }

    .welcome-card {
      width: min(100%, 760px);
      display: grid;
      gap: 18px;
      text-align: center;
    }

    .welcome-card h2 {
      margin: 0;
      font-size: clamp(2rem, 4vw, 2.8rem);
      line-height: 1.05;
    }

    .welcome-card p {
      margin: 0;
      color: var(--muted);
      line-height: 1.7;
    }

    .prompt-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }

    .prompt-chip {
      border: 1px solid var(--line);
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.86);
      padding: 14px 16px;
      text-align: left;
      line-height: 1.55;
      color: var(--ink);
    }

    .message-list {
      display: grid;
      gap: 24px;
      padding-bottom: 16px;
    }

    .message-row {
      display: grid;
      gap: 10px;
    }

    .message-card {
      width: min(100%, var(--message-width));
      margin: 0 auto;
      display: grid;
      gap: 10px;
      padding: 0 8px;
    }

    .message-card.user {
      justify-items: end;
    }

    .message-card.user .message-bubble {
      max-width: 86%;
      background: #eceff4;
      border-radius: 24px;
      padding: 14px 18px;
      border: 1px solid rgba(17, 24, 39, 0.06);
    }

    .message-role {
      font-size: 0.74rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }

    .message-content {
      line-height: 1.8;
      color: var(--ink);
    }

    .message-content p {
      margin: 0 0 14px;
    }

    .message-content p:last-child {
      margin-bottom: 0;
    }

    .assistant-body {
      display: grid;
      gap: 12px;
    }

    .inline-ref {
      border: 0;
      background: transparent;
      color: var(--accent);
      padding: 0 2px;
      font-weight: 700;
    }

    .inline-ref:hover {
      text-decoration: underline;
    }

    .message-actions,
    .citation-summary {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .message-action {
      border: 0;
      background: transparent;
      color: var(--muted);
      padding: 0;
    }

    .summary-label {
      color: var(--muted);
      font-size: 0.9rem;
    }

    .citation-chip {
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.9);
      border-radius: 999px;
      padding: 8px 12px;
      color: var(--ink);
    }

    .assistant-loading {
      color: var(--muted);
      font-style: italic;
    }

    .chat-composer-wrap {
      padding: 0 28px 24px;
      background: linear-gradient(180deg, rgba(244, 247, 251, 0.0), rgba(244, 247, 251, 0.92) 18%, rgba(244, 247, 251, 0.96));
    }

    .chat-composer {
      width: min(100%, 920px);
      margin: 0 auto;
      display: grid;
      gap: 12px;
      padding: 16px;
      border-radius: 28px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.92);
      box-shadow: var(--shadow);
      backdrop-filter: blur(16px);
    }

    .composer-status {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      color: var(--muted);
      font-size: 0.92rem;
    }

    .composer-input {
      width: 100%;
      border: 0;
      background: transparent;
      resize: none;
      min-height: 88px;
      color: var(--ink);
      outline: none;
      line-height: 1.7;
    }

    .composer-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    .composer-actions .left {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
    }

    .citation-drawer {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: min(100vw, var(--drawer-width));
      background: rgba(255, 255, 255, 0.97);
      box-shadow: -12px 0 40px rgba(15, 23, 42, 0.16);
      border-left: 1px solid var(--line);
      z-index: 40;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      transform: translateX(0);
      transition: transform 160ms ease;
    }

    .citation-drawer.hidden {
      transform: translateX(100%);
    }

    .drawer-backdrop,
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.36);
      z-index: 30;
    }

    .drawer-backdrop.hidden,
    .dialog-backdrop.hidden {
      display: none;
    }

    .drawer-head,
    .dialog-head {
      padding: 20px 22px 16px;
      border-bottom: 1px solid var(--line);
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }

    .drawer-head h2,
    .dialog-head h2,
    .page-card h2,
    .document-header h2 {
      margin: 0;
      font-size: 1rem;
    }

    .drawer-subtitle,
    .dialog-head p,
    .page-note {
      color: var(--muted);
      line-height: 1.6;
      margin: 6px 0 0;
    }

    .drawer-close {
      border: 0;
      background: transparent;
      font-size: 1.3rem;
      color: var(--muted);
    }

    .drawer-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 14px 22px 0;
    }

    .drawer-tab {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.92);
      color: var(--muted);
    }

    .drawer-tab.active {
      color: var(--accent);
      border-color: rgba(37, 99, 235, 0.28);
      background: rgba(37, 99, 235, 0.08);
    }

    .drawer-content {
      overflow: auto;
      padding: 18px 22px 22px;
      display: grid;
      gap: 16px;
    }

    .drawer-card,
    .page-card,
    .document-section {
      border: 1px solid var(--line);
      border-radius: 22px;
      background: rgba(255, 255, 255, 0.9);
      padding: 18px;
    }

    .drawer-card h3,
    .document-section h3 {
      margin: 0 0 10px;
      font-size: 1rem;
    }

    .drawer-card p,
    .document-section p,
    .document-section li,
    .page-card p,
    .page-card li {
      line-height: 1.7;
      color: var(--ink);
    }

    .drawer-actions {
      padding: 0 22px 22px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .dialog-shell {
      min-height: 100%;
      display: grid;
      place-items: center;
      padding: 24px;
    }

    .dialog-panel {
      width: min(100%, 720px);
      background: rgba(255, 255, 255, 0.98);
      border-radius: 28px;
      border: 1px solid var(--line);
      box-shadow: 0 24px 64px rgba(15, 23, 42, 0.22);
      overflow: hidden;
    }

    .dialog-body {
      padding: 20px 22px 22px;
      display: grid;
      gap: 14px;
    }

    .kb-list,
    .page-grid {
      display: grid;
      gap: 14px;
    }

    .kb-card,
    .doc-card {
      border: 1px solid var(--line);
      border-radius: 22px;
      padding: 18px;
      background: rgba(255, 255, 255, 0.92);
      display: grid;
      gap: 10px;
    }

    .kb-card.active {
      border-color: rgba(37, 99, 235, 0.28);
      box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.14);
    }

    .kb-card h3,
    .doc-card h3,
    .page-card h3 {
      margin: 0;
      font-size: 1rem;
    }

    .card-meta,
    .chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .chip,
    .meta-chip {
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 999px;
      background: var(--panel-soft);
      color: var(--muted);
      font-size: 0.82rem;
    }

    .aux-shell {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr);
    }

    .aux-sidebar {
      padding: 24px 18px;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      gap: 18px;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent 24%),
        var(--sidebar-bg);
      color: var(--sidebar-ink);
    }

    .aux-nav {
      display: grid;
      gap: 10px;
      align-content: start;
    }

    .aux-nav a {
      display: block;
      padding: 12px 14px;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.04);
      color: var(--sidebar-ink);
    }

    .aux-nav a.active,
    .aux-nav a:hover {
      background: rgba(255, 255, 255, 0.10);
    }

    .aux-main {
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
    }

    .aux-content {
      padding: 28px;
      display: grid;
      gap: 18px;
      align-content: start;
    }

    .document-header {
      display: grid;
      gap: 10px;
      padding: 22px;
      border-radius: 28px;
      background: rgba(255, 255, 255, 0.88);
      border: 1px solid var(--line);
    }

    .document-section.active {
      border-color: rgba(37, 99, 235, 0.3);
      box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.12);
    }

    .stack {
      display: grid;
      gap: 16px;
    }

    @media (max-width: 980px) {
      .chat-shell,
      .aux-shell {
        grid-template-columns: 1fr;
      }

      .conversation-sidebar,
      .aux-sidebar {
        min-height: auto;
      }

      .citation-drawer {
        width: 100vw;
      }

      .chat-header,
      .aux-header,
      .chat-content,
      .chat-composer-wrap,
      .aux-content {
        padding-left: 18px;
        padding-right: 18px;
      }

      .welcome-state {
        min-height: auto;
      }
    }
    """
    replacements = {
        "__BG__": visual["bg"],
        "__PANEL__": visual["panel"],
        "__PANEL_SOFT__": visual["panel_soft"],
        "__INK__": visual["ink"],
        "__MUTED__": visual["muted"],
        "__ACCENT__": visual["accent"],
        "__ACCENT_SOFT__": visual["accent_soft"],
        "__LINE__": visual["line"],
        "__RADIUS__": visual["radius"],
        "__SHADOW__": visual["shadow"],
        "__FONT_BODY__": visual["font_body"],
        "__FONT_TITLE__": visual["font_title"],
        "__FONT_HERO__": visual["font_hero"],
        "__SIDEBAR_WIDTH__": visual["sidebar_width"],
        "__DRAWER_WIDTH__": visual["drawer_width"],
        "__MESSAGE_WIDTH__": visual["message_width"],
        "__SHELL_GAP__": visual["shell_gap"],
        "__SHELL_PADDING__": visual["shell_padding"],
        "__PANEL_GAP__": visual["panel_gap"],
    }
    for key, value in replacements.items():
        style = style.replace(key, value)
    return style


def _aux_sidebar(project: KnowledgeBaseProject, active: str) -> str:
    ui_spec = project.ui_spec
    aux_sidebar = ui_spec["components"]["aux_sidebar"]
    knowledge_detail_href = ui_spec["pages"]["knowledge_detail"]["path"].replace(
        "{knowledge_base_id}", project.library.knowledge_base_id
    )
    items = (
        ("chat", ui_spec["pages"]["chat_home"]["path"], aux_sidebar["nav"]["chat"]),
        ("knowledge-list", ui_spec["pages"]["knowledge_list"]["path"], aux_sidebar["nav"]["knowledge_list"]),
        ("knowledge-detail", knowledge_detail_href, aux_sidebar["nav"]["knowledge_detail"]),
    )
    links = []
    for key, href, label in items:
        class_name = "active" if key == active else ""
        links.append(f'<a class="{class_name}" href="{escape(href)}">{escape(label)}</a>')
    return f"""
    <aside class="aux-sidebar">
      <div>
        <span class="eyebrow">{escape(project.copy["hero_kicker"])}</span>
        <h1>{escape(project.metadata.display_name)}</h1>
        <p>{escape(project.library.knowledge_base_description)}</p>
      </div>
      <nav class="aux-nav">
        {''.join(links)}
      </nav>
      <div class="page-note">{escape(aux_sidebar["note"])}</div>
    </aside>
    """


def _render_page(title: str, style: str, body: str) -> str:
    return f"""
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{escape(title)}</title>
    <style>{style}</style>
  </head>
  <body>
    {body}
  </body>
</html>
"""


def compose_knowledge_base_list_page(project: KnowledgeBaseProject, repository: "KnowledgeRepository") -> str:
    style = _shared_style(project)
    ui_spec = project.ui_spec
    page_spec = ui_spec["pages"]["knowledge_list"]
    knowledge_bases = repository.list_knowledge_bases()
    cards = []
    for item in knowledge_bases:
        detail_href = ui_spec["pages"]["knowledge_detail"]["path"].replace("{knowledge_base_id}", item.knowledge_base_id)
        cards.append(
            f"""
            <article class="kb-card">
              <h3>{escape(item.name)}</h3>
              <p>{escape(item.description)}</p>
              <div class="card-meta">
                <span class="meta-chip">{item.document_count} documents</span>
                <span class="meta-chip">{escape(item.updated_at)}</span>
              </div>
              <div class="card-meta">
                <a class="ghost-link" href="{escape(ui_spec['pages']['chat_home']['path'])}">{escape(page_spec['chat_action_label'])}</a>
                <a class="ghost-link" href="{escape(detail_href)}">{escape(page_spec['detail_action_label'])}</a>
              </div>
            </article>
            """
        )
    body = f"""
    <div class="aux-shell">
      {_aux_sidebar(project, "knowledge-list")}
      <main class="aux-main">
        <header class="aux-header">
          <div class="header-copy">
            <div class="header-title">{escape(page_spec['title'])}</div>
            <div class="header-subtitle">{escape(page_spec['subtitle'])}</div>
          </div>
          <div class="header-actions">
            <a class="ghost-link" href="{escape(ui_spec['pages']['chat_home']['path'])}">{escape(page_spec['primary_action_label'])}</a>
          </div>
        </header>
        <section class="aux-content">
          <div class="page-card">
            <h2>{escape(page_spec['rationale_title'])}</h2>
            <p>{escape(page_spec['rationale_copy'])}</p>
          </div>
          <div class="page-grid">
            {''.join(cards)}
          </div>
        </section>
      </main>
    </div>
    """
    return _render_page("Knowledge Bases", style, body)


def compose_knowledge_base_detail_page(project: KnowledgeBaseProject, knowledge_base: "KnowledgeBaseDetailResponse") -> str:
    style = _shared_style(project)
    ui_spec = project.ui_spec
    page_spec = ui_spec["pages"]["knowledge_detail"]
    cards = []
    for document in knowledge_base.documents:
        detail_href = ui_spec["pages"]["document_detail"]["path"].replace("{document_id}", document.document_id)
        cards.append(
            f"""
            <article class="doc-card">
              <h3>{escape(document.title)}</h3>
              <p>{escape(document.summary)}</p>
              <div class="chip-row">
                {''.join(f'<span class="chip">{escape(tag)}</span>' for tag in document.tags)}
                <span class="chip">{escape(document.updated_at)}</span>
                <span class="chip">{document.section_count} sections</span>
              </div>
              <div class="card-meta">
                <a class="ghost-link" href="{escape(ui_spec['pages']['chat_home']['path'])}?document={escape(document.document_id)}">{escape(page_spec['return_chat_with_document_label'])}</a>
                <a class="ghost-link" href="{escape(detail_href)}">{escape(page_spec['document_detail_action_label'])}</a>
              </div>
            </article>
            """
        )
    body = f"""
    <div class="aux-shell">
      {_aux_sidebar(project, "knowledge-detail")}
      <main class="aux-main">
        <header class="aux-header">
          <div class="header-copy">
            <div class="header-title">{escape(knowledge_base.name)}</div>
            <div class="header-subtitle">{escape(knowledge_base.description)}</div>
          </div>
          <div class="header-actions">
            <a class="ghost-link" href="{escape(ui_spec['pages']['chat_home']['path'])}">{escape(page_spec['chat_action_label'])}</a>
          </div>
        </header>
        <section class="aux-content">
          <div class="page-card">
            <h2>{escape(page_spec['overview_title'])}</h2>
            <div class="chip-row">
              <span class="chip">{knowledge_base.document_count} documents</span>
              <span class="chip">{escape(knowledge_base.updated_at)}</span>
              {''.join(f'<span class="chip">{escape(item)}</span>' for item in knowledge_base.source_types)}
            </div>
          </div>
          <div class="stack">
            {''.join(cards)}
          </div>
        </section>
      </main>
    </div>
    """
    return _render_page(knowledge_base.name, style, body)


def compose_document_detail_page(
    project: KnowledgeBaseProject,
    document: KnowledgeDocument,
    active_section_id: str | None = None,
) -> str:
    style = _shared_style(project)
    ui_spec = project.ui_spec
    page_spec = ui_spec["pages"]["document_detail"]
    sections = []
    for section in document.sections:
        class_name = "document-section active" if section.section_id == active_section_id else "document-section"
        sections.append(
            f"""
            <section id="{escape(section.section_id)}" class="{class_name}">
              <h3>{escape(section.title)}</h3>
              {section.html}
            </section>
            """
        )
    body = f"""
    <div class="aux-shell">
      {_aux_sidebar(project, "knowledge-detail")}
      <main class="aux-main">
        <header class="aux-header">
          <div class="header-copy">
            <div class="header-title">{escape(page_spec['title'])}</div>
            <div class="header-subtitle">{escape(page_spec['subtitle'])}</div>
          </div>
          <div class="header-actions">
            <a class="ghost-link" href="{escape(ui_spec['pages']['chat_home']['path'])}?document={escape(document.document_id)}">{escape(page_spec['return_chat_label'])}</a>
            <a class="ghost-link" href="{escape(ui_spec['pages']['knowledge_detail']['path'].replace('{knowledge_base_id}', project.library.knowledge_base_id))}">{escape(page_spec['return_knowledge_detail_label'])}</a>
          </div>
        </header>
        <section class="aux-content">
          <article class="document-header">
            <h2>{escape(document.title)}</h2>
            <p>{escape(document.summary)}</p>
            <div class="chip-row">
              {''.join(f'<span class="chip">{escape(tag)}</span>' for tag in document.tags)}
              <span class="chip">{escape(document.updated_at)}</span>
            </div>
          </article>
          <div class="stack">
            {''.join(sections)}
          </div>
        </section>
      </main>
    </div>
    """
    return _render_page(document.title, style, body)


def _chat_script(project: KnowledgeBaseProject) -> str:
    spec_json = json.dumps(project.to_spec_dict(), ensure_ascii=False)
    script = """
    <script>
      const projectSpec = __PROJECT_SPEC__;
      const uiSpec = projectSpec.ui_spec;
      const backendSpec = projectSpec.backend_spec;
      const messageStreamSpec = uiSpec.components.message_stream;
      const composerSpec = uiSpec.components.chat_composer;
      const drawerSpec = uiSpec.components.citation_drawer;
      const switchDialogSpec = uiSpec.components.knowledge_switch_dialog;
      const conversationSpec = uiSpec.conversation;
      const storageKey = `archsync-kb-conversations:${projectSpec.project.project_id}`;
      const state = {
        knowledgeBases: [],
        documents: [],
        conversations: [],
        activeConversationId: "",
        currentKnowledgeBaseId: backendSpec.knowledge_base.knowledge_base_id,
        contextDocumentId: "",
        contextSectionId: "",
        drawerOpen: false,
        activeCitations: [],
        activeCitationIndex: 0,
        drawerSectionHtml: "",
        drawerSnippet: "",
        drawerDocumentPath: ""
      };

      const elements = {
        groups: document.getElementById("conversation-groups"),
        newChat: document.getElementById("new-chat"),
        knowledgeSwitchButtons: Array.from(document.querySelectorAll("[data-open-knowledge-switch]")),
        welcomeState: document.getElementById("welcome-state"),
        messageList: document.getElementById("message-list"),
        composer: document.getElementById("chat-form"),
        composerInput: document.getElementById("chat-input"),
        composerContext: document.getElementById("composer-context"),
        knowledgeBadge: document.getElementById("knowledge-badge"),
        knowledgeBadgeSecondary: document.getElementById("knowledge-badge-secondary"),
        headerTitle: document.getElementById("active-conversation-title"),
        headerSubtitle: document.getElementById("active-conversation-subtitle"),
        drawer: document.getElementById("citation-drawer"),
        drawerBackdrop: document.getElementById("drawer-backdrop"),
        drawerClose: document.getElementById("citation-drawer-close"),
        drawerTabs: document.getElementById("drawer-tabs"),
        drawerMeta: document.getElementById("drawer-meta"),
        drawerSnippet: document.getElementById("drawer-snippet"),
        drawerSection: document.getElementById("drawer-section"),
        drawerDocumentLink: document.getElementById("drawer-document-link"),
        knowledgeDialogBackdrop: document.getElementById("knowledge-dialog-backdrop"),
        knowledgeDialogClose: document.getElementById("knowledge-dialog-close"),
        knowledgeDialogList: document.getElementById("knowledge-dialog-list"),
        promptGrid: document.getElementById("prompt-grid")
      };

      function escapeHtml(value) {
        return String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      function conversationId() {
        if (window.crypto && "randomUUID" in window.crypto) {
          return window.crypto.randomUUID();
        }
        return `conv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      }

      function parseDateGroup(iso) {
        const updated = new Date(iso);
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const diff = startOfToday.getTime() - new Date(updated.getFullYear(), updated.getMonth(), updated.getDate()).getTime();
        const days = Math.floor(diff / 86400000);
        if (days <= 0) return conversationSpec.relative_groups.today;
        if (days < 7) return conversationSpec.relative_groups.last_7_days;
        if (days < 30) return conversationSpec.relative_groups.last_30_days;
        return conversationSpec.relative_groups.older;
      }

      function persistConversations() {
        window.localStorage.setItem(storageKey, JSON.stringify(state.conversations));
      }

      function getActiveConversation() {
        return state.conversations.find((item) => item.id === state.activeConversationId) || null;
      }

      function saveActiveConversation(conversation) {
        state.conversations = state.conversations.map((item) => (item.id === conversation.id ? conversation : item));
        state.conversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        persistConversations();
      }

      function createConversation(seedMessage = "") {
        const conversation = {
          id: conversationId(),
          title: conversationSpec.default_title,
          knowledgeBaseId: state.currentKnowledgeBaseId,
          updatedAt: new Date().toISOString(),
          messages: []
        };
        state.conversations.unshift(conversation);
        state.activeConversationId = conversation.id;
        persistConversations();
        renderConversationGroups();
        renderActiveConversation();
        if (seedMessage) {
          elements.composerInput.value = seedMessage;
          submitChat(seedMessage);
        }
      }

      function ensureConversationState() {
        try {
          const stored = window.localStorage.getItem(storageKey);
          state.conversations = stored ? JSON.parse(stored) : [];
        } catch (error) {
          state.conversations = [];
        }
        if (!Array.isArray(state.conversations) || state.conversations.length === 0) {
          createConversation();
          return;
        }
        state.activeConversationId = state.conversations[0].id;
      }

      function renderPromptGrid() {
        elements.promptGrid.innerHTML = "";
        for (const prompt of uiSpec.conversation.welcome_prompts) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "prompt-chip";
          button.textContent = prompt;
          button.addEventListener("click", () => {
            elements.composerInput.value = prompt;
            elements.composerInput.focus();
          });
          elements.promptGrid.appendChild(button);
        }
      }

      function renderConversationGroups() {
        elements.groups.innerHTML = "";
        const grouped = new Map();
        for (const conversation of state.conversations) {
          const key = parseDateGroup(conversation.updatedAt);
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key).push(conversation);
        }
        for (const [groupTitle, items] of grouped.entries()) {
          const section = document.createElement("section");
          section.className = "conversation-group";
          section.innerHTML = `<div class="conversation-group-title">${escapeHtml(groupTitle)}</div>`;
          for (const item of items) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "conversation-item" + (item.id === state.activeConversationId ? " active" : "");
            button.id = "conversation-item";
            button.innerHTML = `
              <div class="conversation-title">${escapeHtml(item.title)}</div>
              <div class="conversation-meta">${escapeHtml(new Date(item.updatedAt).toLocaleString("zh-CN"))}</div>
            `;
            button.addEventListener("click", () => {
              state.activeConversationId = item.id;
              renderConversationGroups();
              renderActiveConversation();
            });
            section.appendChild(button);
          }
          elements.groups.appendChild(section);
        }
      }

      function renderWelcomeState(conversation) {
        const empty = !conversation || conversation.messages.length === 0;
        elements.welcomeState.style.display = empty ? "grid" : "none";
      }

      function currentKnowledgeBaseName() {
        const active = state.knowledgeBases.find((item) => item.knowledge_base_id === state.currentKnowledgeBaseId);
        return active ? active.name : backendSpec.knowledge_base.knowledge_base_name;
      }

      function renderHeader(conversation) {
        elements.headerTitle.textContent = conversation ? conversation.title : projectSpec.project.display_name;
        elements.headerSubtitle.textContent = uiSpec.components.chat_header.subtitle_template.replace("{knowledge_base_name}", currentKnowledgeBaseName());
        elements.knowledgeBadge.textContent = uiSpec.components.conversation_sidebar.knowledge_entry_label.replace(
          backendSpec.knowledge_base.knowledge_base_name,
          currentKnowledgeBaseName()
        );
        elements.knowledgeBadgeSecondary.textContent = uiSpec.components.chat_header.knowledge_badge_template.replace(
          "{knowledge_base_name}",
          currentKnowledgeBaseName()
        );
        if (state.contextDocumentId && state.contextSectionId) {
          elements.composerContext.textContent = composerSpec.context_template.replace(
            "{context_label}",
            `${state.contextDocumentId} / ${state.contextSectionId}`
          );
        } else {
          elements.composerContext.textContent = composerSpec.context_template.replace(
            "{context_label}",
            currentKnowledgeBaseName()
          );
        }
      }

      function messageHtml(message) {
        if (message.role === "user") {
          return `<div class="message-bubble"><div class="message-content"><p>${escapeHtml(message.text)}</p></div></div>`;
        }
        const content = escapeHtml(message.text || "")
          .replace(/\\[(\\d+)\\]/g, '<button type="button" class="inline-ref" data-index="$1">[$1]</button>')
          .split(/\\n\\n+/)
          .map((part) => `<p>${part.replaceAll("\\n", "<br>")}</p>`)
          .join("");
        const citations = Array.isArray(message.citations) ? message.citations : [];
        const summary = citations.length
          ? `
            <div class="citation-summary">
              <span class="summary-label">${escapeHtml(messageStreamSpec.summary_template.replace("{count}", String(citations.length)))}</span>
              ${citations
                .map((citation, index) => `<button type="button" class="citation-chip" data-citation-index="${index}">[${index + 1}] ${escapeHtml(citation.document_title)}</button>`)
                .join("")}
            </div>
          `
          : "";
        const pending = message.pending ? `<div class="assistant-loading">${escapeHtml(backendSpec.interaction_copy.loading_text)}</div>` : "";
        return `
          <div class="assistant-body">
            ${pending}
            <div class="message-content">${content}</div>
            ${summary}
            <div class="message-actions">
              <button type="button" class="message-action" data-copy-answer="true">${escapeHtml(messageStreamSpec.copy_action_label)}</button>
            </div>
          </div>
        `;
      }

      function renderMessages() {
        const conversation = getActiveConversation();
        elements.messageList.innerHTML = "";
        if (!conversation) return;
        for (const message of conversation.messages) {
          const row = document.createElement("section");
          row.className = "message-row";
          row.innerHTML = `
            <article class="message-card ${message.role}">
              <div class="message-role">${message.role === "user" ? escapeHtml(messageStreamSpec.role_labels.user) : escapeHtml(messageStreamSpec.role_labels.assistant)}</div>
              ${messageHtml(message)}
            </article>
          `;
          for (const button of row.querySelectorAll(".inline-ref")) {
            button.addEventListener("click", () => {
              const index = Number(button.dataset.index || "1") - 1;
              openCitationDrawer(message.citations || [], index);
            });
          }
          for (const button of row.querySelectorAll("[data-citation-index]")) {
            button.addEventListener("click", () => {
              const index = Number(button.dataset.citationIndex || "0");
              openCitationDrawer(message.citations || [], index);
            });
          }
          const copyButton = row.querySelector("[data-copy-answer='true']");
          if (copyButton) {
            copyButton.addEventListener("click", async () => {
              try {
                await window.navigator.clipboard.writeText(message.text || "");
              } catch (error) {
                window.alert(messageStreamSpec.copy_failure_message);
              }
            });
          }
          elements.messageList.appendChild(row);
        }
      }

      function renderActiveConversation() {
        const conversation = getActiveConversation();
        renderConversationGroups();
        renderWelcomeState(conversation);
        renderHeader(conversation);
        renderMessages();
      }

      async function loadKnowledgeBases() {
        const response = await fetch(projectSpec.routes.api.knowledge_bases);
        state.knowledgeBases = response.ok ? await response.json() : [];
        renderKnowledgeDialog();
        renderActiveConversation();
      }

      async function loadDocuments() {
        const response = await fetch(projectSpec.routes.api.documents);
        state.documents = response.ok ? await response.json() : [];
      }

      function renderKnowledgeDialog() {
        elements.knowledgeDialogList.innerHTML = "";
        for (const item of state.knowledgeBases) {
          const article = document.createElement("article");
          article.className = "kb-card" + (item.knowledge_base_id === state.currentKnowledgeBaseId ? " active" : "");
          article.innerHTML = `
            <h3>${escapeHtml(item.name)}</h3>
            <p>${escapeHtml(item.description)}</p>
            <div class="card-meta">
              <span class="meta-chip">${item.document_count} documents</span>
              <span class="meta-chip">${escapeHtml(item.updated_at)}</span>
            </div>
            <div class="card-meta">
              <button type="button" class="primary-btn" data-select-kb="${escapeHtml(item.knowledge_base_id)}">${escapeHtml(switchDialogSpec.select_action_label)}</button>
              <a class="ghost-link" href="${uiSpec.pages.knowledge_detail.path.replace("{knowledge_base_id}", item.knowledge_base_id)}">${escapeHtml(switchDialogSpec.detail_action_label)}</a>
            </div>
          `;
          const selectButton = article.querySelector("[data-select-kb]");
          if (selectButton) {
            selectButton.addEventListener("click", () => {
              state.currentKnowledgeBaseId = item.knowledge_base_id;
              const conversation = getActiveConversation();
              if (conversation) {
                conversation.knowledgeBaseId = item.knowledge_base_id;
                conversation.updatedAt = new Date().toISOString();
                saveActiveConversation(conversation);
              }
              closeKnowledgeDialog();
              renderKnowledgeDialog();
              renderActiveConversation();
            });
          }
          elements.knowledgeDialogList.appendChild(article);
        }
      }

      function openKnowledgeDialog() {
        elements.knowledgeDialogBackdrop.classList.remove("hidden");
      }

      function closeKnowledgeDialog() {
        elements.knowledgeDialogBackdrop.classList.add("hidden");
      }

      async function fetchSectionHtml(citation) {
        const url = projectSpec.routes.api.section_detail
          .replace("{document_id}", citation.document_id)
          .replace("{section_id}", citation.section_id);
        const response = await fetch(url);
        if (!response.ok) {
          state.drawerSectionHtml = `<p>${escapeHtml(drawerSpec.load_failure_text)}</p>`;
          return;
        }
        const payload = await response.json();
        state.drawerSectionHtml = payload.html;
        state.drawerSnippet = citation.snippet;
      }

      async function openCitationDrawer(citations, index) {
        if (!Array.isArray(citations) || citations.length === 0) return;
        state.activeCitations = citations;
        state.activeCitationIndex = Math.max(0, Math.min(index, citations.length - 1));
        const citation = state.activeCitations[state.activeCitationIndex];
        state.drawerDocumentPath = citation.document_path;
        state.contextDocumentId = citation.document_id;
        state.contextSectionId = citation.section_id;
        await fetchSectionHtml(citation);
        renderDrawer();
        elements.drawer.classList.remove("hidden");
        elements.drawerBackdrop.classList.remove("hidden");
        state.drawerOpen = true;
        syncRoute();
        renderActiveConversation();
      }

      function closeCitationDrawer() {
        state.drawerOpen = false;
        elements.drawer.classList.add("hidden");
        elements.drawerBackdrop.classList.add("hidden");
        syncRoute();
      }

      function renderDrawer() {
        const citation = state.activeCitations[state.activeCitationIndex];
        if (!citation) return;
        elements.drawerTabs.innerHTML = "";
        for (let index = 0; index < state.activeCitations.length; index += 1) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "drawer-tab" + (index === state.activeCitationIndex ? " active" : "");
          button.textContent = `[${index + 1}]`;
          button.addEventListener("click", () => openCitationDrawer(state.activeCitations, index));
          elements.drawerTabs.appendChild(button);
        }
        elements.drawerMeta.innerHTML = `
          <h2>${escapeHtml(citation.document_title)}</h2>
          <p class="drawer-subtitle">${escapeHtml(drawerSpec.section_label)}：${escapeHtml(citation.section_title)}</p>
        `;
        elements.drawerSnippet.innerHTML = `
          <h3>${escapeHtml(drawerSpec.snippet_title)}</h3>
          <p>${escapeHtml(state.drawerSnippet || citation.snippet)}</p>
        `;
        elements.drawerSection.innerHTML = `
          <h3>${escapeHtml(drawerSpec.source_context_title)}</h3>
          ${state.drawerSectionHtml || `<p>${escapeHtml(drawerSpec.empty_context_text)}</p>`}
        `;
        elements.drawerDocumentLink.href = citation.document_path;
        elements.drawerDocumentLink.textContent = drawerSpec.document_link_label;
      }

      function syncRoute() {
        const params = new URLSearchParams(window.location.search);
        if (state.contextDocumentId) params.set("document", state.contextDocumentId);
        else params.delete("document");
        if (state.contextSectionId) params.set("section", state.contextSectionId);
        else params.delete("section");
        if (state.drawerOpen) params.set("citation", String(state.activeCitationIndex + 1));
        else params.delete("citation");
        const query = params.toString();
        const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
        window.history.replaceState(null, "", nextUrl);
      }

      async function hydrateFromQuery() {
        const params = new URLSearchParams(window.location.search);
        const documentId = params.get("document");
        const sectionId = params.get("section");
        if (!documentId || !sectionId) return;
        const documentItem = state.documents.find((item) => item.document_id === documentId);
        if (!documentItem) return;
        const citation = {
          citation_id: params.get("citation") || "1",
          document_id: documentId,
          document_title: documentItem.title,
          section_id: sectionId,
          section_title: sectionId,
          snippet: documentItem.summary,
          return_path: `${window.location.pathname}?document=${documentId}&section=${sectionId}`,
          document_path: uiSpec.pages.document_detail.path.replace("{document_id}", documentId) + `?section=${sectionId}`
        };
        await openCitationDrawer([citation], 0);
      }

      async function submitChat(forcedMessage) {
        const conversation = getActiveConversation();
        if (!conversation) return;
        const raw = typeof forcedMessage === "string" ? forcedMessage : elements.composerInput.value;
        const message = raw.trim();
        if (!message) return;

        conversation.messages.push({ role: "user", text: message });
        const pendingMessage = { role: "assistant", text: "", citations: [], pending: true };
        conversation.messages.push(pendingMessage);
        conversation.updatedAt = new Date().toISOString();
        if (conversation.title === conversationSpec.default_title) {
          conversation.title = message.slice(0, 24);
        }
        saveActiveConversation(conversation);
        renderActiveConversation();
        if (!forcedMessage) {
          elements.composerInput.value = "";
        }

        try {
          const response = await fetch(projectSpec.routes.api.chat_turns, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message,
              document_id: state.contextDocumentId || null,
              section_id: state.contextSectionId || null
            })
          });
          if (!response.ok) {
            throw new Error("chat request failed");
          }
          const payload = await response.json();
          pendingMessage.pending = false;
          pendingMessage.text = payload.answer;
          pendingMessage.citations = payload.citations;
          state.contextDocumentId = payload.context_document_id || state.contextDocumentId;
          state.contextSectionId = payload.context_section_id || state.contextSectionId;
          conversation.updatedAt = new Date().toISOString();
          saveActiveConversation(conversation);
          renderActiveConversation();
          syncRoute();
        } catch (error) {
          pendingMessage.pending = false;
          pendingMessage.text = backendSpec.interaction_copy.error_text;
          pendingMessage.citations = [];
          saveActiveConversation(conversation);
          renderActiveConversation();
        }
      }

      elements.newChat.addEventListener("click", () => createConversation());
      for (const button of elements.knowledgeSwitchButtons) {
        button.addEventListener("click", openKnowledgeDialog);
      }
      elements.knowledgeDialogClose.addEventListener("click", closeKnowledgeDialog);
      elements.knowledgeDialogBackdrop.addEventListener("click", (event) => {
        if (event.target === elements.knowledgeDialogBackdrop) closeKnowledgeDialog();
      });
      elements.drawerClose.addEventListener("click", closeCitationDrawer);
      elements.drawerBackdrop.addEventListener("click", closeCitationDrawer);
      elements.composer.addEventListener("submit", async (event) => {
        event.preventDefault();
        await submitChat();
      });
      elements.composerInput.addEventListener("keydown", async (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          await submitChat();
        }
      });

      async function init() {
        renderPromptGrid();
        ensureConversationState();
        renderConversationGroups();
        renderActiveConversation();
        await Promise.all([loadKnowledgeBases(), loadDocuments()]);
        await hydrateFromQuery();
      }

      void init();
    </script>
    """
    return script.replace("__PROJECT_SPEC__", spec_json)


def compose_knowledge_base_page(project: KnowledgeBaseProject | None = None) -> str:
    resolved = _resolve_project(project)
    ui_spec = resolved.ui_spec
    sidebar_spec = ui_spec["components"]["conversation_sidebar"]
    header_spec = ui_spec["components"]["chat_header"]
    composer_spec = ui_spec["components"]["chat_composer"]
    drawer_spec = ui_spec["components"]["citation_drawer"]
    switch_dialog_spec = ui_spec["components"]["knowledge_switch_dialog"]
    conversation_spec = ui_spec["conversation"]
    style = _shared_style(resolved)
    body = f"""
    <div class="chat-shell">
      <aside class="conversation-sidebar">
        <section class="sidebar-brand">
          <span class="eyebrow">{escape(resolved.copy["hero_kicker"])}</span>
          <h1>{escape(resolved.copy["hero_title"])}</h1>
          <p>{escape(resolved.copy["hero_copy"])}</p>
        </section>

        <button class="sidebar-primary-btn" id="new-chat" type="button">+ {escape(sidebar_spec["new_chat_label"])}</button>

        <section class="sidebar-section">
          <div class="sidebar-label">{escape(sidebar_spec["title"])}</div>
          <div class="conversation-groups" id="conversation-groups"></div>
        </section>

        <section class="sidebar-footer">
          <button class="sidebar-primary-btn" type="button" data-open-knowledge-switch="true" id="knowledge-badge"></button>
          <a class="secondary-link" href="{escape(ui_spec['pages']['knowledge_list']['path'])}">{escape(sidebar_spec['browse_knowledge_label'])}</a>
        </section>
      </aside>

      <main class="chat-main">
        <header class="chat-header" id="chat-header">
          <div class="header-copy">
            <div class="header-title" id="active-conversation-title">{escape(resolved.metadata.display_name)}</div>
            <div class="header-subtitle" id="active-conversation-subtitle">{escape(header_spec['subtitle_template'].replace('{knowledge_base_name}', resolved.library.knowledge_base_name))}</div>
          </div>
          <div class="header-actions">
            <button class="pill-button" type="button" data-open-knowledge-switch="true" id="knowledge-badge-secondary"></button>
            <a class="ghost-link" href="{escape(ui_spec['pages']['knowledge_list']['path'])}">{escape(header_spec['knowledge_entry_link_label'])}</a>
          </div>
        </header>

        <section class="chat-content">
          <div class="chat-stream">
            <section class="welcome-state" id="welcome-state">
              <div class="welcome-card">
                <span class="eyebrow">{escape(conversation_spec['welcome_kicker'])}</span>
                <h2>{escape(conversation_spec['welcome_title'])}</h2>
                <p>{escape(conversation_spec['welcome_copy'])}</p>
                <div class="kb-pill" style="justify-content:center;">{escape(conversation_spec['current_knowledge_base_template'].replace('{knowledge_base_name}', resolved.library.knowledge_base_name))}</div>
                <div class="prompt-grid" id="prompt-grid"></div>
              </div>
            </section>
            <div class="message-list" id="message-list"></div>
          </div>
        </section>

        <div class="chat-composer-wrap">
          <form class="chat-composer" id="chat-form">
            <div class="composer-status">
              <span id="composer-context">{escape(composer_spec['context_template'].replace('{context_label}', resolved.library.knowledge_base_name))}</span>
              <span>{escape(composer_spec['citation_hint'])}</span>
            </div>
            <textarea
              class="composer-input"
              id="chat-input"
              rows="4"
              placeholder="{escape(composer_spec['placeholder'])}"
            ></textarea>
            <div class="composer-actions">
              <div class="left">
                <span class="source-chip">{escape(composer_spec['mode_label'])}</span>
                <a class="ghost-link" href="{escape(ui_spec['pages']['knowledge_list']['path'])}">{escape(composer_spec['knowledge_link_label'])}</a>
              </div>
              <button class="primary-btn" type="submit">{escape(composer_spec['submit_label'])}</button>
            </div>
          </form>
        </div>
      </main>
    </div>

    <div class="drawer-backdrop hidden" id="drawer-backdrop"></div>
    <aside class="citation-drawer hidden" id="citation-drawer">
      <header class="drawer-head">
        <div id="drawer-meta"></div>
        <button class="drawer-close" id="citation-drawer-close" type="button" aria-label="{escape(drawer_spec['close_aria_label'])}">×</button>
      </header>
      <div class="drawer-tabs" id="drawer-tabs"></div>
      <section class="drawer-content">
        <article class="drawer-card" id="drawer-snippet"></article>
        <article class="drawer-card" id="drawer-section"></article>
      </section>
      <footer class="drawer-actions">
        <a class="ghost-link" id="drawer-document-link" href="{escape(ui_spec['pages']['knowledge_list']['path'])}">{escape(drawer_spec['document_link_label'])}</a>
      </footer>
    </aside>

    <div class="dialog-backdrop hidden" id="knowledge-dialog-backdrop">
      <div class="dialog-shell">
        <section class="dialog-panel">
          <header class="dialog-head">
            <div>
              <h2>{escape(switch_dialog_spec['title'])}</h2>
              <p>{escape(switch_dialog_spec['description'])}</p>
            </div>
            <button class="drawer-close" id="knowledge-dialog-close" type="button" aria-label="{escape(switch_dialog_spec['close_aria_label'])}">×</button>
          </header>
          <div class="dialog-body">
            <div class="kb-list" id="knowledge-dialog-list"></div>
          </div>
        </section>
      </div>
    </div>

    {_chat_script(resolved)}
    """
    return _render_page(resolved.metadata.display_name, style, body)
