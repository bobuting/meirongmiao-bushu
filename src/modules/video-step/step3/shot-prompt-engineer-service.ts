/**
 * 分镜提示词工程师服务
 * 调用 LLM 生成分镜专业提示词（keyframe_prompt + video_prompt）
 */

import type { AppContext } from "../../../core/app-context.js";
import { getLogger } from "../../../core/logger/index.js";
import type { VideoScriptPayload } from "../../../service/scripts-data-db-service.js";
import { ProviderRouteKeys, type ProviderRouteKey } from "../../../contracts/provider-route-keys.js";

const log = getLogger("shot-prompt-engineer-service");
import type {
  ShotPromptsJson,
  // CharacterAnchor,  // UNUSED REMOVED
  // ShotPromptItem,  // UNUSED REMOVED
  // KeyframePrompt,  // UNUSED REMOVED
  // VideoPrompt,  // UNUSED REMOVED
  GenerateShotPromptsRequest,
  GenerateShotPromptsResponse,
  // ShotPromptsInputSnapshot,  // UNUSED REMOVED
  // ShotPromptsProjectInfo,  // UNUSED REMOVED
  // EmotionalArc,  // UNUSED REMOVED
  // ConsistencyNotes,  // UNUSED REMOVED
} from "../../../contracts/shot-prompt-engineer-contract.js";
import { resolveRouteProvider } from "../../../services/llm/llm-transport.js";
import { requestLlmPlainTextWithMetadata } from "../../../services/llm/llm-transport.js";
import { extractJsonObject, repairAndParseJson } from "../../../services/utils/json-utils.js";
import { PgShotBreakdownRepository } from "../../../repositories/pg/shot-breakdown-pg-repository.js";
import { skillLoader, buildPromptVariables } from "../../../services/skills/index.js";
import { createProjectContextService } from "../../project-context/project-context-service.js";
import { CharacterMatchingService } from "./character-matching-service.js";
// import type { ProjectContext } from "../../project-context/types.js";  // UNUSED REMOVED

// =====================================================
// 常量定义
// =====================================================

/** LLM Provider 路由键 */
const LLM_ROUTE_KEY = ProviderRouteKeys.STEP3_STORYBOARD_PROMPT;

/** 提示词模板 code */
const PROMPT_TEMPLATE_CODE = "shot_prompt_engineer";

/** 默认画面比例 */
const DEFAULT_ASPECT_RATIO = "9:16";

/** 默认温度参数 */
const DEFAULT_TEMPERATURE = 0.3;

/** 请求超时时间（5分钟） */
const REQUEST_TIMEOUT_MS = 300_000;

// =====================================================
// 类型定义
// =====================================================

/** LLM 调用结果 */
interface LlmCallResult {
  text: string;
  model?: string;
  endpoint?: string;
}

// =====================================================
// 辅助函数
// =====================================================

/**
 * 解析 LLM 返回的 JSON
 * 宽松解析，尝试从文本中提取 JSON 结构
 */
function parseShotPromptsJson(text: string): ShotPromptsJson | null {
  let parsed = extractJsonObject(text);
  if (!parsed) {
    // 标准解析失败，尝试容错修复
    parsed = repairAndParseJson(text);
    if (parsed) {
      log.info({ routeKey: ProviderRouteKeys.STEP3_STORYBOARD_PROMPT }, "JSON 解析通过容错修复成功");
    }
  }
  if (!parsed) {
    const preview = text.length > 200 ? text.slice(0, 200) + "..." : text;
    log.error(
      { routeKey: ProviderRouteKeys.STEP3_STORYBOARD_PROMPT, textPreview: preview, textLength: text.length },
      "JSON 解析失败（标准解析 + 容错修复均失败）"
    );
    return null;
  }

  // 验证必要字段
  if (!Array.isArray(parsed.character_anchors) || !Array.isArray(parsed.shots)) {
    log.error(
      { routeKey: ProviderRouteKeys.STEP3_STORYBOARD_PROMPT },
      "Invalid response structure: missing character_anchors or shots"
    );
    return null;
  }

  // 归一化 generated_at 为数字（LLM 可能返回字符串时间戳）
  if (!parsed.generated_at) {
    parsed.generated_at = Date.now();
  } else if (typeof parsed.generated_at !== "number") {
    const num = Date.parse(String(parsed.generated_at));
    parsed.generated_at = Number.isFinite(num) ? num : Date.now();
  }

  return parsed as unknown as ShotPromptsJson;
}

// =====================================================
// 主服务函数
// =====================================================

/**
 * 生成分镜专业提示词
 * @param ctx 应用上下文
 * @param request 生成请求
 * @returns 生成结果
 */
export async function generateShotPrompts(
  ctx: AppContext,
  request: GenerateShotPromptsRequest,
  routeKey?: ProviderRouteKey,
): Promise<GenerateShotPromptsResponse> {

  const startTime = Date.now();
  const llmRouteKey = routeKey || LLM_ROUTE_KEY;

  // 裂变场景不传 scriptDataId，无法查询脚本数据，跳过数据库依赖的逻辑
  // UNUSED REMOVED: const useDatabase = Boolean(request.scriptDataId);

  try {
    // 1. 获取脚本数据（仅当 scriptDataId 有值时）
    const { getScriptsDataDbService } = await import("../../../service/scripts-data-db-service.js");
    const scriptsDbService = getScriptsDataDbService(ctx.repos);

    let scriptData = null;
    if (request.scriptDataId) {
      scriptData = await scriptsDbService.getById(request.scriptDataId);
      if (!scriptData) {
        return {
          success: false,
          error: `Script data not found: ${request.scriptDataId}`,
        };
      }

      // 2. 检查是否已有专业提示词（仅当 scriptDataId 有值时检查）
      const existingShotPrompts = scriptData.shotPrompts;
      const expectedShotCount = request.segments?.length ?? 0;

      if (existingShotPrompts && existingShotPrompts.shots && existingShotPrompts.shots.length > 0) {
        const existingShotCount = existingShotPrompts.shots.length;

        // 如果传入了 segments，检查数量是否一致
        if (expectedShotCount > 0 && existingShotCount === expectedShotCount) {
          return {
            success: true,
            data: existingShotPrompts,
          };
        }

        // 如果没有传入 segments，也直接返回已有的提示词
        if (expectedShotCount === 0) {
          return {
            success: true,
            data: existingShotPrompts,
          };
        }

        // 数量不匹配，需要重新生成
      }
    }

    // 3. 获取项目上下文（角色五视图 + 服装主图 + 描述信息）
    if (!request.projectId) {
      return {
        success: false,
        error: "projectId is required for shot prompts generation",
      };
    }

    // 获取项目以获取 userId
    const project = await ctx.repos.projects.findById(request.projectId);
    if (!project) {
      return {
        success: false,
        error: `Project not found: ${request.projectId}`,
      };
    }

    const pcs = createProjectContextService(ctx.repos.projects);
    const projectContext = await pcs.getProjectContext(request.projectId, {
      includeCharacterFiveView: true,
      includeGarmentImages: true,
    });

    // 4. 获取 LLM Provider
    const llmProvider = await resolveRouteProvider(ctx, llmRouteKey);
    if (!llmProvider) {
      return {
        success: false,
        error: "No LLM provider available for shot prompts generation",
      };
    }


    // 5. 准备镜头数据
    // - 如果传入了 shotBreakdownJson，直接使用（保留完整结构）
    // - 如果没有 shotBreakdownJson 但传入了 segments，从 segments 构建（丢失部分结构）
    // - 如果两者都没有但有 scriptDataId，从 shot_breakdown 表获取
    // - 如果都没有，返回错误
    let shotBreakdown: VideoScriptPayload["shot_breakdown"] = [];

    if (request.shotBreakdownJson && request.shotBreakdownJson.length > 0) {
      shotBreakdown = request.shotBreakdownJson as VideoScriptPayload["shot_breakdown"];
    } else if (request.segments && request.segments.length > 0) {
      // 从 segments 构建 shot_breakdown
      shotBreakdown = request.segments.map((seg, idx) => {
        // 过滤无效的 visualCue（默认占位符）
        const validVisualCue = seg.visualCue
          && !seg.visualCue.startsWith("镜头 ")
          && seg.visualCue !== `镜头 ${idx + 1} 对应画面提示词`
          ? seg.visualCue
          : undefined;

        return {
          shot_id: idx + 1,
          shot_type: undefined,
          // shot_description 优先使用 content（旁白/口播文案）
          shot_description: seg.content ?? validVisualCue ?? "",
          camera_movement: undefined,
          visual: validVisualCue ? { description: validVisualCue } : undefined,
        };
      }) as VideoScriptPayload["shot_breakdown"];
    } else if (request.scriptDataId && ctx.pool) {
      const shotRepo = new PgShotBreakdownRepository(ctx.pool);
      const shots = await shotRepo.findByScriptDataId(request.scriptDataId!);
      shotBreakdown = shots.map((shot) => {
        // 归一化 duration_seconds：pg driver 将 numeric 类型读取为字符串，需转换
        const normalizedDurationSeconds = shot.durationSeconds != null
          ? (typeof shot.durationSeconds === 'string'
              ? parseFloat(shot.durationSeconds)
              : shot.durationSeconds)
          : undefined;

        return {
          shot_id: shot.shotIndex,
          shot_type: shot.shotType ?? undefined,
          camera_movement: shot.cameraMovement ?? undefined,
          shot_description: shot.shotDescription ?? undefined,
          timecode: shot.timecodeStart || shot.timecodeEnd || normalizedDurationSeconds
            ? {
                start: shot.timecodeStart ?? undefined,
                end: shot.timecodeEnd ?? undefined,
                duration_seconds: normalizedDurationSeconds,
              }
            : undefined,
          camera_details: shot.cameraDetailsJson ?? undefined,
          visual: shot.visualJson ?? undefined,
          subjects: shot.subjectsJson ?? undefined,
          audio: shot.audioJson ?? undefined,
          text_elements: shot.textElementsJson ?? undefined,
          speed_effects: shot.speedEffectsJson ?? undefined,
          transition_in: shot.transitionJson?.in ?? undefined,
          transition_out: shot.transitionJson?.out ?? undefined,
        };
      }) as VideoScriptPayload["shot_breakdown"];
    } else {
      return {
        success: false,
        error: "Either segments or scriptDataId must be provided",
      };
    }

    // 6. 角色匹配与重映射：确保用户角色 = person_id = 1
    const characterMatchingService = new CharacterMatchingService();

    // 确保镜头数据存在
    if (!shotBreakdown || shotBreakdown.length === 0) {
      return {
        success: false,
        error: "No shot breakdown data available for prompt generation",
      };
    }

    // 6.1 执行 person_id 重映射
    const {
      shotBreakdown: remappedBreakdown,
      remapping,
      warnings: personWarnings
    } = characterMatchingService.remapPersonIdsForUserPriority(shotBreakdown, {
      gender: projectContext.character?.gender ?? undefined,
      description: projectContext.characterDescription,
      age: projectContext.character?.age ?? undefined
    });

    if (personWarnings.length > 0) {
      log.warn({
        warnings: personWarnings,
        remapping: Object.fromEntries(remapping)
      }, "Person ID remapping applied for user character priority");
    }

    shotBreakdown = remappedBreakdown;

    // 6.2 执行服饰锚点修正
    const {
      shotBreakdown: outfitFixedBreakdown,
      warnings: outfitWarnings
    } = characterMatchingService.ensureOutfitAnchor(shotBreakdown, 1, "搭配1");

    if (outfitWarnings.length > 0) {
      log.warn({
        warnings: outfitWarnings
      }, "Outfit anchor correction applied");
    }

    shotBreakdown = outfitFixedBreakdown;

    // 6.3 分析最终角色分配
    const characterMatch = characterMatchingService.analyzeCharacters(shotBreakdown);

    log.info({
      mainPersonId: characterMatch.mainPersonId,
      personIds: characterMatch.personIds,
      frequency: Object.fromEntries(characterMatch.personFrequency),
      remapped: remapping.size > 0,
      outfitCorrected: outfitWarnings.length > 0
    }, "Character matching result after validation");

    // 7. 构建提示词变量（统一从 ProjectContext 获取）
    const videoAnalysis = scriptData?.payload?.video_analysis ?? {
      title: projectContext.projectName,
      summary: "",
      video_type: "",
    };

    const characterDescription = projectContext.characterDescription || null;
    const outfitDescription = projectContext.outfitDescription || null;
    const clothingStyles = projectContext.clothingStyles;
    // 搭配方案完整描述（包含上装+下装+鞋履+配饰的整体分析）
    const matchingReference = projectContext.matchingReference || null;

    const promptVariables = buildPromptVariables({
      scriptData: {
        video_info: {
          title: projectContext.projectName,
          duration_seconds: scriptData?.payload?.video_info?.duration_seconds,
          time_of_day: scriptData?.payload?.video_info?.time_of_day,
          weather: scriptData?.payload?.video_info?.weather,
          main_scene: scriptData?.payload?.video_info?.main_scene,
        },
        video_analysis: videoAnalysis,
        shot_breakdown: shotBreakdown,
        editing_analysis: scriptData?.payload?.editing_analysis,
      },
      characterReferenceImages: projectContext.character?.fiveViewOssImageUrl
        ? [projectContext.character.fiveViewOssImageUrl]
        : request.characterReferenceImages?.map((entry) =>
            typeof entry === "object" && entry !== null && "url" in entry ? entry.url : entry,
          ),
      characterDescription: characterDescription ?? undefined,
      outfitDescription: outfitDescription ?? undefined,
      matchingReference: matchingReference ?? undefined,
      clothingStyles: clothingStyles,
      garmentReferenceImages: projectContext.garments
        .map((g) => g.flatLayImageUrl)
        .filter((url): url is string => Boolean(url)),
      aspectRatio: request.aspectRatio || DEFAULT_ASPECT_RATIO,
    });

    // 从提示词管理系统获取模板（模板不存在会直接抛错）
    const { system, user } = await skillLoader.render(PROMPT_TEMPLATE_CODE, {
      variables: promptVariables,
    });

    // 7. 构建 imageInputs：用户角色五视图 + 用户服饰主图（锚点规则：person_id=1, ref="搭配1")
    const imageInputs: Array<{ url: string; label: string }> = [];

    // 用户角色五视图 OSS 合成图（锚点：person_id = 1）
    const fiveViewUrl = projectContext.character?.fiveViewOssImageUrl;
    if (fiveViewUrl) {
      imageInputs.push({ url: fiveViewUrl, label: "用户角色五视图（person_id=1）" });
    }

    // 用户服饰主图（锚点：ref="搭配1"，取第一件）
    const garmentMainUrl = projectContext.garments?.[0]?.mainImageUrl;
    if (garmentMainUrl) {
      imageInputs.push({ url: garmentMainUrl, label: "用户服饰主图（ref=搭配1）" });
    }


    // 8. 调用 LLM（支持自定义温度，裂变场景建议 0.9）
    const temperature = request.temperature ?? DEFAULT_TEMPERATURE;
    const result = await requestLlmPlainTextWithMetadata(
      llmProvider,
      system,
      user,
      temperature,
      {
        ctx,
        routeKey: llmRouteKey,
        userId: project.userId,
        businessContext: "分镜提示词工程",
        timeoutMsOverride: REQUEST_TIMEOUT_MS,
        imageInputs,
        projectId: request.projectId,
      },
    );

    const llmResult: LlmCallResult = {
      text: result.text,
      model: result.debugTrace?.model,
      endpoint: result.debugTrace?.endpoint,
    };


    // 9. 解析 LLM 返回的 JSON
    const shotPrompts = parseShotPromptsJson(llmResult.text);
    if (!shotPrompts) {
      log.error(
        { routeKey: ProviderRouteKeys.STEP3_STORYBOARD_PROMPT },
        "Failed to parse LLM response as JSON"
      );
      return {
        success: false,
        error: "Failed to parse LLM response as valid shot prompts JSON",
        debugPrompt: llmResult.text,
      };
    }

    // 9.0 BGM 排除兜底：LLM 可能不遵循 system prompt 中的 BGM 约束，代码层面强制保障
    const BGM_EXCLUSION = "no background music, no BGM, no soundtrack, no musical score, no accompanying music, without background music, without BGM, without soundtrack, without musical score, without accompanying music";
    if (Array.isArray(shotPrompts.shots)) {
      let patched = 0;
      let created = 0;
      for (const shot of shotPrompts.shots) {
        if (shot.video_prompt) {
          const np = shot.video_prompt.negative_prompt;
          if (np) {
            // negative_prompt 存在但无 BGM 排除，追加
            if (!/background music|BGM|soundtrack/i.test(np)) {
              shot.video_prompt.negative_prompt = `${np}, ${BGM_EXCLUSION}`;
              patched++;
            }
          } else {
            // negative_prompt 不存在，直接创建
            shot.video_prompt.negative_prompt = BGM_EXCLUSION;
            created++;
          }
        }
      }
      if (patched > 0 || created > 0) {
        log.info({ patched, created, total: shotPrompts.shots.length }, "negative_prompt 已补充 BGM 排除词汇（LLM 遗漏或缺失）");
      }
    }

    // 9. 补充输入快照（记录实际使用的数据，而非原始 request）
    shotPrompts.input_snapshot = {
      character_description: characterDescription ?? undefined,
      character_reference_images: imageInputs.map((i) => i.url),
      aspect_ratio: request.aspectRatio || DEFAULT_ASPECT_RATIO,
      project_title: projectContext.projectName,
      outfit_description: outfitDescription ?? undefined,
      clothing_styles: clothingStyles,
      outfit_reference_images: request.outfitReferenceImages,
    };

    // 9.1 补充角色匹配元数据（可观测性）
    shotPrompts.character_matching_meta = {
      main_person_id: characterMatch.mainPersonId,
      total_persons: characterMatch.personIds.length,
      person_frequency: Object.fromEntries(characterMatch.personFrequency),
      remapping_applied: remapping.size > 0,
      remapping_details: Object.fromEntries(remapping),
      outfit_corrections: outfitWarnings.length,
      outfit_warnings: outfitWarnings,
    };

    // 9.2 最终兜底验证（阶段五：确保铁律未被违反）
    const finalValidation = validateFinalOutput(shotPrompts, {
      hasUserCharacter: Boolean(projectContext.character?.fiveViewOssImageUrl || characterDescription),
      hasUserOutfit: Boolean(projectContext.garments?.length > 0 || outfitDescription),
    });

    if (!finalValidation.valid) {
      log.error({
        violations: finalValidation.violations,
        projectId: request.projectId,
        scriptDataId: request.scriptDataId,
      }, "CRITICAL: Final validation failed - anchor rules violated");
      // 不阻止保存，但记录严重错误以便排查
    }

    // 10. 保存到旧表（仅当 scriptDataId 有值时，兼容旧逻辑）
    // 注意：新表保存逻辑在 ShotPromptsService.generateAndSave 中处理
    if (request.scriptDataId) {
      const updateSuccess = await scriptsDbService.updateShotPromptsAndProjectId(
        request.scriptDataId,
        shotPrompts,
        request.projectId,
      );
      if (!updateSuccess) {
        log.warn("[ShotPromptEngineer] Failed to save shot prompts to old table (nrm_script_data), but new table save will handle this");
      }
    }

    const totalTime = Date.now() - startTime;

    return {
      success: true,
      data: shotPrompts,
      debugPrompt: process.env.NODE_ENV === "development" ? llmResult.text : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(
      { err: error instanceof Error ? error : new Error(errorMessage), routeKey: ProviderRouteKeys.STEP3_STORYBOARD_PROMPT },
      "Generation failed"
    );
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * 获取脚本的专业提示词
 * @param ctx 应用上下文
 * @param scriptDataId 脚本数据ID
 * @returns 专业提示词数据
 */
export async function getShotPrompts(
  ctx: AppContext,
  scriptDataId: string,
): Promise<ShotPromptsJson | null> {
  const { getScriptsDataDbService } = await import("../../../service/scripts-data-db-service.js");
  const scriptsDbService = getScriptsDataDbService(ctx.repos);

  const scriptData = await scriptsDbService.getById(scriptDataId);
  return scriptData?.shotPrompts ?? null;
}

/**
 * 按项目ID获取最新脚本的专业提示词
 * @param ctx 应用上下文
 * @param projectId 项目ID
 * @returns 专业提示词数据
 */
export async function getLatestShotPromptsByProjectId(
  ctx: AppContext,
  projectId: string,
): Promise<ShotPromptsJson | null> {
  const { getScriptsDataDbService } = await import("../../../service/scripts-data-db-service.js");
  const scriptsDbService = getScriptsDataDbService(ctx.repos);

  const scriptData = await scriptsDbService.getLatestByProjectId(projectId);
  return scriptData?.shotPrompts ?? null;
}

// =====================================================
// 兜底验证函数
// =====================================================

/**
 * 最终输出验证（阶段五：兜底保障）
 * 确保 LLM 输出没有违反角色服饰锚点铁律
 */
function validateFinalOutput(
  shotPrompts: ShotPromptsJson,
  context: {
    hasUserCharacter: boolean;
    hasUserOutfit: boolean;
  }
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  // 如果没有用户角色和服饰，跳过验证
  if (!context.hasUserCharacter && !context.hasUserOutfit) {
    return { valid: true, violations: [] };
  }

  // 检查脚本中是否实际有角色出镜
  const hasCharactersInScript = shotPrompts.character_anchors.length > 0;

  // 边界场景 1：用户上传了角色参考图，但脚本中角色不出镜（纯产品镜头/空镜）
  // 这种情况是合理的，不应该报错
  if (context.hasUserCharacter && !hasCharactersInScript) {
    // 脚本中无角色出镜，跳过角色相关验证
    return { valid: true, violations: [] };
  }

  // 边界场景 2：用户未提供角色，但 LLM 返回了角色（LLM 自己推断的角色）
  // 这种情况也是合理的，LLM 可能根据脚本内容自动添加角色
  // 但我们不需要验证 person_id=1，因为没有用户指定的角色
  if (!context.hasUserCharacter && hasCharactersInScript) {
    // 只验证角色 ID 连续性，不验证 person_id=1
    const personIds = shotPrompts.character_anchors.map(a => a.person_id).sort((a, b) => a - b);
    for (let i = 0; i < personIds.length - 1; i++) {
      if (personIds[i + 1] - personIds[i] > 1) {
        violations.push(`角色 ID 不连续：${personIds[i]} 到 ${personIds[i + 1]} 跳过了中间编号`);
      }
    }
    return { valid: violations.length === 0, violations };
  }

  // 验证规则 1：用户角色必须是 person_id = 1（仅当用户提供了角色且脚本中有角色时）
  if (context.hasUserCharacter && hasCharactersInScript) {
    const userAnchor = shotPrompts.character_anchors.find(a => a.person_id === 1);
    if (!userAnchor) {
      violations.push("用户角色未分配 person_id = 1（character_anchors 中缺少 person_id=1 的锚点）");
    }
  }

  // 验证规则 2：配角 ID 必须连续
  const personIds = shotPrompts.character_anchors.map(a => a.person_id).sort((a, b) => a - b);
  for (let i = 0; i < personIds.length - 1; i++) {
    if (personIds[i + 1] - personIds[i] > 1) {
      violations.push(`角色 ID 不连续：${personIds[i]} 到 ${personIds[i + 1]} 跳过了中间编号`);
    }
  }

  // 规则 3 的验证在 Service 层的 ensureOutfitAnchor 中完成，这里只做元数据检查
  // 如果 character_matching_meta 记录了修正，说明 Service 层已介入

  return {
    valid: violations.length === 0,
    violations,
  };
}

// =====================================================
// 导出类型
// =====================================================

export type { GenerateShotPromptsRequest, GenerateShotPromptsResponse, ShotPromptsJson };
