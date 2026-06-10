/**
 * Stage 0: 参考图采集模块
 *
 * 功能：
 * - 从源视频提取首帧作为角色参考图
 * - 上传到 OSS，返回 URL
 *
 * 下游只消费 characterFrames[0]（无角色库角色时）和 backgroundFrames[0]，
 * 因此只需提取一个首帧即可满足所有需求。
 */

import type { AppContext } from "../../../core/app-context.js";
import type { ReferenceCaptureResult } from "../../../contracts/outfit-change-contract.js";
import { AppError } from "../../../core/errors.js";
import { getLogger } from "../../../core/logger/index.js";
import { extractFrameAtTime } from "../../../utils/video-frame-extract.js";
import { getOssService, type OssUploadResult } from "../../../service/oss/oss-service.js";
import { join } from "node:path";

const log = getLogger("stage0-reference-capture");

// ============================================================================
// 输入输出类型
// ============================================================================

/** Stage 0 输入参数 */
export interface Stage0Input {
  /** 源视频 URL（原始视频） */
  sourceVideoUrl: string;
  /** 项目ID */
  projectId: string;
  /** 用户ID */
  userId: string;
}

/** Stage 0 输出结果 */
export interface Stage0Output {
  /** 参考图采集结果 */
  result: ReferenceCaptureResult;
  /** 执行耗时（毫秒） */
  elapsedMs: number;
}

// ============================================================================
// 主函数
// ============================================================================

/**
 * 执行 Stage 0: 参考图采集
 *
 * 直接提取视频首帧，作为背景帧和角色帧共用。
 * 下游只消费 backgroundFrames[0] 和 characterFrames[0]，无需多帧。
 */
export async function executeStage0(
  ctx: AppContext,
  input: Stage0Input
): Promise<Stage0Output> {
  const startTime = Date.now();
  log.info({ projectId: input.projectId }, "Stage 0: 开始参考图采集（首帧）");

  if (!ctx.storage) {
    throw new AppError(502, "STAGE0_NO_STORAGE", "Storage 未配置，无法上传帧");
  }

  try {
    // 提取首帧
    const frame = await extractFrameAtTime(input.sourceVideoUrl, 0, "jpg");

    // 上传到 OSS
    const ossService = getOssService(ctx.storage);
    const key = join("outfit-change", input.projectId, "stage0", "first_frame.jpg");
    const uploadResult: OssUploadResult = await ossService.upload(key, frame.frameBytes, frame.mimeType);

    if (!uploadResult.success) {
      throw new AppError(502, "STAGE0_UPLOAD_ERROR", `首帧上传失败: ${uploadResult.message}`);
    }

    const frameUrl = uploadResult.url;

    // 首帧同时作为背景帧和角色帧
    const captureResult: ReferenceCaptureResult = {
      backgroundFrames: [frameUrl],
      characterFrames: [frameUrl],
      colorStyleFrame: frameUrl,
      metadata: {
        totalFrameCount: 1,
        capturedAt: Date.now(),
        resolution: "unknown",
      },
    };

    const elapsedMs = Date.now() - startTime;
    log.info({ projectId: input.projectId, frameUrl, elapsedMs }, "Stage 0: 首帧采集完成");

    return { result: captureResult, elapsedMs };
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    log.error(
      { projectId: input.projectId, elapsedMs, error: error instanceof Error ? error.message : String(error) },
      "Stage 0: 首帧采集失败"
    );
    throw error;
  }
}