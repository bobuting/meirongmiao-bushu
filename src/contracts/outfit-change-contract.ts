/**
 * 服装换装视频生成系统核心类型定义
 *
 * 包含换装项目从 Stage 0 到 Stage 3 的所有数据结构：
 * - Stage 0: 参考图采集（背景帧、角色帧、色彩风格帧）
 * - Stage 1: 视频理解（骨架序列、动作分段）
 * - Stage 2: 角色服装适配（服装替换、角色保持）
 * - Stage 3: 视频生成（最终视频输出）
 */

/** Contract 版本标识 */
export const OUTFIT_CHANGE_CONTRACT_VERSION = "v1.0.0";

// ============================================================================
// 分镜图片/视频状态定义
// ============================================================================

/** 分镜图片状态 */
export type SegmentImageStatus = "pending" | "processing" | "completed" | "failed";

/** 分镜视频状态 */
export type SegmentVideoStatus = "pending" | "processing" | "ready" | "completed" | "failed";

// ============================================================================
// 换装项目输入参数
// ============================================================================

/** 换装项目输入参数 */
export interface OutfitChangeProjectInput {
  /** 源视频 URL（原始视频，与 builtinTemplateId 二选一） */
  sourceVideoUrl?: string;
  /** 内置动作模板 ID（关联 nrm_action_templates，与 sourceVideoUrl 二选一） */
  builtinTemplateId?: string;
  /** 目标服装 ID（关联 nrm_garment_assets） */
  targetOutfitId: string;
  /** 角色类型：library=角色库角色，generated=生成角色 */
  characterType?: "library" | "generated";
  /** 角色ID（关联 nrm_library_characters 或生成角色记录） */
  characterId?: string;
  /** 项目ID（关联 nrm_projects） */
  projectId: string;
  /** 用户ID */
  userId: string;
}

// ============================================================================
// Stage 0: 参考图采集
// ============================================================================

/** 参考图采集结果（Stage 0 输出） */
export interface ReferenceCaptureResult {
  /** 背景帧数组（不含人物的背景参考图） */
  backgroundFrames: string[];
  /** 角色帧数组（含人物的参考图，用于角色保持） */
  characterFrames: string[];
  /** 色彩风格帧（整体色彩风格参考） */
  colorStyleFrame: string;
  /** 元数据（帧数、时间戳、分辨率等） */
  metadata: {
    totalFrameCount: number;
    capturedAt: number;
    resolution: string;
  };
}

// ============================================================================
// Stage 1: 视频理解
// ============================================================================

/** 骨架关键点 */
export interface Keypoint {
  /** 关键点名称（如 nose, left_eye, right_shoulder 等） */
  name: string;
  /** X 坐标（像素） */
  x: number;
  /** Y 坐标（像素） */
  y: number;
  /** 置信度（0-1） */
  confidence: number;
}

/** 帧姿态数据 */
export interface PoseFrame {
  /** 时间戳（毫秒） */
  timestamp: number;
  /** 骨架关键点数组 */
  keypoints: Keypoint[];
  /** 整体置信度（0-1） */
  confidence: number;
}

/** 动作分段 */
export interface ActionSegment {
  /** 开始时间（秒） */
  startTime: number;
  /** 结束时间（秒） */
  endTime: number;
  /** 动作类型（如 standing, walking, turning, gesture 等） */
  actionType: string;
  /** 动作描述（可选，模板模式下使用） */
  description?: string;
  /** 关键帧数组（可选，模板模式下为空） */
  keyframes?: string[];
}

/** 模板信息（模板模式 Stage 1 输出） */
export interface TemplateInfo {
  id: string;
  name: string;
  category: string;
  aliTemplateId?: string;
  durationSec: number;
}

/** 视频理解结果（Stage 1 输出） */
export interface VideoUnderstandingResult {
  /** 帧姿态序列（每帧的骨架数据） */
  poseSequence: PoseFrame[];
  /** 动作分段数组（动作识别结果） */
  actionSegments: ActionSegment[];
  /** 视频时长（秒） */
  duration: number;
  /** 帧率（FPS） */
  fps: number;
  /** 模板信息（模板模式下提供） */
  templateInfo?: TemplateInfo;
}

// ============================================================================
// Stage 2: 角色服装适配
// ============================================================================

/** 单个 segment 换帧结果 */
export interface SegmentAdaptResult {
  /** segment 序号 */
  segmentIndex: number;
  /** 适配后的首帧 URL */
  adaptedFirstFrameUrl: string;
  /** 适配后的尾帧 URL */
  adaptedLastFrameUrl: string;
}

/** 角色服装适配结果（Stage 2 输出） */
export interface CharacterAdaptResult {
  /** 适配后的角色图像 URL（服装替换后的角色图） */
  adaptedCharacterImage: string;
  /** 角色保持分数（0-1，表示角色特征保持程度） */
  characterPreservationScore: number;
  /** 服装适配分数（0-1，表示服装替换效果） */
  outfitFitScore: number;
  /** 元数据（生成参数、耗时等） */
  metadata: {
    generatedAt: number;
    generationTimeMs: number;
    modelUsed: string;
  };
}

/** Stage 2 批量换帧结果（多个 segment） */
export interface BatchAdaptResult {
  /** 所有 segment 的换帧结果 */
  adaptResults: SegmentAdaptResult[];
}

// ============================================================================
// Stage 3: 视频生成
// ============================================================================

/** 单个 segment 视频生成结果 */
export interface SegmentGenerateResult {
  /** segment 序号 */
  segmentIndex: number;
  /** 生成的视频 URL */
  videoUrl: string;
  /** 视频时长（秒） */
  duration: number;
}

/** 视频生成结果（Stage 3 输出） */
export interface VideoGenerationResult {
  /** 生成的视频 URL */
  generatedVideoUrl: string;
  /** 总帧数 */
  frameCount: number;
  /** 一致性分数（各维度一致性评估） */
  consistencyScores: {
    characterConsistency: number;  // 角色一致性（0-1）
    outfitConsistency: number;     // 服装一致性（0-1）
    motionConsistency: number;     // 动作一致性（0-1）
    overallConsistency: number;    // 综合一致性（0-1）
  };
  /** 生成耗时（毫秒） */
  generationTime: number;
}

/** Stage 3 批量生成结果（多个 segment） */
export interface BatchGenerateResult {
  /** 所有 segment 的生成结果 */
  generateResults: SegmentGenerateResult[];
}

// ============================================================================
// 任务状态与记录
// ============================================================================

/** 换装项目状态枚举 */
export const OUTFIT_CHANGE_PROJECT_STATUSES = [
  "draft",             // 草稿（Step1-3 选择阶段）
  "pending",           // 待处理
  "capturing",         // Stage 0: 参考图采集进行中
  "captured",          // Stage 0: 参考图采集完成
  "understanding",     // Stage 1: 视频理解进行中
  "understood",        // Stage 1: 视频理解完成
  "adapting",          // Stage 2: 角色适配进行中
  "adapted",           // Stage 2: 角色适配完成
  "generating",        // Stage 3: 视频生成进行中
  "ready_for_merge",   // 所有分镜生成完成，等待前端合并
  "succeeded",         // 成功完成
  "failed",            // 失败
  "cancelled",         // 已取消
] as const;

export type OutfitChangeProjectStatus = typeof OUTFIT_CHANGE_PROJECT_STATUSES[number];

/** 换装项目完整记录 */
export interface OutfitChangeProjectRecord {
  /** 任务ID */
  taskId: string;
  /** 任务输入参数 */
  input: OutfitChangeProjectInput;
  /** 当前状态 */
  status: OutfitChangeProjectStatus;
  /** 关联项目ID */
  projectId?: string | null;
  /** 用户ID */
  userId?: string | null;
  /** 源视频URL，Step1选择后即持久化（与 builtinTemplateId 二选一） */
  sourceVideoUrl?: string | null;
  /** 内置动作模板ID，Step1选择后即持久化（与 sourceVideoUrl 二选一） */
  builtinTemplateId?: string | null;
  /** 目标服装ID，Step2选择后即持久化 */
  targetOutfitId?: string | null;
  /** 目标角色ID，Step3选择后即持久化 */
  characterId?: string | null;
  /** Stage 0 结果（可选，完成后填充） */
  stage0Result?: ReferenceCaptureResult | null;
  /** Stage 1 结果（可选，完成后填充） */
  stage1Result?: VideoUnderstandingResult | null;
  /** Stage 2 结果（可选，完成后填充，支持批量 segment 结果） */
  stage2Result?: CharacterAdaptResult | BatchAdaptResult | null;
  /** Stage 3 结果（可选，完成后填充，支持批量 segment 结果） */
  stage3Result?: VideoGenerationResult | BatchGenerateResult | null;
  /** 错误信息（失败时记录） */
  errorMessage?: string | null;
  /** 创建时间戳（毫秒） */
  createdAt: number;
  /** 更新时间戳（毫秒） */
  updatedAt: number;
}

// ============================================================================
// 错误处理配置
// ============================================================================

/** 错误处理配置 */
export interface ErrorHandlingConfig {
  /** Stage 0 失败处理策略：abort=终止，skip=跳过使用默认帧 */
  stage0FailureStrategy: "abort" | "skip";
  /** Stage 1 失败处理策略：abort=终止，fallback=使用简化姿态 */
  stage1FailureStrategy: "abort" | "fallback";
  /** Stage 2 失败处理策略：abort=终止，retry=重试（最多 N 次） */
  stage2FailureStrategy: "abort" | "retry";
  /** Stage 3 失败处理策略：abort=终止，retry=重试（最多 N 次） */
  stage3FailureStrategy: "abort" | "retry";
  /** 最大重试次数 */
  maxRetryCount: number;
  /** 重试间隔（毫秒） */
  retryIntervalMs: number;
  /** 超时时间（毫秒） */
  timeoutMs: number;
}

/** 默认错误处理配置 */
export const DEFAULT_ERROR_HANDLING_CONFIG: ErrorHandlingConfig = {
  stage0FailureStrategy: "abort",
  stage1FailureStrategy: "abort",
  stage2FailureStrategy: "retry",
  stage3FailureStrategy: "retry",
  maxRetryCount: 3,
  retryIntervalMs: 5000,
  timeoutMs: 300000,  // 5 分钟
};