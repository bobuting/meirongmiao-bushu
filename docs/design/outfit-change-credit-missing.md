# 换装项目视频编辑缺失积分统计

**发现时间**：2026-05-19

## 问题描述

换装项目的视频编辑功能（`outfit_change_video_edit`）缺失积分统计，导致用户免费使用视频编辑功能。

## 影响范围

| 操作 | RouteKey | 是否有积分统计 | 说明 |
|------|-----------|--------------|------|
| **图片生成** | `outfit_change_image_generation` | ✅ 有 | 通过 `requestLlmImageGenerationUrl` 自动处理 |
| **视频编辑** | `outfit_change_video_edit` | ❌ **没有** | `submitOmniVideoEdit` 缺失积分统计 |
| **视频生成（模板）** | `outfit_change_video_generation` | ❌ **没有** | AnimateAnyone 缺失积分统计 |

## 数据验证

**项目 `3fe376a7-6d2c-45a5-9377-5f76dd150222`（5.17）的积分消费记录**：

| 时间 | RouteKey | 金额 | 说明 |
|------|-----------|------|------|
| 16:07:59 | `outfit_change_image_generation` | 20积分 | ✅ 图片生成已扣积分 |
| 16:08:11 | `outfit_change_video_edit` | **缺失** | ❌ 视频编辑未扣积分 |
| 16:15:31 | `outfit_change_video_edit` | **缺失** | ❌ 视频编辑未扣积分 |

## 根本原因

**图片生成**（有积分）：
```typescript
// executor-handlers.ts:603-614
const refGenResult = await requestLlmImageGenerationUrl(provider, user, {
  debugOptions: {
    routeKey: ProviderRouteKeys.OUTFIT_CHANGE_IMAGE_GENERATION,  // ✅ 传递 routeKey
    ...
  },
});
// requestLlmImageGenerationUrl 内部自动处理积分冻结/扣减/解冻
```

**视频编辑**（无积分）：
```typescript
// executor-handlers.ts:884
const submitResult = await submitOmniVideoEdit(ctx, genInput);
// submitOmniVideoEdit 内部没有积分处理
```

## 修复方案

参考裂变项目的实现：
- Submit 任务：冻结积分
- Query 任务：成功扣减 / 失败解冻

**修改位置**：
- [stage3-video-edit-generation.ts:110-240](../src/modules/video-step/step3-outfit-change/stage3-video-edit-generation.ts#L110-L240)
- [executor-handlers.ts](../src/modules/video-step/step3-outfit-change/executor-handlers.ts) - Submit 和 Query 任务

## 状态

- **发现时间**：2026-05-19
- **修复状态**：远端已在修复中
- **待验证**：需要验证修复后的积分统计是否正常

## 验证方法

```sql
-- 查询换装项目的积分消费记录
SELECT
  id,
  action,
  meta_json->>'routeKey' AS route_key,
  meta_json->>'amount' AS amount,
  created_at
FROM nrm_audit_logs
WHERE action = 'credit_spent_by_user'
  AND meta_json::jsonb->>'routeKey' LIKE '%outfit%'
ORDER BY created_at DESC;

-- 验证视频编辑是否有积分记录
SELECT
  id,
  action,
  meta_json->>'routeKey' AS route_key,
  meta_json->>'amount' AS amount,
  created_at
FROM nrm_audit_logs
WHERE action = 'credit_spent_by_user'
  AND meta_json::jsonb->>'routeKey' = 'outfit_change_video_edit'
ORDER BY created_at DESC;
```

## 相关问题

- Step4 视频项目审计记录传递问题（已修复）
