from __future__ import annotations

import unittest

from framework_packages import PackageConfigContract, PackageConfigFieldRule
from project_runtime.package_config import resolve_config_slice


class PackageConfigContractTest(unittest.TestCase):
    def test_defaults_and_optionals_are_materialized(self) -> None:
        root_payload = {
            "truth": {
                "surface": {
                    "shell": "conversation_sidebar_shell",
                    "layout_variant": "chatgpt_knowledge_client",
                }
            }
        }
        contract = PackageConfigContract(
            fields=(
                PackageConfigFieldRule(path="truth.surface.shell", presence="required"),
                PackageConfigFieldRule(path="truth.surface.layout_variant", presence="optional"),
                PackageConfigFieldRule(path="truth.surface.preview_mode", presence="default", default_value="drawer"),
            ),
        )
        resolved = resolve_config_slice(root_payload, contract=contract, package_id="frontend.L2.M0")
        self.assertEqual(resolved["truth.surface.shell"], "conversation_sidebar_shell")
        self.assertEqual(resolved["truth.surface.layout_variant"], "chatgpt_knowledge_client")
        self.assertEqual(resolved["truth.surface.preview_mode"], "drawer")

    def test_field_level_contract_supports_required_optional_default_and_extra_rejection(self) -> None:
        root_payload = {
            "truth": {
                "surface": {
                    "shell": "conversation_sidebar_shell",
                    "layout_variant": "chatgpt_knowledge_client",
                    "sidebar_width": "md",
                }
            }
        }
        contract = PackageConfigContract(
            fields=(
                PackageConfigFieldRule(path="truth.surface.shell", presence="required"),
                PackageConfigFieldRule(path="truth.surface.layout_variant", presence="optional"),
                PackageConfigFieldRule(path="truth.surface.preview_mode", presence="default", default_value="drawer"),
                PackageConfigFieldRule(path="truth.surface.debug_mode", presence="forbidden"),
            ),
            covered_roots=("truth.surface",),
        )
        with self.assertRaisesRegex(ValueError, "undeclared config paths"):
            resolve_config_slice(root_payload, contract=contract, package_id="frontend.L2.M0")

    def test_forbidden_field_is_rejected(self) -> None:
        root_payload = {
            "truth": {
                "return": {
                    "enabled": True,
                    "targets": ["citation_drawer"],
                    "debug_target": "legacy",
                }
            }
        }
        contract = PackageConfigContract(
            fields=(
                PackageConfigFieldRule(path="truth.return.enabled", presence="required"),
                PackageConfigFieldRule(path="truth.return.targets", presence="required"),
                PackageConfigFieldRule(path="truth.return.debug_target", presence="forbidden"),
            ),
            covered_roots=("truth.return",),
        )
        with self.assertRaisesRegex(ValueError, "forbidden config path"):
            resolve_config_slice(root_payload, contract=contract, package_id="knowledge_base.L2.M0")


if __name__ == "__main__":
    unittest.main()
