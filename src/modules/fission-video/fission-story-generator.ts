/**
 * 裂变故事生成服务
 * 调用大模型根据原视频脚本JSON在指定位置插入扩写分镜
 */

import type { ResolvedRouteProvider } from "../../services/llm/llm-transport.js";
import type { AppContext } from "../../core/app-context.js";
import type { VideoScriptPayload } from "../../service/scripts-data-db-service.js";
import { ProviderRouteKeys } from "../../contracts/provider-route-keys.js";
import { skillLoader } from "../../services/skills/index.js";
import { getLogger } from "../../core/logger/index.js";

const logger = getLogger("fission-video");

const FISSION_STORY_GENERATION_CODE = "fission_story_generation";

/**
 * 故事生成选项
 */
export interface StoryGenerationOptions {
  /** 应用上下文（用于 LLM 调试记录） */
  ctx?: AppContext;
  /** 用户 ID（用于 LLM 调试记录） */
  userId?: string;
  /** 项目 ID（用于 LLM 调试记录） */
  projectId?: string;
  /** 原视频脚本完整JSON（必需） */
  originalScript: VideoScriptPayload;
  /** LLM Provider 配置（从数据库获取） */
  llmProvider?: ResolvedRouteProvider | null;
  /** 扩写分镜的插入位置（必需） */
  insertPositions: number[];
}

/**
 * 故事生成结果
 */
export interface StoryGenerationResult {
  /** 完整的 VideoScriptPayload 结构化脚本 */
  payload: VideoScriptPayload;
}

/**
 * 构建故事生成提示词（从提示词管理系统获取）
 */
async function buildStoryPrompt(
  variables: Record<string, unknown>,
): Promise<{ systemPrompt: string; userPrompt: string }> {
  const { system, user } = await skillLoader.render(FISSION_STORY_GENERATION_CODE, {
    variables,
  });

  return { systemPrompt: system, userPrompt: user };
}

/**
 * 解析 LLM 响应为 VideoScriptPayload
 */
function parseStoryResponse(responseText: string): VideoScriptPayload {
  let jsonText = responseText.trim();

  // 移除可能的 markdown 代码块标记
  if (jsonText.startsWith("```json")) {
    jsonText = jsonText.slice(7);
  } else if (jsonText.startsWith("```")) {
    jsonText = jsonText.slice(3);
  }
  if (jsonText.endsWith("```")) {
    jsonText = jsonText.slice(0, -3);
  }

  jsonText = jsonText.trim();

  try {
    const parsed = JSON.parse(jsonText) as VideoScriptPayload;

    // 基本验证
    if (!parsed.shot_breakdown || !Array.isArray(parsed.shot_breakdown)) {
      throw new Error("缺少 shot_breakdown 字段");
    }
    if (!parsed.video_analysis) {
      throw new Error("缺少 video_analysis 字段");
    }

    return parsed;
  } catch (e) {
    logger.error(
      { err: e instanceof Error ? e : new Error(String(e)), routeKey: ProviderRouteKeys.FISSION_STORY_GENERATION },
      "解析 LLM 返回的结构化脚本失败"
    );
    throw new Error(`解析 LLM 返回的结构化脚本失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * 生成新故事
 * 调用大模型 API 在指定位置插入扩写分镜
 */
export async function generateNewStory(options: StoryGenerationOptions): Promise<StoryGenerationResult> {
  const {
    ctx,
    originalScript,
    llmProvider,
    insertPositions,
  } = options;

  const originalShotCount = originalScript.shot_breakdown?.length ?? 0;
  if (originalShotCount === 0) {
    throw new Error("原脚本分镜数量为0");
  }

  const insertShotCount = insertPositions.length;
  const totalShotCount = originalShotCount + insertShotCount;

  // 构建提示词：传结构化变量给 Skill 模板系统渲染
  const promptVariables: Record<string, unknown> = {
    originalScript,
    insertPositions,
  };

  const { systemPrompt, userPrompt } = await buildStoryPrompt(promptVariables);

  // 如果没有配置 LLM Provider，返回模拟数据
  if (!llmProvider) {
    logger.warn({ totalShotCount }, "StoryGenerator no LLM Provider configured, returning mock data");
    const shots = [];
    let originalIdx = 0;
    for (let i = 1; i <= totalShotCount; i++) {
      const isInserted = insertPositions.includes(i);
      let desc: string;
      if (isInserted) {
        desc = `扩写分镜${i}：随机位置的故事延伸`;
      } else {
        originalIdx++;
        desc = `分镜${originalIdx}：故事情节推进`;
      }
      shots.push({
        shot_id: i,
        shot_type: "中景",
        camera_movement: "固定",
        shot_description: desc,
        visual: { scene: { description: desc }, composition: {}, lighting: {} },
        subjects: [],
        audio: {},
      });
    }
    return {
      payload: {
        video_info: { title: "模拟脚本", duration_seconds: totalShotCount * 4 },
        video_analysis: { title: "模拟脚本", summary: "模拟数据", video_type: "裂变新故事" },
        shot_breakdown: shots,
        editing_analysis: { total_shots: totalShotCount, editing_rhythm: "舒缓", pacing: "慢" },
      },
    };
  }

  try {
    // 统一走 llm-transport 统一层
    const { requestLlmPlainText } = await import("../../services/llm/llm-transport.js");
    const responseText = await requestLlmPlainText(
      llmProvider,
      systemPrompt,
      userPrompt,
      0.9, // 裂变场景使用高温度以保证丰富性和多样性
      {
        ctx,
        userId: options.userId ?? "",
        routeKey: ProviderRouteKeys.FISSION_STORY_GENERATION,
        businessContext: "裂变新故事生成",
        projectId: options.projectId,
      },
    );

    if (!responseText) {
      logger.error(
        { err: new Error("Empty response from LLM"), routeKey: ProviderRouteKeys.FISSION_STORY_GENERATION },
        "LLM 返回空响应"
      );
      throw new Error("Empty response from LLM");
    }

    const payload = parseStoryResponse(responseText);

    return { payload };
  } catch (error) {
    logger.error(
      { err: error, routeKey: ProviderRouteKeys.FISSION_STORY_GENERATION },
      "LLM 调用失败"
    );
    throw error;
  }
}