/**
 * Step3 分镜状态管理 Hook
 * 视频项目和反推项目共用
 */

import { useState, useCallback } from "react";
import type { ScriptSegment } from "../script-editor/types";

export interface UseStep3SegmentsResult {
  /** 分镜数组 */
  segments: ScriptSegment[];
  /** 设置分镜 */
  setSegments: React.Dispatch<React.SetStateAction<ScriptSegment[]>>;
  /** 完整脚本草稿 */
  fullScriptDraft: string;
  /** 设置完整脚本草稿 */
  setFullScriptDraft: React.Dispatch<React.SetStateAction<string>>;
  /** 更新单个分镜 */
  updateSegment: (index: number, updates: Partial<ScriptSegment>) => void;
  /** 重置所有分镜 */
  resetSegments: () => void;
}

/**
 * 管理分镜状态
 */
export function useStep3Segments(): UseStep3SegmentsResult {
  const [segments, setSegments] = useState<ScriptSegment[]>([]);
  const [fullScriptDraft, setFullScriptDraft] = useState<string>("");

  /**
   * 更新单个分镜
   */
  const updateSegment = useCallback((index: number, updates: Partial<ScriptSegment>) => {
    setSegments((prev) =>
      prev.map((segment, i) => (i === index ? { ...segment, ...updates } : segment))
    );
  }, []);

  /**
   * 重置所有分镜
   */
  const resetSegments = useCallback(() => {
    setSegments([]);
    setFullScriptDraft("");
  }, []);

  return {
    segments,
    setSegments,
    fullScriptDraft,
    setFullScriptDraft,
    updateSegment,
    resetSegments,
  };
}
