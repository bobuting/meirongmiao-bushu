/**
 * Step4 视频片段 Job 监听 Hook
 * 监听全局任务队列中 step4_clip_submit 类型任务的状态变化，触发场景级别回调
 *
 * 设计原则：
 * - 纯观察者，不创建任务、不轮询 API
 * - 依赖 useAppStore.globalTaskQueue 作为唯一数据源
 * - 通过 ref 追踪已通知的任务 ID，避免重复回调
 * - 批量收集变更后一次性触发，避免 N 个 clip 完成时产生 N 次重复的 refresh/getProject 请求
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../../store/useAppStore";
import { GlobalTaskType, TaskStatus } from "../../../components/layout/taskQueueConfig";

/** 单个 clip 事件 */
export interface Step4ClipEvent {
  type: "running" | "completed" | "failed";
  sceneIndex: number;
  message?: string;
}

/** Step4 视频任务回调集合 */
export interface Step4VideoJobsCallbacks {
  /** 单个镜头开始生成 */
  onClipRunning?: (sceneIndex: number) => void;
  /** 单个镜头生成完成 */
  onClipCompleted?: (sceneIndex: number) => void;
  /** 单个镜头生成失败 */
  onClipFailed?: (sceneIndex: number, message: string) => void;
  /** 批量事件回调：同一轮轮询中所有新事件收集完毕后触发一次 */
  onBatchEvents?: (events: Step4ClipEvent[]) => void;
}

/** Hook 返回值 */
export interface UseStep4VideoJobsResult {
  runningSceneIndices: Set<number>;
  completedSceneIndices: Set<number>;
  failedSceneIndices: Set<number>;
  isLoading: boolean;
}

/** 从 async job ID 解析 sceneIndex，ID 格式: step4-{videoJobId}-s{sceneIndex} */
function parseSceneIndexFromJobId(jobId: string): number | null {
  const match = jobId.match(/-s(\d+)$/);
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isFinite(index) ? index : null;
}

/**
 * Step4 视频片段 Job 监听 Hook
 * 从 globalTaskQueue 中读取 step4_clip_submit 任务状态，解析 sceneIndex，触发回调
 */
export function useStep4VideoJobs(
  projectId: string | null,
  callbacks?: Step4VideoJobsCallbacks,
): UseStep4VideoJobsResult {
  const [runningSceneIndices, setRunningSceneIndices] = useState<Set<number>>(new Set());
  const [completedSceneIndices, setCompletedSceneIndices] = useState<Set<number>>(new Set());
  const [failedSceneIndices, setFailedSceneIndices] = useState<Set<number>>(new Set());

  // 已触发回调的任务 ID 集合
  const notifiedRef = useRef<Set<string>>(new Set());
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const globalTaskQueue = useAppStore((state) => state.globalTaskQueue);

  // 同时监听 Submit 和 Query 任务类型
  const step4Tasks = useMemo(
    () =>
      globalTaskQueue.filter(
        (t) =>
          (t.type === GlobalTaskType.STEP4_CLIP_SUBMIT || t.type === GlobalTaskType.STEP4_CLIP_QUERY) &&
          t.projectId === projectId,
      ),
    [globalTaskQueue, projectId],
  );

  useEffect(() => {
    if (!projectId) return;

    // 【调试日志】筛选到的任务
    console.log('[useStep4VideoJobs] step4Tasks:', step4Tasks.length, step4Tasks.map(t => ({ id: t.id, type: t.type, status: t.status })));

    const nextRunning = new Set<number>();
    const nextCompleted = new Set<number>();
    const nextFailed = new Set<number>();
    const batchEvents: Step4ClipEvent[] = [];

    for (const task of step4Tasks) {
      const sceneIndex = parseSceneIndexFromJobId(task.id);

      if (task.status === TaskStatus.RUNNING || task.status === TaskStatus.PENDING) {
        if (sceneIndex !== null) nextRunning.add(sceneIndex);
        if (!notifiedRef.current.has(task.id)) {
          notifiedRef.current.add(task.id);
          if (sceneIndex !== null) {
            callbacksRef.current?.onClipRunning?.(sceneIndex);
            batchEvents.push({ type: "running", sceneIndex });
          }
        }
      } else if (task.status === TaskStatus.COMPLETED) {
        if (sceneIndex !== null) nextCompleted.add(sceneIndex);
        if (!notifiedRef.current.has(`done:${task.id}`)) {
          notifiedRef.current.add(`done:${task.id}`);
          if (sceneIndex !== null) {
            callbacksRef.current?.onClipCompleted?.(sceneIndex);
            batchEvents.push({ type: "completed", sceneIndex });
          }
        }
      } else if (task.status === TaskStatus.FAILED) {
        if (sceneIndex !== null) nextFailed.add(sceneIndex);
        if (!notifiedRef.current.has(`done:${task.id}`)) {
          notifiedRef.current.add(`done:${task.id}`);
          const message = task.error?.message || "视频生成失败";
          if (sceneIndex !== null) {
            callbacksRef.current?.onClipFailed?.(sceneIndex, message);
            batchEvents.push({ type: "failed", sceneIndex, message });
          }
        }
      }
    }

    // 批量回调：所有事件收集完毕后触发一次，用于统一刷新 scenes/getProject
    if (batchEvents.length > 0) {
      callbacksRef.current?.onBatchEvents?.(batchEvents);
    }

    setRunningSceneIndices(nextRunning);
    setCompletedSceneIndices(nextCompleted);
    setFailedSceneIndices(nextFailed);
  }, [step4Tasks, projectId]);

  // projectId 切换时重置
  const prevProjectIdRef = useRef(projectId);
  useEffect(() => {
    if (prevProjectIdRef.current !== projectId) {
      notifiedRef.current.clear();
      prevProjectIdRef.current = projectId;
    }
  }, [projectId]);

  return {
    runningSceneIndices,
    completedSceneIndices,
    failedSceneIndices,
    isLoading: runningSceneIndices.size > 0,
  };
}
