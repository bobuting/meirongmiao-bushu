import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from 'react-router';
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/ui/Button";
import { CreditBadge } from "../../components/ui/CreditBadge";
import { BlurFillImage } from "../../components/shared/BlurFillImage";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { getOssThumbnailUrl } from "../../utils/ossImage";
import { useAppStore } from "../../store/useAppStore";
import { useShallow } from 'zustand/react/shallow';
import { useProjectState, getProjectState } from "../../hooks/useProjectState";
import { useFiveViewGeneration } from "../../hooks/useFiveViewGeneration";
import { usePagedList } from "../../hooks/usePagedList";
import { GlobalTaskType, TaskStatus } from "../../components/layout/taskQueueConfig";
import { ApiError, backendApi } from "../../services/backendApi";
import { uploadFileToOss } from "../../services/ossUpload";
import { FiveViewHistoryBar } from "../../components/project-flow/FiveViewHistoryBar";
import {
  PROJECT_FLOW_MEDIA_CHROME_Z_CLASS,
  PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS,
} from "../project-flow/projectFlowMediaLayerGuard";
import type { Step2FiveViewCandidateCard } from "../../../../src/contracts/step2-five-view-candidate-board-contract";
import { FLOW_SAFE_BOTTOM_PADDING } from "../project-flow/safeBottomPadding";
import { buildStep2OutfitReferenceItems, type Step2OutfitReferenceItem } from "../project-flow/step2OutfitReference";
import { resolveStep2GenerationReferenceWhitelist } from "../project-flow/step2GenerationReferenceWhitelist";
import { buildStep2GeneratedFiveViewCandidates } from "../project-flow/step2GeneratedFiveViewCandidates";
import { buildStep2LibraryFiveViewMatchCandidates } from "../project-flow/step2LibraryFiveViewMatch";
import { resolveStep2CharacterSelectionControllerState } from "../project-flow/step2CharacterSelectionController";
import { mergeStep2SlotRuntimeSelection, type Step2SlotRuntimePreviewItem, type Step2SlotRuntimeViewItem } from "../project-flow/step2SlotRuntimeIsolation";
import {
  buildStep2CandidateRetryButtonState,
  createStep2CandidateRetryRequest,
} from "../project-flow/step2CandidateCardActions";
import {
  checkCreditsBalance,
  DEFAULT_PROJECT_FLOW_CREDIT_PRICING,
  loadProjectFlowCreditPricing,
  normalizeProjectFlowCreditPricing,
  resolveProjectFlowCreditSpendErrorMessage,
  spendProjectFlowCredits,
} from "../project-flow/projectFlowCredit";
import { resolveStylingMasterPromptState } from "../../../../src/contracts/styling-master-prompt-state";
import {
  STEP2_RUNTIME_PROGRESS_LOADING_VIDEO_SRC,
} from "../../../../src/contracts/step2-runtime-progress-contract";
import {
  adaptStep1RolePresetCards,
  resolveStep1RolePresetCardById,
} from "../../../../src/modules/step1-role-preset-adapter";
import { buildStep1RolePresetPanelCompactLines } from "../../../../src/modules/step1-role-preset-panel-compact-render";
import { buildStep2GenerationDependencyBridge } from "../../../../src/modules/step2-generation-dependency-bridge";
import type { Step2SlotValues } from "../../../../src/contracts/step2-generation-dependency-contract";
import { buildStep2FixedTemplatePromptAssembler } from "../../../../src/modules/step2-fixed-template-prompt-assembler";
import { buildStep2RuntimeProgressBridge } from "../../../../src/modules/step2-runtime-progress-bridge";
import {
  buildStep2LeftPanelMasterPromptEditorView,
} from "../../../../src/modules/step2-left-panel-master-prompt-editor";
import { shouldRequireStep1RolePresetFirstPass } from "../../../../src/modules/step1-role-preset-entry-guard";
import { resolveRoleDirectionAvatarRenderModel } from "../project-flow/step1RoleDirectionAvatarController";
import { resolveStep2RoleConfirmDirectEnter } from "../project-flow/step2RoleConfirmDirectEnter";
import { resolveStep2PrimaryActionLabels } from "../project-flow/projectFlowKind";
import {
  buildStep2ImageProjectCompletionPatch,
  resolveStep2FooterFeedback,
  resolveStep2FooterTargetRoute,
} from "../project-flow/step2ProjectFlowAction";
import { SidebarPanelHeader } from "../../components/project-flow/SidebarPanelHeader";
import {
  StepContentHeader,
  ImageProjectFlowHistorySidebar,
} from "../../components/project-flow";
import type { ImageProjectStatus } from "../../../../src/contracts/types";
import type { OutfitPlanDto } from "../../../../src/contracts/outfit-plan.dto";
import { isImageStatusBeyond } from "../../../../src/contracts/types";
import {
  type FiveViewSlotKey,
  type BackgroundGenerationTaskState,
  type CharacterOption,
  type ViewItem,
  type PreviewItem,
  type LibraryCharacterListItem,
  VIEW_LABEL_BY_KEY,
  FIVE_VIEW_SLOT_ORDER,
  isStep2StyledGenerationTriggerSource,
  resolveStep2PersistedCandidatePreviewSelection,
  resolveStep2CandidateHasImage,
  collectStep2AllInOneDurationSamplesMs,
  estimateStep2AllInOneDurationMs,
  resolveStep2AllInOneSimulatedPercent,
  parseStep2GeneratedCandidateOrder,
  clampTaskProgress,
  normalizeStep2BackendProgressSignal,
  normalizeBackgroundGenerationTask,
  mergeBackgroundResultRefs,
  resolveStep2V2BackgroundTaskImageUrl,
  buildStep2V2BackgroundTaskId,
  migrateBackgroundGenerationTaskToMap,
  getBackgroundTaskForCandidate,
  resolveSlotKey,
  normalizeFiveViewSlots,
  normalizeViewItem,
  normalizePreviewItem,
  useStep2LoadingPosterFrameSrc,
} from "../shared/step2-utils";
import { MobileConfigDrawer, CharacterLibrarySelectorModal } from "../shared/step2-shared-components";
import { QuickCreateCharacterModal } from "../shared/step2-quick-create-modal";
import { CreateCharacterModal } from "../characters/characterCreateModalPanel";

type Step2StyledGenerationTriggerSource = "panel-single" | "panel-batch" | "panel-confirm-fallback";
type Step2V2CandidateRuntimeMeta = {
  startedAtMs?: number | null;
  backendProgressPercent?: number | null;
};

export const ImageCharacterSelection: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId: urlProjectId } = useParams<{ projectId: string }>();
  const { token, pushTaskNotification: _pushTaskNotification, showGlobalLoading, hideGlobalLoading, globalTaskQueue, globalTaskQueueInitialized } = useAppStore(useShallow((state) => ({ token: state.token, pushTaskNotification: state.pushTaskNotification, showGlobalLoading: state.showGlobalLoading, hideGlobalLoading: state.hideGlobalLoading, globalTaskQueue: state.globalTaskQueue, globalTaskQueueInitialized: state.globalTaskQueueInitialized })));
  const { confirm } = useConfirm();
  const { projectData, workflow, updateProjectData, addCharacter, selectCharacter, refreshCharacters, setImageProjectPatch } = useProjectState(urlProjectId);
  // 五视图生成 hook（仅 Step2 需要）
  const { generateFiveViewCharacter, batchGenerateFiveViewCharacters } = useFiveViewGeneration(urlProjectId);
  const currentUser = useAppStore((state) => state.currentUser);
  const persistedCandidatePreviewSelection = useMemo(
    () => resolveStep2PersistedCandidatePreviewSelection(projectData as unknown as Record<string, unknown> | null | undefined),
    [projectData],
  );
  const [showMobileConfig, setShowMobileConfig] = useState(false);
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const [_styledViews, setStyledViews] = useState<ViewItem[]>([]);
  const [outfitSummary, setOutfitSummary] = useState<string>("");
  const [outfitReferencePromptDraft, setOutfitReferencePromptDraft] = useState<string>("");
  const [_optimizingOutfitReferencePrompt, setOptimizingOutfitReferencePrompt] = useState(false);
  const [selectedPreviewId, setSelectedPreviewId] = useState<string | null>(null);
  const [_isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [_regeneratingPreviewId, setRegeneratingPreviewId] = useState<string | null>(null);
  const [regeneratingStyledSlotKey, setRegeneratingStyledSlotKey] = useState<FiveViewSlotKey | null>(null);
  const [isGeneratingAllStyledViews, setIsGeneratingAllStyledViews] = useState(false);
  const [_isStoppingStyledGeneration, setIsStoppingStyledGeneration] = useState(false);
  const [_generatedStyledViewIds, setGeneratedStyledViewIds] = useState<string[]>([]);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [isQuickCreating, setIsQuickCreating] = useState(false);
  const [showCreateCharacter, setShowCreateCharacter] = useState(false);
  const [showLibrarySelector, setShowLibrarySelector] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const cardRefMap = useRef<Map<string, HTMLElement>>(new Map());
  const [enteringStep3, setEnteringStep3] = useState(false);
  const [step2V2ActivePreviewSource, setStep2V2ActivePreviewSource] = useState<"generated" | "library" | null>(
    persistedCandidatePreviewSelection.source,
  );
  const [step2V2ActiveGeneratedCandidateId, setStep2V2ActiveGeneratedCandidateId] = useState<string | null>(
    persistedCandidatePreviewSelection.generatedCandidateId,
  );
  const [step2V2ActiveLibraryCandidateId, setStep2V2ActiveLibraryCandidateId] = useState<string | null>(
    persistedCandidatePreviewSelection.libraryCandidateId,
  );
  const [step2V2PromptDraft, setStep2V2PromptDraft] = useState("");
  const [step2V2Generating, setStep2V2Generating] = useState(false);
  const step2AutoTriggerInProgressRef = useRef(false);
  const [step2V2PendingCandidateId, setStep2V2PendingCandidateId] = useState<string | null>(null);
  const [step2V2CandidateRuntimeMeta, setStep2V2CandidateRuntimeMeta] = useState<Record<string, Step2V2CandidateRuntimeMeta>>({});
  const [step2RuntimeClockMs, setStep2RuntimeClockMs] = useState<number>(() => Date.now());
  const [previewImage, setPreviewImage] = useState<{ url: string; label: string } | null>(null);
  const step2LoadingPosterFrameSrc = useStep2LoadingPosterFrameSrc();
  const [creditPricing, setCreditPricing] = useState(DEFAULT_PROJECT_FLOW_CREDIT_PRICING);
  const [newlyUploadedCharacterId, setNewlyUploadedCharacterId] = useState<string | null>(null);
  const [manuallySelectedLibraryChar, setManuallySelectedLibraryChar] = useState<{
    id: string;
    name: string;
    thumbnailUrl: string;
    fiveViewOssImageUrl?: string | null;
  } | null>(null);
  const generateAllInFlightRef = useRef(false);
  const step2V2CandidateInFlightRef = useRef<Set<string>>(new Set());
  const stopStyledGenerationRequestedRef = useRef(false);
  const handledReturnRouteRef = useRef<string | null>(null);

  // ========== 步骤锁定：基于项目状态判断 ==========
  const step2Locked = isImageStatusBeyond(
    projectData.projectStatus as ImageProjectStatus | undefined,
    "IMAGE_CHARACTER_SELECTED",
  );

  // ========== GlobalTimer 集成 ==========
  const prevImageStep2LoadingCountRef = useRef(0);
  useEffect(() => {
    const shouldShowTimer = step2V2Generating || isGeneratingAllStyledViews || !!regeneratingStyledSlotKey;
    if (shouldShowTimer && prevImageStep2LoadingCountRef.current === 0) {
      showGlobalLoading();
    } else if (!shouldShowTimer && prevImageStep2LoadingCountRef.current > 0) {
      hideGlobalLoading();
    }
    prevImageStep2LoadingCountRef.current = shouldShowTimer ? 1 : 0;
  }, [step2V2Generating, isGeneratingAllStyledViews, regeneratingStyledSlotKey, showGlobalLoading, hideGlobalLoading]);
  const persistedStep2ViewHydrationKeyRef = useRef<string | null>(null);
  const step2V2BackgroundHydrationKeyRef = useRef<Record<string, string>>({});
  const previewsRef = useRef<PreviewItem[]>([]);
  const styledViewsRef = useRef<ViewItem[]>([]);
  const selectedPreviewIdRef = useRef<string | null>(null);
  const isAdminUser = currentUser?.role === "admin";
  const step2SingleRetryCreditCost = Math.max(0, creditPricing.singleImageCreditCost);
  // 图片项目固定为 "image" 类型
  const projectFlowKind = "image" as const;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStep2RuntimeClockMs(Date.now());
    }, 400);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const latestPersistedCandidatePreviewSelection = resolveStep2PersistedCandidatePreviewSelection(
      getProjectState(urlProjectId!).workflow as unknown as Record<string, unknown> | null | undefined,
    );
    generateAllInFlightRef.current = false;
    step2V2CandidateInFlightRef.current.clear();
    stopStyledGenerationRequestedRef.current = false;
    handledReturnRouteRef.current = null;
    persistedStep2ViewHydrationKeyRef.current = null;
    step2V2BackgroundHydrationKeyRef.current = {};
    previewsRef.current = [];
    styledViewsRef.current = [];
    selectedPreviewIdRef.current = null;
    setShowMobileConfig(false);
    setPreviews([]);
    setStyledViews([]);
    setOutfitSummary("");
    setOutfitReferencePromptDraft("");
    setOptimizingOutfitReferencePrompt(false);
    setSelectedPreviewId(null);
    setIsGeneratingPreview(false);
    setRegeneratingPreviewId(null);
    setRegeneratingStyledSlotKey(null);
    setIsGeneratingAllStyledViews(false);
    setIsStoppingStyledGeneration(false);
    setGeneratedStyledViewIds([]);
    setShowQuickCreate(false);
    setIsQuickCreating(false);
    setShowCreateCharacter(false);
    setShowLibrarySelector(false);
    setFeedback(null);
    setStep2V2ActivePreviewSource(latestPersistedCandidatePreviewSelection.source);
    setStep2V2ActiveGeneratedCandidateId(latestPersistedCandidatePreviewSelection.generatedCandidateId);
    setStep2V2ActiveLibraryCandidateId(latestPersistedCandidatePreviewSelection.libraryCandidateId);
    setStep2V2PromptDraft("");
    setStep2V2Generating(false);
    step2AutoTriggerInProgressRef.current = false;
    setStep2V2PendingCandidateId(null);
    setStep2V2CandidateRuntimeMeta({});
    setPreviewImage(null);
  }, [projectData.projectId]);

  // 弹窗数据：角色库列表（懒加载）
  // 使用 usePagedList Hook 进行分页加载
  const {
    items: libraryCharacters,
    total: libraryCharactersTotal,
    hasMore: libraryCharactersHasMore,
    isLoading: loadingLibraryCharacters,
    isLoadingMore: loadingMoreLibraryCharacters,
    loadFirstPage: loadLibraryCharactersFirstPage,
    loadNextPage: loadLibraryCharactersNextPage,
    reset: resetLibraryCharacters,
  } = usePagedList({
    pageSize: 20,
    autoLoad: false, // 手动触发加载
    fetcher: async ({ page, pageSize }) => {
      if (!token) {
        return { items: [], total: 0, hasMore: false };
      }
      const result = await backendApi.listLibraryCharacters(token, { page, pageSize });
      return {
        items: result.items ?? [],
        total: result.total,
        hasMore: result.hasMore ?? false,
      };
    },
    fetcherParams: { token },
  });

  // 打开角色库选择器时触发加载
  useEffect(() => {
    if (showLibrarySelector && !loadingLibraryCharacters && libraryCharacters.length === 0) {
      loadLibraryCharactersFirstPage();
    }
  }, [showLibrarySelector, loadingLibraryCharacters, libraryCharacters.length, loadLibraryCharactersFirstPage]);

  // 项目角色（Step2 presets 从 workflow 获取，由 useProjectState 统一加载）
  // 合并生成角色和角色库角色
  const imageProjectGeneratedCharacters = (workflow.imageProjectGeneratedCharacters as Array<{
    id: string;
    projectId: string;
    libraryCharacterId: string;
    role: "main" | "secondary";
    sourceType: "generated" | "library";
    isSelected: boolean;
    generationSlot: number | null;
    character: {
      id: string;
      name: string;
      thumbnailUrl: string;
      fiveViewOssImageUrl?: string | null;
      tags?: string[];
      kind?: string;
      status?: string;
      views?: string[];
      activeFiveViewStatus?: "pending" | "processing" | "ready" | "failed" | null;
    } | null;
    createdAt: number;
    updatedAt: number;
  }>) ?? [];

  const imageProjectLibraryCharacters = (workflow.imageProjectLibraryCharacters as Array<{
    id: string;
    projectId: string;
    libraryCharacterId: string;
    role: "main" | "secondary";
    sourceType: "generated" | "library";
    isSelected: boolean;
    generationSlot: number | null;
    character: {
      id: string;
      name: string;
      thumbnailUrl: string;
      fiveViewOssImageUrl?: string | null;
      tags?: string[];
      kind?: string;
      status?: string;
      views?: string[];
      activeFiveViewStatus?: "pending" | "processing" | "ready" | "failed" | null;
    } | null;
    createdAt: number;
    updatedAt: number;
  }>) ?? [];

  const imageProjectCharacters = [...imageProjectGeneratedCharacters, ...imageProjectLibraryCharacters];

  const presets = useMemo(
    () =>
      imageProjectCharacters
        .filter((item) => item.character != null)
        .map(
          (item): CharacterOption => ({
            id: item.libraryCharacterId,
            name: item.character!.name,
            tags: item.character!.tags ?? [],
            thumbnail: item.character!.thumbnailUrl,
            kind: item.character!.kind as CharacterOption["kind"],
            status: item.character!.status as CharacterOption["status"],
            views: item.character!.views ?? [],
            fiveViewOssImageUrl: item.character!.fiveViewOssImageUrl ?? null,
            generationSlot: item.generationSlot,
          }),
        ),
    [imageProjectCharacters],
  );

  const selectedCharacterId = (workflow.imageSelectedCharacterId as string | null) ?? null;

  const hasStartedStyledGeneration = false;
  const persistedBackgroundTasks = useMemo(
    () => ({} as Record<string, unknown>),
    [],
  );

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
    if (step2V2ActivePreviewSource || step2V2ActiveGeneratedCandidateId || step2V2ActiveLibraryCandidateId) {
      return;
    }
    if (
      !persistedCandidatePreviewSelection.source &&
      !persistedCandidatePreviewSelection.generatedCandidateId &&
      !persistedCandidatePreviewSelection.libraryCandidateId
    ) {
      return;
    }
    setStep2V2ActivePreviewSource(persistedCandidatePreviewSelection.source);
    setStep2V2ActiveGeneratedCandidateId(persistedCandidatePreviewSelection.generatedCandidateId);
    setStep2V2ActiveLibraryCandidateId(persistedCandidatePreviewSelection.libraryCandidateId);
  }, [
    persistedCandidatePreviewSelection.generatedCandidateId,
    persistedCandidatePreviewSelection.libraryCandidateId,
    persistedCandidatePreviewSelection.source,
    step2V2ActiveGeneratedCandidateId,
    step2V2ActiveLibraryCandidateId,
    step2V2ActivePreviewSource,
  ]);

  useEffect(() => {
    if (
      persistedCandidatePreviewSelection.source === step2V2ActivePreviewSource &&
      persistedCandidatePreviewSelection.generatedCandidateId === step2V2ActiveGeneratedCandidateId &&
      persistedCandidatePreviewSelection.libraryCandidateId === step2V2ActiveLibraryCandidateId
    ) {
      return;
    }
    // 不再持久化到 workflow，使用本地状态
  }, [
    persistedCandidatePreviewSelection.generatedCandidateId,
    persistedCandidatePreviewSelection.libraryCandidateId,
    persistedCandidatePreviewSelection.source,
    step2V2ActiveGeneratedCandidateId,
    step2V2ActiveLibraryCandidateId,
    step2V2ActivePreviewSource,
  ]);

  // 背景任务管理函数 - 使用本地状态而非 workflow
  const persistBackgroundTask = (_candidateId: string, _next: BackgroundGenerationTaskState | null) => {
    // 不再持久化到 workflow
  };

  const markBackgroundTaskRunning = (_candidateId: string, _input: {
    taskId: string;
    progress: number;
    resultRefs?: string[];
    startedAt?: number | null;
  }) => {
    // 不再持久化到 workflow
  };

  const markBackgroundTaskCompleted = (_candidateId: string, _input: {
    taskId: string;
    resultRefs?: string[];
    startedAt?: number | null;
  }) => {
    // 不再持久化到 workflow
  };

  const markBackgroundTaskFailed = (_candidateId: string, _input: {
    taskId: string;
    message: string;
    code?: string;
    resultRefs?: string[];
    startedAt?: number | null;
  }) => {
    // 不再持久化到 workflow
  };

  const activePreset = presets.find((preset) => preset.id === selectedCharacterId) ?? null;
  const step2V2GeneratedPreviewUrls = useMemo(
    () => {
      // 从本地状态获取生成的预览 URL
      return [] as string[];
    },
    [],
  );
  const step2LibraryBaseCards = useMemo(
    () => {
      // imageProjectLibraryCharacters 现在来自 getLibraryRecommendations（懒匹配）
      const libraryItems = imageProjectLibraryCharacters;

      return libraryItems.map((item, index): Step2FiveViewCandidateCard => ({
        candidateId: `library-${item.libraryCharacterId}`,
        sourceType: "library" as const,
        rowIndex: 2,
        displayOrder: index + 1,
        title: item.character?.name ?? "",
        closeupPreviewUrl: item.character?.fiveViewOssImageUrl ?? item.character?.thumbnailUrl ?? null,
        fiveViewAssetUrl: item.character?.fiveViewOssImageUrl ?? item.character?.thumbnailUrl ?? null,
        generationStatus: "ready" as const,
        progressPercent: 100,
        generationSlot: item.generationSlot, // 保留 generationSlot 用于识别手动选入的角色
        isSelected: item.isSelected, // 是否已选中为项目主角色
      }));
    },
    [imageProjectLibraryCharacters],
  );
  // 角色库卡片直接使用基础数据
  const step2LibraryCandidateCards = step2LibraryBaseCards;

  // 合并 top4 + 手动选入/新上传角色（对齐视频项目）
  const step2LibraryDisplayCards = useMemo(() => {
    const top4 = step2LibraryCandidateCards.slice(0, 4);

    // 手动选入的角色固定放在第 5 位
    let extraCard: Step2FiveViewCandidateCard | null = null;
    if (manuallySelectedLibraryChar) {
      extraCard = {
        candidateId: `library-${manuallySelectedLibraryChar.id}`,  // 与角色库匹配推荐格式一致
        sourceType: "library",
        rowIndex: 2,
        displayOrder: 4,
        title: manuallySelectedLibraryChar.name,
        closeupPreviewUrl: manuallySelectedLibraryChar.thumbnailUrl || manuallySelectedLibraryChar.fiveViewOssImageUrl || null,
        fiveViewAssetUrl: manuallySelectedLibraryChar.fiveViewOssImageUrl ?? null,
        generationStatus: "ready",
        progressPercent: 100,
      };
    }

    // 新上传角色优先放在第 5 位（覆盖手动选入）
    if (newlyUploadedCharacterId) {
      const newPreset = presets.find((p) => p.id === newlyUploadedCharacterId);
      if (newPreset) {
        extraCard = {
          candidateId: `library-${newlyUploadedCharacterId}`,  // 与角色库匹配推荐格式一致
          sourceType: "library",
          rowIndex: 1,
          displayOrder: 4,
          title: newPreset.name ?? "",
          closeupPreviewUrl: (newPreset.thumbnail || newPreset.fiveViewOssImageUrl) ?? null,
          fiveViewAssetUrl: newPreset.fiveViewOssImageUrl ?? null,
          generationStatus: "ready",
          progressPercent: 100,
        };
      }
    }

    return extraCard ? [...top4, extraCard] : top4;
  }, [step2LibraryCandidateCards, manuallySelectedLibraryChar, newlyUploadedCharacterId, presets]);

  const step2LibraryReadyCount = useMemo(
    () => step2LibraryCandidateCards.filter((card) => card.generationStatus === "ready").length,
    [step2LibraryCandidateCards],
  );

  useEffect(() => {
    const seed = (outfitSummary || "").trim();
    if (!seed) {
      return;
    }
    setOutfitReferencePromptDraft((current) => (current.trim().length > 0 ? current : seed));
  }, [outfitSummary]);

  // ========== 服饰搭配就绪后自动触发角色库匹配（已关闭） ==========
  // const hasTriggeredMatchRef = useRef(false);
  // const hasOutfitData = outfitSummary.trim().length > 0;
  // useEffect(() => {
  //   if (!token || !projectData.projectId || !hasOutfitData) return;
  //   if (hasTriggeredMatchRef.current) return;
  //   hasTriggeredMatchRef.current = true;
  //   const currentOutfitSummary = outfitSummary.trim();
  //   const selectedName = activePreset?.name?.trim();
  //   const triggerMatch = async () => {
  //     if (!token || !projectData.projectId) return;
  //     try {
  //       await backendApi.matchCharactersByOutfit(token, projectData.projectId, {
  //         outfitSummary: currentOutfitSummary,
  //         roleDirectionPrompt: undefined,
  //         selectedCharacterName: selectedName || undefined,
  //       });
  //       void refreshCharacters();
  //     } catch {
  //       // 匹配失败不阻塞前端展示
  //     }
  //   };
  //   triggerMatch();
  // }, [token, projectData.projectId, hasOutfitData, outfitSummary, activePreset?.name, refreshCharacters]);


  // persistedBackgroundTasks 已清空为 {}，后台任务不再持久化到 workflow
  // 原有的恢复/回填逻辑不再需要

  const selectedOutfit = useMemo(() => {
    const outfits = (workflow.imageOutfitPlans as OutfitPlanDto[]) ?? [];
    const selectedId = workflow.imageSelectedOutfitId;
    if (!selectedId) return null;
    return outfits.find((item) => String(item.id) === String(selectedId)) ?? null;
  }, [workflow.imageOutfitPlans, workflow.imageSelectedOutfitId]);

  const selectedOutfitSource = "visual" as const; // 图片项目固定为 visual
  const step2Step1SelectedOutfitSummary = useMemo(() => {
    const sourceLabel = "图片搭配";
    const title =
      typeof selectedOutfit?.title === "string" && selectedOutfit.title.trim().length > 0
        ? selectedOutfit.title.trim()
        : selectedOutfit
          ? `搭配方案 ${selectedOutfit.id}`
          : "未选择搭配方案";
    const selectedOutfitId =
      selectedOutfit && typeof selectedOutfit.id === "string"
        ? selectedOutfit.id.trim()
        : typeof workflow.imageSelectedOutfitId === "string"
          ? workflow.imageSelectedOutfitId.trim()
          : workflow.imageSelectedOutfitId !== null && workflow.imageSelectedOutfitId !== undefined
            ? String(workflow.imageSelectedOutfitId).trim()
            : "";
    // 从 imageOutfitPlans 构建 analysis cards
    const normalizedAnalysisCards = Array.isArray(workflow.imageOutfitPlans)
      ? workflow.imageOutfitPlans
          .map((item, idx) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return null;
            }
            const record = item as Record<string, unknown>;
            const rawPlanId = typeof record.id === "string" ? record.id.trim() : "";
            const rawIndex = typeof record.index === "number" ? record.index : idx + 1;
            const items: Array<{ type: string; text: string }> = [];
            return {
              planId: rawPlanId,
              index: rawIndex,
              title: typeof record.title === "string" ? record.title : "",
              items,
            };
          })
          .filter(Boolean)
      : [];
    let matchedCard = normalizedAnalysisCards.find((item) => item && item.planId.length > 0 && item.planId === selectedOutfitId) ?? null;
    if (!matchedCard && selectedOutfitId.length > 0) {
      const generatedOutfits = (workflow.imageOutfitPlans as OutfitPlanDto[]) ?? [];
      const selectedIndex = generatedOutfits.findIndex((item) => String(item.id).trim() === selectedOutfitId);
      if (selectedIndex >= 0) {
        matchedCard = normalizedAnalysisCards.find((item) => item && item.index === selectedIndex + 1) ?? null;
      }
    }
    return {
      sourceLabel,
      title,
      complementaryItems: (matchedCard?.items ?? []).map((it) => ({ id: it.type, label: it.type, text: it.text })),
    };
  }, [
    workflow.imageOutfitPlans,
    workflow.imageSelectedOutfitId,
    selectedOutfit,
  ]);

  const step1RoleDirectionCards = useMemo(
    () => adaptStep1RolePresetCards(workflow.imageRoleDirections, "character-selection-project-data"),
    [workflow.imageRoleDirections],
  );
  const step1SelectedRoleDirectionId =
    typeof workflow.imageSelectedRoleDirectionId === "string" && workflow.imageSelectedRoleDirectionId.trim().length > 0
      ? workflow.imageSelectedRoleDirectionId.trim()
      : null;
  const step1SelectedRoleDirection = useMemo(
    () =>
      resolveStep1RolePresetCardById(step1RoleDirectionCards, step1SelectedRoleDirectionId),
    [step1RoleDirectionCards, step1SelectedRoleDirectionId],
  );
  const step1SelectedRoleDirectionConfirmed =
    Boolean(step1SelectedRoleDirectionId);
  const shouldRequireStep1RolePresetGate =
    step1RoleDirectionCards.length > 0 &&
    shouldRequireStep1RolePresetFirstPass({
      projectStatus: projectData.projectStatus,
      step1RolePresetConfirmed: step1SelectedRoleDirectionConfirmed,
      selectedCharacterId,
      selectedPreviewImageUrl: null,
      workflowSelectedPreviewId: projectData.selectedPreviewId,
      characters: [...((workflow.imageProjectGeneratedCharacters as unknown[]) || []), ...((workflow.imageProjectLibraryCharacters as unknown[]) || [])] as unknown[] | undefined,
      script: null,
      clipStatuses: null,
      pendingStoryboardImport: null,
      pendingScriptImport: null,
    });
  const step1SelectedRoleDirectionIndex = useMemo(
    () =>
      step1RoleDirectionCards.findIndex((item) => item.directionId === step1SelectedRoleDirectionId),
    [step1RoleDirectionCards, step1SelectedRoleDirectionId],
  );
  const step2SelectedRoleDirectionCompactLines = useMemo(
    () => (step1SelectedRoleDirection ? buildStep1RolePresetPanelCompactLines(step1SelectedRoleDirection) : []),
    [step1SelectedRoleDirection],
  );
  const step2SelectedRoleDirectionAvatar = useMemo(() => {
    if (!step1SelectedRoleDirection) {
      return null;
    }
    return resolveRoleDirectionAvatarRenderModel(
      step1SelectedRoleDirectionIndex >= 0 ? step1SelectedRoleDirectionIndex : 0,
      step1SelectedRoleDirection.gender,
      step1SelectedRoleDirection.portraitUrl,
    );
  }, [step1SelectedRoleDirection, step1SelectedRoleDirectionIndex]);
  useEffect(() => {
    if (!shouldRequireStep1RolePresetGate || step1SelectedRoleDirectionConfirmed) {
      return;
    }
    const pid = projectData.projectId ?? urlProjectId;
    navigate(`/image-create/${pid}/step1`, {
      replace: true,
      state: {
        step1GuardMessage: "请先在 Step1 选中并确认推荐角色预设，再进入 Step2。",
      },
    });
  }, [navigate, shouldRequireStep1RolePresetGate, step1SelectedRoleDirectionConfirmed, projectData.projectId, urlProjectId]);
  // Step2 no longer applies LLM slot-variation overrides.
  // Keep three cards as pure draw retries under the same Step1-confirmed prompt.
  const step2PromptVariantModes = useMemo(() => ["code", "code", "code"] as const, []);
  const step2FixedTemplatePromptAssembly = useMemo(
    () =>
      buildStep2FixedTemplatePromptAssembler({
        selectedRoleDirection: step1SelectedRoleDirection,
        selectedPlanId: workflow.imageSelectedOutfitId as string | undefined,
        selectedOutfitSource,
        analysisCards: workflow.imageOutfitPlans as unknown[] ?? [],
        persistedOutfitSummary: null,
        variantModes: step2PromptVariantModes,
      }),
    [
      workflow.imageOutfitPlans,
      workflow.imageSelectedOutfitId,
      selectedOutfitSource,
      step1SelectedRoleDirection,
      step2PromptVariantModes,
    ],
  );
  const step2RoleSlotValues = useMemo(
    () => step2FixedTemplatePromptAssembly.bundle.variants.map((variant) => variant.slotValues) as [Step2SlotValues, Step2SlotValues, Step2SlotValues],
    [step2FixedTemplatePromptAssembly],
  );

  const outfitReferenceItems = useMemo(
    (): Step2OutfitReferenceItem[] => buildStep2OutfitReferenceItems(workflow.imageGarmentModules as Parameters<typeof buildStep2OutfitReferenceItems>[0]),
    [workflow.imageGarmentModules],
  );
  const step2ReferencePolicyMode = "complete-outfit" as const; // 图片项目固定使用 complete-outfit
  const step2GenerationReferenceInput = useMemo(
    () =>
      resolveStep2GenerationReferenceWhitelist(outfitReferenceItems, {
        policyMode: step2ReferencePolicyMode,
      }),
    [outfitReferenceItems, step2ReferencePolicyMode],
  );
  const step2GenerationDependencyBridge = useMemo(
    () =>
      buildStep2GenerationDependencyBridge({
        referenceImages: step2GenerationReferenceInput.referenceImages,
        missingRequiredSlots: step2GenerationReferenceInput.missingRequiredSlots,
        fixedTemplateSlotValues: step2RoleSlotValues,
      }),
    [step2GenerationReferenceInput, step2RoleSlotValues],
  );
  const step2SlotToCharId = useMemo(
    () => {
      const map: Record<number, string> = {};
      presets.forEach((p) => {
        if (p.generationSlot) {
          map[p.generationSlot] = p.id;
        }
      });
      return map;
    },
    [presets],
  );
  const step2GeneratedBaseCards = useMemo(
    () =>
      buildStep2GeneratedFiveViewCandidates({
        projectId: projectData.projectId,
        dependencyReady: step2GenerationDependencyBridge.sharedState.status === "ready",
        generatedCharacters: imageProjectGeneratedCharacters,
      }),
    [step2GenerationDependencyBridge, projectData.projectId, imageProjectGeneratedCharacters],
  );
  // 生成卡片直接使用基础数据
  const step2GeneratedCandidateCards = step2GeneratedBaseCards;
  const step2GeneratedReadyCount = useMemo(
    () => step2GeneratedCandidateCards.filter((card) => card.generationStatus === "ready").length,
    [step2GeneratedCandidateCards],
  );
  const step2RemainingGenerateCount = useMemo(
    () =>
      step2GeneratedCandidateCards
        .slice(0, 3)
        .filter((card) => !resolveStep2CandidateHasImage(card)).length,
    [step2GeneratedCandidateCards],
  );
  const step2BatchGenerateCreditCost = useMemo(
    () => Math.max(0, step2RemainingGenerateCount * step2SingleRetryCreditCost),
    [step2RemainingGenerateCount, step2SingleRetryCreditCost],
  );
  const step2AllInOneDurationSamplesMs = useMemo(
    () => collectStep2AllInOneDurationSamplesMs(presets),
    [presets],
  );
  const step2AllInOneEstimatedDurationMs = useMemo(
    () => estimateStep2AllInOneDurationMs(step2AllInOneDurationSamplesMs),
    [step2AllInOneDurationSamplesMs],
  );
  const step2RuntimeMetaForBridge = useMemo(() => {
    const runtimeMetaById: Record<string, Step2V2CandidateRuntimeMeta> = {};
    for (const card of step2GeneratedCandidateCards) {
      const runtimeMeta = card.candidateId ? step2V2CandidateRuntimeMeta[card.candidateId] : undefined;
      const startedAtMs = runtimeMeta?.startedAtMs;
      const normalizedBackendPercent =
        typeof runtimeMeta?.backendProgressPercent === "number" &&
        Number.isFinite(runtimeMeta.backendProgressPercent) &&
        runtimeMeta.backendProgressPercent > 1 &&
        runtimeMeta.backendProgressPercent < 100
          ? Math.floor(runtimeMeta.backendProgressPercent)
          : null;
      const cardProgressPercent =
        typeof card.progressPercent === "number" &&
        Number.isFinite(card.progressPercent) &&
        card.progressPercent > 0 &&
        card.progressPercent < 100
          ? Math.floor(card.progressPercent)
          : null;
      // 有前端 startedAtMs 且无有效后端进度 → 走模拟进度（递增）
      // 不需要检查 generationStatus：ready/failed 由 contract state 函数 early return 兜底
      if (
        typeof startedAtMs === "number" &&
        Number.isFinite(startedAtMs) &&
        startedAtMs > 0 &&
        normalizedBackendPercent === null
      ) {
        if (card.candidateId) {
          runtimeMetaById[card.candidateId] = {
            startedAtMs,
            backendProgressPercent:
              resolveStep2AllInOneSimulatedPercent({
                nowMs: step2RuntimeClockMs,
                startedAtMs,
                estimatedDurationMs: step2AllInOneEstimatedDurationMs,
              }) ?? cardProgressPercent,
          };
        }
        continue;
      }
      if (card.candidateId) {
        runtimeMetaById[card.candidateId] = {
          startedAtMs: runtimeMeta?.startedAtMs ?? null,
          backendProgressPercent: normalizedBackendPercent ?? cardProgressPercent,
        };
      }
    }
    return runtimeMetaById;
  }, [
    step2AllInOneEstimatedDurationMs,
    step2GeneratedCandidateCards,
    step2RuntimeClockMs,
    step2V2CandidateRuntimeMeta,
  ]);
  const step2GeneratedRuntimeProgressBridge = useMemo(
    () =>
      buildStep2RuntimeProgressBridge({
        cards: step2GeneratedCandidateCards,
        dependencyReady: step2GenerationDependencyBridge.sharedState.status === "ready",
        runtimeMetaById: step2RuntimeMetaForBridge,
        activeCandidateId: step2V2PendingCandidateId,
      }),
    [
      step2GeneratedCandidateCards,
      step2GenerationDependencyBridge.sharedState.status,
      step2RuntimeMetaForBridge,
      step2V2PendingCandidateId,
    ],
  );
  const step2ControllerState = useMemo(
    () =>
      resolveStep2CharacterSelectionControllerState({
        step2GeneratedCandidateCards,
        step2LibraryCandidateCards,
        step2V2ActivePreviewSource,
        step2V2ActiveGeneratedCandidateId,
        step2V2ActiveLibraryCandidateId,
        confirmedCandidateId: selectedCharacterId,
        selectedCharacterId,
        hasStartedStyledGeneration,
        isGeneratingPreview: step2V2Generating,
      }),
    [
      hasStartedStyledGeneration,
      step2V2ActiveGeneratedCandidateId,
      step2V2ActiveLibraryCandidateId,
      step2V2ActivePreviewSource,
      selectedCharacterId,
      step2GeneratedCandidateCards,
      step2LibraryCandidateCards,
    ],
  );
  const {
    step2V2AllCandidates,
    step2V2ActiveCandidate,
    step2Step3GateState,
    step2NextDisabled,
    step2StatusText,
  } = step2ControllerState;
  const confirmedStep2Candidate = useMemo(() => {
    const confirmedCandidateId =
      typeof step2Step3GateState.confirmedCandidateId === "string"
        ? step2Step3GateState.confirmedCandidateId.trim()
        : "";
    if (!confirmedCandidateId) {
      return null;
    }
    return step2V2AllCandidates.find((card) => card.candidateId === confirmedCandidateId) ?? null;
  }, [step2Step3GateState.confirmedCandidateId, step2V2AllCandidates]);
  const confirmedStep2CandidateHasImage = resolveStep2CandidateHasImage(confirmedStep2Candidate);
  const step2NextDisabledWithImageGate =
    step2NextDisabled || !confirmedStep2CandidateHasImage;
  const step2StatusTextWithImageGate =
    step2Step3GateState.confirmedCandidateId && !confirmedStep2CandidateHasImage
      ? "已选角色缺少图片"
      : step2StatusText;

  // 主按钮文案和图标（根据角色选择状态动态变化）
  const step2PrimaryActionLabels = useMemo(
    () => resolveStep2PrimaryActionLabels(projectFlowKind, enteringStep3, step2Locked, Boolean(selectedCharacterId), step2GeneratedCandidateCards.length > 0),
    [enteringStep3, projectFlowKind, step2Locked, selectedCharacterId, step2GeneratedCandidateCards.length],
  );

  const handleQuickCreateCharacter = async (input: { name: string; tags: string[]; file: File }) => {
    if (!token) {
      setFeedback("请先登录。");
      return;
    }
    try {
      setIsQuickCreating(true);
      setFeedback(null);
      // 先上传到 OSS 获取 HTTP URL（自动压缩大图，适配即梦 API 限制）
      const { fileUrl: thumbnailUrl } = await uploadFileToOss(token, "library", input.file, true);
      const created = await backendApi.createLibraryCharacter(token, {
        name: input.name,
        kind: "basic",
        thumbnailUrl,
        tags: input.tags,
      });
      await loadLibraryCharactersFirstPage();
      setShowQuickCreate(false);
      setFeedback(`角色「${created.id}」已创建，请选择并生成预览。`);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "创建角色失败，请稍后重试";
      setFeedback(message);
    } finally {
      setIsQuickCreating(false);
    }
  };

  // 从角色库选择器中选择角色（对齐视频项目）
  const handleSelectFromLibrary = useCallback(
    async (character: {
      id: string;
      name: string;
      tags: string[];
      thumbnailUrl: string;
      kind: "basic" | "image" | "video";
      status: "processing" | "ready";
      views?: string[];
      fiveViewOssImageUrl?: string | null;
    }) => {
      setShowLibrarySelector(false);

      // 弹窗选择的角色固定显示在第5槽位
      setManuallySelectedLibraryChar({
        id: character.id,
        name: character.name,
        thumbnailUrl: character.thumbnailUrl,
        fiveViewOssImageUrl: character.fiveViewOssImageUrl,
      });

      setStep2V2ActivePreviewSource("library");
      setStep2V2ActiveLibraryCandidateId(`library-${character.id}`); // 第五槽位的 candidateId 格式
      setStep2V2ActiveGeneratedCandidateId(null);
      setFeedback(`已选择角色「${character.name}」，点击确认进入下一步。`);

      if (token && projectData.projectId) {
        // 使用集中式操作方法，generationSlot=5 表示第5槽位
        void (async () => {
          await addCharacter(character.id, { sourceType: "library", generationSlot: 5 });
          await selectCharacter(`library-${character.id}`);
          updateProjectData({ selectedCharacterId: character.id, projectStatus: "IMAGE_CHARACTER_SELECTED" });
          // 刷新角色列表（更新 isSelected 状态）
          void refreshCharacters();
        })();
      }
    },
    [token, projectData.projectId, refreshCharacters, updateProjectData, addCharacter, selectCharacter],
  );

  // 创建角色并同步到项目（对齐视频项目）
  const handleCreateCharacterSave = useCallback(
    async (character: { id: string; name: string }, skipGeneration?: boolean) => {
      if (!token) return;

      // 标记为新上传角色，持续显示直到页面刷新
      setNewlyUploadedCharacterId(character.id);

      // 自动选中新上传的角色并打开预览面板
      setStep2V2ActivePreviewSource("library");
      setStep2V2ActiveLibraryCandidateId(character.id);

      // 刷新角色库列表
      await loadLibraryCharactersFirstPage();

      // 将新角色关联到项目（使用集中式操作方法）
      // 从角色库选入的角色：sourceType=library, generationSlot=5
      if (projectData.projectId) {
        try {
          await addCharacter(character.id, { sourceType: "library", generationSlot: 5 });
          await selectCharacter(`library-${character.id}`);
          updateProjectData({ selectedCharacterId: character.id, projectStatus: "IMAGE_CHARACTER_SELECTED" });
        } catch (e) {
          console.error('[ImageCharacterSelection] 项目关联失败:', e);
        }
        await refreshCharacters();
      }

      setFeedback(`角色「${character.name}」已上传成功，已自动设为当前角色。`);

      // 如果跳过五视图生成（弹窗内已完成），则不需要再次调用
      if (skipGeneration) return;

      // 图片项目默认跳过五视图生成（由 CreateCharacterModal 内部处理）
    },
    [token, projectData.projectId, loadLibraryCharactersFirstPage, refreshCharacters, updateProjectData, addCharacter, selectCharacter],
  );

  const _handleDropCharacterViewToStyledSlot = (slot: FiveViewSlotKey, dragged: ViewItem) => {
    if (!dragged.imageUrl) {
      return;
    }
    const targetLabel = VIEW_LABEL_BY_KEY[slot];
    const slotOrder: FiveViewSlotKey[] = ["closeup", "front", "left", "right", "back"];
    let targetId: string | null = null;
    let nextStyled: ViewItem[] = [];

    setStyledViews((current) => {
      const existingForSlot = current.find((item) => resolveSlotKey(item) === slot);
      const previewForSlot = previews.find((item) => resolveSlotKey(item) === slot);
      targetId = existingForSlot?.id ?? previewForSlot?.id ?? `manual-${slot}-${Date.now()}`;
      const withoutSlot = current.filter((item) => resolveSlotKey(item) !== slot);
      nextStyled = [...withoutSlot, { id: targetId, label: targetLabel, imageUrl: dragged.imageUrl, viewKey: slot }].sort((a, b) => {
        const aOrder = slotOrder.indexOf(resolveSlotKey(a) ?? "front");
        const bOrder = slotOrder.indexOf(resolveSlotKey(b) ?? "front");
        return aOrder - bOrder;
      });
      return nextStyled;
    });

    const resolvedTargetId = targetId;
    if (!resolvedTargetId) {
      return;
    }

    setPreviews((current) => {
      const existing = current.find((item) => item.id === resolvedTargetId);
      if (existing) {
        return current.map((item) =>
          item.id === resolvedTargetId
            ? {
                ...item,
                label: targetLabel,
                imageUrl: dragged.imageUrl,
                sourceImageUrl: dragged.imageUrl,
                viewKey: slot,
              }
            : item,
        );
      }
      return [
        {
          id: resolvedTargetId,
          presetId: selectedCharacterId ?? activePreset?.id ?? "manual",
          label: targetLabel,
          imageUrl: dragged.imageUrl,
          sourceImageUrl: dragged.imageUrl,
          viewKey: slot,
        },
        ...current,
      ];
    });

    setSelectedPreviewId(resolvedTargetId);
    setGeneratedStyledViewIds((current) => (current.includes(resolvedTargetId) ? current : [...current, resolvedTargetId]));
    // UI state 不再持久化到 workflow
    setFeedback(`已将角色库「${dragged.label}」拖入定妆「${targetLabel}」，可直接确认。`);
  };

  useEffect(() => {
    if (step2V2ActivePreviewSource === "generated") {
      if (!step2V2ActiveGeneratedCandidateId) {
        return;
      }
      const exists = step2GeneratedCandidateCards.some((card) => card.candidateId === step2V2ActiveGeneratedCandidateId);
      if (!exists) {
        setStep2V2ActiveGeneratedCandidateId(null);
        setStep2V2ActivePreviewSource(null);
        setStep2V2PromptDraft("");
      }
      return;
    }
    if (step2V2ActivePreviewSource === "library") {
      if (!step2V2ActiveLibraryCandidateId) {
        return;
      }
      const exists = step2LibraryCandidateCards.some((card) => card.candidateId === step2V2ActiveLibraryCandidateId);
      if (!exists) {
        setStep2V2ActiveLibraryCandidateId(null);
        setStep2V2ActivePreviewSource(null);
        setStep2V2PromptDraft("");
      }
    }
  }, [
    step2GeneratedCandidateCards,
    step2LibraryCandidateCards,
    step2V2ActiveGeneratedCandidateId,
    step2V2ActiveLibraryCandidateId,
    step2V2ActivePreviewSource,
  ]);

  const handleOpenStep2V2CandidatePanel = (
    sourceType: "generated" | "library",
    candidate: Step2FiveViewCandidateCard,
  ) => {
    const candidateId = candidate.candidateId;
    // 无条件更新选中状态（用于UI显示选中样式）
    setStep2V2ActivePreviewSource(sourceType);
    if (sourceType === "generated") {
      setStep2V2ActiveGeneratedCandidateId(candidateId ?? null);
    } else {
      setStep2V2ActiveLibraryCandidateId(candidateId ?? null);
    }
    setStep2V2PromptDraft("");
    const hasCandidateImage = resolveStep2CandidateHasImage(candidate);
    // UI state 不再持久化到 workflow

    if (hasCandidateImage && token && projectData.projectId) {
      void selectCharacter(candidateId ?? "");
      updateProjectData({ selectedCharacterId: candidateId ?? undefined, projectStatus: "IMAGE_CHARACTER_SELECTED" });
    }

    setFeedback(hasCandidateImage ? "已选中该角色，可直接进入下一步。" : "该角色暂无图片，请先生成后再进入下一步。");
  };

  const handlePreviewStep2V2CandidateFullImage = (
    card: Pick<Step2FiveViewCandidateCard, "title" | "closeupPreviewUrl" | "fiveViewAssetUrl">,
  ) => {
    const fullImageUrl = (card.fiveViewAssetUrl ?? card.closeupPreviewUrl ?? "").trim();
    if (!fullImageUrl) {
      return;
    }
    setPreviewImage({ url: fullImageUrl, label: `${card.title} 全图` });
  };

  const resolveStep2V2BaseCharacterId = (): string | null => {
    if (selectedCharacterId) {
      return selectedCharacterId;
    }
    const readyPreset = presets.find((item) => item.status === "ready");
    if (readyPreset) {
      return readyPreset.id;
    }
    return presets[0]?.id ?? null;
  };

  const updateStep2V2GeneratedCandidateUrl = (_order: 1 | 2 | 3, _imageUrl: string) => {
    // UI state 不再持久化到 workflow
  };

  // Hydration: 从 per-candidate Map 恢复每个卡位的状态
  // persistedBackgroundTasks 已清空为 {}，此 effect 不再产生实际迭代
  useEffect(() => {
    if (Object.keys(persistedBackgroundTasks).length === 0) return;
    for (const [candidateId, rawTask] of Object.entries(persistedBackgroundTasks) as [string, unknown][]) {
      const task = normalizeBackgroundGenerationTask(rawTask);
      if (!task || task.phase === "idle") {
        continue;
      }
      const generatedOrder = parseStep2GeneratedCandidateOrder(candidateId);
      if (generatedOrder === null) {
        continue;
      }
      const imageUrl = resolveStep2V2BackgroundTaskImageUrl(task);
      const hydrationKey = JSON.stringify({
        candidateId,
        phase: task.phase,
        progress: task.progress,
        startedAt: task.startedAt,
        imageUrl,
        resultRefs: task.resultRefs,
      });
      if (step2V2BackgroundHydrationKeyRef.current[candidateId] === hydrationKey) {
        continue;
      }
      step2V2BackgroundHydrationKeyRef.current = {
        ...step2V2BackgroundHydrationKeyRef.current,
        [candidateId]: hydrationKey,
      };

      if (task.phase === "running") {
        const backendProgressSignal = normalizeStep2BackendProgressSignal(task.progress);
        setStep2V2CandidateRuntimeMeta((current) => ({
          ...current,
          [candidateId]: {
            startedAtMs: task.startedAt ?? current[candidateId]?.startedAtMs ?? Date.now(),
            backendProgressPercent: backendProgressSignal ?? current[candidateId]?.backendProgressPercent ?? null,
          },
        }));
        continue;
      }

      if (task.phase === "completed") {
        if (imageUrl) {
          setStep2V2CandidateRuntimeMeta((current) => ({
            ...current,
            [candidateId]: {
              startedAtMs: task.startedAt ?? current[candidateId]?.startedAtMs ?? null,
              backendProgressPercent: 100,
            },
          }));
          updateStep2V2GeneratedCandidateUrl(generatedOrder, imageUrl);
          // 刷新角色数据
          void refreshCharacters();
        }
        continue;
      }

      if (task.phase === "failed") {
        const backendProgressSignal = normalizeStep2BackendProgressSignal(task.progress);
        setStep2V2CandidateRuntimeMeta((current) => ({
          ...current,
          [candidateId]: {
            startedAtMs: task.startedAt ?? current[candidateId]?.startedAtMs ?? null,
            backendProgressPercent: backendProgressSignal ?? current[candidateId]?.backendProgressPercent ?? null,
          },
        }));
        // 刷新角色数据获取失败状态
        void refreshCharacters();
      }
    }
  }, [persistedBackgroundTasks, step2V2BackgroundHydrationKeyRef, refreshCharacters]);

  const runStep2V2CandidateGeneration = async (
    candidateId: string,
    options?: {
      promptOverride?: string;
      silentSuccess?: boolean;
    },
  ): Promise<boolean> => {
    if (!token) {
      setFeedback("请先登录。");
      return false;
    }
    if (step2V2CandidateInFlightRef.current.has(candidateId)) {
      setFeedback("该候选正在生成中，请稍候。");
      return false;
    }
    step2V2CandidateInFlightRef.current.add(candidateId);

    // candidateId 就是角色 ID，通过卡片找到对应的 slot
    const currentCard = step2V2AllCandidates.find((card) => card.candidateId === candidateId) ?? null;
    const effectiveSlot = currentCard?.sourceType === "generated" ? currentCard.displayOrder : null;

    const dependencyState =
      (effectiveSlot ? step2GenerationDependencyBridge.variantStates[effectiveSlot - 1] : null) ??
      step2GenerationDependencyBridge.sharedState;
    const referenceImages = dependencyState.referenceImages;
    if (dependencyState.blockedReason) {
      step2V2CandidateInFlightRef.current.delete(candidateId);
      setFeedback(dependencyState.blockedReason);
      return false;
    }
    const promptOverride = options?.promptOverride?.trim();
    const slotValues = dependencyState.selectedSlotValues;
    if (!promptOverride && !slotValues) {
      step2V2CandidateInFlightRef.current.delete(candidateId);
      setFeedback("角色设定尚未就绪，请返回上一步确认。");
      return false;
    }

    // candidateId 就是角色 ID，直接作为 baseCharacterId
    let baseCharacterId: string | null = candidateId;
    if (!baseCharacterId) {
      baseCharacterId = resolveStep2V2BaseCharacterId();
    }
    if (!baseCharacterId && activePreset) {
      baseCharacterId = activePreset.id;
    }

    const recoveredTask = null as { startedAt?: number; taskId?: string; progress?: number } | null; // persistedBackgroundTasks 已清空，不再恢复后台任务
    const startedAtMs = recoveredTask?.startedAt ?? Date.now();
    const backgroundTaskId = recoveredTask?.taskId ?? buildStep2V2BackgroundTaskId(candidateId);
    // 只设置 runtimeMeta，状态由 workflow 角色 status 决定
    setStep2V2CandidateRuntimeMeta((current) => ({
      ...current,
      [candidateId]: {
        startedAtMs,
        backendProgressPercent: 1,
      },
    }));
    updateProjectData({ selectedCharacterId: baseCharacterId });
    // UI state 不再持久化到 workflow
    markBackgroundTaskRunning(candidateId, {
      taskId: backgroundTaskId,
      progress: Math.max(1, recoveredTask?.progress ?? 1),
      startedAt: startedAtMs,
      resultRefs: [candidateId],
    });

    try {
      // 调用封装好的五视图生成方法
      const result = await generateFiveViewCharacter({
        baseCharacterId: baseCharacterId || undefined,
        projectId: projectData.projectId!,
        promptOverride: promptOverride || undefined,
        slotValues: slotValues ? { coreFeatures: slotValues.coreFeatures, phase1Outfit: slotValues.phase1Outfit } : undefined,
        referenceImages,
        generationSlot: effectiveSlot ?? null,
      });

      if (!result.success || !result.jobId) {
        throw new Error(result.message || "生成失败");
      }

      // 标记任务已启动
      setStep2V2CandidateRuntimeMeta((current) => ({
        ...current,
        [candidateId]: {
          startedAtMs,
          backendProgressPercent: 1,
        },
      }));
      markBackgroundTaskRunning(candidateId, {
        taskId: result.jobId,
        progress: 1,
        startedAt: startedAtMs,
        resultRefs: [candidateId],
      });
      setFeedback(result.message || "五视图生成任务已启动，请稍候...");
      return false; // 返回 false 表示任务仍在进行中，前端需要继续轮询
    } catch (error) {
      if (error instanceof ApiError && error.code === "VIEW_ALREADY_GENERATING") {
        setStep2V2CandidateRuntimeMeta((current) => ({
          ...current,
          [candidateId]: {
            startedAtMs: current[candidateId]?.startedAtMs ?? startedAtMs,
            backendProgressPercent: current[candidateId]?.backendProgressPercent ?? null,
          },
        }));
        markBackgroundTaskRunning(candidateId, {
          taskId: backgroundTaskId,
          progress: Math.max(1, Math.min(99, recoveredTask?.progress ?? 1)),
          startedAt: startedAtMs,
          resultRefs: [candidateId],
        });
        setFeedback(error.message || "后端任务仍在生成中，请稍后刷新。");
        void loadLibraryCharactersFirstPage();
        return false;
      }
      // 任务失败，刷新角色数据
      void refreshCharacters();
      const message = error instanceof ApiError || error instanceof Error ? error.message : "角色生图失败";
      markBackgroundTaskFailed(candidateId, {
        taskId: backgroundTaskId,
        startedAt: startedAtMs,
        message,
        code: error instanceof ApiError ? error.code : undefined,
        resultRefs: [candidateId],
      });
      setFeedback(message);
      return false;
    } finally {
      step2V2CandidateInFlightRef.current.delete(candidateId);
    }
  };

  const handleStep2V2BatchGenerate = async (): Promise<number> => {
    if (step2V2Generating) {
      return 0;
    }
    setStep2V2Generating(true);
    setStep2V2PendingCandidateId(null);
    setFeedback(null);
    try {
      const generatedRows = step2GeneratedCandidateCards.slice(0, 3);
      const pendingRows = generatedRows.filter((card) => !resolveStep2CandidateHasImage(card));

      // 如果没有生成角色或全部完成，调用批量生成 API 创建空角色
      if (pendingRows.length < 1) {
        // 获取待生成的槽位：如果没有生成角色，生成 slot 1-3
        const pendingSlots = generatedRows.length > 0
          ? generatedRows.map((card) => card.displayOrder).filter((slot): slot is number => typeof slot === "number")
          : [1, 2, 3];

        if (pendingSlots.length < 1) {
          setFeedback("3 个生成位已全部完成，如需刷新请使用单卡重试。");
          return 0;
        }

        // 调用批量生成 API（创建空角色并分配 slot）
        const result = await batchGenerateFiveViewCharacters({
          projectId: projectData.projectId!,
          slots: pendingSlots,
        });

        if (!result.success || !result.jobId) {
          throw new Error(result.message || "批量生成失败");
        }

        setFeedback("五视图生成任务已启动，请稍候...");
        return result.children?.length ?? 0;
      }

      // 有待生成的角色，调用单卡生成
      const results = await Promise.all(
        pendingRows.map(async (card) => {
          try {
            return await runStep2V2CandidateGeneration(card.candidateId ?? "", { silentSuccess: true });
          } catch {
            return false;
          }
        }),
      );
      setStep2V2PendingCandidateId(null);
      const successCount = results.filter(Boolean).length;
      setFeedback(`定妆生成完成：${successCount}/${pendingRows.length}`);
      return successCount;
    } finally {
      setStep2V2Generating(false);
    }
  };

  const handleStep2V2RegenerateCandidate = async (candidateId?: string, promptOverride?: string) => {
    const targetCandidateId = candidateId ?? step2V2ActiveCandidate?.candidateId ?? null;
    if (!targetCandidateId || step2V2Generating) {
      return;
    }
    const confirmed = await confirm('确定要重新生成吗？将扣除相应积分。', '重新生成');
    if (!confirmed) return;
    // 余额预检查
    try {
      const { sufficient, balance } = await checkCreditsBalance(token, creditPricing.singleImageCreditCost);
      if (!sufficient) {
        setFeedback(`积分不足，当前余额 ${balance}，需要 ${creditPricing.singleImageCreditCost}，请先充值或联系管理员。`);
        return;
      }
    } catch (error) {
      setFeedback(resolveProjectFlowCreditSpendErrorMessage(error, "积分余额检查失败，请稍后重试。"));
      return;
    }
    const request = createStep2CandidateRetryRequest(targetCandidateId, promptOverride ?? step2V2PromptDraft);
    try {
      setStep2V2Generating(true);
      setStep2V2PendingCandidateId(request.candidateId);
      await runStep2V2CandidateGeneration(request.candidateId, {
        promptOverride: request.promptOverride,
      });
    } catch (error) {
      const message =
        error instanceof ApiError || error instanceof Error ? error.message : "重试生成失败，请稍后重试。";
      setFeedback(message);
    } finally {
      setStep2V2Generating(false);
      setStep2V2PendingCandidateId(null);
    }
  };

  const handleEnterStep3FromFooter = async () => {
    if (step2NextDisabledWithImageGate || enteringStep3) {
      return;
    }
    const confirmedCandidateId =
      typeof step2Step3GateState.confirmedCandidateId === "string"
        ? step2Step3GateState.confirmedCandidateId.trim()
        : "";
    const confirmedCandidate =
      confirmedCandidateId.length > 0
        ? step2V2AllCandidates.find((card) => card.candidateId === confirmedCandidateId) ?? null
        : null;
    if (!resolveStep2CandidateHasImage(confirmedCandidate)) {
      setFeedback("请选择有图片的角色后再进入下一步。");
      return;
    }
    // 确认对话框（对齐视频项目）
    const confirmed = await confirm(
      "确认后将进入模特图生成环节，角色定妆将锁定不可修改。是否确认？",
      "确认角色"
    );
    if (!confirmed) return;

    const directEnterResult = resolveStep2RoleConfirmDirectEnter(confirmedCandidateId);
    setEnteringStep3(true);
    try {
      // 图片项目：完成后直接返回项目列表
      const confirmedCandId = directEnterResult.confirmedCandidateId ?? undefined;
      const nextImageProjectPatch = buildStep2ImageProjectCompletionPatch({
        confirmedCandidateId: confirmedCandId,
      });
      setImageProjectPatch(nextImageProjectPatch);
      updateProjectData({ projectStatus: "IMAGE_CHARACTER_CONFIRMED" });
      void backendApi.step2Confirm(token!, projectData.projectId!, { confirmed: true, confirmedCandidateId: confirmedCandId ?? "" });
      setFeedback(resolveStep2FooterFeedback(projectFlowKind));
      navigate(resolveStep2FooterTargetRoute(projectFlowKind, projectData.projectId));
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "确认角色失败";
      setFeedback(message);
    } finally {
      setEnteringStep3(false);
    }
  };

  // 切换确认状态（对齐视频项目）
  const handleToggleConfirmModel = async (checked: boolean) => {
    if (!token || !projectData.projectId) return;

    const confirmedCandidateId = null as string | null;
    if (checked) {
      updateProjectData({ projectStatus: "IMAGE_CHARACTER_CONFIRMED" });
      void backendApi.step2Confirm(token, projectData.projectId, { confirmed: true, confirmedCandidateId: confirmedCandidateId ?? undefined });
    } else if (projectData.projectStatus === "IMAGE_CHARACTER_CONFIRMED") {
      updateProjectData({ projectStatus: "IMAGE_OUTFIT_SELECTED" });
      void backendApi.step2Confirm(token, projectData.projectId, { confirmed: false, confirmedCandidateId: confirmedCandidateId ?? undefined });
    }
  };

  const handleOpenPreviewForGeneration = useCallback(() => {
    void (async () => {
      if (!token) {
        setFeedback("登录状态已失效，请重新登录后重试。");
        return;
      }
      // 余额预检查
      try {
        const { sufficient, balance } = await checkCreditsBalance(token, creditPricing.singleImageCreditCost);
        if (!sufficient) {
          setFeedback(`积分不足，当前余额 ${balance}，需要 ${creditPricing.singleImageCreditCost}，请先充值或联系管理员。`);
          return;
        }
      } catch (error) {
        setFeedback(resolveProjectFlowCreditSpendErrorMessage(error, "积分余额检查失败，请稍后重试。"));
        return;
      }
      await handleStep2V2BatchGenerate();
      // 积分扣减：生成成功后扣减
      try {
        await spendProjectFlowCredits({
          token,
          routeKey: "image_project_step3_model_photo",
          operation: "single_image",
          reason: "image_step2_batch_generate",
          projectId: urlProjectId,
        });
      } catch (error) {
        setFeedback(resolveProjectFlowCreditSpendErrorMessage(error, "定妆已生成，但积分扣费失败，请联系管理员。"));
      }
    })();
  }, [
    handleStep2V2BatchGenerate,
    token,
  ]);

  // 进入 Step2 时自动触发批量五视图生成
  // 条件：项目状态正确 + 不在生成中 + 未触发过
  useEffect(() => {
    const projectId = typeof projectData.projectId === "string" ? projectData.projectId.trim() : "";

    // 1. 项目状态必须是 IMAGE_OUTFIT_CONFIRMED
    if (!projectId || projectData.projectStatus !== "IMAGE_OUTFIT_CONFIRMED") {
      console.log("[ImgStep2AutoTrigger] skip: no projectId or wrong status", { projectId, status: projectData.projectStatus });
      return;
    }

    // 2. 等待全局任务队列加载完成（防止刷新时空数组误判）
    if (!globalTaskQueueInitialized) {
      console.log("[ImgStep2AutoTrigger] skip: globalTaskQueue not initialized");
      return;
    }

    // 3. 检查是否有正在运行的五视图任务（任务队列状态）
    const hasRunningFiveViewTask = globalTaskQueue.some(
      (t) => t.type === GlobalTaskType.IMAGE_STEP2_FIVE_VIEW && t.projectId === projectId && (t.status === TaskStatus.PENDING || t.status === TaskStatus.RUNNING)
    );
    if (hasRunningFiveViewTask) {
      console.log("[ImgStep2AutoTrigger] skip: running five view task exists");
      return;
    }

    // 4. 检查 workflow 中是否已有生成角色（有角色说明已触发过，不再重复）
    const generatedChars = (workflow.imageProjectGeneratedCharacters || []) as Array<unknown>;
    if (generatedChars.length > 0) {
      console.log("[ImgStep2AutoTrigger] skip: already has generated characters", generatedChars.length);
      return;
    }

    // 5. 不在生成中
    if (step2V2Generating) {
      console.log("[ImgStep2AutoTrigger] skip: generating");
      return;
    }

    // 6. 防止重复触发（异步操作期间 step2V2Generating 还是 false）
    if (step2AutoTriggerInProgressRef.current) {
      console.log("[ImgStep2AutoTrigger] skip: already in progress");
      return;
    }

    console.log("[ImgStep2AutoTrigger] TRIGGERING batch generate for", projectId);
    step2AutoTriggerInProgressRef.current = true;
    handleOpenPreviewForGeneration();
  }, [
    projectData.projectId,
    projectData.projectStatus,
    globalTaskQueue,
    globalTaskQueueInitialized,
    workflow.imageProjectGeneratedCharacters,
    step2V2Generating,
    handleOpenPreviewForGeneration,
  ]);

  // 恢复正在生成中的状态（页面刷新后从任务队列恢复）
  useEffect(() => {
    const projectId = typeof projectData.projectId === "string" ? projectData.projectId.trim() : "";
    if (!projectId || !globalTaskQueueInitialized) return;

    // 查找当前项目的 running/pending image_step2_five_view 任务
    const runningTasks = globalTaskQueue.filter(
      (t) => t.type === GlobalTaskType.IMAGE_STEP2_FIVE_VIEW && t.projectId === projectId && (t.status === TaskStatus.PENDING || t.status === TaskStatus.RUNNING)
    );

    if (runningTasks.length === 0) return;

    console.log("[ImgStep2Restore] 恢复正在生成中的状态，任务数量:", runningTasks.length);

    // 设置整体生成状态
    setStep2V2Generating(true);

    // 恢复每个任务的进度状态
    for (const task of runningTasks) {
      try {
        const input = JSON.parse(task.input) as {
          projectId: string;
          slot?: number | null;
          characterId?: string | null;
          fiveViewId?: string | null;
        };

        // 如果有 characterId，说明是重试已有角色，恢复该角色的进度
        if (input.characterId) {
          const candidateId = input.characterId;
          const cardKey = `generated-${candidateId}`;

          // 使用任务创建时间计算模拟进度
          const elapsedMs = Date.now() - task.createdAt;
          const simulatedProgress = resolveStep2AllInOneSimulatedPercent({
            nowMs: Date.now(),
            startedAtMs: task.createdAt,
            estimatedDurationMs: step2AllInOneEstimatedDurationMs,
          });

          setStep2V2CandidateRuntimeMeta((current) => ({
            ...current,
            [cardKey]: {
              startedAtMs: task.createdAt,
              // 不设 backendProgressPercent，让 step2RuntimeMetaForBridge 走模拟进度分支
              // 模拟进度基于 startedAtMs 和 step2RuntimeClockMs 实时计算
              backendProgressPercent: null,
            },
          }));

          console.log("[ImgStep2Restore] 恢复角色生成状态:", {
            candidateId,
            slot: input.slot,
            elapsedMs,
            progress: simulatedProgress,
          });
        }

        // 如果有 slot，可以恢复对应的槽位状态（如果有 UI 需求）
        if (input.slot && !input.characterId) {
          console.log("[ImgStep2Restore] 新建角色任务，slot:", input.slot);
        }
      } catch (err) {
        console.error("[ImgStep2Restore] 解析任务 input 失败:", err);
      }
    }
  }, [projectData.projectId, globalTaskQueueInitialized, globalTaskQueue, step2AllInOneEstimatedDurationMs]);

  // 监听五视图任务完成（completed 或 failed），直接刷新角色数据
  const processedTaskIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const projectId = typeof projectData.projectId === "string" ? projectData.projectId.trim() : "";
    if (!projectId || !token) return;

    // 监听完成和失败的任务
    const finishedFiveViewTasks = globalTaskQueue.filter(
      (t) => t.type === GlobalTaskType.IMAGE_STEP2_FIVE_VIEW && t.projectId === projectId && (t.status === TaskStatus.COMPLETED || t.status === TaskStatus.FAILED)
    );

    for (const task of finishedFiveViewTasks) {
      if (processedTaskIdsRef.current.has(task.id)) continue;
      processedTaskIdsRef.current.add(task.id);

      // 清除生成状态
      if (finishedFiveViewTasks.some(t => t.status === TaskStatus.COMPLETED || t.status === TaskStatus.FAILED)) {
        // 所有任务完成后清除整体生成状态
        const stillRunning = globalTaskQueue.some(
          (t) => t.type === GlobalTaskType.IMAGE_STEP2_FIVE_VIEW && t.projectId === projectId && (t.status === TaskStatus.PENDING || t.status === TaskStatus.RUNNING)
        );
        if (!stillRunning) {
          setStep2V2Generating(false);
        }
      }

      // 清除对应的 runtimeMeta（无论成功或失败）
      // 优先从 result 取 characterId，失败时 result 为 null 则从 input 取
      const result = task.result as { characterId?: string; slot?: number } | null;
      const inputCharacterId = (() => {
        try {
          const parsed = JSON.parse(task.input) as { characterId?: string } | null;
          return parsed?.characterId;
        } catch { return undefined; }
      })();
      const characterId = result?.characterId ?? inputCharacterId;
      if (characterId) {
        const cardKey = `generated-${characterId}`;
        setStep2V2CandidateRuntimeMeta((current) => {
          const next = { ...current };
          delete next[cardKey];
          return next;
        });
      }
      // 强制刷新角色数据（失败时也需要刷新，以便显示失败状态）
      void refreshCharacters();
    }
  }, [globalTaskQueue, projectData.projectId, token, refreshCharacters]);

  const step2LeftPanelMasterPromptEditor = buildStep2LeftPanelMasterPromptEditorView();

  const renderConfigContent = () => (
    <>
      <h3 className="text-xl font-bold text-gray-900 font-display mb-1">Step 2. 角色定妆</h3>
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-2 text-sm font-semibold text-gray-800">{step2LeftPanelMasterPromptEditor.referenceTitle}</div>
          {outfitReferenceItems.length < 1 ? (
            <div className="rounded border border-dashed border-gray-300 px-3 py-4 text-xs text-gray-400">
              暂无服装参考图。
            </div>
          ) : (
            <div className="flex gap-2 justify-center items-start">
              {outfitReferenceItems.map((item) => (
                <div key={`step2-config-outfit-${item.category}`} className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50 cursor-pointer flex-1 min-w-0" style={{ maxWidth: 100 }}>
                  <div>
                    <img src={getOssThumbnailUrl(item.imageUrl as string, 300)} alt={item.label} className="h-auto w-full object-contain"  loading="lazy" />
                  </div>
                  <div className="border-t border-gray-200 px-2 py-1 text-[11px] text-gray-600 truncate">{item.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-2 space-y-1">
            <div>
              <div className="text-sm font-semibold text-gray-800">{step2LeftPanelMasterPromptEditor.inputTitle}</div>
              <div className="text-[11px] text-gray-500">{step2LeftPanelMasterPromptEditor.helperText}</div>
            </div>
            <div className="rounded-md border border-orange-100 bg-orange-50/60 px-2.5 py-2 text-[11px] text-gray-700">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-gray-900">Step1 已选搭配</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-primary border border-orange-200">
                  {step2Step1SelectedOutfitSummary.sourceLabel}
                </span>
              </div>
              <div className="mt-1 font-semibold text-gray-800">{step2Step1SelectedOutfitSummary.title}</div>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {step2Step1SelectedOutfitSummary.complementaryItems.map((item) => (
                  <div
                    key={`step2-selected-outfit-item-${item.id}`}
                    className="rounded-md border border-orange-200/70 bg-white px-2 py-1.5"
                  >
                    <div className="text-[11px] font-bold text-gray-900">{item.label}</div>
                    <p className="mt-0.5 text-[11px] leading-5 text-gray-600">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {step1SelectedRoleDirection ||
        step2SelectedRoleDirectionAvatar ? (
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-semibold text-gray-800">已选推荐角色预设</div>
            {step1SelectedRoleDirection && step2SelectedRoleDirectionAvatar ? (
              <div
                data-testid="step2-selected-role-direction-panel"
                className="rounded-lg border border-orange-100 bg-orange-50/50 px-2.5 py-2"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-orange-100 bg-white">
                    <img
                      src={step2SelectedRoleDirectionAvatar.imageUrl}
                      alt={`${step1SelectedRoleDirection.styleSummary} 头像`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold tracking-wide text-primary">
                      {step1SelectedRoleDirection.styleSummary}
                    </div>
                    <div className="text-[10px] text-gray-400">推荐角色预设已确认</div>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
                    <span className="material-icons-round text-[12px]">check_circle</span>
                  </span>
                </div>
                <div className="mt-2 space-y-0.5 text-[11px] leading-4 text-gray-600">
                  {step2SelectedRoleDirectionCompactLines.map((line) => (
                    <div
                      key={`step2-selected-role-line-${line.lineId}`}
                      className={line.emphasis ? "font-semibold text-gray-800" : ""}
                    >
                      {line.text}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded border border-dashed border-gray-300 px-3 py-4 text-xs text-gray-400">
                请先返回 Step1 确认推荐角色预设。
              </div>
            )}
          </div>
        ) : null}
      </div>
    </>
  );

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 overflow-hidden">
      <MobileConfigDrawer isOpen={showMobileConfig} onClose={() => setShowMobileConfig(false)}>
        {renderConfigContent()}
      </MobileConfigDrawer>
      <QuickCreateCharacterModal
        isOpen={showQuickCreate}
        isSubmitting={isQuickCreating}
        onClose={() => setShowQuickCreate(false)}
        onSubmit={handleQuickCreateCharacter}
      />
      <CreateCharacterModal
        isOpen={showCreateCharacter}
        onClose={() => setShowCreateCharacter(false)}
        onSave={handleCreateCharacterSave}
        suggestedTags={[]}
        skipFiveViewGeneration
        fiveViewMode="outfit-portrait"
        projectId={urlProjectId}
      />
      <CharacterLibrarySelectorModal
        isOpen={showLibrarySelector}
        // 过滤掉界面上已显示的角色（生成角色 + 角色库推荐）
        characters={(() => {
          const generatedCharIds = new Set(
            presets.filter((p) => p.generationSlot).map((p) => p.id)
          );
          const libraryRecommendedIds = new Set(
            step2LibraryBaseCards
              .filter((c) => c.candidateId)
              .map((c) => {
                // candidateId 格式：library-${realId}，需要提取真实 ID
                return c.candidateId!.startsWith("library-")
                  ? c.candidateId!.replace("library-", "")
                  : c.candidateId!;
              })
          );
          const excludedIds = new Set([...generatedCharIds, ...libraryRecommendedIds]);
          return (libraryCharacters ?? [])
            .filter((item) => item.status === "ready")
            .filter((item) => !excludedIds.has(item.id))
            .map((item) => ({
              id: item.id,
              name: item.name,
              tags: item.tags ?? [],
              thumbnailUrl: item.thumbnailUrl,
              kind: item.kind,
              status: item.status,
              fiveViewOssImageUrl: item.fiveViewOssImageUrl ?? null,
            }));
        })()}
        onSelect={handleSelectFromLibrary}
        onClose={() => setShowLibrarySelector(false)}
        totalCount={libraryCharactersTotal}
        hasMore={libraryCharactersHasMore}
        isLoadingMore={loadingMoreLibraryCharacters}
        onLoadMore={loadLibraryCharactersNextPage}
      />

      <ImageProjectFlowHistorySidebar
        currentStep={2}
        projectId={urlProjectId ?? projectData.projectId ?? undefined}
        onImagePreview={(imageUrl, label) => setPreviewImage({ url: imageUrl, label })}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#fdfbf7]">
        <StepContentHeader stepNumber={2} title="角色定妆" icon="face" subtitle="基于已确认服装参考，生成角色五视图。" badges={step2Locked ? <span className="inline-flex items-center gap-1 text-amber-600"><span className="material-icons-round text-sm">lock</span>已锁定</span> : feedback ? <span className="max-w-[200px] truncate">{feedback}</span> : undefined} />
        <div className="lg:hidden px-4 py-4 bg-white border-b border-gray-100 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
          </div>
          <button onClick={() => setShowMobileConfig(true)} className="p-2 rounded-lg bg-gray-50 text-gray-600 border border-gray-200">
            <span className="material-icons-round">tune</span>
          </button>
        </div>

        <div className={`flex-1 overflow-y-auto p-4 md:p-8 ${FLOW_SAFE_BOTTOM_PADDING.standard}`}>
          <div className="max-w-6xl mx-auto">

            {/* AI 生成引导 */}
            <div className="relative mb-8">
              <div className="rounded-xl border border-gray-100 bg-gradient-to-br from-white to-gray-50/50 px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_12px_rgba(0,0,0,0.03)]">
              <div className="flex items-center gap-5">
                {/* 步骤指示 */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="relative">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-amber-500 text-white text-xs font-bold shadow-md shadow-primary/30 animate-pulse-scale">1</div>
                  </div>
                  <div className="w-10 h-[2px] rounded-full bg-gradient-to-r from-primary/80 to-emerald-400/60" />
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-300/40">2</div>
                </div>

                {/* 分隔线 */}
                <div className="h-8 w-px bg-gray-100 shrink-0" />

                {/* 说明文字 */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-bold text-gray-900 mb-0.5">
                    <span className="material-icons-round text-primary text-[16px]">auto_awesome</span>
                    AI 角色生成
                  </div>
                  <p className="text-xs leading-5 text-gray-500">
                    所有人像都是经过 AI 精心设计<span className="text-gray-300"> · </span>耗时较长<span className="text-gray-300"> · </span>生成完成后点击选择即可进入下一步
                  </p>
                </div>
              </div>

              {/* 向下引导箭头 */}
              <div className="absolute left-1/2 -translate-x-1/2 bottom-[-22px] flex flex-col items-center animate-bounce-down">
                <span className="material-icons-round text-primary/50 text-[26px]">expand_more</span>
              </div>
              </div>
            </div>

            <section
                data-testid="step2-v2-generated-row"
                className="mb-6 rounded-xl border border-emerald-100 bg-gradient-to-r from-emerald-50/70 to-white p-4 md:p-5"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-base font-bold tracking-wide text-emerald-700">生成角色</div>
                    <div className="text-sm text-gray-600">
                      {step2GenerationDependencyBridge.sharedState.status === "ready"
                        ? `已接入服装参考，已就绪 ${step2GeneratedReadyCount}/3；双击预览`
                        : step2GenerationDependencyBridge.sharedState.blockedReason ?? "等待服装参考就绪"}
                    </div>
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500 border border-gray-200">
                    3 个生成位
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {step2GeneratedCandidateCards.map((card) => (
                    (() => {
                      const runtimeState = card.candidateId ? step2GeneratedRuntimeProgressBridge[card.candidateId] : undefined;
                      const runtimePhase = runtimeState?.phase ?? "idle";
                      const isGenerating = runtimePhase === "generating";
                      const retryButtonState = buildStep2CandidateRetryButtonState({
                        candidate: card,
                        pendingCandidateId: step2V2PendingCandidateId,
                        batchGenerating: step2V2Generating,
                        unitCreditCost: step2SingleRetryCreditCost,
                        estimatedDurationSeconds: Math.max(1, Math.round(step2AllInOneEstimatedDurationMs / 1000)),
                        hasRunningTask: isGenerating,
                      });
                      const runtimePercentLabel =
                        runtimeState?.percent == null
                          ? runtimePhase === "generating"
                            ? "等待后端进度"
                            : runtimeState?.statusText ?? "待生成"
                          : `${runtimeState?.percent}%`;
                      const hasCardImage = Boolean(card.fiveViewAssetUrl || card.closeupPreviewUrl);
                      const videoShouldAnimate = runtimePhase === "generating";
                      const shouldShowLoadingVideoFrame =
                        videoShouldAnimate || runtimePhase === "idle" || runtimePhase === "blocked";
                      const loadingVideoSrc = shouldShowLoadingVideoFrame
                        ? runtimeState?.loadingVideoSrc ?? STEP2_RUNTIME_PROGRESS_LOADING_VIDEO_SRC
                        : runtimeState?.loadingVideoSrc ?? null;
                      const loadingPosterSrc = step2LoadingPosterFrameSrc;
                      const isLocallyActive = step2V2ActivePreviewSource === "generated" &&
                          step2V2ActiveGeneratedCandidateId === card.candidateId;
                      const hasAnyLocalSelection = step2V2ActiveGeneratedCandidateId || step2V2ActiveLibraryCandidateId;
                      const isCardSelected =
                        isLocallyActive ||
                        (card.isSelected && !hasAnyLocalSelection) ||
                        step2Step3GateState.confirmedCandidateId === card.candidateId;
                      return (
                        <div key={card.candidateId!}>
                          <article
                          ref={(el) => {
                            if (el) cardRefMap.current.set(card.candidateId!, el);
                            else cardRefMap.current.delete(card.candidateId!);
                          }}
                          data-testid={`step2-v2-generated-card-${card.displayOrder}`}
                          className={`overflow-hidden rounded-2xl border-2 bg-white shadow-sm transition-all duration-200 ${
                            !hasCardImage
                              ? "border-gray-200 opacity-60 cursor-not-allowed"
                              : isCardSelected
                                ? "border-primary shadow-md shadow-primary/15 cursor-pointer"
                                : "border-gray-200 hover:border-primary/40 hover:shadow-md cursor-pointer"
                          }`}
                          onClick={() => {
                            if (step2Locked) return;
                            if (!hasCardImage) return;
                            // 复用 Step1 穿搭方案的 outline 光晕 + scale 脉冲（primary 品牌色）
                            const el = cardRefMap.current.get(card.candidateId!);
                            if (el) {
                              const anim = el.animate([
                                { outline: "0px solid rgba(230,140,25,0)", transform: "scale(1)", offset: 0 },
                                { outline: "8px solid rgba(230,140,25,0.35)", transform: "scale(1.04)", offset: 0.4 },
                                { outline: "0px solid rgba(230,140,25,0)", transform: "scale(1)", offset: 1 },
                              ], { duration: 480, easing: "ease-out" });
                              anim.onfinish = () => handleOpenStep2V2CandidatePanel("generated", card);
                            } else {
                              handleOpenStep2V2CandidatePanel("generated", card);
                            }
                          }}
                          onDoubleClick={(event) => {
                            if (!hasCardImage) return;
                            event.preventDefault();
                            handlePreviewStep2V2CandidateFullImage(card);
                          }}
                        >
                          <div className={`flex items-center justify-between border-b px-2 py-1.5 ${isCardSelected ? "bg-primary border-primary/30" : "border-gray-200 bg-white"}`}>
                            <div className={`min-w-0 flex-1 pr-2 text-sm font-semibold truncate ${isCardSelected ? "text-white" : "text-slate-700"}`} title={card.title}>{card.title}</div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                aria-label={isGenerating ? "生成中，暂不可放大" : "放大查看"}
                                title={isGenerating ? "生成中，暂不可放大" : "放大查看"}
                                disabled={isGenerating}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (!isGenerating) {
                                    handlePreviewStep2V2CandidateFullImage(card);
                                  }
                                }}
                                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white/95 shadow-sm transition ${isGenerating ? "border-gray-300 bg-gray-100 text-gray-300 cursor-not-allowed opacity-60" : "border-gray-200 text-slate-700 hover:border-primary/40 hover:text-primary"}`}
                              >
                                <span className="material-icons-round text-[18px]">zoom_in</span>
                              </button>
                              <div className="relative flex shrink-0 flex-col items-center gap-0.5">
                                <button
                                  type="button"
                                  data-testid={`step2-v2-generated-card-retry-${card.displayOrder}`}
                                  aria-label={retryButtonState.ariaLabel}
                                  title={retryButtonState.title}
                                  disabled={step2Locked || retryButtonState.disabled}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleStep2V2RegenerateCandidate(card.candidateId!, "");
                                  }}
                                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white/95 shadow-sm transition disabled:cursor-not-allowed ${
                                    retryButtonState.disabled
                                      ? "border-gray-300 bg-gray-100 opacity-60"
                                      : !hasCardImage
                                        ? "border-red-300 text-red-500 hover:border-red-400 hover:text-red-600"
                                        : "border-gray-200 text-slate-700 hover:border-primary/40 hover:text-primary"
                                  }`}
                                >
                                <span className={`material-icons-round text-[18px] ${!hasCardImage ? "" : retryButtonState.iconClassName}`}>
                                  {retryButtonState.iconName}
                                </span>
                                <span className="sr-only">{retryButtonState.ariaLabel}</span>
                              </button>
                              {retryButtonState.creditLabel && (
                                <CreditBadge amount={parseInt(retryButtonState.creditLabel, 10)} variant="badge" />
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="relative">
                            {videoShouldAnimate && loadingVideoSrc ? (
                              <div className="relative aspect-[4/3] bg-gray-100 overflow-hidden">
                                <video
                                  key={`${card.candidateId}-loading-playing-${loadingVideoSrc}`}
                                  className={`${PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS} h-full w-full object-cover`}
                                  src={loadingVideoSrc}
                                  poster={step2LoadingPosterFrameSrc}
                                  autoPlay
                                  muted
                                  loop
                                  playsInline
                                  preload="auto"
                                  onLoadedData={(event) => {
                                    const target = event.currentTarget;
                                    if (target.currentTime <= 0) {
                                      target.currentTime = 0.01;
                                    }
                                    void target.play().catch(() => undefined);
                                  }}
                                  onCanPlay={(event) => {
                                    void event.currentTarget.play().catch(() => undefined);
                                  }}
                                />
                              </div>
                            ) : hasCardImage ? (
                              <BlurFillImage
                                src={card.fiveViewAssetUrl ?? card.closeupPreviewUrl ?? ""}
                                alt={card.title}
                                aspectClass="aspect-[4/3]"
                              />
                            ) : loadingPosterSrc ? (
                              <div className="relative aspect-[4/3] bg-gray-100 overflow-hidden">
                                <img
                                  src={loadingPosterSrc}
                                  alt={`${card.title} 加载占位`}
                                  className="absolute inset-0 h-full w-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="flex h-full w-full aspect-[4/3] items-center justify-center text-gray-400">
                                <span className="material-icons-round text-3xl">hourglass_top</span>
                              </div>
                            )}
                            {card.fiveViewAssetUrl && (
                              <span className="absolute top-2 left-2 z-20 bg-black/50 text-white text-[10px] font-medium px-1.5 py-1 rounded-md flex items-center gap-1">
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                                五视图
                              </span>
                            )}
                            <div className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} left-2 bottom-2 rounded-full border border-white/70 bg-white/90 px-2 py-0.5 text-[10px] font-semibold shadow-sm ${
                              card.generationStatus === "failed"
                                ? "text-rose-600 border-rose-200 bg-rose-50"
                                : card.generationStatus === "ready"
                                  ? "text-emerald-600 border-emerald-200 bg-emerald-50"
                                  : "text-gray-700"
                            }`}>
                              {card.generationStatus === "failed"
                                ? "生成失败"
                                : card.generationStatus === "ready"
                                  ? "已生成"
                                  : runtimePercentLabel}
                            </div>
                            {isCardSelected ? (
                              <div className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} bottom-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-orange-500 text-white shadow-lg shadow-primary/30`}>
                                <span className="material-icons-round text-[18px] leading-none">check</span>
                              </div>
                            ) : null}
                            <div className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} inset-x-2 bottom-1 h-[3px] rounded-full bg-white/20`}>
                              <div
                                className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                                  runtimeState?.phase === "failed"
                                    ? "bg-gradient-to-r from-rose-400 via-rose-500 to-pink-400"
                                    : runtimeState?.percent == null
                                      ? "w-full animate-pulse bg-slate-300/60"
                                      : "bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400"
                                }`}
                                style={runtimeState?.percent == null ? undefined : {
                                  width: `${runtimeState?.percent}%`,
                                  boxShadow: runtimeState?.phase === "failed"
                                    ? "0 0 6px 1px rgba(244, 63, 94, 0.5)"
                                    : runtimeState?.percent != null && runtimeState!.percent! > 0
                                      ? "0 0 6px 1px rgba(52, 211, 153, 0.5)"
                                      : "none",
                                }}
                              />
                            </div>
                          </div>
                        </article>
                          {/* 历史版本缩略图 - 卡片外部 */}
                          {card.candidateId?.startsWith("generated-") && (
                            <FiveViewHistoryBar
                              characterId={card.candidateId.replace("generated-", "")}
                              currentImageUrl={card.fiveViewAssetUrl}
                              currentStatus={card.generationStatus}
                              onActivated={() => {
                                void refreshCharacters();
                              }}
                            />
                          )}
                        </div>
                      );
                    })()
                  ))}
                </div>
              </section>

            {/* 分界引导 - 角色库推荐 */}
            <div className="relative flex items-center justify-center mb-6 py-4">
              <div className="absolute left-0 right-0 top-1/2 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
              <div className="relative inline-flex flex-col items-center gap-0.5 px-5 py-2 bg-[#fdfbf7] rounded-full border border-gray-200 shadow-[0_2px_6px_rgba(0,0,0,0.05)]">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                  <span className="material-icons-round text-indigo-400 text-[16px]">person_add</span>
                  你还可以选择自己的角色
                </div>
                <div className="text-[11px] text-gray-400">
                  上传的角色将直接用于后续生成，无需经过服饰上身预览
                </div>
              </div>
            </div>

            <section
                data-testid="step2-v2-library-row"
                className="mb-6 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 via-white to-white p-4 md:p-5 shadow-sm"
              >
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="material-icons-round text-indigo-500">groups</span>
                    <div>
                      <div className="text-base font-bold tracking-wide text-indigo-700">角色库推荐</div>
                      <div className="text-xs text-gray-500">已匹配 {step2LibraryReadyCount} 个角色</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      className="text-xs gap-1"
                      disabled={step2Locked || loadingLibraryCharacters}
                      onClick={() => setShowLibrarySelector(true)}
                    >
                      {loadingLibraryCharacters ? (
                        <span className="material-icons-round text-sm animate-spin">refresh</span>
                      ) : (
                        <span className="material-icons-round text-sm">folder_open</span>
                      )}
                      {loadingLibraryCharacters ? "加载中..." : "从角色库选择"}
                    </Button>
                    <Button variant="secondary" className="text-xs" disabled={step2Locked} onClick={() => setShowCreateCharacter(true)}>
                      <span className="material-icons-round text-sm mr-0.5">cloud_upload</span>
                      上传角色
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  {step2LibraryDisplayCards.map((card) => {
                    // 兼容 candidateId 格式: library-{uuid} 或纯 uuid
                    const rawId = card.candidateId?.startsWith("library-")
                      ? card.candidateId.slice(8)
                      : card.candidateId;
                    const isNewlyUploaded = rawId === newlyUploadedCharacterId;
                    const hasCardImage = Boolean(card.closeupPreviewUrl);
                    const isLocallyActive = step2V2ActivePreviewSource === "library" &&
                        step2V2ActiveLibraryCandidateId === card.candidateId;
                    const hasAnyLocalSelection = step2V2ActiveGeneratedCandidateId || step2V2ActiveLibraryCandidateId;
                    const isCardSelected =
                      isLocallyActive ||
                      (card.isSelected && !hasAnyLocalSelection) ||
                      step2Step3GateState.confirmedCandidateId === card.candidateId;
                    return (
                      <button
                        key={card.candidateId}
                        type="button"
                        data-testid={`step2-v2-library-card-${card.displayOrder}`}
                        className={`w-full group relative overflow-hidden rounded-xl border bg-white transition-all duration-200 text-left ${
                          !hasCardImage
                            ? "border-gray-200 opacity-60 cursor-not-allowed"
                            : isCardSelected
                              ? "border-primary ring-2 ring-primary/20 shadow-lg shadow-primary/10"
                              : isNewlyUploaded
                                ? "border-emerald-300 shadow-md shadow-emerald-100"
                                : "border-gray-150 hover:border-indigo-300/60 hover:shadow-md"
                        }`}
                        onClick={() => {
                          if (step2Locked) return;
                          if (!hasCardImage) return;
                          handleOpenStep2V2CandidatePanel("library", card);
                        }}
                        onDoubleClick={(event) => {
                          if (!hasCardImage) return;
                          event.preventDefault();
                          handlePreviewStep2V2CandidateFullImage(card);
                        }}
                      >
                        <div className="relative">
                          {isNewlyUploaded && (
                            <div className="absolute -top-0.5 -right-0.5 z-10 inline-flex items-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">
                              新
                            </div>
                          )}
                          {card.closeupPreviewUrl ? (
                            <BlurFillImage
                              src={card.closeupPreviewUrl}
                              alt={card.title}
                              aspectClass="aspect-[4/3]"
                              hoverClass="group-hover:scale-105"
                            />
                          ) : (
                            <div className="relative aspect-[4/3] bg-gray-50 overflow-hidden">
                              <img
                                src={step2LoadingPosterFrameSrc}
                                alt={`${card.title} 占位背景`}
                                className={`${PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS} h-full w-full object-cover opacity-60`}
                              />
                            </div>
                          )}
                          {card.fiveViewAssetUrl && (
                            <span className="absolute top-2 left-2 z-20 bg-black/50 text-white text-[10px] font-medium px-1.5 py-1 rounded-md flex items-center gap-1">
                              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                              五视图
                            </span>
                          )}
                          {isCardSelected && (
                            <div className="absolute inset-0 bg-primary/5" />
                          )}
                          <div className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} left-1.5 bottom-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm`}>
                            {card.generationStatus === "ready"
                              ? "已匹配"
                              : card.generationStatus === "failed"
                                ? "匹配失败"
                                : "等待候选"}
                          </div>
                          {isCardSelected && (
                            <div className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} bottom-1.5 right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/30`}>
                              <span className="material-icons-round text-sm">check</span>
                            </div>
                          )}
                        </div>
                        <div className={`px-2.5 py-2 border-t ${isCardSelected ? "bg-primary border-primary/30" : "border-gray-50"}`}>
                          <div className={`text-xs font-semibold truncate ${isCardSelected ? "text-white" : "text-gray-800"}`} title={card.title}>{card.title}</div>
                        </div>
                      </button>
                    );
                  })}
                  {/* 第 5 位：添加角色入口（锁定时隐藏，只有显示 4 张卡片时才显示） */}
                  {step2LibraryDisplayCards.length < 5 && !step2Locked && (
                  <button
                    type="button"
                    onClick={() => setShowLibrarySelector(true)}
                    className="w-full group relative overflow-hidden rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50 hover:border-indigo-300 transition-all duration-200 text-center flex flex-col items-center justify-center aspect-[4/3]"
                  >
                    <span className="material-icons-round text-2xl text-indigo-400 group-hover:text-indigo-500 transition-colors">add_circle_outline</span>
                    <div className="mt-1.5 text-[11px] font-semibold text-indigo-600 group-hover:text-indigo-700">选入角色</div>
                    <div className="text-[10px] text-indigo-400 mt-0.5">从角色库或上传</div>
                  </button>
                  )}
                </div>
              </section>
          </div>
        </div>
      </div>

      <div className="fixed bottom-6 left-0 right-0 lg:left-[400px] z-40 flex justify-center pointer-events-none">
        <div className="bg-white border border-gray-200 rounded-full px-2 py-2 shadow-xl shadow-gray-200/50 pointer-events-auto flex items-center gap-4 max-w-[90%] md:max-w-none transform transition-all hover:scale-[1.01] active:scale-[0.99]">
          <Button variant="ghost" onClick={() => { const pid = projectData.projectId ?? urlProjectId ?? undefined; navigate(`/image-create/${pid}/step1`); }} className="rounded-full px-4 text-gray-500 hover:text-gray-900 whitespace-nowrap">
            <span className="material-icons-round text-lg mr-1">arrow_back</span>
            <span className="hidden md:inline">上一步</span>
          </Button>

          <div className="h-4 w-px bg-gray-200" />

          <div
            data-testid="step2-background-task-status"
            className="text-[10px] text-gray-400 font-medium px-2 whitespace-nowrap flex items-center gap-1"
          >
            {step2Locked ? "已完成" : step2StatusTextWithImageGate ?? ""}
          </div>

          <div className="h-4 w-px bg-gray-200" />

          <div className="pr-1">
            {step2Locked ? (
              <Button
                onClick={() => navigate(resolveStep2FooterTargetRoute(projectFlowKind, projectData.projectId))}
                className="rounded-full px-6 bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/20 whitespace-nowrap"
              >
                <span className="material-icons-round text-sm mr-1">lock</span>
                <span className="hidden md:inline">下一步</span>
                <span className="md:hidden">下一步</span>
                <span className="material-icons-round text-lg ml-1">arrow_forward</span>
              </Button>
            ) : (
              <Button
                onClick={() => void handleEnterStep3FromFooter()}
                disabled={step2NextDisabledWithImageGate || enteringStep3}
                className="rounded-full px-6 bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/20 whitespace-nowrap disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none"
              >
                <span className="hidden md:inline">{step2PrimaryActionLabels.desktop}</span>
                <span className="md:hidden">{step2PrimaryActionLabels.mobile}</span>
                <span className="material-icons-round text-lg ml-1">{step2PrimaryActionLabels.iconName}</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {previewImage ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 p-0 text-white shadow-lg backdrop-blur-sm transition-transform hover:scale-110"
            onClick={() => setPreviewImage(null)}
          >
            <span className="material-icons-round">close</span>
          </button>
          <img
            src={previewImage.url}
            alt={previewImage.label}
            className="max-h-full max-w-full rounded-lg object-contain"
            onDoubleClick={() => setPreviewImage(null)}
          />
        </div>
      ) : null}
    </div>
  );
};
