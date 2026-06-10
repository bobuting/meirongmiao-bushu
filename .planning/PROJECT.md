# 统一反推调用层

## What This Is

统一 AI 电商短视频生成平台的三个视频反推入口，共享核心 LLM 反推流程。三个入口包括：定时任务批量反推热榜视频、广场输入框单视频反推、广场作品复刻按钮反推。

## Core Value

**改动一处，三个入口同步受益。** 统一核心流程后，任何 LLM 反推逻辑的优化、修复、调试都能同时影响三个入口，无需重复维护。

## Requirements

### Validated

- ✓ 定时任务批量反推热榜视频 — 现有实现：`sync-service.ts` 的 `processVideo` 流程
- ✓ 广场输入框单视频反推 — 现有实现：`reverse-parse-routes.ts` 的 `/reverse/parse-v2/jobs`
- ✓ 广场作品复刻按钮反推 — 现有实现：`single-reverse-service.ts` 的 `runSingleVideoLlmReverse`

### Active

- [ ] 提取统一的核心反推流程（视频下载 → base64 → LLM → JSON 解析 → 输出标准化）
- [ ] 定义统一的依赖注入接口
- [ ] 三层入口适配统一流程（保持各自入口特性，核心共享）
- [ ] 移除重复代码，保持单一维护点

### Out of Scope

- 任务队列/进度追踪统一 — 各入口保持现有异步机制
- 数据存储模型统一 — 现有表结构不变
- 前端 API 调用统一 — 保持现有前端调用方式

## Context

### 现有三入口架构

| 入口 | 调用路径 | 核心函数 | 文件位置 |
|------|----------|----------|----------|
| 定时任务批量反推 | `hot-trend-sync.ts` → `sync-service.ts` | `processVideo()` | `src/modules/video-hot-trend/` |
| 广场输入框反推 | `/reverse/parse-v2/jobs` | 反推路由处理 | `src/routes/reverse-parse-routes.ts` (1372 行) |
| 复刻按钮反推 | `/reverse/llm-reverse` → `single-reverse-service.ts` | `runSingleVideoLlmReverse()` | `src/modules/video-hot-trend/single-reverse-service.ts` |

### 核心流程重叠

三个入口都执行相同的核心流程：
1. 视频下载（可能需要 URL 解析，如抖音短链）
2. base64 内联编码
3. 多模态 LLM 调用（Gemini 或 OpenAI 路径）
4. JSON 结果解析
5. 输出标准化（映射为前端兼容格式）

### 现有代码问题

- `single-reverse-service.ts` 从 `sync-service.ts` 提取，两者有代码重叠
- `reverse-parse-routes.ts` 有独立的实现（1372 行，超大文件）
- 依赖注入接口不一致（`SingleVideoReverseDeps` vs `VideoHotTrendSyncDeps`）
- `normalizeLlmReverseOutput` 已共享，但调用方式不同

## Constraints

- **技术栈**: Node.js + Fastify 5 + TypeScript 5 + PostgreSQL
- **LLM 调用**: Gemini/OpenAI 多模态视频分析
- **文件约束**: `app.ts` 只减不增，路由放 `src/routes/`
- **不破坏现有入口**: 各入口保持独立路由和前端调用方式

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 核心流程统一 | 三个入口共享同一套 LLM 反推逻辑 | — Pending |
| 依赖注入统一 | 定义通用接口，各入口适配 | — Pending |
| 保持入口独立 | 路由层不变，仅核心层统一 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-06 after initialization*