/**
 * 服装换装视频生成模块入口
 *
 * 导出各阶段的执行函数和类型：
 * - Stage 0: 参考图采集（背景帧、角色帧、色彩风格帧）
 * - Stage 1: 视频理解（骨架序列、动作分段）
 * - Stage 2: 角色服装适配（服装替换、角色保持）
 * - Stage 3: 视频生成（外部轮询模式）
 *
 * 导出编排器：
 * - executeOutfitChangePipeline: 串联执行完整流水线
 */

// ============================================================================
// 编排器
// ============================================================================

export {
  executeOutfitChangePipeline,
  type OrchestratorInput,
  type OrchestratorOutput
} from "./orchestrator.js";

// ============================================================================
// Stage 0: 参考图采集
// ============================================================================

export {
  executeStage0,
  type Stage0Input,
  type Stage0Output
} from "./stage0-reference-capture.js";

// ============================================================================
// Stage 1: 视频理解
// ============================================================================

export {
  executeStage1,
  type Stage1Input,
  type Stage1Output
} from "./stage1-video-understand.js";

// ============================================================================
// Stage 2: 视频编辑模式适配（video-edit 模式）
// ============================================================================

export {
  executeStage2VideoEdit,
  adaptSingleSegmentForVideoEdit,
  type Stage2VideoEditInput,
  type Stage2VideoEditOutput,
  type SegmentAdaptResult
} from "./stage2-video-edit-adapt.js";

// ============================================================================
// Stage 3: 视频编辑模式（外部轮询模式）
// ============================================================================

export {
  submitOmniVideoEdit,
  queryOmniVideoEditStatus,
  type SubmitOmniVideoResult,
  type Stage3VideoEditInput,
  type Stage3VideoEditOutput
} from "./stage3-video-edit-generation.js";

// ============================================================================
// 类型重新导出（供外部模块使用）
// ============================================================================

export type {
  ReferenceCaptureResult,
  VideoUnderstandingResult,
  CharacterAdaptResult,
  VideoGenerationResult,
  Keypoint,
  PoseFrame,
  ActionSegment,
} from "../../../contracts/outfit-change-contract.js";
