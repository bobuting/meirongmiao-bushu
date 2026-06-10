/**
 * Step3 公共类型定义
 * 视频项目和反推项目共用的类型
 */

// 注意：ScriptSegment 类型定义在 script-editor/types.ts 中
// 这里只定义其他共享类型

/**
 * 加载状态
 */
export type LoadingState = "idle" | "loading" | "done" | "error";

/**
 * 各策略加载状态
 */
export interface Step3LoadingStates {
  library: LoadingState;
  video: LoadingState;
  realtime: LoadingState;
  effectiveness: LoadingState;
  custom: LoadingState;
  fashion: LoadingState;
  emotion_archetype: LoadingState;
  aesthetic: LoadingState;
  product_showcase: LoadingState;
  story_theme: LoadingState;
  resonance: LoadingState;
}

/**
 * 预览任务状态
 */
export type PreviewJobStatus = "pending" | "running" | "completed" | "failed" | "expired";

/**
 * 预览任务记录
 */
export interface Step3PreviewJobRecord {
  jobId: string;
  status: PreviewJobStatus;
  createdAt: number;
  updatedAt: number;
  error?: {
    message: string;
    code?: string;
  };
  result?: {
    imageUrl?: string;
    imageUrls?: string[];
  };
}

/**
 * 脚本来源类型
 */
export type Step3StoryboardCueScriptSource = "user_uploaded" | "other";

/**
 * 预览候选 URL 记录
 */
export type PreviewCandidatesByFrame = Record<number, string[]>;

/**
 * 预览任务记录
 */
export type PreviewJobsByFrame = Record<number, Step3PreviewJobRecord>;
