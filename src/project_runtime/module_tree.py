from __future__ import annotations

from framework_ir import FrameworkModule, FrameworkRegistry
from project_runtime.models import ModuleSelection, ResolvedModuleRoot, ResolvedModuleTree


def resolve_framework_module(registry: FrameworkRegistry, ref: str) -> FrameworkModule:
    for module in registry.modules:
        if module.path == ref:
            return module
    raise ValueError(f"framework ref does not exist: {ref}")


def collect_framework_closure(registry: FrameworkRegistry, roots: tuple[FrameworkModule, ...]) -> tuple[FrameworkModule, ...]:
    ordered: list[FrameworkModule] = []
    seen: set[str] = set()

    def visit(module: FrameworkModule) -> None:
        if module.module_id in seen:
            return
        seen.add(module.module_id)
        for base in module.bases:
            for ref in base.upstream_refs:
                visit(registry.get_module(ref.framework, ref.level, ref.module))
        ordered.append(module)

    for root in roots:
        visit(root)
    return tuple(ordered)


def resolve_module_tree(registry: FrameworkRegistry, selection: ModuleSelection) -> ResolvedModuleTree:
    resolved_roots = tuple(
        ResolvedModuleRoot(
            slot_id=item.slot_id,
            role=item.role,
            framework_file=item.framework_file,
            module=resolve_framework_module(registry, item.framework_file),
        )
        for item in selection.roots
    )
    resolved_modules = collect_framework_closure(registry, tuple(item.module for item in resolved_roots))
    return ResolvedModuleTree(roots=resolved_roots, modules=resolved_modules)
