# 积分消耗集成到项目详情页 — 资源消耗 Tab

## 背景

Admin Portal 项目详情页（`/admin-portal?tab=projects`）有"资源消耗" Tab，当前展示 3 个指标：
- LLM 调用次数
- 图片生成次数
- 视频生成次数

需集成**积分消耗**数据，让管理员在项目维度查看积分使用情况。

## 方案选择

| 方案 | 思路 | 优劣 |
|------|------|------|
| A. 补 projectId 到 audit_logs ✅ | 在 `creditService.spend/freeze` 的 meta 中记录 projectId，查询时从 meta_json 聚合 | 数据准确，改动可控 |
| B. 用 provider_call_audits 反算 | 已有 project_id + route_key，结合定价配置计算 | 不改数据模型，但定价变更后历史数据不准 |

**选定方案 A**：数据准确，改动不大，渐进式（历史数据无 projectId，新数据才有）。

## 改动范围

### 1. credit-service.ts — meta 类型扩展

`spend/freeze` 方法的 meta 参数加 `projectId?: string`，写入 audit log 时带入 meta_json：

```typescript
// 当前
meta: { amount, routeKey, operation, reason }

// 改后
meta: { amount, routeKey, operation, reason, projectId }
```

### 2. 各调用处补传 projectId

| 调用位置 | 说明 | projectId 来源 |
|---------|------|---------------|
| `step4-clip-submit-executor.ts` | Step4 视频生成扣积分 | `job.projectId` |
| `fission-export-service.ts` | 裂变导出扣积分 | 上下文中的 projectId |
| `user-routes.ts` | 用户直接调用扣积分 | request body |
| `llm-transport.ts` | LLM 调用冻结积分 | 上下文中的 projectId |

### 3. projects-routes.ts — 详情 API 加积分查询

在 `GET /admin/projects/:projectId/detail` 中新增查询：

```sql
SELECT SUM((meta_json->>'amount')::int) AS total_credits
FROM nrm_audit_logs
WHERE target_id = $1
  AND action = 'credit_spent_by_user'
  AND meta_json->>'projectId' = $2
```

同时加按 routeKey 分组的明细查询，展示各类操作的积分消耗。

### 4. ProjectDetailModal.tsx — 前端展示

在资源消耗 Tab 新增：
- **积分总消耗**卡片（橙色/金色，与其他三卡片并排，grid-cols-4）
- 可选：按 routeKey 分组的积分消耗明细列表

数据类型扩展：

```typescript
resourceConsumption: {
  llmCalls: number;
  imageGenerations: number;
  videoGenerations: number;
  creditsSpent: number;            // 新增
  creditsByRouteKey?: Array<{      // 新增（可选）
    routeKey: string;
    amount: number;
  }>;
};
```

## 注意事项

- **历史数据兼容**：meta_json 中无 projectId 的旧记录不会被查到，这是预期的渐进式行为
- **freeze/deductFrozen 也需补 projectId**：冻结时记录，扣减时可追溯到项目
- **LLM 调用链路较长**：llm-transport 中需要从上层传递 projectId 下来
