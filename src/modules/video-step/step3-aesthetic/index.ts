/**
 * Step3 Aesthetic 脚本生成模块
 *
 * 生活美学策略：情感叙事与视觉展示平衡
 * 核心是"发现生活的美好"，服饰是美好生活的一部分
 *
 * 流程：
 * 1. 获取项目上下文（服饰资产、角色信息等）
 * 2. 转换为 Skill 需要的格式
 * 3. 使用 skillLoader.render() 渲染提示词
 * 4. 调用 LLM
 * 5. 解析响应为 Snapshot 格式
 */

import type { AppContext } from "../../../core/app-context.js";
import type { User, Project } from "../../../contracts/types.js";
import type { Step3ScriptCandidateSnapshot } from "../../../contracts/step3-candidate-snapshot-contract.js";
import type { AtmosphereSceneCategory } from "../../../contant-config/style-atmosphere-dict.js";
import { safeParseAtmosphere } from "../../../utils/dict-converters.js";
import { skillLoader } from "../../../services/skills/index.js";
import { requestLlmPlainText } from "../../../services/llm/llm-transport.js";
import { resolveRouteProvider } from "../../../services/llm/provider-resolver.js";
import { ProviderRouteKeys } from "../../../contracts/provider-route-keys.js";
import { buildCharacterPromptFromProject } from "../shared/character-prompt-builder.js";
import { getMergedSceneRecommendation } from "../shared/scene-recommender.js";
import type { VideoScriptContent } from "../step3-video-script/types.js";
import { extractJsonObject } from "../../../services/utils/json-utils.js";
import { getLogger } from "../../../core/logger/index.js";
import { randomUUID } from "node:crypto";

const logger = getLogger("step3-aesthetic");

/** 提示词模板 code */
const PROMPT_CODE_AESTHETIC = "aesthetic_script_generation";

/**
 * 生成 Aesthetic 脚本快照
 */
export async function generateAestheticScriptsSnapshot(
  ctx: AppContext,
  project: Project,
  user: User,
): Promise<Step3ScriptCandidateSnapshot> {
  logger.info({ projectId: project.id }, "开始生成生活美学脚本");

  const startTime = Date.now();

  try {
    // 1. 获取项目上下文（使用统一的 ProjectContextService）
    const [projectContext, sceneRecommendation] = await Promise.all([
      ctx.projectContextService.getProjectContext(project.id, {
        includeGarmentImages: true,
        includeCharacterFiveView: true,
      }),
      getMergedSceneRecommendation(ctx.repos.sceneLibrary, {
        suitability: ["clothing", "lifestyle"],
        fallbackScenes: ["室内家居", "花艺空间", "咖啡馆角落", "阳台晨光", "书店一角", "厨房料理台"],
      }),
    ]);

    // 2. 转换服饰资产
    const assets = projectContext.garments.map(g => ({
      id: g.garmentAssetId,
      type: g.category,
      description: g.description || g.name,
      imageUrl: g.flatLayImageUrl ?? g.mainImageUrl ?? undefined,
    }));

    if (assets.length === 0) {
      throw new Error("项目缺少服饰资产，无法生成生活美学脚本");
    }
    logger.info({ assetCount: assets.length }, "服饰资产已加载");

    // 校验穿搭数据
    if (!projectContext.outfitDescription || projectContext.outfitDescription.trim().length === 0) {
      throw new Error("服饰描述为空，无法生成 aesthetic 脚本。请先完成服饰上传。");
    }
    if (!projectContext.matchingReference || projectContext.matchingReference.trim().length === 0) {
      throw new Error("搭配描述为空，无法生成 aesthetic 脚本。请先完成穿搭方案选择。");
    }
    if (!projectContext.clothingStyles || projectContext.clothingStyles.length === 0) {
      throw new Error("服饰风格为空，无法生成 aesthetic 脚本。请先完成穿搭方案选择。");
    }

    // 3. 转换角色信息
    const characters: Array<{
      id: string;
      name: string;
      tags: string[];
      gender?: "male" | "female" | null;
      age?: string | null;
      description?: string | null;
    }> = [];

    if (projectContext.character) {
      const char = projectContext.character;
      characters.push({
        id: char.libraryCharacterId,
        name: char.name,
        tags: char.tags,
        gender: char.gender === null ? undefined : char.gender,
        age: char.age != null ? String(char.age) : null,
        description: char.style ?? undefined,
      });
    }

    if (characters.length === 0) {
      throw new Error("项目缺少角色信息，无法生成生活美学脚本");
    }
    logger.info({ characterName: characters[0].name }, "角色信息已加载");

    // 4. 获取角色方向（使用统一的 buildCharacterPromptFromProject）
    const { characterDirection } = buildCharacterPromptFromProject(project);

    // 5. 直接使用角色性别，禁止推断
    const directionGender = characterDirection?.gender;
    const charGender = characters[0]?.gender;
    const resolvedGender = (directionGender === "male" || directionGender === "female")
      ? directionGender
      : (charGender === "male" || charGender === "female")
        ? charGender
        : null;
    if (!resolvedGender) {
      throw new Error("角色性别未设置，无法生成 aesthetic 脚本。请先在定妆步骤设置角色性别。");
    }
    const characterGender = resolvedGender;

    // 6. 构建 Skill 变量
    const variables = {
      // 生活美学类型（默认为时装美学，适合时尚博主）
      aestheticType: "fashion_aesthetic",
      // 角色信息
      characters,
      characterGender,
      characterDescription: projectContext.characterDescription || undefined,
      // 服饰信息
      assets,
      outfitDescription: projectContext.outfitDescription || undefined,
      clothingStyles: projectContext.clothingStyles,
      matchingReference: projectContext.matchingReference || undefined,
      // 角色方向
      selectedRoleDirection: characterDirection,
      // 场景推荐（场景库+硬编码合并）
      recommendedScenes: sceneRecommendation.sceneText || undefined,
    };

    // 7. 获取 LLM Provider
    const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.STEP3_AESTHETIC_SCRIPT_GENERATION);
    if (!provider) {
      throw new Error("未配置可用的 LLM 提供商");
    }

    // 8. 加载 Skill 并渲染提示词
    logger.info({ skillCode: PROMPT_CODE_AESTHETIC }, "加载 Skill");
    const { system: systemPrompt, user: userPrompt } = await skillLoader.render(PROMPT_CODE_AESTHETIC, variables);

    // 9. 调用 LLM
    logger.info("调用 LLM 生成脚本");
    const response = await requestLlmPlainText(provider, systemPrompt, userPrompt, 0.8, {
      ctx,
      routeKey: ProviderRouteKeys.STEP3_AESTHETIC_SCRIPT_GENERATION,
      businessContext: "Step3 生活美学生成",
        userId: user.id,
      projectId: project.id,
    });

    // 10. 解析响应
    const rawPayload = extractJsonObject(response);
    if (!rawPayload) {
      const snippet = response.trim().slice(0, 500);
      logger.warn({ snippet }, "LLM 响应解析失败");
      throw new Error("LLM 响应无法解析为 JSON");
    }
    const payload = rawPayload as unknown as VideoScriptContent;

    logger.info("脚本生成完成，解析 payload");

    // 11. 转换为 Snapshot
    const candidateId = randomUUID();
    const snapshot: Step3ScriptCandidateSnapshot = {
      snapshotId: `step3-aesthetic-${Date.now()}`,
      projectId: project.id,
      promptVersion: "aesthetic-v1",
      topNAtCreation: 1,
      lockState: "snapshot_ready",
      lockVersion: 0,
      generationMode: "real",
      selectedCandidateId: null,
      confirmedCandidateId: null,
      createdAt: Date.now(),
      items: [{
        candidateId,
        strategyType: "aesthetic",
        rank: 1,
        title: payload.video_analysis?.title ?? "生活美学脚本",
        preview: (payload.video_analysis?.summary ?? "").slice(0, 100),
        content: payload.video_analysis?.summary ?? "",
        durationSec: payload.video_info?.duration_seconds ?? 30,
        suitability: "high",
        labels: [],
        sourceScriptId: "",
        mainScene: payload.video_info?.main_scene ?? undefined,
        atmosphere: safeParseAtmosphere(payload.video_analysis?.atmosphere) ?? undefined,
        video_info: payload.video_info as Record<string, unknown> | undefined,
        video_analysis: payload.video_analysis as Record<string, unknown> | undefined,
        shot_breakdown: payload.shot_breakdown as Array<Record<string, unknown>> | undefined,
        editing_analysis: payload.editing_analysis as Record<string, unknown> | undefined,
      }],
    };

    const elapsed = Date.now() - startTime;
    logger.info({ elapsedMs: elapsed, candidateId }, "生活美学脚本生成完成");

    return snapshot;
  } catch (error) {
    const elapsed = Date.now() - startTime;
    logger.error(
      {
        projectId: project.id,
        elapsedMs: elapsed,
        error: error instanceof Error ? error.message : String(error)
      },
      "生活美学脚本生成失败"
    );
    throw error;
  }
}