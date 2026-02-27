# Shelf

本仓库采用“多级严格映射”规范，而不是仅双层标准。

## 多级规范结构
- `L0` 通用标准：[framework_design_standard.md](framework_design_standard.md)
- `L1` 领域标准：[shelf_framework_standard.md](shelf_framework_standard.md)
- `L2` 领域实现：`shelf_framework.py`、`main.py`、`scripts/validate_strict_mapping.py`
- `L3` 运行证据：`docs/logic_record.json`

## 强制规则
- `L0` 改动，必须同步修改 `L1` 与 `L2`。
- `L1` 改动，必须同步修改 `L2`。
- `L2/L3` 改动，必须执行反向验证。

## 映射与验证
- 映射注册：`mapping_registry.json`
- 标准验证：
```bash
uv run python scripts/validate_strict_mapping.py
uv run python scripts/validate_strict_mapping.py --check-changes
```

## 运行
```bash
uv sync
uv run python main.py
```
