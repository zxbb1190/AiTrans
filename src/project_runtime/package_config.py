from __future__ import annotations

from typing import Any

from framework_packages.contract import PackageConfigContract
from project_runtime.models import jsonable
from project_runtime.utils import flatten_config_paths, lookup_dotted_path


def resolve_config_slice(
    root_payload: dict[str, Any],
    *,
    contract: PackageConfigContract,
    package_id: str,
) -> dict[str, Any]:
    flattened = flatten_config_paths(root_payload)
    declared_paths = {item.path for item in contract.fields}
    resolved: dict[str, Any] = {}

    for item in contract.fields:
        path = item.path
        if item.presence == "required":
            try:
                resolved[path] = jsonable(lookup_dotted_path(root_payload, path))
            except KeyError as exc:
                raise ValueError(f"missing required config path for {package_id}: {path}") from exc
            continue
        if item.presence == "optional":
            try:
                resolved[path] = jsonable(lookup_dotted_path(root_payload, path))
            except KeyError:
                continue
            continue
        if item.presence == "default":
            try:
                resolved[path] = jsonable(lookup_dotted_path(root_payload, path))
            except KeyError:
                resolved[path] = jsonable(item.default_value)
            continue
        if item.presence == "forbidden" and path in flattened:
            raise ValueError(f"forbidden config path for {package_id}: {path}")
        if item.presence not in {"required", "optional", "default", "forbidden"}:
            raise ValueError(f"unsupported contract presence for {package_id}: {item.presence}")

    if contract.allow_extra_paths:
        return resolved

    extra_paths = sorted(
        path
        for path in flattened
        if _is_under_covered_root(path, contract.covered_roots)
        and path not in declared_paths
    )
    if extra_paths:
        raise ValueError(f"undeclared config paths for {package_id}: {', '.join(extra_paths)}")
    return resolved


def _is_under_covered_root(path: str, covered_roots: tuple[str, ...]) -> bool:
    for root in covered_roots:
        if path == root or path.startswith(f"{root}."):
            return True
    return False
