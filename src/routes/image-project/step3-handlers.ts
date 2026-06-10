/**
 * 图片项目 Step 3 路由 handler
 * 模特图自动生成、重新生成、选中切换
 *
 * 路由前缀: /image-projects/:projectId/step3/...
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/app-context.js";
import type { ModelPhoto } from "../../contracts/types.js";

import { AppError } from "../../core/errors.js";
import { getLogger } from "../../core/logger/index.js";
import { requireUser } from "../../services/auth/route-guards.js";
import {
  resolveRouteProviderWithFallback,
  recordRouteAudit,
} from "../../services/llm/provider-resolver.js";
import { ProviderRouteKeys } from "../../contracts/provider-route-keys.js";
import { extractJsonObject } from "../../services/utils/json-utils.js";
import { requestLlmImageGenerationUrl } from "../../services/media/image-generation-providers.js";
import { requestLlmPlainText } from "../../services/llm/llm-transport.js";
import {
  createAsyncJob,
  updateAsyncJobStage,
  finalizeAsyncJob,
} from "../../service/async-job-service.js";

/** 规划方案中的单张模特图定义 */
interface ModelPhotoPlanItem {
  poseLabel: string;
  bgLabel: string;
  posePrompt: string;
  bgPrompt: string;
}

/** 校验规划项格式 */
function isValidPlanItem(item: unknown): item is ModelPhotoPlanItem {
  if (!item || typeof item !== "object") return false;
  const obj = item as Record<string, unknown>;
  return (
    typeof obj.poseLabel === "string" &&
    typeof obj.bgLabel === "string" &&
    typeof obj.posePrompt === "string" &&
    typeof obj.bgPrompt === "string" &&
    obj.poseLabel.trim().length > 0 &&
    obj.bgLabel.trim().length > 0 &&
    obj.posePrompt.trim().length > 0 &&
    obj.bgPrompt.trim().length > 0
  );
}

/** 将规划项数组限制在 8-12 张 */
function clampPlanCount(items: ModelPhotoPlanItem[]): ModelPhotoPlanItem[] {
  if (items.length < 8) return items.slice(0, Math.min(items.length, 12));
  if (items.length > 12) return items.slice(0, 12);
  return items;
}

/**
 * 获取 Step 2 定妆参考图和服饰文字描述
 * 图片顺序：服饰平铺图 → 角色五视图
 * 第一张图对构图影响最大，确保服饰细节（logo、图案）优先保持
 *
 * @param variantAssetOverrides 指定变体资产ID替换对应主色资产（用于非主色生成）
 */
async function getStep2ReferenceDataForProject(
  ctx: AppContext,
  projectId: string,
  selectedCharacterId: string | null,
  variantAssetOverrides?: string[],
): Promise<{
  imageUrls: string[];
  garmentDescriptions: string[];
  garments: Array<{
    name?: string;
    category?: string;
    style?: string;
    material?: string;
    mainColor?: string;
    pattern?: string;
    fit?: string;
    neckline?: string;
    sleeve?: string;
    occasion?: string;
    description?: string;
  }>;
  variantGroups: Array<{
    variantGroupId: string;
    primaryAssetId: string;
    primaryColor: string;
    alternatives: Array<{ assetId: string; color: string; imageUrl: string }>;
  }>;
}> {
  const imageUrls: string[] = [];
  const garmentDescriptions: string[] = [];
  const garments: Array<{
    name?: string;
    category?: string;
    style?: string;
    material?: string;
    mainColor?: string;
    pattern?: string;
    fit?: string;
    neckline?: string;
    sleeve?: string;
    occasion?: string;
    description?: string;
  }> = [];

  // 1. 服饰平铺图（先收集，确保服饰在前）
  const projectGarments = await ctx.repos.projectGarmentAssocs.findByProjectId(projectId);
  // 变体组信息（供前端展示颜色选择）
  const variantGroups: Array<{
    variantGroupId: string;
    primaryAssetId: string;
    primaryColor: string;
    alternatives: Array<{ assetId: string; color: string; imageUrl: string }>;
  }> = [];

  if (projectGarments.length > 0) {
    const assetIds = projectGarments.map((pg) => pg.garmentAssetId);
    const garmentAssets = await ctx.repos.garmentAssets.findByIds(assetIds);

    // 收集变体组信息
    const groupMap = new Map<string, { primary: typeof garmentAssets[0]; alts: typeof garmentAssets }>();
    for (const asset of garmentAssets) {
      if (asset.variantGroupId) {
        const entry = groupMap.get(asset.variantGroupId) ?? { primary: asset, alts: [] };
        if (asset.isPrimaryVariant) {
          entry.primary = asset;
        } else {
          entry.alts.push(asset);
        }
        groupMap.set(asset.variantGroupId, entry);
      }
    }
    for (const [groupId, { primary, alts }] of groupMap) {
      if (alts.length > 0) {
        variantGroups.push({
          variantGroupId: groupId,
          primaryAssetId: primary.id,
          primaryColor: primary.mainColor ?? primary.variantColor ?? "",
          alternatives: alts.map(a => ({
            assetId: a.id,
            color: a.variantColor ?? a.mainColor ?? "",
            imageUrl: a.flatLayImageUrl ?? a.mainImageUrl,
          })),
        });
      }
    }

    // 构建实际使用的资产列表（主色优先，变体替换按需）
    const overrideSet = new Set(variantAssetOverrides ?? []);
    const effectiveAssets = garmentAssets.filter(asset => {
      if (!asset.variantGroupId) return true; // 独立单品
      if (asset.isPrimaryVariant) {
        // 主色未被 override 替换则保留
        return !overrideSet.has(asset.id);
      }
      // 非主色：只有被指定为 override 时才保留
      return overrideSet.has(asset.id);
    });
    // override 的非主色资产也加入
    for (const overrideId of (variantAssetOverrides ?? [])) {
      if (!effectiveAssets.find(a => a.id === overrideId)) {
        const overrideAsset = garmentAssets.find(a => a.id === overrideId);
        if (overrideAsset) effectiveAssets.push(overrideAsset);
      }
    }

    for (const asset of effectiveAssets) {
      // 先推入服饰平铺图（主要参考）
      if (asset.flatLayImageUrl) {
        imageUrls.push(asset.flatLayImageUrl);
      }
      // 收集服饰文字描述
      const parts: string[] = [];
      if (asset.name) parts.push(`名称：${asset.name}`);
      if (asset.description) parts.push(`描述：${asset.description}`);
      if (asset.category) parts.push(`类别：${asset.category}`);
      if (asset.style) parts.push(`风格：${asset.style}`);
      if (asset.material) parts.push(`材质：${asset.material}`);
      if (asset.mainColor) parts.push(`主色：${asset.mainColor}`);
      if (asset.pattern) parts.push(`图案：${asset.pattern}`);
      if (asset.fit) parts.push(`版型：${asset.fit}`);
      if (asset.length) parts.push(`长度：${asset.length}`);
      if (asset.neckline) parts.push(`领型：${asset.neckline}`);
      if (asset.sleeve) parts.push(`袖型：${asset.sleeve}`);
      if (asset.occasion) parts.push(`场合：${asset.occasion}`);
      if (parts.length > 0) {
        garmentDescriptions.push(parts.join("，"));
      }
      // 收集结构化服饰数据（包含 description 字段供 skill 模板使用）
      garments.push({
        name: asset.name ?? undefined,
        category: asset.category ?? undefined,
        style: asset.style ?? undefined,
        material: asset.material ?? undefined,
        mainColor: asset.mainColor ?? undefined,
        pattern: asset.pattern ?? undefined,
        fit: asset.fit ?? undefined,
        neckline: asset.neckline ?? undefined,
        sleeve: asset.sleeve ?? undefined,
        occasion: asset.occasion ?? undefined,
        description: asset.description ?? undefined,
      });
    }
  }

  // 2. 角色五视图（后收集，作为辅助参考）
  if (selectedCharacterId) {
    const libraryChar = await ctx.repos.libraryCharacters.findById(selectedCharacterId);
    // 检查角色状态为 ready，且 fiveViewOssImageUrl 为非空字符串
    if (libraryChar?.status === "ready" && libraryChar.fiveViewOssImageUrl?.trim()) {
      // fiveViewOssImageUrl 就是用户在 step2 看到的五视图 URL
      imageUrls.push(libraryChar.fiveViewOssImageUrl.trim());
    }
  }

  return { imageUrls, garmentDescriptions, garments, variantGroups };
}

/**
 * 注册图片项目 Step 3 路由
 */
export function registerImageProjectStep3Routes(app: FastifyInstance, ctx: AppContext): void {

  // =========================================================================
  // POST /image-projects/:projectId/step3/photos/generate-batch
  // =========================================================================

  app.post("/image-projects/:projectId/step3/photos/generate-batch", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);
    const requestBody = (request.body as {
      photoCount?: number;
      backgroundStyle?: string;
      /** 选中的非主色变体资产ID（用于多色生成） */
      colorVariantAssetIds?: string[];
      /** 多色同框：传入 true 表示生成多色同框图 */
      multiColorShowcase?: boolean;
      /** 多人模式：角色颜色分配 characterId → variantAssetId */
      characterColorMap?: Record<string, string>;
    } | undefined) ?? {};
    const photoCount = requestBody.photoCount ? Math.min(Math.max(requestBody.photoCount, 1), 12) : 10;
    // 验证 backgroundStyle 合法值，非法值使用默认 balanced
    const validBackgroundStyles = ["solid", "scene", "balanced"] as const;
    const backgroundStyle: typeof validBackgroundStyles[number] = validBackgroundStyles.includes(requestBody.backgroundStyle as typeof validBackgroundStyles[number])
      ? (requestBody.backgroundStyle as typeof validBackgroundStyles[number])
      : "balanced";
    const colorVariantAssetIds: string[] = requestBody.colorVariantAssetIds?.filter(Boolean) ?? [];
    const multiColorShowcase = requestBody.multiColorShowcase === true;

    // 验证项目已完成 Step 2
    const projectCharacters = await ctx.repos.projectCharacters.findByProjectId(params.projectId);
    const hasProjectCharacter = projectCharacters.length > 0;
    const hasSelectedCharacter = typeof project.selectedCharacterId === "string" && project.selectedCharacterId.length > 0;
    const step2Complete = hasProjectCharacter && hasSelectedCharacter;
    if (!step2Complete) {
      throw new AppError(400, "STEP2_NOT_COMPLETE", "请先完成 Step 2 角色定妆");
    }

    // 推进项目状态：进入 Step3 写 IMAGE_CHARACTER_CONFIRMED，开始生成模特图
    // 同时更新为 IMAGE_MODEL_PHOTOS_READY 表示正在生成中（前端据此判断是否显示生成进度）
    if (project.status === "IMAGE_OUTFIT_SELECTED" || project.status === "IMAGE_ROLE_DIRECTION_CONFIRMED" || project.status === "IMAGE_DRAFT" || project.status === "IMAGE_CHARACTER_CONFIRMED") {
      project.status = "IMAGE_MODEL_PHOTOS_READY";
      await ctx.projectService.saveProject(project);
    }

    // 获取搭配方案摘要
    const outfitPlan = project.selectedOutfitPlanId
      ? await ctx.repos.outfitPlans.findById(project.selectedOutfitPlanId)
      : null;

    // 获取 Step 2 定妆参考图和服饰文字描述（直接使用 project.selectedCharacterId）
    const referenceData = await getStep2ReferenceDataForProject(ctx, params.projectId, project.selectedCharacterId);
    const referenceImages = referenceData.imageUrls;

    // 获取选中角色的特征描述（直接使用数据库查询，不依赖前端传递）
    let characterDescription = "";
    if (project.selectedCharacterId) {
      const selectedChar = await ctx.repos.libraryCharacters.findById(project.selectedCharacterId);
      if (selectedChar) {
        const charParts: string[] = [];
        if (selectedChar.ethnicity) charParts.push(`种族：${selectedChar.ethnicity}`);
        if (selectedChar.age) charParts.push(`年龄：${selectedChar.age}`);
        if (selectedChar.gender) charParts.push(`性别：${selectedChar.gender}`);
        if (selectedChar.bodyType) charParts.push(`体型：${selectedChar.bodyType}`);
        if (selectedChar.faceShape) charParts.push(`脸型：${selectedChar.faceShape}`);
        if (selectedChar.facialFeatures) charParts.push(`面部特征：${selectedChar.facialFeatures}`);
        if (selectedChar.skinTone) charParts.push(`肤色：${selectedChar.skinTone}`);
        if (selectedChar.hairStyle) charParts.push(`发型：${selectedChar.hairStyle}`);
        if (selectedChar.uniqueFeatures) charParts.push(`独特特征：${selectedChar.uniqueFeatures}`);
        if (charParts.length > 0) {
          characterDescription = charParts.join("，");
        }
      }
    }
    if (!characterDescription) {
      characterDescription = "根据搭配方案自动推断";
    }

    // ===== 多人模式检测 =====
    const imageProjectExt = await ctx.repos.imageProjectExt.findByProjectId(params.projectId);
    if (imageProjectExt?.imageRelationMode && imageProjectExt.imageRelationMode !== "single") {
      // 多人模特图生成流程（使用选中的角色，其他角色由 AI 智能规划）

      // 获取用户选中的角色
      const selectedCharacterId = project.selectedCharacterId;
      if (!selectedCharacterId) {
        throw new AppError(400, "NO_SELECTED_CHARACTER", "请先在 Step2 选择一个角色作为主角色");
      }

      const selectedChar = await ctx.repos.libraryCharacters.findById(selectedCharacterId);
      if (!selectedChar) {
        throw new AppError(400, "CHARACTER_NOT_FOUND", "选中的角色不存在");
      }

      // 先构建服饰变体列表（用于自动颜色分配）
      const garmentVariants: Array<{ assetId: string; colorName: string; description: string }> = [];
      const allGarmentAssets = await ctx.repos.garmentAssets.findByIds(
        (await ctx.repos.projectGarmentAssocs.findByProjectId(params.projectId))
          .map(pg => pg.garmentAssetId)
          .filter(Boolean)
      );
      for (const asset of allGarmentAssets) {
        if (asset.variantGroupId) {
          garmentVariants.push({
            assetId: asset.id,
            colorName: asset.variantColor ?? asset.mainColor ?? "",
            description: asset.description ?? asset.name ?? "",
          });
        }
      }

      // 构建主角色信息（AI 会根据这个角色自动规划其他角色）
      const descParts: string[] = [];
      if (selectedChar.gender) descParts.push(`性别：${selectedChar.gender}`);
      if (selectedChar.age) descParts.push(`年龄：${selectedChar.age}`);
      if (selectedChar.bodyType) descParts.push(`体型：${selectedChar.bodyType}`);
      if (selectedChar.ethnicity) descParts.push(`种族：${selectedChar.ethnicity}`);
      if (selectedChar.faceShape) descParts.push(`脸型：${selectedChar.faceShape}`);
      if (selectedChar.facialFeatures) descParts.push(`面部特征：${selectedChar.facialFeatures}`);
      if (selectedChar.skinTone) descParts.push(`肤色：${selectedChar.skinTone}`);
      if (selectedChar.hairStyle) descParts.push(`发型：${selectedChar.hairStyle}`);

      // 主角色使用主色变体（isPrimaryVariant=true），而非数组顺序
      const assetById = new Map(allGarmentAssets.map(a => [a.id, a]));
      const primaryVariant = allGarmentAssets.find(a => a.isPrimaryVariant && a.variantGroupId);
      const assignedVariantAssetId = primaryVariant?.id ?? (garmentVariants.length > 0 ? garmentVariants[0].assetId : undefined);
      let assignedColor: string | undefined;
      if (assignedVariantAssetId) {
        const variantAsset = assetById.get(assignedVariantAssetId);
        assignedColor = variantAsset?.variantColor ?? variantAsset?.mainColor ?? undefined;
      }

      const characterInputs: Array<{
        characterId: string;
        gender: string;
        age?: number;
        description: string;
        assignedVariantAssetId?: string;
        assignedColor?: string;
        referenceImageUrl?: string;
      }> = [{
        characterId: selectedCharacterId,
        gender: selectedChar.gender ?? "unknown",
        age: selectedChar.age ?? undefined,
        description: descParts.join("，"),
        assignedVariantAssetId,
        assignedColor,
        referenceImageUrl: selectedChar.fiveViewOssImageUrl?.trim() || undefined,
      }];


      // 多人模式：保留服饰参考图 + 主角色参考图（主角色脸需要保真）
      const multiRefImages: string[] = [...referenceData.imageUrls];
      for (const ci of characterInputs) {
        if (ci.referenceImageUrl) multiRefImages.push(ci.referenceImageUrl);
      }

      // 创建多人模特图异步 Job
      const multiJobId = `image-step3-mp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const multiResult = await createAsyncJob(ctx.repos, {
        id: multiJobId,
        userId: user.id,
        jobType: "image_step3_multi_person",
        projectId: params.projectId,
        input: JSON.stringify({
          characters: characterInputs,
          garmentVariants,
          outfitPlan: {
            title: outfitPlan?.title,
            styleName: outfitPlan?.styleName,
            analysis: outfitPlan?.analysis,
            optimizedPrompt: outfitPlan?.optimizedPrompt,
          },
          outfitSummary: outfitPlan?.analysis ?? "",
          garments: referenceData.garments,
          referenceImages: multiRefImages,
          photoCount,
          backgroundStyle,
        }),
        now: Date.now(),
        initialStatus: "pending",
      }, ctx.globalTaskConcurrencyService);

      if ("error" in multiResult) {
        throw new AppError(429, multiResult.errorCode, multiResult.error);
      }

      return {
        success: true,
        data: {
          jobId: multiJobId,
          jobs: [{ jobId: multiJobId }],
          variantGroups: referenceData.variantGroups,
          status: "pending",
        },
      };
    }

    // ===== 单人模式：构建颜色组合 Job 列表 =====
    // 无变体或未选变体 → 主色单 Job
    // 有变体且选了颜色 → 每种颜色组合独立 Job
    // multiColorShowcase → 多色同框单 Job
    const now = Date.now();
    const jobInputs: Array<{
      jobId: string;
      variantAssetOverrides?: string[];
      colorVariantLabel?: string;
      isMultiColorShowcase: boolean;
    }> = [];

    if (multiColorShowcase && colorVariantAssetIds.length > 0) {
      // 多色同框：一个 Job，参考图包含所有选中的颜色
      jobInputs.push({
        jobId: `image-step3-mc-${now}-${Math.random().toString(36).slice(2, 8)}`,
        variantAssetOverrides: colorVariantAssetIds,
        colorVariantLabel: "多色同框",
        isMultiColorShowcase: true,
      });
    } else if (colorVariantAssetIds.length > 0) {
      // 单色分批：主色一个 Job + 每个选中变体一个 Job
      jobInputs.push({
        jobId: `image-step3-${now}-primary`,
        isMultiColorShowcase: false,
      });
      for (const variantId of colorVariantAssetIds) {
        const variantAsset = await ctx.repos.garmentAssets.findById(variantId);
        const colorLabel = variantAsset?.variantColor ?? variantAsset?.mainColor ?? "变体";
        jobInputs.push({
          jobId: `image-step3-${now}-${Math.random().toString(36).slice(2, 8)}`,
          variantAssetOverrides: [variantId],
          colorVariantLabel: colorLabel,
          isMultiColorShowcase: false,
        });
      }
    } else {
      // 默认：只有主色
      jobInputs.push({
        jobId: `image-step3-${now}-${Math.random().toString(36).slice(2, 8)}`,
        isMultiColorShowcase: false,
      });
    }

    // 为每个颜色组合创建独立的异步 Job
    const createdJobs: Array<{ jobId: string; colorVariantLabel?: string }> = [];
    const perJobPhotoCount = Math.max(1, Math.ceil(photoCount / jobInputs.length));

    for (const jobInput of jobInputs) {
      // 按颜色组合获取对应的参考数据
      const comboRefData = jobInput.variantAssetOverrides
        ? await getStep2ReferenceDataForProject(ctx, params.projectId, project.selectedCharacterId, jobInput.variantAssetOverrides)
        : referenceData;

      const step3Result = await createAsyncJob(ctx.repos, {
        id: jobInput.jobId,
        userId: user.id,
        jobType: "image_step3_model_photo",
        projectId: params.projectId,
        input: JSON.stringify({
          outfitPlan: {
            title: outfitPlan?.title,
            styleName: outfitPlan?.styleName,
            analysis: outfitPlan?.analysis,
            optimizedPrompt: outfitPlan?.optimizedPrompt,
          },
          outfitSummary: outfitPlan?.analysis ?? "",
          characterDescription,
          garments: comboRefData.garments,
          referenceImages: comboRefData.imageUrls,
          photoCount: perJobPhotoCount,
          backgroundStyle,
          colorVariantLabel: jobInput.colorVariantLabel ?? null,
          isMultiColorShowcase: jobInput.isMultiColorShowcase,
        }),
        now,
      initialStatus: "pending", // 关键：pending 状态，由 QueueDispatcher 驱动
    }, ctx.globalTaskConcurrencyService);

      if ("error" in step3Result) {
        throw new AppError(429, step3Result.errorCode, step3Result.error);
      }

      createdJobs.push({ jobId: jobInput.jobId, colorVariantLabel: jobInput.colorVariantLabel });
    }

    return {
      success: true,
      data: {
        jobId: createdJobs[0]?.jobId,
        jobs: createdJobs,
        variantGroups: referenceData.variantGroups,
        status: "pending",
      },
    };
  });

  // =========================================================================
  // GET /image-projects/:projectId/step3/photos
  // =========================================================================

  app.get("/image-projects/:projectId/step3/photos", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    await ctx.projectService.requireOwnerProject(user, params.projectId);

    const photos = await ctx.repos.modelPhotos.findByProjectId(params.projectId);
    return { photos };
  });

  // =========================================================================
  // POST /image-projects/:projectId/step3/photos/:photoId/regenerate
  // =========================================================================

  app.post("/image-projects/:projectId/step3/photos/:photoId/regenerate", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string; photoId: string };
    const body = (request.body as {
      newPoseLabel?: string;
      newBgLabel?: string;
      posePrompt?: string;
      bgPrompt?: string;
    } | undefined) ?? {};

    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    const photo = await ctx.repos.modelPhotos.findById(params.photoId);
    if (!photo) {
      throw new AppError(404, "NOT_FOUND", "模特图不存在");
    }
    if (photo.projectId !== params.projectId) {
      throw new AppError(403, "FORBIDDEN", "该模特图不属于当前项目");
    }

    // 更新状态为生成中
    await ctx.repos.modelPhotos.updateFields(photo.id, {
      status: "generating",
      errorMessage: null,
    });

    const poseLabel = body.newPoseLabel ?? photo.poseLabel;
    const bgLabel = body.newBgLabel ?? photo.bgLabel;
    const posePrompt = body.posePrompt ?? "";
    const bgPrompt = body.bgPrompt ?? "";

    // 获取参考图和服饰文字描述（直接使用 project.selectedCharacterId）
    const referenceData = await getStep2ReferenceDataForProject(ctx, params.projectId, project.selectedCharacterId);
    const referenceImages = referenceData.imageUrls;
    const garmentDescriptions = referenceData.garmentDescriptions;
    const garmentDescForGen = garmentDescriptions.length > 0
      ? `\n服饰要求：${garmentDescriptions.join("；")}`
      : "";

    const combinedPrompt = `${posePrompt} ${bgPrompt}${garmentDescForGen}`.trim() || `${poseLabel} ${bgLabel}${garmentDescForGen}`.trim();
    const imageProvider = await resolveRouteProviderWithFallback(ctx, [ProviderRouteKeys.IMAGE_PROJECT_STEP3_MODEL_PHOTO]);
    const provider = imageProvider ? imageProvider.provider : null;

    if (!provider) {
      throw new AppError(500, "PROVIDER_NOT_CONFIGURED", "图片生成服务未配置");
    }

    try {
      const genOptions: { mode?: "text_to_image" | "image_to_image"; images?: string[]; ratio?: string; debugOptions?: { ctx: typeof ctx; routeKey: typeof ProviderRouteKeys.IMAGE_PROJECT_STEP3_MODEL_PHOTO; businessContext: string; userId: string; projectId: string } } = {
        ratio: "1:1",
      };
      if (referenceImages.length > 0) {
        genOptions.mode = "image_to_image";
        genOptions.images = referenceImages;
      }
      genOptions.debugOptions = {
        ctx,
        routeKey: ProviderRouteKeys.IMAGE_PROJECT_STEP3_MODEL_PHOTO,
        businessContext: "图片项目模特图重新生成",
        projectId: params.projectId,
        userId: user.id,
      };

      const imageResult = await requestLlmImageGenerationUrl(provider, combinedPrompt, genOptions);

      // 下载图片到 Buffer
      const { readImageBytesFromSource, optimizeImageBuffer } = await import("../../services/media/storage-persist.js");
      const { compositeLogo } = await import("../../services/logo-composite-service.js");
      const { bytes: imageBytes } = await readImageBytesFromSource(imageResult.url, ctx.configService.get().imageDownloadTimeoutMs);

      // Logo 合成
      let finalImageBytes: Buffer = Buffer.from(imageBytes) as Buffer;
      const extInfo = await ctx.repos.imageProjectExt.findByProjectId(params.projectId);
      if (extInfo?.logoUrl) {
        try {
          finalImageBytes = await compositeLogo(finalImageBytes, {
            logoSource: extInfo.logoUrl,
            position: extInfo.logoPosition,
            widthRatio: extInfo.logoWidthRatio,
            minWidth: extInfo.logoMinWidth,
            maxWidth: extInfo.logoMaxWidth,
            margin: extInfo.logoMargin,
            opacity: extInfo.logoOpacity,
          });
        } catch (logoError) {
          const log = getLogger("step3-regenerate");
          log.warn({ logoError, projectId: params.projectId }, "Logo 合成失败，使用原图");
        }
      }

      // 优化图片：限制尺寸 + 转换 WebP 格式（解决 OSS 20MB 限制）
      const { buffer: optimizedBytes, contentType: optimizedContentType } = await optimizeImageBuffer(finalImageBytes);

      // 持久化到 OSS
      if (!ctx.storage) {
        throw new AppError(500, "STORAGE_NOT_INITIALIZED", "对象存储未初始化");
      }
      const { createHash } = await import("node:crypto");
      const digest = createHash("sha256").update(optimizedBytes).digest("hex");
      const ossKey = `media/sha256/${digest.slice(0, 2)}/${digest}.jpg`;
      await ctx.storage.putObject(ossKey, optimizedBytes, optimizedContentType);
      const persistedUrl = await ctx.storage.getSignedUrl(ossKey);

      await ctx.repos.modelPhotos.updateFields(photo.id, {
        imageUrl: persistedUrl,
        status: "success",
        poseLabel,
        bgLabel,
      });

      const updated = await ctx.repos.modelPhotos.findById(photo.id);
      return { photo: updated };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await ctx.repos.modelPhotos.updateFields(photo.id, {
        status: "failed",
        errorMessage,
      });
      app.log.error({ err: error, routeKey: ProviderRouteKeys.IMAGE_PROJECT_STEP3_MODEL_PHOTO }, "LLM 调用失败");
      throw new AppError(500, "GENERATION_FAILED", `图片生成失败: ${errorMessage}`);
    }
  });

  // =========================================================================
  // POST /image-projects/:projectId/step3/photos/:photoId/select
  // =========================================================================

  app.post("/image-projects/:projectId/step3/photos/:photoId/select", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string; photoId: string };
    const body = request.body as { isSelected: boolean };

    await ctx.projectService.requireOwnerProject(user, params.projectId);

    const photo = await ctx.repos.modelPhotos.findById(params.photoId);
    if (!photo) {
      throw new AppError(404, "NOT_FOUND", "模特图不存在");
    }
    if (photo.projectId !== params.projectId) {
      throw new AppError(403, "FORBIDDEN", "该模特图不属于当前项目");
    }

    // 选中上限校验
    if (body.isSelected && !photo.isSelected) {
      const selectedCount = await ctx.repos.modelPhotos.countSelected(params.projectId);
      if (selectedCount >= 10) {
        throw new AppError(400, "SELECT_LIMIT", "最多只能选中 10 张模特图");
      }
    }

    await ctx.repos.modelPhotos.updateFields(photo.id, { isSelected: body.isSelected });

    const updated = await ctx.repos.modelPhotos.findById(photo.id);
    return { photo: updated };
  });

  // =========================================================================
  // DELETE /image-projects/:projectId/step3/photos/:photoId
  // =========================================================================

  app.delete("/image-projects/:projectId/step3/photos/:photoId", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string; photoId: string };

    await ctx.projectService.requireOwnerProject(user, params.projectId);

    const photo = await ctx.repos.modelPhotos.findById(params.photoId);
    if (!photo) {
      throw new AppError(404, "NOT_FOUND", "模特图不存在");
    }
    if (photo.projectId !== params.projectId) {
      throw new AppError(403, "FORBIDDEN", "该模特图不属于当前项目");
    }

    await ctx.repos.modelPhotos.deleteById(params.photoId);

    app.log.info({ projectId: params.projectId, photoId: params.photoId, userId: user.id }, "模特图已删除");

    return { success: true };
  });

  // =========================================================================
  // Logo 上传/查询 API
  // =========================================================================

  /** GET /image-projects/:projectId/logo - 获取 Logo 配置 */
  app.get("/image-projects/:projectId/logo", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };

    await ctx.projectService.requireOwnerProject(user, params.projectId);

    let ext = await ctx.repos.imageProjectExt.findByProjectId(params.projectId);
    if (!ext) {
      // 创建初始记录（无 logo）
      ext = await ctx.repos.imageProjectExt.createEmpty(params.projectId);
    }

    return {
      logoUrl: ext.logoUrl,
      logoPosition: ext.logoPosition,
      logoMaxWidth: ext.logoMaxWidth,
      logoMargin: ext.logoMargin,
      logoOpacity: ext.logoOpacity,
    };
  });

  /** POST /image-projects/:projectId/logo/upload - 上传 Logo 文件到 OSS 并保存 */
  app.post("/image-projects/:projectId/logo/upload", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };

    await ctx.projectService.requireOwnerProject(user, params.projectId);

    const file = await request.file();
    if (!file) {
      throw new AppError(400, "FILE_REQUIRED", "请选择 Logo 文件");
    }

    // 校验文件类型：仅允许 PNG 和 WebP（支持透明背景）
    const allowedTypes = ["image/png", "image/webp"];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new AppError(400, "INVALID_FILE_TYPE", "Logo 请使用透明背景的 PNG 或 WebP 图片");
    }

    // 校验文件大小（最大 2MB）
    const bytes = new Uint8Array(await file.toBuffer());
    if (bytes.length > 2 * 1024 * 1024) {
      throw new AppError(400, "FILE_TOO_LARGE", "Logo 文件不能超过 2MB");
    }

    // 验证图片是否有透明通道（alpha）
    const { default: sharp } = await import("sharp");
    const meta = await sharp(Buffer.from(bytes)).metadata();
    if (!meta.hasAlpha) {
      throw new AppError(400, "LOGO_NOT_TRANSPARENT", "Logo 图片需要透明背景，当前图片没有透明通道");
    }

    // 上传到 OSS
    if (!ctx.storage) {
      throw new AppError(500, "STORAGE_NOT_INITIALIZED", "对象存储未初始化");
    }
    const { createHash } = await import("node:crypto");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const ext = file.mimetype === "image/png" ? ".png" : file.mimetype === "image/webp" ? ".webp" : ".jpg";
    const key = `image-projects/${params.projectId}/logo/${digest.slice(0, 8)}${ext}`;
    await ctx.storage.putObject(key, bytes, file.mimetype);
    const logoUrl = await ctx.storage.getSignedUrl(key);

    // 确保 imageProjectExt 记录存在并更新 logo URL
    let extRecord = await ctx.repos.imageProjectExt.findByProjectId(params.projectId);
    if (!extRecord) {
      extRecord = await ctx.repos.imageProjectExt.createEmpty(params.projectId);
    }
    await ctx.repos.imageProjectExt.updateLogoUrl(params.projectId, logoUrl);

    app.log.info({ projectId: params.projectId, userId: user.id }, "Logo 已上传");

    return { success: true, logoUrl };
  });

  /** POST /image-projects/:projectId/logo - 通过 URL 更新 Logo（保留兼容） */
  app.post("/image-projects/:projectId/logo", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = request.body as { logoUrl: string };

    await ctx.projectService.requireOwnerProject(user, params.projectId);

    if (!body.logoUrl || typeof body.logoUrl !== "string") {
      throw new AppError(400, "INVALID_INPUT", "logoUrl 必须提供");
    }

    let ext = await ctx.repos.imageProjectExt.findByProjectId(params.projectId);
    if (!ext) {
      ext = await ctx.repos.imageProjectExt.createEmpty(params.projectId);
    }

    await ctx.repos.imageProjectExt.updateLogoUrl(params.projectId, body.logoUrl);

    app.log.info({ projectId: params.projectId, userId: user.id }, "Logo 已更新");

    return { success: true, logoUrl: body.logoUrl };
  });

  /** DELETE /image-projects/:projectId/logo - 删除 Logo */
  app.delete("/image-projects/:projectId/logo", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };

    await ctx.projectService.requireOwnerProject(user, params.projectId);

    await ctx.repos.imageProjectExt.updateLogoUrl(params.projectId, null);

    app.log.info({ projectId: params.projectId, userId: user.id }, "Logo 已删除");

    return { success: true };
  });

  /** PATCH /image-projects/:projectId/logo/config - 更新 Logo 配置（大小、边距等） */
  app.patch("/image-projects/:projectId/logo/config", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const body = (request.body as {
      widthRatio?: number;
      minWidth?: number;
      maxWidth?: number;
      margin?: number;
      opacity?: number;
      position?: string;
    }) ?? {};

    await ctx.projectService.requireOwnerProject(user, params.projectId);

    // 参数范围校验
    if (body.widthRatio !== undefined && (body.widthRatio < 0.05 || body.widthRatio > 0.5)) {
      throw new AppError(400, "INVALID_WIDTH_RATIO", "widthRatio 必须在 0.05-0.5 之间");
    }
    if (body.minWidth !== undefined && (body.minWidth < 50 || body.minWidth > 500)) {
      throw new AppError(400, "INVALID_MIN_WIDTH", "minWidth 必须在 50-500 之间");
    }
    if (body.maxWidth !== undefined && (body.maxWidth < 100 || body.maxWidth > 1000)) {
      throw new AppError(400, "INVALID_MAX_WIDTH", "maxWidth 必须在 100-1000 之间");
    }
    if (body.margin !== undefined && (body.margin < 0 || body.margin > 100)) {
      throw new AppError(400, "INVALID_MARGIN", "margin 必须在 0-100 之间");
    }
    if (body.opacity !== undefined && (body.opacity < 0.1 || body.opacity > 1.0)) {
      throw new AppError(400, "INVALID_OPACITY", "opacity 必须在 0.1-1.0 之间");
    }
    if (body.position !== undefined && !["top-left", "top-right", "bottom-left", "bottom-right"].includes(body.position)) {
      throw new AppError(400, "INVALID_POSITION", "position 必须是 top-left/top-right/bottom-left/bottom-right");
    }

    // 确保记录存在
    let ext = await ctx.repos.imageProjectExt.findByProjectId(params.projectId);
    if (!ext) {
      ext = await ctx.repos.imageProjectExt.createEmpty(params.projectId);
    }

    // 更新配置字段
    const updates: Record<string, unknown> = {};
    if (body.widthRatio !== undefined) updates.logo_width_ratio = body.widthRatio;
    if (body.minWidth !== undefined) updates.logo_min_width = body.minWidth;
    if (body.maxWidth !== undefined) updates.logo_max_width = body.maxWidth;
    if (body.margin !== undefined) updates.logo_margin = body.margin;
    if (body.opacity !== undefined) updates.logo_opacity = body.opacity;
    if (body.position !== undefined) updates.logo_position = body.position;
    updates.updated_at = Date.now();

    if (Object.keys(updates).length > 1) {
      await ctx.repos.imageProjectExt.updateLogoConfig(params.projectId, updates);
    }

    app.log.info({ projectId: params.projectId, userId: user.id, updates }, "Logo 配置已更新");

    // 返回更新后的配置
    const updated = await ctx.repos.imageProjectExt.findByProjectId(params.projectId);
    return {
      success: true,
      config: {
        logoUrl: updated?.logoUrl,
        position: updated?.logoPosition,
        widthRatio: updated?.logoWidthRatio,
        minWidth: updated?.logoMinWidth,
        maxWidth: updated?.logoMaxWidth,
        margin: updated?.logoMargin,
        opacity: updated?.logoOpacity,
      },
    };
  });

  // =========================================================================
  // PUT /image-projects/:projectId/relation-mode
  // 保存多人关系模式到 image_project_ext
  // =========================================================================

  app.put("/image-projects/:projectId/relation-mode", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);
    if (project.projectKind !== "image") {
      throw new AppError(400, "INVALID_PROJECT_TYPE", "仅图片项目支持关系模式");
    }

    // 检查是否有正在运行的生成任务
    const hasRunningJobs = await ctx.repos.asyncJobs.hasActiveByProjectAndTypePattern(params.projectId, "image_step3_%");
    if (hasRunningJobs) {
      throw new AppError(409, "JOBS_RUNNING", "有模特图生成任务正在进行中，请等待完成后再切换模式");
    }

    const body = request.body as { relationMode?: string };
    const validModes = ["single", "multi"] as const;
    if (!body.relationMode || !validModes.includes(body.relationMode as typeof validModes[number])) {
      throw new AppError(400, "INVALID_RELATION_MODE", `关系模式必须是 ${validModes.join("/")} 之一`);
    }

    const relationMode = body.relationMode as typeof validModes[number];
    let ext = await ctx.repos.imageProjectExt.findByProjectId(params.projectId);
    if (!ext) {
      ext = await ctx.repos.imageProjectExt.createEmpty(params.projectId);
    }
    ext.imageRelationMode = relationMode === "single" ? null : relationMode;
    await ctx.repos.imageProjectExt.upsert(ext);

    return { success: true, relationMode };
  });

  // =========================================================================
  // GET /image-projects/:projectId/relation-mode
  // 获取多人关系模式
  // =========================================================================

  app.get("/image-projects/:projectId/relation-mode", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { projectId: string };
    const project = await ctx.projectService.requireOwnerProject(user, params.projectId);

    const ext = await ctx.repos.imageProjectExt.findByProjectId(params.projectId);
    const relationMode = ext?.imageRelationMode ?? "single";
    return { success: true, relationMode };
  });
}
