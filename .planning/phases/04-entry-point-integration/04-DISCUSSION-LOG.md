# Phase 4: Entry Point Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 04-entry-point-integration
**Areas discussed:** ENTR-03 Handling, Integration Strategy, Code Removal, Verification

---

## ENTR-03 (广场入口) Handling

| Option | Description | Selected |
|--------|-------------|----------|
| 跳过广场入口 | ENTR-03 标记为 NOT_IMPLEMENTED，Phase 4 只整合两个入口 | ✓ |
| 重构广场入口 | 重构 ReverseParseRouteDeps 为函数式接口 | |
| 桥接适配器 | 创建桥接适配器包装 videoReverseAnalysisService | |

**User's choice:** 跳过广场入口 (Recommended)
**Notes:** Symmetric with Phase 2 SquareRouteAdapter and Phase 3 mapToSquareResult NOT_IMPLEMENTED status

---

## Integration Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| 内部替换 | 保留现有函数签名，内部调用核心管道 | |
| 完全重写 | 重写入口函数，直接暴露核心管道 API | ✓ |

**User's choice:** 完全重写
**Notes:** More thorough refactoring, directly expose core pipeline API

---

## Code Removal Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| 删除重复代码 | 删除下载、base64、LLM、JSON 解析代码，保留入口特有逻辑 | ✓ |
| 保留备份 | 保留原有代码作为注释或 fallback | |

**User's choice:** 删除重复代码 (Recommended)
**Notes:** Remove duplicate code, keep entry-specific logic (OSS upload, script library save)

---

## Verification Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| 仅编译验证 | TypeScript 类型检查 + 确认核心管道被调用 | ✓ |
| 编写特征测试 | 为每个入口点编写特征测试 | |

**User's choice:** 仅编译验证 (Recommended)
**Notes:** Phase 0 tests were skipped, no new tests to be written

---

## Claude's Discretion

- 具体的函数签名调整细节
- 入口特有逻辑的保留边界
- 错误处理的映射细节

## Deferred Ideas

### ENTR-03 (广场入口)
- Marked as NOT_IMPLEMENTED_ARCHITECTURAL_MISMATCH
- Future refactoring needed to convert ReverseParseRouteDeps to function-based interface