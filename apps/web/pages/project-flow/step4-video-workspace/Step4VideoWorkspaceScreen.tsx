import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from 'react-router';
import { Button } from "../../../components/ui/Button";
import { CreditBadge } from "../../../components/ui/CreditBadge";
import { useConfirm, useAlert } from "../../../components/ui/ConfirmDialog";
import { FullScreenLoading } from "../../../components/shared/FullScreenLoading";
import { ImageLightbox } from "../../../components/shared/ImageLightbox";
import { useAppStore, type ProjectState } from "../../../store/useAppStore";
import { useShallow } from 'zustand/react/shallow';
import { useStep4VideoJobs } from "./useStep4VideoJobs";
import { useStep4Data } from "./useStep4Data";

// React 19: 缓存空对象，避免 selector 每次返回新引用导致 useSyncExternalStore 无限循环
const EMPTY_WORKFLOW: Record<string, unknown> = {};
import { ApiError, backendApi } from "../../../services/backendApi";
import { realProjectsApi } from "../../../services/realApi";
import type { VideoMusicDto, VideoMusicMatchResultDto, ProjectVideoMusicDto } from "../../../services/backendApi.videoMusic";
import {
  createDefaultCharacterWorkflowSystemSettings,
  type CharacterWorkflowSystemSettings,
} from "../../../../../src/contracts/character-workflow-system-settings";
import type { Step4VideoFrameHandoffEntry } from "../../../../../src/contracts/step4-video-workspace-contract";
import { isStatusBeyond } from "../../../../../src/contracts/types";
import type { ProjectStatus } from "../../../../../src/contracts/types";
import { FLOW_SAFE_BOTTOM_PADDING } from "../safeBottomPadding";
import { buildFlow41CanonicalRoute } from "../flow41RouteNormalization";
import {
  STEP2_RUNTIME_PROGRESS_LOADING_POSTER_SRC,
  STEP2_RUNTIME_PROGRESS_LOADING_VIDEO_SRC,
} from "../../../../../src/contracts/step2-runtime-progress-contract";
import {
  buildStep4VideoClipStatusesFromJob,
  buildClipStatusesFromScenes,
  isStep4VideoAsset,
  mergeStep4FrameImageUrls,
  resolveStep4ResumeVideoJob,
  startStep4VideoJob,
  type Step4VideoClipStatus,
  type Step4VideoJobDto,
  type Step4VideoJobSegment,

} from "./step4VideoJobOrchestrator";
import type { Step4ScriptSegment } from "../../../services/realApi/projects";
import {
  buildStep4PreviewCardModel,
  Step4PreviewWorkspaceHeader,
} from "./step4PreviewWorkspace";
import {
  PROJECT_FLOW_MEDIA_CHROME_Z_CLASS,
  PROJECT_FLOW_MEDIA_HOVER_OVERLAY_Z_CLASS,
  PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS,
} from "../projectFlowMediaLayerGuard";
import { useRuntimeLoadingPosterFrameSrc } from "../runtimeLoadingPosterFrame";
import { buildStep5DeliveryProjectDataPatch } from "../step5-delivery-shell/step5ResultConsumptionContract";
import { Step4FinalVideoMergeLoading } from "./Step4FinalVideoMergeLoading";
import { Step4VideoWorkspaceConfigDrawer } from "./Step4VideoWorkspaceConfigDrawer";
import {
  checkCreditsBalance,
  DEFAULT_PROJECT_FLOW_CREDIT_PRICING,
  loadProjectFlowCreditPricing,
  normalizeProjectFlowCreditPricing,
  resolveProjectFlowCreditSpendErrorMessage,
  spendProjectFlowCredits,
  selectCreditCostByAge,
} from "../projectFlowCredit";
import {
  DEFAULT_STEP4_MUSIC_STATE,
  fetchStep4MusicRecommendation,
  resolveStep4SelectedMusic,
  extractMusicsFromRecommendation,
  buildRecommendationFromProjectVideoMusics,
  type Step4MusicState,
} from "./step4MusicController";
import { Step4MusicCompact } from "./step4MusicCompact";
import { Step4VideoVariantSelector, type Step4VideoVariantViewModel } from "./step4VideoVariantSelector";
import { Step4VariantPreviewModal } from "./step4VariantPreviewModal";
import { mergeVideosWithTransitions, checkVideoMergeSupport, type MusicOptions } from "../../../libs/video-merge";
import type { BeatDetectResult } from "../../../libs/beat-detect";
import { uploadBlobToOss } from "../../../services/ossUpload";
import { getOssThumbnailUrl, getOssVideoSnapshotUrl } from "../../../utils/ossImage";
import {
  ProjectFlowHistorySidebar,
  type StoryboardFrameForPreview,
  StepContentHeader,
} from "../../../components/project-flow";
import {
  dedupeSceneAssets,
  isStep4PendingProviderMessage,
  normalizeStep4SceneVariantsByScene,
  normalizeStep4SelectedVariantByScene,
  serializeStep4SceneVariantsByScene,
  serializeStep4SelectedVariantByScene,
  normalizeAspectRatioCss,
  normalizeStep4ThreadCount,
  reorderArrayByIndices,
  buildStep4SceneOrderKey,
  normalizeStep4SceneOrderKeys,
  resolveStep4SceneOrderIndices,
} from "./step4-utils";
import { Step4CoverCard } from "./step4CoverCard";
import { Step4CoverSelectorModal } from "./step4CoverSelectorModal";
import { Step4TransitionPreview } from "./step4TransitionSelector";

export const Step4VideoWorkspaceScreen: React.FC = () => {
  const navigate = useNavigate();
  const { projectId: urlProjectId } = useParams<{ projectId: string }>();
  const { confirm } = useConfirm();
  const { alert } = useAlert();
  const { token, pushTaskNotification, setGlobalTimerStart, showGlobalLoading, hideGlobalLoading, updateProjectDataForProject } = useAppStore(useShallow((state) => ({ token: state.token, pushTaskNotification: state.pushTaskNotification, setGlobalTimerStart: state.setGlobalTimerStart, showGlobalLoading: state.showGlobalLoading, hideGlobalLoading: state.hideGlobalLoading, updateProjectDataForProject: state.updateProjectDataForProject })));
  // 直接从 Zustand store 读取 projectData 和 workflow（由 ProjectLayout 初始化）
  const projectData = useAppStore((state) =>
    (urlProjectId ? state.projectStateMap[urlProjectId]?.projectData : undefined) as ProjectState | undefined,
  );
  const workflow = useAppStore((state) =>
    urlProjectId ? (state.projectStateMap[urlProjectId]?.workflow ?? EMPTY_WORKFLOW) : EMPTY_WORKFLOW,
  );
  const updateProjectData = useCallback(
    (patch: Partial<ProjectState>) => {
      if (!urlProjectId) return;
      updateProjectDataForProject(urlProjectId, patch);
    },
    [urlProjectId, updateProjectDataForProject],
  );
  // 使用 API 加载 Step4 数据（替代 workflow store 依赖）
  const step4ApiData = useStep4Data(token, urlProjectId ?? null);

  // 分镜脚本段落：优先使用 API 数据
  // 分镜段落：API 数据直接转为 Step4VideoJobSegment（消费端最小需求）
  // videoCue 从 visualPrompt 派生（后端不返回独立 videoCue 字段）
  const segments = useMemo<Step4VideoJobSegment[]>(() => {
    if (step4ApiData.segments.length > 0) {
      return step4ApiData.segments.map((seg) => ({
        content: seg.content ?? "",
        visualCue: seg.visualCue ?? "",
        videoCue: seg.visualPrompt || seg.visualCue,
      }));
    }
    return [];
  }, [step4ApiData.segments]);

  // 场景排序 key：直接基于 segment 内容构建
  const sceneOrderKeys = useMemo(
    () => segments.map((segment, index) => buildStep4SceneOrderKey(segment, index)),
    [segments],
  );
  const currentSceneOrderSignature = useMemo(() => sceneOrderKeys.join("|"), [sceneOrderKeys]);

  // clipStatus 本地覆盖层：在 API 数据基础上覆盖指定镜头的状态（不触发 API 刷新）
  const [clipStatusOverrides, setClipStatusOverrides] = useState<Map<number, Partial<Step4VideoClipStatus>>>(new Map());

  // 模拟进度：generating 片段的前端递增进度（外部 API 无中间进度回调）
  const SIMULATED_PROGRESS_BASE = 5;   // 进度起点
  const SIMULATED_PROGRESS_STEP = 6;   // 每 3 秒递增量（~45 秒到 95%）
  const [simulatedProgressMap, setSimulatedProgressMap] = useState<Map<number, number>>(new Map());

  // baseClipStatuses：从 API 数据构建（不含模拟进度，避免循环依赖）
  const baseClipStatuses = useMemo(() => {
    if (step4ApiData.scenes.length > 0) {
      return buildClipStatusesFromScenes(step4ApiData.scenes, segments);
    }
    return [];
  }, [segments, step4ApiData.scenes]);

  // 每 3 秒递增 generating 片段的模拟进度（含本地覆盖的 generating 状态）
  useEffect(() => {
    // 合并 base + overrides，找出所有 generating 镜头
    const generatingIndices = baseClipStatuses
      .map((s, i) => {
        const override = clipStatusOverrides.get(i);
        return override?.status === "generating" ? i : s.status === "generating" ? i : -1;
      })
      .filter((i) => i >= 0);

    if (generatingIndices.length === 0) {
      if (simulatedProgressMap.size > 0) setSimulatedProgressMap(new Map());
      return;
    }

    const id = setInterval(() => {
      setSimulatedProgressMap((prev) => {
        const next = new Map<number, number>();
        for (const index of generatingIndices) {
          const current = prev.get(index) ?? SIMULATED_PROGRESS_BASE;
          next.set(index, Math.min(95, current + SIMULATED_PROGRESS_STEP));
        }
        return next;
      });
    }, 3000);

    return () => clearInterval(id);
  }, [baseClipStatuses, clipStatusOverrides]); // eslint-disable-line react-hooks/exhaustive-deps

  // clipStatuses：合并 base + 本地覆盖 + 模拟进度
  const clipStatuses = useMemo(() => {
    if (baseClipStatuses.length === 0) return [];
    return baseClipStatuses.map((item, index) => {
      const override = clipStatusOverrides.get(index);
      const merged = override ? { ...item, ...override } : item;
      // generating 状态：叠加模拟进度
      if (merged.status === "generating") {
        const simulated = simulatedProgressMap.get(index);
        return { ...merged, progress: simulated ?? SIMULATED_PROGRESS_BASE };
      }
      return merged;
    });
  }, [baseClipStatuses, clipStatusOverrides, simulatedProgressMap]);

  // 分镜图片 URL：从 API 数据获取
  const handoffFrameImageUrls = useMemo(
    () => {
      if (step4ApiData.frameImages.length > 0) {
        const sortedFrames = [...step4ApiData.frameImages].sort((a, b) => a.frameIndex - b.frameIndex);
        return sortedFrames.map((frame) => frame.imageUrl?.trim() ?? "");
      }
      return Array.from({ length: segments.length }, () => "");
    },
    [step4ApiData.frameImages, segments.length],
  );

  // 场景变体：从 API 数据获取
  const persistedSceneVariantsByScene = useMemo(() => {
    if (step4ApiData.scenes.length > 0) {
      const result: Record<number, string[]> = {};
      step4ApiData.scenes.forEach((scene) => {
        if (scene.variantUrls && scene.variantUrls.length > 0) {
          result[scene.sceneIndex] = scene.variantUrls;
        }
      });
      return result;
    }
    return {};
  }, [step4ApiData.scenes]);

  // 选中的变体：从 API 数据获取
  const persistedSelectionsByScene = useMemo(() => {
    if (step4ApiData.scenes.length > 0) {
      const result: Record<number, number> = {};
      step4ApiData.scenes.forEach((scene) => {
        if (scene.selectedIndex !== undefined && scene.selectedIndex !== null) {
          result[scene.sceneIndex] = scene.selectedIndex;
        }
      });
      return result;
    }
    return {};
  }, [step4ApiData.scenes]);

  // 场景变体状态（需在 useEffect 之前声明）
  const [sceneVariants, setSceneVariants] = useState<Record<number, string[]>>(persistedSceneVariantsByScene);
  const [selections, setSelections] = useState<Record<number, number>>(persistedSelectionsByScene);

  // 【关键修复】当 API 数据变化时，同步到 sceneVariants 和 selections 状态
  // useState 初始值只在首次渲染时生效，需要 useEffect 同步后续更新
  useEffect(() => {
    if (Object.keys(persistedSceneVariantsByScene).length === 0) {
      return;
    }

    // 精确判断：检测到新数据时才更新（新场景、URL 数量变化、或 URL 内容变化）
    const hasNewData = Object.entries(persistedSceneVariantsByScene).some(
      ([sceneIndex, urls]) => {
        const currentUrls = sceneVariants[Number(sceneIndex)];
        if (!currentUrls) return true;
        if (urls.length !== currentUrls.length) return true;
        return urls.some((url, i) => url !== currentUrls[i]);
      }
    );

    if (hasNewData) {
      setSceneVariants(persistedSceneVariantsByScene);
      console.log(`[Step4] 检测到新数据，更新 sceneVariants: ${Object.keys(persistedSceneVariantsByScene).length} 个分镜`);
    }
  }, [persistedSceneVariantsByScene, sceneVariants]);

  useEffect(() => {
    if (Object.keys(persistedSelectionsByScene).length > 0) {
      setSelections(persistedSelectionsByScene);
      console.log(`[Step4] 从 API 同步 selections: ${Object.keys(persistedSelectionsByScene).length} 个分镜`);
    }
  }, [persistedSelectionsByScene]);

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [, setActiveJobStatus] = useState<Step4VideoJobDto["status"] | null>(null);
  // 【新增】追踪正在运行的多个任务
  const [runningJobIds, setRunningJobIds] = useState<Set<string>>(new Set());
  const [, setJobAttempts] = useState(1);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [, setFeedbackCopied] = useState(false);
  const [showMusicPrinciple, setShowMusicPrinciple] = useState(false);
  const [showMobileConfig, setShowMobileConfig] = useState(false);
  const [, setCharacterWorkflowSettings] = useState<CharacterWorkflowSystemSettings>(
    createDefaultCharacterWorkflowSystemSettings(),
  );
  const [creditPricing, setCreditPricing] = useState(DEFAULT_PROJECT_FLOW_CREDIT_PRICING);
  const [loadingSceneAssets, setLoadingSceneAssets] = useState(handoffFrameImageUrls.every((item) => item.length < 1));
  /** 页面初始恢复是否完成：控制重试按钮在数据加载完成前不可点击 */
  const [initialRecoveryDone, setInitialRecoveryDone] = useState(false);
  const [startingJob, setStartingJob] = useState(false);
  const [lastCompletedClipId, setLastCompletedClipId] = useState<number | null>(null);
  const [frameImageUrls, setFrameImageUrls] = useState<string[]>(handoffFrameImageUrls);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeProgress, setMergeProgress] = useState(0);
  const [mergeStatus, setMergeStatus] = useState("");
  const [browserMergeSupported, setBrowserMergeSupported] = useState<boolean | null>(null);
  /** 正在提交重试的镜头索引集合，点击后立即禁用按钮防止重复提交 */
  const [retryingSceneIndices, setRetryingSceneIndices] = useState<Set<number>>(new Set());
  const [previewModal, setPreviewModal] = useState<{
    sceneIndex: number;
    variantIndex: number;
    url: string;
  } | null>(null);
  /** 分镜内容详情弹窗：存储 sceneIndex */
  const [contentDetailSceneIndex, setContentDetailSceneIndex] = useState<number | null>(null);
  const [manualBatchQueueEnabled, setManualBatchQueueEnabled] = useState(false);
  const [queuedManualBatchStart, setQueuedManualBatchStart] = useState(false);
  const [previewSequenceAutoPlaying, setPreviewSequenceAutoPlaying] = useState(false);
  const [step4ThreadCount, setStep4ThreadCount] = useState(3); // 本地状态：并发线程数
  const [musicState, setMusicState] = useState<Step4MusicState>(DEFAULT_STEP4_MUSIC_STATE);
  // 卡点剪辑相关状态
  const [beatSyncEnabled, setBeatSyncEnabled] = useState(false);
  const [beatSyncIntensity, setBeatSyncIntensity] = useState<"relaxed" | "standard" | "strict">("standard");
  const [beatDetectResult, setBeatDetectResult] = useState<BeatDetectResult | null>(null);
  // 封面相关状态：初始为空，等待 API 数据加载后更新
  const [selectedCoverUrl, setSelectedCoverUrl] = useState<string>("");
  const [coverSelectorOpen, setCoverSelectorOpen] = useState(false);
  // 转场预览展开状态（默认展开）
  const [showTransitionPreview, setShowTransitionPreview] = useState(true);
  // 最近一次合成使用的转场 ID 列表
  const [usedTransitionIds, setUsedTransitionIds] = useState<string[]>([]);

  // 封面初始化：优先使用持久化的封面，否则使用第一张分镜图
  // 使用 ref 追踪是否已初始化，避免无限循环
  const coverInitializedRef = useRef(false);
  useEffect(() => {
    // 已初始化则跳过
    if (coverInitializedRef.current) return;
    // 优先使用持久化的视频封面（从 projectData.videoCoverImageUrl 获取）
    const persistedCover = projectData?.videoCoverImageUrl?.trim() ?? "";
    if (persistedCover) {
      setSelectedCoverUrl(persistedCover);
      coverInitializedRef.current = true;
      return;
    }
    // 否则使用第一张分镜图
    if (step4ApiData.frameImages.length > 0) {
      const sortedFrames = [...step4ApiData.frameImages].sort((a, b) => a.frameIndex - b.frameIndex);
      const firstFrameUrl = sortedFrames[0]?.imageUrl?.trim();
      if (firstFrameUrl) {
        setSelectedCoverUrl(firstFrameUrl);
        coverInitializedRef.current = true;
      }
    }
  }, [step4ApiData.frameImages, projectData?.videoCoverImageUrl]);

  const startedInitialJobRef = useRef(0);
  const completedCountRef = useRef(0);

  // 步骤锁定：根据项目状态判断 Step4 是否只读
  const step4Locked = isStatusBeyond(
    projectData?.projectStatus as ProjectStatus | undefined,
    "FILMING",
  );

  // 从 workflow 读取服装数据
  const garmentModules = (workflow.videoGarmentModules as unknown[]) ?? [];

  const lastAutoSelectedPrimaryVideoBySceneRef = useRef<Record<number, string>>({});
  const variantToggleExpandMapRef = useRef<Map<number, () => void>>(new Map());
  const resetStateProjectIdRef = useRef<string | null>(null);
  const sceneOrderSyncInFlightRef = useRef(false);
  const pendingSceneOrderSignatureRef = useRef<string | null>(null);
  // 合成视频预览区域的 ref，用于合成完成后滚动定位
  const mergedVideoPreviewRef = useRef<HTMLDivElement>(null);
  const step4LoadingPosterFrameSrc = useRuntimeLoadingPosterFrameSrc({
    videoSrc: STEP2_RUNTIME_PROGRESS_LOADING_VIDEO_SRC,
    fallbackPosterSrc: STEP2_RUNTIME_PROGRESS_LOADING_POSTER_SRC,
  });

  // ========== GlobalTimer 集成 ==========
  // 进入页面时初始化计时器
  useEffect(() => {
    if (projectData?.projectId) {
      setGlobalTimerStart();
    }
  }, [projectData?.projectId, setGlobalTimerStart]);

  // 【修复】直接基于 API 场景数据判断所有镜头是否完成，不依赖 segments
  // 避免因脚本数据缺失导致 segments 为空而无法正确判断完成状态
  const allClipsCompleted = useMemo(
    () => {
      const scenes = step4ApiData.scenes;
      return scenes.length > 0 && scenes.every((scene) => scene.clipStatus === "completed");
    },
    [step4ApiData.scenes],
  );

  // 【新增】部分完成状态：有镜头完成但未全部完成
  const completedClipCount = useMemo(
    () => step4ApiData.scenes.filter((scene) => scene.clipStatus === "completed").length,
    [step4ApiData.scenes],
  );
  const totalClipCount = step4ApiData.scenes.length || segments.length;
  const partialClipsCompleted = completedClipCount > 0 && !allClipsCompleted;

  // 封面候选列表（从分镜图获取）
  const coverCandidates = useMemo(
    () =>
      frameImageUrls
        .map((url, index) => ({
          id: `cover-frame-${index}`,
          url: url.trim(),
          label: `镜头 ${index + 1}`,
        }))
        .filter((item) => item.url.length > 0),
    [frameImageUrls],
  );

  const selectedVariantUrls = useMemo(
    () =>
      segments.map((_, sceneIndex) => {
        const variants = sceneVariants[sceneIndex] ?? [];
        const selected = selections[sceneIndex] ?? 0;
        return variants[selected] ?? null;
      }),
    [segments, sceneVariants, selections],
  );
  const selectedVideoVariantEntries = useMemo(
    () =>
      selectedVariantUrls
        .map((url, sceneIndex) => ({
          sceneIndex,
          url: typeof url === "string" ? url.trim() : "",
        }))
        .filter((entry) => entry.url.length > 0 && isStep4VideoAsset(entry.url)),
    [selectedVariantUrls],
  );
  const selectedVideoVariantUrls = useMemo(
    () => selectedVideoVariantEntries.map((entry) => entry.url),
    [selectedVideoVariantEntries],
  );

  // 预览 Modal 变体导航数据
  const variantsForPreviewModal = useMemo(() => {
    const map = new Map<number, Array<{ url: string; isVideo: boolean }>>();
    for (let i = 0; i < segments.length; i += 1) {
      const v = sceneVariants[i] ?? [];
      if (v.length > 1) {
        map.set(i, v.map((url) => ({ url, isVideo: isStep4VideoAsset(url) })));
      }
    }
    return map;
  }, [sceneVariants, segments.length]);
  const previewModalVariantCount = previewModal
    ? (variantsForPreviewModal.get(previewModal.sceneIndex)?.length ?? 1)
    : 1;
  const step4PreviewRatio = "9:16"; // 固定比例
  const previewAspectRatioCss = useMemo(() => normalizeAspectRatioCss(step4PreviewRatio), [step4PreviewRatio]);
  const step4InitialVideoGenerateCreditCharged = false; // 不再使用 workflow 标记，由后端判断
  const step4SingleRetryCreditCost = Math.max(0, Math.floor(creditPricing.singleVideoCreditCost));
  const step4BatchGenerateCreditCost = Math.max(0, segments.length * step4SingleRetryCreditCost);
  const hasMergedOutput = Boolean((projectData?.exportUrl ?? "").trim());

  // 从 scenes 数据推导项目状态，替代 getProject 请求
  // 当所有 scene 都完成且当前状态为 FILMING 时，自动推进为 CLIPS_READY
  useEffect(() => {
    const scenes = step4ApiData.scenes;
    if (scenes.length === 0) return;
    const allCompleted = scenes.every((s) => s.clipStatus === "completed");
    if (allCompleted && projectData?.projectStatus === "FILMING") {
      updateProjectData({ projectStatus: "CLIPS_READY" });
    }
  }, [step4ApiData.scenes, projectData?.projectStatus, updateProjectData]);

  // 所有场景已完成时，强制清理运行状态（防止 async job 推进延迟导致 UI 卡在"生成中"）
  // 同时处理有失败分镜的情况：没有正在生成的分镜时也清理
  useEffect(() => {
    const allTerminal = step4ApiData.scenes.length > 0 && step4ApiData.scenes.every((s) => s.clipStatus === "completed" || s.clipStatus === "failed");
    if (!allTerminal) return;
    setRunningJobIds((prev) => (prev.size > 0 ? new Set() : prev));
    setStartingJob((prev) => (prev ? false : prev));
  }, [step4ApiData.scenes]);

  // 基于项目状态判断底部按钮行为（状态由后端推进：FILMING → CLIPS_READY → READY_TO_PUBLISH）
  const effectiveProjectStatus = projectData?.projectStatus as ProjectStatus | undefined;

  // 【修复】直接基于 API 场景数据判断是否有任务在运行，不依赖 clipStatuses
  // 避免因 segments 为空导致 clipStatuses 为空而误判
  const hasGeneratingClip = step4ApiData.scenes.some((scene) => scene.clipStatus === "generating");
  const hasFailedClip = step4ApiData.scenes.some((scene) => scene.clipStatus === "failed");
  const hasRunningJob = hasGeneratingClip || runningJobIds.size > 0;

  // 将 step4 的 loading 状态同步到 GlobalTimer（必须在 hasRunningJob 之后）
  const prevLoadingCountRef = useRef(0);
  useEffect(() => {
    const shouldShowTimer = startingJob || hasRunningJob || isMerging || loadingSceneAssets;
    if (shouldShowTimer && prevLoadingCountRef.current === 0) {
      showGlobalLoading();
    } else if (!shouldShowTimer && prevLoadingCountRef.current > 0) {
      hideGlobalLoading();
    }
    prevLoadingCountRef.current = shouldShowTimer ? 1 : 0;
  }, [startingJob, hasRunningJob, isMerging, loadingSceneAssets, showGlobalLoading, hideGlobalLoading]);

  const hasPreviewSeed = useMemo(
    () =>
      frameImageUrls.some((item) => item.trim().length > 0) ||
      clipStatuses.some((item) => typeof item.url === "string" && item.url.trim().length > 0),
    [clipStatuses, frameImageUrls],
  );

  // ========== 历史侧边栏数据 ==========

  // 图片预览模态框状态（imageUrl 必须存在）
  const [imagePreview, setImagePreview] = useState<{
    frames: StoryboardFrameForPreview[];
    currentIndex: number;
  } | null>(null);

  // ========== 结束历史侧边栏数据 ==========

  // 音乐加载 - 从 step4ApiData.music 获取，无数据时触发推荐（后端自动从 DB 读取脚本风格）
  useEffect(() => {
    if (!token || !projectData?.projectId) return;

    // 正在加载时不处理
    if (step4ApiData.isLoading) {
      setMusicState((prev) => ({ ...prev, isLoading: true }));
      return;
    }

    // 从 API 数据恢复音乐状态
    if (step4ApiData.music && step4ApiData.music.items.length > 0) {
      const recommendation = buildRecommendationFromProjectVideoMusics(step4ApiData.music.items);
      setMusicState({
        enabled: true,
        recommendation,
        selectedMusicId: step4ApiData.music.selectedMusicId,
        isLoading: false,
      });
      return;
    }

    // 数据库无音乐数据时，触发推荐（后端根据 projectId 自动读取脚本风格）
    if (step4ApiData.music && step4ApiData.music.items.length === 0) {
      setMusicState((prev) => ({ ...prev, isLoading: true }));
      let cancelled = false;
      void (async () => {
        try {
          const result = await fetchStep4MusicRecommendation(token, projectData.projectId!);
          if (cancelled) return;

          if (result.success && result.recommendation) {
            // 保存推荐结果到数据库
            const musics = extractMusicsFromRecommendation(result.recommendation);
            if (musics.length > 0 && projectData?.projectId) {
              await backendApi.batchSaveProjectVideoMusics(token, projectData.projectId, {
                musics: musics.map((m) => ({
                  musicId: m.id,
                  musicUrl: m.musicUrl,
                  title: m.title,
                  artist: m.artist,
                  atmospheres: m.atmospheres,
                  durationSec: m.durationSec,
                  coverUrl: m.coverUrl,
                })),
                selectedMusicId: result.recommendation.music?.id ?? "",
              });
            }
            setMusicState({
              enabled: true,
              recommendation: result.recommendation,
              selectedMusicId: result.recommendation.music?.id ?? null,
              isLoading: false,
            });
          } else {
            setMusicState({
              enabled: result.enabled,
              recommendation: null,
              selectedMusicId: null,
              isLoading: false,
            });
          }
        } catch (e) {
          if (cancelled) return;
          console.error("[Step4] 音乐推荐失败:", e);
          setMusicState({
            enabled: false,
            recommendation: null,
            selectedMusicId: null,
            isLoading: false,
          });
        }
      })();
      return () => { cancelled = true; };
    }
  }, [token, step4ApiData.music, step4ApiData.isLoading, projectData?.projectId]);

  // 检查浏览器是否支持 WebCodecs 视频合并
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await checkVideoMergeSupport();
      if (!cancelled) {
        setBrowserMergeSupported(result.supported);
        if (!result.supported) {
          console.warn("[Step4] 浏览器不支持 WebCodecs:", result.reason);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 音乐选择持久化 - 用户选择音乐后通过 API 持久化
  useEffect(() => {
    // 没有推荐结果或未选择时不持久化
    if (!musicState.recommendation || !musicState.selectedMusicId) {
      return;
    }

    // 音乐数据通过 API 持久化，此处仅更新本地状态
    // 无需额外持久化逻辑
  }, [musicState.selectedMusicId, musicState.recommendation]);

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
    let cancelled = false;
    void (async () => {
      const pricing = await loadProjectFlowCreditPricing(token);
      if (!cancelled) {
        setCreditPricing(pricing);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const projectId = typeof projectData?.projectId === "string" ? projectData.projectId : null;
    if (resetStateProjectIdRef.current === projectId) {
      return;
    }
    resetStateProjectIdRef.current = projectId;

    completedCountRef.current = 0;
    startedInitialJobRef.current = 0;
    coverInitializedRef.current = false;  // 重置封面初始化标记
    setActiveJobId(null);
    setActiveJobStatus(null);
    setRunningJobIds(new Set());  // 【新增】清理运行中的任务集合
    setJobAttempts(1);
    setFeedback(null);
    setFeedbackCopied(false);
    setLoadingSceneAssets(handoffFrameImageUrls.every((item) => item.length < 1));
    setStartingJob(false);
    setLastCompletedClipId(null);

    setFrameImageUrls(handoffFrameImageUrls);
    // 清空 sceneVariants 和 selections，由 API 数据驱动
    setSceneVariants({});
    setSelections({});
    // 封面重置为空，由封面初始化 useEffect 统一处理
    setSelectedCoverUrl("");
    setPreviewModal(null);
    setManualBatchQueueEnabled(false);
    setQueuedManualBatchStart(false);
    setPreviewSequenceAutoPlaying(false);
    setStep4ThreadCount(3); // 默认并发数
    lastAutoSelectedPrimaryVideoBySceneRef.current = {};
  }, [handoffFrameImageUrls, projectData?.projectId]);

  useEffect(() => {
    setFeedbackCopied(false);
  }, [feedback]);

  useEffect(() => {
    setSelections((current) => {
      let changed = false;
      const next: Record<number, number> = {};
      for (let sceneIndex = 0; sceneIndex < segments.length; sceneIndex += 1) {
        const variants = sceneVariants[sceneIndex] ?? [];
        const fallbackMax = Math.max(variants.length - 1, 0);
        const currentIndex = Number(current[sceneIndex] ?? 0);
        const boundedIndex = Math.max(0, Math.min(fallbackMax, Number.isInteger(currentIndex) ? currentIndex : 0));
        if (boundedIndex > 0 || Object.prototype.hasOwnProperty.call(current, sceneIndex)) {
          next[sceneIndex] = boundedIndex;
        }
        if (boundedIndex !== currentIndex) {
          changed = true;
        }
      }
      if (!changed && Object.keys(current).length === Object.keys(next).length) {
        const same = Object.entries(next).every(([key, value]) => current[Number(key)] === value);
        if (same) {
          return current;
        }
      }
      return next;
    });
  }, [sceneVariants, segments.length]);

  // applyJobToClipStatuses: 纯本地状态更新，不触发 API 刷新
  const applyJobToClipStatuses = useCallback((job: Step4VideoJobDto) => {
    const next = buildStep4VideoClipStatusesFromJob(segments, clipStatuses, job);

    // 找到刚刚完成的镜头（从 pending/generating 变为 completed）
    const previousCompletedIds = new Set(clipStatuses.filter(s => s.status === "completed").map(s => s.id));
    const newlyCompleted = next.find(s => s.status === "completed" && !previousCompletedIds.has(s.id));
    if (newlyCompleted) {
      setLastCompletedClipId(newlyCompleted.id);
    }
    completedCountRef.current = next.filter((item) => item.status === "completed").length;

    // 将 job 中的状态差异写入本地覆盖层
    // 跳过 job 返回 pending 但本地已标记为 generating 的镜头（批量假进度场景）
    next.forEach((item, index) => {
      const current = clipStatuses[index];
      if (!current) return;
      // 批量假进度：job 还没处理到的镜头，保留本地的 generating 状态
      if (item.status === "pending" && current.status === "generating") return;
      if (item.status !== current.status || item.progress !== current.progress) {
        setClipStatusOverrides((prev) => {
          const nextMap = new Map(prev);
          nextMap.set(index, { ...prev.get(index), status: item.status, progress: item.progress });
          return nextMap;
        });
      }
    });
  }, [segments, clipStatuses]);

  /** 从 step4_video_scenes 应用状态：只刷新 scenes */
  const applyFailureFeedback = (job: Step4VideoJobDto) => {
    if (job.status !== "failed" && job.status !== "timeout") {
      return;
    }
    const message = job.error?.message?.trim() || (job.status === "timeout" ? "视频任务超时" : "视频任务失败");
    if (isStep4PendingProviderMessage(message)) {
      setFeedback("任务仍在云端处理中，当前保留生成状态并继续轮询。");
      return;
    }
    setFeedback(message);
  };

  // patchSingleClipStatus: 纯本地覆盖，不触发 API 刷新
  const patchSingleClipStatus = useCallback((clipId: number, patch: Partial<Step4VideoClipStatus>) => {
    setClipStatusOverrides((prev) => {
      const next = new Map(prev);
      next.set(clipId, { ...prev.get(clipId), ...patch });
      return next;
    });
  }, []);

  /** 更新单个分镜视频到独立表 */
  const patchVideoScene = useCallback(
    (sceneIndex: number, fields: Record<string, unknown>) => {
      if (!token || !projectData?.projectId) {
        return;
      }
      void backendApi
        .patchStep4VideoScene(token, projectData.projectId, sceneIndex, fields)
        .catch(() => {
          // best-effort
        });
    },
    [token, projectData?.projectId],
  );

  // Step4 全局任务队列监听（替代独立轮询）
  const {
    isLoading: hasStep4AsyncJobs,
  } = useStep4VideoJobs(urlProjectId ?? null, {
    onClipCompleted: (sceneIndex) => {
      setRetryingSceneIndices((prev) => { const next = new Set(prev); next.delete(sceneIndex); return next; });
      // 即时覆盖为 completed（视频 URL 等 refresh 后由 API 数据提供）
      setClipStatusOverrides((prev) => {
        const next = new Map(prev);
        next.set(sceneIndex, { status: "completed", progress: 100 });
        return next;
      });
      setFeedback(`镜头 ${sceneIndex + 1} 视频生成成功`);
    },
    onClipFailed: (sceneIndex, message) => {
      setRetryingSceneIndices((prev) => { const next = new Set(prev); next.delete(sceneIndex); return next; });
      setClipStatusOverrides((prev) => {
        const next = new Map(prev);
        next.set(sceneIndex, { status: "failed", progress: 0 });
        return next;
      });
      setFeedback(message);
    },
    // 批量事件回调：统一刷新 scenes（无论多少 clip 事件，只请求一次）
    // 刷新完成后 API 数据包含最新状态和视频 URL，覆盖层不再需要
    onBatchEvents: async (events) => {
      if (events.length === 0) return;
      try {
        await step4ApiData.refresh("scenes");
      } catch (e) {
        console.error("[Step4] 批量事件刷新 scenes 失败:", e);
      }
      // 【修复】只清空成功完成的镜头覆盖层，保留失败状态直到用户手动操作
      // 失败状态覆盖层在 onClipFailed 中设置，用于在 API 数据更新前立即显示失败
      const completedSceneIndices = new Set(
        events.filter((e) => e.type === "completed").map((e) => e.sceneIndex)
      );
      setClipStatusOverrides((prev) => {
        const next = new Map();
        for (const [sceneIndex, override] of prev.entries()) {
          // 只保留非完成状态的覆盖层（如 failed）
          if (!completedSceneIndices.has(sceneIndex)) {
            next.set(sceneIndex, override);
          }
        }
        return next;
      });
      // 只有 completed/failed 事件才清理运行状态（running 事件不清空，任务才刚开始）
      const hasTerminalEvent = events.some((e) => e.type === "completed" || e.type === "failed");
      if (hasTerminalEvent) {
        setRunningJobIds(new Set());
        setStartingJob(false);
      }
    },
  });

  /**
   * 切换视频变体（用户点击选择不同版本）
   *
   * 持久化策略：同时更新 selectedIndex 和 clipUrl
   * - selectedIndex: 记录用户选中的版本索引，用于版本选择器显示
   * - clipUrl: 记录选中的视频 URL，用于页面刷新后恢复显示
   *
   * 原因：页面加载时优先读取 clipUrl 作为主视频，而非动态计算 variantUrls[selectedIndex]
   * 参考：Step3 分镜图片表使用 selected_image_url 字段存储选中图片 URL
   */
  const handleSelectVideoVariant = useCallback(
    (sceneIndex: number, variantIndex: number) => {
      const variants = sceneVariants[sceneIndex] ?? [];
      const selectedUrl = variants[variantIndex];

      setSelections((current) => ({
        ...current,
        [sceneIndex]: variantIndex,
      }));

      // 持久化到 nrm_step4_video_scenes 表
      patchVideoScene(sceneIndex, {
        selectedIndex: variantIndex,
        clipUrl: selectedUrl || null,
      });
    },
    [patchVideoScene, sceneVariants],
  );

  /** 删除视频变体（软删除） */
  const handleDeleteVideoVariant = useCallback(
    async (sceneIndex: number, variantIndex: number) => {
      const variants = sceneVariants[sceneIndex] ?? [];
      if (variants.length <= 1) return; // 至少保留一个

      const variantUrl = variants[variantIndex];
      const confirmed = await confirm(
        `确定要删除版本 V${variantIndex + 1} 吗？删除后可在后台恢复。`,
        "删除视频版本"
      );
      if (!confirmed) return;

      // 乐观更新前端状态
      const newVariants = variants.filter((_, i) => i !== variantIndex);
      const currentSelected = selections[sceneIndex] ?? 0;
      const newSelected = variantIndex <= currentSelected
        ? Math.max(0, currentSelected - 1)
        : currentSelected;

      setSceneVariants((current) => ({
        ...current,
        [sceneIndex]: newVariants,
      }));
      setSelections((sel) => ({ ...sel, [sceneIndex]: newSelected }));

      // 调用后端 API 软删除
      try {
        await backendApi.deleteStep4VideoSceneVariant(
          token!,
          projectData?.projectId!,
          sceneIndex,
          variantUrl,
        );
      } catch (error) {
        // 删除失败，回滚前端状态
        setSceneVariants((current) => ({
          ...current,
          [sceneIndex]: variants,
        }));
        setSelections((sel) => ({ ...sel, [sceneIndex]: currentSelected }));
        setFeedback("删除失败，请稍后重试。");
      }
    },
    [confirm, sceneVariants, selections, token, projectData?.projectId],
  );

  const startNewVideoJob = async (
    sourceFrameUrls?: string[],
    source?: "auto" | "manual"  // 区分自动生成和手动生成
  ): Promise<void> => {
    console.log(`[Step4] startNewVideoJob 被调用: token=${!!token}, projectId=${projectData?.projectId}, segments.length=${segments.length}, sourceFrameUrls=${sourceFrameUrls?.length}, source=${source}`);
    if (step4Locked) return;
    if (!token || !projectData?.projectId || segments.length === 0) {
      console.log(`[Step4] startNewVideoJob 前置条件不满足，退出: token=${!!token}, projectId=${projectData?.projectId}, segments.length=${segments.length}`);
      return;
    }
    try {
      showGlobalLoading();
      setStartingJob(true);
      setFeedback(null);
      const normalizedFrameUrls = Array.from({ length: segments.length }, (_, index) =>
        typeof (sourceFrameUrls ?? frameImageUrls)[index] === "string"
          ? ((sourceFrameUrls ?? frameImageUrls)[index] ?? "").trim()
          : "",
      );
      console.log(`[Step4] startNewVideoJob normalizedFrameUrls:`, normalizedFrameUrls.map((u, i) => `[${i}]=${u ? u.substring(0, 50) + '...' : 'EMPTY'}`));
      const missingPreviewFrameIndexes = normalizedFrameUrls
        .map((imageUrl, index) => ({ index: index + 1, imageUrl }))
        .filter((item) => item.imageUrl.length < 1)
        .map((item) => item.index);
      if (missingPreviewFrameIndexes.length > 0) {
        console.log(`[Step4] startNewVideoJob 缺少预览图，退出: missingIndexes=${missingPreviewFrameIndexes.join(",")}`);
        setFeedback(
          `镜头 ${missingPreviewFrameIndexes.join("、")} 缺少主预览图，当前不会触发视频生成。请先返回 Step3 补齐后再继续。`,
        );
        return;
      }
      // 使用本地 clipStatuses 判断是否已有生成中的片段
      const hasStep4GeneratedClip = clipStatuses.some(
        (item) => item.status === "generating" || item.status === "completed",
      );
      const shouldChargeForInitialBatch = !hasStep4GeneratedClip && !hasMergedOutput;
      console.log(`[Step4] startNewVideoJob 积分检查: shouldCharge=${shouldChargeForInitialBatch}, hasGenerated=${hasStep4GeneratedClip}, hasMerged=${hasMergedOutput}`);
      let step4BatchChargeAmount = step4BatchGenerateCreditCost;
      if (shouldChargeForInitialBatch) {
        try {
          const latestPricing = normalizeProjectFlowCreditPricing(await backendApi.creditPricing(token));
          setCreditPricing(latestPricing);
          // 根据角色年龄选择正确的积分成本
          const age = Number(projectData?.selectedRoleDirection?.age);
          const singleClipCost = selectCreditCostByAge(
            age,
            latestPricing.step4ClipChildCost,
            latestPricing.step4ClipAdultCost,
          );
          step4BatchChargeAmount = Math.max(0, Math.floor(segments.length * singleClipCost));
          console.log(`[Step4] startNewVideoJob 积分金额: batchAmount=${step4BatchChargeAmount}, singleCost=${singleClipCost}, age=${age}`);
        } catch (error) {
          console.log(`[Step4] startNewVideoJob 积分定价读取失败:`, error);
          setFeedback(resolveProjectFlowCreditSpendErrorMessage(error, "积分参数读取失败，请稍后重试后再执行视频生成。"));
          return;
        }
      }
      if (shouldChargeForInitialBatch && step4BatchChargeAmount > 0) {
        try {
          const latestCreditAccount = await backendApi.loadCredits(token);
          console.log(`[Step4] startNewVideoJob 积分余额: balance=${latestCreditAccount.balance}, need=${step4BatchChargeAmount}`);
          if ((latestCreditAccount.balance ?? 0) < step4BatchChargeAmount) {
            setFeedback(`积分不足，当前余额 ${latestCreditAccount.balance ?? 0}，需要 ${step4BatchChargeAmount}，请先充值或联系管理员。`);
            return;
          }
        } catch (error) {
          const message = error instanceof ApiError ? error.message : "积分信息读取失败，请稍后重试。";
          console.log(`[Step4] startNewVideoJob 积分余额读取失败:`, message);
          setFeedback(message);
          return;
        }
      }
      console.log(`[Step4] startNewVideoJob 准备创建视频任务, segments=${segments.length}`);
      const job = await startStep4VideoJob({
        api: backendApi,
        token,
        projectId: projectData?.projectId,
        source,
      });
      setActiveJobId(job.id);
      setActiveJobStatus(job.status);
      setJobAttempts(job.attempts);
      applyJobToClipStatuses(job as Step4VideoJobDto);

      // 批量生成：将所有待生成镜头标记为正在生成（提供即时动画反馈）
      const pendingSceneIndices = segments
        .map((_, index) => index)
        .filter((index) => {
          const status = clipStatuses[index];
          return !status || status.status !== "completed";
        });
      if (pendingSceneIndices.length > 0) {
        setRetryingSceneIndices((prev) => {
          const next = new Set(prev);
          pendingSceneIndices.forEach((idx) => next.add(idx));
          return next;
        });
        // 所有非 completed 镜头立即标记为 generating，触发模拟进度
        pendingSceneIndices.forEach((idx) => {
          patchSingleClipStatus(idx, { status: "generating", progress: 5 });
        });
      }

      if (shouldChargeForInitialBatch) {
        if (step4BatchChargeAmount > 0) {
          try {
            await spendProjectFlowCredits({
              token,
              routeKey: "step4_video_export",
              operation: "single_video",
              reason: "step4_batch_video_generate",
              projectId: urlProjectId,
            });
          } catch (error) {
            setFeedback(resolveProjectFlowCreditSpendErrorMessage(error, "视频任务已启动，但积分扣费失败，请稍后重试。"));
          }
        }
      }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "创建视频任务失败，请稍后重试";
      console.log(`[Step4] startNewVideoJob 异常:`, message, error);
      setFeedback(message);
    } finally {
      console.log(`[Step4] startNewVideoJob finally`);
      hideGlobalLoading();
      setStartingJob(false);
    }
  };

  useEffect(() => {
    const projectId = projectData?.projectId;
    console.log(`[Step4] 恢复 useEffect 触发: token=${!!token}, projectId=${projectId}, segments.length=${segments.length}, activeJobId=${activeJobId}, startedInitialJobRef=${startedInitialJobRef.current}`);
    // 【修复】token 或 projectId 缺失时直接退出
    if (!token || !projectId) {
      console.log(`[Step4] 恢复 useEffect 跳过: token 或 projectId 缺失`);
      return;
    }
    // segments 为空时：如果 API 数据已加载完成，说明确实没有数据，直接标记恢复完成
    if (segments.length === 0) {
      if (!step4ApiData.isLoading) {
        setInitialRecoveryDone(true);
        setLoadingSceneAssets(false);
      }
      return;
    }
    if (activeJobId || startedInitialJobRef.current > 0) {
      console.log(`[Step4] 恢复 useEffect 跳过: activeJobId=${activeJobId}, startedInitialJobRef=${startedInitialJobRef.current}`);
      return;
    }

    console.log(`[Step4] 恢复 useEffect 开始执行`);
    const executionId = ++startedInitialJobRef.current;  // 递增并捕获执行ID
    let cancelled = false;
    void (async () => {
      // 如果执行ID不匹配（被后续执行取消），直接退出
      if (startedInitialJobRef.current !== executionId) {
        console.log(`[Step4] 异步函数执行ID不匹配(${executionId} vs ${startedInitialJobRef.current})，退出`);
        return;
      }
      setLoadingSceneAssets(!hasPreviewSeed);
      try {
        // 直接使用 useStep4Data 已加载的 scenes 数据，不再独立调用 API
        const loadedScenes = step4ApiData.scenes;
        let loadedSceneVariants: Record<number, string[]> = {};
        let loadedSelections: Record<number, number> = {};
        if (loadedScenes && loadedScenes.length > 0) {
          for (const scene of loadedScenes) {
            if (scene.variantUrls.length > 0) {
              loadedSceneVariants[scene.sceneIndex] = scene.variantUrls;
            }
            loadedSelections[scene.sceneIndex] = scene.selectedIndex;
          }
          if (Object.keys(loadedSceneVariants).length > 0) {
            setSceneVariants(loadedSceneVariants);
          }
          if (Object.keys(loadedSelections).length > 0) {
            setSelections(loadedSelections);
          }
          console.log(`[Step4] 从 useStep4Data.scenes 加载了 ${loadedScenes.length} 个分镜数据`);
        }

        console.log(`[Step4] 使用专用接口数据，不再调用 projectResumeSnapshot`);
        if (cancelled || startedInitialJobRef.current !== executionId) {
          console.log(`[Step4] cancelled，退出`);
          return;
        }
        const currentSegments = segments;

        // 从 step4ApiData.frameImages 获取分镜图（由 useStep4Data hook 加载）
        const step3FrameUrls = Array.from({ length: currentSegments.length }, (_, i) => {
          const frame = step4ApiData.frameImages.find(f => f.frameIndex === i + 1);
          return frame?.imageUrl?.trim() || "";
        });
        if (step3FrameUrls.some(u => u.trim().length > 0)) {
          console.log(`[Step4] 从 API 获取到 ${step4ApiData.frameImages.length} 个分镜图`);
        }

        // 从 sceneVariants 获取备选（已由 useStep4Data + useEffect 同步）
        const sceneVariantFrameUrls = Array.from({ length: currentSegments.length }, (_, i) => {
          const persistedUrls = persistedSceneVariantsByScene[i];
          if (Array.isArray(persistedUrls) && persistedUrls.length > 0) return persistedUrls[0].trim();
          return "";
        });

        // 按优先级合并：handoff → step3_frame_images → sceneVariants
        const fallbackUrls = step3FrameUrls.some(u => u.trim().length > 0)
          ? step3FrameUrls
          : sceneVariantFrameUrls;
        const nextFrameUrls = mergeStep4FrameImageUrls({
          primaryUrls: handoffFrameImageUrls,
          fallbackUrls,
          segmentCount: currentSegments.length,
        });
        setFrameImageUrls(nextFrameUrls);
        // 封面默认第一张分镜图（如果没有已保存的视频封面）
        const persistedCover = projectData?.videoCoverImageUrl?.trim() ?? "";
        if (!persistedCover && nextFrameUrls[0]?.trim()) {
          setSelectedCoverUrl(nextFrameUrls[0].trim());
        }
        console.log(`[Step4] 开始获取 listVideoJobs...`);
        const response = await backendApi.listVideoJobs(token, projectId);
        console.log(`[Step4] listVideoJobs 完成: jobs=${response.jobs?.length ?? 0}, cancelled=${cancelled}`);
        if (cancelled || startedInitialJobRef.current !== executionId) {
          console.log(`[Step4] cancelled after listVideoJobs，退出`);
          return;
        }

        const resumedLatest = resolveStep4ResumeVideoJob<Step4VideoJobDto>({
          snapshotLatestJob: null,
          listedJobs: response.jobs as Step4VideoJobDto[],
          expectedClipCount: currentSegments.length,
        });

        console.log(`[Step4] 恢复逻辑结果: resumedLatest=${resumedLatest ? JSON.stringify({ id: resumedLatest.id, status: resumedLatest.status, targetSceneIndex: resumedLatest.targetSceneIndex }) : null}`);

        // 统计 running 任务数
        const listedJobs = response.jobs as Step4VideoJobDto[];
        const runningJobsCount = listedJobs.filter((job) => job.status === "running").length;
        console.log(`[Step4] runningJobsCount=${runningJobsCount}`);

        // scenes 数据已由上方 loadedSceneVariants/loadedSelections 处理，不再重复调用

        // 判断是否首次进入：使用已加载的 step4ApiData.scenes 数据
        const hasAnyVideo = loadedScenes.some(s => s.variantUrls.length > 0);
        const hasAnyCompletedScene = loadedScenes.some(s => s.clipStatus === "completed");

        console.log(`[Step4] 首次进入判断: hasAnyVideo=${hasAnyVideo}, hasAnyCompletedScene=${hasAnyCompletedScene}, scenesCount=${loadedScenes.length}`);

        // 【首次进入】无任何视频记录，创建一个批量 job（1 个父任务 + N 个子任务）
        if (!hasAnyVideo && !hasAnyCompletedScene) {
          console.log(`[Step4] 首次进入，创建批量任务（${currentSegments.length} 个分镜）`);
          // 余额预检查（使用年龄分流定价）
          const age = Number(projectData?.selectedRoleDirection?.age);
          const singleClipCost = selectCreditCostByAge(
            age,
            creditPricing.step4ClipChildCost,
            creditPricing.step4ClipAdultCost,
          );
          const autoBatchCost = Math.max(0, Math.floor(currentSegments.length * singleClipCost));
          if (autoBatchCost > 0) {
            try {
              const { sufficient, balance } = await checkCreditsBalance(token, autoBatchCost);
              if (!sufficient) {
                setFeedback(`积分不足，当前余额 ${balance}，需要 ${autoBatchCost}，请先充值或联系管理员。`);
                return;
              }
            } catch (error) {
              const message = error instanceof ApiError ? error.message : "积分余额检查失败，请稍后重试。";
              setFeedback(message);
              return;
            }
          }
          try {
            const job = await backendApi.createVideoJob(token, projectId, {
              source: "auto",
            });
            setActiveJobId(job.id);
            setActiveJobStatus("running");
            setRunningJobIds(new Set([job.id]));
            setJobAttempts(1);
            // 首次自动批量生成：将所有镜头标记为正在生成
            setRetryingSceneIndices(new Set(currentSegments.map((_, i) => i)));
            applyJobToClipStatuses(job as Step4VideoJobDto);
            // 所有非 completed 镜头立即标记为 generating，触发假进度
            currentSegments.forEach((_, idx) => {
              const s = clipStatuses[idx];
              if (!s || s.status !== "completed") {
                patchSingleClipStatus(idx, { status: "generating", progress: 5 });
              }
            });
            console.log(`[Step4] 批量任务已创建: jobId=${job.id}`);
            // 积分扣减：自动批量生成成功后扣减
            if (autoBatchCost > 0) {
              try {
                await spendProjectFlowCredits({
                  token,
                  routeKey: "step4_video_export",
                  operation: "single_video",
                  reason: "step4_auto_batch_video_generate",
                  projectId: urlProjectId,
                });
              } catch (error) {
                setFeedback(resolveProjectFlowCreditSpendErrorMessage(error, "视频任务已启动，但积分扣费失败，请稍后重试。"));
              }
            }
          } catch (error) {
            if (error instanceof ApiError && error.code === "VIDEO_JOB_ALREADY_RUNNING") {
              // 已有任务在跑，恢复轮询
              if (runningJobsCount > 0 && resumedLatest?.status === "running") {
                console.log(`[Step4] 已有活跃任务，恢复轮询: activeJobId=${resumedLatest.id}`);
                setActiveJobId(resumedLatest.id);
                setActiveJobStatus("running");
                setJobAttempts(resumedLatest.attempts);
              }
            } else {
              const msg = error instanceof ApiError ? error.message : "批量任务创建失败，请手动重试。";
              console.log(`[Step4] 批量任务创建失败: ${msg}`);
              setFeedback(msg);
            }
          }
          return;
        }

        // 【非首次进入】如果有 running 任务，恢复轮询
        console.log(`[Step4] 检查是否恢复轮询: runningJobsCount=${runningJobsCount}, resumedLatest=${resumedLatest ? JSON.stringify({ id: resumedLatest.id, status: resumedLatest.status, targetSceneIndex: resumedLatest.targetSceneIndex }) : null}`);
        if (runningJobsCount > 0 && resumedLatest?.status === "running") {
          console.log(`[Step4] 恢复轮询: activeJobId=${resumedLatest.id}`);
          setActiveJobId(resumedLatest.id);
          setActiveJobStatus("running");
          setJobAttempts(resumedLatest.attempts);
          return;
        }

        console.log(`[Step4] 不恢复轮询: runningJobsCount=${runningJobsCount}, resumedLatest?.status=${resumedLatest?.status}`);

        // 设置空闲状态，等待用户手动触发
        setActiveJobId(null);
        setActiveJobStatus(null);
        setJobAttempts(1);
        setFeedback(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof ApiError ? error.message : "加载 Step4 任务状态失败";
        setFeedback(message);
      } finally {
        if (!cancelled) {
          setLoadingSceneAssets(false);
          setInitialRecoveryDone(true);
        }
      }
    })();
    return () => {
      console.log(`[Step4] 恢复 useEffect cleanup 被调用，设置 cancelled=true`);
      cancelled = true;
      // 不重置 startedInitialJobRef：StrictMode 已关闭，重置会导致同一项目重复执行恢复逻辑
    };
  }, [
    token,
    projectData?.projectId,
    segments.length,  // 【修复】添加依赖，确保数据加载后触发自动生成
  ]);

  // 项目状态由后端推进：FILMING → CLIPS_READY（全部镜头完成）→ READY_TO_PUBLISH（合成完成）
  // 前端不再主动设置项目状态

  useEffect(() => {
    if (!manualBatchQueueEnabled || !queuedManualBatchStart) {
      return;
    }
    if (!token || !projectData?.projectId || segments.length < 1) {
      return;
    }
    if (hasRunningJob || startingJob || allClipsCompleted) {
      return;
    }
    setQueuedManualBatchStart(false);
    void startNewVideoJob(undefined, "manual");  // 队列触发的手动生成
  }, [
    allClipsCompleted,
    hasRunningJob,
    manualBatchQueueEnabled,
    queuedManualBatchStart,
    segments.length,
    startingJob,
    token,
    projectData?.projectId,
  ]);

  // 占位符逻辑：如果 sceneVariants 为空，用分镜图片作为初始值
  useEffect(() => {
    if (segments.length < 1) {
      return;
    }
    setSceneVariants((current) => {
      let changed = false;
      const next: Record<number, string[]> = { ...current };
      segments.forEach((_, sceneIndex) => {
        const existed = next[sceneIndex] ?? [];
        // 只有当 sceneVariants 完全为空时，才用分镜图片作为占位符
        if (existed.length < 1) {
          const frameUrl = frameImageUrls[sceneIndex]?.trim() || "";
          const seed = frameUrl || `https://placehold.co/400x225/1a1a1a/FFF?text=Scene+${sceneIndex + 1}`;
          next[sceneIndex] = [seed];
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [segments, frameImageUrls]);

  useEffect(() => {
    if (segments.length < 1) {
      lastAutoSelectedPrimaryVideoBySceneRef.current = {};
      return;
    }
    const nextPrimaryByScene: Record<number, string> = {};
    for (let sceneIndex = 0; sceneIndex < segments.length; sceneIndex += 1) {
      const generatedUrl = clipStatuses[sceneIndex]?.url?.trim() || "";
      if (isStep4VideoAsset(generatedUrl)) {
        nextPrimaryByScene[sceneIndex] = generatedUrl;
      }
    }
    setSelections((current) => {
      let changed = false;
      const next = { ...current };
      for (const [rawSceneIndex, videoUrl] of Object.entries(nextPrimaryByScene)) {
        const sceneIndex = Number(rawSceneIndex);
        const previousVideoUrl = lastAutoSelectedPrimaryVideoBySceneRef.current[sceneIndex] ?? "";
        if (previousVideoUrl === videoUrl) {
          continue;
        }
        const currentSelection = Number(current[sceneIndex] ?? 0);
        if (currentSelection !== 0) {
          next[sceneIndex] = 0;
          changed = true;
        }
      }
      return changed ? next : current;
    });
    lastAutoSelectedPrimaryVideoBySceneRef.current = nextPrimaryByScene;
  }, [clipStatuses, segments.length]);

  const applySceneOrderByKeys = (targetOrderKeys: string[], feedbackMessage?: string): boolean => {
    if (segments.length < 1) {
      return false;
    }
    const targetSignature = targetOrderKeys.join("|");
    const orderedSourceIndices = resolveStep4SceneOrderIndices(sceneOrderKeys, targetOrderKeys);
    if (!orderedSourceIndices || orderedSourceIndices.length !== segments.length) {
      return false;
    }
    const sameOrder = orderedSourceIndices.every((sourceIndex, targetIndex) => sourceIndex === targetIndex);
    if (sameOrder) {
      if (feedbackMessage) {
        setFeedback(feedbackMessage);
      }
      return true;
    }

    // 执行本地重排序（不持久化到 workflow）
    const reorderedSegments = reorderArrayByIndices(segments, orderedSourceIndices);
    const reorderedFrameImageUrls = reorderArrayByIndices(frameImageUrls, orderedSourceIndices);

    const sceneVariantList = Array.from({ length: segments.length }, (_, index) => [...(sceneVariants[index] ?? [])]);
    const reorderedVariantList = reorderArrayByIndices(sceneVariantList, orderedSourceIndices);
    const nextSceneVariants: Record<number, string[]> = {};
    for (let index = 0; index < reorderedVariantList.length; index += 1) {
      const variants = dedupeSceneAssets(reorderedVariantList[index] ?? [], 4);
      if (variants.length > 0) {
        nextSceneVariants[index] = variants;
      }
    }

    const selectionList = Array.from({ length: segments.length }, (_, index) => Number(selections[index] ?? 0));
    const reorderedSelectionList = reorderArrayByIndices(selectionList, orderedSourceIndices);
    const nextSelections: Record<number, number> = {};
    for (let index = 0; index < reorderedSelectionList.length; index += 1) {
      const normalized = Number.isInteger(reorderedSelectionList[index]) ? reorderedSelectionList[index] : 0;
      if (normalized > 0) {
        nextSelections[index] = normalized;
      }
    }

    const oldIndexToNewIndex = new Map<number, number>();
    orderedSourceIndices.forEach((sourceIndex, targetIndex) => {
      oldIndexToNewIndex.set(sourceIndex, targetIndex);
    });

    setFrameImageUrls(reorderedFrameImageUrls);
    setSceneVariants(nextSceneVariants);
    setSelections(nextSelections);
    setLastCompletedClipId((current) => {
      if (current === null) {
        return current;
      }
      return oldIndexToNewIndex.get(current) ?? null;
    });

    if (feedbackMessage) {
      setFeedback(feedbackMessage);
    }
    return true;
  };

  // 场景排序相关的 useEffect 已删除（不再需要持久化到 workflow）

  const resolveSceneLabel = (sceneIndex: number): string => {
    const title = step4ApiData.segments[sceneIndex]?.title?.trim() || "";
    if (title.length > 0) {
      return title;
    }
    return `镜头 ${sceneIndex + 1}`;
  };

  const handleRetryScene = async (sceneIndex: number, options?: { skipConfirm?: boolean }) => {
    if (!token || !projectData?.projectId) {
      setFeedback("登录状态已失效，请重新登录后重试。");
      return;
    }

    // 检查当前镜头是否正在生成或正在提交重试
    const currentStatus = clipStatuses.find(s => s.id === sceneIndex);
    if (currentStatus?.status === "generating") {
      setFeedback("当前镜头正在生成中，请等待完成。");
      return;
    }
    if (retryingSceneIndices.has(sceneIndex)) {
      setFeedback("当前镜头正在提交重试请求，请等待。");
      return;
    }

    // 确认场景数据已加载
    if (!step4ApiData.scenes[sceneIndex]) {
      setFeedback("场景数据未加载，请刷新页面后重试。");
      return;
    }

    // 确认重新生成（批量重试时由调用方统一确认，跳过单个确认）
    if (!options?.skipConfirm) {
      const confirmed = await confirm("确定要重新生成吗？", "重新生成");
      if (!confirmed) return;
    }

    // 余额预检查（使用年龄分流定价）
    const age = Number(projectData?.selectedRoleDirection?.age);
    const retryCost = selectCreditCostByAge(
      age,
      creditPricing.step4ClipChildCost,
      creditPricing.step4ClipAdultCost,
    );
    try {
      const { sufficient, balance } = await checkCreditsBalance(token, retryCost);
      if (!sufficient) {
        setFeedback(`积分不足，当前余额 ${balance}，需要 ${retryCost}，请先充值或联系管理员。`);
        return;
      }
    } catch (error) {
      setFeedback(resolveProjectFlowCreditSpendErrorMessage(error, "积分余额检查失败，请稍后重试。"));
      return;
    }

    // 确认后立即标记为正在提交，防止重复点击
    setRetryingSceneIndices((prev) => new Set(prev).add(sceneIndex));
    setFeedback(null);

    // 保存之前的状态，用于失败时恢复
    const previousStatus = clipStatuses.find((item) => item.id === sceneIndex) ?? {
      id: sceneIndex,
      progress: 0,
      status: "pending" as const,
      prompt: "",
    };

    patchSingleClipStatus(sceneIndex, {
      status: "generating",
      progress: 0,
    });

    try {
      // 只传 targetSceneIndex，后端自行查找 prompt、分镜图、参考图等所有参数
      const job = await backendApi.createVideoJob(token, projectData?.projectId, {
        targetSceneIndex: sceneIndex,
        source: "manual",
      });

      // 添加到运行中的任务集合
      setRunningJobIds((prev) => new Set(prev).add(job.id));
      setActiveJobId(job.id);
      setActiveJobStatus(job.status);
      setJobAttempts(job.attempts);
      applyJobToClipStatuses(job);

      // 确保目标镜头状态为 generating
      const targetClip = clipStatuses.find(s => s.id === sceneIndex);
      if (targetClip?.status !== "generating") {
        patchSingleClipStatus(sceneIndex, {
          status: "generating",
          progress: targetClip?.progress ?? 0,
        });
      }

      setFeedback(`镜头 ${sceneIndex + 1} 正在重新生成...`);

      // 积分扣减：重试任务创建成功后扣减
      try {
        await spendProjectFlowCredits({
          token,
          routeKey: "step4_video_export",
          operation: "single_video",
          reason: "step4_single_retry",
          projectId: urlProjectId,
        });
      } catch (error) {
        setFeedback(resolveProjectFlowCreditSpendErrorMessage(error, "重试已启动，但积分扣费失败，请联系管理员。"));
      }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : error instanceof Error ? error.message : "创建重试任务失败";
      // 恢复之前的状态
      patchSingleClipStatus(sceneIndex, previousStatus);
      // 清理重试标记，避免镜头永久卡在"提交中"状态
      setRetryingSceneIndices((prev) => { const next = new Set(prev); next.delete(sceneIndex); return next; });
      setFeedback(message);
    }
  };

  // 音乐选择处理（musicId 是 video_musics.id，需要找到对应的 project_video_musics.id）
  const handleSelectMusic = useCallback((musicId: string) => {
    setMusicState((prev) => ({
      ...prev,
      selectedMusicId: musicId,
    }));
    setBeatDetectResult(null);
    setBeatSyncEnabled(false);

    // 持久化选中状态：从 step4ApiData.music.items 中找到项目音乐记录
    if (token && projectData?.projectId && step4ApiData.music?.items) {
      const projectMusic = step4ApiData.music.items.find((item) => item.musicId === musicId);
      if (projectMusic) {
        backendApi.selectProjectVideoMusic(token, projectData.projectId, projectMusic.id).catch((err) => {
          console.error("保存音乐选择失败:", err);
        });
      }
    }
  }, [token, projectData?.projectId, step4ApiData.music]);

  const handleClearMusicSelection = useCallback(() => {
    setMusicState((prev) => ({
      ...prev,
      selectedMusicId: null,
    }));
    setBeatDetectResult(null);
    setBeatSyncEnabled(false);

    // 清除选中状态
    if (token && projectData?.projectId) {
      backendApi.clearSelectionProjectVideoMusics(token, projectData.projectId).catch((err) => {
        console.error("清除音乐选择失败:", err);
      });
    }
  }, [token, projectData?.projectId]);

  // 从音乐库选择音乐（需要先添加到项目音乐列表，再选中）
  const handleSelectFromLibrary = useCallback((music: import("../../../services/backendApi.videoMusic").VideoMusicDto) => {
    if (!token || !projectData?.projectId) return;

    // 更新本地状态
    setMusicState((prev) => ({
      ...prev,
      selectedMusicId: music.id,
      // 将新音乐添加到 recommendation 中
      recommendation: prev.recommendation
        ? {
            ...prev.recommendation,
            music: prev.recommendation.music,
            candidates: [music, ...(prev.recommendation.candidates ?? [])].slice(0, 3),
          }
        : {
            success: true,
            music,
            candidates: [],
            matchedAtmosphere: music.atmospheres?.[0] ?? null,
            candidateAtmospheres: [],
            usedDefault: false,
          },
    }));
    setBeatDetectResult(null);
    setBeatSyncEnabled(false);

    // 保存到项目音乐列表并选中
    backendApi.batchSaveProjectVideoMusics(token, projectData!.projectId, {
      musics: [
        {
          musicId: music.id,
          musicUrl: music.musicUrl,
          title: music.title,
          artist: music.artist,
          atmospheres: music.atmospheres,
          durationSec: music.durationSec,
          coverUrl: music.coverUrl,
        },
        // 保留现有的项目音乐（最多2条，加上新的共3条）
        ...(step4ApiData.music?.items?.slice(0, 2).map((item) => ({
          musicId: item.musicId,
          musicUrl: item.musicUrl,
          title: item.title,
          artist: item.artist,
          atmospheres: item.atmospheres,
          durationSec: item.durationSec,
          coverUrl: item.coverUrl,
        })) ?? []),
      ],
      selectedMusicId: music.id,
    }).catch((err) => {
      console.error("保存音乐库选择失败:", err);
    });
  }, [token, projectData?.projectId, step4ApiData.music]);

  const handleMerge = async () => {
    if (selectedVideoVariantUrls.length < 1) {
      setFeedback("当前没有可合成的视频片段。");
      return;
    }
    if (!token || !projectData?.projectId) {
      setFeedback("登录状态已失效，请重新登录后重试。");
      return;
    }
    try {
      showGlobalLoading();
      setIsMerging(true);
      setFeedback(null);
      setMergeProgress(0);
      setMergeStatus("准备合并...");

      // 构建音乐参数：从推荐结果中解析选中的音乐
      const selectedMusic = resolveStep4SelectedMusic(
        musicState.selectedMusicId,
        musicState.recommendation,
      );

      // 检查浏览器是否支持 WebCodecs
      if (browserMergeSupported === false) {
        // 不支持 WebCodecs 时直接报错，不再降级到后端 FFmpeg
        setFeedback("您的浏览器不支持视频合成功能，请使用最新版 Chrome、Edge 或 Safari 浏览器。");
        setIsMerging(false);
        hideGlobalLoading();
        return;
      }

      // 使用前端 WebCodecos 合并视频
      // 预下载音乐文件，避免节拍检测和视频合成各下载一次
      let musicFile: File | undefined;
      let musicOptions: MusicOptions | undefined = selectedMusic?.musicUrl
        ? {
            source: selectedMusic.musicUrl,  // 默认传 URL，后续替换为 File
            volume: 0.6,      // 默认音量 60%
            fadeInSec: 1.0,   // 淡入 1 秒
            fadeOutSec: 1.0,  // 淡出 1 秒
          }
        : undefined;

      // 如果有音乐，先下载一次（节拍检测和视频合成共用）
      if (selectedMusic?.musicUrl) {
        setMergeStatus("下载背景音乐...");
        setMergeProgress(1);
        try {
          const { downloadAudioFile } = await import("../../../utils/fetch-video-file");
          musicFile = await downloadAudioFile(selectedMusic.musicUrl);
          // 更新 musicOptions.source 为 File 对象（避免 UrlSource 再次下载）
          if (musicOptions) {
            musicOptions.source = musicFile;
          }
        } catch (err) {
          console.warn("[Step4] 音乐下载失败，将跳过背景音乐:", err);
          musicOptions = undefined;
        }
      }

      // 卡点模式：复用 UI 已检测的节拍结果，避免重复检测
      let beatTimestamps: number[] | undefined;
      let beatEnergies: number[] | undefined;
      if (beatSyncEnabled && musicFile) {
        try {
          // 复用已有的节拍检测结果（来自 Step4BeatSyncControls 的 onBeatDetected 回调）
          const existingResult = beatDetectResult;
          let beatResult = existingResult;

          // 仅在未检测时才重新检测（使用已下载的 musicFile）
          if (!existingResult) {
            setMergeStatus("分析音乐节拍...");
            setMergeProgress(2);

            const { detectBeats } = await import("../../../libs/beat-detect");
            beatResult = await detectBeats(musicFile, { intensity: beatSyncIntensity });
            setBeatDetectResult(beatResult);
          } else {
            setMergeStatus(`复用已检测节拍 (BPM: ${existingResult.bpm}, ${existingResult.beatTimes.length} 个节拍点)`);
            setMergeProgress(2);
          }

          if (beatResult && beatResult.beatTimes.length > 0) {
            beatTimestamps = beatResult.beatTimes;
            // 提取每个节拍对应的能量值
            if (beatResult.energyCurve && beatResult.energyInterval) {
              beatEnergies = beatResult.beatTimes.map(t => {
                const idx = Math.round(t / beatResult.energyInterval!);
                return beatResult.energyCurve![idx] ?? 0;
              });
            }
            setMergeStatus(`检测到 ${beatResult.beatTimes.length} 个节拍点 (BPM: ${beatResult.bpm})，将对齐转场`);
            setMergeProgress(3);
          } else {
            setMergeStatus("未检测到明显节拍点，将使用普通合并");
            beatTimestamps = undefined;
          }
        } catch (err) {
          console.warn("[Step4] 节拍检测失败，降级为普通合并:", err);
          setMergeStatus("节拍检测失败，使用普通合并");
          beatTimestamps = undefined;
        }
      }

      const result = await mergeVideosWithTransitions({
        videos: selectedVideoVariantUrls,  // 支持远程 URL
        transitionType: "random",  // 每个片段之间使用随机转场
        // 不指定时长，使用 FreeCut 原版每个转场的 defaultDuration
        fps: 30,  // FreeCut 标准帧率
        timing: 'ease-in-out',  // 流畅过渡（与 Step6 统一）
        alignment: 0.5,  // 居中于剪辑点（与 Step6 统一）
        backgroundAudio: musicOptions,
        beatTimestamps,  // 传入节拍时间戳，转场将对齐到节拍
        beatSyncIntensity,  // 卡点强度
        beatEnergies,  // 节拍能量值，用于优先选择强拍
        // 如果有封面图片，在视频开头显示 0.5 秒
        coverImage: selectedCoverUrl.trim() || undefined,
        coverDurationSec: 0.5,
        onProgress: (percent, message) => {
          // 卡点模式下，重新映射进度：前 3% 用于节拍检测
          const adjustedPercent = beatTimestamps ? Math.max(3, percent * 0.97) : percent;
          setMergeProgress(adjustedPercent);
          setMergeStatus(message);
        },
      });

      setMergeProgress(90);
      setMergeStatus("上传视频到云端...");

      // 记录本次合成使用的转场
      setUsedTransitionIds(result.usedTransitionIds);

      // 上传合并后的视频到 OSS
      const { fileUrl } = await uploadBlobToOss(
        token,
        projectData?.projectId,
        result.blob,
        `merged_${Date.now()}.mp4`,
        (percent) => {
          setMergeProgress(90 + Math.floor(percent * 0.1));
          setMergeStatus(`上传中 ${percent}%`);
        },
      );

      setMergeProgress(100);
      setMergeStatus("合成完成！");

      updateProjectData({
        exportUrl: fileUrl,
        projectStatus: "READY_TO_PUBLISH",
      });

      // 验证 durationSec 合法性
      const durationSec = result.duration;
      if (!Number.isFinite(durationSec) || durationSec <= 0) {
        throw new Error(`无效的视频时长: ${durationSec}`);
      }

      // 原子更新 projects 表：status、exportUrl、durationSec、lastVisitedStep
      const effectiveProjectId = urlProjectId || projectData?.projectId;
      if (!token || !effectiveProjectId) {
        throw new Error("无效的操作状态：用户未登录或项目未创建");
      }

      // 获取封面图片URL：优先用户选择的封面，否则获取第一张分镜图片
      let videoCoverImageUrlToSave = selectedCoverUrl.trim() || null;
      if (!videoCoverImageUrlToSave) {
        try {
          const frameImagesResult = await realProjectsApi.getStep3FrameImages(token, effectiveProjectId);
          if (frameImagesResult.frames && frameImagesResult.frames.length > 0) {
            const firstFrame = frameImagesResult.frames[0];
            if (firstFrame.imageUrl && firstFrame.imageUrl.trim()) {
              videoCoverImageUrlToSave = firstFrame.imageUrl.trim();
              console.log("[Step4] 使用第一张分镜图作为视频封面:", videoCoverImageUrlToSave);
            }
          }
        } catch (err) {
          console.warn("[Step4] 获取分镜图片失败，跳过封面:", err);
        }
      }

      await realProjectsApi.completeProjectVideo(token, effectiveProjectId, {
        exportUrl: fileUrl,
        durationSec: Math.round(durationSec),
        lastVisitedStep: 4,
        // 视频封面
        videoCoverImageUrl: videoCoverImageUrlToSave,
        backgroundMusicUrl: selectedMusic?.musicUrl || null,
        backgroundMusicTitle: selectedMusic?.title || null,
        transitionType: "random",
        transitionDurationFrames: 90,  // 90帧 = 3秒 @ 30fps (FreeCut模式)
      });
      // 传递实际视频时长
      onMergeComplete(fileUrl, result.duration);
    } catch (error) {
      setIsMerging(false);
      setMergeProgress(0);
      setMergeStatus("");
      const message = error instanceof Error ? error.message : "合成最终视频失败，请稍后重试";
      setFeedback(message);
    } finally {
      hideGlobalLoading();
    }
  };

  const onMergeComplete = (finalVideoUrl?: string | null, durationSec?: number) => {
    // 同步更新 projectData.exportUrl，确保 hasMergedOutput 判断正确
    if (finalVideoUrl) {
      updateProjectData({ exportUrl: finalVideoUrl });
    }
    // 关闭合成界面
    setIsMerging(false);
    setMergeProgress(0);
    setMergeStatus("");
    // 合成完成后滚动到视频预览区域（延迟等待界面关闭）
    setTimeout(() => {
      mergedVideoPreviewRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  const completedClipCountForDisplay = clipStatuses.filter((item) => item.status === "completed").length;
  const hasStartedGeneration = hasRunningJob || completedClipCountForDisplay > 0;
  const queueTotalCount = hasStartedGeneration ? segments.length : 0;

  const ConfigContent = () => (
    <>
      <p className="text-sm text-gray-500 mb-6 lg:mb-8">Step4 分镜图已直接作为视频生成输入源，队列状态在这里统一查看。</p>
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-bold text-primary mb-2 flex items-center gap-2">
          <span className="material-icons-round text-base">sync</span>渲染队列
        </h3>
        <div className="text-xs text-gray-600 space-y-2">
          <div className="flex justify-between">
            <span>总任务数</span>
            <span className="font-bold">{queueTotalCount}</span>
          </div>
          <div className="flex justify-between">
            <span>已完成</span>
            <span className="font-bold text-green-600">{completedClipCountForDisplay}</span>
          </div>
        </div>
      </div>
      {/* 批量控制已隐藏 */}
      <div className="text-xs text-gray-500 border border-gray-100 rounded-lg bg-gray-50 px-3 py-2">
        {startingJob
          ? "后端任务启动中..."
          : hasRunningJob
            ? "基础片段仍在生成，可先挑版本或发起单镜头重试。"
            : allClipsCompleted
              ? "基础片段已全部完成，可继续裂变与合成。"
              : queuedManualBatchStart
                ? "已登记后续批量队列，待当前队列结束后自动执行。"
                : manualBatchQueueEnabled
                  ? "批量队列已开启，当前可随时手动启动下一队列。"
                  : "尚未启动视频生成，可使用“批量开始”触发。"}
      </div>
    </>
  );

  // 数据加载中或恢复中，显示全屏 loading
  if (step4ApiData.isLoading || !initialRecoveryDone) {
    return <FullScreenLoading />;
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col bg-[#fdfbf7] lg:flex-row">
      {isMerging ? (
        <Step4FinalVideoMergeLoading progress={mergeProgress} status={mergeStatus} />
      ) : null}
      <Step4VideoWorkspaceConfigDrawer isOpen={showMobileConfig} onClose={() => setShowMobileConfig(false)}>
        <ConfigContent />
      </Step4VideoWorkspaceConfigDrawer>

      {previewModal ? (
        <Step4VariantPreviewModal
          modal={previewModal}
          variants={variantsForPreviewModal.get(previewModal.sceneIndex) ?? []}
          onClose={() => setPreviewModal(null)}
          onPrev={() => setPreviewModal((current) => {
            if (!current) return current;
            const sceneVars = variantsForPreviewModal.get(current.sceneIndex) ?? [];
            const prevIndex = Math.max(0, current.variantIndex - 1);
            return { ...current, variantIndex: prevIndex, url: sceneVars[prevIndex]?.url ?? current.url };
          })}
          onNext={() => setPreviewModal((current) => {
            if (!current) return current;
            const sceneVars = variantsForPreviewModal.get(current.sceneIndex) ?? [];
            const nextIndex = Math.min(sceneVars.length - 1, current.variantIndex + 1);
            return { ...current, variantIndex: nextIndex, url: sceneVars[nextIndex]?.url ?? current.url };
          })}
          onSelect={async () => {
            if (!previewModal) return;
            const currentIndex = selections[previewModal.sceneIndex] ?? 0;
            if (previewModal.variantIndex !== currentIndex) {
              const ok = await confirm("会用新的分镜视频覆盖，是否要切换？", "确认切换");
              if (!ok) return;
            }
            handleSelectVideoVariant(previewModal.sceneIndex, previewModal.variantIndex);
          }}
          hasMultipleVariants={previewModalVariantCount > 1}
        />
      ) : null}

      <ProjectFlowHistorySidebar
        currentStep={4}
        projectId={urlProjectId || (projectData?.projectId ?? undefined)}
        onImagePreview={(frames, currentIndex) => setImagePreview({ frames, currentIndex })}
      >
        {/* 音乐引导 */}
        {musicState.enabled !== false && musicState.recommendation?.music && !musicState.isLoading && (
          <div className="px-5 pt-5 pb-2">
            <div className="relative flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 px-3 py-2 border border-orange-100/60">
              <span className="material-icons-round text-primary text-sm">music_note</span>
              <span className="text-[11px] text-gray-500">点击下方 <span className="font-semibold text-gray-700">切换</span> 按钮更换背景音乐</span>
              <button
                type="button"
                onClick={() => setShowMusicPrinciple((v) => !v)}
                className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-orange-100 hover:text-primary"
                title="音乐匹配原理"
              >
                <span className="material-icons-round text-sm">info_outline</span>
              </button>
              {/* 音乐匹配原理浮层 */}
              {showMusicPrinciple && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1.5 rounded-xl border border-orange-100 bg-white px-3.5 py-3 shadow-lg">
                  <div className="mb-2 flex items-center gap-1.5">
                    <span className="material-icons-round text-sm text-primary">auto_awesome</span>
                    <span className="text-[11px] font-bold text-gray-700">智能匹配原理</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[9px] font-bold text-orange-500">1</span>
                      <span className="text-[11px] leading-relaxed text-gray-600">精选近期火爆、热度持续上升、容易停留和爆的音乐</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[9px] font-bold text-orange-500">2</span>
                      <span className="text-[11px] leading-relaxed text-gray-600">根据视频脚本的风格和调性，智能匹配最合适的音乐</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 音乐模块 */}
        {musicState.enabled !== false ? (
          <Step4MusicCompact
            enabled={musicState.enabled}
            isLoading={musicState.isLoading}
            recommendation={musicState.recommendation}
            selectedMusicId={musicState.selectedMusicId}
            hasMergedOutput={hasMergedOutput}
            token={token}
            onSelectMusic={handleSelectMusic}
            onClearSelection={handleClearMusicSelection}
            onSelectFromLibrary={handleSelectFromLibrary}
            beatSyncEnabled={beatSyncEnabled}
            beatSyncIntensity={beatSyncIntensity}
            onBeatSyncToggle={(enabled) => setBeatSyncEnabled(enabled)}
            onBeatSyncIntensityChange={(intensity) => setBeatSyncIntensity(intensity)}
            beatDetectResult={beatDetectResult}
            onBeatDetected={(result) => setBeatDetectResult(result)}
          />
        ) : null}
      </ProjectFlowHistorySidebar>

      {/* 图片预览模态框 */}
      <ImageLightbox
        open={imagePreview !== null && imagePreview.frames.length > 0}
        url={imagePreview?.frames[imagePreview.currentIndex]?.imageUrl ?? ""}
        alt={imagePreview?.frames[imagePreview.currentIndex]?.title ?? "分镜预览"}
        label={imagePreview?.frames[imagePreview.currentIndex]?.title ?? `镜头 ${(imagePreview?.currentIndex ?? 0) + 1}`}
        frames={imagePreview?.frames.map(f => f.imageUrl)}
        currentIndex={imagePreview?.currentIndex ?? 0}
        onNavigate={(index) => {
          if (imagePreview) setImagePreview({ ...imagePreview, currentIndex: index });
        }}
        onClose={() => setImagePreview(null)}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <Step4PreviewWorkspaceHeader
          title="Step 4. 视频工作台"
          subtitle="首轮视频直接覆盖当前分镜卡位，支持单镜头重试与顺序合成。"
          segmentCount={segments.length}
          statusLabel={startingJob ? "启动中" : allClipsCompleted ? "已完成" : hasRunningJob ? "生成中" : hasFailedClip ? "可重试" : "待开始"}
          badges={step4Locked ? <span className="inline-flex items-center gap-1 text-amber-600 text-sm"><span className="material-icons-round text-sm">lock</span>已锁定</span> : undefined}
          controls={
            <button
              onClick={() => setShowMobileConfig(true)}
              className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600"
              aria-label="打开队列状态"
            >
              <span className="material-icons-round text-base">tune</span>
            </button>
          }
        />

        <div className={`flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar ${FLOW_SAFE_BOTTOM_PADDING.step4VideoWorkspaceExtended}`}>
          {hasRunningJob ? (
            <div className="mb-4 text-xs text-gray-600 border border-orange-200 bg-orange-50 rounded-lg px-3 py-2">
              仍有片段在生成中。可继续挑版本，待基础队列完成后再执行最终合成。
            </div>
          ) : null}
          {loadingSceneAssets && !hasPreviewSeed ? (
            <div className="mb-4 text-xs text-gray-600 border border-cyan-200 bg-cyan-50 rounded-lg px-3 py-2">
              正在接入 Step3 分镜图与已保存快照，混剪工作台先显示占位卡，不再退回旧预览框架。
            </div>
          ) : null}

          <div className="mx-auto w-full max-w-[1220px]">
            <div className="flex items-center gap-0">
              {/* 封面 */}
                <Step4CoverCard
                  coverUrl={selectedCoverUrl}
                  onClick={() => setCoverSelectorOpen(true)}
                />
              {/* 封面与镜头分界 */}
              <div className="flex items-center px-5">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-[3px] h-8 rounded-full bg-gradient-to-b from-primary/20 to-primary/50" />
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary/30 bg-gradient-to-br from-primary/10 to-orange-50">
                    <span className="material-icons-round text-primary text-sm">arrow_forward</span>
                  </div>
                  <div className="w-[3px] h-8 rounded-full bg-gradient-to-b from-primary/50 to-primary/20" />
                </div>
              </div>
              {/* 镜头片段 */}
              <div className="flex-1 min-w-0 rounded-2xl border border-gray-200/60 bg-gradient-to-b from-gray-50/40 to-white shadow-[0_2px_16px_rgba(0,0,0,0.06),0_8px_32px_rgba(0,0,0,0.03)]">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 rounded-t-2xl overflow-hidden">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-700">
                    <span className="material-icons-round text-white text-xs">movie_filter</span>
                  </span>
                  <span className="text-sm font-bold text-gray-800">镜头片段</span>
                  <span className="text-[11px] text-gray-400">共 {segments.length} 个</span>
                </div>
                <div className="flex flex-wrap gap-4 p-4">
              {segments.map((segment, sceneIndex) => {
                const status = clipStatuses.find((item) => item.id === sceneIndex) ?? {
                  id: sceneIndex,
                  progress: 0,
                  status: "pending" as const,
                  prompt: segment.videoCue ?? segment.visualCue,
                  url: "",
                };
                const sourceImageUrl = frameImageUrls[sceneIndex]?.trim() || "";
                // 【统一数据源】视频只从 sceneVariants 获取（来自 step4_video_scenes 表）
                const sceneVideoUrl = sceneVariants[sceneIndex]?.[selections[sceneIndex] ?? 0]
                  ?? sceneVariants[sceneIndex]?.[0]
                  ?? "";
                const hasSceneVideo = sceneVideoUrl.length > 0 && isStep4VideoAsset(sceneVideoUrl);
                // 有视频显示视频，没有视频显示分镜图片作为占位
                const primaryVariantUrl =
                  (hasSceneVideo ? sceneVideoUrl : "") ||
                  sourceImageUrl ||
                  step4LoadingPosterFrameSrc;
                // variants 只包含真实视频，不包含分镜图片
                const videoVariants = (sceneVariants[sceneIndex] ?? [])
                  .filter((url) => url.trim().length > 0 && isStep4VideoAsset(url));
                const variants = videoVariants.length > 0 ? videoVariants : [primaryVariantUrl];
                const mainVariantUrl = variants[0] ?? primaryVariantUrl;
                const previewCard = buildStep4PreviewCardModel({
                  status,
                  previewUrl: mainVariantUrl || null,
                  sourceImageUrl: sourceImageUrl || null,
                });
                const runtimeUi = previewCard.runtimeUi;
                const isVideo = isStep4VideoAsset(mainVariantUrl);
                // 【修复】每个镜头独立判断，移除 hasRunningJob 对所有镜头的阻塞
                // showLoadingState：镜头正在生成视频（来自 clipStatuses 轮询数据源）
                const showLoadingState = status.status === "generating";
                // isRetrying：镜头正在提交重试请求（来自前端本地状态，在 applyJobToClipStatuses 刷新后可能 showLoadingState 还没变为 generating）
                const isRetrying = retryingSceneIndices.has(sceneIndex);
                // 合并两种 loading 状态：任一为 true 就显示 loading 视觉效果
                const isLoadingOrRetrying = showLoadingState || isRetrying;
                const progressPercent = runtimeUi.progressPercent;
                // 【新增】失败状态判断
                const isFailed = status.status === "failed";
                // 失败提示30分钟后过期
                const THIRTY_MINUTES = 30 * 60 * 1000;
                const isFailedExpired = status.status === "failed"
                  && status.failedAt
                  && Date.now() - status.failedAt > THIRTY_MINUTES;
                const showFailedHint = isFailed && !isFailedExpired;
                const singleGenerateLabel = status.status === "completed" ? "重试生成当前镜头" : "生成当前镜头";
                const singleGenerateTitle =
                  step4SingleRetryCreditCost > 0
                    ? `${singleGenerateLabel}（${step4SingleRetryCreditCost}积分）`
                    : singleGenerateLabel;
                const loadingPosterSrc =
                  sourceImageUrl ||
                  (!isVideo ? mainVariantUrl : "") ||
                  step4LoadingPosterFrameSrc;
                const sceneTitle = resolveSceneLabel(sceneIndex);

                // 视频变体选择逻辑
                const selectedVariantIndex = selections[sceneIndex] ?? 0;
                // 显示用户实际选中的版本，而非固定 variants[0]
                const displayVariantIndex = Math.min(selectedVariantIndex, Math.max(0, variants.length - 1));
                const displayVariantUrl = variants[displayVariantIndex] ?? mainVariantUrl;
                const displayIsVideo = isStep4VideoAsset(displayVariantUrl);

                // 构建变体选择器 ViewModel
                const variantViewModel: Step4VideoVariantViewModel | null = variants.length > 1
                  ? {
                      sceneIndex,
                      selectedIndex: displayVariantIndex,
                      variants: variants.map((url) => ({ url, isVideo: isStep4VideoAsset(url) })),
                      storyboardImageUrl: sourceImageUrl || undefined,
                    }
                  : null;

                return (
                  <div key={`scene-card-${sceneOrderKeys[sceneIndex] ?? sceneIndex}`} className={`relative w-[212px] max-w-full rounded-2xl border bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12),0_12px_32px_rgba(0,0,0,0.06)] transition-shadow duration-200 ${isFailed ? 'border-amber-300' : 'border-gray-200/80'}`}>
                    {/* 标题栏：标题居中，左右功能区 */}
                    <div className="relative flex items-center h-[30px] px-3">
                      {/* 左侧：版本选择 */}
                      {variantViewModel && variantViewModel.variants.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => variantToggleExpandMapRef.current.get(sceneIndex)?.()}
                          className="flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                          title="切换视频版本"
                        >
                          <span className="grid grid-cols-2 gap-[1.5px]">
                            {variantViewModel.variants.slice(0, 4).map((_v, i) => (
                              <span key={i} className={`block h-[5px] w-[5px] rounded-[1px] transition-colors ${i === variantViewModel.selectedIndex ? 'bg-slate-500' : 'bg-slate-300'}`} />
                            ))}
                          </span>
                          <span>{variantViewModel.variants.length}</span>
                        </button>
                      ) : <div className="w-4" />}
                      {/* 标题绝对居中 */}
                      <h3 className="absolute inset-x-0 text-center text-[12px] font-bold leading-none text-gray-600 pointer-events-none" title={sceneTitle}>
                        <span className="px-12 truncate">{sceneTitle}</span>
                      </h3>
                      {/* 右侧：积分标签 */}
                      <div className="ml-auto">
                        {step4SingleRetryCreditCost > 0 && !isLoadingOrRetrying && (
                          <CreditBadge amount={step4SingleRetryCreditCost} variant="badge" dark />
                        )}
                      </div>
                    </div>

                    <div className="px-2 pb-2">
                    <Step4VideoVariantSelector
                      viewModel={variantViewModel}
                      onSelectVariant={(variantIndex) => handleSelectVideoVariant(sceneIndex, variantIndex)}
                      onDeleteVariant={(variantIndex) => handleDeleteVideoVariant(sceneIndex, variantIndex)}
                      isGenerating={isLoadingOrRetrying}
                      hideBadge
                      onToggleExpandRef={(fn) => {
                        if (fn) {
                          variantToggleExpandMapRef.current.set(sceneIndex, fn);
                        } else {
                          variantToggleExpandMapRef.current.delete(sceneIndex);
                        }
                      }}
                    >
                      <div
                        onDoubleClick={() => setPreviewModal({ sceneIndex, variantIndex: displayVariantIndex, url: displayVariantUrl })}
                        className={`group relative aspect-[9/16] w-full overflow-hidden rounded-xl border bg-black transition-all ${runtimeUi.shellClassName}`}
                      >
                        {/* 重新生成按钮 - 右上角 */}
                        <div className="absolute right-2 top-2 z-20">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleRetryScene(sceneIndex);
                            }}
                            disabled={!initialRecoveryDone || loadingSceneAssets || isLoadingOrRetrying}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-black/55 text-white transition hover:bg-black/75 disabled:opacity-60 disabled:cursor-not-allowed"
                            aria-label={singleGenerateLabel}
                            title={singleGenerateTitle}
                          >
                            <span className={`material-icons-round text-sm ${isLoadingOrRetrying ? "animate-spin" : ""}`}>
                              {isLoadingOrRetrying ? "autorenew" : "refresh"}
                            </span>
                          </button>
                        </div>

                        {isLoadingOrRetrying ? (
                          <>
                            <img
                              src={loadingPosterSrc}
                              className={`${PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS} h-full w-full object-cover transition-opacity duration-500 opacity-95`}
                            />
                            <video
                              key={`scene-${sceneIndex}-loading-${loadingPosterSrc}`}
                              src={STEP2_RUNTIME_PROGRESS_LOADING_VIDEO_SRC}
                              poster={loadingPosterSrc}
                              className={`${PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS} h-full w-full object-cover transition-opacity duration-500 ${runtimeUi.mediaClassName}`}
                              autoPlay
                              muted
                              loop
                              playsInline
                              preload="auto"
                            />
                          </>
                        ) : displayIsVideo ? (
                          // 视频卡片：使用 OSS 截帧缩略图，点击时加载原视频
                          previewSequenceAutoPlaying ? (
                            <video
                              src={displayVariantUrl}
                              className={`${PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS} h-full w-full object-cover transition-opacity duration-500 ${runtimeUi.mediaClassName}`}
                              muted
                              playsInline
                              loop
                              autoPlay
                            />
                          ) : (
                            <img
                              src={getOssVideoSnapshotUrl(displayVariantUrl, 0, 300)}
                              className={`${PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS} h-full w-full object-cover transition-opacity duration-500 ${runtimeUi.mediaClassName}`}
                            />
                          )
                        ) : (
                          <img
                            src={getOssThumbnailUrl(displayVariantUrl || loadingPosterSrc, 300)}
                            className={`${PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS} h-full w-full object-cover transition-opacity duration-500 ${runtimeUi.mediaClassName}`}
                          />
                        )}

                        {isLoadingOrRetrying ? (
                          <div className={`${PROJECT_FLOW_MEDIA_HOVER_OVERLAY_Z_CLASS} animate-pulse bg-gradient-to-r from-transparent via-white/10 to-transparent`} />
                        ) : null}

                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            setPreviewModal({ sceneIndex, variantIndex: displayVariantIndex, url: displayVariantUrl });
                          }}
                          className={`${PROJECT_FLOW_MEDIA_HOVER_OVERLAY_Z_CLASS} flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100`}
                          aria-label="预览镜头"
                        >
                          <span className="material-icons-round text-3xl text-white">play_circle</span>
                        </button>

                        {/* 进度百分比 - 左下角 */}
                        <div className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} left-2 bottom-2 rounded-full border border-white/70 bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-gray-700`}>
                          {progressPercent}%
                        </div>
                        {/* 进度条 */}
                        <div className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} inset-x-2 bottom-1 h-[3px] rounded-full bg-white/20`}>
                          <div
                            className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                              progressPercent >= 100
                                ? "bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400"
                                : progressPercent > 0
                                  ? "bg-gradient-to-r from-sky-400 via-sky-500 to-cyan-400"
                                  : "bg-slate-400/60"
                            }`}
                            style={{
                              width: `${progressPercent}%`,
                              boxShadow: progressPercent >= 100
                                ? "0 0 6px 1px rgba(52, 211, 153, 0.5)"
                                : progressPercent > 0
                                  ? "0 0 6px 1px rgba(56, 189, 248, 0.5)"
                                  : "none",
                            }}
                          />
                        </div>
                      </div>
                    </Step4VideoVariantSelector>

                    <div className="px-1 pb-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setContentDetailSceneIndex(sceneIndex)}
                        className="group/content relative h-14 w-full cursor-pointer overflow-hidden whitespace-pre-wrap rounded-lg bg-gray-50/80 px-2 py-1.5 text-left text-[11px] leading-[18px] text-gray-500 transition hover:bg-gray-100/80"
                        title="点击查看完整分镜内容"
                      >
                        <span className="line-clamp-3">{segment.videoCue?.trim() || segment.visualCue?.trim() || segment.content?.trim() || ""}</span>
                        {/* 右下角全屏引导图标 */}
                        <span className="absolute right-1 bottom-1 flex h-4 w-4 items-center justify-center rounded bg-white/80 text-gray-400 shadow-sm transition group-hover/content:text-primary group-hover/content:bg-primary/10">
                          <span className="material-icons-round" style={{ fontSize: 11 }}>fullscreen</span>
                        </span>
                      </button>
                    </div>
                    {/* 失败状态提示（30分钟后自动隐藏） */}
                    {showFailedHint ? (
                      <div className="mx-auto pb-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] text-amber-600">
                          <span className="material-icons-round text-[10px]">warning</span>
                          <span>最新视频生成失败，可点击重试</span>
                        </span>
                      </div>
                    ) : null}
                    {lastCompletedClipId === sceneIndex ? (
                      <div className="pb-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-[11px] font-bold text-green-600">
                          <span className="material-icons-round text-[10px]">check_circle</span>
                          最新完成
                        </span>
                      </div>
                    ) : null}
                    </div>
                  </div>
                );
              })}
                </div>
              </div>
            </div>


            {/* 分镜内容详情弹窗 */}
            {contentDetailSceneIndex !== null && (() => {
              const detailSegment = segments[contentDetailSceneIndex];
              const detailTitle = resolveSceneLabel(contentDetailSceneIndex);
              const detailContent = detailSegment?.videoCue?.trim() || detailSegment?.visualCue?.trim() || detailSegment?.content?.trim() || "";
              if (!detailSegment) return null;
              return createPortal(
                <div
                  className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                  onClick={() => setContentDetailSceneIndex(null)}
                >
                  <div
                    className="w-full max-w-md rounded-2xl bg-white shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* 标题栏 */}
                    <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-orange-500 shadow-sm">
                          <span className="material-icons-round text-white text-sm">description</span>
                        </span>
                        <h3 className="text-base font-bold text-gray-900">{detailTitle}</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setContentDetailSceneIndex(null)}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200"
                      >
                        <span className="material-icons-round text-lg">close</span>
                      </button>
                    </div>
                    {/* 内容区域 */}
                    <div className="px-5 py-4">
                      <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-gray-700 custom-scrollbar">
                        {detailContent || "暂无分镜内容"}
                      </div>
                    </div>
                  </div>
                </div>,
                document.body,
              );
            })()}
            {/* 多合一视觉过渡：镜头片段 → 合成视频 */}
            <div className="flex flex-col items-center py-10">
              {/* 上方：多个镜头卡片示意（散开排列） */}
              <div className="flex items-end gap-2">
                {[0,1,2,3].map((i) => (
                  <div
                    key={i}
                    className="rounded-lg border-2 bg-gradient-to-br shadow-md transition-transform"
                    style={{
                      width: 36 + i * 2,
                      height: 60 + i * 4,
                      borderColor: i === 0 ? 'rgba(249,115,22,0.5)' : 'rgba(200,200,200,0.6)',
                      background: i === 0
                        ? 'linear-gradient(135deg, rgba(249,115,22,0.15), rgba(251,191,36,0.1))'
                        : 'linear-gradient(135deg, rgba(230,230,230,0.5), rgba(245,245,245,0.3))',
                      boxShadow: i === 0
                        ? '0 2px 12px rgba(249,115,22,0.2)'
                        : '0 2px 8px rgba(0,0,0,0.06)',
                      transform: `rotate(${(i - 1.5) * 5}deg)`,
                    }}
                  />
                ))}
              </div>

              {/* 中间：汇聚线 + 大圆合并图标 */}
              <div className="flex flex-col items-center mt-2">
                {/* 汇聚斜线（用 SVG） */}
                <svg width="120" height="28" viewBox="0 0 120 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <line x1="20" y1="0" x2="60" y2="28" stroke="url(#mergeGrad1)" strokeWidth="2" strokeLinecap="round" />
                  <line x1="45" y1="0" x2="60" y2="28" stroke="rgba(200,200,200,0.5)" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="75" y1="0" x2="60" y2="28" stroke="rgba(200,200,200,0.5)" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="100" y1="0" x2="60" y2="28" stroke="url(#mergeGrad2)" strokeWidth="2" strokeLinecap="round" />
                  <defs>
                    <linearGradient id="mergeGrad1" x1="20" y1="0" x2="60" y2="28">
                      <stop offset="0%" stopColor="rgba(249,115,22,0.4)" />
                      <stop offset="100%" stopColor="rgba(249,115,22,0.9)" />
                    </linearGradient>
                    <linearGradient id="mergeGrad2" x1="100" y1="0" x2="60" y2="28">
                      <stop offset="0%" stopColor="rgba(200,200,200,0.3)" />
                      <stop offset="100%" stopColor="rgba(249,115,22,0.7)" />
                    </linearGradient>
                  </defs>
                </svg>

                {/* 大合并圆 */}
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary via-orange-500 to-amber-400 shadow-[0_4px_20px_rgba(249,115,22,0.45),0_0_40px_rgba(249,115,22,0.15)]">
                  <span className="material-icons-round text-white text-xl">merge</span>
                </div>

                {/* 下方扩散线 */}
                <svg width="80" height="24" viewBox="0 0 80 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <line x1="40" y1="0" x2="40" y2="24" stroke="rgba(249,115,22,0.5)" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </div>

              {/* 下方：单个大卡片示意 */}
              <div
                className="rounded-xl border-2 bg-gradient-to-br from-primary/15 to-orange-50"
                style={{
                  width: 64,
                  height: 40,
                  borderColor: 'rgba(249,115,22,0.45)',
                  boxShadow: '0 4px 20px rgba(249,115,22,0.2), 0 0 30px rgba(249,115,22,0.08)',
                }}
              >
                <div className="flex h-full w-full items-center justify-center">
                  <span className="text-[10px] font-bold text-primary/60">成片</span>
                </div>
              </div>
            </div>


              <div ref={mergedVideoPreviewRef} className="mt-10 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-bold text-gray-900">
                    <span className="mr-1.5 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-orange-200/60 align-middle">
                      <span className="material-icons-round text-primary text-sm">movie_filter</span>
                    </span>
                    合成视频预览
                  </h3>
                  <div className="flex items-center gap-2">
                    {hasMergedOutput && (
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await confirm("再合成会重新生成新的视频，是否继续", "确认重新合成");
                          if (ok) void handleMerge();
                        }}
                        disabled={isMerging}
                        className={`inline-flex items-center gap-0.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                          isMerging
                            ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                            : "border-primary bg-primary/5 text-primary hover:bg-primary/10"
                        }`}
                      >
                        <span className="material-icons-round text-sm">refresh</span>
                        再合成
                      </button>
                    )}
                  </div>
                </div>
                {/* 玻璃边框：多层 box-shadow 模拟透明玻璃质感 */}
                <div
                  className="mx-auto w-auto rounded-xl bg-black overflow-hidden flex items-center justify-center text-white"
                  style={{
                    aspectRatio: previewAspectRatioCss,
                    maxWidth: "430px",
                    maxHeight: "55vh",
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.15), 0 0 0 6px rgba(255,255,255,0.22), 0 0 0 7px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.2)',
                  }}
                >
                  {projectData?.exportUrl ? (
                    <div className="relative h-full w-full">
                      <video
                        src={projectData.exportUrl}
                        controls
                        autoPlay={previewSequenceAutoPlaying}
                        onPlay={() => setPreviewSequenceAutoPlaying(true)}
                        className="h-full w-full object-contain"
                      />
                      <div className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} left-2 top-2 rounded-full bg-emerald-500/90 px-2 py-1 text-[10px] font-semibold text-white shadow-sm`}>
                        <span className="material-icons-round text-[10px] align-middle mr-0.5">check_circle</span>
                        成片
                      </div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-xl font-bold">等待合成</div>
                      <div className="text-xs text-gray-300 mt-1">请先完成片段生成，再点击合成按钮。</div>
                    </div>
                  )}
                </div>
              </div>

              {/* 转场效果预览 */}
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => setShowTransitionPreview(!showTransitionPreview)}
                  className="w-full flex items-center justify-between rounded-xl border border-gray-200/80 bg-gradient-to-r from-gray-50 to-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:border-violet-200 hover:bg-violet-50/30"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-500/20">
                      <span className="material-icons-round text-violet-600 text-base">auto_awesome</span>
                    </div>
                    <span>转场效果预览</span>
                    <span className="text-xs text-gray-400">点击展开查看可用转场</span>
                  </div>
                  <span className={`material-icons-round text-gray-400 transition-transform ${showTransitionPreview ? 'rotate-180' : ''}`}>
                    expand_more
                  </span>
                </button>
                <Step4TransitionPreview expanded={showTransitionPreview} usedTransitionIds={usedTransitionIds} />
              </div>

              <div className="h-20 md:h-24" />
          </div>
        </div>
      </div>

      <div data-testid="step4-video-workspace-footer" className="fixed bottom-4 md:bottom-6 left-0 right-0 lg:left-[400px] z-40 flex justify-center pointer-events-none">
        <div className="bg-white border border-gray-200 rounded-full px-2 py-2 shadow-xl shadow-gray-200/50 pointer-events-auto flex items-center gap-4 max-w-[90%] md:max-w-none transform transition-all hover:scale-[1.01] active:scale-[0.99]">
          <Button variant="ghost" onClick={() => { const pid = projectData?.projectId ?? urlProjectId; navigate(`/create/${pid}/step3`); }} className="rounded-full px-4 text-gray-500 hover:text-gray-900 whitespace-nowrap">
            <span className="material-icons-round text-lg mr-1">arrow_back</span>
            <span className="hidden md:inline">上一步</span>
          </Button>

          <div className="h-4 w-px bg-gray-200" />
          <div className="text-[10px] text-gray-400 font-medium px-2 whitespace-nowrap flex items-center gap-1">
            {effectiveProjectStatus === "READY_TO_PUBLISH" || effectiveProjectStatus === "PUBLISHED"
              ? "已有合成结果"
              : effectiveProjectStatus === "CLIPS_READY"
                ? "可进行最终合成"
                : hasRunningJob || startingJob
                  ? "基础片段生成中"
                  : hasFailedClip
                    ? `${completedClipCount}/${totalClipCount} 镜头完成，可重试失败镜头`
                  : partialClipsCompleted
                    ? `${completedClipCount}/${totalClipCount} 镜头完成`
                    : "待手动启动"}
          </div>
          {/* 批量下载按钮暂时隐藏 */}
          {/* <div className="h-4 w-px bg-gray-200" />
          <Button variant="secondary" onClick={() => void handleBatchDownload()} className="rounded-full px-4 whitespace-nowrap">
            <span className="material-icons-round text-base mr-1">download</span>
            批量下载
          </Button> */}

          {(effectiveProjectStatus === "READY_TO_PUBLISH" || effectiveProjectStatus === "PUBLISHED") ? (
            <div className="pr-1">
              <Button
                data-testid="step4-video-workspace-next-only"
                onClick={() => {
                  const pid = projectData?.projectId ?? urlProjectId;
                  if (pid) navigate(`/create/${pid}/step5`);
                }}
                className="rounded-full px-4 bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/20 whitespace-nowrap transition-transform animate-pulse-scale"
              >
                下一步
                <span className="material-icons-round text-lg ml-1">arrow_forward</span>
              </Button>
            </div>
          ) : (
            <div className="pr-1">
              <Button
                data-testid="step4-video-workspace-merge"
                onClick={async () => {
                  // 有失败分镜且不在生成中 → 一次确认后批量重试
                  if (hasFailedClip && !hasRunningJob && !startingJob) {
                    const failedCount = step4ApiData.scenes.filter(s => s.clipStatus === "failed").length;
                    const ok = await confirm(`有 ${failedCount} 个镜头生成失败，是否重新生成？`, "重新生成");
                    if (!ok) return;
                    for (let idx = 0; idx < step4ApiData.scenes.length; idx++) {
                      if (step4ApiData.scenes[idx].clipStatus === "failed") {
                        void handleRetryScene(idx, { skipConfirm: true });
                      }
                    }
                    return;
                  }
                  void handleMerge();
                }}
                disabled={
                  (effectiveProjectStatus !== "CLIPS_READY" && !(hasFailedClip && !hasRunningJob && !startingJob))
                  || isMerging
                }
                className={`rounded-full px-6 text-white shadow-lg whitespace-nowrap transition-transform animate-pulse-scale ${
                  (effectiveProjectStatus !== "CLIPS_READY" && !(hasFailedClip && !hasRunningJob && !startingJob))
                  || isMerging
                    ? "bg-gray-300 shadow-none cursor-not-allowed text-gray-500"
                    : "bg-primary hover:bg-primary-hover shadow-primary/20"
                }`}
              >
                {isMerging ? (
                  <>
                    <span className="material-icons-round text-lg animate-spin">autorenew</span>
                    <span className="ml-1">合成中</span>
                  </>
                ) : effectiveProjectStatus !== "CLIPS_READY" && !(hasFailedClip && !hasRunningJob && !startingJob) ? (
                  <>
                    <span className="material-icons-round text-lg animate-spin">hourglass_top</span>
                    <span className="ml-1">分镜生成中</span>
                  </>
                ) : hasFailedClip ? (
                  <>
                    <span className="material-icons-round text-lg mr-1">videocam</span>
                    <span>生成分镜</span>
                  </>
                ) : (
                  <>
                    <span className="hidden md:inline">合成视频</span>
                    <span className="md:hidden">合成</span>
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 封面选择模态框 */}
      <Step4CoverSelectorModal
        isOpen={coverSelectorOpen}
        onClose={() => setCoverSelectorOpen(false)}
        currentCoverUrl={selectedCoverUrl}
        candidates={coverCandidates}
        onConfirm={(url) => {
          setSelectedCoverUrl(url);
          // 持久化视频封面 URL 到数据库，并同步更新 store
          if (urlProjectId && token) {
            backendApi.updateVideoCoverImageUrl(token, urlProjectId, url.trim() || null)
              .then(() => {
                // 同步更新 Zustand store，避免刷新后丢失
                updateProjectData({ videoCoverImageUrl: url.trim() || null });
              })
              .catch((e) => {
                console.error("[Step4] 视频封面保存失败:", e);
              });
          }
        }}
        token={token}
        projectId={projectData?.projectId ?? null}
      />
    </div>
  );
};
