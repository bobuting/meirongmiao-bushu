/**
 * Step3 视频脚本生成 - 类型定义
 * 用于 generateVideoScriptsSnapshot 方法
 */

import type { VideoScriptDataRecord, VideoScriptPayload } from "../../../service/scripts-data-db-service.js";
import type { ScriptCandidateEntity } from "../../../contracts/step3-candidate-snapshot-contract.js";

// 统一分镜类型（从 contracts 导入并 re-export）
export type { ShotBreakdownItem, ShotSubject, PersonSubject, ObjectSubject, Timecode, EditingAnalysis } from "../../../contracts/shot-breakdown-contract.js";
import type { ShotBreakdownItem, EditingAnalysis } from "../../../contracts/shot-breakdown-contract.js";

// =====================================================
// 视频脚本解析后的数据结构
// =====================================================

/** 人物出镜信息 */
export interface VideoOnScreenPresence {
  has_real_person: boolean;
  person_count?: number;
  exposure_level?: "高" | "中" | "低" | string;
  exposure_description?: string;
  person_details?: Array<{
    person_id: number;
    description?: string;
    age?: number;
    gender?: string;
    screen_time_ratio: number;
    appearance_notes?: string;
  }>;
}

/** 服饰风格推荐 */
export interface FashionRecommendedStyle {
  style: string;
  fit_score?: number;
  reason?: string;
  recommended_items?: string[];
}

/** 服饰植入信息 */
export interface VideoFashionPlacement {
  suitable?: boolean;
  reason?: string;
  recommended_styles?: FashionRecommendedStyle[];
  placement_notes?: string;
}

/** 视频分析结构 */
export interface VideoAnalysis {
  title?: string;
  theme?: string;
  summary?: string;
  emotion?: {
    primary?: string;
    secondary?: string[];
    emotion_arc?: string;
  };
  video_type?: string;
  video_style?: string;
  target_audience?: string;
  key_elements?: string[];
  on_screen_presence?: VideoOnScreenPresence;
  fashion_placement?: VideoFashionPlacement;
  atmosphere?: string;
}

/** 视频基本信息 */
export interface VideoInfo {
  title?: string;
  duration_seconds?: number;
  source?: string;
  time_of_day?: string;
  weather?: string;
  main_scene?: string;
  analysis_date?: string;
}

/** 视频脚本内容完整结构 */
export interface VideoScriptContent {
  video_info?: VideoInfo;
  video_analysis?: VideoAnalysis;
  shot_breakdown?: ShotBreakdownItem[];
  editing_analysis?: EditingAnalysis;
}

// =====================================================
// 内部处理类型
// =====================================================

/** 解析后的视频脚本数据 */
export interface VideoScriptData {
  id: string;
  title: string;
  /** 原始数据库记录 */
  record: VideoScriptDataRecord;
  /** 解析后的内容（直接从 payload 提取） */
  parsed: VideoScriptContent | null;
  parseError?: string;
  /** 原视频 OSS 公开链接 */
  sourceOssUrl?: string | null;
}

/** 过滤条件 */
export interface VideoScriptFilterOptions {
  /** 角色服饰风格数组 */
  characterStyles: string[];
  /** 角色年龄（来自角色库，如 25） */
  characterAge?: number | null;
  /** 角色性别（male/female） */
  characterGender?: "male" | "female" | null;
  /** 最小出镜时间比例 */
  minScreenTimeRatio?: number;
  /** 允许的露出程度 */
  allowedExposureLevels?: string[];
}

/** LLM 改写输入 */
export interface ScriptRewriterInput {
  script: VideoScriptData;
  characterDescription: string;
}

/** LLM 改写输出 */
export interface ScriptRewriterOutput {
  success: boolean;
  originalScriptId: string;
  rewrittenContent?: VideoScriptContent;
  error?: string;
  /** 原视频 OSS 公开链接 */
  sourceOssUrl?: string | null;
}

/** 角色信息提取结果 */
export interface CharacterInfo {
  description: string;
  styles: string[];
}

// =====================================================
// 快照构建类型
// =====================================================

/** 快照构建选项 */
export interface SnapshotBuildOptions {
  projectId: string;
  promptVersion?: string;
  generationMode?: "real" | "degraded";
}

/** 转换为 SnapshotItem 的输入 */
export interface SnapshotItemInput {
  scriptId: string;
  title: string;
  content: VideoScriptContent;
  rank: number;
}