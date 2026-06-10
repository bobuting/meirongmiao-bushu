/**
 * Step3 脚本流式加载服务
 * 支持分类型加载：library（库存精选） → video（视频热榜） → realtime（实时热榜）
 */

import { randomUUID } from "node:crypto";
import type { AppContext } from "../../../core/app-context.js";
import type { User, Project } from "../../../contracts/types.js";
import type {
  Step3ScriptCandidateSnapshot,
  ScriptCandidateEntity,
} from "../../../contracts/step3-candidate-snapshot-contract.js";
import { generateStep3ScriptsSnapshot } from "./script-generation-service.js";
import { generateVideoScriptsSnapshot as generateVideoScriptsSnapshotNew } from "../step3-video-script/index.js";
import { generateLibraryScriptsSnapshot as generateLibraryScriptsSnapshotNew } from "../step3-library-script/index.js";

/**
 * 脚本类型
 */
export type Step3ScriptTrendType = "library" | "video" | "realtime";

/**
 * SSE 事件数据类型
 */
export interface Step3StreamEventLibrary {
  snapshot: Step3ScriptCandidateSnapshot;
}

export interface Step3StreamEventVideo {
  snapshot: Step3ScriptCandidateSnapshot;
}

export interface Step3StreamEventRealtime {
  snapshot: Step3ScriptCandidateSnapshot;
}

export interface Step3StreamEventDone {
  mergedSnapshot: Step3ScriptCandidateSnapshot;
}

export interface Step3StreamEventError {
  message: string;
  code?: string;
}

/**
 * 生成快照 ID
 */
function generateSnapshotId(prefix: string = "step3"): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * 第一步：加载库存精选脚本
 * 从 nrm_script_data（type != 1）获取，按服饰风格匹配，LLM 轻度改写
 */
export async function loadLibraryScriptsSnapshot(
  ctx: AppContext,
  project: Project,
  user: User,
  excludeIds: string[] = [],
): Promise<Step3ScriptCandidateSnapshot> {

  const snapshot = await generateLibraryScriptsSnapshotNew(ctx, project, user, excludeIds);
  return snapshot;
}

/**
 * 第二步：生成视频热榜脚本
 * 调用新的 step3-video-script 模块生成脚本
 */
export async function generateVideoScriptsSnapshot(
  ctx: AppContext,
  project: Project,
  user: User,
  excludeIds: string[] = [],
): Promise<Step3ScriptCandidateSnapshot> {

  // 使用新的视频脚本生成模块
  const snapshot = await generateVideoScriptsSnapshotNew(ctx, project, user, excludeIds);

  return snapshot;
}

/**
 * 第三步：生成实时热榜脚本
 * 调用 LLM 生成，响应较慢
 */
export async function generateRealtimeScriptsSnapshot(
  ctx: AppContext,
  project: Project,
  user: User,
): Promise<Step3ScriptCandidateSnapshot> {

  // 复用现有流水线
  const result = await generateStep3ScriptsSnapshot(ctx, project.id, {
    hotspotLimit: 25,
  });

  // 标记为实时热榜类型
  const items: ScriptCandidateEntity[] = result.snapshot.items.map((item, index) => ({
    ...item,
    candidateId: item.candidateId || randomUUID(),
    strategyType: "realtime" as const,
    rank: index + 1,
  }));

  const snapshot: Step3ScriptCandidateSnapshot = {
    snapshotId: generateSnapshotId("realtime"),
    projectId: project.id,
    promptVersion: result.snapshot.promptVersion,
    topNAtCreation: items.length,
    lockState: "snapshot_ready",
    lockVersion: 0,
    generationMode: result.snapshot.generationMode,
    selectedCandidateId: null,
    confirmedCandidateId: null,
    createdAt: Date.now(),
    items,
  };

  return snapshot;
}