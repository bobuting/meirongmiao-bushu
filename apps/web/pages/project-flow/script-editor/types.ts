// apps/web/pages/project-flow/script-editor/types.ts
/**
 * ScriptEditor 类型定义
 */

import { STEP3_SCENE_POOL_MAX_SCENES } from "@contracts/step3-scene-workbench-contract";

// ============================================================================
// 分镜脚本类型
// ============================================================================

/**
 * 脚本分镜项
 */
export interface ScriptSegment {
  time: string;
  title: string;
  content: string;
  visualCue: string;  // 镜头画面描述
  visualPrompt?: string;
  videoCue?: string;
  videoCueTouched?: boolean;
  videoCueInitialized?: boolean;
  sceneImageUrl?: string | null;
  selectedSceneReferenceId?: string | null;
  selectedCharacterReferenceId?: string | null;
  shotSize?: string; // 景别：远景/全景/中景/近景/特写
  dialogue?: string; // 旁白/对话
  action?: string; // 动作描述
  shot_description?: string; // 分镜概要（数据库字段名）
  durationSec?: number; // 时长（秒）
}

/**
 * 模板选项
 */
export interface TemplateOption {
  id: string;
  title: string;
  subtitle: string;
}

// ============================================================================
// 类型别名
// ============================================================================

export type PromptActionType = "optimize" | "translate";
export type Step3StoryboardCueScriptSource = "user_uploaded" | "other";

// ============================================================================
// 常量
// ============================================================================

export const STEP3_SCENE_REFERENCE_MAX_CARDS = STEP3_SCENE_POOL_MAX_SCENES;

// ============================================================================
// 选项类型
// ============================================================================

export interface PersistScriptOptions {
  silent?: boolean;
  sourceType?: "template" | "original" | "reverse";
  segmentsOverride?: ScriptSegment[];
  mirrorToLibrary?: boolean;
  background?: boolean;
}

// ============================================================================
// 预览任务类型
// ============================================================================

export type Step3PreviewJobStatus = "running" | "succeeded" | "failed";

export interface Step3PreviewJobRecord {
  jobId: string;
  status: Step3PreviewJobStatus;
  startedAt: number;
  updatedAt: number;
  imageUrl: string | null;
  error: string | null;
  /** 错误消息（后端部分接口返回 errorMessage 而非 error） */
  errorMessage?: string;
  /** 调试提示词信息 */
  debugPrompts?: Record<string, unknown>;
  /** 生成结果 */
  result?: unknown;
}