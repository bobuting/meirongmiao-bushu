/**
 * Step3 Effectiveness 脚本生成模块
 *
 * 数据来源：使用统一的 ProjectContextService
 *
 * 流程：
 * 1. 获取项目上下文（服饰资产、角色信息等）
 * 2. 转换为 ScriptGenerator 需要的格式
 * 3. 调用 ScriptGenerator 生成脚本
 * 4. 转换为 Snapshot 格式返回
 */

import type { AppContext } from "../../../core/app-context.js";
import type { AtmosphereSceneCategory } from '../../../contant-config/style-atmosphere-dict.js';
import { safeParseAtmosphere } from '../../../utils/dict-converters.js';
import { getLogger } from "../../../core/logger/index.js";

const log = getLogger("effectiveness-generator");

import type { User, Project } from "../../../contracts/types.js";
import type { Step3ScriptCandidateSnapshot } from "../../../contracts/step3-candidate-snapshot-contract.js";
import type { OutfitAssetInput, CharacterInfoInput } from "../../script-effectiveness/types.js";
import type { CharacterDirectionInfo } from "../shared/character-prompt-builder.js";
import { ScriptGenerator } from "../../script-effectiveness/index.js";
import { requestLlmPlainText } from "../../../services/llm/llm-transport.js";
import { resolveRouteProvider } from "../../../services/llm/provider-resolver.js";
import { ProviderRouteKeys } from "../../../contracts/provider-route-keys.js";
import { buildCharacterPromptFromProject } from "../shared/character-prompt-builder.js";
import { randomUUID } from "node:crypto";

/**
 * 生成 Effectiveness 脚本快照
 */
export async function generateEffectivenessScriptsSnapshot(
  ctx: AppContext,
  project: Project,
  user: User,
): Promise<Step3ScriptCandidateSnapshot> {

  const startTime = Date.now();

  try {
    // 1. 获取项目上下文（使用统一的 ProjectContextService）
    const projectContext = await ctx.projectContextService.getProjectContext(project.id, {
      includeGarmentImages: true,
      includeCharacterFiveView: true,
    });

    // 2. 转换服饰资产（补充 description）
    const assets: OutfitAssetInput[] = projectContext.garments.map(g => ({
      assetId: g.garmentAssetId,
      name: g.name,
      category: g.category,
      // 平铺图优先，没有平铺图用主图
      url: g.flatLayImageUrl ?? g.mainImageUrl ?? "",
      description: g.description ?? undefined,
      style: g.style ?? undefined,
      occasion: g.occasion ?? undefined,
      classification: {
        category: g.category,
        viewLabel: undefined,
        confidence: undefined,
        reason: undefined,
      },
    }));

    if (assets.length === 0) {
      throw new Error("项目缺少服饰资产，无法生成 effectiveness 脚本");
    }

    // 校验穿搭数据
    if (!projectContext.outfitDescription || projectContext.outfitDescription.trim().length === 0) {
      throw new Error("服饰描述为空，无法生成 effectiveness 脚本。请先完成服饰上传。");
    }
    if (!projectContext.matchingReference || projectContext.matchingReference.trim().length === 0) {
      throw new Error("搭配描述为空，无法生成 effectiveness 脚本。请先完成穿搭方案选择。");
    }
    if (!projectContext.clothingStyles || projectContext.clothingStyles.length === 0) {
      throw new Error("服饰风格为空，无法生成 effectiveness 脚本。请先完成穿搭方案选择。");
    }

    // 3. 转换角色信息
    const characters: CharacterInfoInput[] = [];
    if (projectContext.character) {
      const char = projectContext.character;
      characters.push({
        characterId: char.libraryCharacterId,
        name: char.name,
        kind: "basic",
        thumbnailUrl: char.thumbnailUrl ?? "",
        tags: char.tags,
        gender: char.gender ?? undefined,
        age: char.age ?? undefined,
        style: char.style ?? undefined,
      });
    }

    // 校验角色性别
    const resolvedGender = projectContext.character?.gender;
    if (!resolvedGender) {
      throw new Error("角色性别未设置，无法生成 effectiveness 脚本。请先在定妆步骤设置角色性别。");
    }

    if (characters.length === 0) {
      throw new Error("项目缺少角色信息，无法生成 effectiveness 脚本");
    }

    // 4. 创建 LLM 请求适配器
    const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.SCRIPT_EFFECTIVENESS_GENERATION);
    if (!provider) {
      throw new Error("未配置可用的 LLM 提供商");
    }

    const requestLlm = async (systemPrompt: string, userPrompt: string): Promise<string> => {
      return requestLlmPlainText(provider, systemPrompt, userPrompt, 0.8, {
        ctx,
        routeKey: ProviderRouteKeys.SCRIPT_EFFECTIVENESS_GENERATION,
        businessContext: "Step3 带货脚本生成",
        userId: user.id,
        projectId: project.id,
      });
    };

    // 5. 调用 ScriptGenerator
    const generator = new ScriptGenerator({
      pool: ctx.pool,
      repos: { scriptData: ctx.repos.scriptData },
      requestLlmPlainText: requestLlm,
      generateId: () => randomUUID(),
    });

    // 使用统一的 buildCharacterPromptFromProject 获取角色方向
    const { characterDirection } = buildCharacterPromptFromProject(project);

    const record = await generator.generate({
      userId: user.id,
      assets,
      characters,
      characterDescription: projectContext.characterDescription || undefined,
      outfitDescription: projectContext.outfitDescription || undefined,
      matchingReference: projectContext.matchingReference || undefined,
      clothingStyles: projectContext.clothingStyles,
      selectedRoleDirection: characterDirection,
    });


    // 6. 转换为 Snapshot
    const snapshot: Step3ScriptCandidateSnapshot = {
      snapshotId: `step3-effectiveness-${Date.now()}`,
      projectId: project.id,
      promptVersion: "effectiveness-v1",
      topNAtCreation: 1,
      lockState: "snapshot_ready",
      lockVersion: 0,
      generationMode: "real",
      selectedCandidateId: null,
      confirmedCandidateId: null,
      createdAt: Date.now(),
      items: [{
        candidateId: record.id,
        strategyType: "effectiveness",
        rank: 1,
        title: record.payloadJson.video_analysis?.title ?? "智能生成脚本",
        preview: record.payloadJson.video_analysis?.summary?.slice(0, 100) ?? "",
        content: record.payloadJson.video_analysis?.summary ?? "",
        durationSec: record.payloadJson.video_info?.duration_seconds ?? 30,
        suitability: "high",
        labels: [],
        sourceScriptId: "",  // effectiveness 类型是全新生成，无源脚本
        mainScene: record.payloadJson.video_info?.main_scene ?? undefined,
        atmosphere: safeParseAtmosphere(record.payloadJson.video_analysis?.atmosphere) ?? undefined,
        video_info: record.payloadJson.video_info,
        video_analysis: record.payloadJson.video_analysis,
        shot_breakdown: record.payloadJson.shot_breakdown,
        editing_analysis: record.payloadJson.editing_analysis,
      }],
    };

    const elapsed = Date.now() - startTime;

    return snapshot;
  } catch (error) {
    log.error({ err: error, projectId: project.id }, "EffectivenessGenerator error");
    throw error;
  }
}
