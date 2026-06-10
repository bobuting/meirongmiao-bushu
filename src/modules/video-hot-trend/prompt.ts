/**
 * 视频热榜提示词构建函数
 * 构建分镜反推所需的提示词，包含 OSS 链接供 LLM 参考
 */

import type { VideoHotTrendAnalysisInput } from "./types.js";
import { skillLoader } from "../../services/skills/index.js";

const PROMPT_CODE_VIDEO_STORYBOARD = "video_storyboard_analysis";

// ============================================================================
// 分镜拆解提示词
// ============================================================================

/**
 * 构建视频分镜拆解提示词
 * ossUrl: OSS 公开链接，供 LLM 参考视频内容
 */
export async function buildVideoStoryboardPrompt(input: VideoHotTrendAnalysisInput): Promise<string> {
  const { system: systemPrompt, user: userPrompt } = await skillLoader.render(PROMPT_CODE_VIDEO_STORYBOARD, {
    topicId: input.topicId,
    topicLabel: input.topicLabel,
    videoUrl: input.videoUrl,
    ossUrl: input.ossUrl,
  });
  return systemPrompt + (userPrompt ? "\n\n" + userPrompt : "");
}