# Phase 2: Adapter Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 02-adapter-layer
**Mode:** discuss
**Areas discussed:** 文件组织, 命名规范

---

## 文件组织

| Option | Description | Selected |
|--------|-------------|----------|
| video-reverse-core/ 目录下 | 与核心模块同一目录，便于统一管理和导入。适配器与核心管道紧密配合，放在一起更内聚 | ✓ |
| 各入口目录下 | 各适配器放在各自入口目录下（如 video-hot-trend/adapters/）。适配器与入口点更近，但分散维护 | |
| src/adapters/ 独立目录 | 创建新的 adapters/ 目录与 video-reverse-core/ 并列。清晰分离适配层和核心层 | |

**User's choice:** `video-reverse-core/ 目录下`
**Notes:** 用户选择与核心模块保持内聚

---

## 命名规范

| Option | Description | Selected |
|--------|-------------|----------|
| {功能名}-adapter.ts | 突出适配器实现的功能，如 batch-reverse-adapter.ts | ✓ |
| {入口名}-adapter.ts | 文件名清晰表示包装的源接口，如 batch-sync-adapter.ts | |

**User's choice:** `{功能名}-adapter.ts`
**Notes:** 用户选择功能导向命名

---

## Areas Not Discussed (Claude's Discretion)

以下区域用户选择留给 planner 决定：
- 适配器粒度 — 具体方法映射实现细节
- 广场路由特殊处理 — ReverseParseRouteDeps 架构差异的处理方式
- 错误处理 — 适配器层的错误包装方式

---

## Claude's Discretion

- 具体的方法映射实现细节
- 错误处理在适配器层的包装方式
- 类型转换的边界条件处理

## Deferred Ideas

None.