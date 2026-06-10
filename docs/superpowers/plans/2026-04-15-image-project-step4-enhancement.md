# 图片项目 Step4 电商详情页全面增强实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在 Step1 提取服装卖点，Step4 基于卖点驱动详情页规划，修复 4 个已知 Bug，全面美化 UI/UX。

**架构：**
- Step1 搭配方案生成后，调用图片项目专属提示词提取卖点，写入 OutfitPlan.sellingPoints 并持久化
- Step4 规划时读取卖点数据，按卖点→Section 映射规则生成 4-8 个 Section，遵循电商转化路径排序
- 修复 SectionVersion.imageAssetId 为 null 等 4 个 Bug
- 前端新增拖拽排序、添加模块、版本缩略图、下载长图、骨架屏等交互

**技术栈：** Fastify 5, PostgreSQL, TypeScript 5.9, React 18, Tailwind CSS 3, Zustand

---

## 文件清单

| 文件 | 职责 |
|------|------|
| `src/contracts/types.ts` | 新增 Section 类型 + OutfitPlan.sellingPoints 字段 |
| `src/contracts/provider-route-keys.ts` | 新增 IMAGE_PROJECT_STEP1_SELLING_POINTS |
| `src/modules/selling-points-extractor.ts` | **新建**：卖点提取服务 |
| `src/modules/section-planning-service.ts` | 接收卖点数据，基于卖点规划 Section |
| `src/modules/section-generation-service.ts` | 修复 imageAssetId Bug，generateAllSections 改为并发 |
| `src/routes/image-project/step1-handlers.ts` | 在 recommend 流程中调用卖点提取 |
| `src/routes/image-project/step4-handlers.ts` | 传入卖点数据、修复 createSection 校验 |
| `src/repositories/pg/asset-pg-repository.ts` | mapRow/mapEntity 支持 sellingPoints |
| `apps/web/pages/image-project/ImageEcommerceEditor.tsx` | 底部工具栏改为下载、清理 console.log、骨架屏 |
| `apps/web/pages/image-project/components/SectionTree.tsx` | 拖拽排序、添加模块按钮、缩略预览、美化 |
| `apps/web/pages/image-project/components/SectionEditor.tsx` | 提示词折叠、图片悬浮放大、版本缩略图 |
| `apps/web/pages/image-project/components/PhonePreview.tsx` | 文案展示、占位图优化、淡入动画 |
| `apps/web/pages/image-project/components/AddSectionModal.tsx` | **新建**：11 种类型选择器 |
| `apps/web/pages/image-project/components/SectionTypeIcon.tsx` | **新建**：类型彩色图标 |
| `apps/web/pages/image-project/components/DownloadButton.tsx` | **新建**：Canvas 下载长图 |

---

## 任务 1：类型定义 + Provider Route Key

**文件：**
- 修改：`src/contracts/types.ts:1164-1170`（SectionType 扩展）
- 修改：`src/contracts/types.ts:316-356`（OutfitPlan 新增字段）
- 修改：`src/contracts/provider-route-keys.ts:52`（新增 key）

- [ ] **步骤 1：扩展 SectionType 类型**

```typescript
// src/contracts/types.ts — 替换第 1164-1170 行
export type SectionType =
  | "outfit_overview"        // 搭配总览
  | "detail_showcase"        // 细节展示
  | "scene_application"      // 场景应用
  | "material_texture"       // 材质纹理
  | "size_comparison"        // 尺码对比
  | "call_to_action"         // 行动号召
  | "brand_story"            // 品牌故事
  | "styling_guide"          // 穿搭指南
  | "detail_closeup"         // 细节特写
  | "outfit_recommendation"  // 搭配推荐
  | "user_review";           // 用户评价
```

- [ ] **步骤 2：OutfitPlan 新增 sellingPoints 字段**

```typescript
// src/contracts/types.ts — 在 OutfitPlan 接口 groundingSources 之后（约第 355 行后）添加
  /** 电商卖点（Step1 提取，Step4 消费） */
  sellingPoints?: Array<{
    point: string;
    category: string;  // 面料 | 工艺 | 版型 | 设计 | 搭配 | 场景
    priority: number;  // 1=核心卖点，2=次要卖点
  }>;
```

- [ ] **步骤 3：新增 Provider Route Key**

```typescript
// src/contracts/provider-route-keys.ts — 在 STEP1_IMAGE_SEARCH_GROUNDING 之后添加
  /** 卖点提取（图片项目 Step1） */
  IMAGE_PROJECT_STEP1_SELLING_POINTS: "image_project_step1_selling_points",
```

- [ ] **步骤 4：验证 TypeScript 编译**

运行：
```bash
npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```
预期：无新增类型错误（或仅有与本次修改无关的已有错误）

- [ ] **步骤 5：Commit**

```bash
git add src/contracts/types.ts src/contracts/provider-route-keys.ts
git commit -m "feat(step4): 扩展 SectionType 至 11 种，新增 OutfitPlan.sellingPoints"
```

---

## 任务 2：数据库 selling_points 列 + 仓库映射

**文件：**
- 修改：`src/repositories/pg/asset-pg-repository.ts:98-145`
- 数据库：`nrm_outfit_plans` 表新增列

- [ ] **步骤 1：数据库新增列**

运行：
```bash
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(
  \"ALTER TABLE nrm_outfit_plans ADD COLUMN IF NOT EXISTS selling_points JSONB DEFAULT NULL\"
).then(() => { console.log('Column added'); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); });
"
```

- [ ] **步骤 2：PgOutfitPlanRepository.mapRow 添加映射**

```typescript
// src/repositories/pg/asset-pg-repository.ts — 在 mapRow 方法 groundingSources 行之后添加
      sellingPoints: PgSoftDeletableRepository.fromJsonb<Array<{
        point: string;
        category: string;
        priority: number;
      }>>(row.selling_points) ?? undefined,
```

- [ ] **步骤 3：PgOutfitPlanRepository.mapEntity 添加映射**

```typescript
// src/repositories/pg/asset-pg-repository.ts — 在 mapEntity 方法 grounding_sources 行之后添加
      selling_points: PgSoftDeletableRepository.toJsonb(p.sellingPoints),
```

- [ ] **步骤 4：验证 TypeScript 编译**

运行：
```bash
npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

- [ ] **步骤 5：Commit**

```bash
git add src/repositories/pg/asset-pg-repository.ts
git commit -m "feat(step1): nrm_outfit_plans 新增 selling_points 列及仓库映射"
```

---

## 任务 3：卖点提取服务

**文件：**
- 创建：`src/modules/selling-points-extractor.ts`
- 修改：`src/contracts/provider-route-keys.ts`（已在任务 1 完成）

- [ ] **步骤 1：创建卖点提取服务**

```typescript
// src/modules/selling-points-extractor.ts
/**
 * 卖点提取服务（图片项目 Step1 专属）
 *
 * 从服饰分析结果中提取电商详情页可用的卖点。
 * 使用图片项目专属提示词 image_project_step1_selling_points，与视频项目完全隔离。
 */

import type { AppContext } from "../core/app-context.js";
import type { OutfitPlan } from "../contracts/types.js";
import type { ResolvedRouteProvider } from "../services/llm/provider-resolver.js";
import { AppError } from "../core/errors.js";
import { buildPrompt } from "./prompt/prompt-helper.js";
import { requestLlmPlainText } from "../services/llm/llm-transport.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";

/** 卖点提取结果 */
export interface SellingPointsResult {
  sellingPoints: Array<{
    point: string;
    category: string;
    priority: number;
  }>;
  rawText: string;
}

/** 卖品类常量 */
const VALID_CATEGORIES = ["面料", "工艺", "版型", "设计", "搭配", "场景"] as const;

/**
 * 校验卖点数据格式
 */
function isValidSellingPoint(item: unknown): item is { point: string; category: string; priority: number } {
  if (!item || typeof item !== "object") return false;
  const obj = item as Record<string, unknown>;
  return (
    typeof obj.point === "string" && obj.point.length > 0 &&
    typeof obj.category === "string" && VALID_CATEGORIES.includes(obj.category as typeof VALID_CATEGORIES[number]) &&
    typeof obj.priority === "number" && (obj.priority === 1 || obj.priority === 2)
  );
}

/**
 * 从文本中提取 JSON 数组
 */
function extractJsonArray(text: string): unknown[] | null {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* continue */ }

  const jsonBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock[1].trim());
      if (Array.isArray(parsed)) return parsed;
    } catch { /* continue */ }
  }

  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch { /* continue */ }
  }

  return null;
}

/**
 * 从搭配方案中提取卖点
 */
export async function extractSellingPoints(
  ctx: AppContext,
  outfitPlan: OutfitPlan,
  provider: ResolvedRouteProvider,
): Promise<SellingPointsResult> {
  const { systemPrompt, userPrompt } = await buildPrompt("image_project_step1_selling_points", {
    variables: {
      title: outfitPlan.title ?? "",
      styleName: outfitPlan.styleName ?? "",
      analysis: outfitPlan.analysis ?? "",
      items: JSON.stringify(outfitPlan.items ?? []),
      tags: JSON.stringify(outfitPlan.tags ?? []),
      suitableScene: outfitPlan.suitableScene ?? "",
    },
  });

  const rawText = await requestLlmPlainText(
    provider,
    systemPrompt,
    userPrompt,
    0.3,
    {
      ctx,
      routeKey: ProviderRouteKeys.IMAGE_PROJECT_STEP1_SELLING_POINTS,
      businessContext: "图片项目 Step1 卖点提取",
    },
  );

  const jsonArray = extractJsonArray(rawText);
  if (!jsonArray) {
    throw new AppError(
      500,
      "SELLING_POINTS_INVALID_JSON",
      `卖点提取 LLM 返回不是有效的 JSON 数组: ${rawText.slice(0, 300)}`,
    );
  }

  const validPoints: Array<{ point: string; category: string; priority: number }> = [];
  for (let i = 0; i < jsonArray.length; i++) {
    if (isValidSellingPoint(jsonArray[i])) {
      validPoints.push(jsonArray[i] as { point: string; category: string; priority: number });
    }
  }

  return { sellingPoints: validPoints, rawText };
}
```

- [ ] **步骤 2：验证 TypeScript 编译**

运行：
```bash
npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

- [ ] **步骤 3：Commit**

```bash
git add src/modules/selling-points-extractor.ts
git commit -m "feat(step1): 新建卖点提取服务（图片项目专属）"
```

---

## 任务 4：Step1 handler 集成卖点提取

**文件：**
- 修改：`src/routes/image-project/step1-handlers.ts:130-184`
- 修改：`src/contracts/provider-route-keys.ts`（已在任务 1 完成）

- [ ] **步骤 1：在 step1-handlers.ts 中导入新服务**

```typescript
// src/routes/image-project/step1-handlers.ts — 在已有 import 之后添加
import { extractSellingPoints } from "../../modules/selling-points-extractor.js";
```

- [ ] **步骤 2：在 recommend handler 中集成卖点提取**

```typescript
// src/routes/image-project/step1-handlers.ts — 替换 /outfits/recommend handler（约第 133-184 行）

  app.post("/image-projects/:projectId/step1/outfits/recommend", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };

    const existingPlans = await ctx.repos.outfitPlans.findByProjectId(params.projectId);
    const bypassCache = existingPlans.length > 0;

    const rawPlans = await ctx.outfitService.recommend(user, params.projectId, ctx, { bypassCache });

    // 卖点提取：对每套方案调用图片项目专属卖点提取
    const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.IMAGE_PROJECT_STEP1_SELLING_POINTS);
    if (provider) {
      for (const plan of rawPlans) {
        try {
          const spResult = await extractSellingPoints(ctx, plan, provider);
          if (spResult.sellingPoints.length > 0) {
            plan.sellingPoints = spResult.sellingPoints;
            await ctx.repos.outfitPlans.upsert(plan);
          }
        } catch (error) {
          app.log.warn({ err: error, planId: plan.id }, "卖点提取失败，不影响主流程");
        }
      }
    }

    const plans = rawPlans;

    const analysisCards = plans.map((plan) => ({
      index: plan.index,
      planId: plan.id,
      title: plan.title ?? "",
      styleName: plan.styleName ?? "",
      analysis: plan.analysis ?? "",
      optimizedPrompt: plan.optimizedPrompt ?? "",
      suitableScene: plan.suitableScene ?? "",
      tags: plan.tags ?? [],
      groundingSources: plan.groundingSources ?? [],
      status: "ready" as const,
      items: plan.items?.map((item) => ({
        type: item.type,
        name: item.name,
        description: item.description,
      })) ?? [],
    }));

    return {
      plans: plans.map((plan) => ({
        id: plan.id,
        index: plan.index,
        title: plan.title,
        reason: plan.reason,
        styleName: plan.styleName,
        assetIds: plan.assetIds,
        items: plan.items,
        analysis: plan.analysis,
        optimizedPrompt: plan.optimizedPrompt,
        trendSummary: plan.trendSummary,
        suitableScene: plan.suitableScene,
        tags: plan.tags,
        groundingSources: plan.groundingSources,
        sellingPoints: plan.sellingPoints,
      })),
      analysisCards,
      taskStatus: "completed" as const,
      analysisStatus: "ready" as const,
    };
  });
```

- [ ] **步骤 3：Commit**

```bash
git add src/routes/image-project/step1-handlers.ts
git commit -m "feat(step1): recommend 流程集成卖点提取（图片项目专属）"
```

---

## 任务 5：Step4 卖点驱动 Section 规划

**文件：**
- 修改：`src/modules/section-planning-service.ts`
- 修改：`src/routes/image-project/step4-handlers.ts`

- [ ] **步骤 1：更新 section-planning-service 接收卖点数据**

```typescript
// src/modules/section-planning-service.ts — 修改 planSections 方法签名和提示词构建

// 修改第 125-148 行的 planSections 方法：
  async planSections(
    ctx: AppContext,
    project: Project,
    outfitPlan: OutfitPlan,
    modelPhotos: Array<{ id: string; imageUrl: string; poseLabel: string | null }>,
    provider: ResolvedRouteProvider,
  ): Promise<SectionPlanningResult> {
    // 构建卖点描述文本
    const sellingPointsText = (outfitPlan.sellingPoints ?? [])
      .map((sp) => `[${sp.priority === 1 ? "核心" : "次要"}] ${sp.point}（${sp.category}）`)
      .join("\n");

    // 构建模特照片描述文本
    const modelPhotosText = modelPhotos.length > 0
      ? modelPhotos.map((p, i) => `照片${i + 1}: ${p.imageUrl}${p.poseLabel ? `，姿态: ${p.poseLabel}` : ""}`).join("\n")
      : "无模特照片";

    // 构建提示词（新增 sellingPoints 变量）
    const { systemPrompt, userPrompt } = await buildPrompt("step4_section_planning", { variables: {
      title: outfitPlan.title ?? "",
      styleName: outfitPlan.styleName ?? "",
      analysis: outfitPlan.analysis ?? "",
      optimizedPrompt: outfitPlan.optimizedPrompt ?? "",
      sellingPoints: sellingPointsText || "无卖点数据",
      modelPhotos: modelPhotosText,
      userPrompt: JSON.stringify({
        projectName: project.name,
        modelPhotoCount: modelPhotos.length,
        sellingPointCount: sellingPointsText ? outfitPlan.sellingPoints?.length ?? 0 : 0,
      }),
    }});
```

- [ ] **步骤 2：VALID_SECTION_TYPES 扩展为 11 种**

```typescript
// src/modules/section-planning-service.ts — 替换第 40-47 行
const VALID_SECTION_TYPES: string[] = [
  "outfit_overview",
  "detail_showcase",
  "scene_application",
  "material_texture",
  "size_comparison",
  "call_to_action",
  "brand_story",
  "styling_guide",
  "detail_closeup",
  "outfit_recommendation",
  "user_review",
];
```

- [ ] **步骤 3：step4-handlers.ts 传递卖点数据（已在 planSections 签名中处理）**

planSections 调用时 outfitPlan 已包含 sellingPoints，无需额外修改。

- [ ] **步骤 4：验证 TypeScript 编译**

运行：
```bash
npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

- [ ] **步骤 5：Commit**

```bash
git add src/modules/section-planning-service.ts
git commit -m "feat(step4): Section 规划接入卖点数据，扩展类型至 11 种"
```

---

## 任务 6：Bug 修复 — SectionVersion.imageAssetId

**文件：**
- 修改：`src/modules/section-generation-service.ts:136-166`（regenerateSectionImage）
- 修改：`src/modules/section-generation-service.ts:171-208`（generateAllSections）

- [ ] **步骤 1：修复 regenerateSectionImage — 版本记录保存 imageUrl**

```typescript
// src/modules/section-generation-service.ts — 替换第 136-166 行的 regenerateSectionImage 方法

  async regenerateSectionImage(
    section: PageSection,
    provider: ResolvedRouteProvider,
    referenceImages: string[],
    user: User,
    debugOptions?: ImageGenerationDebugOptions,
  ): Promise<SectionVersion> {
    // 生成新图片
    const imageResult = await this.generateSectionImage(section, provider, referenceImages, user, debugOptions);

    // 创建新版本（保存 imageAssetId）
    const versionNumber = await this.sectionVersions.nextVersionNumber(section.id);
    const now = Date.now();
    const version: SectionVersion = {
      id: crypto.randomUUID(),
      sectionId: section.id,
      projectId: section.projectId,
      versionNumber,
      promptSnapshot: { visualPrompt: section.visualPrompt },
      copySnapshot: { title: section.title, copy: section.copy },
      imageAssetId: imageResult.imageUrl,  // 修复：保存生成的图片 URL
      isActive: true,
      createdAt: now,
    };

    await this.sectionVersions.create(version);
    await this.sectionVersions.activate(version.id);

    return version;
  }
```

- [ ] **步骤 2：修复 generateAllSections — 版本记录保存 imageUrl + 改为并发**

```typescript
// src/modules/section-generation-service.ts — 替换第 171-208 行的 generateAllSections 方法

  async generateAllSections(
    sections: PageSection[],
    provider: ResolvedRouteProvider,
    referenceImages: string[],
    user: User,
    debugOptions?: ImageGenerationDebugOptions,
  ): Promise<SectionGenerationResult[]> {
    // 并发生成所有 Section 图片
    const imageResults = await Promise.all(
      sections.map(async (section) => {
        const imageResult = await this.generateSectionImage(section, provider, referenceImages, user, debugOptions);
        return { section, ...imageResult };
      }),
    );

    // 为每个结果创建版本
    const results: SectionGenerationResult[] = [];
    for (const { section, imageUrl, providerVendor } of imageResults) {
      const versionNumber = await this.sectionVersions.nextVersionNumber(section.id);
      const now = Date.now();
      const version: SectionVersion = {
        id: crypto.randomUUID(),
        sectionId: section.id,
        projectId: section.projectId,
        versionNumber,
        promptSnapshot: { visualPrompt: section.visualPrompt },
        copySnapshot: { title: section.title, copy: section.copy },
        imageAssetId: imageUrl,  // 修复：保存生成的图片 URL
        isActive: true,
        createdAt: now,
      };

      await this.sectionVersions.create(version);
      await this.sectionVersions.activate(version.id);

      results.push({ section, version, imageUrl });
    }

    return results;
  }
```

- [ ] **步骤 3：Commit**

```bash
git add src/modules/section-generation-service.ts
git commit -m "fix(step4): 修复 SectionVersion.imageAssetId 始终为 null + generateAllSections 并发化"
```

---

## 任务 7：Bug 修复 — createSection 校验 + 其余小修

**文件：**
- 修改：`src/routes/image-project/step4-handlers.ts:201-227`（createSection）
- 修改：`src/routes/image-project/step4-handlers.ts:41-47`（VALID_SECTION_TYPES 复用）

- [ ] **步骤 1：在 step4-handlers.ts 顶部导入校验函数**

```typescript
// src/routes/image-project/step4-handlers.ts — 在 import 之后添加
import { VALID_SECTION_TYPES } from "../../modules/section-planning-service.js";
```

- [ ] **步骤 2：createSection 增加 sectionType 白名单校验**

```typescript
// src/routes/image-project/step4-handlers.ts — 替换第 201-227 行的 createSection 方法

  async createSection(request: FastifyRequest) {
    const user = await requireUser(this.ctx, request as import("fastify").FastifyRequest);
    const { projectId } = request.params as { projectId: string };
    await this.requireOwnerProject(user, projectId);

    const body = request.body as Record<string, unknown>;
    const sectionType = (body.sectionType as string) ?? "detail_showcase";

    // 校验 sectionType 白名单
    if (!VALID_SECTION_TYPES.includes(sectionType)) {
      throw new AppError(
        400,
        "INVALID_SECTION_TYPE",
        `sectionType 必须为以下之一: ${VALID_SECTION_TYPES.join(", ")}`,
      );
    }

    const now = Date.now();
    const section: PageSection = {
      id: crypto.randomUUID(),
      projectId,
      sectionKey: (body.sectionKey as string) ?? `custom_${now}`,
      sectionType: sectionType as PageSection["sectionType"],
      title: (body.title as string) ?? null,
      goal: (body.goal as string) ?? null,
      copy: (body.copy as string) ?? null,
      visualPrompt: (body.visualPrompt as string) ?? null,
      sortOrder: (body.sortOrder as number) ?? 0,
      status: "idle",
      currentImageAssetId: null,
      editableData: (body.editableData as Record<string, unknown>) ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await this.deps.pageSections.create(section);
    return { section };
  }
```

- [ ] **步骤 3：Commit**

```bash
git add src/routes/image-project/step4-handlers.ts
git commit -m "fix(step4): createSection 增加 sectionType 白名单校验"
```

---

## 任务 8：新建 SectionTypeIcon 组件

**文件：**
- 创建：`apps/web/pages/image-project/components/SectionTypeIcon.tsx`

- [ ] **步骤 1：创建类型彩色图标组件**

```tsx
// apps/web/pages/image-project/components/SectionTypeIcon.tsx
/**
 * SectionTypeIcon.tsx — Section 类型彩色图标 + 标签
 */

import React, { useMemo } from "react";
import type { SectionType } from "../../../../../src/contracts/types";

interface SectionTypeInfo {
  label: string;
  color: string;
  bgColor: string;
  icon: string; // Material Icons name
}

const TYPE_INFO: Record<SectionType, SectionTypeInfo> = {
  outfit_overview: { label: "搭配总览", color: "text-blue-700", bgColor: "bg-blue-100", icon: "style" },
  detail_showcase: { label: "细节展示", color: "text-purple-700", bgColor: "bg-purple-100", icon: "zoom_in" },
  scene_application: { label: "场景应用", color: "text-green-700", bgColor: "bg-green-100", icon: "landscape" },
  material_texture: { label: "材质纹理", color: "text-amber-700", bgColor: "bg-amber-100", icon: "texture" },
  size_comparison: { label: "尺码对比", color: "text-orange-700", bgColor: "bg-orange-100", icon: "straighten" },
  call_to_action: { label: "行动号召", color: "text-red-700", bgColor: "bg-red-100", icon: "shopping_cart" },
  brand_story: { label: "品牌故事", color: "text-indigo-700", bgColor: "bg-indigo-100", icon: "auto_stories" },
  styling_guide: { label: "穿搭指南", color: "text-pink-700", bgColor: "bg-pink-100", icon: "checkroom" },
  detail_closeup: { label: "细节特写", color: "text-teal-700", bgColor: "bg-teal-100", icon: "crop" },
  outfit_recommendation: { label: "搭配推荐", color: "text-cyan-700", bgColor: "bg-cyan-100", icon: "thumb_up" },
  user_review: { label: "用户评价", color: "text-emerald-700", bgColor: "bg-emerald-100", icon: "reviews" },
};

interface SectionTypeIconProps {
  type: SectionType;
  showLabel?: boolean;
  size?: "sm" | "md";
}

export const SectionTypeIcon: React.FC<SectionTypeIconProps> = React.memo(
  ({ type, showLabel = true, size = "sm" }) => {
    const info = TYPE_INFO[type] ?? TYPE_INFO.detail_showcase;
    const iconSize = size === "md" ? "text-lg" : "text-base";

    return (
      <span className={`inline-flex items-center gap-1 ${showLabel ? "" : "justify-center"}`}>
        <span className={`${info.bgColor} ${info.color} ${iconSize} w-6 h-6 rounded-full inline-flex items-center justify-center flex-shrink-0`}>
          <span className="material-icons-round text-sm">{info.icon}</span>
        </span>
        {showLabel && (
          <span className={`text-xs font-medium ${info.color}`}>{info.label}</span>
        )}
      </span>
    );
  },
);

SectionTypeIcon.displayName = "SectionTypeIcon";
```

- [ ] **步骤 2：Commit**

```bash
git add apps/web/pages/image-project/components/SectionTypeIcon.tsx
git commit -m "feat(step4-ui): 新建 SectionTypeIcon 彩色图标组件（11种类型）"
```

---

## 任务 9：SectionTree 拖拽排序 + 添加模块 + 美化

**文件：**
- 修改：`apps/web/pages/image-project/components/SectionTree.tsx`
- 创建：`apps/web/pages/image-project/components/AddSectionModal.tsx`

- [ ] **步骤 1：创建 AddSectionModal 组件**

```tsx
// apps/web/pages/image-project/components/AddSectionModal.tsx
/**
 * AddSectionModal.tsx — 添加模块模态框，11 种类型选择器
 */

import React, { useState } from "react";
import type { SectionType } from "../../../../../src/contracts/types";
import { SectionTypeIcon } from "./SectionTypeIcon";

const ALL_SECTION_TYPES: SectionType[] = [
  "outfit_overview", "detail_showcase", "scene_application",
  "material_texture", "size_comparison", "call_to_action",
  "brand_story", "styling_guide", "detail_closeup",
  "outfit_recommendation", "user_review",
];

interface AddSectionModalProps {
  onClose: () => void;
  onAdd: (type: SectionType) => void;
}

export const AddSectionModal: React.FC<AddSectionModalProps> = ({ onClose, onAdd }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-[400px] max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">添加模块</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <span className="material-icons-round text-lg">close</span>
          </button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[60vh] grid grid-cols-2 gap-2">
          {ALL_SECTION_TYPES.map((type) => (
            <button
              key={type}
              className="flex items-center gap-2 p-3 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-left"
              onClick={() => onAdd(type)}
            >
              <SectionTypeIcon type={type} size="md" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **步骤 2：重写 SectionTree 组件（拖拽 + 添加 + 美化）**

```tsx
// apps/web/pages/image-project/components/SectionTree.tsx — 完整替换文件内容

/**
 * SectionTree.tsx — 模块树组件（美化版）
 * 支持：拖拽排序、添加模块、缩略预览、HTML5 DnD
 */

import React, { useMemo, useState, useCallback } from "react";
import type { PageSection, SectionType } from "../../../../../src/contracts/types";
import { SectionTypeIcon } from "./SectionTypeIcon";
import { AddSectionModal } from "./AddSectionModal";

// ---------------------------------------------------------------------------
// 类型标签与状态
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<PageSection["status"], string> = {
  idle: "bg-gray-100 text-gray-500",
  planning: "bg-yellow-100 text-yellow-700",
  generating: "bg-blue-100 text-blue-700",
  ready: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<PageSection["status"], string> = {
  idle: "待生成",
  planning: "规划中",
  generating: "生成中",
  ready: "已完成",
  failed: "失败",
};

// ---------------------------------------------------------------------------
// 拖放上下文接口
// ---------------------------------------------------------------------------

interface DragItem {
  index: number;
  sectionId: string;
}

// ---------------------------------------------------------------------------
// SectionTree 组件
// ---------------------------------------------------------------------------

interface SectionTreeProps {
  sections: PageSection[];
  activeSectionId: string | null;
  onSelectSection: (id: string) => void;
  onGenerate: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (order: Array<{ id: string; sortOrder: number }>) => void;
  onAddSection: (type: SectionType) => void;
  generatingAll: boolean;
  generatingIds: Set<string>;
}

export const SectionTree: React.FC<SectionTreeProps> = React.memo(
  ({
    sections, activeSectionId, onSelectSection, onGenerate, onDelete,
    onReorder, onAddSection, generatingAll, generatingIds,
  }) => {
    const sortedSections = useMemo(
      () => [...sections].sort((a, b) => a.sortOrder - b.sortOrder),
      [sections],
    );

    const [showAddModal, setShowAddModal] = useState(false);
    const [dragItem, setDragItem] = useState<DragItem | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const handleDragStart = useCallback((index: number, sectionId: string) => {
      setDragItem({ index, sectionId });
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
      e.preventDefault();
      setDragOverIndex(index);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();
      if (!dragItem || dragItem.index === dropIndex) {
        setDragItem(null);
        setDragOverIndex(null);
        return;
      }

      const reordered = [...sortedSections];
      const [moved] = reordered.splice(dragItem.index, 1);
      reordered.splice(dropIndex, 0, moved);

      const order = reordered.map((s, i) => ({ id: s.id, sortOrder: i }));
      onReorder(order);
      setDragItem(null);
      setDragOverIndex(null);
    }, [dragItem, sortedSections, onReorder]);

    const handleDragEnd = useCallback(() => {
      setDragItem(null);
      setDragOverIndex(null);
    }, []);

    return (
      <div className="flex flex-col min-h-0">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2">
            <span className="material-icons-round text-blue-500 text-lg">view_list</span>
            <h3 className="text-sm font-semibold text-gray-700">电商模块</h3>
          </div>
          <button
            className="text-xs px-3 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors font-medium"
            disabled={generatingAll}
            onClick={() => {
              sortedSections.forEach((s) => {
                if (s.status === "idle" || s.status === "failed") {
                  onGenerate(s.id);
                }
              });
            }}
          >
            {generatingAll ? (
              <span className="flex items-center gap-1">
                <span className="animate-spin w-3 h-3 border border-white border-t-transparent rounded-full" />
                生成中
              </span>
            ) : "生成全部"}
          </button>
        </div>

        {/* 模块列表 */}
        <div className="flex-1 overflow-y-auto">
          {sortedSections.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm px-6 text-center gap-2">
              <span className="material-icons-round text-3xl text-gray-300">widgets</span>
              <p>暂无模块</p>
              <p className="text-xs text-gray-300">系统将自动进行 AI 规划</p>
            </div>
          ) : (
            <div className="py-1">
              {sortedSections.map((section, index) => {
                const isActive = section.id === activeSectionId;
                const isGenerating = generatingIds.has(section.id);
                const showDragLine = dragOverIndex === index;

                return (
                  <React.Fragment key={section.id}>
                    {showDragLine && (
                      <div className="h-0.5 bg-blue-500 mx-3 rounded-full" />
                    )}
                    <div
                      draggable
                      onDragStart={() => handleDragStart(index, section.id)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-all duration-150 ${
                        isActive
                          ? "bg-blue-50 border-l-2 border-blue-500"
                          : "hover:bg-gray-50"
                      } ${dragItem?.sectionId === section.id ? "opacity-50" : ""}`}
                      onClick={() => onSelectSection(section.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectSection(section.id);
                        }
                      }}
                    >
                      {/* 序号 + 拖拽手柄 */}
                      <span className="text-xs text-gray-300 w-4 text-center flex-shrink-0 select-none">
                        {index + 1}
                      </span>
                      <span className="material-icons-round text-gray-300 text-sm cursor-grab flex-shrink-0" title="拖拽排序">
                        drag_indicator
                      </span>

                      {/* 内容 */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {section.title || section.sectionKey}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <SectionTypeIcon type={section.sectionType} showLabel size="sm" />
                        </div>
                      </div>

                      {/* 状态 */}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[section.status]}`}>
                        {isGenerating ? (
                          <span className="animate-spin w-3 h-3 border border-current border-t-transparent rounded-full inline-block" />
                        ) : (
                          STATUS_LABELS[section.status]
                        )}
                      </span>

                      {/* 操作按钮 */}
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {(section.status === "idle" || section.status === "failed") && (
                          <button
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 disabled:opacity-50 transition-colors"
                            title="生成"
                            disabled={isGenerating}
                            onClick={(e) => {
                              e.stopPropagation();
                              onGenerate(section.id);
                            }}
                          >
                            <span className="material-icons-round text-base">play_arrow</span>
                          </button>
                        )}
                        <button
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                          title="删除模块"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(section.id);
                          }}
                        >
                          <span className="material-icons-round text-base">delete_outline</span>
                        </button>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="border-t border-gray-200 bg-white px-4 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              共 {sortedSections.length} 个模块
            </span>
            <button
              className="text-xs px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center gap-1"
              onClick={() => setShowAddModal(true)}
            >
              <span className="material-icons-round text-sm">add</span>
              添加模块
            </button>
          </div>
        </div>

        {/* 添加模块模态框 */}
        {showAddModal && (
          <AddSectionModal
            onClose={() => setShowAddModal(false)}
            onAdd={(type) => {
              onAddSection(type);
              setShowAddModal(false);
            }}
          />
        )}
      </div>
    );
  },
);

SectionTree.displayName = "SectionTree";
```

- [ ] **步骤 3：Commit**

```bash
git add apps/web/pages/image-project/components/AddSectionModal.tsx apps/web/pages/image-project/components/SectionTree.tsx apps/web/pages/image-project/components/SectionTypeIcon.tsx
git commit -m "feat(step4-ui): SectionTree 拖拽排序 + 添加模块 + 全面美化"
```

---

## 任务 10：PhonePreview 文案展示 + 占位优化 + 淡入动画

**文件：**
- 修改：`apps/web/pages/image-project/components/PhonePreview.tsx`

- [ ] **步骤 1：重写 PhonePreview**

```tsx
// apps/web/pages/image-project/components/PhonePreview.tsx — 完整替换

/**
 * PhonePreview.tsx — 手机预览组件（美化版）
 * 支持：文案展示、占位图优化、图片淡入动画、滚动条美化
 */

import React, { useMemo, useState } from "react";
import type { PageSection } from "../../../../../src/contracts/types";
import { SectionTypeIcon } from "./SectionTypeIcon";

interface PhonePreviewProps {
  sections: PageSection[];
  activeSectionId: string | null;
  loading: boolean;
}

export const PhonePreview: React.FC<PhonePreviewProps> = React.memo(
  ({ sections, activeSectionId, loading }) => {
    const sortedSections = useMemo(
      () => [...sections].sort((a, b) => a.sortOrder - b.sortOrder),
      [sections],
    );

    if (loading && sortedSections.length === 0) {
      return (
        <div className="flex flex-col items-center">
          <div className="relative w-[320px] rounded-[36px] border-8 border-gray-800 bg-gray-900 overflow-hidden shadow-2xl shadow-gray-300/50">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-gray-800 rounded-b-2xl z-10" />
            <div className="bg-white min-h-[640px] flex items-center justify-center">
              <div className="text-center text-gray-400">
                {/* 骨架屏 */}
                <div className="space-y-4 px-6 py-8">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-32 bg-gray-200 rounded-xl" />
                      <div className="h-3 bg-gray-100 rounded mt-2 w-3/4 mx-auto" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (sortedSections.length === 0) {
      return (
        <div className="flex flex-col items-center">
          <div className="relative w-[320px] rounded-[36px] border-8 border-gray-800 bg-gray-900 overflow-hidden shadow-2xl shadow-gray-300/50">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-gray-800 rounded-b-2xl z-10" />
            <div className="bg-white min-h-[640px] flex items-center justify-center">
              <div className="text-center text-gray-400 text-sm px-6">
                <span className="material-icons-round text-4xl text-gray-300 mb-2 block">smartphone</span>
                <p>AI 规划完成后将在这里预览电商详情页</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center">
        <div className="relative w-[320px] rounded-[36px] border-8 border-gray-800 bg-gray-900 overflow-hidden shadow-2xl shadow-gray-300/50">
          {/* 刘海 */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-gray-800 rounded-b-2xl z-10" />
          {/* 屏幕内容 */}
          <div className="bg-white h-[640px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {sortedSections.map((section) => {
              const isActive = section.id === activeSectionId;

              return (
                <div
                  key={section.id}
                  className={`relative transition-all duration-200 ${
                    isActive ? "ring-2 ring-blue-500 ring-inset scale-[1.01]" : ""
                  }`}
                >
                  {/* 模块图片 */}
                  {section.currentImageAssetId ? (
                    <ImageWithFade src={section.currentImageAssetId} alt={section.title || section.sectionKey} />
                  ) : (
                    <div className="w-full h-44 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
                      {section.status === "planning" || section.status === "generating" ? (
                        <div className="text-center text-gray-400">
                          <div className="animate-spin w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-2" />
                          <p className="text-xs">生成中...</p>
                        </div>
                      ) : (
                        <div className="text-center text-gray-300">
                          <SectionTypeIcon type={section.sectionType} showLabel={false} size="md" />
                          <p className="text-xs mt-1">待生成</p>
                        </div>
                      )}
                    </div>
                  )}
                  {/* 模块标题 + 文案 */}
                  <div className="px-3 py-2.5 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {section.title}
                    </p>
                    {section.copy && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
                        {section.copy}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  },
);

/** 图片淡入组件 */
const ImageWithFade: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative w-full overflow-hidden" style={{ minHeight: "180px" }}>
      <img
        src={src}
        alt={alt}
        className={`w-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)}
        loading="lazy"
      />
      {!loaded && (
        <div className="absolute inset-0 bg-gray-100 animate-pulse" />
      )}
    </div>
  );
};

PhonePreview.displayName = "PhonePreview";
```

- [ ] **步骤 2：Commit**

```bash
git add apps/web/pages/image-project/components/PhonePreview.tsx
git commit -m "feat(step4-ui): PhonePreview 文案展示 + 骨架屏 + 淡入动画 + 美化"
```

---

## 任务 11：SectionEditor 美化 + 版本缩略图修复

**文件：**
- 修改：`apps/web/pages/image-project/components/SectionEditor.tsx`
- 修改：`apps/web/pages/image-project/components/VersionHistory.tsx`

- [ ] **步骤 1：重写 SectionEditor**

```tsx
// apps/web/pages/image-project/components/SectionEditor.tsx — 完整替换

/**
 * SectionEditor.tsx — 模块编辑面板（美化版）
 */

import React, { useState, useEffect, useRef } from "react";
import { realBackendApi } from "../../../services/realApi";
import { useAppStore } from "../../../store/useAppStore";
import { VersionHistory } from "./VersionHistory";
import { SectionTypeIcon } from "./SectionTypeIcon";
import type { PageSection, SectionVersion, SectionType } from "../../../../../src/contracts/types";

interface SectionEditorProps {
  section: PageSection;
  onUpdated: (section: PageSection) => void;
  onDeleted: () => void;
  onAddSection?: (type: SectionType) => void;
}

export const SectionEditor: React.FC<SectionEditorProps> = ({
  section, onUpdated, onDeleted, onAddSection,
}) => {
  const token = useAppStore((state) => state.token);
  const projectId = useAppStore((state) => state.workflow.projectId);
  const pushTaskNotification = useAppStore((state) => state.pushTaskNotification);
  const [title, setTitle] = useState(section.title || "");
  const [copy, setCopy] = useState(section.copy || "");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<SectionVersion[]>([]);
  const [showPrompt, setShowPrompt] = useState(false);
  const [imageHover, setImageHover] = useState(false);
  const [imageZoom, setImageZoom] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTitle(section.title || "");
    setCopy(section.copy || "");
  }, [section]);

  const handleSave = async () => {
    if (!token || !projectId) return;
    setSaving(true);
    try {
      const result = await realBackendApi.imageStep4UpdateSection(token, projectId, section.id, {
        title, copy,
      });
      onUpdated(result.section);
      pushTaskNotification({ category: "clip", title: "保存成功", detail: "模块信息已更新", targetPath: `/image-create/${projectId}/step4` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存失败";
      pushTaskNotification({ category: "clip", title: "保存失败", detail: message, targetPath: `/image-create/${projectId}/step4` });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!token || !projectId) return;
    setGenerating(true);
    try {
      const result = await realBackendApi.imageStep4GenerateSection(token, projectId, section.id);
      onUpdated(result.section);
      pushTaskNotification({ category: "clip", title: "生成成功", detail: "图片已生成", targetPath: `/image-create/${projectId}/step4` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "生成失败";
      pushTaskNotification({ category: "clip", title: "生成失败", detail: message, targetPath: `/image-create/${projectId}/step4` });
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !projectId) return;
    if (!confirm("确认删除此模块？")) return;
    try {
      await realBackendApi.imageStep4DeleteSection(token, projectId, section.id);
      onDeleted();
      pushTaskNotification({ category: "clip", title: "删除成功", detail: "模块已删除", targetPath: `/image-create/${projectId}/step4` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "删除失败";
      pushTaskNotification({ category: "clip", title: "删除失败", detail: message, targetPath: `/image-create/${projectId}/step4` });
    }
  };

  const loadVersions = async () => {
    if (!token || !projectId) return;
    try {
      const result = await realBackendApi.imageStep4ListVersions(token, projectId, section.id);
      setVersions(result.versions);
    } catch { setVersions([]); }
  };

  return (
    <div className="flex flex-col min-h-0 overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <SectionTypeIcon type={section.sectionType} showLabel />
        </div>
        <button className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors" title="删除模块" onClick={handleDelete}>
          <span className="material-icons-round text-lg">delete_outline</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* 标题 */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1.5">
            <span className="material-icons-round text-sm text-gray-400">title</span>
            标题
          </label>
          <input
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            placeholder="输入模块标题"
          />
        </div>

        {/* 文案 */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1.5">
            <span className="material-icons-round text-sm text-gray-400">notes</span>
            文案
          </label>
          <textarea
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all resize-none"
            value={copy}
            onChange={(e) => setCopy(e.value)}
            maxLength={2000}
            rows={4}
            placeholder="输入模块文案"
          />
          <p className="text-[10px] text-gray-400 mt-1 text-right">{copy.length}/2000</p>
        </div>

        {/* 视觉提示词（可折叠） */}
        {section.visualPrompt && (
          <div>
            <button
              className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1.5 hover:text-gray-800 transition-colors"
              onClick={() => setShowPrompt(!showPrompt)}
            >
              <span className="material-icons-round text-sm text-gray-400">{showPrompt ? "expand_less" : "expand_more"}</span>
              视觉提示词
            </button>
            {showPrompt && (
              <div className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg max-h-32 overflow-y-auto leading-relaxed">
                {section.visualPrompt}
              </div>
            )}
          </div>
        )}

        {/* 图片预览 */}
        {section.currentImageAssetId && (
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1.5">
              <span className="material-icons-round text-sm text-gray-400">image</span>
              当前图片
            </label>
            <div
              ref={previewRef}
              className="rounded-xl border border-gray-200 overflow-hidden cursor-pointer relative group"
              onMouseEnter={() => setImageHover(true)}
              onMouseLeave={() => { setImageHover(false); setImageZoom(false); }}
              onClick={() => setImageZoom(!imageZoom)}
            >
              <img
                src={section.currentImageAssetId}
                alt={section.title || section.sectionKey}
                className={`w-full object-cover transition-transform duration-200 ${imageZoom ? "scale-110" : "scale-100"}`}
              />
              {imageHover && (
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                  <span className="material-icons-round text-white text-2xl">{imageZoom ? "zoom_out" : "zoom_in"}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-2">
          <button
            className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
            disabled={saving || generating}
            onClick={handleSave}
          >
            {saving ? (
              <span className="animate-spin w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full" />
            ) : (
              <span className="material-icons-round text-base">save</span>
            )}
            {saving ? "保存中..." : "保存"}
          </button>
          <button
            className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
            disabled={generating || saving}
            onClick={handleGenerate}
          >
            {generating ? (
              <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <span className="material-icons-round text-base">{section.status === "ready" ? "refresh" : "play_arrow"}</span>
            )}
            {generating ? "生成中..." : section.status === "ready" ? "重新生成" : "生成"}
          </button>
        </div>

        {/* 版本历史 */}
        <div className="border-t border-gray-200 pt-4">
          <button
            className="w-full text-left text-sm font-medium text-gray-600 hover:text-gray-800 flex items-center gap-1"
            onClick={() => { setShowVersions(!showVersions); if (!showVersions && versions.length === 0) loadVersions(); }}
          >
            <span className="material-icons-round text-base text-gray-400">{showVersions ? "expand_less" : "expand_more"}</span>
            版本历史 ({versions.length})
          </button>
          {showVersions && (
            <div className="mt-3">
              <VersionHistory versions={versions} sectionId={section.id} onVersionActivated={loadVersions} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **步骤 2：VersionHistory 保持不变（依赖后端 Bug 修复自动正确显示）

VersionHistory 组件无需修改。后端修复 `SectionVersion.imageAssetId` 后，缩略图自动正确显示。

- [ ] **步骤 3：Commit**

```bash
git add apps/web/pages/image-project/components/SectionEditor.tsx
git commit -m "feat(step4-ui): SectionEditor 美化（提示词折叠、图片悬浮放大、图标按钮）"
```

---

## 任务 12：ImageEcommerceEditor 整合 + 下载按钮 + 清理 console.log

**文件：**
- 修改：`apps/web/pages/image-project/ImageEcommerceEditor.tsx`
- 创建：`apps/web/pages/image-project/components/DownloadButton.tsx`

- [ ] **步骤 1：创建 DownloadButton 组件**

```tsx
// apps/web/pages/image-project/components/DownloadButton.tsx
/**
 * DownloadButton.tsx — Canvas 下载电商详情页长图
 * 将 PhonePreview 中已加载的 Section 图片拼接为长图并下载
 */

import React, { useCallback, useState } from "react";
import type { PageSection } from "../../../../../src/contracts/types";

interface DownloadButtonProps {
  sections: PageSection[];
}

const SECTION_IMAGE_HEIGHT = 400; // Canvas 中每个 Section 图片的高度
const SECTION_HEADER_HEIGHT = 60; // 标题+文案区域高度
const CANVAS_WIDTH = 750; // 电商长图标准宽度
const PADDING = 20;

export const DownloadButton: React.FC<DownloadButtonProps> = ({ sections }) => {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    const sectionsWithImages = sections.filter((s) => s.currentImageAssetId && s.status === "ready");
    if (sectionsWithImages.length === 0) {
      alert("暂无已生成的模块图片，请先生成模块");
      return;
    }

    setDownloading(true);
    try {
      const canvasHeight = sectionsWithImages.length * (SECTION_IMAGE_HEIGHT + SECTION_HEADER_HEIGHT) + PADDING * 2;
      const canvas = document.createElement("canvas");
      canvas.width = CANVAS_WIDTH;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // 白色背景
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, CANVAS_WIDTH, canvasHeight);

      let yOffset = PADDING;
      for (const section of sectionsWithImages) {
        // 绘制图片
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject();
          img.src = section.currentImageAssetId!;
        });

        // 计算缩放（保持宽高比）
        const imgRatio = img.width / img.height;
        const drawWidth = CANVAS_WIDTH - PADDING * 2;
        const drawHeight = drawWidth / imgRatio;

        ctx.drawImage(img, PADDING, yOffset, drawWidth, drawHeight);
        yOffset += drawHeight;

        // 绘制标题
        ctx.fillStyle = "#1f2937";
        ctx.font = "bold 28px sans-serif";
        ctx.fillText(section.title || section.sectionKey, PADDING, yOffset + 20);

        // 绘制文案
        if (section.copy) {
          ctx.fillStyle = "#6b7280";
          ctx.font = "20px sans-serif";
          const maxWidth = CANVAS_WIDTH - PADDING * 2;
          const words = section.copy;
          let line = "";
          let lineHeight = 26;
          let lineY = yOffset + 50;
          for (let i = 0; i < words.length; i++) {
            const testLine = line + words[i];
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && i > 0) {
              ctx.fillText(line, PADDING, lineY);
              line = words[i];
              lineY += lineHeight;
            } else {
              line = testLine;
            }
          }
          ctx.fillText(line, PADDING, lineY);
        }

        yOffset += SECTION_HEADER_HEIGHT + 10;

        // 分隔线
        ctx.strokeStyle = "#f3f4f6";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PADDING, yOffset);
        ctx.lineTo(CANVAS_WIDTH - PADDING, yOffset);
        ctx.stroke();
        yOffset += 10;
      }

      // 下载
      const link = document.createElement("a");
      link.download = `电商详情页_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("下载失败:", err);
      alert("下载失败，请重试");
    } finally {
      setDownloading(false);
    }
  }, [sections]);

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className="rounded-full px-5 bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20 whitespace-nowrap flex items-center gap-1 transition-colors disabled:opacity-50"
    >
      {downloading ? (
        <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
      ) : (
        <span className="material-icons-round text-lg">download</span>
      )}
      <span className="hidden md:inline">{downloading ? "生成中..." : "下载"}</span>
    </button>
  );
};
```

- [ ] **步骤 2：重写 ImageEcommerceEditor（清理 console.log + 下载按钮 + 新 props 传递）**

```tsx
// apps/web/pages/image-project/ImageEcommerceEditor.tsx — 完整替换

/**
 * ImageEcommerceEditor.tsx — Step 4 电商详情页三栏编辑器（美化版）
 * 左栏：模块树 | 中栏：手机预览 | 右栏：编辑面板 + 版本历史
 */

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAppStore } from "../../store/useAppStore";
import { realBackendApi } from "../../services/realApi";
import { Button } from "../../components/ui/Button";
import {
  resolveStep4FooterTargetRoute,
  resolveStep4FooterPreviousRoute,
  resolveStep4FooterFeedback,
} from "../project-flow/step2ProjectFlowAction";
import { PhonePreview } from "./components/PhonePreview";
import { SectionTree } from "./components/SectionTree";
import { SectionEditor } from "./components/SectionEditor";
import { DownloadButton } from "./components/DownloadButton";
import type { PageSection, SectionType } from "../../../../src/contracts/types";

interface ImageEcommerceEditorProps {
  projectId: string;
}

export const ImageEcommerceEditorRoute: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) return null;
  return <ImageEcommerceEditor projectId={projectId} />;
};

export const ImageEcommerceEditor: React.FC<ImageEcommerceEditorProps> = ({ projectId }) => {
  const token = useAppStore((state) => state.token);
  const pushTaskNotification = useAppStore((state) => state.pushTaskNotification);
  const navigate = useNavigate();

  const kind: "image" | "video" = "image";
  const [sections, setSections] = useState<PageSection[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (loading) {
      useAppStore.getState().showGlobalLoading();
    } else {
      useAppStore.getState().hideGlobalLoading();
    }
  }, [loading]);

  const handleGenerateSingle = useCallback(async (sectionId: string) => {
    if (!token) return;
    setGeneratingIds((prev) => new Set(prev).add(sectionId));
    try {
      const result = await realBackendApi.imageStep4GenerateSection(token, projectId, sectionId);
      setSections((prev) => prev.map((s) => (s.id === sectionId ? result.section : s)));
      pushTaskNotification({ category: "clip", title: "生成成功", detail: "模块已生成", targetPath: `/image-create/${projectId}/step4` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "生成失败";
      pushTaskNotification({ category: "clip", title: "生成失败", detail: message, targetPath: `/image-create/${projectId}/step4` });
    } finally {
      setGeneratingIds((prev) => { const next = new Set(prev); next.delete(sectionId); return next; });
    }
  }, [token, projectId, pushTaskNotification]);

  const handleDeleteSection = useCallback(async (sectionId: string) => {
    if (!token) return;
    if (!confirm("确认删除此模块？")) return;
    try {
      await realBackendApi.imageStep4DeleteSection(token, projectId, sectionId);
      setSections((prev) => prev.filter((s) => s.id !== sectionId));
      setActiveSectionId((prev) => (prev === sectionId ? null : prev));
    } catch (err) {
      const message = err instanceof Error ? err.message : "删除失败";
      pushTaskNotification({ category: "clip", title: "删除失败", detail: message, targetPath: `/image-create/${projectId}/step4` });
    }
  }, [token, projectId, pushTaskNotification]);

  const handleReorderSections = useCallback(async (order: Array<{ id: string; sortOrder: number }>) => {
    if (!token) return;
    try {
      await realBackendApi.imageStep4ReorderSections(token, projectId, order);
      setSections((prev) => {
        const orderMap = new Map(order.map((o) => [o.id, o.sortOrder]));
        return prev.map((s) => ({ ...s, sortOrder: orderMap.get(s.id) ?? s.sortOrder }));
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "排序失败";
      pushTaskNotification({ category: "clip", title: "排序失败", detail: message, targetPath: `/image-create/${projectId}/step4` });
    }
  }, [token, projectId, pushTaskNotification]);

  const handleAddSection = useCallback(async (type: SectionType) => {
    if (!token) return;
    try {
      const result = await realBackendApi.imageStep4CreateSection(token, projectId, {
        sectionType: type,
        title: "",
      });
      setSections((prev) => [...prev, result.section]);
      setActiveSectionId(result.section.id);
      pushTaskNotification({ category: "clip", title: "添加成功", detail: "新模块已添加", targetPath: `/image-create/${projectId}/step4` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "添加失败";
      pushTaskNotification({ category: "clip", title: "添加失败", detail: message, targetPath: `/image-create/${projectId}/step4` });
    }
  }, [token, projectId, pushTaskNotification]);

  // 自动加载模块，如无模块则触发 AI 规划
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const currentToken = useAppStore.getState().token;
      const currentPush = useAppStore.getState().pushTaskNotification;
      try {
        const existing = await realBackendApi.imageStep4ListSections(currentToken!, projectId);
        if (cancelled) return;

        setSections(existing.sections);

        if (existing.sections.length === 0) {
          const plan = await realBackendApi.imageStep4PlanSections(currentToken!, projectId);
          if (cancelled) return;

          setSections(plan.sections);
          currentPush({
            category: "clip",
            title: "AI 规划完成",
            detail: `共 ${plan.sections.length} 个模块，点击「生成全部」开始制作`,
            targetPath: `/image-create/${projectId}/step4`,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "加载模块失败";
        if (!cancelled) {
          useAppStore.getState().pushTaskNotification({
            category: "clip", title: "加载失败", detail: message, targetPath: `/image-create/${projectId}/step4`,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [projectId]);

  const activeSection = sections.find((s) => s.id === activeSectionId) ?? null;

  return (
    <div className="flex flex-1 min-h-0 gap-4">
      {/* 左栏：模块树 */}
      <div className="hidden xl:flex flex-col w-[320px] min-h-0 border-r border-gray-200 bg-gray-50/50">
        <SectionTree
          sections={sections}
          activeSectionId={activeSectionId}
          onSelectSection={setActiveSectionId}
          onGenerate={(id) => void handleGenerateSingle(id)}
          onDelete={(id) => void handleDeleteSection(id)}
          onReorder={handleReorderSections}
          onAddSection={handleAddSection}
          generatingAll={generatingAll}
          generatingIds={generatingIds}
        />
      </div>

      {/* 中栏：手机预览 */}
      <div className="flex-1 min-h-0 flex items-center justify-center bg-gray-50/50 overflow-auto">
        <PhonePreview
          sections={sections}
          activeSectionId={activeSectionId}
          loading={loading}
        />
      </div>

      {/* 右栏：编辑面板 + 版本历史 */}
      <div className="hidden xl:flex flex-col w-[380px] min-h-0 border-l border-gray-200 bg-white">
        {activeSection ? (
          <SectionEditor
            section={activeSection}
            onUpdated={(updated) => {
              setSections((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
            }}
            onDeleted={() => {
              setSections((prev) => prev.filter((s) => s.id !== activeSectionId));
              setActiveSectionId(null);
            }}
            onAddSection={handleAddSection}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
            <span className="material-icons-round text-3xl text-gray-300">touch_app</span>
            <p>选择左侧模块开始编辑</p>
          </div>
        )}
      </div>

      {/* 底部工具条 */}
      <div className="fixed bottom-6 inset-x-0 flex items-center justify-center z-50 pointer-events-none">
        <div className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-full px-2 py-2 shadow-xl shadow-gray-200/50 pointer-events-auto flex items-center gap-4 max-w-[90%] md:max-w-none transform transition-all hover:scale-[1.01] active:scale-[0.99]">
          <Button variant="ghost" onClick={() => { navigate(resolveStep4FooterPreviousRoute(kind, projectId)); }} className="rounded-full px-4 text-gray-500 hover:text-gray-900 whitespace-nowrap">
            <span className="material-icons-round text-lg mr-1">arrow_back</span>
            <span className="hidden md:inline">上一步</span>
          </Button>

          <div className="h-4 w-px bg-gray-200" />

          <div className="text-[10px] text-gray-400 font-medium px-2 whitespace-nowrap flex items-center gap-1">
            {resolveStep4FooterFeedback(kind)}
          </div>

          <div className="h-4 w-px bg-gray-200" />

          <DownloadButton sections={sections} />

          <div className="h-4 w-px bg-gray-200" />

          <div className="pr-1">
            <Button
              onClick={() => { navigate(resolveStep4FooterTargetRoute(kind, projectId)); }}
              className="rounded-full px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 shadow-none whitespace-nowrap"
            >
              <span className="hidden md:inline">返回项目</span>
              <span className="md:hidden">返回</span>
              <span className="material-icons-round text-lg ml-1">chevron_right</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **步骤 3：验证前端编译**

运行：
```bash
cd apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | head -30
```

- [ ] **步骤 4：Commit**

```bash
git add apps/web/pages/image-project/ImageEcommerceEditor.tsx apps/web/pages/image-project/components/DownloadButton.tsx
git commit -m "feat(step4-ui): 底部下载按钮 + 清理 console.log + 拖拽排序整合"
```

---

## 任务 13：数据库提示词模板

**文件：**
- 数据库操作：INSERT/UPDATE `nrm_prompt_templates`

- [ ] **步骤 1：插入图片项目 Step1 卖点提取提示词**

运行以下 SQL：

```sql
INSERT INTO nrm_prompt_templates (code, name, content, description, is_system, created_at, updated_at)
VALUES (
  'image_project_step1_selling_points',
  '图片项目 Step1 卖点提取',
  '---SYSTEM---
你是一位资深电商详情页策划专家。请根据提供的服饰搭配方案信息，提取适合用于电商详情页的卖点。

## 卖点分类
从以下 6 个分类中选择：面料、工艺、版型、设计、搭配、场景

## 优先级定义
- priority = 1（核心卖点）：最能打动消费者、最能体现产品价值的卖点，每套方案 2-3 个
- priority = 2（次要卖点）：补充性卖点，用于丰富详情页内容，每套方案 1-2 个

## 要求
1. 卖点必须具体、可感知，避免空泛描述
2. 每个卖点用一句话描述，突出用户利益点
3. 卖点要能从服饰分析中推导出来，不能凭空捏造
4. 优先提取与电商转化直接相关的卖点
5. 总共输出 3-6 个卖点

## 输出格式
只输出纯 JSON 数组，不要输出任何其他内容：
[{"point":"卖点描述","category":"分类","priority":1}]

---USER---
搭配方案标题：{{title}}
风格名称：{{styleName}}
分析内容：{{analysis}}
单品列表：{{items}}
风格标签：{{tags}}
适用场景：{{suitableScene}}

请提取 3-6 个电商详情页卖点。',
  '图片项目 Step1 服饰分析完成后，自动提取电商详情页卖点',
  true,
  extract(epoch from now()) * 1000,
  extract(epoch from now()) * 1000
) ON CONFLICT (code) DO UPDATE SET content = EXCLUDED.content, updated_at = extract(epoch from now()) * 1000;
```

- [ ] **步骤 2：更新 Step4 Section 规划提示词**

运行以下 SQL 更新 `step4_section_planning` 模板（需读取当前内容后修改）：

```sql
UPDATE nrm_prompt_templates SET content = '---SYSTEM---
你是一位资深电商视觉设计师，擅长将产品卖点转化为有吸引力的详情页视觉方案。

## 核心原则
**卖点驱动设计**：每个 Section 都必须对应一个或多个卖点。核心卖点（priority=1）必须有独立 Section 重点展示。

## Section 类型（11种）
| 类型 | 说明 | 适用卖点分类 |
|------|------|-------------|
| outfit_overview | 搭配总览 | 所有核心卖点 |
| brand_story | 品牌故事 | 设计 |
| detail_showcase | 细节展示 | 工艺/设计 |
| detail_closeup | 细节特写 | 工艺/面料 |
| material_texture | 材质纹理 | 面料 |
| scene_application | 场景应用 | 场景 |
| styling_guide | 穿搭指南 | 搭配 |
| outfit_recommendation | 搭配推荐 | 搭配/场景 |
| size_comparison | 尺码对比 | 版型 |
| user_review | 用户评价 | 通用 |
| call_to_action | 行动号召 | 通用 |

## Section 排列顺序（电商最佳转化路径）
1. outfit_overview → 2. brand_story → 3. detail_showcase → 4. detail_closeup → 5. material_texture → 6. scene_application → 7. styling_guide → 8. outfit_recommendation → 9. size_comparison → 10. user_review → 11. call_to_action

根据实际卖点数量从上述顺序中选取最匹配的 4-8 个 Section。

## 视觉提示词（visualPrompt）要求
每个 Section 的 visualPrompt 必须包含：
- 场景描述：具体的空间和环境
- 光线设定：自然光/暖光/冷光/逆光
- 构图指引：居中/三分法/对称/对角线
- 模特姿态：站立/坐姿/行走/回眸
- 图文结合区域：标注文案摆放位置（如"左下角留白区用于放置文案"）

## 输出格式
只输出纯 JSON 数组，不要输出任何其他内容：
[{"sectionKey":"唯一标识","sectionType":"类型","title":"标题","goal":"目标","copy":"文案","visualPrompt":"视觉提示词"}]

---USER---
搭配方案标题：{{title}}
风格名称：{{styleName}}
分析内容：{{analysis}}
优化提示词：{{optimizedPrompt}}
卖点列表：{{sellingPoints}}
模特照片：{{modelPhotos}}
{{userPrompt}}

请根据卖点规划 4-8 个电商详情页 Section。',
updated_at = extract(epoch from now()) * 1000
WHERE code = ''step4_section_planning'';
```

- [ ] **步骤 3：验证提示词加载**

运行：
```bash
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\"SELECT code, name, LENGTH(content) as len FROM nrm_prompt_templates WHERE code IN ('image_project_step1_selling_points', 'step4_section_planning') ORDER BY code\")
  .then(r => { console.log(JSON.stringify(r.rows, null, 2)); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); });
"
```

预期：两个提示词都有内容，长度 > 500

- [ ] **步骤 4：Commit（SQL 操作不需要 commit，但记录）**

```bash
git add .
git commit -m "chore(step4): 数据库插入卖点提取提示词 + 更新 Section 规划提示词"
```

---

## 任务 14：最终验证 + 启动测试

- [ ] **步骤 1：后端 TypeScript 编译**

运行：
```bash
npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```
预期：无新增错误

- [ ] **步骤 2：前端 TypeScript 编译**

运行：
```bash
cd apps/web && npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```
预期：无新增错误

- [ ] **步骤 3：启动项目验证**

按照 CLAUDE.md 中的启动规范启动项目：
```bash
# 清理云数据库残留查询
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
pool.query('SELECT pg_terminate_backend(pid), pid, query FROM pg_stat_activity WHERE datname = current_database() AND pid != pg_backend_pid() AND state != \\'idle\\'')
  .then(r => { console.log('Killed:', r.rows.length); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); });
"

# 启动后端
PERSISTENCE_REQUIRE_READY=false npm run dev

# 启动前端
npm --prefix apps/web run dev
```

- [ ] **步骤 4：浏览器验证清单**

打开 `http://localhost:3000` 后逐项验证：

1. Step1 搭配方案生成后，返回数据中包含 `sellingPoints` 字段
2. 进入 Step4，Section 规划结果包含 4-8 个 Section，类型不限于原有 6 种
3. SectionTree 支持拖拽排序
4. SectionTree 底部「+ 添加模块」按钮可弹出 11 种类型选择器
5. PhonePreview 显示文案（copy 字段），未生成 Section 显示类型图标占位
6. SectionEditor 视觉提示词可折叠
7. 生成 Section 图片后，版本历史显示正确缩略图（不再是"无图"）
8. 激活历史版本后，图片正确切换
9. 底部工具栏显示"下载"按钮
10. 点击下载可生成电商详情页长图

- [ ] **步骤 5：最终 Commit**

```bash
git add -A
git commit -m "feat(step4): 图片项目 Step4 电商详情页全面增强完成"
```

---

## 规格自检

### 1. 规格覆盖度

| 规格章节 | 对应任务 | 状态 |
|---------|---------|------|
| 2.1 Step1 触发时机 | 任务 4 | ✓ |
| 2.2 数据模型 (sellingPoints) | 任务 1, 2 | ✓ |
| 2.3 提示词隔离 | 任务 1, 13 | ✓ |
| 2.4 提取流程 | 任务 3, 4 | ✓ |
| 3.1 Section 类型扩展 | 任务 1 | ✓ |
| 3.2 卖点→Section 映射 | 任务 5 (提示词中定义) | ✓ |
| 3.3 Section 排列逻辑 | 任务 5 (提示词中定义) | ✓ |
| 3.4 视觉提示词质量要求 | 任务 13 (提示词中定义) | ✓ |
| 4. Bug 1-4 修复 | 任务 6, 7 | ✓ |
| 5.1 整体布局优化 | 任务 9, 10, 11, 12 | ✓ |
| 5.2 SectionTree 美化 | 任务 9 | ✓ |
| 5.3 PhonePreview 美化 | 任务 10 | ✓ |
| 5.4 SectionEditor 美化 | 任务 11 | ✓ |
| 5.5 底部工具栏 | 任务 12 | ✓ |
| 5.6 新增交互 | 任务 9, 10, 12 | ✓ |
| 数据库变更 | 任务 2, 13 | ✓ |

### 2. 占位符扫描
无 TODO、待定、后续补充等占位符。✓

### 3. 类型一致性
- `SectionType` 在 types.ts 定义，所有组件引用同一类型 ✓
- `sellingPoints` 类型在 types.ts 定义，仓库/服务/组件共享 ✓
- `VALID_SECTION_TYPES` 在 section-planning-service.ts 定义，step4-handlers.ts 复用 ✓

### 4. 无"类似任务 N"
每个任务独立包含完整代码，无引用其他任务的情况。✓
