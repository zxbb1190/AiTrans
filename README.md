# Shelf

本仓库采用“多级严格映射”规范。

## 规范入口
- 规范总纲（树形）：`standards_tree.md`
- 框架设计核心标准：`framework_design_standard.md`
- 领域标准（置物架）：`shelf_framework_standard.md`
- 工程执行规范：`AGENTS.md`

## 映射与验证
- 映射注册：`mapping_registry.json`
- 验证命令：
```bash
uv run python scripts/validate_strict_mapping.py
uv run python scripts/validate_strict_mapping.py --check-changes
```

## 运行
```bash
uv sync
uv run python main.py
```
