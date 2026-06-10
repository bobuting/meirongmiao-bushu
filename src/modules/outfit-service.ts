import type { GarmentAsset, OutfitPlan, ProjectOutfitPlanAssoc, User } from "../contracts/types.js";
import { resolveGarmentImageUrl } from "../contracts/types.js";
import type { IAssetRepository, IOutfitPlanRepository, IProjectOutfitPlanAssocRepository } from "../contracts/repository-ports/asset-repository.js";
import type { IGarmentAssetRepository } from "../contracts/repository-ports/garment-repository.js";
import type { IRepositoryClock } from "../contracts/repository-ports/common.js";
import type { IOutfitService, IProjectService } from "../contracts/services.js";
import type { AppContext } from "../core/app-context.js";
import type { ResolvedRouteProvider } from "../services/llm/provider-resolver.js";
import type { OutfitItem } from "../contracts/step1-joint-reverse-contract.js";
import { assertCondition } from "../core/errors.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";
import { resolveRouteProvider } from "../services/llm/provider-resolver.js";
import { requestLlmOutfitAnalysisCards, type OutfitPlanAnalysisContext } from "./outfit-analysis-helpers.js";

const ROUTE_KEY_STEP1_FASHION_SEARCH = ProviderRouteKeys.STEP1_FASHION_SEARCH;

export class OutfitService implements IOutfitService {
  constructor(
    private readonly repos: {
      assets: IAssetRepository;
      garmentAssets: IGarmentAssetRepository;
      outfitPlans: IOutfitPlanRepository;
      projectOutfitPlanAssocs: IProjectOutfitPlanAssocRepository;
    },
    private readonly clock: IRepositoryClock,
    private readonly projectService: IProjectService,
  ) {}

  /**
   * 生成搭配方案（同步调用 LLM）
   */
  async recommend(user: User, projectId: string, ctx: AppContext, options?: { bypassCache?: boolean }): Promise<OutfitPlan[]> {
    const project = await this.projectService.requireOwnerProject(user, projectId);
    const assets = await this.repos.assets.findByProjectId(project.id);
    assertCondition(assets.length > 0, 400, "ASSET_REQUIRED", "请先上传服饰图片");

    // 获取用户选择的角色预设信息（必填）
    const roleDirection = project.selectedRoleDirection;
    assertCondition(
      Boolean(roleDirection),
      400,
      "ROLE_DIRECTION_REQUIRED",
      "请先选择角色预设",
    );
    const roleContext = {
      gender: roleDirection!.gender,
      age: roleDirection!.age,
      ethnicityOrRegion: roleDirection!.ethnicityOrRegion,
      styleWords: roleDirection!.styleWords,
    };

    // 校验角色性别
    assertCondition(
      roleContext.gender === "male" || roleContext.gender === "female",
      400,
      "GENDER_REQUIRED",
      "角色性别未设置，无法生成穿搭方案。请先在角色预设中设置性别。",
    );

    // 全量覆盖：删除旧的搭配方案记录和关联关系
    await this.repos.outfitPlans.deleteByProjectId(project.id);
    await this.repos.projectOutfitPlanAssocs.deleteByProjectId(project.id);

    // 取消之前的选择
    if (project.selectedOutfitPlanId !== null) {
      project.selectedOutfitPlanId = null;
      if (project.status === "OUTFIT_SELECTED" || project.status === "ROLE_DIRECTION_CONFIRMED") {
        project.status = "GARMENT_UPLOADED";
      }
      await this.projectService.saveProject(project);
    }

    // 收集用户上传的服饰图片（过滤非主色变体，只保留主色和独立单品）
    const userUploadedAssets: Array<{ category: string; garmentAsset: GarmentAsset }> = [];
    for (const asset of assets) {
      assertCondition(
        Boolean(asset.garmentAssetId),
        400,
        "OUTFIT_LIBRARY_REQUIRED",
        "Step1 服饰必须来自资产库",
      );
      const linked = await this.repos.garmentAssets.findById(asset.garmentAssetId as string);
      assertCondition(Boolean(linked), 400, "OUTFIT_LIBRARY_ASSET_NOT_FOUND", "关联的资产库单品不存在");
      const garmentAsset = linked as GarmentAsset;
      assertCondition(garmentAsset.userId === user.id, 403, "FORBIDDEN", "只能使用自己的资产库单品");
      assertCondition(garmentAsset.type === "image", 400, "OUTFIT_LIBRARY_TYPE_INVALID", "资产类型必须为图片");
      // 跳过非主色变体：搭配推荐以主色为基准
      if (garmentAsset.variantGroupId && !garmentAsset.isPrimaryVariant) continue;
      userUploadedAssets.push({ category: asset.category ?? garmentAsset.category, garmentAsset });
    }

    assertCondition(
      userUploadedAssets.length > 0,
      400,
      "OUTFIT_SELECTION_REQUIRED",
      "请先上传服饰图片",
    );

    // 构建 LLM 上下文（只包含用户上传的图片）
    const focusItems = userUploadedAssets.map((item) => {
      const g = item.garmentAsset;
      const descParts: string[] = [];
      if (g.description) descParts.push(g.description);
      if (g.mainColor) descParts.push(`${g.mainColor}色`);
      if (g.material) descParts.push(`${g.material}材质`);
      if (g.style) descParts.push(`风格：${g.style}`);
      return {
        category: item.category,
        name: g.name,
        imageUrl: resolveGarmentImageUrl(g),
        source: "user_selected" as const,
        description: descParts.length > 0 ? descParts.join("，") : undefined,
      };
    });

    // 构建 LLM 上下文（用户上传的服饰图片，去重后只保留 1 个 context）
    const planContexts: OutfitPlanAnalysisContext[] = [{
      index: 1,
      planId: "temp-context-1",
      items: focusItems.map((item) => ({
        category: item.category,
        name: item.name,
        imageUrl: item.imageUrl,
      })),
      focusItems,
    }];

    // 解析 LLM Provider
    const provider = await resolveRouteProvider(ctx, ROUTE_KEY_STEP1_FASHION_SEARCH);
    assertCondition(
      Boolean(provider),
      503,
      "PROVIDER_POLICY_MISSING",
      "Step1 搜图模型未配置，请联系管理员",
    );

    // 调用 LLM 生成搭配方案
    const targetCount = 3;
    const analysisResult = await requestLlmOutfitAnalysisCards(ctx, provider as ResolvedRouteProvider, planContexts, user.id, {
      ...options,
      targetCardCount: targetCount,
      roleContext,
    });

    // 从 LLM 返回结果创建完整的 OutfitPlan
    const plans: OutfitPlan[] = [];
    const llmPlans = analysisResult.plans.slice(0, targetCount);

    analysisResult.plans.forEach((p, i) => {
    });

    // 创建完整的 OutfitPlan 记录
    for (const llmPlan of llmPlans) {
      const planId = this.clock.generateId();

      // 构建 items，用户上传的带 assetId
      const items = this.buildOutfitItems(userUploadedAssets, llmPlan.items);

      const plan: OutfitPlan = {
        id: planId,
        userId: user.id,
        projectId: project.id,
        assetIds: userUploadedAssets.map((item) => item.garmentAsset.id),
        garmentAssetId: userUploadedAssets[0]?.garmentAsset.id,
        index: llmPlan.index,
        title: llmPlan.title,
        reason: llmPlan.reason,
        styleName: llmPlan.styleName,
        analysis: llmPlan.analysis,
        optimizedPrompt: llmPlan.optimizedPrompt,
        suitableScene: llmPlan.suitableScene,
        tags: llmPlan.tags,
        items,
        trendSummary: analysisResult.trendSummary,
        groundingSources: analysisResult.groundingSources,
      };

      await this.repos.outfitPlans.upsert(plan);

      // 创建项目-搭配关联
      const assoc: ProjectOutfitPlanAssoc = {
        id: this.clock.generateId(),
        projectId: project.id,
        outfitPlanId: plan.id,
        selected: false,
        createdAt: this.clock.now(),
      };
      await this.repos.projectOutfitPlanAssocs.upsert(assoc);

      plans.push(plan);
    }

    return plans;
  }

  /**
   * 构建搭配方案的 items 字段
   * 用户上传的服饰带 assetId
   */
  private buildOutfitItems(
    userUploadedAssets: Array<{ category: string; garmentAsset: GarmentAsset }>,
    llmItems: OutfitItem[],
  ): OutfitPlan["items"] {
    const userAssetByCategory = new Map<string, GarmentAsset>(
      userUploadedAssets.map((item) => [item.category, item.garmentAsset])
    );

    return llmItems.map((item) => {
      const categoryMap: Record<string, string> = {
        top: "top",
        bottom: "bottom",
        shoes: "shoes",
        bag: "accessory",
        accessory: "accessory",
        suit: "suit",
        dress: "dress",
        outer: "outer",
      };
      const category = categoryMap[item.type];
      const userAsset = category ? userAssetByCategory.get(category) : undefined;

      return {
        type: item.type,
        name: item.name,
        style: item.style,
        description: item.description,
        assetId: userAsset?.id,
      };
    });
  }

  async select(user: User, projectId: string, planId: string): Promise<OutfitPlan> {
    const project = await this.projectService.requireOwnerProject(user, projectId);
    const plan = await this.repos.outfitPlans.findById(planId);
    assertCondition(Boolean(plan), 404, "NOT_FOUND", "搭配方案不存在");
    const existing = plan as OutfitPlan;

    // 验证关联存在
    const assoc = await this.repos.projectOutfitPlanAssocs.findByProjectAndOutfit(project.id, planId);
    assertCondition(Boolean(assoc), 400, "PLAN_PROJECT_MISMATCH", "该方案未关联当前项目");

    // 更新选中状态
    await this.repos.projectOutfitPlanAssocs.setSelected(project.id, planId);

    // 更新项目状态：根据项目类型设置正确的状态格式
    project.selectedOutfitPlanId = existing.id;
    project.status = project.projectKind === "image" ? "IMAGE_OUTFIT_SELECTED" : "OUTFIT_SELECTED";

    await this.projectService.saveProject(project);
    return existing;
  }
}