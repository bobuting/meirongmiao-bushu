# 积分系统架构审查报告

## 修复实施记录（2026-05-09）

### 已完成修复清单

| 类别 | 文件 | 修改内容 | 状态 |
|------|------|---------|------|
| **后端** | `src/routes/user-routes.ts` | 1. routeKey改为必需参数（Fastify schema validation）<br>2. 未配置定价时免费（cost=0）<br>3. 传递routeKey到creditService.spend | ✅ 完成 |
| **前端API** | `apps/web/services/realApi/credits.ts` | spendCredits接口新增routeKey参数（必需） | ✅ 完成 |
| **前端工具** | `apps/web/pages/project-flow/projectFlowCredit.ts` | spendProjectFlowCredits函数新增routeKey参数（必需） | ✅ 完成 |
| **Step2** | `apps/web/pages/project-flow/CharacterSelection.tsx` | 添加routeKey，根据角色年龄选择child/adult | ✅ 完成 |
| **Step4** | `apps/web/pages/project-flow/step4-video-workspace/Step4VideoWorkspaceScreen.tsx` | 3处调用全部添加routeKey: step4_video_export | ✅ 完成 |
| **图片项目Step2** | `apps/web/pages/image-project/ImageCharacterSelection.tsx` | 添加routeKey: image_project_step3_model_photo | ✅ 完成 |
| **Step6** | `apps/web/pages/fission/useFissionVideo.ts`<br>`apps/web/pages/project-flow/step6-fission/Step6FissionScreen.tsx` | **移除重复扣费**（后端executor已通过冻结机制扣费） | ✅ 完成 |

### 自查发现的关键问题

**问题1：Step6双重扣费**

**问题描述**：Step6裂变视频存在双重扣费风险

**根本原因**：
- **后端已扣费**：`generateImageToVideo`使用冻结机制（`freeze → deductFrozen`）
  - RouteKey：`fission_video_generation_child/adult`（根据角色年龄自动选择）
  - 审计日志完整记录
- **前端重复扣费**：`spendProjectFlowCredits`额外扣费
  - 位置：`useFissionVideo.ts:1557`、`Step6FissionScreen.tsx:146,176`

**解决方案**：移除前端Step6的所有`spendProjectFlowCredits`调用

**原因分析**：
1. 后端`fission-item-video-submit-executor.ts:126`调用`generateImageToVideo`
2. `generateImageToVideo`内部执行完整的冻结流程：
   - `freezeCredit()` - 预扣积分
   - 成功时：`deductFrozenCredit()` - 实际扣减
   - 失败时：`unfreezeCredit()` - 退还积分
3. RouteKey正确传递，根据角色年龄选择child/adult
4. 审计日志完整，包含routeKey和operation信息

**修复结果**：
- 移除`useFissionVideo.ts`中的`spendProjectFlowCredits`调用
- 移除`Step6FissionScreen.tsx`中的2处扣费调用
- 后端冻结机制完整覆盖积分消费流程

**问题2：裂变定价体系**

**发现**：裂变RouteKey只有两档定价
- `fission_video_generation_child`
- `fission_video_generation_adult`

**历史遗留删除（2026-05-09）**：
已删除历史遗留的 `fission3CreditCost` 和 `fission9CreditCost` 字段：

| 文件 | 删除内容 |
|------|---------|
| `src/contracts/types.ts` | 删除接口字段 fission3CreditCost、fission9CreditCost |
| `src/core/config.ts` | 删除默认配置 fission3CreditCost: 30、fission9CreditCost: 90 |
| `src/routes/user-routes.ts` | 删除 API 返回字段 fission3CreditCost、fission9CreditCost |
| `apps/web/services/realApi/credits.ts` | 删除前端接口定义中的 fission3/9 字段 |
| `apps/web/pages/project-flow/projectFlowCredit.ts` | 删除 interface、默认值、normalize 函数中的 fission3/9 字段 |
| `apps/web/pages/project-flow/step6-fission/Step6FissionScreen.tsx` | 删除 fissionCostMap 中的 3:5 和 9:13 映射 |

**当前裂变定价**：仅保留 `fission6CreditCost` 和 `fission12CreditCost` 两档

**问题3：RouteKey定价配置缺失**

**发现**：
- 数据库无配置
- .env无配置

**解决方案**：未配置定价时免费（cost=0），不报错

**定价逻辑**：
```typescript
const routeKeyCost = config.routeKeyCreditCosts[routeKey] ?? 0;
const cost = routeKeyCost * count;
```

### 前端调用点统计（修复后）

| 文件 | 调用数 | routeKey传递 | 状态 |
|------|--------|-------------|------|
| `CharacterSelection.tsx` | 1 | ✅ 根据年龄选择child/adult | 完成 |
| `Step4VideoWorkspaceScreen.tsx` | 3 | ✅ step4_video_export | 完成 |
| `ImageCharacterSelection.tsx` | 1 | ✅ image_project_step3_model_photo | 完成 |
| `useFissionVideo.ts` | 0 | **已移除**（后端executor扣费） | 完成 |
| `Step6FissionScreen.tsx` | 0 | **已移除**（后端executor扣费） | 完成 |

**总计**：5个有效调用点，全部传递routeKey ✅

### 后端积分扣费路径（修复后）

| 路径类型 | 文件 | routeKey传递 | 状态 |
|---------|------|-------------|------|
| **冻结机制** | `llm-transport.ts` | ✅ 正确传递 | 正常 |
| **冻结机制** | `llm-image-video.ts` | ✅ 正确传递 | 正常 |
| **冻结机制** | `image-generation-providers.ts` | ✅ 正确传递 | 正常 |
| **冻结机制** | `reverse-square-routes.ts` | ✅ SQUARE_VIDEO_REVERSE | 正常 |
| **直接消费** | `user-routes.ts` | ✅ routeKey必需参数 | 已修复 |
| **直接消费** | `fission-export-service.ts` | ✅ STEP4_VIDEO_EXPORT | 正常 |
| **直接消费** | `step4-clip-submit-executor.ts` | ✅ 根据年龄选择 | 正常 |

**总计**：7条扣费路径，全部正确传递routeKey ✅

---

## 1. 积分系统设计架构

### 1.1 核心设计原则

**冻结机制防止并发白嫖**：
```
freeze（预扣）→ LLM调用 → deductFrozen（实际扣减）或 unfreeze（失败退还）
```

**RouteKey体系统一定价**：
- 每个业务功能对应一个 `ProviderRouteKey`
- `routeKeyCreditCosts` 配置映射（动态可配置）
- 优于硬编码的 `singleImageCreditCost` 等旧字段

### 1.2 两种扣费路径

| 路径 | 场景 | 定价方式 | 实现位置 |
|------|------|---------|---------|
| **冻结机制** | LLM调用（文本/图片生成） | RouteKey定价 | `llm-transport.ts` |
| **直接消费** | 视频导出、角色生成、裂变 | operation定价（旧体系） | `user-routes.ts` `/me/credits/spend` |

### 1.3 积分服务接口

```typescript
// src/modules/credit-service.ts
interface ICreditService {
  // 冻结机制
  freeze(userId, amount, { routeKey, operation }): Promise<string>;
  unfreeze(userId, freezeId): Promise<void>;
  deductFrozen(userId, freezeId, actualCost): Promise<number>;
  
  // 直接消费
  spend(userId, baseCost, resolution, { routeKey?, operation, reason }): Promise<number>;
  
  // 系统管理
  cleanupExpiredFreezes(): Promise<number>;
  updatePolicy(validityDays, mockDefault): Promise<void>;
}
```

---

## 2. RouteKey体系完整性

### 2.1 已定义的 ProviderRouteKey（完整列表）

| RouteKey | 业务场景 | 定价配置状态 |
|----------|---------|-------------|
| `step1_fashion_analysis` | Step1服饰分析 | 待配置 |
| `step1_fashion_search` | Step1服饰搜索LLM增强 | 待配置 |
| `step1_role_preset` | Step1角色预设生成 | 待配置 |
| `step1_image_search_grounding` | 图片项目Step1图片搜索 | 待配置 |
| `image_project_step1_selling_points` | 图片项目Step1卖点提取 | 待配置 |
| `step2_five_view_generation_child` | Step2五视图生成-儿童 | 待配置 |
| `step2_five_view_generation_adult` | Step2五视图生成-成人 | 待配置 |
| `step3_realtime_script_generation` | Step3实时热点脚本 | 待配置 |
| `step3_hot_deep_analysis` | Step3热点深度分析 | 待配置 |
| `step3_storyboard_image` | Step3分镜图生成 | 待配置 |
| `step3_storyboard_image_child` | Step3分镜图生成-儿童 | 待配置 |
| `step3_storyboard_image_adult` | Step3分镜图生成-成人 | 待配置 |
| `step3_storyboard_prompt` | Step3分镜提示词工程 | 待配置 |
| `step3_custom_script_generation` | Step3场景化种草脚本 | 待配置 |
| `step3_custom_script_concept` | Step3场景化脚本概念 | 待配置 |
| `step3_fashion_script_generation` | Step3时尚大片脚本 | 待配置 |
| `step3_fashion_script_concept` | Step3时尚大片概念 | 待配置 |
| `step3_emotion_archetype_generation` | Step3情感原型脚本 | 待配置 |
| `step3_emotion_archetype_outline` | Step3情感原型大纲 | 待配置 |
| `script_effectiveness_generation` | Step3种草脚本生成 | 待配置 |
| `step3_aesthetic_script_generation` | Step3生活美学脚本 | 待配置 |
| `step3_product_showcase_script_generation` | Step3产品展示脚本 | 待配置 |
| `step3_product_showcase_script_concept` | Step3产品展示概念 | 待配置 |
| `step3_story_theme_concept` | Step3主题叙事-主题构思 | 待配置 |
| `step3_story_theme_outline` | Step3主题叙事-故事大纲 | 待配置 |
| `step3_story_theme_generation` | Step3主题叙事-分镜展开 | 待配置 |
| `step3_video_script_rewrite` | Step3视频热榜脚本改写 | 待配置 |
| `step3_library_script_rewrite` | Step3库脚本改写 | 待配置 |
| `step3_product_showcase_script_rewrite` | Step3产品展示脚本改写 | 待配置 |
| `script_quality_scoring` | 脚本质量评分 | 待配置 |
| `prompt_evolution_generation` | Prompt进化提案 | 待配置 |
| `image_project_step3_model_photo` | 图片项目Step3模特图生成 | 待配置 |
| `image_project_step3_model_plan` | 图片项目Step3模特图规划 | 待配置 |
| `image_project_step4_section_plan` | 图片项目Step4Section规划 | 待配置 |
| `image_project_step4_section_image` | 图片项目Step4Section图片 | 待配置 |
| `step4_clip_video_generation_child` | Step4分镜视频生成-儿童 | 待配置 |
| `step4_clip_video_generation_adult` | Step4分镜视频生成-成人 | 待配置 |
| **`step4_video_export`** | **Step4视频导出** | **✅ 已配置（但前端未传递）** |
| `fission_video_generation_child` | Step6裂变视频生成-儿童 | 待配置 |
| `fission_video_generation_adult` | Step6裂变视频生成-成人 | 待配置 |
| `fission_story_generation` | Step6裂变故事生成 | 待配置 |
| `fission_storyboard_prompt` | Step6裂变分镜提示词 | 待配置 |
| `fission_storyboard_image_child` | Step6裂变分镜图片-儿童 | 待配置 |
| `fission_storyboard_image_adult` | Step6裂变分镜图片-成人 | 待配置 |
| `square_video_reverse` | 广场反推 | 待配置 |
| `square_creator_evaluation` | 广场达人评估 | 待配置 |
| `hot_trend_video_reverse` | 热榜反推 | 待配置 |
| `aesthetic_feature_extraction` | 审美特征提取 | 待配置 |
| `scene_feature_extraction` | 场景特征提取 | 待配置 |
| `emotion_archetype_extraction` | 情感原型提取 | 待配置 |
| `library_portrait_detect` | 人像检测 | 待配置 |
| `garment_flat_lay_generation` | 服饰平铺图生成 | 待配置 |
| `outfit_change_image_generation` | 换装图片生成 | 待配置 |
| `outfit_change_video_edit` | 换装视频编辑 | 待配置 |
| `music_atmosphere_analysis` | 音乐氛围分析 | 待配置 |
| `text_generation` | 能力实验室文本生成 | 待配置 |
| `image_generation` | 能力实验室图片生成 | 待配置 |
| `video_generation` | 能力实验室视频生成 | 待配置 |

**总计：58个RouteKey**

### 2.2 RouteKey定价配置方式

```typescript
// src/contracts/types.ts
interface AppConfig {
  // 新体系（推荐）
  routeKeyCreditCosts: Record<string, number>;  // { "step4_video_export": 10 }
  
  // 旧体系（历史遗留）
  singleImageCreditCost: number;
  singleVideoCreditCost: number;
  videoExportCreditCost: number;
  fission3CreditCost: number;
  fission6CreditCost: number;
  fission9CreditCost: number;
  fission12CreditCost: number;
}
```

**配置入口**：
- 管理后台 → 积分管理 → RouteKey积分定价
- API：`/admin/config/route-key-credit-costs`

---

## 3. 积分消费调用点审查

### 3.1 冻结机制调用（✅ 正确实现）

| 文件 | 调用方法 | RouteKey传递 | 审计记录 |
|------|---------|-------------|---------|
| `llm-transport.ts:1003` | `freeze()` | ✅ 正确传递 | ✅ 完整 |
| `llm-transport.ts:1022` | `unfreeze()` | ✅ 正确传递 | ✅ 完整 |
| `llm-transport.ts:1045` | `deductFrozen()` | ✅ 正确传递 | ✅ 完整 |

**审计日志格式**：
```json
{
  "action": "credit_spent_by_user",
  "meta": {
    "amount": 10,
    "frozenAmount": 15,
    "refunded": 5,
    "operation": "llm_generation",
    "routeKey": "step3_storyboard_image"  // ✅ 有routeKey
  }
}
```

### 3.2 直接消费调用（✅ 正确实现）

| 文件 | 调用场景 | RouteKey传递 | 审计记录 |
|------|---------|-------------|---------|
| `fission-export-service.ts:555` | Step4视频导出 | ✅ `ProviderRouteKeys.STEP4_VIDEO_EXPORT` | ✅ 完整 |
| `step4-clip-submit-executor.ts:114` | Step4分镜视频生成 | ✅ `selectRouteKeyByAge()` | ✅ 完整 |

### 3.3 直接消费调用（❌ 遗漏RouteKey）

| 文件 | API | 问题 | 影响 |
|------|-----|------|------|
| `user-routes.ts:56` | `/me/credits/spend` | **❌ 缺少routeKey参数** | 前端11个调用点全部遗漏 |

**审计日志格式（错误）**：
```json
{
  "action": "credit_spent_by_user",
  "meta": {
    "amount": 10,
    "baseCost": 10,
    "resolution": "720p",
    "operation": "single_video",
    "reason": "step4_auto_batch_video_generate"
    // ❌ 缺少routeKey，导致activity为null
  }
}
```

---

## 4. 前端调用遗漏点

### 4.1 `/me/credits/spend` API的11个调用点

| 文件 | operation | reason | 应映射RouteKey |
|------|-----------|--------|---------------|
| `CharacterSelection.tsx` | single_image | step2_batch_generate | `step2_five_view_generation_adult` 或 `step2_five_view_generation_child`（需根据角色年龄选择） |
| `Step4VideoWorkspaceScreen.tsx` (3处) | single_video | step4_batch_video_generate / step4_auto_batch_video_generate / step4_single_retry | `step4_video_export` |
| `Step6FissionScreen.tsx` (2处) | fission_xx | step6_fission_retry / step6_fission_retry_all | `fission_video_generation_adult` 或 `fission_video_generation_child`（需根据角色年龄选择） |
| `ImageCharacterSelection.tsx` | single_image | image_step2_batch_generate | `image_project_step3_model_photo` |

### 4.2 旧定价体系问题

`/me/credits/spend` API使用**旧定价逻辑**：
```typescript
// user-routes.ts:54
const baseCost = count * config.videoExportCreditCost;  // ❌ 硬编码，不使用RouteKey定价
```

**应该改为**：
```typescript
const cost = config.routeKeyCreditCosts[routeKey] ?? baseCost;  // ✅ 优先RouteKey定价
```

---

## 5. 修复方案

### 5.1 后端修复

**修改文件**：`src/routes/user-routes.ts`

**修改内容**：

1. **接收routeKey参数**：
```typescript
app.post("/me/credits/spend", async (request) => {
  const user = await requireUser(ctx, request);
  const body = (request.body as {
    operation?: string;
    count?: number;
    reason?: string;
    routeKey?: string;  // ← 新增
  } | undefined) ?? {};

  const routeKey = typeof body.routeKey === "string" ? body.routeKey.trim() : undefined;
  
  // 定价逻辑：RouteKey优先，旧定价兜底
  let cost: number;
  if (routeKey && config.routeKeyCreditCosts[routeKey] != null) {
    cost = config.routeKeyCreditCosts[routeKey]!;
  } else {
    // 旧定价兜底（兼容历史调用）
    const baseCost = count * config.videoExportCreditCost;
    cost = Math.ceil(baseCost);
  }
  
  await ctx.creditService.spend(user.id, cost, "720p", {
    operation,
    reason,
    routeKey,  // ← 传递
  });
});
```

### 5.2 前端修复

**修改文件**（11处）：

1. **CharacterSelection.tsx**（视频项目Step2）：
```typescript
await spendProjectFlowCredits({
  token,
  operation: "single_image",
  reason: "step2_batch_generate",
  routeKey: selectRouteKeyByAge(age, "step2_five_view_generation_child", "step2_five_view_generation_adult"),
});
```

2. **Step4VideoWorkspaceScreen.tsx**（3处）：
```typescript
await spendProjectFlowCredits({
  token,
  operation: "single_video",
  reason: "step4_auto_batch_video_generate",
  routeKey: "step4_video_export",
});
```

3. **Step6FissionScreen.tsx**（2处）：
```typescript
await spendProjectFlowCredits({
  token,
  operation: fissionOperation,
  reason: "step6_fission_retry",
  routeKey: selectRouteKeyByAge(age, "fission_video_generation_child", "fission_video_generation_adult"),
});
```

4. **ImageCharacterSelection.tsx**（图片项目Step2）：
```typescript
await spendProjectFlowCredits({
  token,
  operation: "single_image",
  reason: "image_step2_batch_generate",
  routeKey: "image_project_step3_model_photo",
});
```

### 5.3 前端API接口修改

**修改文件**：`apps/web/services/realApi/credits.ts`

**新增routeKey参数**：
```typescript
export async function spendProjectFlowCredits(
  payload: {
    token: string;
    operation?: string;
    reason?: string;
    routeKey?: string;  // ← 新增
  },
) {
  return request<{
    balance: number;
    expiresAt: number;
    spent: number;
  }>("POST", "/me/credits/spend", {
    token,
    body: payload,  // ← 自动包含routeKey
  });
}
```

### 5.4 审计日志修复验证

**修复后的审计日志格式**：
```json
{
  "action": "credit_spent_by_user",
  "meta": {
    "amount": 10,
    "baseCost": 10,
    "resolution": "720p",
    "operation": "single_video",
    "reason": "step4_auto_batch_video_generate",
    "routeKey": "step4_video_export"  // ✅ 有routeKey，activity不再为null
  }
}
```

---

## 6. 后续建议

### 6.1 废弃旧定价体系

**建议**：
- 删除 `singleImageCreditCost`, `singleVideoCreditCost`, `videoExportCreditCost` 等硬编码字段
- 统一使用 `routeKeyCreditCosts` 动态配置
- 通过管理后台配置每个RouteKey的积分价格

### 6.2 RouteKey定价配置完整性

**建议**：
- 在管理后台配置所有58个RouteKey的积分价格
- 未配置的RouteKey默认免费（cost=0）
- 配置优先级：RouteKey定价 > 旧定价兜底

### 6.3 冻结机制扩展

**建议**：
- 将 `/me/credits/spend` API 改为冻结机制（防止并发白嫖）
- 参考LLM调用的 `freeze → 执行 → deductFrozen/unfreeze` 模式

---

## 7. 验证清单

修复后需要验证：

- [ ] 后端接收并传递routeKey参数
- [ ] 前端11个调用点全部传递正确的routeKey
- [ ] 审计日志的meta_json包含routeKey字段
- [ ] 积分审计管理页面的activity字段正确显示routeKey
- [ ] RouteKey定价优先于旧定价生效
- [ ] 未传递routeKey时使用旧定价兜底（兼容历史调用）

---

**文档版本**: v1.0  
**生成时间**: 2026-05-09  
**审查范围**: 积分系统架构、RouteKey体系、前端调用点、审计日志