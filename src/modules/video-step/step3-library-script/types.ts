/**
 * Step3 库存脚本生成 - 类型定义
 * Library 脚本从 nrm_script_data（type != 1）中获取，匹配角色年龄、性别
 */

import type { VideoScriptDataRecord } from "../../../service/scripts-data-db-service.js";
import type {
  VideoScriptContent,
  VideoScriptData,
} from "../step3-video-script/types.js";

// =====================================================
// 库存脚本特有类型
// =====================================================

/** 库存脚本过滤条件 */
export interface LibraryScriptFilterOptions {
  /** 角色年龄（来自角色库，如 25） */
  characterAge?: number | null;
  /** 角色性别（male/female） */
  characterGender?: "male" | "female" | null;
  /** 最小出镜时间比例（默认 0.5） */
  minScreenTimeRatio?: number;
  /** 允许的露出程度（默认 ["高", "中"]） */
  allowedExposureLevels?: string[];
}

/** 库存脚本改写输出 */
export interface LibraryRewriterOutput {
  success: boolean;
  originalScriptId: string;
  /** 改写后的 shot_breakdown 内容，失败时为空 */
  rewrittenContent?: VideoScriptContent;
  error?: string;
}

/** 库存脚本快照构建选项 */
export interface LibrarySnapshotBuildOptions {
  projectId: string;
  promptVersion?: string;
  generationMode?: "real" | "degraded";
}
