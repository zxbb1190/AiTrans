# 置物架框架标准（领域版，L1）

## 0. 规范关系（强制）
本文件是置物架领域标准（L1），必须遵循：
- `framework_design_standard.md`（L0）

冲突处理：
- 若本文件与 L0 冲突，以 L0 为准。

## 1. 领域目标（G）
定义一种可拆卸组装的开放式立体堆叠装置，用于提升单位占地面积下的存取效率。

代码映射：`Goal`

## 2. 领域边界（B）
- `N`：层数（`BoundaryDefinition.layers_n`）
- `P`：每层承重（`BoundaryDefinition.payload_p_per_layer`）
- `S`：每层空间（`BoundaryDefinition.space_s_per_layer`，`Space3D`）
- `O`：开口尺寸（`BoundaryDefinition.opening_o`，`Opening2D`）
- `A`：占地面积（`BoundaryDefinition.footprint_a`，`Footprint2D`）

约束：所有边界参数必须可测量、可校验。

## 3. 领域模块（M）
- `M1` 杆（`Module.ROD`）：承重支撑
- `M2` 连接接口（`Module.CONNECTOR`）：连接结构件
- `M3` 隔板（`Module.PANEL`）：承载物品

## 4. 领域规则（R）
- `R1`：模块不应孤立存在（组合大小至少为 2）
- `R2`：可用组合必须包含连接接口

## 5. 领域假设与验证（H/V）

### 假设（H）
- `H1`：在边界有效且组合有效条件下，存取效率应优于基线。

### 验证（V）
验证输入：边界、候选组合、有效组合集、基线效率、目标效率。  
通过条件：
- 边界有效
- 组合有效
- `target_efficiency > baseline_efficiency`

## 6. 结论与逻辑记录（C）
逻辑链：
`G -> B1~B5 -> M1~M3 -> R1~R2 -> H1 -> V1 -> C`

自洽约束：
- `step_id` 唯一
- `depends_on` 只允许引用前序步骤
- 禁止无证据结论

## 7. 多级严格映射矩阵（L0 -> L1 -> L2）

| 映射ID | L0 抽象项 | L1 章节 | L2 实现符号 |
|---|---|---|---|
| MAP-G | `G` Goal | 1. 领域目标（G） | `Goal`, `goal = Goal(...)` |
| MAP-B | `B` Boundary | 2. 领域边界（B） | `BoundaryDefinition`, `Space3D`, `Opening2D`, `Footprint2D` |
| MAP-M | `M` Module | 3. 领域模块（M） | `Module`, `MODULE_ROLE` |
| MAP-R | `R` Rule | 4. 领域规则（R） | `Rule`, `CombinationRules.default()` |
| MAP-HV | `H`/`V` | 5. 领域假设与验证（H/V） | `Hypothesis`, `VerificationInput`, `VerificationResult`, `verify()` |
| MAP-C | `C` Conclusion | 6. 结论与逻辑记录（C） | `LogicStep`, `LogicRecord`, `build_logic_record()` |

机器可读映射：`mapping_registry.json`

## 8. 变更规则（强制）

### 8.1 顶层向下传导
- L0 变更：必须同步修改 L1 与 L2。
- L1 变更：必须同步修改 L2。

### 8.2 反向变更验证
- L2 或 L3 变更：必须运行反向验证，证明不违反 L0/L1。
- 反向验证命令：
```bash
uv run python scripts/validate_strict_mapping.py
uv run python scripts/validate_strict_mapping.py --check-changes
```

## 9. 运行与证据产物（L3）
```bash
uv sync
uv run python main.py
```

证据文件：
- `docs/logic_record.json`

## 10. 最小验收标准（置物架）
- `N/P/S/O/A` 全部可校验且有效
- 候选组合可通过规则筛选
- 验证结果可解释（含失败原因）
- 严格映射验证通过
