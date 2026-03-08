from __future__ import annotations

from pathlib import Path
import tempfile
import textwrap
import unittest

from fastapi.testclient import TestClient

from project_runtime.app_factory import build_project_app
from project_runtime.knowledge_base import DEFAULT_KNOWLEDGE_BASE_PROJECT_FILE, load_knowledge_base_project


class ProjectRuntimeTest(unittest.TestCase):
    def test_load_default_project_config(self) -> None:
        project = load_knowledge_base_project(DEFAULT_KNOWLEDGE_BASE_PROJECT_FILE)

        self.assertEqual(project.metadata.project_id, "knowledge_base_basic")
        self.assertEqual(project.metadata.template, "knowledge_base_workbench")
        self.assertEqual(project.route.workbench, "/knowledge-base")
        self.assertEqual(project.route.api_prefix, "/api/knowledge")
        self.assertEqual(project.surface.layout_variant, "chat_first_knowledge_workbench")
        self.assertEqual(project.visual.brand, "ArchSync")
        self.assertEqual(len(project.documents), 3)
        self.assertTrue(project.features.upload)
        self.assertEqual(project.frontend_ir.module_id, "frontend.L2.M0")
        self.assertEqual(project.domain_ir.module_id, "knowledge_base.L2.M0")
        self.assertEqual(project.backend_ir.module_id, "backend.L2.M0")
        self.assertGreaterEqual(len(project.resolved_modules), 3)
        self.assertEqual(project.frontend_contract["shell"], "three_pane_workbench")
        self.assertEqual(project.workbench_contract["flow"][0]["stage_id"], "library")
        self.assertTrue(project.validation_reports["overall"]["passed"])

    def test_generic_project_app_factory_materializes_generated_artifacts(self) -> None:
        client = TestClient(build_project_app(DEFAULT_KNOWLEDGE_BASE_PROJECT_FILE))

        response = client.get("/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["project"]["project"]["project_id"], "knowledge_base_basic")
        self.assertEqual(payload["frontend"], "/knowledge-base")
        self.assertEqual(payload["workbench_spec"], "/api/knowledge/workbench-spec")
        self.assertEqual(payload["project"]["routes"]["api"]["create_document"], "/api/knowledge/documents")
        self.assertEqual(payload["project"]["routes"]["api"]["delete_document"], "/api/knowledge/documents/{document_id}")
        generated = payload["project"]["generated_artifacts"]
        self.assertIsNotNone(generated)
        assert generated is not None
        self.assertTrue(payload["project"]["validation_reports"]["overall"]["passed"])
        for rel_path in generated.values():
            self.assertTrue((Path.cwd() / rel_path).exists())

    def test_custom_instance_config_changes_routes_theme_and_generated_bundle(self) -> None:
        instance_toml = textwrap.dedent(
            """
            [project]
            project_id = "knowledge_base_public"
            template = "knowledge_base_workbench"
            display_name = "Knowledge Base Public"
            description = "A public workbench instance compiled from the same framework."
            version = "0.2.0"

            [framework]
            frontend = "framework/frontend/L2-M0-前端框架标准模块.md"
            domain = "framework/knowledge_base/L2-M0-知识库工作台场景模块.md"
            backend = "framework/backend/L2-M0-知识库接口框架标准模块.md"
            preset = "document_chat_workbench"

            [surface]
            shell = "three_pane_workbench"
            layout_variant = "chat_first_knowledge_workbench"
            sidebar_width = "md"
            preview_mode = "docked"
            density = "comfortable"

            [surface.copy]
            hero_kicker = "Public Instance"
            hero_title = "Knowledge Base Public"
            hero_copy = "A public workbench instance compiled from the same framework."
            library_title = "Public Files"
            preview_title = "Source Viewer"
            toc_title = "TOC"
            chat_title = "Public Chat"
            empty_state_title = "Select a document"
            empty_state_copy = "The preview and citations will focus on the current document and section."

            [visual]
            brand = "Public KB"
            accent = "#1357be"
            surface_preset = "light"
            radius_scale = "lg"
            shadow_level = "md"
            font_scale = "md"

            [route]
            home = "/"
            workbench = "/public-knowledge"
            api_prefix = "/api/public-knowledge"
            workbench_spec = "/api/public-knowledge/workbench-spec"

            [a11y]
            reading_order = ["library", "toc", "preview", "chat"]
            keyboard_nav = ["library-query", "document-card", "toc-item", "chat-input"]
            announcements = ["current document", "current section", "citation return path"]

            [library]
            enabled = true
            source_types = ["markdown"]
            metadata_fields = ["title", "tags", "updated_at"]
            default_focus = "first_document"
            list_variant = "stacked"
            allow_create = false
            allow_delete = false

            [library.copy]
            search_placeholder = "Search public files"

            [preview]
            enabled = true
            renderers = ["markdown"]
            anchor_mode = "heading"
            show_toc = true
            rail_variant = "sticky"

            [chat]
            enabled = true
            citations_enabled = true
            mode = "retrieval_stub"
            citation_style = "cards"
            bubble_variant = "assistant_soft"
            composer_variant = "expanded"
            system_prompt = "Answer from the current public knowledge document."

            [chat.copy]
            placeholder = "Ask the public knowledge base"
            welcome = "Ask a question about the selected public document. The answer will cite concrete sections."

            [context]
            selection_mode = "manual_plus_auto"
            max_citations = 2
            max_preview_sections = 8
            sticky_document = true

            [return]
            enabled = true
            targets = ["preview_anchor", "toc"]
            anchor_restore = true
            citation_card_variant = "stacked"

            [[documents]]
            document_id = "public-guidance"
            title = "Public Guidance"
            summary = "A public instance still uses the same framework chain and anchor-return loop."
            tags = ["public", "framework"]
            updated_at = "2026-03-07"
            body_markdown = \"\"\"
            ## Public Contract
            The public workbench keeps one library, one preview, and one chat region.

            ## Return Path
            Citations must still return to concrete preview anchors.
            \"\"\"
            """
        ).strip()

        with tempfile.TemporaryDirectory() as temp_dir:
            instance_file = Path(temp_dir) / "instance.toml"
            instance_file.write_text(instance_toml, encoding="utf-8")

            project = load_knowledge_base_project(instance_file)
            self.assertEqual(project.visual.brand, "Public KB")
            self.assertEqual(project.route.workbench, "/public-knowledge")
            self.assertEqual(len(project.documents), 1)
            self.assertTrue(project.validation_reports["overall"]["passed"])

            client = TestClient(build_project_app(instance_file))

            root_response = client.get("/")
            self.assertEqual(root_response.status_code, 200)
            root_payload = root_response.json()
            self.assertEqual(root_payload["frontend"], "/public-knowledge")
            self.assertEqual(root_payload["workbench_spec"], "/api/public-knowledge/workbench-spec")
            generated = root_payload["project"]["generated_artifacts"]
            self.assertIsNotNone(generated)
            assert generated is not None
            self.assertTrue((instance_file.parent / "generated" / "project_bundle.py").exists())

            page_response = client.get("/public-knowledge")
            self.assertEqual(page_response.status_code, 200)
            self.assertIn("Knowledge Base Public", page_response.text)
            self.assertIn("Public KB", page_response.text)

            documents_response = client.get("/api/public-knowledge/documents")
            self.assertEqual(documents_response.status_code, 200)
            documents = documents_response.json()
            self.assertEqual(len(documents), 1)
            self.assertEqual(documents[0]["document_id"], "public-guidance")

            chat_response = client.post(
                "/api/public-knowledge/chat/turns",
                json={
                    "message": "How does the return path work?",
                    "document_id": "public-guidance",
                    "section_id": "return-path",
                },
            )
            self.assertEqual(chat_response.status_code, 200)
            chat_payload = chat_response.json()
            self.assertTrue(chat_payload["citations"])
            self.assertIn("/public-knowledge?document=public-guidance&section=return-path", chat_payload["citations"][0]["return_path"])

    def test_rule_validation_rejects_non_conforming_instance_values(self) -> None:
        instance_toml = textwrap.dedent(
            """
            [project]
            project_id = "knowledge_base_invalid"
            template = "knowledge_base_workbench"
            display_name = "Knowledge Base Invalid"
            description = "A workbench instance that violates the framework rule chain."
            version = "0.2.0"

            [framework]
            frontend = "framework/frontend/L2-M0-前端框架标准模块.md"
            domain = "framework/knowledge_base/L2-M0-知识库工作台场景模块.md"
            backend = "framework/backend/L2-M0-知识库接口框架标准模块.md"
            preset = "document_chat_workbench"

            [surface]
            shell = "three_pane_workbench"
            layout_variant = "chat_first_knowledge_workbench"
            sidebar_width = "md"
            preview_mode = "docked"
            density = "comfortable"

            [surface.copy]
            hero_kicker = "Invalid Instance"
            hero_title = "Knowledge Base Invalid"
            hero_copy = "A workbench instance that violates the framework rule chain."
            library_title = "Knowledge Files"
            preview_title = "Source Viewer"
            toc_title = "TOC"
            chat_title = "Knowledge Chat"
            empty_state_title = "Select a document"
            empty_state_copy = "The preview and citations will focus on the current document and section."

            [visual]
            brand = "Invalid KB"
            accent = "#880000"
            surface_preset = "light"
            radius_scale = "md"
            shadow_level = "md"
            font_scale = "md"

            [route]
            home = "/"
            workbench = "/invalid"
            api_prefix = "/api/invalid"
            workbench_spec = "/api/invalid/workbench-spec"

            [a11y]
            reading_order = ["library", "toc", "preview", "chat"]
            keyboard_nav = ["library-query", "document-card", "toc-item", "chat-input"]
            announcements = ["current document", "current section", "citation return path"]

            [library]
            enabled = true
            source_types = ["markdown"]
            metadata_fields = ["title", "tags", "updated_at"]
            default_focus = "manual"
            list_variant = "stacked"
            allow_create = false
            allow_delete = false

            [library.copy]
            search_placeholder = "Search files"

            [preview]
            enabled = true
            renderers = ["markdown"]
            anchor_mode = "heading"
            show_toc = true
            rail_variant = "sticky"

            [chat]
            enabled = true
            citations_enabled = true
            mode = "retrieval_stub"
            citation_style = "cards"
            bubble_variant = "assistant_soft"
            composer_variant = "expanded"
            system_prompt = "Answer from the selected document."

            [chat.copy]
            placeholder = "Ask the selected document"
            welcome = "Ask a question and expect citations."

            [context]
            selection_mode = "manual_plus_auto"
            max_citations = 2
            max_preview_sections = 8
            sticky_document = true

            [return]
            enabled = true
            targets = ["preview_anchor", "toc"]
            anchor_restore = true
            citation_card_variant = "stacked"

            [[documents]]
            document_id = "invalid-doc"
            title = "Invalid Doc"
            summary = "This document still has anchors and citations but the library focus is wrong."
            tags = ["invalid", "framework"]
            updated_at = "2026-03-07"
            body_markdown = \"\"\"
            ## Wrong Focus
            The document body still has headings.

            ## Return Path
            Citations still return to anchors.
            \"\"\"
            """
        ).strip()

        with tempfile.TemporaryDirectory() as temp_dir:
            instance_file = Path(temp_dir) / "instance.toml"
            instance_file.write_text(instance_toml, encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "knowledge_base\\.R1"):
                load_knowledge_base_project(instance_file)


if __name__ == "__main__":
    unittest.main()
