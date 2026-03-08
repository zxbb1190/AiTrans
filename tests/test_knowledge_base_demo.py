from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from knowledge_base_demo.app import build_knowledge_base_demo_app


class KnowledgeBaseDemoTest(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(build_knowledge_base_demo_app())

    def test_frontend_page_contains_generated_workbench_regions(self) -> None:
        response = self.client.get("/knowledge-base")
        self.assertEqual(response.status_code, 200)
        self.assertIn("Knowledge Base Workbench", response.text)
        self.assertIn("Knowledge Files", response.text)
        self.assertIn("Add Source", response.text)
        self.assertIn("Ask With Citations", response.text)
        self.assertIn("ChatGPT-style knowledge workspace", response.text)

    def test_root_exposes_project_summary(self) -> None:
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["project"]["project"]["project_id"], "knowledge_base_basic")
        self.assertEqual(payload["frontend"], "/knowledge-base")
        self.assertEqual(payload["workbench_spec"], "/api/knowledge/workbench-spec")

    def test_list_documents_supports_filtering(self) -> None:
        response = self.client.get("/api/knowledge/documents", params={"tag": "framework"})
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertGreaterEqual(len(payload), 1)
        self.assertTrue(all("framework" in item["tags"] for item in payload))

    def test_get_document_detail_and_section(self) -> None:
        response = self.client.get("/api/knowledge/documents/framework-language")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["document_id"], "framework-language")
        self.assertGreaterEqual(len(payload["sections"]), 2)

        section_response = self.client.get("/api/knowledge/documents/framework-language/sections/compilation-pipeline")
        self.assertEqual(section_response.status_code, 200)
        section = section_response.json()
        self.assertEqual(section["section_id"], "compilation-pipeline")
        self.assertIn("generated workbench spec", section["plain_text"])

    def test_create_and_delete_document(self) -> None:
        create_response = self.client.post(
            "/api/knowledge/documents",
            json={
                "title": "Uploaded Source",
                "summary": "A source added from the chat-first workbench should become searchable and citeable.",
                "tags": ["upload", "knowledge-base"],
                "body_markdown": "## Source Contract\\nUploaded files become previewable and citeable.\\n\\n## Return Path\\nCitations still reopen the source anchor.",
            },
        )
        self.assertEqual(create_response.status_code, 201)
        created = create_response.json()
        self.assertEqual(created["title"], "Uploaded Source")

        list_response = self.client.get("/api/knowledge/documents", params={"query": "uploaded"})
        self.assertEqual(list_response.status_code, 200)
        listed = list_response.json()
        self.assertEqual(listed[0]["document_id"], created["document_id"])

        delete_response = self.client.delete(f"/api/knowledge/documents/{created['document_id']}")
        self.assertEqual(delete_response.status_code, 200)
        deleted = delete_response.json()
        self.assertTrue(deleted["deleted"])

        missing_response = self.client.get(f"/api/knowledge/documents/{created['document_id']}")
        self.assertEqual(missing_response.status_code, 404)

    def test_chat_turn_returns_citations_with_return_paths(self) -> None:
        response = self.client.post(
            "/api/knowledge/chat/turns",
            json={
                "message": "Explain the compilation pipeline and return path.",
                "document_id": "framework-language",
                "section_id": "compilation-pipeline",
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("strongest evidence", payload["answer"].lower())
        self.assertGreaterEqual(len(payload["citations"]), 1)
        self.assertEqual(payload["citations"][0]["document_id"], "framework-language")
        self.assertIn("/knowledge-base?document=framework-language", payload["citations"][0]["return_path"])

    def test_workbench_spec_exposes_verification_evidence(self) -> None:
        response = self.client.get("/api/knowledge/workbench-spec")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["project"]["project"]["project_id"], "knowledge_base_basic")
        self.assertEqual(len(payload["workspace_flow"]), 3)
        self.assertTrue(payload["frontend_verification"]["passed"])
        self.assertTrue(payload["workspace_verification"]["passed"])
        self.assertTrue(payload["backend_verification"]["passed"])
        self.assertTrue(payload["project"]["generated_artifacts"])
        self.assertTrue(payload["project"]["validation_reports"]["overall"]["passed"])


if __name__ == "__main__":
    unittest.main()
