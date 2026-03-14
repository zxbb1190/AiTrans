# 全仓 rewrite 收口执行账本

审查基准文档：

- [最终架构重构验收标准.md](./最终架构重构验收标准.md)

当前剩余任务已经全部收口，主路径保持为：

```text
Framework Markdown
  -> framework registry
    -> module tree selection
      -> config slicing
        -> package compile
          -> package exports
            -> runtime assembly
              -> canonical graph
                -> derived views / validation / materialization
```

## 当前剩余任务

- [x] 拆掉 `src/project_runtime/knowledge_base.py` 作为大编排器
  - 主编译链已迁移到 `src/project_runtime/pipeline.py`
  - 配置加载、模块树解析、config slicing、package compile、runtime assembly、canonical build 已拆到独立模块

- [x] 把 runtime projection 改成从 package exports 自然收敛
  - `frontend.L2.M0 / knowledge_base.L2.M0 / backend.L2.M0` 现在直接在 package compile 阶段产出 `runtime_exports`
  - runtime bundle 改由 `assemble_runtime_exports(...)` 从 package compile 结果汇总

- [x] 把固定三槽位根模块选择改成一般化模块树选择
  - `projects/knowledge_base_basic/project.toml` 已改为 `[[selection.roots]]`
  - 编译器通过 `ResolvedModuleTree` 解析 roots 与 framework closure，不再硬编码 `frontend / knowledge_base / backend` 三槽位结构

- [x] 强化 `PackageConfigContract`
  - 已升级为字段级 `fields + covered_roots + allow_extra_paths`
  - 支持 `required / optional / default / forbidden`
  - `resolve_config_slice(...)` 会执行字段级合法性校验、默认值注入和额外字段拒绝

- [x] 补上每个 package 只有一个唯一入口 class 的独立 validator
  - 已新增 `src/framework_packages/validators.py`
  - `validate_unique_package_entry_classes(...)` 已接入 registry 验证链与测试

## 收口结果

- [x] `scripts/materialize_project.py` 已切换到通用 project pipeline
- [x] `scripts/validate_strict_mapping.py` 已切换到通用 project pipeline
- [x] 旧手工 builder `src/frontend_kernel/contracts.py` 与 `src/knowledge_base_framework/workbench.py` 已删除
- [x] 旧知识库大编排入口已降级为兼容 re-export
- [x] `generated/*` 继续只由 materialize 主链生成
