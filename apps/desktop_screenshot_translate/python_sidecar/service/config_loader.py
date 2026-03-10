from __future__ import annotations

from dataclasses import dataclass
import importlib.util
import json
from pathlib import Path
from types import ModuleType
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[4]
PROJECT_ROOT = REPO_ROOT / "projects" / "desktop_screenshot_translate"
GENERATED_DIR = PROJECT_ROOT / "generated"


@dataclass(frozen=True)
class LoadedRuntimeBundle:
    project_spec: dict[str, Any]
    implementation_config: dict[str, Any]
    runtime_bundle: dict[str, Any]
    generated_dir: Path


def _load_module(module_path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location("desktop_screenshot_translate_bundle", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"failed to create import spec for {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_runtime_bundle() -> LoadedRuntimeBundle:
    product_spec_path = GENERATED_DIR / "product_spec.json"
    implementation_bundle_path = GENERATED_DIR / "implementation_bundle.py"
    if not product_spec_path.exists():
        raise FileNotFoundError(f"missing generated product spec: {product_spec_path}")
    if not implementation_bundle_path.exists():
        raise FileNotFoundError(f"missing generated implementation bundle: {implementation_bundle_path}")

    product_spec = json.loads(product_spec_path.read_text(encoding="utf-8"))
    module = _load_module(implementation_bundle_path)
    implementation_config = getattr(module, "IMPLEMENTATION_CONFIG")
    runtime_bundle = getattr(module, "RUNTIME_BUNDLE")
    if not isinstance(implementation_config, dict) or not isinstance(runtime_bundle, dict):
        raise RuntimeError("generated implementation bundle must expose IMPLEMENTATION_CONFIG and RUNTIME_BUNDLE dicts")
    return LoadedRuntimeBundle(
        project_spec=product_spec,
        implementation_config=implementation_config,
        runtime_bundle=runtime_bundle,
        generated_dir=GENERATED_DIR,
    )
