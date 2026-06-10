/**
 * Step3 库存脚本 - 快照构建器
 * 将改写后的脚本转换为 Step3ScriptCandidateSnapshot 格式
 * 只包含 1 条结果
 */

import { randomUUID } from "node:crypto";
import type {
  Step3ScriptCandidateSnapshot,
  ScriptCandidateEntity,
} from "../../../contracts/step3-candidate-snapshot-contract.js";
import type { VideoScriptContent } from "../step3-video-script/types.js";
import type { LibrarySnapshotBuildOptions } from "./types.js";
import { buildUnifiedSnapshotItem } from "../step3-video-script/snapshot-field-extractor.js";

/**
 * 生成快照 ID
 */
function generateSnapshotId(prefix: string = "library"): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * 构建库存脚本快照（只含 1 条结果）
 *
 * @param scriptId 脚本 ID
 * @param content 脚本内容（改写后或原文）
 * @param options 构建选项
 * @returns Step3ScriptCandidateSnapshot
 */
export function buildLibraryScriptSnapshot(
  scriptId: string,
  content: VideoScriptContent,
  options: LibrarySnapshotBuildOptions,
): Step3ScriptCandidateSnapshot {
  const { projectId, promptVersion = "library-light-v1", generationMode = "real" } = options;

  // 使用统一提取逻辑构建 SnapshotItem
  const item = buildUnifiedSnapshotItem({
    candidateId: randomUUID(),
    sourceScriptId: scriptId,
    sourceUrl: null,
    rank: 1,
    strategyType: "library",
    title: content.video_analysis?.title || `库存脚本 1`,
    content,
  });

  const snapshot: Step3ScriptCandidateSnapshot = {
    snapshotId: generateSnapshotId(),
    projectId,
    promptVersion,
    topNAtCreation: 1,
    lockState: "snapshot_ready",
    lockVersion: 0,
    generationMode,
    selectedCandidateId: null,
    confirmedCandidateId: null,
    createdAt: Date.now(),
    items: [item],
  };

  return snapshot;
}
