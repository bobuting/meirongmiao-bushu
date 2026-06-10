/**
 * Step3 视频脚本生成 - 快照构建器
 * 将改写后的脚本转换为 Step3ScriptCandidateSnapshot 格式
 */

import { randomUUID } from "node:crypto";
import type {
  Step3ScriptCandidateSnapshot,
  ScriptCandidateEntity,
} from "../../../contracts/step3-candidate-snapshot-contract.js";
import type {
  VideoScriptContent,
  SnapshotBuildOptions,
  ScriptRewriterOutput,
} from "./types.js";
import { buildUnifiedSnapshotItem } from "./snapshot-field-extractor.js";

/**
 * 生成快照 ID
 */
function generateSnapshotId(prefix: string = "video"): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * 构建完整的 Step3ScriptCandidateSnapshot
 *
 * @param rewrittenScripts 改写后的脚本结果
 * @param options 构建选项
 * @returns Step3ScriptCandidateSnapshot
 */
export function buildVideoScriptSnapshot(
  rewrittenScripts: ScriptRewriterOutput[],
  options: SnapshotBuildOptions,
): Step3ScriptCandidateSnapshot {
  const {
    projectId,
    promptVersion = "video-rewrite-v1",
    generationMode = "real",
  } = options;

  // 转换为 SnapshotItem（统一提取逻辑）
  const items: ScriptCandidateEntity[] = rewrittenScripts
    .filter((r) => r.success && r.rewrittenContent)
    .map((r, index) =>
      buildUnifiedSnapshotItem({
        candidateId: randomUUID(),
        sourceScriptId: r.originalScriptId,
        sourceUrl: r.sourceOssUrl || null,
        rank: index + 1,
        strategyType: "video",
        title: r.rewrittenContent!.video_analysis?.title || `视频脚本 ${index + 1}`,
        content: r.rewrittenContent!,
        sourceOssUrl: r.sourceOssUrl,
      })
    );


  const snapshot: Step3ScriptCandidateSnapshot = {
    snapshotId: generateSnapshotId("video"),
    projectId,
    promptVersion,
    topNAtCreation: items.length,
    lockState: "snapshot_ready",
    lockVersion: 0,
    generationMode,
    selectedCandidateId: null,
    confirmedCandidateId: null,
    createdAt: Date.now(),
    items,
  };

  return snapshot;
}
