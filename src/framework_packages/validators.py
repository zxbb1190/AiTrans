from __future__ import annotations

import importlib
import inspect

from .registry import FrameworkPackageRegistry
from .static import StaticFrameworkPackage


def validate_unique_package_entry_classes(registry: FrameworkPackageRegistry) -> None:
    errors: list[str] = []
    for registration in registry.iter_registrations():
        module = importlib.import_module(registration.package_module)
        entry_classes = [
            obj
            for _, obj in inspect.getmembers(module, inspect.isclass)
            if issubclass(obj, StaticFrameworkPackage)
            and obj is not StaticFrameworkPackage
            and obj.__module__ == module.__name__
        ]
        if len(entry_classes) != 1:
            errors.append(
                f"{registration.package_module} must expose exactly one package entry class, found {len(entry_classes)}"
            )
            continue
        if entry_classes[0].__name__ != registration.entry_class_name:
            errors.append(
                f"{registration.package_module} registered {registration.entry_class_name} but formal entry is {entry_classes[0].__name__}"
            )
    if errors:
        raise ValueError("package entry validation failed: " + " | ".join(errors))
