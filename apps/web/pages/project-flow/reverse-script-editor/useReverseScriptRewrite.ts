/**
 * 反推脚本改写 Hook
 * 专门处理反推项目的脚本改写逻辑
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../../store/useAppStore";
import { GlobalTaskType, TaskStatus } from "../../../components/layout/taskQueueConfig";
import { ApiError, backendApi } from "../../../services/backendApi";
import type { ScriptSegment } from "../script-editor/types";
import { buildFullScriptDraftFromSegments } from "../step3FullScriptDraft";
import {
  buildScriptCandidateViewModelsFromSnapshot,
  type ScriptCandidateViewModel,
} from "../step3ScriptCandidatesController";
import { buildStep3StructuredScriptCardViewModel } from "../step3StructuredScriptCardViewModel";
import type { ScriptCandidateEntity } from "../../../../../src/contracts/step3-candidate-snapshot-contract";

export interface UseReverseScriptRewriteOptions {
  /** 项目 ID */
  projectId: string | null;
  /** 用户 token */
  token: string | null;
  /** 是否已锁定（来自外部判断） */
  isLocked: boolean;
  /** 改写完成回调 */
  onComplete?: (script: ScriptCandidateViewModel) => void;
  /** 错误回调 */
  onError?: (message: string) => void;
}

export interface UseReverseScriptRewriteResult {
  /** 是否正在改写 */
  isRewriting: boolean;
  /** 改写后的脚本 */
  script: ScriptCandidateViewModel | null;
  /** 错误信息 */
  error: string | null;
  /** 触发改写 */
  triggerRewrite: () => void;
  /** 重置状态 */
  reset: () => void;
  /** 加载已有脚本（从数据库加载时使用） */
  loadScript: (vm: ScriptCandidateViewModel) => void;
}

/**
 * 管理反推脚本改写流程
 */
export function useReverseScriptRewrite(
  options: UseReverseScriptRewriteOptions
): UseReverseScriptRewriteResult {
  const { projectId, token, isLocked, onComplete, onError } = options;

  // 订阅 globalTaskQueue 变化
  const globalTaskQueue = useAppStore(
    useShallow((state) => state.globalTaskQueue)
  );

  const [isRewriting, setIsRewriting] = useState(false);
  const [script, setScript] = useState<ScriptCandidateViewModel | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 防止重复触发
  const rewriteTriggeredRef = useRef(false);
  // 跟踪上一个任务状态
  const prevJobRef = useRef<{ id: string; status: string } | null>(null);
  // 跟踪上一个 projectId，用于检测项目切换
  const prevProjectIdRef = useRef<string | null>(null);
  // 组件挂载状态（防止卸载后更新状态）
  const mountedRef = useRef(true);

  // 组件卸载时清理
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 项目切换时重置状态
  useEffect(() => {
    if (prevProjectIdRef.current !== projectId) {
      prevProjectIdRef.current = projectId;
      rewriteTriggeredRef.current = false;
      prevJobRef.current = null;
      if (mountedRef.current) {
        setScript(null);
        setError(null);
        setIsRewriting(false);
      }
    }
  }, [projectId]);

  /**
   * 处理改写完成
   */
  const handleComplete = useCallback(
    (segments: ScriptSegment[], candidate: ScriptCandidateEntity | null | undefined) => {
      if (!mountedRef.current) return; // 组件已卸载

      const fullDraft = buildFullScriptDraftFromSegments(segments);
      const candidateTitle = candidate?.title || "反推脚本";
      const candidateContent = (candidate?.content?.trim()) || fullDraft;
      const candidatePreview = (candidate?.preview?.trim()) || fullDraft.slice(0, 34);
      const durationSec = candidate?.durationSec ?? 30;

      const viewModel: ScriptCandidateViewModel = {
        id: `reverse-rewrite-${projectId}`,
        candidateId: `reverse-rewrite-${projectId}`,
        source: "premium",
        strategyType: "library",
        subtitle: "LLM 改写",
        suitability: "high",
        tags: ["反推脚本"],
        storyboardSegments: segments,
        // 从 API candidate 直接透传
        ...candidate,
        // 以下字段优先使用改写后的值
        title: candidateTitle,
        preview: candidatePreview,
        content: candidateContent,
        durationSec,
        structuredCard: buildStep3StructuredScriptCardViewModel({
          source: "premium",
          title: candidateTitle,
          subtitle: "LLM 改写",
          durationSec,
          storyboardCount: segments.length,
          preview: candidatePreview,
          content: candidateContent,
        }),
      };

      setScript(viewModel);
      setIsRewriting(false);
      setError(null);
      onComplete?.(viewModel);
    },
    [projectId, onComplete]
  );

  /**
   * 触发反推改写
   */
  const triggerRewrite = useCallback(() => {
    if (!token || !projectId) {
      console.warn("[ReverseScriptRewrite] 缺少 token 或 projectId");
      return;
    }
    if (isLocked) {
      console.log("[ReverseScriptRewrite] 已锁定，跳过");
      return;
    }
    if (rewriteTriggeredRef.current) {
      console.log("[ReverseScriptRewrite] 已触发过，跳过");
      return;
    }

    // 检查是否已有任务在运行
    const currentQueue = useAppStore.getState().globalTaskQueue;
    const existingJob = currentQueue.find(
      (job) =>
        job.projectId === projectId &&
        job.type === GlobalTaskType.STEP3_REVERSE_REWRITE &&
        (job.status === TaskStatus.PENDING || job.status === TaskStatus.RUNNING)
    );
    if (existingJob) {
      console.log("[ReverseScriptRewrite] 已有任务在运行");
      setIsRewriting(true);
      return;
    }

    rewriteTriggeredRef.current = true;
    setIsRewriting(true);
    setError(null);

    backendApi
      .step3ReverseRewrite(token, projectId)
      .then((response) => {
        if (!mountedRef.current) return; // 组件已卸载
        // 已完成（幂等返回）
        if (response.status === "completed" && response.scriptSegments?.length) {
          handleComplete(response.scriptSegments as ScriptSegment[], response.candidate);
        }
        // 否则等待 globalTaskQueue 轮询更新
      })
      .catch((err) => {
        if (!mountedRef.current) return; // 组件已卸载
        console.warn("[ReverseScriptRewrite] failed:", err);
        const message = err instanceof ApiError ? err.message : "反推脚本改写失败";
        setError(message);
        setIsRewriting(false);
        rewriteTriggeredRef.current = false; // 允许重试
        onError?.(message);
      });
  }, [token, projectId, isLocked, handleComplete, onError]);

  /**
   * 监听 globalTaskQueue 中的改写任务状态
   */
  useEffect(() => {
    if (!projectId) return;

    const job = globalTaskQueue.find(
      (j) => j.projectId === projectId && j.type === GlobalTaskType.STEP3_REVERSE_REWRITE
    );

    // 没有任务，确保 loading 关闭
    if (!job) {
      if (rewriteTriggeredRef.current) {
        setIsRewriting(false);
      }
      return;
    }

    // 检查状态是否真正变化
    const prevJob = prevJobRef.current;
    if (prevJob && prevJob.id === job.id && prevJob.status === job.status) {
      return; // 状态未变化
    }
    prevJobRef.current = { id: job.id, status: job.status };

    // 任务运行中
    if (job.status === TaskStatus.PENDING || job.status === TaskStatus.RUNNING) {
      setIsRewriting(true);
      return;
    }

    // 任务完成
    if (job.status === TaskStatus.COMPLETED && job.result) {
      // 避免重复处理
      if (prevJob?.status === TaskStatus.COMPLETED) return;

      // 从 API 获取最新脚本
      if (token && projectId) {
        backendApi
          .step3FetchScriptCandidates(token, projectId)
          .then((result) => {
            if (!mountedRef.current) return; // 组件已卸载
            const activeScript = (result as Record<string, unknown>).activeScript as
              | ScriptCandidateEntity
              | undefined;
            if (activeScript?.storyboardSegments?.length) {
              const vm = buildScriptCandidateViewModelsFromSnapshot([activeScript])[0];
              if (vm) {
                handleComplete(
                  vm.storyboardSegments as unknown as ScriptSegment[],
                  activeScript
                );
              } else {
                setIsRewriting(false);
              }
            } else {
              setIsRewriting(false);
            }
          })
          .catch(() => {
            if (!mountedRef.current) return; // 组件已卸载
            setIsRewriting(false);
          });
      }
    } else if (job.status === TaskStatus.FAILED) {
      const message = job.error?.message || "反推脚本改写失败";
      setError(message);
      setIsRewriting(false);
      rewriteTriggeredRef.current = false; // 允许重试
      onError?.(message);
    }
  }, [globalTaskQueue, projectId, token, handleComplete, onError]);

  /**
   * 重置状态
   */
  const reset = useCallback(() => {
    setIsRewriting(false);
    setScript(null);
    setError(null);
    rewriteTriggeredRef.current = false;
    prevJobRef.current = null;
  }, []);

  /**
   * 加载已有脚本（从数据库加载时使用）
   */
  const loadScript = useCallback((vm: ScriptCandidateViewModel) => {
    if (!mountedRef.current) return;
    setScript(vm);
    setError(null);
    rewriteTriggeredRef.current = true; // 标记已加载，避免重复触发改写
  }, []);

  return {
    isRewriting,
    script,
    error,
    triggerRewrite,
    reset,
    loadScript,
  };
}
