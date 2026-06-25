import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from 'react-router';
import { Button } from "../../components/ui/Button";
import { StepContentHeader } from "../../components/project-flow";
import { isStatusBeyond, isVideoStatusAtOrBeyond, type VideoProjectStatus } from "../../../../src/contracts/types";
import { useAppStore, type GlobalTaskItem } from "../../store/useAppStore";
import { useShallow } from 'zustand/react/shallow';
import { useProjectState } from "../../hooks/useProjectState";
import { GlobalTaskType, TaskStatus } from "../../components/layout/taskQueueConfig";
// 反推项目使用独立组件
import { ReverseScriptEditor } from "./ReverseScriptEditor";
import { ApiError, backendApi, type Step3CandidateSnapshotDto } from "../../services/backendApi";
import { useToast } from "../../components/ui/Toast";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { FLOW_SAFE_BOTTOM_PADDING } from "./safeBottomPadding";
import { buildStep1RolePresetPanelCompactLines } from "../../../../src/modules/step1-role-preset-panel-compact-render";
import { sanitizeStep3SegmentsForWorkflowTransition } from "./step3WorkflowSyncSanitizer";
import { buildFullScriptDraftFromSegments, resolveSharedFullScriptDraft } from "./step3FullScriptDraft";
import type { Step3ImportedStoryboardPayload } from "../../../../src/contracts/reverse-storyboard-report";
import { hydrateImportedStoryboardSegments } from "./step3ImportedStoryboard";
import {
  buildScriptCandidateViewModelsFromSnapshot,
  buildStep3ScriptClueTitle,
  type ScriptCandidateViewModel,
  type Step3ScriptStrategyType,
} from "./step3ScriptCandidatesController";
import type { AtmosphereSceneCategory } from "@shared/style-atmosphere-dict";
import { sanitizeStep3ImportedFullScript } from "./step3ScriptImportSanitizer";
import { Step3StructuredScriptCandidatesPanel } from "./step3StructuredScriptCandidatesPanel";
import { buildStep3StructuredScriptCardViewModel } from "./step3StructuredScriptCardViewModel";
import { buildStep3StoryboardCardViewModel } from "./step3StoryboardCardAdapter";
import { Step3CompactStoryboardCard } from "./step3CompactStoryboardCard";
import { normalizeStep4PreviewRatio, normalizeStep4PreviewResolution } from "./step4GenerationSettings";
import { Step3GlobalControlBar } from "./step3-workspace/step3GlobalControlBar";
import {
  useStep3ScriptJobs,
} from "./step3-workspace/useStep3ScriptJobs";
import {
  normalizeStep3BatchThreadCount,
  createIdleStep3BatchGenerationState,
  type Step3BatchGenerationViewState,
} from "./step3-workspace/step3BatchGenerationController";
import {
  normalizeStep3FrameOverrideState,
  resolveStep3FrameOverrideViewModel,
} from "./step3-workspace/step3FrameOverrideController";
import {
  buildStep3PreviewCardViewModel,
} from "./step3-workspace/step3PreviewCardRuntime";
import { ImageLightbox } from "../../components/shared/ImageLightbox";
import {
  DEFAULT_PROJECT_FLOW_CREDIT_PRICING,
  loadProjectFlowCreditPricing,
} from "./projectFlowCredit";
import { useStep3MaskEditorBridge } from "./step3-workspace/step3MaskEditorBridge";
import { buildStep3Step4HandoffProjectDataPatch } from "./step4-video-workspace/step4Step3HandoffContract";
import { buildStep3BatchGenerationControlsModel, collectStep3BatchLockedFrameIndexes } from "./step3-workspace/step3BatchGenerationControls";
import {
  createDefaultCharacterWorkflowSystemSettings,
  type CharacterWorkflowSystemSettings,
} from "../../../../src/contracts/character-workflow-system-settings";
import { buildStep2OutfitReferenceItems } from "./step2OutfitReference";
import { resolveRoleDirectionAvatarRenderModel } from "./step1RoleDirectionAvatarController";
import { normalizeStep3CharacterReferencePool, type Step3CharacterReferenceItem } from "../../utils/step3CharacterReferencePool";
import type { ScriptCandidateEntity } from "../../../../src/contracts/step3-candidate-snapshot-contract";
import {
  ProjectFlowHistorySidebar,
} from "../../components/project-flow";

// 导入拆分的类型和工具函数
import type {
  ScriptSegment,
  Step3StoryboardCueScriptSource,
  PersistScriptOptions,
  Step3PreviewJobRecord,
  Step3PreviewJobStatus,
} from "./script-editor/types";
import {
  mergeTextToSegments,
  applyStep3MainPromptToSegment,
  resolveStep3SegmentsFromCandidate,
  buildStep3ImportedStoryboardCandidate,
  mergeStep3CandidateFeed,
  normalizeStep3PreviewCandidateUrls,
  normalizePersistedStep3PreviewCandidatesByFrame,
  normalizePersistedStep3PreviewJobsByFrame,
  serializeStep3PreviewJobsByFrameForProjectData,
  serializeStep3PreviewCandidatesByFrameForProjectData,
  resolveStep3SaveTitle,
  shouldSyncVideoCueOnFirstMainPromptFill,
} from "./script-editor/utils";

const FullScriptModal: React.FC<{
  isOpen: boolean;
  value: string;
  isSaving: boolean;
  onChange: (text: string) => void;
  onClose: () => void;
  onSave: () => boolean;
}> = ({ isOpen, value, isSaving, onChange, onClose, onSave }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden relative border border-gray-200">
        <div className="h-16 border-b border-gray-100 flex items-center justify-between px-6 bg-gray-50/50 shrink-0">
          <h2 className="text-lg font-bold text-gray-900 font-display">分镜内容编辑</h2>
          <button onClick={onClose} className="hover:bg-gray-200 p-2 rounded-full transition-colors text-gray-500">
            <span className="material-icons-round">close</span>
          </button>
        </div>
        <div className="flex-1 w-full p-8 overflow-y-auto relative bg-white">
          <textarea
            data-testid="step3-full-script-modal-textarea"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="w-full h-full resize-none outline-none text-lg leading-loose text-gray-800 placeholder-gray-300 font-sans pb-20 custom-scrollbar"
            placeholder="在此处输入完整的视频脚本..."
          />
          <div className="absolute bottom-6 right-6 left-6 flex justify-end items-center pointer-events-none">
            <div className="flex gap-3 pointer-events-auto">
              <Button
                onClick={() => {
                  if (onSave()) {
                    onClose();
                  }
                }}
                isLoading={isSaving}
                className="shadow-xl"
              >
                完成编辑
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ScriptEditor: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId: urlProjectId } = useParams<{ projectId: string }>();
  const { token, currentUser, showGlobalLoading, hideGlobalLoading } = useAppStore(useShallow((state) => ({ token: state.token, currentUser: state.currentUser, showGlobalLoading: state.showGlobalLoading, hideGlobalLoading: state.hideGlobalLoading })));
  const toast = useToast();
  const {
    projectData,
    workflow,
    isInitialLoading,
    updateProjectData,
    setPreviewCandidatesByFrame: persistPreviewCandidatesByFrame,
    setPreviewJobsByFrame: persistPreviewJobsByFrame,
    setStoryboardCueScriptSource,
    setPendingStoryboardImport,
    setPendingReverseDeckScript,
    setRewrittenScriptSegments,
    setPreviewRatio,
    setPreviewResolution,
    setPreviewSharpness,
    setFrameOverrideSettings,
    clearPendingImportState,
    setPendingStoryboardImportAndClear,
    setStep4HandoffData,
  } = useProjectState(urlProjectId);

  // 路由分发：反推项目使用独立组件
  if (projectData.projectKind === "reverse") {
    return <ReverseScriptEditor />;
  }

  // 确认弹窗（全局 Provider）
  const { confirm } = useConfirm();

  const [segments, setSegments] = useState<ScriptSegment[]>([]);
  const [fullScriptDraft, setFullScriptDraft] = useState<string>("");
  const [showFullScript, setShowFullScript] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  // 帧级别错误信息（从全局任务队列的失败帧提取）
  const [frameErrors, setFrameErrors] = useState<Record<number, string>>({});
  const [step3GuardToast, setStep3GuardToast] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingCandidate, setIsConfirmingCandidate] = useState(false);
  const [isConfirmingLockLoading, setIsConfirmingLockLoading] = useState(false);
  const [isRefreshingCandidates, setIsRefreshingCandidates] = useState(false);
  const [isStep3LocalLocked, setIsStep3LocalLocked] = useState(false);
  const [isUnlockingCandidate, setIsUnlockingCandidate] = useState(false);
  // 刷新推荐时，是否需要清空选中状态（全局无镜像图片时为 true）
  const refreshShouldClearSelectionRef = useRef(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [importedStoryboardCandidate, setImportedStoryboardCandidate] = useState<ScriptCandidateViewModel | null>(null);
  const [step3CandidateFeed, setStep3CandidateFeed] = useState<ScriptCandidateViewModel[]>([]);
  // 远端加载的已确认脚本（当 projectData.activeScriptId 存在时）
  const [confirmedScriptFromApi, setConfirmedScriptFromApi] = useState<ScriptCandidateViewModel | null>(null);
  const [loadingConfirmedScript, setLoadingConfirmedScript] = useState(false);
  const [isPreFetchingScripts, setIsPreFetchingScripts] = useState(false);
  const currentProjectIdRef = useRef<string | null>(null);
  const [step3StoryboardCueScriptSource, setStep3StoryboardCueScriptSource] =
    useState<Step3StoryboardCueScriptSource>(
      workflow.videoStoryboardCueScriptSource === "user_uploaded" ? "user_uploaded" : "other",
    );

  // ========== Step3 预览数据：直接使用 workflow（单一数据源）==========
  // 用 useMemo 缓存规范化后的数据，避免每次渲染重新计算
  const previewJobsByFrame = useMemo(
    () => normalizePersistedStep3PreviewJobsByFrame(workflow.videoPreviewJobsByFrame),
    [workflow.videoPreviewJobsByFrame],
  );
  const previewCandidatesByFrame = useMemo(
    () => normalizePersistedStep3PreviewCandidatesByFrame(workflow.videoPreviewCandidatesByFrame),
    [workflow.videoPreviewCandidatesByFrame],
  );

  // 用 ref 存储最新值，供函数式更新使用
  const previewJobsByFrameRef = useRef(previewJobsByFrame);
  const previewCandidatesByFrameRef = useRef(previewCandidatesByFrame);
  previewJobsByFrameRef.current = previewJobsByFrame;
  previewCandidatesByFrameRef.current = previewCandidatesByFrame;

  // 包装函数：支持函数式更新 ((prev) => next) 和直接赋值 (next)
  const updatePreviewJobsByFrame = useCallback(
    (updater: Record<number, Step3PreviewJobRecord> | ((prev: Record<number, Step3PreviewJobRecord>) => Record<number, Step3PreviewJobRecord>)) => {
      const nextValue = typeof updater === "function" ? updater(previewJobsByFrameRef.current) : updater;
      persistPreviewJobsByFrame(serializeStep3PreviewJobsByFrameForProjectData(nextValue));
    },
    [persistPreviewJobsByFrame],
  );
  const updatePreviewCandidatesByFrame = useCallback(
    (updater: Record<number, string[]> | ((prev: Record<number, string[]>) => Record<number, string[]>)) => {
      const nextValue = typeof updater === "function" ? updater(previewCandidatesByFrameRef.current) : updater;
      persistPreviewCandidatesByFrame(serializeStep3PreviewCandidatesByFrameForProjectData(nextValue));
    },
    [persistPreviewCandidatesByFrame],
  );
  // 手动触发的即时 loading 帧（成功启动后等全局队列轮询接管，失败/未启动时清除）
  const [manualLoadingFrames, setManualLoadingFrames] = useState<Set<number>>(new Set());
  const [previewGenerationLoading, setPreviewGenerationLoading] = useState<Record<string | number, boolean>>({});
  // 从 API 获取的选中图片 URL（需要在 segments 恢复后合并）
  const [frameSelectedImageByUrl, setFrameSelectedImageByUrl] = useState<Record<number, string>>({});
  // 记录哪些帧在 nrm_step3_frame_images 表中有记录（用于显示预览区域）
  const [frameDbRecords, setFrameDbRecords] = useState<Set<number>>(new Set());
  const [sceneReinforceLoading] = useState<Record<string | number, boolean>>({});
  const [saveClueTitleHint, setSaveClueTitleHint] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<{ imageUrl: string; label: string } | null>(null);
  const [activePreviewFrameIndex, setActivePreviewFrameIndex] = useState(0);
  const [step3BatchThreadCount, setStep3BatchThreadCount] = useState(2);
  const [step3BatchState, setStep3BatchState] = useState<Step3BatchGenerationViewState>(() =>
    createIdleStep3BatchGenerationState(2),
  );
  /** 批量生图确认中状态（弹窗确认期间） */
  const [step3BatchConfirming, setStep3BatchConfirming] = useState(false);
  /** 阶段0（专业提示词生成）是否正在进行 */
  const [isPromptGenerating, setIsPromptGenerating] = useState(false);
  const [creditPricing, setCreditPricing] = useState(DEFAULT_PROJECT_FLOW_CREDIT_PRICING);
  const [creditPricingLoaded, setCreditPricingLoaded] = useState(false);
  /** 从数据库获取的项目真实状态，用于判断步骤锁定 */

  const [, setCharacterWorkflowSettings] = useState<CharacterWorkflowSystemSettings>(
    createDefaultCharacterWorkflowSystemSettings(),
  );
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const hydratedScriptRef = useRef(false);
  const resumedScriptHydratedRef = useRef(false);
  /** 防止并发点击选择候选脚本 */
  const pickCandidateLockRef = useRef(false);
  /** 锁定状态下已回灌标记，防止重复触发 */
  const lockedRewriteDoneRef = useRef(false);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastPersistedDraftRef = useRef<string>("");
  const segmentsRef = useRef<ScriptSegment[]>(segments);
  const tokenRef = useRef<string | null>(token);
  const workflowRef = useRef(workflow);
  const saveClueTitleHintRef = useRef<string | null>(saveClueTitleHint);
  const step3BatchGeneratingRef = useRef(false);
  const previewJobUnmountedRef = useRef(false);
  const step3GuardToastTimerRef = useRef<number | null>(null);
  const step3GuardToastScrollTimerRef = useRef<number | null>(null);
  const step3StoryboardSectionRef = useRef<HTMLDivElement | null>(null);
  const step3ScriptSectionRef = useRef<HTMLDivElement | null>(null);
  const step3SidebarCardRef = useRef<HTMLDivElement | null>(null);
  const step3GuardToastAnchorRef = useRef<HTMLDivElement | null>(null);
  const step4BatchRatio = normalizeStep4PreviewRatio(workflow.videoPreviewRatio);
  const step4BatchResolution = normalizeStep4PreviewResolution(workflow.videoPreviewResolution);
  const step3SinglePreviewCreditCost = Math.max(0, creditPricing.singleImageCreditCost);
  const step3InitialVideoGenerateCreditCharged = workflow.videoInitialVideoGenerateCreditCharged === true;
  const hasStep4GeneratedClip = useMemo(() => {
    const clipStatuses = Array.isArray(workflow.videoClipStatuses) ? workflow.videoClipStatuses : [];
    return clipStatuses.some((item) => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const status = (item as { status?: unknown }).status;
      return status === "generating" || status === "completed";
    });
  }, [workflow.videoClipStatuses]);
  const hasStep4MergedOutput = typeof projectData.exportUrl === "string" && projectData.exportUrl.trim().length > 0;
  // Step3 回访锁定：项目已推进到 FILMING 及之后状态，Step3 只读
  // 步骤锁定：状态 > STORYBOARD_PREVIEW_COMPLETED 即 FILMING 及之后，Step3 只读
  const step3Locked = isStatusBeyond(
    projectData.projectStatus as VideoProjectStatus | undefined,
    "STORYBOARD_PREVIEW_COMPLETED",
  );
  // 分镜预览已完成：状态为 STORYBOARD_PREVIEW_COMPLETED
  const storyboardPreviewCompleted = projectData.projectStatus === "STORYBOARD_PREVIEW_COMPLETED";
  const shouldChargeForFirstStep4VideoGeneration =
    storyboardPreviewCompleted && !step3InitialVideoGenerateCreditCharged && !hasStep4GeneratedClip && !hasStep4MergedOutput;
  const step3EnterStep4CreditCost = shouldChargeForFirstStep4VideoGeneration
    ? Math.max(0, segments.length * creditPricing.singleVideoCreditCost)
    : 0;
  const step3BatchLockedFrameIndexes = useMemo(
    () =>
      collectStep3BatchLockedFrameIndexes({
        sceneReinforceLoading,
        previewGenerationLoading,
      }),
    [sceneReinforceLoading, previewGenerationLoading],
  );
  const step3FrameOverrideSettings = normalizeStep3FrameOverrideState(workflow.videoFrameOverrideSettings);
  const boundedActivePreviewFrameIndex = segments.length > 0 ? Math.min(activePreviewFrameIndex, segments.length - 1) : 0;

  // 监听全局任务队列中的 step3_frame_preview 任务，更新 batchState 和帧图片
  const globalTaskQueue = useAppStore((s) => s.globalTaskQueue);
  useEffect(() => {
    // 确保 ref 与当前 render 的 segments 同步（ref sync effect 在本 effect 之后执行）
    segmentsRef.current = segments;
    const effectiveProjectId = urlProjectId || projectData.projectId;
    if (!effectiveProjectId) return;

    const frameJobs = globalTaskQueue.filter(
      (t) => t.projectId === effectiveProjectId && t.type === GlobalTaskType.STEP3_FRAME_PREVIEW,
    );
    const batchJobs = globalTaskQueue.filter(
      (t) => t.projectId === effectiveProjectId && t.type === GlobalTaskType.STEP3_BATCH_PREVIEW,
    );

    const runningBatch = batchJobs.find((t) => t.status === TaskStatus.RUNNING || t.status === TaskStatus.PENDING);
    // 检查最近失败的批量任务（用于处理父任务失败的情况）
    const failedBatch = batchJobs.find((t) => t.status === TaskStatus.FAILED);
    const hasActiveBatch = runningBatch != null;

    // 判断阶段0（专业提示词生成）是否正在进行
    // 双重判断：父任务 stage === "生成提示词中" + step3_shot_prompt 子任务存在性
    const promptGenerating = hasActiveBatch
      && (
        runningBatch?.stage === "生成提示词中"
        || globalTaskQueue.some(
          (t) => t.projectId === effectiveProjectId
            && t.type === GlobalTaskType.STEP3_SHOT_PROMPT
            && (t.status === TaskStatus.RUNNING || t.status === TaskStatus.PENDING),
        )
      );

    // 没有活跃批量任务且没有帧任务时返回
    // 但如果有失败的批量任务，需要继续处理（将所有相关帧标记为失败）
    if (!hasActiveBatch && frameJobs.length === 0 && !failedBatch) return;

    // 只统计当前批次创建时间之后的帧任务，排除历史批次残留
    // 没有活跃批量任务时，忽略 orphaned pending 帧任务（父任务已结束但子帧卡在 pending）
    const batchCreatedAt = runningBatch?.createdAt ?? failedBatch?.createdAt ?? 0;
    const currentFrameJobs = hasActiveBatch
      ? frameJobs.filter((t) => (t.createdAt ?? 0) >= batchCreatedAt)
      : frameJobs.filter((t) => t.status === TaskStatus.COMPLETED || t.status === TaskStatus.FAILED);

    // 如果父任务失败，将所有 pending/running 的子帧任务视为失败
    const effectiveFrameJobs = failedBatch && !hasActiveBatch
      ? currentFrameJobs.map((job) => {
          if (job.status === TaskStatus.PENDING || job.status === TaskStatus.RUNNING) {
            return {
              ...job,
              status: "failed" as const,
              error: failedBatch.error ?? { message: "批量任务失败" },
            };
          }
          return job;
        })
      : currentFrameJobs;

    const completedCount = effectiveFrameJobs.filter((t) => t.status === TaskStatus.COMPLETED).length;
    const failedCount = effectiveFrameJobs.filter((t) => t.status === TaskStatus.FAILED).length;
    // 优先使用后端批量任务返回的 totalFrames，回退到当前批次的帧任务数
    const totalFromBatch = (runningBatch?.result as Record<string, unknown> | null)?.totalFrames as number
      ?? (failedBatch?.result as Record<string, unknown> | null)?.totalFrames as number
      ?? effectiveFrameJobs.length;

    // 更新 batchState
    const normalizedThreadCount = normalizeStep3BatchThreadCount(step3BatchThreadCount);
    setStep3BatchState({
      running: hasActiveBatch,
      active: effectiveFrameJobs.filter((t) => t.status === TaskStatus.RUNNING).length,
      queued: effectiveFrameJobs.filter((t) => t.status === TaskStatus.PENDING).length,
      completedCount,
      failedCount,
      targetCount: totalFromBatch,
      threadCount: normalizedThreadCount,
      requestedStop: runningBatch?.stage === "stopping",
    });
    setIsPromptGenerating(promptGenerating);

    // 将完成的帧图片应用到 segments 和 previewCandidates；失败帧记录错误
    // 同一帧可能有多个 completed 任务（批量生成 + 重试），只应用最新的那个
    const latestCompletedByFrame = new Map<number, { job: GlobalTaskItem; result: { frameIndex?: number; candidates?: string[] } }>();
    for (const job of effectiveFrameJobs) {
      if (job.status === TaskStatus.COMPLETED && job.result) {
        const result = job.result as { frameIndex?: number; candidates?: string[] };
        if (result.frameIndex && result.candidates?.length) {
          const existing = latestCompletedByFrame.get(result.frameIndex);
          // 保留 updatedAt 更大的任务（重试任务的 updatedAt > 批量生成任务）
          if (!existing || (job.updatedAt ?? 0) > (existing.job.updatedAt ?? 0)) {
            latestCompletedByFrame.set(result.frameIndex, { job, result });
          }
        }
      }
    }

    // 累积所有帧的候选更新，最后一次性写入，避免循环内多次调用 updatePreviewCandidatesByFrame
    // 导致 ref 未刷新而被后续迭代覆盖的问题
    const candidatesPatch: Record<number, string[]> = {};
    const selectedImagePatch: Record<number, string> = {};
    const failedFrameMessages: string[] = [];
    for (const [frameIndex, { result }] of latestCompletedByFrame) {
      const idx = frameIndex - 1;
      const currentSegments = segmentsRef.current;
      if (idx >= 0 && idx < currentSegments.length && result.candidates?.[0]) {
        const primaryUrl = result.candidates[0];
        const nextSegments = currentSegments.map((s, i) =>
          i === idx ? { ...s, sceneImageUrl: primaryUrl } : s
        );
        segmentsRef.current = nextSegments;
        setSegments(nextSegments);
        selectedImagePatch[frameIndex] = primaryUrl;
        const existing = previewCandidatesByFrameRef.current[frameIndex] ?? [];
        const merged = [...existing];
        for (const url of result.candidates!) {
          if (!merged.includes(url)) merged.push(url);
        }
        console.log("[Step3] Frame", frameIndex, "merging candidates:", { existing, new: result.candidates!, merged });
        candidatesPatch[frameIndex] = merged;
      }
    }
    // 批量写入候选更新和选中图片
    if (Object.keys(candidatesPatch).length > 0) {
      console.log("[Step3] Applying candidates patch:", candidatesPatch);
      updatePreviewCandidatesByFrame((prev) => {
        const next = { ...prev, ...candidatesPatch };
        console.log("[Step3] previewCandidatesByFrame update:", { prevKeys: Object.keys(prev), patchKeys: Object.keys(candidatesPatch), nextKeys: Object.keys(next) });
        return next;
      });
    }
    if (Object.keys(selectedImagePatch).length > 0) {
      setFrameSelectedImageByUrl((prev) => ({ ...prev, ...selectedImagePatch }));
    }
    // 失败帧记录错误
    for (const job of effectiveFrameJobs) {
      if (job.status === TaskStatus.FAILED) {
        let fIdx: number | undefined;
        try {
          const parsed = job.input ? JSON.parse(typeof job.input === "string" ? job.input : "{}") : {};
          fIdx = parsed.frameIndex ?? parsed.frame_index;
        } catch { /* input 可能被后端截断，解析失败时忽略 */ }
        const errMsg = (job.error as Record<string, unknown> | null)?.message ?? "生成失败";
        failedFrameMessages.push(fIdx ? `镜头 ${fIdx}: ${String(errMsg)}` : String(errMsg));
      }
    }

    // 更新帧级别错误状态
    const newFrameErrors: Record<number, string> = {};
    for (const job of effectiveFrameJobs) {
      if (job.status === TaskStatus.FAILED) {
        let fIdx: number | undefined;
        try {
          const raw = typeof job.input === "string" ? job.input : "{}";
          // 后端 trimInput 可能截断 JSON 导致尾部有 "..."，尝试截断修复
          const cleanInput = raw.endsWith("...") ? raw.slice(0, raw.lastIndexOf("...")) : raw;
          const parsed = job.input ? JSON.parse(cleanInput || "{}") : {};
          fIdx = parsed.frameIndex ?? parsed.frame_index;
        } catch {
          // input 被严重截断无法解析，尝试从 job.id 提取帧索引
          const idMatch = job.id.match(/frame-(\d+)/);
          if (idMatch) fIdx = Number(idMatch[1]);
        }
        if (fIdx) {
          const msg = (job.error as Record<string, unknown> | null)?.message ?? "生成失败";
          newFrameErrors[fIdx] = String(msg);
        }
      }
    }
    setFrameErrors((prev) => {
      const keys1 = Object.keys(prev).sort();
      const keys2 = Object.keys(newFrameErrors).sort();
      if (keys1.length === keys2.length && keys1.every((k, i) => keys2[i] === k && prev[Number(k)] === newFrameErrors[Number(k)])) {
        return prev;
      }
      return newFrameErrors;
    });

    // 从全局队列更新 previewJobsByFrame，使 loading 状态能正确清除
    updatePreviewJobsByFrame((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const job of effectiveFrameJobs) {
        let frameIndex: number | undefined;
        try {
          const raw = typeof job.input === "string" ? job.input : "{}";
          const cleanInput = raw.endsWith("...") ? raw.slice(0, raw.lastIndexOf("...")) : raw;
          const parsed = job.input ? JSON.parse(cleanInput || "{}") : {};
          frameIndex = parsed.frameIndex ?? parsed.frame_index;
        } catch {
          const idMatch = job.id.match(/frame-(\d+)/);
          if (idMatch) frameIndex = Number(idMatch[1]);
        }
        if (!frameIndex) continue;

        const mappedStatus: Step3PreviewJobStatus =
          job.status === TaskStatus.COMPLETED ? "succeeded"
          : job.status === TaskStatus.FAILED ? "failed"
          : job.status === TaskStatus.EXPIRED ? "failed"
          : "running";

        const existing = next[frameIndex];
        // 只在状态变化时更新
        if (existing && existing.jobId === job.id && existing.status === mappedStatus) continue;

        const imageUrl =
          job.status === TaskStatus.COMPLETED && job.result
            ? (job.result as { candidates?: string[] }).candidates?.[0] ?? null
            : null;
        const errorMsg =
          job.status === TaskStatus.FAILED || job.status === TaskStatus.EXPIRED
            ? String((job.error as Record<string, unknown> | null)?.message ?? "生成失败")
            : null;

        next[frameIndex] = {
          jobId: job.id,
          status: mappedStatus,
          startedAt: job.createdAt ?? 0,
          updatedAt: job.updatedAt ?? 0,
          imageUrl,
          error: errorMsg,
        };
        changed = true;
      }
      return changed ? next : prev;
    });

    // 所有帧完成时更新 feedback（仅当本会话发起过批量任务时才提示，避免刷新后重复弹出）
    if (step3BatchGeneratingRef.current && !hasActiveBatch) {
      // 父任务失败但没有子帧任务时，直接显示父任务错误
      if (failedBatch && effectiveFrameJobs.length === 0) {
        const parentError = (failedBatch.error as Record<string, unknown> | null)?.message ?? "批量任务失败";
        setFeedback(`批量分镜预览失败：${String(parentError)}`);
        step3BatchGeneratingRef.current = false;
      } else if (effectiveFrameJobs.length > 0 && effectiveFrameJobs.every((t) => t.status === TaskStatus.COMPLETED || t.status === TaskStatus.FAILED)) {
        if (failedCount === 0) {
          setFeedback(`批量分镜预览完成（全部 ${completedCount} 帧生成成功）。`);
          // 刷新项目状态（后端可能已更新为 STORYBOARD_PREVIEW_COMPLETED）
          if (token && urlProjectId) {
            backendApi.getProject(token, urlProjectId).then((project) => {
              if (project && typeof project.status === "string") {
                updateProjectData({ projectStatus: project.status });
              }
            }).catch(() => {});
          }
        } else {
          const details = failedFrameMessages.length > 0 ? `\n${failedFrameMessages.join("\n")}` : "";
          setFeedback(`批量分镜预览完成（成功 ${completedCount}，失败 ${failedCount}）。${details}`);
        }
        step3BatchGeneratingRef.current = false;
      }
    }
  }, [globalTaskQueue, urlProjectId, projectData.projectId, step3BatchThreadCount, segments.length]);

  // 从数据库获取项目真实状态，回写到 store（与其他 Step 一致，避免平行 state）
  // 只依赖 urlProjectId（路由参数），避免 projectData 更新触发循环
  useEffect(() => {
    if (!urlProjectId || !token) return;
    backendApi
      .getProject(token, urlProjectId)
      .then((project) => {
        if (project && typeof project.status === "string") {
          updateProjectData({ projectStatus: project.status });
        }
        if (project && project.selectedRoleDirection) {
          updateProjectData({ selectedRoleDirection: project.selectedRoleDirection });
        }
      })
      .catch((err) => {
        console.error("[ScriptEditor] Failed to fetch project status:", err);
      });
  }, [urlProjectId, token]);

  // 批量生成控制模型
  const step3BatchControlsModel = useMemo(
    () =>
      buildStep3BatchGenerationControlsModel({
        segments,
        batchState: step3BatchState,
        lockedFrameIndexes: step3BatchLockedFrameIndexes,
        unitCreditCost: step3SinglePreviewCreditCost,
        nextLabel: !step3Locked && shouldChargeForFirstStep4VideoGeneration ? "视频生成" : "下一步",
        nextCreditCost: step3EnterStep4CreditCost,
        isConfirmingLock: step3BatchConfirming,
      }),
    [
      segments,
      step3BatchState,
      step3BatchLockedFrameIndexes,
      step3SinglePreviewCreditCost,
      shouldChargeForFirstStep4VideoGeneration,
      step3EnterStep4CreditCost,
      step3BatchConfirming,
    ],
  );

  // 从 previewJobsByFrame 计算 loading 状态
  useEffect(() => {
    const previewJobEntries = Object.entries(previewJobsByFrame) as Array<[string, Step3PreviewJobRecord]>;
    const nextLoading = Object.fromEntries(
      previewJobEntries
        .filter(([, job]) => job.status === TaskStatus.RUNNING)
        .map(([frameIndex]) => [Number(frameIndex), true]),
    ) as Record<string | number, boolean>;

    // 从全局队列补充 running 帧（刷新后 previewJobsByFrame 可能还未同步）
    const effectiveProjectId = urlProjectId || projectData.projectId;
    if (effectiveProjectId) {
      const runningFromQueue = globalTaskQueue.filter(
        (t) => t.projectId === effectiveProjectId
          && t.type === GlobalTaskType.STEP3_FRAME_PREVIEW
          && (t.status === TaskStatus.RUNNING || t.status === TaskStatus.PENDING),
      );
      for (const job of runningFromQueue) {
        let frameIndex: number | undefined;
        try {
          const raw = typeof job.input === "string" ? job.input : "{}";
          const cleanInput = raw.endsWith("...") ? raw.slice(0, raw.lastIndexOf("...")) : raw;
          const parsed = job.input ? JSON.parse(cleanInput || "{}") : {};
          frameIndex = parsed.frameIndex ?? parsed.frame_index;
        } catch {
          const idMatch = job.id.match(/frame-(\d+)/);
          if (idMatch) frameIndex = Number(idMatch[1]);
        }
        if (frameIndex) {
          nextLoading[frameIndex] = true;
        }
      }
    }

    // 自动清除已发现终态的手动 loading 帧
    const settledFrames = new Set<number>();
    for (const [fiStr, job] of previewJobEntries) {
      const fi = Number(fiStr);
      if (job.status === "succeeded" || job.status === "failed") {
        settledFrames.add(fi);
      }
    }
    if (settledFrames.size > 0 && manualLoadingFrames.size > 0) {
      const remaining = new Set([...manualLoadingFrames].filter((fi) => !settledFrames.has(fi)));
      if (remaining.size !== manualLoadingFrames.size) {
        setManualLoadingFrames(remaining);
        return; // state 变化会触发下一次 useEffect
      }
    }

    // 保留仍在等待的手动 loading 帧
    for (const fi of manualLoadingFrames) {
      nextLoading[fi] = true;
    }
    setPreviewGenerationLoading((current) => {
      const currentKeys = Object.keys(current);
      const nextKeys = Object.keys(nextLoading);
      if (
        currentKeys.length === nextKeys.length &&
        currentKeys.every((key) => current[Number(key)] === nextLoading[Number(key)])
      ) {
        return current;
      }
      return nextLoading;
    });
  }, [previewJobsByFrame, manualLoadingFrames, globalTaskQueue, urlProjectId, projectData.projectId]);

  const step3MaskEditorBridge = useStep3MaskEditorBridge({
    segments,
    activePreviewFrameIndex: boundedActivePreviewFrameIndex,
    overrideStateInput: workflow.videoFrameOverrideSettings,
    onUpdateOverrideState: (nextState) => setFrameOverrideSettings(nextState),
    onFeedback: setFeedback,
  });
  const showStep3GuardToast = useCallback((message: string, options?: { scrollToStoryboard?: boolean }) => {
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }
    setStep3GuardToast(trimmed);
    if (step3GuardToastTimerRef.current !== null) {
      window.clearTimeout(step3GuardToastTimerRef.current);
    }
    if (step3GuardToastScrollTimerRef.current !== null) {
      window.clearTimeout(step3GuardToastScrollTimerRef.current);
    }
    if (options?.scrollToStoryboard) {
      step3GuardToastScrollTimerRef.current = window.setTimeout(() => {
        (step3GuardToastAnchorRef.current ?? step3StoryboardSectionRef.current)?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        step3GuardToastScrollTimerRef.current = null;
      }, 1000);
    }
    step3GuardToastTimerRef.current = window.setTimeout(() => {
      setStep3GuardToast(null);
      step3GuardToastTimerRef.current = null;
    }, 5000);
  }, []);
  useEffect(
    () => () => {
      if (step3GuardToastTimerRef.current !== null) {
        window.clearTimeout(step3GuardToastTimerRef.current);
        step3GuardToastTimerRef.current = null;
      }
      if (step3GuardToastScrollTimerRef.current !== null) {
        window.clearTimeout(step3GuardToastScrollTimerRef.current);
        step3GuardToastScrollTimerRef.current = null;
      }
    },
    [],
  );
  // 直接从 projectData.selectedRoleDirection 获取角色方向
  const step1SelectedRoleDirection = useMemo(() => {
    const rd = projectData.selectedRoleDirection as Record<string, unknown> | undefined;
    if (!rd) {
      return undefined;
    }
    return {
      directionId: rd.directionId as string,
      title: rd.title as string,
      styleSummary: rd.styleSummary as string,
      portraitUrl: (rd.portraitUrl as string | null) ?? null,
      confidence: rd.confidence as number,
      ethnicityOrRegion: rd.ethnicityOrRegion as string | null,
      gender: rd.gender as "male" | "female" | "unknown" | null,
      age: rd.age as number | null,
      styleWords: Array.isArray(rd.styleWords) ? rd.styleWords as string[] : null,
    };
  }, [projectData.selectedRoleDirection]);

  const step3SelectedRoleDirectionCompactLines = useMemo(
    () => (step1SelectedRoleDirection ? buildStep1RolePresetPanelCompactLines(step1SelectedRoleDirection) : []),
    [step1SelectedRoleDirection],
  );

  // 角色预设头像
  const step3SelectedRoleDirectionAvatar = useMemo(() => {
    if (!step1SelectedRoleDirection) {
      return null;
    }
    return resolveRoleDirectionAvatarRenderModel(
      0, // 索引始终为 0，因为只有一个选中的角色方向
      step1SelectedRoleDirection.gender,
      step1SelectedRoleDirection.portraitUrl,
    );
  }, [step1SelectedRoleDirection]);

  // 服装参考图
  const step3OutfitReferenceItems = useMemo(
    () => buildStep2OutfitReferenceItems(workflow.videoGarmentModules as Parameters<typeof buildStep2OutfitReferenceItems>[0]),
    [workflow.videoGarmentModules],
  );

  // 服装描述文本（用于 shot_prompts 生成，保持角色与服装一致性）
  const step3OutfitDescription = useMemo(() => {
    const generatedOutfits = Array.isArray(workflow.videoOutfitPlans) ? workflow.videoOutfitPlans : [];
    const selectedOutfitId = workflow.videoSelectedOutfitId;
    const selectedOutfit = selectedOutfitId
      ? generatedOutfits.find((item) => String(item.id) === String(selectedOutfitId)) ?? null
      : null;
    const parts: string[] = [];
    // 搭配方案标题和理由
    if (selectedOutfit?.title?.trim()) {
      parts.push(selectedOutfit.title.trim());
    }
    if (selectedOutfit?.reason?.trim()) {
      parts.push(selectedOutfit.reason.trim());
    }
    return parts.length > 0 ? parts.join("；") : undefined;
  }, [workflow.videoOutfitPlans, workflow.videoSelectedOutfitId]);

  // 角色参考图：从 Step2 定妆结果获取
  const step3CharacterReferenceItems = useMemo<Step3CharacterReferenceItem[]>(() => {
    const selectedCharacterId = workflow.videoSelectedCharacterId as string | null;
    const generatedCharacters = (workflow.videoProjectGeneratedCharacters as Array<{
      libraryCharacterId?: string;
      isSelected?: boolean;
      character?: {
        fiveViewOssImageUrl?: string | null;
        name?: string;
        thumbnailUrl?: string;
      };
    }>) ?? [];
    const libraryCharacters = (workflow.videoProjectLibraryCharacters as Array<{
      libraryCharacterId?: string;
      isSelected?: boolean;
      character?: {
        fiveViewOssImageUrl?: string | null;
        name?: string;
        thumbnailUrl?: string;
      };
    }>) ?? [];
    const allCharacters = [...generatedCharacters, ...libraryCharacters];
    // 优先用 selectedCharacterId 匹配，其次用 isSelected，最后回退到第一个
    const selectedCharacter = selectedCharacterId
      ? allCharacters.find((c) => c.libraryCharacterId === selectedCharacterId)
      : allCharacters.find((c) => c.isSelected) || generatedCharacters[0] || libraryCharacters[0];

    if (!selectedCharacter?.character) {
      return [];
    }

    // 构建角色参考项
    const refs: Array<{ id?: string; label?: string; imageUrl?: string }> = [];
    if (selectedCharacter.character.fiveViewOssImageUrl) {
      refs.push({
        id: "five-view",
        label: selectedCharacter.character.name || "角色五视图",
        imageUrl: selectedCharacter.character.fiveViewOssImageUrl,
      });
    }
    if (selectedCharacter.character.thumbnailUrl) {
      refs.push({
        id: "thumbnail",
        label: selectedCharacter.character.name || "角色参考图",
        imageUrl: selectedCharacter.character.thumbnailUrl,
      });
    }
    return normalizeStep3CharacterReferencePool(refs);
  }, [workflow.videoSelectedCharacterId, workflow.videoProjectGeneratedCharacters, workflow.videoProjectLibraryCharacters]);

  // 角色五视图展开状态

  const isAdmin = currentUser?.role === "admin";
  // SSE 流式加载 Step3 脚本候选
  const {
    selectedScriptId: sseSelectedScriptId,
    confirmedScriptId: sseConfirmedScriptId,
    setConfirmedScriptId: setSseConfirmedScriptId,
    availableItems: sseAvailableItems,
    loadingState: sseLoadingState,
    isLoading: sseIsLoading,
    triggerScriptGeneration: sseTriggerScriptGeneration,
    retryType: sseRetryType,
    availableStrategies: sseAvailableStrategies,
  } = useStep3ScriptJobs(projectData.projectId, token, {
    // 单个 job 完成时立即显示候选（渐进式）
    onJobTypeDone: (type, _job) => {
      // 即使 resultScriptIds 为空也去获取脚本数据（后端可能已保存数据）
      if (!token || !projectData.projectId) return;
      const fetchToken = token;
      const fetchProjectId = projectData.projectId;
      void (async () => {
        try {
          // 反推改写任务完成时，获取全部脚本（不带类型筛选）
          // 其他类型按 type 过滤获取该类型的候选脚本
          const types = type === "reverse_rewrite" ? undefined : [type];
          const result = await backendApi.step3FetchScriptCandidates(fetchToken, fetchProjectId, types);
          if (result.items.length > 0) {
            const partialCandidates = buildScriptCandidateViewModelsFromSnapshot(result.items);
            setStep3CandidateFeed((current) => mergeStep3CandidateFeed(partialCandidates, current));
            setImportedStoryboardCandidate(null);
          }
        } catch (e) {
          console.warn(`[Step3] fetch candidates for ${type} failed:`, e);
        }
      })();
    },
    // 没有 job 记录但可能已有脚本数据时，获取数据
    onNeedFetchData: (type) => {
      if (!token || !projectData.projectId) return;
      const fetchToken = token;
      const fetchProjectId = projectData.projectId;
      void (async () => {
        try {
          const result = await backendApi.step3FetchScriptCandidates(fetchToken, fetchProjectId, [type]);
          if (result.items.length > 0) {
            const partialCandidates = buildScriptCandidateViewModelsFromSnapshot(result.items);
            setStep3CandidateFeed((current) => mergeStep3CandidateFeed(partialCandidates, current));
            setImportedStoryboardCandidate(null);
          }
        } catch (e) {
          console.warn(`[Step3] fetch existing candidates for ${type} failed:`, e);
        }
      })();
    },
    onAllDone: () => {
      // 重置刷新状态
      setIsRefreshingCandidates(false);
    },
    onError: (message, _code) => {
      setFeedback(message);
      setIsRefreshingCandidates(false);
    },
  });

  // 非反推项目：正常启动 Job 轮询
  // 已确认脚本的项目（SCRIPT_CONFIRMED 及之后状态）：跳过自动生成，只显示已确认的脚本
  useEffect(() => {
    if (!token || !projectData.projectId) {
      return;
    }
    // projectStatus 未加载完成时等待，避免用 undefined 判断走了错误的 sseTriggerScriptGeneration 分支
    const effectiveStatus = projectData.projectStatus as VideoProjectStatus | undefined;
    if (!effectiveStatus) {
      return;
    }
    // SCRIPT_CONFIRMED 及之后：由「情况 A」useEffect 通过 getMyLibraryScript 加载单个确认脚本，此处不再重复请求
    if (isVideoStatusAtOrBeyond(effectiveStatus, "SCRIPT_CONFIRMED")) {
      return;
    }
    // SCRIPT_SELECTED 状态：脚本已选中但未确认，加载候选列表 + 恢复策略状态（不创建新 job）
    if (isVideoStatusAtOrBeyond(effectiveStatus, "SCRIPT_SELECTED")) {
      const fetchToken = token;
      const fetchProjectId = projectData.projectId;
      void (async () => {
        try {
          const result = await backendApi.step3FetchScriptCandidates(fetchToken, fetchProjectId);
          if (result.items.length > 0) {
            const candidates = buildScriptCandidateViewModelsFromSnapshot(result.items);
            setStep3CandidateFeed(candidates);
            setImportedStoryboardCandidate(null);
            const confirmedItem = result.items.find((item) => item.isConfirmed);
            if (confirmedItem) {
              setSseConfirmedScriptId(confirmedItem.candidateId);
            }
          }
        } catch (e) {
          console.warn("[Step3] fetch script candidates failed:", e);
        }
        // 恢复策略状态（进度条需要），restoreOnly 不创建新 job
        sseTriggerScriptGeneration({ forceRefresh: false, preserveSelection: true, restoreOnly: true });
      })();
      return;
    }
    // 先拉取已有脚本，拉回来有数据 → candidates 填充 → 遮罩不出现
    // 没拉回来 → triggerScriptGeneration 按 job 状态显示遮罩
    const preFetchToken = token;
    const preFetchProjectId = projectData.projectId;
    currentProjectIdRef.current = preFetchProjectId;
    setIsPreFetchingScripts(true);
    void (async () => {
      try {
        const result = await backendApi.step3FetchScriptCandidates(preFetchToken, preFetchProjectId);
        // 项目已切换时丢弃旧项目数据
        if (currentProjectIdRef.current !== preFetchProjectId) return;
        if (result.items.length > 0) {
          const existing = buildScriptCandidateViewModelsFromSnapshot(result.items);
          setStep3CandidateFeed(existing);
          setImportedStoryboardCandidate(null);
        }
      } catch (_e) {
        // 预拉取失败不阻断主流程
      }
      // 项目已切换时不更新状态
      if (currentProjectIdRef.current !== preFetchProjectId) return;
      setIsPreFetchingScripts(false);
      sseTriggerScriptGeneration();
    })();
  }, [projectData.projectId, projectData.projectStatus]);

  // 从数据库恢复分镜预览图：项目初始化时从 nrm_step3_frame_images 读取
  const frameImagesRestoredRef = useRef(false);
  useEffect(() => {
    if (frameImagesRestoredRef.current) return;
    if (!token || !projectData.projectId) return;
    // API 调用完成后再标记，失败时可重试
    (async () => {
      try {
        const result = await backendApi.getStep3FrameImages(token, projectData.projectId!);
        frameImagesRestoredRef.current = true;
        if (result.frames && result.frames.length > 0) {
          // 记录有 DB 记录的帧索引
          const dbFrameIndices = new Set<number>();
          const restored: Record<number, string[]> = {};
          const selectedByFrame: Record<number, string> = {};
          for (const frame of result.frames) {
            dbFrameIndices.add(frame.frameIndex);
            // 优先使用 candidates 数组，无 candidates 时用 imageUrl 构建单元素数组
            const urls = (frame.candidates && frame.candidates.length > 0)
              ? frame.candidates
              : (frame.imageUrl ? [frame.imageUrl] : []);
            if (urls.length > 0) {
              restored[frame.frameIndex] = urls;
            }
            // 存储选中的图片 URL（用于后续合并到 segments.sceneImageUrl）
            if (frame.imageUrl && frame.imageUrl.trim().length > 0) {
              selectedByFrame[frame.frameIndex] = frame.imageUrl.trim();
            }
          }
          // 标记有 DB 记录的帧（用于显示预览区）
          setFrameDbRecords(dbFrameIndices);
          if (Object.keys(restored).length > 0) {
            console.log("[Step3] Restoring frame images from DB:", restored);
            updatePreviewCandidatesByFrame((prev) => ({ ...prev, ...restored }));
          }
          if (Object.keys(selectedByFrame).length > 0) {
            console.log("[Step3] Storing selected images for later merge:", selectedByFrame);
            setFrameSelectedImageByUrl(selectedByFrame);
          }
          // 从帧图片数据中提取失败帧错误信息（不依赖全局任务队列，后者 LIMIT 50 可能遗漏）
          const failedFrameErrors: Record<number, string> = {};
          for (const frame of result.frames) {
            if (frame.status === "failed" && !frame.imageUrl) {
              failedFrameErrors[frame.frameIndex] = "生成失败，请重试";
            }
          }
          if (Object.keys(failedFrameErrors).length > 0) {
            console.log("[Step3] Restoring frame errors from DB:", failedFrameErrors);
            setFrameErrors(failedFrameErrors);
          }
        }
      } catch (e) {
        console.warn("[Step3] restore previewCandidatesByFrame from DB failed:", e);
      }
    })();
  }, [token, projectData.projectId]);

  // 锁定状态：通过项目状态或 confirmedScriptId 判断
  const isStep3CandidateLocked = sseConfirmedScriptId !== null;
  // 脚本已确认：项目状态 >= SCRIPT_CONFIRMED（无需依赖 SSE）
  const isScriptConfirmedByStatusForLock = isVideoStatusAtOrBeyond(projectData.projectStatus as VideoProjectStatus | undefined, "SCRIPT_CONFIRMED");
  // 统一锁定判断：项目状态锁定（FILMING 及之后）或脚本候选锁定 或脚本已确认
  const isStep3HardLocked = step3Locked || isStep3CandidateLocked || isStep3LocalLocked || isScriptConfirmedByStatusForLock;
  // 锁定状态变化时：重置回灌标记（后端会自动取消批量任务）
  useEffect(() => {
    lockedRewriteDoneRef.current = false;
    if (isStep3HardLocked) {
      step3BatchGeneratingRef.current = false;
      setStep3BatchState((current) => ({
        ...current,
        running: false,
        queued: 0,
        requestedStop: true,
      }));
    }
  }, [isStep3HardLocked]);
  const step3CandidateLockReason = isStep3HardLocked
    ? "当前脚本源已锁定，如需切换请联系管理员解锁后重试。"
    : null;
  const markStep3StoryboardCueScriptSource = useCallback(
    (next: Step3StoryboardCueScriptSource) => {
      setStep3StoryboardCueScriptSource((current) => (current === next ? current : next));
      if (workflow.videoStoryboardCueScriptSource !== next) {
        setStoryboardCueScriptSource(next);
      }
    },
    [workflow.videoStoryboardCueScriptSource, setStoryboardCueScriptSource],
  );

  // 【情况 A】已确认脚本：复用上方提前计算的锁状态判断
  const isScriptConfirmedByStatus = isScriptConfirmedByStatusForLock;

  useEffect(() => {
    if (!token || !projectData.projectId) return;
    // 根据项目状态判断是否已确认脚本，而非根据 activeScriptId
    if (!isScriptConfirmedByStatus) {
      setConfirmedScriptFromApi(null);
      return;
    }
    const activeScriptId = projectData.activeScriptId;
    if (!activeScriptId) return;
    // 避免重复加载（已加载过相同 ID）
    if (confirmedScriptFromApi?.id === activeScriptId) return;
    // 标记加载中
    setLoadingConfirmedScript(true);
    console.log("[Step3] 加载已确认脚本:", activeScriptId);

    backendApi.getMyLibraryScript(token, activeScriptId)
      .then((scriptData) => {
        if (!scriptData || !scriptData.payload) {
          console.warn("[Step3] 脚本数据为空:", activeScriptId);
          setConfirmedScriptFromApi(null);
          return;
        }
        // 构建 ScriptCandidateViewModel
        const payload = scriptData.payload as Record<string, unknown>;
        // 构建 structuredCard（完整对象）
        const structuredCard = buildStep3StructuredScriptCardViewModel({
          source: "premium",
          title: scriptData.title || "已确认脚本",
          subtitle: (payload.subtitle as string) || "",
          preview: (payload.preview as string) || "",
          content: (payload.content as string) || "",
          durationSec: (payload.durationSec as number) || 30,
          storyboardCount: (payload.storyboardCount as number) || 0,
          mainScene: (payload.mainScene as string) || undefined,
          atmosphere: (payload.atmosphere as string) || undefined,
          timeOfDay: (payload.timeOfDay as string) || undefined,
          weather: (payload.weather as string) || undefined,
          theme: (payload.theme as string) || undefined,
          summary: (payload.summary as string) || undefined,
        });
        const strategyTypeValue = ((payload.strategyType as string) || "library") as Step3ScriptStrategyType;
        const atmosphereValue = payload.atmosphere as string | null;
        const viewModel: ScriptCandidateViewModel = {
          id: scriptData.scriptDataId,
          candidateId: scriptData.scriptDataId,
          title: scriptData.title || "已确认脚本",
          subtitle: payload.subtitle as string || undefined,
          preview: payload.preview as string || "",
          content: payload.content as string || "",
          summary: payload.summary as string || "",
          source: "premium",
          strategyType: strategyTypeValue,
          suitability: "high",
          tags: [...(scriptData.tags || [])],
          matchReasons: [],
          rank: null,
          mainScene: payload.mainScene as string || undefined,
          timeOfDay: payload.timeOfDay as string || undefined,
          weather: payload.weather as string || undefined,
          atmosphere: (atmosphereValue as AtmosphereSceneCategory) || undefined,
          scriptStyle: payload.scriptStyle as string || undefined,
          durationSec: (payload.durationSec as number) || 30,
          shotCount: (payload.storyboardCount as number) || 0,
          sourceUrl: payload.sourceUrl as string || null,
          structuredCard,
          storyboardSegments: (payload.storyboardSegments as ScriptSegment[]) || [],
        };
        setConfirmedScriptFromApi(viewModel);
        // 同步设置 sseConfirmedScriptId
        setSseConfirmedScriptId(activeScriptId);
        console.log("[Step3] 已确认脚本加载成功:", activeScriptId);
      })
      .catch((err) => {
        console.error("[Step3] 加载已确认脚本失败:", err);
        setConfirmedScriptFromApi(null);
      })
      .finally(() => {
        setLoadingConfirmedScript(false);
      });
  }, [token, projectData.projectId, isScriptConfirmedByStatus, projectData.activeScriptId, confirmedScriptFromApi?.id, setSseConfirmedScriptId]);

  // 项目切换时重置状态
  useEffect(() => {
    setStep3CandidateFeed([]);
  }, [projectData.projectId]);

  // 候选脚本列表：直接使用 step3CandidateFeed（由 onJobTypeDone 回调填充）
  const scriptCandidates = step3CandidateFeed;

  // 【分情况显示脚本】
  // 情况 A：已确认（项目状态 >= SCRIPT_CONFIRMED） → 只显示确认的单个脚本
  // 情况 B：未确认（项目状态 < SCRIPT_CONFIRMED） → 显示所有候选脚本
  const visibleScriptCandidates = useMemo<ScriptCandidateViewModel[]>(
    () => {
      // 【情况 A】已确认脚本：根据项目状态判断
      if (isScriptConfirmedByStatus) {
        // 优先使用远端加载的完整数据，未加载完成前从已有候选列表中过滤
        if (confirmedScriptFromApi) {
          return [confirmedScriptFromApi];
        }
        const confirmedId = projectData.activeScriptId ?? sseConfirmedScriptId;
        const fromFeed = confirmedId
          ? step3CandidateFeed.find((c) => c.id === confirmedId)
          : null;
        return fromFeed ? [fromFeed] : [];
      }
      // 【情况 B】未确认脚本：显示所有候选
      // 如果有 importedStoryboardCandidate（反推导入），优先显示它
      if (importedStoryboardCandidate) {
        return [importedStoryboardCandidate];
      }
      // 显示候选列表（step3CandidateFeed）
      return step3CandidateFeed;
    },
    [isScriptConfirmedByStatus, confirmedScriptFromApi, projectData.activeScriptId, sseConfirmedScriptId, importedStoryboardCandidate, step3CandidateFeed],
  );

  useEffect(() => {
    const normalizedSource: Step3StoryboardCueScriptSource =
      workflow.videoStoryboardCueScriptSource === "user_uploaded" ? "user_uploaded" : "other";
    setStep3StoryboardCueScriptSource((current) => (current === normalizedSource ? current : normalizedSource));
  }, [workflow.videoStoryboardCueScriptSource]);

  // 处理候选脚本卡片选择状态
  // 首次进入页面时不默认选择第一个卡片，等待用户点击后再选择
  useEffect(() => {
    if (importedStoryboardCandidate) {
      setSelectedCandidateId((current) => (current === importedStoryboardCandidate.id ? current : importedStoryboardCandidate.id));
      return;
    }
    // 刷新清空模式下跳过恢复，保持选中为 null
    if (refreshShouldClearSelectionRef.current) {
      return;
    }
    // 仅恢复已保存或已确认的候选，不再默认选择第一个
    setSelectedCandidateId(
      sseSelectedScriptId ?? sseConfirmedScriptId ?? null,
    );
  }, [
    importedStoryboardCandidate,
    scriptCandidates,
    sseConfirmedScriptId,
    sseSelectedScriptId,
  ]);

  useEffect(() => {
    if (!sseConfirmedScriptId) {
      return;
    }
    if (step3StoryboardCueScriptSource !== "other") {
      markStep3StoryboardCueScriptSource("other");
    }
  }, [
    markStep3StoryboardCueScriptSource,
    sseConfirmedScriptId,
    step3StoryboardCueScriptSource,
  ]);

  useEffect(() => {
    setIsStep3LocalLocked(false);
  }, [projectData.projectId]);


  // 从 SSE 加载的候选 storyboardSegments 恢复分镜（数据库权威源：nrm_shot_breakdown + nrm_script_data）
  const segmentsFromDbRef = useRef(false);
  useEffect(() => {
    if (segmentsFromDbRef.current) return;
    if (scriptCandidates.length === 0) return;
    if (!sseSelectedScriptId && !sseConfirmedScriptId) return;
    // 优先查找已确认的候选，其次查找已选中的候选
    const targetId = sseConfirmedScriptId ?? sseSelectedScriptId;
    const targetCandidate = scriptCandidates.find((c) => c.id === targetId);
    if (!targetCandidate) return;
    if (!Array.isArray(targetCandidate.storyboardSegments) || targetCandidate.storyboardSegments.length === 0) return;
    // 如果 segments 已经有数据（来自 route state 或导入），不覆盖
    if (segments.length > 0) return;
    segmentsFromDbRef.current = true;
    const restoredSegments = resolveStep3SegmentsFromCandidate(targetCandidate, [], targetCandidate.storyboardSegments);
    if (restoredSegments.length > 0) {
      setSegments(restoredSegments);
      setFullScriptDraft(buildFullScriptDraftFromSegments(restoredSegments));
    }
  }, [scriptCandidates, sseSelectedScriptId, sseConfirmedScriptId, segments.length]);


  // 安全网：当脚本已确认但 segments 仍为空时，直接从 API 加载分镜
  const confirmedSegmentsLoadedRef = useRef(false);
  useEffect(() => {
    if (confirmedSegmentsLoadedRef.current) return;
    if (segments.length > 0) return;
    if (!sseConfirmedScriptId) return;
    if (!token || !projectData.projectId) return;
    confirmedSegmentsLoadedRef.current = true;
    void (async () => {
      try {
        const result = await backendApi.step3FetchScriptCandidates(token, projectData.projectId!);
        if (result.items && result.items.length > 0) {
          const candidates = buildScriptCandidateViewModelsFromSnapshot(result.items);
          const targetScriptId = sseConfirmedScriptId ?? projectData.activeScriptId;
          const target = candidates.find((c) => c.id === targetScriptId);
          if (target?.storyboardSegments?.length && segments.length === 0) {
            const restored = resolveStep3SegmentsFromCandidate(target, [], target.storyboardSegments);
            if (restored.length > 0) {
              setSegments(restored);
              setFullScriptDraft(buildFullScriptDraftFromSegments(restored));
            }
          }
        }
      } catch (e) {
        console.warn("[Step3] fallback fetch confirmed segments failed:", e);
      }
    })();
  }, [sseConfirmedScriptId, segments.length, token, projectData.projectId, projectData.activeScriptId]);

  useEffect(() => {
    const routeState = (location.state ?? null) as
      | {
        importedScript?: {
          id?: string;
          title?: string;
          content?: string;
          segments?: ScriptSegment[];
        };
        importedStoryboard?: Step3ImportedStoryboardPayload;
      }
      | null;
    const importedStoryboard =
      routeState?.importedStoryboard ??
      ((workflow.pendingStoryboardImport as { segments?: unknown[] } | null)?.segments?.length
        ? workflow.pendingStoryboardImport as Step3ImportedStoryboardPayload
        : null);
    const imported = routeState?.importedScript;

    // 反推脚本由 ReverseScriptEditor 处理，此处跳过
    if (workflow.pendingReverseDeckScript && !importedStoryboard && !imported) {
      return;
    }

    if (isStep3HardLocked && imported && !importedStoryboard) {
      clearPendingImportState();
      setFeedback(step3CandidateLockReason ?? "当前脚本源已锁定，无法导入新脚本。");
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    if (importedStoryboard) {
      const nextSegments = hydrateImportedStoryboardSegments(importedStoryboard as Step3ImportedStoryboardPayload) as ScriptSegment[];
      if (nextSegments.length < 1) {
        setPendingStoryboardImport(null);
        navigate(location.pathname, { replace: true, state: null });
        return;
      }
      const importedText = buildFullScriptDraftFromSegments(nextSegments).trim();
      const importedCandidate = buildStep3ImportedStoryboardCandidate({
        sourceLibraryId: (importedStoryboard as Step3ImportedStoryboardPayload).sourceLibraryId,
        title: (importedStoryboard as Step3ImportedStoryboardPayload).title ?? "导入分镜",
        segments: nextSegments,
      });
      setImportedStoryboardCandidate(importedCandidate);
      setSelectedCandidateId(importedCandidate.id);
      setSaveClueTitleHint(((importedStoryboard as Step3ImportedStoryboardPayload).title ?? "") as string | null);
      setSegments(nextSegments);
      setFullScriptDraft(importedText);
      markStep3StoryboardCueScriptSource("other");
      clearPendingImportState();
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    if (!imported) {
      return;
    }
    const importedSegments = Array.isArray(imported.segments) ? imported.segments : [];
    const importedText =
      (typeof imported.content === "string" ? imported.content.trim() : "") ||
      buildFullScriptDraftFromSegments(importedSegments).trim();
    const sanitizedImportedText = sanitizeStep3ImportedFullScript(importedText);
    if (!sanitizedImportedText && importedSegments.length < 1) {
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    const nextSegments =
      importedSegments.length > 0 ? importedSegments : mergeTextToSegments(sanitizedImportedText, []);
    setImportedStoryboardCandidate(null);
    setSelectedCandidateId(null);
    setSaveClueTitleHint((imported.title ?? "").trim() || null);
    setSegments(nextSegments);
    setFullScriptDraft(sanitizedImportedText);
    markStep3StoryboardCueScriptSource("other");
    if (workflow.pendingReverseDeckScript !== null) {
      setPendingReverseDeckScript(null);
    }
    setFeedback(`已从脚本库导入：${imported.title || "未命名脚本"}`);
    navigate(location.pathname, { replace: true, state: null });
  }, [
    location.pathname,
    location.state,
    navigate,
    workflow.pendingStoryboardImport,
    workflow.pendingReverseDeckScript,
    isStep3HardLocked,
    step3CandidateLockReason,
    markStep3StoryboardCueScriptSource,
    setPendingStoryboardImport,
    setPendingReverseDeckScript,
    clearPendingImportState,
  ]);

  useEffect(() => {
    resumedScriptHydratedRef.current = false;
  }, [projectData.projectId]);

  useEffect(() => {
    setImportedStoryboardCandidate(null);
  }, [projectData.projectId]);

  useEffect(() => {
    if (resumedScriptHydratedRef.current) {
      return;
    }
    if (!token || !projectData.projectId) {
      return;
    }
    if (segments.length > 0 || fullScriptDraft.trim().length > 0) {
      resumedScriptHydratedRef.current = true;
      return;
    }
    // 无需恢复旧脚本，新流程使用 nrm_script_data 表
    resumedScriptHydratedRef.current = true;
  }, [token, projectData.projectId, segments.length, fullScriptDraft]);


  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

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

  useEffect(() => {
    if (!token) {
      setCharacterWorkflowSettings(createDefaultCharacterWorkflowSystemSettings());
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const settings = await backendApi.adminCharacterWorkflowSystemSettingsGet(token);
        if (!cancelled) {
          // 防御性检查：API 可能返回 null/undefined
          setCharacterWorkflowSettings(settings ?? createDefaultCharacterWorkflowSystemSettings());
        }
      } catch {
        if (!cancelled) {
          setCharacterWorkflowSettings(createDefaultCharacterWorkflowSystemSettings());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (segments.length < 1) {
      setActivePreviewFrameIndex(0);
      return;
    }
    setActivePreviewFrameIndex((current) => Math.min(current, segments.length - 1));
  }, [segments.length]);

  useEffect(() => {
    updatePreviewCandidatesByFrame((current) => {
      const entries = Object.entries(current).filter(([frameIndex]) => {
        const parsed = Number(frameIndex);
        return Number.isInteger(parsed) && parsed >= 1 && parsed <= segments.length;
      });
      if (entries.length === Object.keys(current).length) {
        return current;
      }
      return Object.fromEntries(entries);
    });
  }, [segments.length]);

  useEffect(() => {
    updatePreviewJobsByFrame((current) => {
      const entries = Object.entries(current).filter(([frameIndex]) => {
        const parsed = Number(frameIndex);
        return Number.isInteger(parsed) && parsed >= 1 && parsed <= segments.length;
      });
      if (entries.length === Object.keys(current).length) {
        return current;
      }
      return Object.fromEntries(entries);
    });
  }, [segments.length]);

  useEffect(() => {
    workflowRef.current = workflow;
  }, [workflow]);

  useEffect(() => {
    saveClueTitleHintRef.current = saveClueTitleHint;
  }, [saveClueTitleHint]);

  useEffect(
    () => () => {
      previewJobUnmountedRef.current = true;
    },
    [],
  );

  const applySharedFullScriptDraft = (text: string) => {
    setFullScriptDraft(text);
    setSegments((current) => mergeTextToSegments(text, current));
  };

  const appendLibraryMirrorScript = async (text: string): Promise<void> => {
    const currentToken = tokenRef.current;
    const currentProjectId = projectData.projectId;
    if (!currentToken || !currentProjectId) {
      return;
    }
    const cleanText = text.trim();
    if (!cleanText) {
      return;
    }
    const projectTag = `project:${currentProjectId}`;
    const saveAt = Date.now();
    const autoTags = ["#脚本中心", "#手动保存", "#完整口播", projectTag, `save:${saveAt}`];
    const resolvedTitle = resolveStep3SaveTitle(
      cleanText,
      projectData.projectName ?? null,
      saveClueTitleHintRef.current,
    );
    await backendApi.createLibraryScript(currentToken, {
      title: resolvedTitle,
      tags: autoTags,
      content: cleanText,
    });
  };

  async function persistScript(text: string, options?: PersistScriptOptions): Promise<void> {
    const currentToken = tokenRef.current;
    const currentProjectId = projectData.projectId;
    if (!currentToken || !currentProjectId) {
      setFeedback("请先完成前两步（搭配与角色确认）。");
      return;
    }
    const cleanText = text.trim();
    if (!cleanText) {
      setFeedback("脚本内容不能为空。");
      return;
    }
    const shouldTouchUi = !options?.background;

    try {
      if (shouldTouchUi) {
        setIsSaving(true);
      }
      if (!options?.silent && shouldTouchUi) {
        setFeedback(null);
      }
      const nextSegments = mergeTextToSegments(cleanText, segmentsRef.current);

      // 镜像到脚本库
      if (options?.mirrorToLibrary !== false) {
        await appendLibraryMirrorScript(cleanText);
      }
      if (shouldTouchUi) {
        setSegments(nextSegments);
        setFullScriptDraft(cleanText);
      }
      lastPersistedDraftRef.current = cleanText;
      if (!options?.silent && shouldTouchUi) {
        setFeedback("脚本已保存到脚本库。");
      }
    } catch (error) {
      if (shouldTouchUi) {
        const message = error instanceof ApiError ? error.message : "脚本保存失败，请稍后重试";
        setFeedback(message);
      }
    } finally {
      if (shouldTouchUi) {
        setIsSaving(false);
      }
    }
  }

  const enqueuePersistScript = (text: string, options?: PersistScriptOptions): Promise<void> => {
    persistQueueRef.current = persistQueueRef.current.then(() => persistScript(text, options));
    return persistQueueRef.current;
  };

  const applyCandidateToStoryboard = (
    candidate: ScriptCandidateViewModel,
    options?: {
      snapshot?: Step3CandidateSnapshotDto;
      confirmedSegments?: unknown;
      feedbackMessage?: string;
      markConfirmed?: boolean;
    },
  ) => {
    if (importedStoryboardCandidate && candidate.id !== importedStoryboardCandidate.id) {
      setImportedStoryboardCandidate(null);
    }
    const nextSegments = resolveStep3SegmentsFromCandidate(candidate, segmentsRef.current, options?.confirmedSegments);
    setSegments(nextSegments);
    updatePreviewCandidatesByFrame({});
    updatePreviewJobsByFrame({});
    const nextFullScriptDraft = buildFullScriptDraftFromSegments(nextSegments).trim();
    setFullScriptDraft(
      nextFullScriptDraft.length > 0
        ? nextFullScriptDraft
        : resolveSharedFullScriptDraft(candidate.content, nextSegments),
    );
    setSelectedCandidateId(candidate.id);
    setSaveClueTitleHint(buildStep3ScriptClueTitle(candidate));
    markStep3StoryboardCueScriptSource("other");
    if (options?.confirmedSegments) {
      setRewrittenScriptSegments(nextSegments);
    }
    if (options?.markConfirmed) {
      updateProjectData({
        projectStatus: "SCRIPT_CONFIRMED",
      });
    }
    if (typeof options?.feedbackMessage === "string" && options.feedbackMessage.trim().length > 0) {
      setFeedback(options.feedbackMessage);
    }
  };

  const resolveActiveStep3Candidate = (): ScriptCandidateViewModel | null =>
    visibleScriptCandidates.find((item) => item.id === selectedCandidateId) ?? null;
  // 飞入动画：选中脚本时左侧卡片轮廓放大脉冲
  const [flyReceiveKey, setFlyReceiveKey] = useState(0);
  useEffect(() => {
    if (flyReceiveKey < 1) return;
    const timer = setTimeout(() => {
      const target = step3SidebarCardRef.current;
      if (target instanceof HTMLElement) {
        target.animate([
          { outline: "0px solid rgba(224,122,95,0)", transform: "scale(1)" },
          { outline: "6px solid rgba(224,122,95,0.5)", transform: "scale(1.03)" },
          { outline: "0px solid rgba(224,122,95,0)", transform: "scale(1)" },
        ], { duration: 500, easing: "ease-out" });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [flyReceiveKey]);
  /**
   * 处理候选脚本卡片点击
   * - 已锁定状态：只能回灌锁定的脚本
   * - 未锁定状态：调用 select API 持久化选择，然后回灌分镜到编辑器
   * - 首次生图时会弹出锁定确认
   * - 已选中的脚本不可重复点击
   */
  const handlePickCandidate = async (candidate: ScriptCandidateViewModel, startRect?: DOMRect) => {
    // 防止并发点击（同步锁）
    if (pickCandidateLockRef.current) {
      return;
    }
    // 已选中的脚本不可重复点击
    if (selectedCandidateId === candidate.id) {
      return;
    }
    pickCandidateLockRef.current = true;
    try {
    // 飞入动画：触发左侧脚本卡片接收脉冲
    if (startRect) {
      setFlyReceiveKey((k) => k + 1);
    }
    // 已锁定状态的处理
    if (isStep3HardLocked) {
      const lockedCandidateId =
        sseConfirmedScriptId ??
        sseSelectedScriptId ??
        selectedCandidateId;
      if (lockedCandidateId && candidate.id === lockedCandidateId) {
        // 锁定状态下已回灌过，不重复触发
        if (lockedRewriteDoneRef.current) {
          return;
        }
        lockedRewriteDoneRef.current = true;
        // 点击的是已锁定的脚本，回灌分镜
        const persistedRewrittenSegments =
          Array.isArray(workflow.videoRewrittenScriptSegments) && workflow.videoRewrittenScriptSegments.length > 0
            ? workflow.videoRewrittenScriptSegments
            : undefined;
        applyCandidateToStoryboard(candidate, {
          confirmedSegments: persistedRewrittenSegments,
          feedbackMessage: "已按锁定脚本重新回灌改写后的分镜。",
        });
        showStep3GuardToast("已按锁定脚本重新回灌改写后的分镜。");
        return;
      }
      // 点击的是非锁定的脚本，提示用户
      setFeedback(
        isAdmin
          ? "当前脚本源已锁定，只能重灌当前锁定脚本；若需切换请先管理员解锁。"
          : "当前脚本源已锁定，只能重灌当前锁定脚本；若需切换请联系管理员解锁。",
      );
      return;
    }

    // 未锁定状态：调用 select API 持久化选择
    if (token && projectData.projectId) {
      try {
        await backendApi.step3CandidateSelect(token, projectData.projectId, candidate.id);
        setSelectedCandidateId(candidate.id);
        updateProjectData({ projectStatus: "SCRIPT_SELECTED" });
      } catch (error) {
        console.warn("Candidate select API 失败:", error);
      }
    }

    // 回灌分镜到编辑器
    applyCandidateToStoryboard(candidate);
    // 自动滚动到分镜区域
    step3GuardToastScrollTimerRef.current = window.setTimeout(() => {
      (step3GuardToastAnchorRef.current ?? step3StoryboardSectionRef.current)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      step3GuardToastScrollTimerRef.current = null;
    }, 300);
    } finally {
      pickCandidateLockRef.current = false;
    }
  };

  const handleAdminUnlockCandidate = async () => {
    if (!isAdmin) {
      setFeedback("仅管理员可执行解锁。");
      return;
    }
    if (!token || !projectData.projectId) {
      setFeedback("请先完成前两步（搭配与角色确认）。");
      return;
    }
    if (!isStep3CandidateLocked) {
      setFeedback("当前候选未锁定，无需解锁。");
      return;
    }
    try {
      setIsUnlockingCandidate(true);
      await backendApi.step3CandidateAdminUnlock(token, projectData.projectId, "step3-ui-admin-unlock");
      setIsStep3LocalLocked(false);
      setSelectedCandidateId(null);
      setFeedback("已解锁候选脚本，现在可重新切换预览；首次生图会再次触发锁定确认。");
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "候选脚本解锁失败";
      setFeedback(message);
    } finally {
      setIsUnlockingCandidate(false);
    }
  };

  const handleRefreshStep3Candidates = async () => {
    if (!token || !projectData.projectId) {
      setFeedback("请先完成前两步（搭配与角色确认）。");
      return;
    }
    if (isStep3HardLocked) {
      setFeedback("当前脚本源已锁定，无法刷新推荐；请先管理员解锁。");
      return;
    }

    // 未锁定（无镜像图片）时刷新后需清空选中，防止 onDone 恢复旧选中
    refreshShouldClearSelectionRef.current = true;

    // 清空用户选择和分镜编辑区，恢复到初始状态
    setSelectedCandidateId(null);
    setSegments([]);
    updatePreviewCandidatesByFrame({});
    updatePreviewJobsByFrame({});
    setFullScriptDraft("");
    setSaveClueTitleHint(null);
    setImportedStoryboardCandidate(null);
    // 清空后端持久化数据
    persistPreviewCandidatesByFrame({});
    persistPreviewJobsByFrame({});

    // 使用 Job 轮询刷新
    setIsRefreshingCandidates(true);
    sseTriggerScriptGeneration({
      forceRefresh: true,
    });
    // isRefreshingCandidates 由 onDone / onError 统一重置
  };

  /**
   * 确保 Step3 锁定状态（只负责锁定，不涉及数据获取）
   * 注意：弹窗确认在外层调用处处理，避免重复弹窗
   */
  const ensureStep3LockOnly = async (): Promise<boolean> => {
    // 已锁定，直接返回
    if (isStep3HardLocked) {
      return true;
    }

    if (isConfirmingCandidate) {
      setFeedback("正在确认并锁定脚本，请稍候。");
      return false;
    }

    const candidate = resolveActiveStep3Candidate();
    if (!candidate) {
      setFeedback("暂无可用候选脚本，暂时无法生图。");
      return false;
    }

    setIsConfirmingLockLoading(true);

    if (!token || !projectData.projectId) {
      setIsConfirmingLockLoading(false);
      setFeedback("请先完成前两步（搭配与角色确认）。");
      return false;
    }

    try {
      setIsConfirmingCandidate(true);
      const response = await backendApi.step3CandidateConfirm(token, projectData.projectId, candidate.id);

      setIsStep3LocalLocked(false);
      // 立即设 confirmedScriptId 为当前候选 ID，让 visibleScriptCandidates 过滤只剩 1 张卡片
      // 后续 sseTriggerScriptGeneration 异步查询会用后端真实值覆盖，最终一致性不受影响
      setSseConfirmedScriptId(candidate.id);
      applyCandidateToStoryboard(candidate, {
        confirmedSegments: response.scriptSegments,
        feedbackMessage: `已锁定候选脚本并同步 ${response.scriptSegmentCount} 段分镜。`,
        markConfirmed: true,
      });

      // 刷新锁定状态，保留选中/确认 ID 避免闪烁
      sseTriggerScriptGeneration({ preserveSelection: true });

      setIsConfirmingLockLoading(false);
      return true;
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "候选脚本锁定失败";
      setFeedback(message);
      setIsConfirmingLockLoading(false);
      return false;
    } finally {
      setIsConfirmingCandidate(false);
    }
  };

  const handleImportScript = async (file: File) => {
    if (isStep3HardLocked) {
      setFeedback(step3CandidateLockReason ?? "当前脚本源已锁定，无法导入脚本。");
      return;
    }
    try {
      const rawText = await file.text();
      const normalized = rawText.trim();
      const sanitized = sanitizeStep3ImportedFullScript(normalized);
      if (!sanitized) {
        setFeedback("导入文件为空，请选择包含脚本内容的文件。");
        return;
      }
      const localSegments = mergeTextToSegments(sanitized, segments);
      setImportedStoryboardCandidate(null);
      setSegments(localSegments);
      setFullScriptDraft(resolveSharedFullScriptDraft(sanitized, localSegments));
      setSelectedCandidateId(null);
      setSaveClueTitleHint(file.name.replace(/\.[^.]+$/, "").trim() || null);
      markStep3StoryboardCueScriptSource("user_uploaded");
      setFeedback(`已导入脚本文件：${file.name}，请点击保存按钮落盘。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "导入脚本失败";
      setFeedback(message);
    }
  };

  const handleSaveFullScript = (rawText?: string): boolean => {
    const textToSave = typeof rawText === "string" ? rawText : fullScriptDraft;
    if (!textToSave.trim()) {
      setFeedback("请先输入完整口播脚本。");
      return false;
    }
    applySharedFullScriptDraft(textToSave);
    void enqueuePersistScript(textToSave.trim(), { sourceType: "original" });
    return true;
  };

  const handleTextChange = (index: number, field: keyof ScriptSegment, value: string) => {
    setActivePreviewFrameIndex(index);
    const next = [...segments];
    const current = next[index];
    if (!current) {
      return;
    }
    if (field === "visualCue") {
      const nextItem = applyStep3MainPromptToSegment(current, value);
      const shouldSyncVideoCue =
        value.trim().length > 0 && shouldSyncVideoCueOnFirstMainPromptFill(current);
      next[index] = shouldSyncVideoCue
        ? {
            ...nextItem,
            videoCue: nextItem.visualPrompt ?? value,
            videoCueTouched: false,
            videoCueInitialized: true,
          }
        : nextItem;
      setSegments(next);
      return;
    }
    next[index] = {
      ...current,
      [field]: value,
    };
    setSegments(next);
  };

  const upsertFramePreviewCandidates = (
    frameIndex: number,
    incomingCandidates: readonly string[],
    options?: { prepend?: boolean },
  ): string[] => {
    const normalizedIncoming = normalizeStep3PreviewCandidateUrls(incomingCandidates);
    if (normalizedIncoming.length < 1) {
      return previewCandidatesByFrame[frameIndex] ?? [];
    }
    let merged: string[] = [];
    updatePreviewCandidatesByFrame((state) => {
      const current = state[frameIndex] ?? [];
      merged = normalizeStep3PreviewCandidateUrls(
        options?.prepend
          ? [...normalizedIncoming, ...current]
          : [...current, ...normalizedIncoming],
      );
      const unchanged =
        current.length === merged.length &&
        current.every((item, index) => item === merged[index]);
      if (unchanged) {
        return state;
      }
      return {
        ...state,
        [frameIndex]: merged,
      };
    });
    return merged;
  };

  const applyFramePreviewImage = (
    frameIndex: number,
    imageUrl: string,
    options?: { sceneReferenceId?: string | null },
  ): boolean => {
    const normalizedImageUrl = imageUrl.trim();
    if (normalizedImageUrl.length < 1) {
      return false;
    }
    const targetIndex = frameIndex - 1;
    const currentSegments = segmentsRef.current;
    const targetSegment = currentSegments[targetIndex];
    if (!targetSegment) {
      return false;
    }
    const nextSceneReferenceId =
      options && Object.prototype.hasOwnProperty.call(options, "sceneReferenceId")
        ? typeof options.sceneReferenceId === "string" && options.sceneReferenceId.trim().length > 0
          ? options.sceneReferenceId.trim()
          : null
        : targetSegment.selectedSceneReferenceId ?? null;
    const currentSceneImageUrl = typeof targetSegment.sceneImageUrl === "string" ? targetSegment.sceneImageUrl.trim() : "";
    if (currentSceneImageUrl === normalizedImageUrl && (targetSegment.selectedSceneReferenceId ?? null) === nextSceneReferenceId) {
      return true;
    }
    const nextSegments = currentSegments.map((item, index) =>
      index === targetIndex
        ? {
            ...item,
            sceneImageUrl: normalizedImageUrl,
            selectedSceneReferenceId: nextSceneReferenceId,
          }
        : item,
    );
    segmentsRef.current = nextSegments;
    setSegments(nextSegments);
    return true;
  };

  const applyGeneratedPreviewCandidatesForFrame = (frameIndex: number, candidates: string[]): boolean => {
    const normalizedCandidates = normalizeStep3PreviewCandidateUrls(candidates);
    const primaryImageUrl = normalizedCandidates[0] ?? "";
    if (primaryImageUrl.length < 1) {
      return false;
    }
    upsertFramePreviewCandidates(frameIndex, normalizedCandidates, { prepend: true });
    return applyFramePreviewImage(frameIndex, primaryImageUrl);
  };

  const runStep3FramePreviewGeneration = async (
    frameIndex: number,
    _options?: {
      skipLockCheck?: boolean;
      skipCreditSpend?: boolean;
      silentStartFeedback?: boolean;
    },
  ): Promise<boolean> => {
    setActivePreviewFrameIndex(Math.max(0, frameIndex - 1));
    if (!token || !projectData.projectId) {
      setFeedback("请先完成前两步（搭配与角色确认）。");
      return false;
    }

    const currentSegments = segmentsRef.current;
    const segment = currentSegments[frameIndex - 1];
    if (!segment) {
      setFeedback(`镜头 ${frameIndex} 不存在，请先检查分镜列表。`);
      return false;
    }

    // 单帧重试：先锁定，再调用全局队列 API（后端自动处理提示词）
    const lockSuccess = await ensureStep3LockOnly();
    if (!lockSuccess) return false;

    try {
      // 调用全局队列 API（后端执行，前端通过 globalTaskQueue 跟踪）
      await backendApi.startSingleFramePreviewJob(token, projectData.projectId, {
        frameIndex,
      });
      setFeedback(`镜头 ${frameIndex} 预览图任务已启动（全局队列）。`);
      return true;
    } catch (error) {
      const message = error instanceof ApiError || error instanceof Error ? error.message : "镜头预览图生成失败";
      setFeedback(message);
      return false;
    }
  };

  const handleGeneratePreviewImage = async (frameIndex: number) => {
    // 立即设置生成中状态，让预览卡片马上显示 loading 动画
    setManualLoadingFrames((prev) => new Set(prev).add(frameIndex));
    setPreviewGenerationLoading((prev) => ({ ...prev, [frameIndex]: true }));
    const success = await runStep3FramePreviewGeneration(frameIndex);
    if (!success) {
      // API 调用前就失败了（锁检查、提示词检查等），立即清除手动 loading
      setManualLoadingFrames((prev) => {
        const next = new Set(prev);
        next.delete(frameIndex);
        return next;
      });
      setPreviewGenerationLoading((prev) => {
        const next = { ...prev };
        delete next[frameIndex];
        return next;
      });
    }
    // API 成功启动后不清除，等 useEffect 轮询到任务终态后自动接管
  };

  const handleStep3BatchAction = async (action: "batch-generate" | "stop") => {
    const normalizedThreadCount = normalizeStep3BatchThreadCount(step3BatchThreadCount);
    if (action === "stop") {
      // 确认弹窗
      const shouldStop = await confirm(
        "停止后将取消所有未生成的分镜，已生成的分镜不受影响。是否继续？",
        "停止确认",
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
      setFeedback("已停止批量分镜预览生成。");
      return;
    }
    // 防止重复点击
    if (step3BatchGeneratingRef.current) {
      setFeedback("批量生图进行中，请勿重复操作。");
      return;
    }
    if (!token || !projectData.projectId) {
      setFeedback("请先完成前两步（搭配与角色确认）。");
      return;
    }

    const targets = step3BatchControlsModel.targets;
    if (targets.length < 1) {
      setStep3BatchState(createIdleStep3BatchGenerationState(normalizedThreadCount));
      setFeedback("当前没有可批量生成的分镜。");
      return;
    }

    // 确认弹窗：提示用户生成将消耗积分
    const shouldGenerate = await confirm(
      `即将锁定选择的脚本，并为 ${targets.length} 个分镜生成预览图。该步骤不可回退，是否继续？`,
      "生成分镜预览",
    );
    if (!shouldGenerate) {
      return;
    }

    // 1. 确认锁定脚本
    setStep3BatchConfirming(true);
    try {
      const lockSuccess = await ensureStep3LockOnly();
      if (!lockSuccess) {
        return;
      }
    } finally {
      setStep3BatchConfirming(false);
    }

    // 2. 调用后端批量预览 API（后端从数据库查所有数据，前端只传 frameIndexes）
    step3BatchGeneratingRef.current = true;
    try {
      const frameIndexes = targets.map((t) => t.frameIndex);

      await backendApi.startBatchPreviewJob(token, projectData.projectId, {
        frameIndexes,
      });

      setFeedback(`批量分镜预览已启动，共 ${frameIndexes.length} 个分镜。`);

      // 立即显示进度状态（所有帧卡片显示进度条）
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
      setFeedback(message);
    } finally {
      step3BatchGeneratingRef.current = false;
    }
  };

  const deleteSegment = (index: number) => {
    setActivePreviewFrameIndex((current) => {
      if (segments.length <= 1) {
        return 0;
      }
      if (index < current) {
        return current - 1;
      }
      if (index === current) {
        return Math.max(0, Math.min(current, segments.length - 2));
      }
      return current;
    });
    setSegments(segments.filter((_, i) => i !== index));
  };

  const moveSegment = (index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= segments.length) return;
    setActivePreviewFrameIndex((current) => {
      if (current === index) {
        return target;
      }
      if (current === target) {
        return index;
      }
      return current;
    });
    const next = [...segments];
    [next[index], next[target]] = [next[target], next[index]];
    setSegments(next);
  };


  // 初始加载中状态：显示 loading 界面
  if (isInitialLoading && !projectData.projectId) {
    return (
      <div className="flex h-full min-h-screen w-full items-center justify-center bg-[#FDFBF7]">
        <div className="flex flex-col items-center gap-4">
          <span className="material-icons-round animate-spin text-4xl text-[#e07a5f]">autorenew</span>
          <span className="text-sm font-medium text-gray-600">加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-[#FDFBF7]">
      <FullScriptModal
        isOpen={showFullScript}
        value={resolveSharedFullScriptDraft(fullScriptDraft, segments)}
        isSaving={isSaving}
        onChange={setFullScriptDraft}
        onClose={() => setShowFullScript(false)}
        onSave={handleSaveFullScript}
      />
      <ImageLightbox
        open={imagePreview !== null}
        url={imagePreview?.imageUrl ?? ""}
        alt={imagePreview?.label ?? "图片预览"}
        label={imagePreview?.label}
        onClose={() => setImagePreview(null)}
      />
      {step3MaskEditorBridge.modal}
      {/* 确认锁定 loading */}
      {isConfirmingLockLoading && (
        <div className="fixed bottom-32 left-1/2 z-[100] -translate-x-1/2 flex items-center gap-3 rounded-full bg-white px-6 py-3 shadow-xl">
          <span className="material-icons-round animate-spin text-xl text-[#e07a5f]">autorenew</span>
          <span className="text-sm font-semibold text-gray-800">智能导演规划中...</span>
        </div>
      )}
      <input
        ref={importInputRef}
        type="file"
        accept=".txt,.md"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (isStep3HardLocked) {
            setFeedback(step3CandidateLockReason ?? "当前脚本源已锁定，无法导入脚本。");
            event.currentTarget.value = "";
            return;
          }
          void handleImportScript(file);
          event.currentTarget.value = "";
        }}
      />
      <ProjectFlowHistorySidebar
        currentStep={3}
        projectId={urlProjectId || projectData.projectId!}
        onImagePreview={(frames, currentIndex) => {
          const frame = frames[currentIndex];
          if (frame?.imageUrl) {
            setImagePreview({ imageUrl: frame.imageUrl, label: frame.title || "" });
          }
        }}
      >

        {/* 脚本工具区 */}
        <div className="px-6 py-4">
          {(() => {
            const activeCandidate = resolveActiveStep3Candidate();
            // 格式化时长
            const formatDuration = (sec?: number) => {
              if (!sec) return null;
              const min = Math.floor(sec / 60);
              const remainSec = sec % 60;
              if (min > 0 && remainSec > 0) return `${min}分${remainSec}秒`;
              if (min > 0) return `${min}分钟`;
              return `${sec}秒`;
            };
            const suitabilityLabels: Record<string, { label: string; className: string }> = {
              high: { label: "高适用", className: "bg-emerald-100 text-emerald-700" },
              medium: { label: "中适用", className: "bg-amber-100 text-amber-700" },
              low: { label: "低适用", className: "bg-red-100 text-red-700" },
            };
            return (
              <div
                ref={step3SidebarCardRef}
                data-testid="script-fly-target"
                className="cursor-pointer rounded-2xl border border-[#e07a5f]/20 bg-gradient-to-br from-[#faf6f2] to-[#f7f1ea] px-4 py-3 hover:border-[#e07a5f]/40 hover:shadow-md group/sidecard"
                onClick={() => {
                  step3ScriptSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {/* 标题行 */}
                <div className="flex items-center gap-2">
                  <span className="material-icons-round text-base text-[#e07a5f]">article</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#c45a42]">当前脚本</span>
                  {isStep3HardLocked && (
                    <span className="ml-auto flex items-center gap-1 rounded-full bg-[#e07a5f]/10 px-2 py-0.5">
                      <span className="material-icons-round text-[10px] text-[#e07a5f]">lock</span>
                      <span className="text-[9px] font-semibold text-[#e07a5f]">已锁定</span>
                    </span>
                  )}
                  {!isStep3HardLocked && (
                    <span className="ml-auto opacity-0 transition-opacity group-hover/sidecard:opacity-100">
                      <span className="material-icons-round text-xs text-[#e07a5f]">north_west</span>
                    </span>
                  )}
                </div>

                {/* 脚本标题 */}
                <div className="mt-2 text-sm font-semibold text-gray-800 truncate">
                  {activeCandidate?.title || (fullScriptDraft.trim() ? `${segments.length} 个分镜` : "尚未选择")}
                </div>

                {/* 副标题 */}
                {activeCandidate?.subtitle && (
                  <div className="text-[11px] text-gray-500 truncate mt-0.5">{activeCandidate.subtitle}</div>
                )}

                {/* 脚本内容概要 */}
                {(() => {
                  const summary = activeCandidate?.summary || activeCandidate?.preview || activeCandidate?.subtitle;
                  return summary ? (
                    <p className="mt-1.5 text-[11px] leading-[1.5] text-gray-500 line-clamp-2">
                      {summary}
                    </p>
                  ) : null;
                })()}

                {/* 元信息行 */}
                {(activeCandidate?.durationSec || activeCandidate?.shotCount || activeCandidate?.suitability || segments.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {/* 时长 */}
                    {activeCandidate?.durationSec && (
                      <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-500">
                        <span className="material-icons-round text-[12px]">schedule</span>
                        {formatDuration(activeCandidate.durationSec)}
                      </span>
                    )}
                    {/* 镜头数 */}
                    {(activeCandidate?.shotCount ?? segments.length) > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                        <span className="material-icons-round text-[12px] text-[#c45a42]/60">filter_frames</span>
                        {activeCandidate?.shotCount ?? segments.length} 镜
                      </span>
                    )}
                    {/* 适用度 */}
                    {activeCandidate?.suitability && suitabilityLabels[activeCandidate.suitability] && (
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${suitabilityLabels[activeCandidate.suitability].className}`}>
                        {suitabilityLabels[activeCandidate.suitability].label}
                      </span>
                    )}
                  </div>
                )}

                {/* 标签 */}
                {activeCandidate?.tags && activeCandidate.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {activeCandidate.tags.slice(0, 4).map((tag, ti) => (
                      <span
                        key={ti}
                        className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* 引导提示 */}
                <div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-[#e07a5f]/70">
                  <span className="material-icons-round text-xs">touch_app</span>
                  <span>点击查看选中脚本</span>
                </div>
              </div>
            );
          })()}
        </div>
      </ProjectFlowHistorySidebar>

      <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <StepContentHeader stepNumber={3} title="脚本与分镜" icon="article" subtitle="脚本已就绪，确认选用后即可进入下一步。" badges={
          step3Locked ? <span className="inline-flex items-center gap-1 text-amber-600"><span className="material-icons-round text-sm">lock</span>已锁定</span> : (
            <>
              {visibleScriptCandidates.length > 0 && <span>项目候选脚本已同步</span>}
              {feedback && <span className="max-w-[200px] truncate">{feedback}</span>}
            </>
          )
        } />

        <div className={`custom-scrollbar min-h-0 flex-1 overflow-y-auto pt-6 px-6 md:px-10 ${FLOW_SAFE_BOTTOM_PADDING.step3Workspace}`}>
          <div ref={step3ScriptSectionRef} className="max-w-7xl mx-auto space-y-8">
            <Step3StructuredScriptCandidatesPanel
              candidates={visibleScriptCandidates}
              selectedCandidateId={selectedCandidateId}
              projectId={urlProjectId || projectData.projectId!}
              // 【情况 A】已确认：根据项目状态判断（>= SCRIPT_CONFIRMED）
              isConfirmed={isScriptConfirmedByStatus}
              initialLoading={(isPreFetchingScripts || sseIsLoading || isConfirmingCandidate || loadingConfirmedScript) && visibleScriptCandidates.length < 1}
              skeletonCount={2}
              isReverse={false}
              forceLocked={isStep3HardLocked}
              unlockLoading={isUnlockingCandidate}
              refreshLoading={isRefreshingCandidates}
              isAdmin={isAdmin}
              loadingState={sseLoadingState}
              availableCount={sseAvailableItems.length}
              onRetryType={sseRetryType}
              availableStrategies={sseAvailableStrategies}
              onPickCandidate={(candidate, startRect) => {
                void handlePickCandidate(candidate, startRect);
              }}
              onRefreshCandidates={() => {
                void handleRefreshStep3Candidates();
              }}
              onAdminUnlockCandidate={() => {
                void handleAdminUnlockCandidate();
              }}
              onMinimizeToSquare={() => navigate('/dashboard')}
            />

            {/* 推荐脚本选择与分镜提示词编辑之间的分界线 */}
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

            <div
              ref={step3StoryboardSectionRef}
              className={"space-y-3"}
            >
              <div
                ref={step3GuardToastAnchorRef}
                className={step3GuardToast ? "min-h-[72px]" : "min-h-0"}
              >
                {step3GuardToast ? (
                  <div className="flex justify-center pb-2">
                    <div className="pointer-events-none w-[min(92vw,560px)] rounded-2xl border border-emerald-300 bg-emerald-500 px-5 py-3 text-center text-sm font-bold text-white shadow-[0_18px_40px_rgba(16,185,129,0.28)] animate-[pulse_0.7s_ease-in-out_3]">
                      {step3GuardToast}
                    </div>
                  </div>
                ) : null}
              </div>
              {isConfirmingCandidate ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-500" />
                  <span className="text-sm text-gray-500">
                    正在锁定脚本…
                  </span>
                </div>
              ) : (
              <div className={"grid grid-cols-1 gap-3 lg:grid-cols-3"}>
                <div className={"flex items-center justify-end px-2 lg:col-span-3"}>
                  <span className="text-xs text-gray-400">共 {segments.length} 个镜头</span>
                </div>

                {segments.map((segment, index) => {
                  const frameOverrideViewModel = resolveStep3FrameOverrideViewModel({
                    frameIndex: index + 1,
                    global: {
                      ratio: step4BatchRatio,
                      resolution: step4BatchResolution,
                    },
                    overrideState: step3FrameOverrideSettings,
                  });
                  const storyboardCardViewModel = buildStep3StoryboardCardViewModel({
                    segment: {
                      frameIndex: index + 1,
                      time: segment.time,
                      durationSec: (segment as unknown as Record<string, unknown>).durationSec as number | undefined,
                      title: segment.title,
                      content: segment.content,
                      visualCue: segment.visualCue,
                      visualPrompt: segment.visualPrompt,
                      selectedCharacterReferenceId: null,
                      shot_description: segment.shot_description,
                    },
                    roleReferences: step3CharacterReferenceItems,
                    sceneReference: null,
                  });
                  const previewViewModel = buildStep3PreviewCardViewModel({
                    frameIndex: index + 1,
                    timeLabel: storyboardCardViewModel.timeLabel,
                    title: storyboardCardViewModel.title,
                    narration: storyboardCardViewModel.narration,
                    mainVisualPrompt: storyboardCardViewModel.mainVisualPrompt,
                    frameParameterSummary: frameOverrideViewModel.summary,
                    sceneImageUrl: frameSelectedImageByUrl[index + 1] ?? segment.sceneImageUrl ?? null,
                    selectedRoleReference: null,
                    sceneReference: null,
                  });
                  const previewJob = previewJobsByFrame[index + 1];
                  const isPreviewGenerating = Boolean(previewGenerationLoading[index + 1]);
                  const previewGenerationStartedAt =
                    isPreviewGenerating && typeof previewJob?.updatedAt === "number" && Number.isFinite(previewJob.updatedAt)
                      ? Math.max(0, Math.floor(previewJob.updatedAt))
                      : null;

                  // 批量生图是否进行中
                  const batchBusy = step3BatchState.running || step3BatchState.queued > 0 || step3BatchState.active > 0;

                  return (
                    <Step3CompactStoryboardCard
                        key={`segment-${index}`}
                        viewModel={storyboardCardViewModel}
                        frameParameterSummary={frameOverrideViewModel.summary}
                        previewViewModel={previewViewModel}
                        isPreviewGenerating={isPreviewGenerating}
                        previewGenerationStartedAt={previewGenerationStartedAt}
                        previewRetryCreditCost={step3SinglePreviewCreditCost}
                        previewErrorMessage={frameErrors[index + 1] ?? null}
                        canMoveUp={index > 0}
                        canMoveDown={index < segments.length - 1}
                        isActivePreviewFrame={index === boundedActivePreviewFrameIndex}
                        isBatchBusy={batchBusy}
                        isConfirmingLock={step3BatchConfirming}
                        isPromptGenerating={isPromptGenerating}
                        isLocked={isStep3HardLocked}
                        hasFrameDbRecord={frameDbRecords.has(index + 1)}
                        onMainPromptChange={(value) => handleTextChange(index, "visualCue", value)}
                        onGeneratePreviewImage={() => void handleGeneratePreviewImage(index + 1)}
                        onMove={(direction) => moveSegment(index, direction)}
                        onDelete={() => deleteSegment(index)}
                        onActivatePreviewFrame={() => {
                          setActivePreviewFrameIndex(index);
                        }}
                        onPreviewImage={(imageUrl, label) => setImagePreview({ imageUrl, label })}
                        candidateImageUrls={previewCandidatesByFrame[index + 1] ?? []}
                        onSelectCandidateImage={(imageUrl) => {
                          if (!token || !projectData.projectId) return;
                          backendApi.selectStep3FrameImage(token, projectData.projectId, index + 1, imageUrl)
                            .then(() => {
                              setFrameSelectedImageByUrl((prev) => ({ ...prev, [index + 1]: imageUrl }));
                              toast.success(`镜头 ${index + 1} 预览图已切换`);
                            })
                            .catch((err) => {
                              console.error("[Step3] selectStep3FrameImage failed:", err);
                              toast.error("切换预览图失败，请重试");
                            });
                        }}
                      />
                  );
                })}

                {/* 添加分镜按钮暂时隐藏，后续可能开放 */}
              </div>
              )}

              {/* 回到脚本按钮 */}
              <div className="flex justify-center py-4">
                <button
                  type="button"
                  onClick={() => {
                    step3ScriptSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#d1cbc4]/30 bg-white px-5 py-2.5 text-sm font-bold text-[#2d3335] shadow-sm transition-all hover:border-[#e07a5f]/40 hover:text-[#e07a5f] hover:shadow-md"
                >
                  <span className="material-icons-round text-sm">article</span>
                  回到脚本
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Step3GlobalControlBar
        savedLabel={projectData.activeScriptId ? `已保存 v${workflow.scriptVersion ?? 1}` : "尚未保存"}
        ratio={step4BatchRatio}
        resolution={step4BatchResolution}
        threadCount={step3BatchThreadCount}
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
        isPromptGenerating={isPromptGenerating}
        isScriptLoading={sseIsLoading && visibleScriptCandidates.length < 1}
        creditPricingLoaded={creditPricingLoaded}
        onBack={() => { const pid = projectData.projectId ?? urlProjectId; navigate(`/create/${pid}/step2`); }}
        onRatioChange={(value) => setPreviewRatio(normalizeStep4PreviewRatio(value))}
        onResolutionChange={(value) =>
          setPreviewResolution(normalizeStep4PreviewResolution(value))
        }
        onThreadCountChange={(value) => {
          const normalized = normalizeStep3BatchThreadCount(value);
          setStep3BatchThreadCount(normalized);
          setStep3BatchState((current) => ({
            ...current,
            threadCount: normalized,
          }));
        }}
        onBatchAction={(action) => {
          void handleStep3BatchAction(action);
        }}
        onNext={async () => {
          // 锁定模式下直接跳转到 Step4，不做其他操作
          if (step3Locked) {
            const pid = projectData.projectId ?? urlProjectId;
            navigate(`/create/${pid}/step4`);
            return;
          }

          let nextSegments = sanitizeStep3SegmentsForWorkflowTransition<ScriptSegment>(
            segments,
          );
          const missingPromptIndexes = nextSegments
            .map((segment, index) => ({ segment, index }))
            .filter(({ segment }) => (segment.visualPrompt?.trim() || segment.visualCue.trim()).length < 1)
            .map(({ index }) => index + 1);
          if (missingPromptIndexes.length > 0) {
            const message = `请先补全分镜提示词（镜头：${missingPromptIndexes.join("、")}）。`;
            setFeedback(message);
            showStep3GuardToast(message);
            return;
          }
          const previewGeneratingIndexes = nextSegments
            .map((_, index) => index + 1)
            .filter((frameIndex) => {
              if (previewGenerationLoading[frameIndex]) {
                return true;
              }
              return previewJobsByFrame[frameIndex]?.status === TaskStatus.RUNNING;
            });
          if (previewGeneratingIndexes.length > 0) {
            const message = `镜头 ${previewGeneratingIndexes.join("、")} 的主预览图仍在生成中，请等待完成后再进入 Step4。`;
            setFeedback(message);
            showStep3GuardToast(message);
            return;
          }
          const missingPreviewImageIndexes = nextSegments
            .map((segment, index) => ({
              index: index + 1,
              imageUrl: (typeof segment.sceneImageUrl === "string" ? segment.sceneImageUrl.trim() : "")
                || frameSelectedImageByUrl[index + 1]?.trim() || "",
            }))
            .filter((item) => item.imageUrl.length < 1)
            .map((item) => item.index);
          if (missingPreviewImageIndexes.length > 0) {
            const estimatedMinutes = Math.max(1, missingPreviewImageIndexes.length * 2);
            const message = `请先生成所有镜头的主预览图（缺失镜头：${missingPreviewImageIndexes.join(
              "、",
            )}）。翻倍预估补齐时长约 ${estimatedMinutes} 分钟；可点击底部「批量」按钮生图，或点击每张图右上角按钮单独生成。当前不会触发 Step4 视频任务。`;
            setFeedback(message);
            showStep3GuardToast(message);
            return;
          }
          // 将数据库恢复的选中图片回写到 segments，确保 Step4 handoff 数据完整
          nextSegments = nextSegments.map((seg, idx) => {
            const restoredUrl = frameSelectedImageByUrl[idx + 1]?.trim();
            if (restoredUrl && (!seg.sceneImageUrl || !seg.sceneImageUrl.trim())) {
              return { ...seg, sceneImageUrl: restoredUrl };
            }
            return seg;
          });

          // 确认弹窗：进入视频生成不可回退
          const shouldProceed = await confirm(
            "即将锁定脚本并进入视频生成阶段，该操作不可回退。是否继续？",
            "进入视频生成",
          );
          if (!shouldProceed) return;

          // 确认后立即更新项目状态为 FILMING
          try {
            await backendApi.updateProjectStatus(token!, projectData.projectId!, "FILMING");
            // 同步更新前端 store 状态，确保 Step4 准入检查通过
            updateProjectData({ projectStatus: "FILMING" });
          } catch (e) {
            console.error("[Step3] Failed to update project status to FILMING:", e);
          }
          const autoSaveTextRaw = nextSegments.map((segment) => segment.content).join("\n").trim();
          const autoSaveText =
            autoSaveTextRaw.length > 0
              ? autoSaveTextRaw
              : nextSegments
                .map((segment) => (segment.visualPrompt?.trim() || segment.visualCue.trim()))
                .filter((item) => item.length > 0)
                .join("\n");
          const nextProjectDataPatch = buildStep3Step4HandoffProjectDataPatch({
            projectId: projectData.projectId ?? "",
            scriptId: projectData.activeScriptId,
            scriptVersion: (workflow.scriptVersion as number | undefined) ?? null,
            segments: nextSegments,
            step4PreviewRatio: step4BatchRatio,
            step4PreviewResolution: step4BatchResolution,
            step4PreviewSharpness:
              typeof workflow.videoPreviewSharpness === "number" ? workflow.videoPreviewSharpness : 70,
            step4FrameOverrideSettings: workflow.videoFrameOverrideSettings,
          });
          setSegments(nextSegments);
          const step4AutoStartOnEnterToken = shouldChargeForFirstStep4VideoGeneration
            ? `step4-autostart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            : null;
          setStep4HandoffData(
            shouldChargeForFirstStep4VideoGeneration
              ? {
                ...nextProjectDataPatch,
                clipStatuses: [],
                step4SceneVariantsByScene: {},
                step4SelectedVariantByScene: {},
                step4AutoStartOnEnterToken,
              }
              : {
                ...nextProjectDataPatch,
                step4AutoStartOnEnterToken: null,
              },
          );
          void enqueuePersistScript(
            autoSaveText.length > 0 ? autoSaveText : "自动保存分镜脚本",
            {
              sourceType: "original",
              silent: true,
              segmentsOverride: nextSegments,
              mirrorToLibrary: false,
              background: true,
            },
          );


          const pid = projectData.projectId ?? urlProjectId;
          navigate(`/create/${pid}/step4`);
        }}
      />
    </div>
  );
};
