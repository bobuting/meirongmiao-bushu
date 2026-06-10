/**
 * Stage 1: 视频理解模块（确定性版本）
 *
 * 使用 ffmpeg 场景检测 + 数学分镜算法替代 LLM 分析。
 * 完全确定性，零 AI 调用，无解析失败风险。
 */

import type { AppContext } from "../../../core/app-context.js";
import type { VideoUnderstandingResult } from "../../../contracts/outfit-change-contract.js";
import { computeVideoSegments } from "../../../utils/video-scene-detection.js";
import { getLogger } from "../../../core/logger/index.js";

const log = getLogger("stage1-video-understand");

// ============================================================================
// 输入输出类型
// ============================================================================

/** Stage 1 输入参数 */
export interface Stage1Input {
  /** 源视频 URL */
  sourceVideoUrl: string;
  /** 项目ID */
  projectId: string;
  /** 用户ID */
  userId: string;
}

/** Stage 1 输出结果 */
export interface Stage1Output {
  /** 视频理解结果 */
  result: VideoUnderstandingResult;
  /** 执行耗时（毫秒） */
  elapsedMs: number;
}

// ============================================================================
// 主函数
// ============================================================================

/**
 * 执行 Stage 1: 视频理解（确定性）
 *
 * ffmpeg 获取时长 + 场景检测 → 数学计算分镜
 */
export async function executeStage1(
  ctx: AppContext,
  input: Stage1Input
): Promise<Stage1Output> {
  const startTime = Date.now();
  log.info({ projectId: input.projectId }, "Stage 1: 开始视频理解（确定性）");

  try {
    // ffmpeg 获取时长 + 场景检测 + 数学分镜
    const { duration, fps, sceneBoundaries, actionSegments } = await computeVideoSegments(input.sourceVideoUrl);

    const understandResult: VideoUnderstandingResult = {
      poseSequence: [],
      actionSegments,
      duration,
      fps,
    };

    const elapsedMs = Date.now() - startTime;
    log.info(
      {
        projectId: input.projectId,
        duration,
        sceneBoundaryCount: sceneBoundaries.length,
        actionSegmentCount: actionSegments.length,
        elapsedMs,
      },
      "Stage 1: 视频理解完成（确定性）"
    );

    return { result: understandResult, elapsedMs };
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    log.error(
      {
        projectId: input.projectId,
        elapsedMs,
        error: error instanceof Error ? error.message : String(error),
      },
      "Stage 1: 视频理解失败"
    );
    throw error;
  }
}
