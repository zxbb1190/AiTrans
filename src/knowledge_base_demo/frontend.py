from __future__ import annotations

from html import escape
import json

from framework_core import Base, BoundaryDefinition, BoundaryItem, Capability, VerificationInput, VerificationResult, verify
from project_runtime.knowledge_base import KnowledgeBaseProject, load_knowledge_base_project


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
    Capability("C1", "把输入、展示、导航与反馈原子装配为稳定前端界面结构。"),
    Capability("C2", "以统一结构承接浏览、预览、对话与引用返回等不同场景交互。"),
    Capability("C3", "为知识库工作台输出稳定 UI 承接面，而不泄漏底层实现细节。"),
)

KNOWLEDGE_BASE_FRONTEND_BOUNDARY = BoundaryDefinition(
    items=(
        BoundaryItem("SURFACE", "library、preview、toc 与 chat 承载面职责必须明确。"),
        BoundaryItem("INTERACT", "搜索、选择、跳锚点、提问与引用返回出口必须稳定。"),
        BoundaryItem("STATE", "当前文档、当前章节、空态与消息历史必须显式可见。"),
        BoundaryItem("EXTEND", "领域工作台和后端契约只能通过固定槽位接入。"),
        BoundaryItem("ROUTE", "页面入口、深链查询参数与返回路径必须可承接。"),
        BoundaryItem("A11Y", "阅读顺序、键盘路径与当前焦点提示必须稳定。"),
    )
)

KNOWLEDGE_BASE_FRONTEND_BASES = (
    Base("B1", "界面装配基", "library / preview / toc / chat surface assembly"),
    Base("B2", "交互契约基", "search / selection / anchor jump / chat / citation return contract"),
    Base("B3", "领域承接基", "knowledge-base domain and backend extension slots"),
)


def verify_knowledge_base_frontend(project: KnowledgeBaseProject | None = None) -> VerificationResult:
    resolved = _resolve_project(project)
    boundary = _module_boundary(resolved)
    boundary_valid, boundary_errors = boundary.validate()
    result = verify(
        VerificationInput(
            subject="knowledge base frontend",
            pass_criteria=[
                "library, preview, toc, and chat surfaces all exist in one workbench shell",
                "anchor navigation and citation return stay explicit in the page contract",
                "theme tokens and route contracts are compiled from one instance config",
            ],
            evidence={
                "project": resolved.public_summary(),
                "capabilities": [item.to_dict() for item in _module_capabilities(resolved)],
                "boundary": boundary.to_dict(),
                "bases": [item.to_dict() for item in _module_bases(resolved)],
                "frontend_contract": resolved.frontend_contract,
                "rule_validation": resolved.validation_reports.get("frontend", {}),
                "copy": resolved.copy,
                "visual": resolved.visual_tokens,
            },
        )
    )
    return VerificationResult(
        passed=boundary_valid and result.passed,
        reasons=[*boundary_errors, *result.reasons],
        evidence=result.evidence,
    )


def compose_knowledge_base_page(project: KnowledgeBaseProject | None = None) -> str:
    resolved = _resolve_project(project)
    spec = resolved.to_spec_dict()
    visual = resolved.visual_tokens
    copy = resolved.copy
    base_labels = " / ".join(item.name for item in resolved.domain_ir.bases)
    overall_validation = resolved.validation_reports.get("overall", {})
    artifacts = resolved.generated_artifacts.to_dict() if resolved.generated_artifacts else {}
    bundle_path = artifacts.get("project_bundle_py", "not materialized")
    upload_button_style = "" if resolved.library.allow_create else ' style="display:none"'
    spec_json = json.dumps(spec, ensure_ascii=False)
    return f"""
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{escape(resolved.metadata.display_name)}</title>
    <style>
      :root {{
        --bg: {visual["bg"]};
        --panel: {visual["panel"]};
        --panel-soft: {visual["panel_soft"]};
        --ink: {visual["ink"]};
        --muted: {visual["muted"]};
        --accent: {visual["accent"]};
        --accent-soft: {visual["accent_soft"]};
        --line: {visual["line"]};
        --radius: {visual["radius"]};
        --shadow: {visual["shadow"]};
        --font-body: {visual["font_body"]};
        --font-title: {visual["font_title"]};
        --font-hero: {visual["font_hero"]};
        --sidebar-width: {visual["sidebar_width"]};
        --rail-width: {visual["rail_width"]};
        --shell-gap: {visual["shell_gap"]};
        --shell-padding: {visual["shell_padding"]};
        --panel-gap: {visual["panel_gap"]};
        --sidebar-bg: #162028;
        --sidebar-ink: #f6f3ed;
        --sidebar-muted: rgba(246, 243, 237, 0.72);
        --danger: #b42318;
      }}

      * {{ box-sizing: border-box; }}
      body {{
        margin: 0;
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
        font-size: var(--font-body);
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(15, 109, 98, 0.10), transparent 24%),
          radial-gradient(circle at bottom right, rgba(15, 109, 98, 0.08), transparent 18%),
          var(--bg);
      }}

      button,
      input,
      textarea {{
        font: inherit;
      }}

      button {{
        cursor: pointer;
      }}

      .app-shell {{
        min-height: 100vh;
        display: grid;
        grid-template-columns: var(--sidebar-width) minmax(0, 1fr) var(--rail-width);
        gap: var(--shell-gap);
        padding: var(--shell-padding);
      }}

      .sidebar,
      .conversation-stage,
      .source-rail {{
        min-height: calc(100vh - 36px);
        border-radius: var(--radius);
        overflow: hidden;
      }}

      .sidebar {{
        display: grid;
        grid-template-rows: auto auto minmax(0, 1fr) auto;
        gap: var(--panel-gap);
        padding: var(--shell-padding);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent 26%),
          var(--sidebar-bg);
        color: var(--sidebar-ink);
        box-shadow: 0 24px 60px rgba(12, 17, 22, 0.30);
      }}

      .eyebrow {{
        display: inline-flex;
        align-items: center;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.10);
        color: var(--sidebar-muted);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-size: 0.72rem;
      }}

      .brand-block h1 {{
        margin: 14px 0 10px;
        font-size: var(--font-hero);
        line-height: 1.08;
        overflow-wrap: anywhere;
      }}

      .brand-copy {{
        margin: 0;
        color: var(--sidebar-muted);
        line-height: 1.6;
      }}

      .sidebar-actions {{
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }}

      .sidebar-actions button,
      .composer-actions button,
      .modal-actions button {{
        border: 0;
        border-radius: 999px;
        padding: 11px 14px;
      }}

      .primary-btn {{
        background: var(--accent);
        color: white;
      }}

      .ghost-btn {{
        background: rgba(255, 255, 255, 0.08);
        color: var(--sidebar-ink);
        border: 1px solid rgba(255, 255, 255, 0.10);
      }}

      .library-panel,
      .contract-panel {{
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 28px;
        padding: 16px;
      }}

      .section-head {{
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }}

      .section-head h2 {{
        margin: 0;
        font-size: 0.92rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }}

      .meta-note {{
        color: var(--muted);
        font-size: 0.82rem;
      }}

      .sidebar .meta-note {{
        color: var(--sidebar-muted);
      }}

      .library-tools {{
        display: grid;
        gap: 10px;
        margin-bottom: 12px;
      }}

      .sidebar input,
      .composer textarea,
      .modal textarea,
      .modal input {{
        width: 100%;
        border-radius: 18px;
        border: 1px solid var(--line);
        padding: 12px 14px;
      }}

      .sidebar input {{
        background: rgba(255, 255, 255, 0.08);
        color: var(--sidebar-ink);
        border-color: rgba(255, 255, 255, 0.10);
      }}

      .sidebar input::placeholder {{
        color: rgba(246, 243, 237, 0.46);
      }}

      .tag-strip {{
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }}

      .tag-chip {{
        border: 1px solid rgba(255, 255, 255, 0.10);
        border-radius: 999px;
        padding: 6px 10px;
        background: rgba(255, 255, 255, 0.06);
        color: var(--sidebar-ink);
      }}

      .tag-chip.active {{
        background: var(--accent);
      }}

      .library-list {{
        display: grid;
        gap: 10px;
        max-height: 100%;
        overflow: auto;
        padding-right: 4px;
      }}

      .file-card {{
        display: grid;
        gap: 8px;
        padding: 14px;
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid transparent;
        transition: border-color 120ms ease, transform 120ms ease;
      }}

      .file-card.active {{
        border-color: rgba(255, 255, 255, 0.28);
        transform: translateY(-1px);
      }}

      .file-card-top {{
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }}

      .file-select {{
        border: 0;
        padding: 0;
        margin: 0;
        background: transparent;
        color: inherit;
        text-align: left;
        width: 100%;
      }}

      .file-delete {{
        border: 0;
        width: 30px;
        height: 30px;
        border-radius: 999px;
        background: rgba(180, 35, 24, 0.18);
        color: #ffd6cf;
      }}

      .file-title {{
        font-weight: 700;
        color: var(--sidebar-ink);
      }}

      .file-copy,
      .file-meta {{
        color: var(--sidebar-muted);
        line-height: 1.55;
      }}

      .pill-row {{
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }}

      .pill {{
        display: inline-flex;
        align-items: center;
        padding: 4px 9px;
        border-radius: 999px;
        background: rgba(17, 24, 39, 0.06);
        color: var(--muted);
        font-size: 0.72rem;
      }}

      .sidebar .pill {{
        background: rgba(255, 255, 255, 0.08);
        color: var(--sidebar-muted);
      }}

      .contract-panel {{
        display: grid;
        gap: 10px;
      }}

      .contract-stat {{
        font-size: 1.55rem;
        font-weight: 700;
      }}

      .micro-list {{
        margin: 0;
        padding-left: 18px;
        display: grid;
        gap: 8px;
        color: var(--sidebar-muted);
      }}

      .conversation-stage {{
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        background: rgba(255, 255, 255, 0.70);
        border: 1px solid var(--line);
        box-shadow: var(--shadow);
        backdrop-filter: blur(18px);
      }}

      .stage-header {{
        padding: 20px 24px 16px;
        border-bottom: 1px solid var(--line);
      }}

      .stage-topline {{
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 12px;
      }}

      .stage-chip {{
        display: inline-flex;
        align-items: center;
        padding: 6px 10px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 0.8rem;
      }}

      .stage-header h2 {{
        margin: 0;
        font-size: var(--font-title);
      }}

      .stage-copy {{
        margin: 10px 0 0;
        color: var(--muted);
        line-height: 1.6;
      }}

      .conversation-scroll {{
        overflow: auto;
        padding: 24px;
      }}

      .intro-card {{
        padding: 18px 20px;
        border-radius: 26px;
        background: linear-gradient(180deg, rgba(15, 109, 98, 0.10), rgba(15, 109, 98, 0.03));
        border: 1px solid rgba(15, 109, 98, 0.12);
        margin-bottom: 16px;
      }}

      .intro-card h3 {{
        margin: 0 0 8px;
        font-size: 1rem;
      }}

      .intro-card ul {{
        margin: 0;
        padding-left: 18px;
        color: var(--muted);
        line-height: 1.7;
      }}

      .message-stack {{
        display: grid;
        gap: 16px;
      }}

      .message {{
        max-width: 860px;
        padding: 18px;
        border-radius: 26px;
        background: rgba(255, 255, 255, 0.86);
        border: 1px solid var(--line);
      }}

      .message.user {{
        margin-left: auto;
        background: rgba(15, 109, 98, 0.10);
      }}

      .message-role {{
        margin-bottom: 10px;
        font-family: "IBM Plex Mono", monospace;
        font-size: 0.76rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }}

      .message-body {{
        white-space: pre-wrap;
        line-height: 1.72;
      }}

      .citation-list {{
        display: grid;
        gap: 10px;
        margin-top: 12px;
      }}

      .citation {{
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 12px 14px;
        background: rgba(255, 255, 255, 0.92);
        color: var(--ink);
        text-align: left;
      }}

      .citation strong {{
        display: block;
        margin-bottom: 4px;
      }}

      .composer {{
        border-top: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.78);
        padding: 18px 20px 22px;
      }}

      .composer textarea {{
        min-height: 110px;
        resize: vertical;
        background: white;
      }}

      .composer-actions {{
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-top: 12px;
      }}

      .composer-meta {{
        color: var(--muted);
        font-size: 0.92rem;
      }}

      .source-rail {{
        display: grid;
        grid-template-rows: auto auto auto minmax(0, 1fr);
        gap: 14px;
        padding: 18px;
        background: rgba(255, 255, 255, 0.78);
        border: 1px solid var(--line);
        box-shadow: var(--shadow);
        backdrop-filter: blur(18px);
      }}

      .rail-panel {{
        background: var(--panel-soft);
        border: 1px solid var(--line);
        border-radius: 24px;
        padding: 16px;
      }}

      .source-summary h2,
      .toc-card h2,
      .preview-card h2 {{
        margin: 0 0 10px;
        font-size: 0.9rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }}

      .source-summary p {{
        margin: 0;
        color: var(--muted);
        line-height: 1.62;
      }}

      .toc-list {{
        display: grid;
        gap: 8px;
      }}

      .toc-item {{
        border: 1px solid transparent;
        border-radius: 16px;
        padding: 10px 12px;
        background: rgba(255, 255, 255, 0.84);
        text-align: left;
      }}

      .toc-item.active {{
        border-color: var(--accent);
      }}

      .preview-card {{
        min-height: 0;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
      }}

      .preview-scroll {{
        overflow: auto;
        padding-right: 4px;
      }}

      .section-block {{
        padding: 16px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.88);
        border: 1px solid var(--line);
        margin-bottom: 12px;
      }}

      .section-block.active {{
        border-color: var(--accent);
        box-shadow: inset 0 0 0 1px rgba(15, 109, 98, 0.15);
      }}

      .section-block h3 {{
        margin: 0 0 10px;
      }}

      .section-block p,
      .section-block li {{
        line-height: 1.7;
      }}

      .modal-backdrop {{
        position: fixed;
        inset: 0;
        padding: 24px;
        background: rgba(16, 20, 24, 0.52);
        display: grid;
        place-items: center;
      }}

      .modal-backdrop.hidden {{
        display: none;
      }}

      .modal {{
        width: min(780px, 100%);
        max-height: calc(100vh - 48px);
        overflow: auto;
        padding: 22px;
        border-radius: 30px;
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid var(--line);
        box-shadow: 0 30px 80px rgba(15, 23, 42, 0.24);
      }}

      .modal h2 {{
        margin: 0 0 8px;
      }}

      .modal p {{
        margin: 0 0 18px;
        color: var(--muted);
      }}

      .modal-grid {{
        display: grid;
        gap: 12px;
      }}

      .modal textarea {{
        min-height: 220px;
        resize: vertical;
        background: white;
      }}

      .modal-actions {{
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 16px;
      }}

      .secondary-btn {{
        background: transparent;
        border: 1px solid var(--line);
        color: var(--ink);
      }}

      @media (max-width: 1320px) {{
        .app-shell {{
          grid-template-columns: 280px minmax(0, 1fr) 340px;
        }}
      }}

      @media (max-width: 1100px) {{
        .app-shell {{
          grid-template-columns: 1fr;
        }}

        .sidebar,
        .conversation-stage,
        .source-rail {{
          min-height: unset;
        }}
      }}
    </style>
  </head>
  <body>
    <div class="app-shell">
      <aside class="sidebar">
        <section class="brand-block">
          <span class="eyebrow">{escape(copy["hero_kicker"])}</span>
          <h1>{escape(copy["hero_title"])}</h1>
          <p class="brand-copy">{escape(copy["hero_copy"])}</p>
        </section>

        <section class="sidebar-actions">
          <button class="ghost-btn" id="new-chat" type="button">New Chat</button>
          <button class="primary-btn" id="open-source-modal" type="button"{upload_button_style}>Add Source</button>
        </section>

        <section class="library-panel">
          <div class="section-head">
            <h2>{escape(copy["library_title"])}</h2>
            <span class="meta-note" id="library-meta"></span>
          </div>
          <div class="library-tools">
            <input id="library-query" type="search" placeholder="{escape(copy['search_placeholder'])}">
            <div class="tag-strip" id="tag-strip"></div>
          </div>
          <div class="library-list" id="library-list"></div>
        </section>

        <section class="contract-panel">
          <div class="section-head">
            <h2>System Contract</h2>
            <span class="meta-note">{escape(resolved.visual.brand)}</span>
          </div>
          <div class="contract-stat">{overall_validation.get("passed_count", 0)} / {overall_validation.get("rule_count", 0)}</div>
          <div class="meta-note">Rules passing across frontend and workbench contracts</div>
          <div>{escape(base_labels)}</div>
          <ul class="micro-list">
            <li>layout: {escape(resolved.frontend_contract.get("layout_variant", "chat_first_knowledge_workbench"))}</li>
            <li>route: {escape(resolved.route.workbench)}</li>
            <li>bundle: {escape(bundle_path)}</li>
          </ul>
        </section>
      </aside>

      <main class="conversation-stage">
        <header class="stage-header">
          <div class="stage-topline">
            <span class="stage-chip">ChatGPT-style knowledge workspace</span>
            <span class="stage-chip" id="scope-chip">Current scope: whole knowledge base</span>
          </div>
          <h2>{escape(copy["chat_title"])}</h2>
          <p class="stage-copy">Chat first, but grounded in managed knowledge files, explicit source focus, and citation return paths.</p>
        </header>

        <section class="conversation-scroll">
          <article class="intro-card" id="intro-card">
            <h3>What this workspace does</h3>
            <ul>
              <li>Manage knowledge files instead of chatting against a blind prompt.</li>
              <li>Keep the current file and current section explicit while you ask questions.</li>
              <li>Return every cited answer back to the exact source anchor.</li>
            </ul>
          </article>
          <div class="message-stack" id="chat-messages"></div>
        </section>

        <form class="composer" id="chat-form">
          <textarea id="chat-input" rows="5" placeholder="{escape(copy['chat_placeholder'])}"></textarea>
          <div class="composer-actions">
            <div class="composer-meta" id="composer-meta">Scope: all documents</div>
            <button class="primary-btn" type="submit">Ask With Citations</button>
          </div>
        </form>
      </main>

      <aside class="source-rail">
        <section class="rail-panel source-summary" id="source-summary">
          <h2>{escape(copy["preview_title"])}</h2>
          <p>Select a document to inspect summary, sections, anchors, and citation return targets.</p>
        </section>

        <section class="rail-panel toc-card">
          <div class="section-head">
            <h2>{escape(copy["toc_title"])}</h2>
            <span class="meta-note" id="preview-meta"></span>
          </div>
          <div class="toc-list" id="toc-list"></div>
        </section>

        <section class="rail-panel">
          <div class="section-head">
            <h2>Citation Return</h2>
            <span class="meta-note">Click any citation to reopen the source section</span>
          </div>
        </section>

        <section class="rail-panel preview-card">
          <h2>Source Preview</h2>
          <div class="preview-scroll" id="preview-content">
            <div class="meta-note">{escape(copy["empty_state_copy"])}</div>
          </div>
        </section>
      </aside>
    </div>

    <div class="modal-backdrop hidden" id="source-modal">
      <div class="modal">
        <h2>Add Knowledge Source</h2>
        <p>Create a new document directly inside the current knowledge workspace. The file becomes searchable, previewable, and citeable immediately.</p>
        <form id="source-form">
          <div class="modal-grid">
            <input id="source-title" type="text" placeholder="Source title" required>
            <input id="source-summary-field" type="text" placeholder="One-sentence summary" required>
            <input id="source-tags" type="text" placeholder="Tags, comma separated">
            <textarea id="source-body" placeholder="Markdown body with ## headings for citeable anchors" required></textarea>
          </div>
          <div class="modal-actions">
            <button class="secondary-btn" id="close-source-modal" type="button">Cancel</button>
            <button class="primary-btn" type="submit">Create Source</button>
          </div>
        </form>
      </div>
    </div>

    <script>
      const projectSpec = {spec_json};
      const state = {{
        query: "",
        tag: "",
        documentId: "",
        sectionId: "",
        documents: [],
        currentDocument: null,
        tags: [],
        sourceModalOpen: false,
        messages: [
          {{
            role: "assistant",
            answer: projectSpec.copy.chat_welcome,
            citations: []
          }}
        ]
      }};

      const queryInput = document.getElementById("library-query");
      const libraryMeta = document.getElementById("library-meta");
      const libraryList = document.getElementById("library-list");
      const tagStrip = document.getElementById("tag-strip");
      const previewMeta = document.getElementById("preview-meta");
      const tocList = document.getElementById("toc-list");
      const previewContent = document.getElementById("preview-content");
      const sourceSummary = document.getElementById("source-summary");
      const chatMessages = document.getElementById("chat-messages");
      const chatForm = document.getElementById("chat-form");
      const chatInput = document.getElementById("chat-input");
      const composerMeta = document.getElementById("composer-meta");
      const scopeChip = document.getElementById("scope-chip");
      const introCard = document.getElementById("intro-card");
      const newChatButton = document.getElementById("new-chat");
      const sourceModal = document.getElementById("source-modal");
      const openSourceModalButton = document.getElementById("open-source-modal");
      const closeSourceModalButton = document.getElementById("close-source-modal");
      const sourceForm = document.getElementById("source-form");
      const sourceTitle = document.getElementById("source-title");
      const sourceSummaryInput = document.getElementById("source-summary-field");
      const sourceTags = document.getElementById("source-tags");
      const sourceBody = document.getElementById("source-body");

      function escapeHtml(value) {{
        return String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }}

      function openSourceModal() {{
        state.sourceModalOpen = true;
        sourceModal.classList.remove("hidden");
        sourceTitle.focus();
      }}

      function closeSourceModal() {{
        state.sourceModalOpen = false;
        sourceModal.classList.add("hidden");
        sourceForm.reset();
      }}

      function resetConversation() {{
        state.messages = [
          {{
            role: "assistant",
            answer: projectSpec.copy.chat_welcome,
            citations: []
          }}
        ];
        renderMessages();
      }}

      function syncRoute() {{
        const params = new URLSearchParams();
        if (state.query) params.set("query", state.query);
        if (state.tag) params.set("tag", state.tag);
        if (state.documentId) params.set("document", state.documentId);
        if (state.sectionId) params.set("section", state.sectionId);
        const query = params.toString();
        const next = query ? `${{window.location.pathname}}?${{query}}` : window.location.pathname;
        window.history.replaceState(null, "", next);
      }}

      function renderTags() {{
        tagStrip.innerHTML = "";
        const allTags = [{{ name: "", count: state.documents.length }}].concat(state.tags);
        for (const tag of allTags) {{
          const button = document.createElement("button");
          button.type = "button";
          button.className = "tag-chip" + (state.tag === tag.name ? " active" : "");
          button.textContent = tag.name ? `${{tag.name}} (${{tag.count}})` : "All tags";
          button.addEventListener("click", () => {{
            state.tag = tag.name;
            loadDocuments();
          }});
          tagStrip.appendChild(button);
        }}
      }}

      function renderLibrary() {{
        libraryList.innerHTML = "";
        libraryMeta.textContent = `${{state.documents.length}} files`;
        for (const docItem of state.documents) {{
          const article = document.createElement("article");
          article.className = "file-card" + (state.documentId === docItem.document_id ? " active" : "");

          const top = document.createElement("div");
          top.className = "file-card-top";

          const selector = document.createElement("button");
          selector.type = "button";
          selector.className = "file-select";
          selector.innerHTML = `
            <div class="file-title">${{escapeHtml(docItem.title)}}</div>
            <div class="file-copy">${{escapeHtml(docItem.summary)}}</div>
            <div class="pill-row">
              ${{docItem.tags.map((tag) => `<span class="pill">${{escapeHtml(tag)}}</span>`).join("")}}
              <span class="pill">${{escapeHtml(docItem.updated_at)}}</span>
            </div>
          `;
          selector.addEventListener("click", () => {{
            state.documentId = docItem.document_id;
            state.sectionId = "summary";
            loadDocument(docItem.document_id, state.sectionId);
          }});
          top.appendChild(selector);

          if (projectSpec.library.allow_delete) {{
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "file-delete";
            remove.textContent = "×";
            remove.title = "Delete source";
            remove.addEventListener("click", async (event) => {{
              event.stopPropagation();
              if (!window.confirm(`Delete ${{docItem.title}}?`)) return;
              const response = await fetch(projectSpec.routes.api.delete_document.replace("{{document_id}}", docItem.document_id), {{
                method: "DELETE"
              }});
              if (!response.ok) {{
                const payload = await response.json();
                window.alert(payload.detail || "Failed to delete source.");
                return;
              }}
              if (state.documentId === docItem.document_id) {{
                state.documentId = "";
                state.sectionId = "summary";
              }}
              await loadTags();
              await loadDocuments();
            }});
            top.appendChild(remove);
          }}

          article.appendChild(top);
          libraryList.appendChild(article);
        }}
      }}

      function renderPreview() {{
        if (!state.currentDocument) {{
          sourceSummary.innerHTML = `
            <h2>${{escapeHtml(projectSpec.copy.preview_title)}}</h2>
            <p>${{escapeHtml(projectSpec.copy.empty_state_copy)}}</p>
          `;
          previewContent.innerHTML = `<div class="meta-note">${{escapeHtml(projectSpec.copy.empty_state_copy)}}</div>`;
          tocList.innerHTML = "";
          previewMeta.textContent = "No source selected";
          composerMeta.textContent = "Scope: all documents";
          scopeChip.textContent = "Current scope: whole knowledge base";
          return;
        }}
        previewMeta.textContent = state.currentDocument.title;
        composerMeta.textContent = `Scope: ${{state.currentDocument.title}} / ${{state.sectionId || "summary"}}`;
        scopeChip.textContent = `Current scope: ${{state.currentDocument.title}}`;
        sourceSummary.innerHTML = `
          <h2>${{escapeHtml(state.currentDocument.title)}}</h2>
          <p>${{escapeHtml(state.currentDocument.summary)}}</p>
          <div class="pill-row">
            ${{state.currentDocument.tags.map((tag) => `<span class="pill">${{escapeHtml(tag)}}</span>`).join("")}}
            <span class="pill">${{escapeHtml(state.currentDocument.updated_at)}}</span>
          </div>
        `;
        tocList.innerHTML = "";
        for (const section of state.currentDocument.sections) {{
          const button = document.createElement("button");
          button.type = "button";
          button.className = "toc-item" + (state.sectionId === section.section_id ? " active" : "");
          button.textContent = section.title;
          button.addEventListener("click", () => {{
            state.sectionId = section.section_id;
            renderPreview();
            syncRoute();
          }});
          tocList.appendChild(button);
        }}

        previewContent.innerHTML = state.currentDocument.sections
          .map((section) => `
            <section class="section-block${{state.sectionId === section.section_id ? " active" : ""}}" id="section-${{section.section_id}}">
              <h3>${{escapeHtml(section.title)}}</h3>
              ${{section.html}}
            </section>
          `)
          .join("");
        const target = document.getElementById(`section-${{state.sectionId}}`);
        if (target) {{
          target.scrollIntoView({{ block: "start", behavior: "smooth" }});
        }}
      }}

      function renderMessages() {{
        chatMessages.innerHTML = "";
        introCard.style.display = state.messages.length > 1 ? "none" : "block";
        state.messages.forEach((message) => {{
          const article = document.createElement("article");
          article.className = "message " + message.role;
          article.innerHTML = `
            <div class="message-role">${{message.role === "user" ? "You" : "Assistant"}}</div>
            <div class="message-body">${{escapeHtml(message.answer)}}</div>
          `;
          if (message.citations && message.citations.length) {{
            const list = document.createElement("div");
            list.className = "citation-list";
            message.citations.forEach((citation) => {{
              const button = document.createElement("button");
              button.type = "button";
              button.className = "citation";
              button.innerHTML = `
                <strong>${{escapeHtml(citation.section_title)}}</strong><br>
                <span class="subtle">${{escapeHtml(citation.document_title)}}</span><br>
                <span class="subtle">${{escapeHtml(citation.snippet)}}</span>
              `;
              button.addEventListener("click", () => {{
                state.documentId = citation.document_id;
                state.sectionId = citation.section_id;
                loadDocument(citation.document_id, citation.section_id);
              }});
              list.appendChild(button);
            }});
            article.appendChild(list);
          }}
          chatMessages.appendChild(article);
        }});
      }}

      async function loadTags() {{
        const response = await fetch(projectSpec.routes.api.tags);
        const payload = await response.json();
        state.tags = payload.items || [];
        renderTags();
      }}

      async function loadDocuments() {{
        const params = new URLSearchParams();
        if (state.query) params.set("query", state.query);
        if (state.tag) params.set("tag", state.tag);
        const response = await fetch(`${{projectSpec.routes.api.documents}}?${{params.toString()}}`);
        state.documents = await response.json();
        if (!state.documentId && state.documents.length) {{
          state.documentId = state.documents[0].document_id;
        }}
        renderLibrary();
        syncRoute();
        if (state.documentId) {{
          await loadDocument(state.documentId, state.sectionId || "summary");
        }} else {{
          state.currentDocument = null;
          renderPreview();
        }}
      }}

      async function loadDocument(documentId, sectionId = "summary") {{
        const response = await fetch(projectSpec.routes.api.document_detail.replace("{{document_id}}", documentId));
        if (!response.ok) return;
        state.currentDocument = await response.json();
        state.documentId = documentId;
        state.sectionId = sectionId;
        renderLibrary();
        renderPreview();
        syncRoute();
      }}

      newChatButton.addEventListener("click", () => {{
        resetConversation();
      }});

      openSourceModalButton.addEventListener("click", () => {{
        openSourceModal();
      }});

      closeSourceModalButton.addEventListener("click", () => {{
        closeSourceModal();
      }});

      sourceModal.addEventListener("click", (event) => {{
        if (event.target === sourceModal) {{
          closeSourceModal();
        }}
      }});

      sourceForm.addEventListener("submit", async (event) => {{
        event.preventDefault();
        const payload = {{
          title: sourceTitle.value.trim(),
          summary: sourceSummaryInput.value.trim(),
          tags: sourceTags.value.split(",").map((item) => item.trim()).filter(Boolean),
          body_markdown: sourceBody.value.trim()
        }};
        const response = await fetch(projectSpec.routes.api.create_document, {{
          method: "POST",
          headers: {{ "Content-Type": "application/json" }},
          body: JSON.stringify(payload)
        }});
        const data = await response.json();
        if (!response.ok) {{
          window.alert(data.detail || "Failed to create source.");
          return;
        }}
        closeSourceModal();
        await loadTags();
        await loadDocuments();
        state.documentId = data.document_id;
        state.sectionId = "summary";
        await loadDocument(data.document_id, "summary");
      }});

      queryInput.addEventListener("change", () => {{
        state.query = queryInput.value.trim();
        loadDocuments();
      }});

      chatForm.addEventListener("submit", async (event) => {{
        event.preventDefault();
        const message = chatInput.value.trim();
        if (!message) return;
        state.messages.push({{ role: "user", answer: message, citations: [] }});
        renderMessages();
        chatInput.value = "";
        const response = await fetch(projectSpec.routes.api.chat_turns, {{
          method: "POST",
          headers: {{ "Content-Type": "application/json" }},
          body: JSON.stringify({{
            message,
            document_id: state.documentId || null,
            section_id: state.sectionId || null
          }})
        }});
        const payload = await response.json();
        state.messages.push({{ role: "assistant", answer: payload.answer, citations: payload.citations }});
        renderMessages();
      }});

      function restoreRouteState() {{
        const params = new URLSearchParams(window.location.search);
        state.query = params.get("query") || "";
        state.tag = params.get("tag") || "";
        state.documentId = params.get("document") || "";
        state.sectionId = params.get("section") || "summary";
        queryInput.value = state.query;
      }}

      async function boot() {{
        restoreRouteState();
        renderMessages();
        await loadTags();
        await loadDocuments();
      }}

      boot();
    </script>
  </body>
</html>
"""
