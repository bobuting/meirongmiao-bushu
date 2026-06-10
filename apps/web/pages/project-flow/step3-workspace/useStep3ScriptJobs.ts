/**
 * Step3 脚本生成 Job 监听 Hook
 * 监听全局任务队列中 step3_* 类型任务的状态变化，触发回调
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useAppStore, type GlobalTaskItem } from "../../../store/useAppStore";
import { backendApi } from "../../../services/backendApi";
import { STRATEGY_TYPE_LABELS } from "../../../utils/strategyTypeLabels";

/**
 * 加载状态
 */
export type LoadingState = "idle" | "loading" | "done" | "error";

/**
 * 各类型加载状态
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

/** 单个 job 状态 */
interface ScriptJobState {
  jobId: string;
  status: string;
  resultScriptIds?: string[];
  errorMessage?: string | null;
  /** 该 type 的历史失败次数 */
  failedCount?: number;
}

/** 脚本任务状态（包含策略列表和年龄分组） */
interface ScriptJobStateWithMeta extends ScriptJobState {
  strategies?: string[];
  ageGroup?: string | null;
}

/** 最大重试次数 */
const MAX_RETRY_COUNT = 2;

/**
 * 回调类型
 */
export interface Step3StreamCallbacks {
  /** 单个 job 类型完成时触发（渐进式显示） */
  onJobTypeDone?: (type: string, job: ScriptJobState) => void;
  /** 全部 job 完成时触发 */
  onAllDone?: () => void;
  /** 某个 type 没有 job 记录但可能已有脚本数据时触发，让前端获取数据 */
  onNeedFetchData?: (type: string) => void;
  onError?: (message: string, code?: string) => void;
}

/**
 * Hook 返回类型
 */
export interface UseStep3ScriptJobsResult {
  /** 各类型累积的 items（保持原接口，暂时为空） */
  accumulatedItems: {
    library: unknown[];
    video: unknown[];
    realtime: unknown[];
    effectiveness: unknown[];
    custom: unknown[];
    fashion: unknown[];
    emotion_archetype: unknown[];
    product_showcase: unknown[];
    story_theme: unknown[];
    resonance: unknown[];
    aesthetic: unknown[];
  };
  /** 当前选中脚本 ID */
  selectedScriptId: string | null;
  /** 当前确认脚本 ID */
  confirmedScriptId: string | null;
  /** 设置确认脚本 ID */
  setConfirmedScriptId: (id: string | null) => void;
  /** 当前可用候选 */
  availableItems: unknown[];
  /** 加载状态 */
  loadingState: Step3LoadingStates;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 错误信息 */
  errorMessage: string | null;
  /** 触发脚本生成任务 */
  triggerScriptGeneration: (options?: { forceRefresh?: boolean; preserveSelection?: boolean; restoreOnly?: boolean }) => void;
  /** 重新生成单个策略类型 */
  retryType: (type: ScriptType) => void;
  /** 重置状态 */
  reset: () => void;
  /** 可用的策略列表（根据角色年龄动态过滤） */
  availableStrategies: ScriptType[];
  /** 角色年龄分组 */
  ageGroup: string | null;
}

const SCRIPT_TYPES = ["library", "video", "realtime", "effectiveness", "custom", "fashion", "emotion_archetype", "aesthetic", "product_showcase", "story_theme", "resonance"] as const;
export type ScriptType = (typeof SCRIPT_TYPES)[number];

/** 反推脚本改写任务类型（单独处理） */
const REVERSE_REWRITE_JOB_TYPE = "step3_reverse_rewrite";

/** Step3 类型到 job_type 前缀 */
function toStep3JobType(type: ScriptType): string {
  return `step3_${type}`;
}

/** 从 job_type 提取 step3 类型 */
function fromStep3JobType(jobType: string): ScriptType | null {
  if (!jobType.startsWith("step3_")) return null;
  const suffix = jobType.slice(6);
  if (SCRIPT_TYPES.includes(suffix as ScriptType)) return suffix as ScriptType;
  return null;
}

/** 映射全局任务状态到 Step3 期望状态 */
function mapStatus(status: string): string {
  switch (status) {
    case "completed": return "done";
    case "expired": return "failed";
    default: return status;
  }
}

/**
 * Step3 脚本生成 Job 监听 Hook
 * 从 useAppStore.globalTaskQueue 中读取 step3_* 任务状态
 */
export function useStep3ScriptJobs(
  projectId: string | null,
  token: string | null,
  callbacks?: Step3StreamCallbacks,
): UseStep3ScriptJobsResult {
  // 各类型加载状态
  const [loadingState, setLoadingState] = useState<Step3LoadingStates>({
    library: "idle",
    video: "idle",
    realtime: "idle",
    effectiveness: "idle",
    custom: "idle",
    fashion: "idle",
    emotion_archetype: "idle",
    aesthetic: "idle",
    product_showcase: "idle",
    story_theme: "idle", resonance: "idle",
  });

  // 当前选中/确认的脚本 ID
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [confirmedScriptId, setConfirmedScriptId] = useState<string | null>(null);

  // 错误信息
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 可用的策略列表（根据角色年龄动态过滤）
  const [availableStrategies, setAvailableStrategies] = useState<ScriptType[]>([]);
  // 角色年龄分组
  const [ageGroup, setAgeGroup] = useState<string | null>(null);

  // 已通知完成的 job ID 集合，防止重复回调
  const notifiedDoneRef = useRef<Set<string>>(new Set());

  // 防止 startLoading 重入（effect 依赖变化可能导致连续触发两次）
  const startLoadingInFlightRef = useRef(false);

  // 监听 projectId 变化，重置所有状态（防止切换项目时旧数据残留）
  // 注意：reset 函数在此处定义，避免 TDZ 问题
  const reset = useCallback(() => {
    setSelectedScriptId(null);
    setConfirmedScriptId(null);
    setErrorMessage(null);
    setLoadingState({ library: "idle", video: "idle", realtime: "idle", effectiveness: "idle", custom: "idle", fashion: "idle", emotion_archetype: "idle", aesthetic: "idle", product_showcase: "idle", story_theme: "idle", resonance: "idle" });
    setAvailableStrategies([]);
    setAgeGroup(null);
    notifiedDoneRef.current.clear();
  }, []);

  const resetRef = useRef(reset);
  resetRef.current = reset;
  useEffect(() => {
    if (projectId) {
      resetRef.current();
    }
  }, [projectId]);

  // 脚本确认后，重置所有 loading 状态为 done（后端会取消未完成的 job）
  useEffect(() => {
    if (!confirmedScriptId) return;
    setLoadingState((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(next) as (keyof Step3LoadingStates)[]) {
        if (next[key] === "loading") {
          next[key] = "done";
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [confirmedScriptId]);

  // 是否正在加载
  const isLoading =
    loadingState.library === "loading" ||
    loadingState.video === "loading" ||
    loadingState.realtime === "loading" ||
    loadingState.effectiveness === "loading" ||
    loadingState.custom === "loading" ||
    loadingState.fashion === "loading" ||
    loadingState.emotion_archetype === "loading" ||
    loadingState.aesthetic === "loading";

  // 监听全局任务队列变化，检测 step3 任务状态转换
  const globalTaskQueue = useAppStore((state) => state.globalTaskQueue);

  useEffect(() => {
    if (!projectId) return;

    // 筛选当前项目的 step3 任务
    const step3Tasks = globalTaskQueue.filter(
      (t) => t.type.startsWith("step3_") && t.type !== "step3_",
    );

    for (const task of step3Tasks) {
      // 只处理当前项目的任务
      if (task.projectId && task.projectId !== projectId) continue;

      const mappedStatus = mapStatus(task.status);

      // 特殊处理反推脚本改写任务（完成时触发全局刷新）
      if (task.type === REVERSE_REWRITE_JOB_TYPE) {
        if (mappedStatus === "done" && !notifiedDoneRef.current.has(task.id)) {
          notifiedDoneRef.current.add(task.id);
          // 反推改写完成，通知前端刷新脚本数据
          callbacks?.onJobTypeDone?.("reverse_rewrite", {
            jobId: task.id,
            status: "done",
            resultScriptIds: (task.result as Record<string, unknown> | undefined)?.scriptDataId ? [(task.result as Record<string, unknown>).scriptDataId as string] : undefined,
          });
        } else if (mappedStatus === "failed" && !notifiedDoneRef.current.has(task.id)) {
          notifiedDoneRef.current.add(task.id);
          setErrorMessage(task.error?.message || "反推脚本改写失败");
          callbacks?.onError?.(task.error?.message || "反推脚本改写失败");
        }
        continue;
      }

      const type = fromStep3JobType(task.type);
      if (!type) continue;

      if (mappedStatus === "done" && !notifiedDoneRef.current.has(task.id)) {
        notifiedDoneRef.current.add(task.id);
        const resultScriptIds = (task.result as Record<string, unknown> | undefined)?.resultScriptIds as string[] | undefined;
        setLoadingState((prev) => ({ ...prev, [type]: "done" }));
        callbacks?.onJobTypeDone?.(type, {
          jobId: task.id,
          status: "done",
          resultScriptIds,
        });
      } else if (mappedStatus === "failed" && !notifiedDoneRef.current.has(task.id)) {
        notifiedDoneRef.current.add(task.id);
        setLoadingState((prev) => ({ ...prev, [type]: "error" }));
        const errorMsg = task.error?.message || `${type} 生成失败`;
        setErrorMessage(errorMsg);
        callbacks?.onError?.(errorMsg);
      }
    }
  }, [globalTaskQueue, projectId, callbacks]);

  // 当所有可用策略完成时通知消费方（done 或 error 都视为完成）
  useEffect(() => {
    if (availableStrategies.length === 0) return;
    const allFinished = availableStrategies.every(
      (key) => loadingState[key] === "done" || loadingState[key] === "error"
    );
    if (allFinished) {
      callbacks?.onAllDone?.();
    }
  }, [loadingState, availableStrategies, callbacks]);

  /** 创建 job（不再独立轮询，由全局队列监听状态） */
  const createJob = useCallback(
    (type: ScriptType, forceRefresh?: boolean) => {
      if (!token || !projectId) return;

      const currentProjectId = projectId; // 记录当前 projectId，防止竞态条件
      setLoadingState((prev) => ({ ...prev, [type]: "loading" }));

      void (async () => {
        try {
          await backendApi.step3CreateScriptJob(token, projectId, type, forceRefresh);

          // 检查 projectId 是否仍然匹配（防止快速切换项目时状态错乱）
          if (currentProjectId !== projectId) {
            return;
          }

          // 推送 toast 提醒用户任务已在后台运行
          useAppStore.getState().pushTaskNotification({
            category: "step3-script",
            title: forceRefresh ? "重新生成已开始" : "脚本生成已开始",
            detail: forceRefresh
              ? `${STRATEGY_TYPE_LABELS[type] || type}正在重新生成，可在任务队列查看进度`
              : `${STRATEGY_TYPE_LABELS[type] || type}正在后台生成，可在任务队列查看进度`,
            targetPath: null,
            dedupeKey: `step3-creating-${projectId}-${type}`,
            toastDurationMs: 3000,
          });
          // 刷新全局任务队列，让 useEffect 能监听到任务状态变化
          useAppStore.getState().refreshGlobalTasks();
        } catch (error) {
          // 检查 projectId 是否仍然匹配
          if (currentProjectId !== projectId) {
            return;
          }
          const message = error instanceof Error ? error.message : `${type} 创建失败`;
          setLoadingState((prev) => ({ ...prev, [type]: "error" }));
          setErrorMessage(message);
          callbacks?.onError?.(message);
        }
      })();
    },
    [token, projectId, callbacks],
  );

  /** 触发脚本生成任务：先查 status，再决定发哪些 job */
  const triggerScriptGeneration = useCallback(
    (options?: { forceRefresh?: boolean; preserveSelection?: boolean; restoreOnly?: boolean }) => {
      if (!token || !projectId) return;

      // 防止 effect 依赖变化导致的重入（store 状态异步回写可能触发 effect 二次执行）
      if (startLoadingInFlightRef.current) return;
      startLoadingInFlightRef.current = true;

      // preserveSelection: 锁定确认后刷新时保留选中/确认 ID，避免闪烁
      const preserve = options?.preserveSelection ?? false;

      // 重置状态（保留选中时不清除 ID）
      if (!preserve) {
        setSelectedScriptId(null);
        setConfirmedScriptId(null);
      }
      setErrorMessage(null);
      // 初始化为 idle，等 API 返回可用策略后再设置 loading
      // 避免：设置所有策略为 loading，但实际只有部分可用，导致不可用策略永远卡在 loading
      setLoadingState({ library: "idle", video: "idle", realtime: "idle", effectiveness: "idle", custom: "idle", fashion: "idle", emotion_archetype: "idle", aesthetic: "idle", product_showcase: "idle", story_theme: "idle", resonance: "idle" });
      notifiedDoneRef.current.clear();

      void (async () => {
        const currentProjectId = projectId; // 记录当前 projectId，防止竞态条件
        try {
          const status = await backendApi.step3GetScriptJobsStatus(token, projectId);

          // 检查 projectId 是否仍然匹配（防止快速切换项目时状态错乱）
          if (currentProjectId !== projectId) {
            return;
          }

          // 设置选中/确认状态
          // preserveSelection 时不清除 ID（上方已处理），异步结果也不覆盖 confirmedScriptId
          // 因为后端确认锁定会生成 rewrittenScriptId（新 ID），此时 feed 中尚不存在，
          // 覆盖会导致 visibleScriptCandidates 过滤失败（找不到匹配 → 显示全部卡片）
          setSelectedScriptId(status.selectedScriptId);
          if (!preserve) {
            setConfirmedScriptId(status.confirmedScriptId);
          }

          // 恢复可用策略列表和年龄分组（从业务数据表读取）
          if (status.strategies && status.strategies.length > 0) {
            setAvailableStrategies(status.strategies as ScriptType[]);
          }
          if (status.ageGroup) {
            setAgeGroup(status.ageGroup);
          }

          // 判断是否有任何 job 记录
          const hasAnyJob = SCRIPT_TYPES.some((type) => status.jobs[type] !== null);

          // 判断哪些类型已有脚本数据（防止 job 记录丢失后重复创建）
          const hasDataByType = status.hasDataByType ?? {};

          // 正常模式下，无已确认脚本且无任何 job 时才创建
          // 已确认脚本的项目不允许自动创建（后端会 409）
          // restoreOnly 模式下不创建新 job（仅恢复已有状态）
          const shouldCreateJobs = !options?.restoreOnly && !status.confirmedScriptId && !hasAnyJob;

          // forceRefresh 模式：使用批量 API 创建所有策略
          if (options?.forceRefresh && !status.confirmedScriptId) {
            // 使用批量生成 API（父子任务模式）
            try {
              const result = await backendApi.step3CreateAllScriptJobs(token, projectId, undefined, true);
              // 存储可用策略和年龄分组
              setAvailableStrategies(result.strategies as ScriptType[]);
              setAgeGroup(result.ageGroup ?? null);

              // 【关键】只将可用策略设置为 loading，不可用策略保持 idle
              const newLoadingState: Step3LoadingStates = {
                library: "idle", video: "idle", realtime: "idle", effectiveness: "idle",
                custom: "idle", fashion: "idle", emotion_archetype: "idle", aesthetic: "idle",
                product_showcase: "idle", story_theme: "idle", resonance: "idle",
              };
              for (const strategy of result.strategies) {
                if (strategy in newLoadingState) {
                  newLoadingState[strategy as keyof Step3LoadingStates] = "loading";
                }
              }
              setLoadingState(newLoadingState);

              useAppStore.getState().pushTaskNotification({
                category: "step3-script",
                title: "批量脚本生成已开始",
                detail: `共 ${result.strategies.length} 个策略正在后台生成，可在任务队列查看进度`,
                targetPath: null,
                dedupeKey: `step3-batch-creating-${projectId}`,
                toastDurationMs: 3000,
              });
              // 刷新全局任务队列
              useAppStore.getState().refreshGlobalTasks();
            } catch (batchError) {
              const message = batchError instanceof Error ? batchError.message : "批量创建失败";
              setErrorMessage(message);
              callbacks?.onError?.(message);
            }
            return;
          }

          // 判断每类需要发 job 还是恢复监听
          for (const type of SCRIPT_TYPES) {
            const job = status.jobs[type];

            // 有进行中的 job → 标记 loading（全局队列会监听完成）
            if (job?.status === "pending" || job?.status === "running") {
              setLoadingState((prev) => ({ ...prev, [type]: "loading" }));
              continue;
            }

            // 已完成 → 直接显示结果
            if (job?.status === "done") {
              setLoadingState((prev) => ({ ...prev, [type]: "done" }));
              callbacks?.onJobTypeDone?.(type, {
                jobId: job.jobId,
                status: "done",
                resultScriptIds: job.resultScriptIds,
              });
              continue;
            }

            // 已失败 → 标记错误，不自动重试（用户手动触发）
            if (job?.status === "failed") {
              const failedCount = job.failedCount ?? 1;
              const retryHint = failedCount < MAX_RETRY_COUNT
                ? `（已失败 ${failedCount} 次，可重试）`
                : `（已达到最大重试次数 ${MAX_RETRY_COUNT}）`;
              setLoadingState((prev) => ({ ...prev, [type]: "error" }));
              setErrorMessage((job.errorMessage ?? `${type} 生成失败`) + retryHint);
              continue;
            }

            // 无 job → 正常模式判断是否需要创建（使用批量 API）
            if (shouldCreateJobs && !hasDataByType[type]) {
              // 使用批量生成 API（父子任务模式）
              try {
                const result = await backendApi.step3CreateAllScriptJobs(token, projectId, undefined, false);
                // 存储可用策略和年龄分组
                setAvailableStrategies(result.strategies as ScriptType[]);
                setAgeGroup(result.ageGroup ?? null);

                // 【关键】只将可用策略设置为 loading，不可用策略保持 idle
                const newLoadingState: Step3LoadingStates = {
                  library: "idle", video: "idle", realtime: "idle", effectiveness: "idle",
                  custom: "idle", fashion: "idle", emotion_archetype: "idle", aesthetic: "idle",
                  product_showcase: "idle", story_theme: "idle", resonance: "idle",
                };
                for (const strategy of result.strategies) {
                  if (strategy in newLoadingState) {
                    newLoadingState[strategy as keyof Step3LoadingStates] = "loading";
                  }
                }
                setLoadingState(newLoadingState);

                useAppStore.getState().refreshGlobalTasks();
              } catch (batchError) {
                const message = batchError instanceof Error ? batchError.message : "批量创建失败";
                setErrorMessage(message);
                callbacks?.onError?.(message);
              }
              // 批量创建后跳出循环，不再逐个处理
              break;
            } else {
              // 不创建 job，标记为 done 并通知前端获取已有数据
              setLoadingState((prev) => ({ ...prev, [type]: "done" }));
              callbacks?.onNeedFetchData?.(type);
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "查询状态失败";
          setErrorMessage(message);
          callbacks?.onError?.(message);
        } finally {
          startLoadingInFlightRef.current = false;
        }
      })();
    },
    [token, projectId, callbacks],
  );

  /** 单策略重新生成（始终 forceRefresh=true） */
  const retryType = useCallback((type: ScriptType) => createJob(type, true), [createJob]);

  return {
    accumulatedItems: { library: [], video: [], realtime: [], effectiveness: [], custom: [], fashion: [], emotion_archetype: [], aesthetic: [], product_showcase: [], story_theme: [], resonance: [] },
    selectedScriptId,
    confirmedScriptId,
    setConfirmedScriptId,
    availableItems: [],
    loadingState,
    isLoading,
    errorMessage,
    triggerScriptGeneration,
    retryType,
    reset,
    availableStrategies,
    ageGroup,
  };
}
