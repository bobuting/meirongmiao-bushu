# Phase 3: Mapper Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 03-mapper-layer
**Areas discussed:** File Organization, SquareRouteMapper Handling, Error Mapping, Input Parameters, Testing

---

## File Organization

| Option | Description | Selected |
|--------|-------------|----------|
| 单文件 | mapper.ts 包含三个函数：mapToBatchResult(), mapToCloneResult(), mapToSquareResult() | ✓ |
| 多文件 | batch-mapper.ts, clone-mapper.ts, square-mapper.ts 分离 | |

**User's choice:** 单文件 (Recommended)
**Notes:** Simple centralized approach suitable for straightforward mapping logic

---

## SquareRouteMapper Handling

| Option | Description | Selected |
|--------|-------------|----------|
| 占位映射器 | 创建占位类型和函数，返回错误结果并标记 NOT_IMPLEMENTED | ✓ |
| 完全跳过 | 直接跳过 SquareRouteMapper，Phase 4 整合时再处理 | |

**User's choice:** 占位映射器 (Recommended)
**Notes:** Symmetric with Phase 2 SquareRouteAdapter NOT_IMPLEMENTED status

---

## Error Mapping Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| 直接映射 | 映射器直接将 CoreReverseOutput.errorCode 转换为各入口点的错误格式 | ✓ |
| 带转换逻辑 | 映射器添加额外的错误描述转换逻辑 | |

**User's choice:** 直接映射 (Recommended)
**Notes:** Simple direct mapping without additional transformation logic

---

## Input Parameters

| Option | Description | Selected |
|--------|-------------|----------|
| 最小参数 | 映射器只接收 CoreReverseOutput + 少量必要参数 | ✓ |
| 扩展输入结构 | 映射器接收扩展输入结构，包含所有可能需要的字段 | |

**User's choice:** 最小参数 (Recommended)
**Notes:** Concise interface, caller provides additional context as needed

---

## Testing

| Option | Description | Selected |
|--------|-------------|----------|
| 包含单元测试 | 映射器文件附带 .test.ts 单元测试文件 | |
| Phase 4 再测试 | 测试在 Phase 4 整合时再编写 | ✓ |

**User's choice:** Phase 4 再测试
**Notes:** Pure functions are easy to test later; focus on mapping logic first

---

## Claude's Discretion

- 具体的映射函数签名细节
- 各入口点输出格式的字段映射细节
- 占位映射器的具体返回值结构

## Deferred Ideas

None — discussion stayed within phase scope.