# 脚本入库统一校验设计

## 问题背景

当前 `shot_breakdown` 数据校验只在专业提示词生成阶段（`generateShotPrompts`）触发，导致：

1. **错误暴露太晚** — 用户已确认脚本、点了批量预览才发现数据问题
2. **用户被卡住** — 确认后项目锁定，无法退回选其他脚本
3. **入库路径分散** — 7 处直接调 `batchInsertIfNotExists`，无统一校验
4. **校验逻辑重复** — `validateShotBreakdown` + `validateHumanSubjectBusinessRules` 仅在下游消费时调用

## 设计目标

- 坏数据不入库，从源头守门
- 校验方法统一，一处定义多处调用
- 用户不会因校验失败被卡住——确认时就知道脚本能不能用
- 不掩盖问题，失败原因透明

## 现状分析

### 脚本入库路径（7 处）

| # | 位置 | 场景 |
|---|------|------|
| 1 | `saveStep3ScriptsToDatabase`（step3-candidate/index.ts） | 10 种策略脚本统一入库 |
| 2 | `reverse-parse-routes.ts:698` | 反推脚本入库 |
| 3 | `reverse-parse-routes.ts:1000` | 反推脚本入库 |
| 4 | `reverse-parse-routes.ts:1321` | 反推脚本入库 |
| 5 | `step3-candidate/index.ts:294` | 确认路由-反推改写入库 |
| 6 | `step3-candidate/index.ts:878` | 确认路由-库脚本入库 |
| 7 | `step3-candidate/index.ts:1019` | 确认路由-选择脚本入库 |
| 8 | `fission-new-story-executor.ts:143` | 裂变新故事入库 |

### 10 种脚本类型

均通过 `callStrategy` → `saveStep3ScriptsToDatabase` 入库，`shot_breakdown` 结构统一为 `VideoScriptPayload["shot_breakdown"]`。

## 设计方案

### 1. 统一校验函数

新增 `validateScriptShotBreakdown`，复用现有校验逻辑：

```typescript
// src/contracts/shot-breakdown-schema.ts 或独立文件

interface ScriptValidationResult {
  valid: boolean;
  error?: string;
  details?: string[];  // 所有校验失败的详细信息
}

function validateScriptShotBreakdown(shotBreakdown: unknown): ScriptValidationResult {
  // shot_breakdown 是脚本核心数据，没有则脚本无效
  if (!shotBreakdown || !Array.isArray(shotBreakdown) || shotBreakdown.length === 0) {
    return { valid: false, error: "脚本缺少 shot_breakdown 数据", details: ["shot_breakdown 为空或非数组"] };
  }

  const details: string[] = [];

  // 1. Zod schema 校验（复用 validateShotBreakdown）
  const schemaResult = validateShotBreakdown(shotBreakdown);
  if (!schemaResult.success) {
    details.push(schemaResult.error!);
  }

  // 2. 业务规则校验（复用 validateHumanSubjectBusinessRules 逻辑）
  if (schemaResult.success) {
    for (const shot of schemaResult.data!) {
      if (!shot.subjects) continue;
      for (const subject of shot.subjects) {
        if (subject.type === "人物") {
          if (subject.person_id === undefined || subject.person_id === null) {
            details.push(`镜头 ${shot.shot_id} 主体 ${subject.subject_id ?? "?"}: 人物类型必须有 person_id`);
          }
          if (subject.eye_line === null || subject.eye_line === undefined) {
            details.push(`镜头 ${shot.shot_id} 主体 ${subject.subject_id ?? "?"}: 人物类型必须有 eye_line`);
          }
        }
      }
    }
  }

  if (details.length > 0) {
    return { valid: false, error: details[0], details };
  }
  return { valid: true };
}
```

### 2. 统一入库方法

在 `ScriptsDataDbService` 中新增 `insertWithValidation`：

```typescript
interface InsertWithValidationResult {
  insertedCount: number;
  invalidItems: Array<{
    candidateId: string;
    scriptType: number;
    error: string;
    details: string[];
  }>;
}

class ScriptsDataDbService {
  async insertWithValidation(items: InsertScriptDataItem[]): Promise<InsertWithValidationResult> {
    const validItems: InsertScriptDataItem[] = [];
    const invalidItems: InsertWithValidationResult['invalidItems'] = [];

    for (const item of items) {
      const shotBreakdown = item.payloadJson?.shot_breakdown;
      const result = validateScriptShotBreakdown(shotBreakdown);

      if (!result.valid) {
        log.error({
          candidateId: item.id,
          scriptType: item.type,
          details: result.details,
        }, "脚本 shot_breakdown 校验失败，跳过入库");

        invalidItems.push({
          candidateId: item.id,
          scriptType: item.type,
          error: result.error!,
          details: result.details!,
        });
      } else {
        validItems.push(item);
      }
    }

    const insertedCount = validItems.length > 0
      ? await this.batchInsertIfNotExists(validItems)
      : 0;

    return { insertedCount, invalidItems };
  }
}
```

**关键决策**：
- 校验失败 → 不入库 + 记日志 + 返回失败详情
- `batchInsertIfNotExists` 保留不动，仅供 `insertWithValidation` 内部调用
- `shot_breakdown` 为空也视为校验失败，脚本核心数据不可缺失

### 3. 迁移入库调用

8 处 `batchInsertIfNotExists` 调用迁移为 `insertWithValidation`：

| # | 文件 | 行为 |
|---|------|------|
| 1 | `saveStep3ScriptsToDatabase` | 迁移，校验失败条目不入库 |
| 2-4 | `reverse-parse-routes.ts` ×3 | 迁移，校验失败条目不入库 |
| 5-7 | `step3-candidate/index.ts` ×3 | 迁移，校验失败条目不入库 |
| 8 | `fission-new-story-executor.ts` | 迁移，校验失败条目不入库 |

### 4. 确认路由增加提示词验证

在 `POST /step3/candidates/confirm` 中，确认前增加提示词生成验证：

```
用户点确认
  → 尝试生成专业提示词
    → 成功：保存提示词 + 确认锁定 + 返回成功
    → 失败：拒绝确认 + 返回错误信息
      → 前端提示「该脚本的提示词生成失败：{具体原因}，请选择其他候选脚本」
      → 用户仍在候选列表，可以选其他脚本
```

**关键决策**：
- 确认时就知道脚本能不能跑通，不能用的不确认
- 不需要回退机制——坏状态根本不发生
- 状态单向推进，不会出现锁定后又解锁的复杂情况

### 5. 专业提示词生成后校验（兜底）

`generateShotPrompts` 中移除 `validateShotBreakdown` 和 `validateHumanSubjectBusinessRules`（入库已保证合规），保留：
- `remapPersonIdsForUserPriority` — 业务逻辑（person_id 重映射）
- `ensureOutfitAnchor` — 业务逻辑（服饰锚点修正）
- `analyzeCharacters` — 移除内部 `validateShotBreakdown` 调用，只保留角色频率统计
- `validateFinalOutput` — 校验提示词 LLM 的输出（新产出物，仍需校验）

提示词 LLM 输出校验失败时：
```
校验失败：
  1. 不保存坏提示词
  2. 返回 { success: false, error: 具体原因 }
  3. 上层（确认路由 / 批量预览）处理失败结果
  4. 日志记录完整 LLM 输出 + 校验失败原因（开发者闭环，修 Skill）
```

**不重试**：相同输入 + 相同 LLM 大概率输出相同格式的错误，重试无意义。根本原因在 Skill 提示词或 Schema，应通过日志定位后修复。

## 三层校验体系

| 层级 | 时机 | 校验内容 | 失败措施 |
|------|------|---------|---------|
| 第一层 | 入库 | `shot_breakdown` 数据结构合规性 | 不入库 + 记日志 |
| 第二层 | 确认 | 提示词能否生成（可运行性验证） | 拒绝确认 + 提示用户换脚本 |
| 第三层 | 提示词生成后 | LLM 输出合规性 | 不保存 + 重试 + 上层处理 |

三层使用同一个 `validateScriptShotBreakdown` 函数，校验逻辑统一。

## `analyzeCharacters` 改造

当前 `analyzeCharacters` 内部调用 `validateShotBreakdown`，入库校验后该步骤冗余。

改造：
- 移除 `analyzeCharacters` 中的 `validateShotBreakdown` 调用
- 保留核心职责：统计角色频率 + 返回 `CharacterMatchResult`
- 如需防御性检查，改为 `log.warn` 而非 `throw`（信任入库数据）

## 改动范围

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/contracts/shot-breakdown-schema.ts` | 新增 | `validateScriptShotBreakdown` 统一校验函数 |
| `src/service/scripts-data-db-service.ts` | 新增 | `insertWithValidation` 方法 |
| `src/routes/step3-candidate/index.ts` | 修改 | `saveStep3ScriptsToDatabase` 迁移 + confirm 加提示词验证 |
| `src/routes/reverse-parse-routes.ts` | 修改 | 3 处调用迁移 |
| `src/modules/fission-video/fission-new-story-executor.ts` | 修改 | 1 处调用迁移 |
| `src/modules/video-step/step3/character-matching-service.ts` | 修改 | `analyzeCharacters` 移除 validateShotBreakdown |
| `src/modules/video-step/step3/shot-prompt-engineer-service.ts` | 修改 | 移除冗余校验，保留业务逻辑 |
| `src/modules/video-step/step3-emotion-archetype/storyboard-validator.ts` | 不改 | 该校验针对分镜质量，非数据合规，保持不变 |

## 风险评估

| 风险 | 应对 |
|------|------|
| 旧脚本无 `shot_breakdown` | `validateScriptShotBreakdown` 对空值视为校验失败，不入库；旧脚本如有问题需单独修复 |
| 确认路由加提示词验证增加耗时 | 提示词生成约 30s-60s，前端加 loading 状态；失败不重试，避免无效等待 |
| 各脚本类型 `shot_breakdown` 结构差异 | 已验证均为 `VideoScriptPayload["shot_breakdown"]`，统一 |
| `analyzeCharacters` 移除校验后下游异常 | 入库已保证合规，信任数据；如出现异常说明入库校验有漏洞，应修复入库层 |
