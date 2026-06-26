/**
 * 反推脚本编辑器
 * 专门用于反推项目的 Step3 页面
 * 布局结构与普通视频项目保持一致：左侧栏 + 主内容区 + 底部工具栏
 * 批量生图流程与视频项目同步
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from 'react-router';
import { useShallow } from "zustand/react/shallow";
import { useProjectState } from "../../hooks/useProjectState";
import { useAppStore } from "../../store/useAppStore";
import { GlobalTaskType, TaskStatus } from "../../components/layout/taskQueueConfig";
import { useReverseScriptRewrite } from "./reverse-script-editor/useReverseScriptRewrite";
import { useStep3Segments } from "./step3-shared/useStep3Segments";
import { FullScreenLoading } from "../../components/shared/FullScreenLoading";
import { Step3StructuredScriptCandidatesPanel } from "./step3StructuredScriptCandidatesPanel";
import { ReverseStoryboardCard } from "./reverse-script-editor/ReverseStoryboardCard";
import {
  ProjectFlowHistorySidebar,
  StepContentHeader,
} from "../../components/project-flow";
import { Step3GlobalControlBar } from "./step3-workspace/step3GlobalControlBar";
import { FLOW_SAFE_BOTTOM_PADDING } from "./safeBottomPadding";
import type { ScriptSegment } from "./script-editor/types";
import { isStatusBeyond, isVideoStatusAtOrBeyond, type VideoProjectStatus } from "../../../../src/contracts/types";
import { buildStep3BatchGenerationControlsModel } from "./step3-workspace/step3BatchGenerationControls";
import {
  createIdleStep3BatchGenerationState,
  normalizeStep3BatchThreadCount,
  type Step3BatchGenerationViewState,
} from "./step3-workspace/step3BatchGenerationController";
import {
  DEFAULT_PROJECT_FLOW_CREDIT_PRICING,
  loadProjectFlowCreditPricing,
} from "./projectFlowCredit";
import { ApiError, backendApi } from "../../services/backendApi";
import { useToast } from "../../components/ui/Toast";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { buildScriptCandidateViewModelsFromSnapshot } from "./step3ScriptCandidatesController";
import { ImageLightbox } from "../../components/shared/ImageLightbox";

/**
 * 反推脚本编辑器
 * 流程：进入页面 → 自动触发改写 → 显示脚本 → 编辑分镜 → 批量生图
 */
export const ReverseScriptEditor: React.FC = () => {
  const { projectId: urlProjectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { projectData, isInitialLoading, updateProjectData } = useProjectState(urlProjectId);
  const { showToast: showFeedback } = useToast();
  const { confirm } = useConfirm();

  const { token, globalTaskQueue } = useAppStore(
    useShallow((state) => ({
      token: state.token,
      globalTaskQueue: state.globalTaskQueue,
    }))
  );

  // 分镜状态管理
  const { segments, setSegments, setFullScriptDraft, updateSegment } = useStep3Segments();

  // 项目切换时重置所有项目相关状态（防止旧数据残留）
  const prevProjectIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentId = projectData.projectId ?? null;
    if (prevProjectIdRef.current !== null && prevProjectIdRef.current !== currentId) {
      setFrameImageUrls({});
      frameImageUrlsRef.current = {};
      setFrameCandidatesByIndex({});
      setSingleFrameGenerating(new Set());
      singleFrameBeforeUrlRef.current = {};
      singleFrameStartAtRef.current = {};
      frameImagesRestoredRef.current = false;
      scriptRestoredRef.current = false;
      setStep3BatchState(createIdleStep3BatchGenerationState(2));
      step3BatchGeneratingRef.current = false;
    }
    prevProjectIdRef.current = currentId;
  }, [projectData.projectId]);

  // 滚动容器 ref
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scriptSectionRef = useRef<HTMLDivElement | null>(null);
  const storyboardSectionRef = useRef<HTMLDivElement | null>(null);

  // 步骤锁定：状态 > STORYBOARD_PREVIEW_COMPLETED 即 FILMING 及之后，Step3 只读
  // 与普通视频项目保持一致的判断逻辑
  const step3Locked = useMemo(() => {
    return isStatusBeyond(
      projectData.projectStatus as VideoProjectStatus | undefined,
      "STORYBOARD_PREVIEW_COMPLETED"
    );
  }, [projectData.projectStatus]);

  // 脚本已确认：状态 >= SCRIPT_CONFIRMED（使用 AtOrBeyond 而非 Beyond，因为 SCRIPT_CONFIRMED 本身即表示已确认）
  const isScriptConfirmed = useMemo(() => {
    return isVideoStatusAtOrBeyond(
      projectData.projectStatus as VideoProjectStatus | undefined,
      "SCRIPT_CONFIRMED"
    );
  }, [projectData.projectStatus]);

  // 积分定价（与视频项目同步）
  const [creditPricing, setCreditPricing] = useState(DEFAULT_PROJECT_FLOW_CREDIT_PRICING);
  const [creditPricingLoaded, setCreditPricingLoaded] = useState(false);

  // 批量生图状态管理（与视频项目同步）
  const [step3BatchState, setStep3BatchState] = useState<Step3BatchGenerationViewState>(() =>
    createIdleStep3BatchGenerationState(2)
  );
  const [step3BatchConfirming, setStep3BatchConfirming] = useState(false);
  const step3BatchGeneratingRef = useRef(false);
  // 批量生图开始时间（用于进度条计算）
  const batchStartAtRef = useRef<number | null>(null);

  // 分镜图积分消耗（与视频项目同步）
  const step3SinglePreviewCreditCost = Math.max(0, creditPricing.singleImageCreditCost);

  // 分镜预览图 URL（从 nrm_step3_frame_images 加载）
  const [frameImageUrls, setFrameImageUrls] = useState<Record<number, string>>({});
  // 从 DB 记录中提取的失败帧错误信息（刷新后 globalTaskQueue 可能已不包含旧任务）
  const [frameDbErrorMessages, setFrameDbErrorMessages] = useState<Record<number, string>>({});
  // 候选图 URL（每帧的历史生成记录）
  const [frameCandidatesByIndex, setFrameCandidatesByIndex] = useState<Record<number, string[]>>({});
  // 单帧生成中状态（跟踪 startSingleFramePreviewJob 的帧）
  const [singleFrameGenerating, setSingleFrameGenerating] = useState<Set<number>>(new Set());
  // 记录单帧重试前的图片 URL，用于判断新图是否生成完成
  const singleFrameBeforeUrlRef = useRef<Record<number, string>>({});
  // 记录单帧重试触发时间，超时自动清除（120 秒）
  const singleFrameStartAtRef = useRef<Record<number, number>>({});
  const SINGLE_FRAME_TIMEOUT_MS = 120_000;
  // ref 同步 frameImageUrls 最新值，供 handleSingleFrameRetry 闭包安全读取
  const frameImageUrlsRef = useRef<Record<number, string>>({});
  const frameImagesRestoredRef = useRef(false);

  // 图片放大预览状态
  const [imagePreview, setImagePreview] = useState<{ imageUrl: string; label: string } | null>(null);

  // 批量生图控制模型（与视频项目同步的计算逻辑）
  // 视频生成积分消耗：分镜预览完成且尚未生成视频时，需要支付首次视频生成费用
  const step3EnterStep4CreditCost = useMemo(() => {
    const storyboardPreviewCompleted = projectData.projectStatus === "STORYBOARD_PREVIEW_COMPLETED";
    const hasExportUrl = typeof projectData.exportUrl === "string" && projectData.exportUrl.trim().length > 0;
    const shouldCharge = storyboardPreviewCompleted && !hasExportUrl;
    return shouldCharge ? Math.max(0, segments.length * creditPricing.singleVideoCreditCost) : 0;
  }, [segments, projectData.projectStatus, projectData.exportUrl, creditPricing.singleVideoCreditCost]);

  const step3BatchControlsModel = useMemo(
    () =>
      buildStep3BatchGenerationControlsModel({
        segments,
        batchState: step3BatchState,
        lockedFrameIndexes: [], // 反推项目暂无锁定帧
        unitCreditCost: step3SinglePreviewCreditCost,
        nextLabel: step3Locked ? "下一步" : "生成视频",
        nextCreditCost: step3EnterStep4CreditCost,
        isConfirmingLock: step3BatchConfirming,
      }),
    [segments, step3BatchState, step3Locked, step3SinglePreviewCreditCost, step3BatchConfirming, step3EnterStep4CreditCost]
  );

  // 帧错误信息映射（从全局任务队列中提取 step3_frame_preview 失败任务的错误信息）
  const frameErrorMessages = useMemo(() => {
    const result: Record<number, string> = {};
    const projectId = projectData.projectId;
    if (!projectId) return result;

    // 筛选当前项目的 step3_frame_preview 失败任务
    for (const task of globalTaskQueue) {
      if (task.type !== GlobalTaskType.STEP3_FRAME_PREVIEW) continue;
      if (task.projectId !== projectId) continue;
      if (task.status !== "failed") continue;
      if (!task.error?.message) continue;

      // 解析 input 获取 frameIndex
      try {
        const inputObj = JSON.parse(task.input) as { frameIndex?: number };
        if (typeof inputObj.frameIndex === "number") {
          result[inputObj.frameIndex] = task.error.message;
        }
      } catch {
        // JSON 解析失败，跳过
      }
    }
    return result;
  }, [globalTaskQueue, projectData.projectId]);

  // 反推改写 hook
  const { isRewriting, script, error, triggerRewrite, loadScript } = useReverseScriptRewrite({
    projectId: projectData.projectId,
    token,
    isLocked: isScriptConfirmed, // 脚本确认后跳过改写
    onComplete: (vm) => {
      // 改写完成后，设置分镜数据
      if (vm.storyboardSegments?.length) {
        setSegments(vm.storyboardSegments as unknown as ScriptSegment[]);
        setFullScriptDraft(
          (vm.storyboardSegments as unknown as ScriptSegment[])
            .map((s) => s.title || "")
            .join("\n")
        );
      }
      // ⚠️ 不再立即加载分镜预览图，改为在 useEffect 中等待 segments 更新后加载
      // 原因：setSegments 是异步的，立即调用 loadFrameImages 会使用旧的 segments.length 导致预览图被过滤
    },
  });

  // 加载积分定价（与视频项目同步）
  useEffect(() => {
    if (!token) {
      setCreditPricing(DEFAULT_PROJECT_FLOW_CREDIT_PRICING);
      setCreditPricingLoaded(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const pricing = await loadProjectFlowCreditPricing(token);
        if (!cancelled) {
          setCreditPricing(pricing);
          setCreditPricingLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setCreditPricing(DEFAULT_PROJECT_FLOW_CREDIT_PRICING);
          setCreditPricingLoaded(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // 加载分镜预览图（借鉴视频项目 ScriptEditor 逻辑）
  const loadFrameImages = useCallback(async () => {
    if (!token || !projectData.projectId) return;
    // 记录调用时的 projectId，防止项目切换后旧数据污染新状态
    const callingProjectId = projectData.projectId;
    try {
      const result = await backendApi.getStep3FrameImages(token, callingProjectId);
      // 检查 projectId 是否已切换（防止项目切换后旧数据覆盖新状态）
      if (projectData.projectId !== callingProjectId) return;
      if (result.frames && result.frames.length > 0) {
        const selectedByFrame: Record<number, string> = {};
        const candidatesByFrame: Record<number, string[]> = {};
        const dbFailedErrors: Record<number, string> = {};
        // 当前 segments 数量（用于过滤越界的 frameIndex）
        const currentSegmentsLength = segments.length;
        for (const frame of result.frames) {
          // 过滤越界的 frameIndex（后端数据不一致时保护前端状态）
          if (frame.frameIndex > currentSegmentsLength) continue;
          if (frame.imageUrl && frame.imageUrl.trim().length > 0) {
            selectedByFrame[frame.frameIndex] = frame.imageUrl.trim();
          }
          if (frame.candidates && frame.candidates.length > 0) {
            candidatesByFrame[frame.frameIndex] = frame.candidates;
          }
          // 失败且无图的帧从 DB 状态提取错误信息，确保刷新后仍显示重试按钮
          if (frame.status === "failed" && !selectedByFrame[frame.frameIndex]) {
            dbFailedErrors[frame.frameIndex] = "生成失败，请重试";
          }
        }
        setFrameImageUrls(selectedByFrame);
        frameImageUrlsRef.current = selectedByFrame;
        setFrameCandidatesByIndex(candidatesByFrame);
        if (Object.keys(dbFailedErrors).length > 0) {
          setFrameDbErrorMessages(dbFailedErrors);
        }
        // 回填 sceneImageUrl 到 segments，使批量生图按钮正确判断已完成帧
        for (const [fi, url] of Object.entries(selectedByFrame)) {
          const idx = Number(fi) - 1; // frameIndex 1-based → array 0-based
          if (idx >= 0 && idx < currentSegmentsLength) {
            updateSegment(idx, { sceneImageUrl: url });
          }
        }
      }
    } catch {
      // 分镜图加载失败不影响主流程
    }
  }, [token, projectData.projectId, segments.length, updateSegment]);

  // 脚本已确认时，从数据库加载已有脚本和分镜数据
  const scriptRestoredRef = useRef(false);
  useEffect(() => {
    if (scriptRestoredRef.current) return;
    if (!token || !projectData.projectId) return;
    if (!isScriptConfirmed) return; // 脚本未确认时，等待改写完成
    if (script) return; // 已有脚本，无需加载

    scriptRestoredRef.current = true;
    void (async () => {
      try {
        const result = await backendApi.step3FetchScriptCandidates(token, projectData.projectId!);
        if (result.items.length > 0) {
          const activeScript = result.items.find((c) => c.isSelected) || result.items[0];
          if (activeScript?.storyboardSegments?.length) {
            const vm = buildScriptCandidateViewModelsFromSnapshot([activeScript])[0];
            if (vm) {
              loadScript(vm);
              setSegments(vm.storyboardSegments as unknown as ScriptSegment[]);
              setFullScriptDraft(
                (vm.storyboardSegments as unknown as ScriptSegment[])
                  .map((s) => s.title || "")
                  .join("\n")
              );
            }
          }
        }
      } catch (err) {
        console.warn("[ReverseScriptEditor] 加载已有脚本失败:", err);
      }
    })();
  }, [token, projectData.projectId, isScriptConfirmed, script, loadScript, setSegments, setFullScriptDraft]);

  // 首次加载分镜预览图（等待 segments 数据就绪）
  // ⚠️ 修复：必须等待 segments.length > 0 才加载，否则 loadFrameImages 会因 segments.length=0 过滤掉所有预览图
  useEffect(() => {
    if (frameImagesRestoredRef.current) return;
    if (!token || !projectData.projectId) return;
    if (!isScriptConfirmed) return; // 脚本未确认时无需加载
    if (segments.length === 0) return; // ⚠️ 关键：等待 segments 有数据才加载
    frameImagesRestoredRef.current = true;
    void loadFrameImages();
  }, [token, projectData.projectId, isScriptConfirmed, segments.length, loadFrameImages]);

  // 批量生图运行中时，定时刷新分镜图
  useEffect(() => {
    if (!step3BatchState.running) return;
    const interval = setInterval(() => {
      void loadFrameImages();
    }, 4000);
    return () => clearInterval(interval);
  }, [step3BatchState.running, loadFrameImages]);

  // 监听全局任务队列中的批量生图任务，更新 batchState（修复按钮状态）
  useEffect(() => {
    const effectiveProjectId = urlProjectId || projectData.projectId;
    if (!effectiveProjectId) return;

    const batchJobs = globalTaskQueue.filter(
      (t) => t.projectId === effectiveProjectId && t.type === GlobalTaskType.STEP3_BATCH_PREVIEW
    );
    const frameJobs = globalTaskQueue.filter(
      (t) => t.projectId === effectiveProjectId && t.type === GlobalTaskType.STEP3_FRAME_PREVIEW
    );

    const runningBatch = batchJobs.find((t) => t.status === TaskStatus.RUNNING || t.status === TaskStatus.PENDING);
    const hasActiveBatch = runningBatch != null;

    // 没有活跃批量任务时，如果 batchState 显示运行中，则停止
    if (!hasActiveBatch && step3BatchState.running) {
      // 批量任务已完成或停止，刷新分镜图并重置状态
      void loadFrameImages();
      const normalizedThreadCount = normalizeStep3BatchThreadCount(2);
      setStep3BatchState(createIdleStep3BatchGenerationState(normalizedThreadCount));
      batchStartAtRef.current = null;
      // 刷新项目状态（后端可能已更新为 STORYBOARD_PREVIEW_COMPLETED）
      const effectiveProjectId = urlProjectId || projectData.projectId;
      if (token && effectiveProjectId) {
        backendApi.getProject(token, effectiveProjectId).then((project) => {
          if (project && typeof project.status === "string") {
            updateProjectData({ projectStatus: project.status });
          }
        }).catch(() => {});
      }
      return;
    }

    if (!hasActiveBatch) return;

    // 记录批量开始时间（用于进度条）
    if (batchStartAtRef.current === null) {
      batchStartAtRef.current = runningBatch?.createdAt ?? Date.now();
    }

    // 统计当前批次的帧任务状态
    const batchCreatedAt = runningBatch?.createdAt ?? 0;
    const currentFrameJobs = frameJobs.filter((t) => (t.createdAt ?? 0) >= batchCreatedAt);
    const completedCount = currentFrameJobs.filter((t) => t.status === TaskStatus.COMPLETED).length;
    const failedCount = currentFrameJobs.filter((t) => t.status === TaskStatus.FAILED).length;
    const activeCount = currentFrameJobs.filter((t) => t.status === TaskStatus.RUNNING).length;
    const queuedCount = currentFrameJobs.filter((t) => t.status === TaskStatus.PENDING).length;
    const totalFromBatch = (runningBatch?.result as Record<string, unknown> | null)?.totalFrames as number ?? currentFrameJobs.length;

    setStep3BatchState({
      running: hasActiveBatch,
      active: activeCount,
      queued: queuedCount,
      completedCount,
      failedCount,
      targetCount: totalFromBatch,
      threadCount: normalizeStep3BatchThreadCount(2),
      requestedStop: false,
    });
  }, [globalTaskQueue, urlProjectId, projectData.projectId, step3BatchState.running, loadFrameImages]);

  // 单帧生成中时，定时刷新分镜图直到有图
  useEffect(() => {
    if (singleFrameGenerating.size === 0) return;
    const interval = setInterval(() => {
      void loadFrameImages();
    }, 3000);
    return () => clearInterval(interval);
  }, [singleFrameGenerating, loadFrameImages]);

  // 清除已完成或超时的单帧生成状态
  useEffect(() => {
    if (singleFrameGenerating.size === 0) return;
    const completed = new Set<number>();
    const timedOut = new Set<number>();
    for (const fi of singleFrameGenerating) {
      const currentUrl = frameImageUrls[fi];
      const beforeUrl = singleFrameBeforeUrlRef.current[fi];
      const startAt = singleFrameStartAtRef.current[fi];
      // 无旧图→有新图 = 完成；有旧图→URL 变化 = 完成
      if (currentUrl && currentUrl !== beforeUrl) {
        completed.add(fi);
        delete singleFrameBeforeUrlRef.current[fi];
        delete singleFrameStartAtRef.current[fi];
      } else if (startAt && Date.now() - startAt > SINGLE_FRAME_TIMEOUT_MS) {
        // 超时自动清除，防止后端无响应导致永久轮询
        completed.add(fi);
        timedOut.add(fi);
        delete singleFrameBeforeUrlRef.current[fi];
        delete singleFrameStartAtRef.current[fi];
      }
    }
    if (completed.size > 0) {
      setSingleFrameGenerating((prev) => {
        const next = new Set(prev);
        for (const fi of completed) next.delete(fi);
        return next;
      });
      // 超时帧提示用户
      if (timedOut.size > 0) {
        const frameLabels = Array.from(timedOut).map((fi) => `镜头 ${fi}`).join("、");
        showFeedback(`${frameLabels} 预览图生成超时，请重试。`);
      }
    }
  }, [frameImageUrls, singleFrameGenerating, showFeedback]);

  // 进入页面时触发改写（仅一次）
  useEffect(() => {
    if (!token || !projectData.projectId) return;
    if (projectData.projectKind !== "reverse") return;
    if (isScriptConfirmed) return; // 脚本已确认，不重复触发
    if (script) return; // 已有脚本，不重复触发

    triggerRewrite();
  }, [token, projectData.projectId, projectData.projectKind, isScriptConfirmed, script, triggerRewrite]);

  /**
   * 单帧重试：为指定帧启动单独的预览图生成任务
   * 先标记生成中（防双击），API 失败时清除
   */
  const handleSingleFrameRetry = useCallback(async (frameIndex: number) => {
    if (!token || !projectData.projectId) {
      showFeedback("请先完成前两步（搭配与角色确认）。");
      return;
    }
    // 先标记生成中，防止双击重复提交
    singleFrameBeforeUrlRef.current[frameIndex] = frameImageUrlsRef.current[frameIndex] ?? "";
    singleFrameStartAtRef.current[frameIndex] = Date.now();
    setSingleFrameGenerating((prev) => new Set(prev).add(frameIndex));
    try {
      await backendApi.startSingleFramePreviewJob(token, projectData.projectId, { frameIndex });
      showFeedback(`镜头 ${frameIndex} 预览图任务已启动。`);
    } catch (error) {
      // 失败时清除生成状态
      delete singleFrameBeforeUrlRef.current[frameIndex];
      delete singleFrameStartAtRef.current[frameIndex];
      setSingleFrameGenerating((prev) => {
        const next = new Set(prev);
        next.delete(frameIndex);
        return next;
      });
      const message = error instanceof ApiError ? error.message : "镜头预览图生成失败";
      showFeedback(message);
    }
  }, [token, projectData.projectId, showFeedback]);

  /**
   * 候选图选择：切换指定帧的预览图
   */
  const handleSelectCandidateImage = useCallback(async (frameIndex: number, imageUrl: string) => {
    if (!token || !projectData.projectId) return;
    try {
      await backendApi.selectStep3FrameImage(token, projectData.projectId, frameIndex, imageUrl);
      // 立即更新本地状态
      setFrameImageUrls((prev) => {
        const next = { ...prev, [frameIndex]: imageUrl };
        frameImageUrlsRef.current = next;
        return next;
      });
      updateSegment(frameIndex - 1, { sceneImageUrl: imageUrl });
      showFeedback(`镜头 ${frameIndex} 预览图已切换。`);
    } catch {
      showFeedback("切换预览图失败，请重试。");
    }
  }, [token, projectData.projectId, showFeedback, updateSegment]);

  /**
   * 批量生图处理函数（与视频项目同步）
   */
  const handleStep3BatchAction = async (action: "batch-generate" | "stop") => {
    const normalizedThreadCount = normalizeStep3BatchThreadCount(2);

    if (action === "stop") {
      // 停止确认弹窗
      const shouldStop = await confirm(
        "停止后将取消所有未生成的分镜，已生成的分镜不受影响。是否继续？",
        "停止确认"
      );
      if (!shouldStop) {
        return;
      }
      // 停止批量任务：调用后端 stop API
      if (token && projectData.projectId) {
        try {
          await backendApi.stopBatchPreviewJob(token, projectData.projectId);
        } catch {
          // 停止失败不影响 UI
        }
      }
      setStep3BatchState((current) => ({
        ...current,
        running: false,
        queued: 0,
        requestedStop: true,
      }));
      // 停止后刷新一轮分镜图，确保已生成的图片不遗漏
      void loadFrameImages();
      showFeedback("已停止批量分镜预览生成。");
      return;
    }

    // 防止重复点击
    if (step3BatchGeneratingRef.current) {
      showFeedback("批量生图进行中，请勿重复操作。");
      return;
    }
    if (!token || !projectData.projectId) {
      showFeedback("请先完成前两步（搭配与角色确认）。");
      return;
    }

    const targets = step3BatchControlsModel.targets;
    if (targets.length < 1) {
      setStep3BatchState(createIdleStep3BatchGenerationState(normalizedThreadCount));
      showFeedback("当前没有可批量生成的分镜。");
      return;
    }

    // 确认弹窗：提示用户生成将消耗积分
    const totalCost = targets.length * step3SinglePreviewCreditCost;
    const costMessage = totalCost > 0
      ? `即将为 ${targets.length} 个分镜生成预览图，预计消耗 ${totalCost} 积分。是否继续？`
      : `即将为 ${targets.length} 个分镜生成预览图。是否继续？`;
    const shouldGenerate = await confirm(costMessage, "生成分镜预览");
    if (!shouldGenerate) {
      return;
    }

    // 脚本已确认状态，直接启动批量生图
    // 反推项目的脚本由 AI 自动生成并确认，不需要额外的锁定步骤
    step3BatchGeneratingRef.current = true;
    try {
      const frameIndexes = targets.map((t) => t.frameIndex);

      await backendApi.startBatchPreviewJob(token, projectData.projectId, {
        frameIndexes,
      });

      showFeedback(`批量分镜预览已启动，共 ${frameIndexes.length} 个分镜。`);

      // 立即显示进度状态
      setStep3BatchState({
        running: true,
        active: frameIndexes.length,
        queued: 0,
        completedCount: 0,
        failedCount: 0,
        targetCount: frameIndexes.length,
        threadCount: normalizedThreadCount,
        requestedStop: false,
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "批量分镜预览启动失败";
      setStep3BatchState(createIdleStep3BatchGenerationState(normalizedThreadCount));
      showFeedback(message);
    } finally {
      step3BatchGeneratingRef.current = false;
    }
  };

  /**
   * 进入下一步（生成视频）：显示确认框并更新项目状态
   */
  const handleNextStep = useCallback(async () => {
    const pid = projectData.projectId ?? urlProjectId;
    if (!pid) return;

    // 锁定模式下直接跳转到 Step4，不做其他操作
    if (step3Locked) {
      navigate(`/create/${pid}/step4`);
      return;
    }

    // 显示确认框：提示积分消耗和不可回退
    const confirmMessage = step3EnterStep4CreditCost > 0
      ? `即将锁定脚本并进入视频生成阶段，该操作不可回退。预计消耗 ${step3EnterStep4CreditCost} 积分。是否继续？`
      : "即将锁定脚本并进入视频生成阶段，该操作不可回退。是否继续？";
    const shouldContinue = await confirm(confirmMessage, "进入视频生成");
    if (!shouldContinue) return;

    // 确认后更新项目状态为 FILMING
    if (token && projectData.projectId) {
      try {
        await backendApi.updateProjectStatus(token, projectData.projectId, "FILMING");
        // 同步更新前端状态
        updateProjectData({ projectStatus: "FILMING" });
      } catch (e) {
        console.error("[ReverseScriptEditor] Failed to update project status to FILMING:", e);
        showFeedback("更新项目状态失败，请重试。");
        return;
      }
    }

    navigate(`/create/${pid}/step4`);
  }, [projectData.projectId, urlProjectId, step3Locked, step3EnterStep4CreditCost, token, confirm, navigate, showFeedback, updateProjectData]);

  // 数据加载中
  if (isInitialLoading) {
    return <FullScreenLoading />;
  }

  // 改写中，显示加载状态（使用与普通项目一致的遮罩样式）
  if (isRewriting && !script) {
    return (
      <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-[#FDFBF7]">
        {/* 左侧栏占位 */}
        <ProjectFlowHistorySidebar currentStep={3} projectId={projectData.projectId || ""}>
          <div className="px-6 py-4">
            <div className="rounded-2xl border border-[#e07a5f]/20 bg-gradient-to-br from-[#faf6f2] to-[#f7f1ea] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-base text-[#e07a5f] animate-pulse">autorenew</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#c45a42]">正在改写</span>
              </div>
              <div className="mt-2 text-sm font-semibold text-gray-800">脚本改写中...</div>
              <p className="mt-1.5 text-[11px] leading-[1.5] text-gray-500">
                AI 正在根据视频内容改写脚本，通常需要 1-3 分钟
              </p>
            </div>
          </div>
        </ProjectFlowHistorySidebar>

        {/* 主内容区：加载遮罩 */}
        <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
          <StepContentHeader
            stepNumber={3}
            title="脚本与分镜"
            icon="article"
            subtitle="正在根据视频内容改写脚本..."
          />
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="relative h-16 w-16">
                <div className="absolute inset-0 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
                <span className="material-icons-round absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl text-orange-500">
                  schedule
                </span>
              </div>
              <div className="text-center">
                <div className="font-semibold text-gray-700">正在改写脚本...</div>
                <div className="mt-1 text-sm text-gray-400">
                  AI 正在根据视频内容改写脚本，通常需要 1-3 分钟
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error && !script) {
    return (
      <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-[#FDFBF7]">
        {/* 左侧栏 */}
        <ProjectFlowHistorySidebar currentStep={3} projectId={projectData.projectId || ""}>
          <div className="px-6 py-4">
            <div className="rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 to-red-100/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-base text-red-500">error_outline</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-600">改写失败</span>
              </div>
              <div className="mt-2 text-sm font-semibold text-gray-800">脚本改写失败</div>
              <p className="mt-1.5 text-[11px] leading-[1.5] text-gray-500">
                请点击右侧重新改写按钮重试
              </p>
            </div>
          </div>
        </ProjectFlowHistorySidebar>

        {/* 主内容区：错误提示 */}
        <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
          <StepContentHeader
            stepNumber={3}
            title="脚本与分镜"
            icon="article"
            subtitle="脚本改写失败，请重试"
          />
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="material-icons-round text-5xl text-red-400">error_outline</span>
              <div className="text-gray-700">{error}</div>
              <button
                onClick={() => triggerRewrite()}
                className="rounded-full bg-primary px-6 py-2 text-sm font-semibold text-white hover:brightness-105"
              >
                重新改写
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 正常显示：脚本和分镜编辑器（上下结构，与普通视频项目一致）
  return (
    <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-[#FDFBF7]">
      {/* 左侧栏 */}
      <ProjectFlowHistorySidebar
        currentStep={3}
        projectId={projectData.projectId || ""}
        onImagePreview={(frames, currentIndex) => {
          const frame = frames[currentIndex];
          if (frame?.imageUrl) {
            setImagePreview({ imageUrl: frame.imageUrl, label: frame.title || "" });
          }
        }}
      >
        {/* 脚本工具区 */}
        <div className="px-6 py-4">
          <div
            className="cursor-pointer rounded-2xl border border-[#e07a5f]/20 bg-gradient-to-br from-[#faf6f2] to-[#f7f1ea] px-4 py-3 hover:border-[#e07a5f]/40 hover:shadow-md group/sidecard"
            onClick={() => {
              scriptSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            {/* 标题行 */}
            <div className="flex items-center gap-2">
              <span className="material-icons-round text-base text-[#e07a5f]">article</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#c45a42]">当前脚本</span>
              {step3Locked && (
                <span className="ml-auto flex items-center gap-1 rounded-full bg-[#e07a5f]/10 px-2 py-0.5">
                  <span className="material-icons-round text-[10px] text-[#e07a5f]">lock</span>
                  <span className="text-[9px] font-semibold text-[#e07a5f]">已锁定</span>
                </span>
              )}
            </div>

            {/* 脚本标题 */}
            <div className="mt-2 text-sm font-semibold text-gray-800 truncate">
              {script?.title || "反推脚本"}
            </div>

            {/* 脚本内容概要 */}
            {script?.summary && (
              <p className="mt-1.5 text-[11px] leading-[1.5] text-gray-500 line-clamp-2">
                {script.summary}
              </p>
            )}

            {/* 元信息行 */}
            {script && (
              <div className="mt-2 flex flex-wrap gap-2">
                {/* 镜头数 */}
                {segments.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                    <span className="material-icons-round text-[12px] text-[#c45a42]/60">filter_frames</span>
                    {segments.length} 镜
                  </span>
                )}
              </div>
            )}

            {/* 引导提示 */}
            <div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-[#e07a5f]/70">
              <span className="material-icons-round text-xs">touch_app</span>
              <span>点击查看脚本详情</span>
            </div>
          </div>
        </div>
      </ProjectFlowHistorySidebar>

      {/* 主内容区 */}
      <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <StepContentHeader
          stepNumber={3}
          title="脚本与分镜"
          icon="article"
          subtitle="脚本已就绪，确认选用后即可进入下一步。"
          badges={step3Locked ? (
            <span className="inline-flex items-center gap-1 text-amber-600">
              <span className="material-icons-round text-sm">lock</span>已锁定
            </span>
          ) : null}
        />

        {/* 滚动内容区 */}
        <div
          ref={scrollContainerRef}
          className={`custom-scrollbar min-h-0 flex-1 overflow-y-auto pt-6 px-6 md:px-10 ${FLOW_SAFE_BOTTOM_PADDING.step3Workspace}`}
        >
          <div className="max-w-7xl mx-auto space-y-8">
            {/* 脚本展示区 */}
            <div ref={scriptSectionRef}>
              {script ? (
                <Step3StructuredScriptCandidatesPanel
                  candidates={[script]}
                  selectedCandidateId={script.id}
                  isConfirmed={step3Locked}
                  isReverse={true}
                  onPickCandidate={() => {
                    // 反推项目不需要选择，已自动锁定
                  }}
                />
              ) : (
                <div className="flex items-center justify-center py-20 text-gray-400">
                  暂无脚本
                </div>
              )}
            </div>

            {/* 分界线 */}
            <div className="py-4">
              <div className="relative flex items-center gap-4">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-orange-300 to-transparent"></div>
                <div className="flex items-center gap-2.5 px-5 py-2 rounded-full bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200/60 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span>
                  <span className="text-sm font-bold text-orange-600 tracking-wider">以下是分镜</span>
                  <span className="material-icons-round text-sm text-orange-400">movie_creation</span>
                </div>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-orange-300 to-transparent"></div>
              </div>
            </div>

            {/* 分镜编辑区 */}
            <div ref={storyboardSectionRef} className="space-y-3">
              {segments.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  {segments.map((segment, index) => {
                    // 该帧是否有预览图
                    const hasImage = Boolean(frameImageUrls[index + 1] || segment.sceneImageUrl);
                    // 批量生成运行中且该帧无图时，或单帧生成中，显示生成中状态
                    const isFrameGenerating = (step3BatchState.running && !hasImage) || singleFrameGenerating.has(index + 1);
                    // 生成开始时间：批量生成时使用 batchStartAtRef，单帧重试时使用 singleFrameStartAtRef
                    const frameGenerationStartedAt = isFrameGenerating
                      ? (singleFrameGenerating.has(index + 1)
                        ? singleFrameStartAtRef.current[index + 1] ?? null
                        : batchStartAtRef.current)
                      : null;
                    // 该帧的错误信息（全局任务队列优先，其次从 DB 记录提取）
                    const frameErrorMessage = frameErrorMessages[index + 1] ?? frameDbErrorMessages[index + 1] ?? null;
                    return (
                      <ReverseStoryboardCard
                        key={index}
                        segment={segment}
                        index={index}
                        imageUrl={frameImageUrls[index + 1]}
                        isGenerating={isFrameGenerating}
                        generationStartedAt={frameGenerationStartedAt}
                        onGenerateOrRetry={() => handleSingleFrameRetry(index + 1)}
                        retryCreditCost={step3SinglePreviewCreditCost}
                        isBatchBusy={step3BatchState.running}
                        candidateImageUrls={frameCandidatesByIndex[index + 1] ?? []}
                        onSelectCandidateImage={(imageUrl) => handleSelectCandidateImage(index + 1, imageUrl)}
                        errorMessage={frameErrorMessage}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center py-20 text-gray-400">
                  暂无分镜数据
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 底部工具栏 */}
      <Step3GlobalControlBar
        savedLabel={script ? "已保存" : "尚未保存"}
        ratio="9:16"
        resolution="720p"
        threadCount={2}
        batchState={step3BatchState}
        batchDisabled={step3BatchControlsModel.batchGenerateDisabled}
        batchCreditCost={step3BatchControlsModel.creditCost}
        batchHoverTitle={step3BatchControlsModel.hoverTitle}
        nextCreditCost={step3EnterStep4CreditCost}
        nextHoverTitle={step3BatchControlsModel.nextHoverTitle}
        nextDisabled={step3Locked ? false : step3BatchControlsModel.nextDisabled}
        pendingCount={step3BatchControlsModel.pendingCount}
        projectStatus={projectData.projectStatus ?? undefined}
        isConfirmingLock={step3BatchConfirming}
        isPromptGenerating={false}
        isScriptLoading={isRewriting && !script}
        creditPricingLoaded={creditPricingLoaded}
        onBack={() => {
          const pid = projectData.projectId ?? urlProjectId;
          navigate(`/create/${pid}/step2`);
        }}
        onRatioChange={() => {
          // 反推项目暂不支持
        }}
        onResolutionChange={() => {
          // 反推项目暂不支持
        }}
        onThreadCountChange={() => {
          // 反推项目暂不支持
        }}
        onBatchAction={(action) => {
          void handleStep3BatchAction(action);
        }}
        onNext={() => void handleNextStep()}
      />

      {/* 图片放大预览弹窗 */}
      <ImageLightbox
        open={imagePreview !== null}
        url={imagePreview?.imageUrl ?? ""}
        alt={imagePreview?.label ?? "图片预览"}
        label={imagePreview?.label}
        onClose={() => setImagePreview(null)}
      />
    </div>
  );
};