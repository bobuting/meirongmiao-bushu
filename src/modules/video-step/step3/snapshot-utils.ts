/**
 * Step3 脚本快照工具函数
 */

import type { Step3ScriptCandidateSnapshot } from "../../../contracts/step3-candidate-snapshot-contract.js";

/** 脚本类型 */
type Step3ScriptTrendType = "library" | "video" | "realtime" | "effectiveness" | "custom" | "fashion";

/**
 * 生成快照 ID
 */
function generateSnapshotId(prefix: string = "step3"): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * 创建空快照（统一函数）
 * 所有策略失败时抛出错误，此函数仅用于特殊降级场景（如项目无数据）
 */
export function createEmptyStep3Snapshot(
  projectId: string,
  trendType: Step3ScriptTrendType,
): Step3ScriptCandidateSnapshot {
  return {
    snapshotId: generateSnapshotId(trendType),
    projectId,
    promptVersion: "empty",
    topNAtCreation: 0,
    lockState: "snapshot_ready",
    lockVersion: 0,
    generationMode: "degraded",
    selectedCandidateId: null,
    confirmedCandidateId: null,
    createdAt: Date.now(),
    items: [],
  };
}