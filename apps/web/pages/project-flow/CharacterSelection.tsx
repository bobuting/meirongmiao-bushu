import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from 'react-router';
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/ui/Button";
import { CreditBadge } from "../../components/ui/CreditBadge";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { BlurFillImage } from "../../components/shared/BlurFillImage";
import { getOssThumbnailUrl } from "../../utils/ossImage";
import { useAppStore } from "../../store/useAppStore";
import { useShallow } from 'zustand/react/shallow';
import { useProjectState, getProjectState, type ProjectCharacterItem } from "../../hooks/useProjectState";
import { useFiveViewGeneration } from "../../hooks/useFiveViewGeneration";
import { GlobalTaskType, TaskStatus } from "../../components/layout/taskQueueConfig";
import { FullScreenLoading } from "../../components/shared/FullScreenLoading";
import { ApiError, backendApi } from "../../services/backendApi";
import { realProjectCharactersApi } from "../../services/realApi/project-characters";
import {
  PROJECT_FLOW_MEDIA_CHROME_Z_CLASS,
  PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS,
} from "./projectFlowMediaLayerGuard";
import type { Step2FiveViewCandidateCard } from "../../../../src/contracts/step2-five-view-candidate-board-contract";
import { FLOW_SAFE_BOTTOM_PADDING } from "./safeBottomPadding";
import { buildStep2OutfitReferenceItems } from "./step2OutfitReference";
import { resolveStep2GenerationReferenceWhitelist } from "./step2GenerationReferenceWhitelist";
import { buildStep2GeneratedFiveViewCandidates } from "./step2GeneratedFiveViewCandidates";
import { buildStep2LibraryFiveViewMatchCandidates } from "./step2LibraryFiveViewMatch";
import { resolveStep2CharacterSelectionControllerState } from "./step2CharacterSelectionController";
import {
  buildStep2CandidateRetryButtonState,
  createStep2CandidateRetryRequest,
} from "./step2CandidateCardActions";
import {
  checkCreditsBalance,
  DEFAULT_PROJECT_FLOW_CREDIT_PRICING,
  loadProjectFlowCreditPricing,
  normalizeProjectFlowCreditPricing,
  resolveProjectFlowCreditSpendErrorMessage,
  spendProjectFlowCredits,
  selectCreditCostByAge,
} from "./projectFlowCredit";

import {
  STEP2_RUNTIME_PROGRESS_LOADING_VIDEO_SRC,
} from "../../../../src/contracts/step2-runtime-progress-contract";
import {
  adaptStep1RolePresetCards,
  resolveStep1RolePresetCardById,
} from "../../../../src/modules/step1-role-preset-adapter";
import { buildStep1RolePresetPanelCompactLines } from "../../../../src/modules/step1-role-preset-panel-compact-render";
import { buildStep2FixedTemplatePromptAssembler } from "../../../../src/modules/step2-fixed-template-prompt-assembler";
import {
  buildStep2LeftPanelMasterPromptEditorView,
} from "../../../../src/modules/step2-left-panel-master-prompt-editor";
import { buildStep2GenerationDependencyBridge } from "../../../../src/modules/step2-generation-dependency-bridge";
import type { Step2SlotValues } from "../../../../src/contracts/step2-generation-dependency-contract";
import { buildStep2RuntimeProgressBridge } from "../../../../src/modules/step2-runtime-progress-bridge";
import { shouldRequireStep1RolePresetFirstPass } from "../../../../src/modules/step1-role-preset-entry-guard";
import { resolveRoleDirectionAvatarRenderModel } from "./step1RoleDirectionAvatarController";
import { resolveStep2RoleConfirmDirectEnter } from "./step2RoleConfirmDirectEnter";
import { resolveProjectFlowKind, resolveStep2PrimaryActionLabels } from "./projectFlowKind";
import { isStatusBeyond, VIDEO_PROJECT_STATUS_ORDER } from "../../../../src/contracts/types";
import type { ProjectStatus, VideoProjectStatus } from "../../../../src/contracts/types";
import type { OutfitPlanDto } from "../../../../src/contracts/outfit-plan.dto";
import { buildFlow41CanonicalRoute } from "./flow41RouteNormalization";
import {
  buildStep2ImageProjectCompletionPatch,
  resolveStep2FooterFeedback,
  resolveStep2FooterTargetRoute,
} from "./step2ProjectFlowAction";
import {
  ProjectFlowHistorySidebar,
  type StoryboardFrame,
  StepContentHeader,
} from "../../components/project-flow";
import { PendingScriptPreviewCard } from "../../components/project-flow/PendingScriptPreviewCard";
import { FiveViewHistoryBar } from "../../components/project-flow/FiveViewHistoryBar";
import {
  type BackgroundGenerationTaskState,
  type CharacterOption,
  resolveStep2PersistedCandidatePreviewSelection,
  resolveStep2CandidateHasImage,
  collectStep2AllInOneDurationSamplesMs,
  estimateStep2AllInOneDurationMs,
  resolveStep2AllInOneSimulatedPercent,
  clampTaskProgress,
  normalizeStep2BackendProgressSignal,
  normalizeBackgroundGenerationTask,
  mergeBackgroundResultRefs,
  resolveStep2V2BackgroundTaskImageUrl,
  buildStep2V2BackgroundTaskId,
  migrateBackgroundGenerationTaskToMap,
  getBackgroundTaskForCandidate,
  useStep2LoadingPosterFrameSrc,
} from "../shared/step2-utils";
import {
  MobileConfigDrawer,
  CharacterLibrarySelectorModal,
  type CharacterLibrarySelectorItem,
} from "../shared/step2-shared-components";
import { CreateCharacterModal } from "../characters/characterCreateModalPanel";
import type { Character } from "../../types";

type Step2V2CandidateRuntimeMeta = {
  startedAtMs?: number | null;
  backendProgressPercent?: number | null;
};

export const CharacterSelection: React.FC = () => {
  const navigate = useNavigate();
  const { projectId: urlProjectId } = useParams<{ projectId: string }>();
  const { token, showGlobalLoading, hideGlobalLoading, globalTaskQueue, globalTaskQueueInitialized } = useAppStore(useShallow((state) => ({ token: state.token, showGlobalLoading: state.showGlobalLoading, hideGlobalLoading: state.hideGlobalLoading, globalTaskQueue: state.globalTaskQueue, globalTaskQueueInitialized: state.globalTaskQueueInitialized })));
  const { projectData, workflow, isInitialLoading, updateProjectData, refreshCharacters, addCharacter, removeCharacter, selectCharacter, setBackgroundGenerationTasks, setVideoCharacters, setImageCharacters, setStep2RoleSlotValues, setImageProjectPatch } = useProjectState(urlProjectId);
  // 五视图生成 hook（仅 Step2 需要）
  const { generateFiveViewCharacter, batchGenerateFiveViewCharacters } = useFiveViewGeneration(urlProjectId);
  const { confirm } = useConfirm();
  // 反推脚本：优先用前端临时数据，否则从后端加载
  const reverseScriptId = projectData.reverseScriptId;
  const [loadedReverseScript, setLoadedReverseScript] = useState<{
    title: string;
    summary: string;
    segments: Array<{ time: string; title: string; content: string; visualCue: string }>;
    videoUrl?: string | null;
    hasRealPerson?: boolean | null;
  } | null>(null);
  useEffect(() => {
    if (!token || !reverseScriptId || workflow.pendingReverseDeckScript) return;
    let cancelled = false;
    void (async () => {
      try {
        const script = await backendApi.getMyLibraryScript(token, reverseScriptId);
        if (cancelled) return;
        const payload = script.payload ?? {};
        // 统一使用 payload.shots 格式（与后端 buildPayload 一致）
        const segments = Array.isArray(payload.shots)
          ? (payload.shots as Array<Record<string, unknown>>).map((s) => {
              const visual = s.visual as Record<string, unknown> | undefined;
              const scene = visual?.scene as Record<string, unknown> | undefined;
              return {
                time: String(s.timecode_start ?? s.time ?? ""),
                title: String(s.shot_type ?? ""),
                content: String(s.description ?? ""),
                visualCue: String(scene?.environment ?? ""),
              };
            })
          : [];
        // 提取视频链接和真人判断（与 Step1 一致）
        const videoAnalysis = payload.video_analysis as Record<string, unknown> | undefined;
        const videoUrl = videoAnalysis?.sourceOssUrl as string | null | undefined;
        const onScreenPresence = payload.on_screen_presence as Record<string, unknown> | undefined;
        const hasRealPerson = onScreenPresence?.has_real_person as boolean | null | undefined;

        setLoadedReverseScript({
          title: script.title || "反推脚本",
          summary: String(payload.summary ?? ""),
          segments,
          videoUrl: videoUrl ?? null,
          hasRealPerson: hasRealPerson ?? null,
        });
      } catch (e) {
        console.warn("[Step2] 加载反推脚本失败:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [token, reverseScriptId, workflow.pendingReverseDeckScript]);
  const persistedCandidatePreviewSelection = useMemo(
    () => resolveStep2PersistedCandidatePreviewSelection(projectData as unknown as Record<string, unknown> | null | undefined),
    [projectData],
  );
  const [showMobileConfig, setShowMobileConfig] = useState(false);
  const [outfitReferencePromptDraft, setOutfitReferencePromptDraft] = useState<string>("");
  const [, setOptimizingOutfitReferencePrompt] = useState(false);
  const [showCreateCharacter, setShowCreateCharacter] = useState(false);
  const [showLibrarySelector, setShowLibrarySelector] = useState(false);
  const [newlyUploadedCharacterId, setNewlyUploadedCharacterId] = useState<string | null>(null);
  // 手动从角色库选择器选中的角色（用于不在 AI 匹配 Top4 中的角色）
  const [manuallySelectedLibraryChar, setManuallySelectedLibraryChar] = useState<{
    id: string;
    name: string;
    thumbnailUrl: string;
    fiveViewOssImageUrl?: string | null;
  } | null>(null);
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
  // 追踪上一次持久化的值，避免 useEffect 循环触发
  const lastPersistedRef = useRef<{
    source: "generated" | "library" | null;
    generatedId: string | null;
    libraryId: string | null;
  } | null>(null);
  const [step2V2PromptDraft, setStep2V2PromptDraft] = useState("");
  const [step2V2Generating, setStep2V2Generating] = useState(false);
  const [step2V2PendingCandidateId, setStep2V2PendingCandidateId] = useState<string | null>(null);
  const [step2V2CandidateRuntimeMeta, setStep2V2CandidateRuntimeMeta] = useState<Record<string, Step2V2CandidateRuntimeMeta>>({});
  const [step2RuntimeClockMs, setStep2RuntimeClockMs] = useState<number>(() => Date.now());
  const [previewImage, setPreviewImage] = useState<{ url: string; label: string } | null>(null);
  const [imagePreview, setImagePreview] = useState<{
    frames: StoryboardFrame[];
    currentIndex: number;
  } | null>(null);
  // 从数据库获取项目真实状态，用于 selectedRoleDirection 同步
  useEffect(() => {
    const effectiveProjectId = urlProjectId || projectData.projectId;
    if (!effectiveProjectId || !token) return;
    backendApi
      .getProject(token, effectiveProjectId)
      .then((project) => {
        if (project && project.selectedRoleDirection) {
          updateProjectData({ selectedRoleDirection: project.selectedRoleDirection });
        }
      })
      .catch((err) => {
        console.error("[CharacterSelection] Failed to fetch project:", err);
      });
  }, [urlProjectId, projectData.projectId, token]);

  // 监听五视图任务完成（completed 或 failed），直接刷新角色数据
  const processedTaskIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const effectiveProjectId = urlProjectId || projectData.projectId;
    if (!effectiveProjectId || !token) return;

    // 监听完成和失败的任务
    const finishedFiveViewTasks = globalTaskQueue.filter(
      (t) => t.type === GlobalTaskType.STEP2_FIVE_VIEW && t.projectId === effectiveProjectId && (t.status === TaskStatus.COMPLETED || t.status === TaskStatus.FAILED)
    );

    for (const task of finishedFiveViewTasks) {
      if (processedTaskIdsRef.current.has(task.id)) continue;
      processedTaskIdsRef.current.add(task.id);

      // 清除生成状态
      if (finishedFiveViewTasks.some(t => t.status === TaskStatus.COMPLETED || t.status === TaskStatus.FAILED)) {
        // 所有任务完成后清除整体生成状态
        const stillRunning = globalTaskQueue.some(
          (t) => t.type === GlobalTaskType.STEP2_FIVE_VIEW && t.projectId === effectiveProjectId && (t.status === TaskStatus.PENDING || t.status === TaskStatus.RUNNING)
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
  }, [globalTaskQueue, urlProjectId, projectData.projectId, token, refreshCharacters]);

  // ========== GlobalTimer 集成 ==========
  const prevStep2LoadingCountRef = useRef(0);
  useEffect(() => {
    if (step2V2Generating && prevStep2LoadingCountRef.current === 0) {
      showGlobalLoading();
    } else if (!step2V2Generating && prevStep2LoadingCountRef.current > 0) {
      hideGlobalLoading();
    }
    prevStep2LoadingCountRef.current = step2V2Generating ? 1 : 0;
  }, [step2V2Generating, showGlobalLoading, hideGlobalLoading]);

  // 键盘事件监听（图片预览导航）
  useEffect(() => {
    if (!imagePreview) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setImagePreview((current) => {
          if (!current) return current;
          const newIndex = current.currentIndex > 0
            ? current.currentIndex - 1
            : current.frames.length - 1;
          return { ...current, currentIndex: newIndex };
        });
      } else if (e.key === "ArrowRight") {
        setImagePreview((current) => {
          if (!current) return current;
          const newIndex = current.currentIndex < current.frames.length - 1
            ? current.currentIndex + 1
            : 0;
          return { ...current, currentIndex: newIndex };
        });
      } else if (e.key === "Escape") {
        setImagePreview(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [imagePreview]);

  const step2LoadingPosterFrameSrc = useStep2LoadingPosterFrameSrc();
  const [creditPricing, setCreditPricing] = useState(DEFAULT_PROJECT_FLOW_CREDIT_PRICING);
  const generateAllInFlightRef = useRef(false);
  const step2V2CandidateInFlightRef = useRef<Set<string>>(new Set());
  const handledReturnRouteRef = useRef<string | null>(null);
  const step2AutoEnterProjectIdRef = useRef<string | null>(null);
  const persistedStep2ViewHydrationKeyRef = useRef<string | null>(null);
  const step2V2BackgroundHydrationKeyRef = useRef<Record<string, string>>({});
  const step2MountedGuardRef = useRef(false);
  const step2SingleRetryCreditCost = Math.max(0, creditPricing.singleImageCreditCost);
  const step2InitialGenerateCreditCharged = false; // Removed field, always false
  const projectFlowKind = resolveProjectFlowKind(projectData.projectKind);

  // 生成角色：从 GeneratedCharacters 字段读取（generationSlot 1-3）
  const step2GeneratedCharacters = (projectFlowKind === "image"
    ? workflow.imageProjectGeneratedCharacters
    : workflow.videoProjectGeneratedCharacters) as ProjectCharacterItem[] | undefined;

  // 角色库角色：从 LibraryCharacters 字段读取（角色库选入/推荐）
  const step2LibraryCharacters = (projectFlowKind === "image"
    ? workflow.imageProjectLibraryCharacters
    : workflow.videoProjectLibraryCharacters) as ProjectCharacterItem[] | undefined;

  // 使用 JSON.stringify 作为 useMemo 依赖，确保数组内容变化时触发重新计算
  const step2GeneratedCharactersKey = JSON.stringify(step2GeneratedCharacters?.map(c => ({
    id: c.libraryCharacterId,
    slot: c.generationSlot,
    hasImage: !!c.character?.fiveViewOssImageUrl,
  })));

  const step2LibraryCharactersKey = JSON.stringify(step2LibraryCharacters?.map(c => ({
    id: c.libraryCharacterId,
    slot: c.generationSlot,
    hasImage: !!c.character?.fiveViewOssImageUrl,
  })));

  // DEBUG: 检查 workflow 更新（根据项目类型只监听对应字段）
  useEffect(() => {
  }, [step2GeneratedCharacters, step2LibraryCharacters, urlProjectId, step2GeneratedCharactersKey, step2LibraryCharactersKey, projectFlowKind]);

  // Step2 锁定状态：项目状态超过 CHARACTER_SELECTED 时（进入 CHARACTER_CONFIRMED 即脚本生成阶段），锁定选择功能
  // 定义在前面，因为 step2PrimaryActionLabels 需要用到
  const step2Locked = isStatusBeyond(
    projectData.projectStatus as ProjectStatus | undefined,
    "CHARACTER_SELECTED",
  );

  const step2PrimaryActionLabels = useMemo(
    () => resolveStep2PrimaryActionLabels(projectFlowKind, enteringStep3, step2Locked),
    [enteringStep3, projectFlowKind, step2Locked],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStep2RuntimeClockMs(Date.now());
    }, 400);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    // Guard: only run once per projectId
    if (step2MountedGuardRef.current) {
      return;
    }
    step2MountedGuardRef.current = true;

    const latestPersistedCandidatePreviewSelection = resolveStep2PersistedCandidatePreviewSelection(
      getProjectState(urlProjectId!).workflow as unknown as Record<string, unknown> | null | undefined,
    );
    generateAllInFlightRef.current = false;
    step2V2CandidateInFlightRef.current.clear();
    handledReturnRouteRef.current = null;
    step2AutoEnterProjectIdRef.current = null;
    persistedStep2ViewHydrationKeyRef.current = null;
    step2V2BackgroundHydrationKeyRef.current = {};
    setShowMobileConfig(false);
    setOutfitReferencePromptDraft("");
    setOptimizingOutfitReferencePrompt(false);
    setShowCreateCharacter(false);
    setFeedback(null);
    setStep2V2ActivePreviewSource(latestPersistedCandidatePreviewSelection.source);
    setStep2V2ActiveGeneratedCandidateId(latestPersistedCandidatePreviewSelection.generatedCandidateId);
    setStep2V2ActiveLibraryCandidateId(latestPersistedCandidatePreviewSelection.libraryCandidateId);
    setStep2V2PromptDraft("");
    setStep2V2Generating(false);
    setStep2V2PendingCandidateId(null);
    setStep2V2CandidateRuntimeMeta({});
    setPreviewImage(null);
  }, [projectData.projectId]);

  // 用户角色库（用于选择器弹窗，展示所有可用角色）
  // 改为懒加载：只在打开弹窗时请求
  // 弹窗数据：符合性别/年龄的角色列表（懒加载）
  const { data: matchCandidatesResp, isLoading: loadingPresets, refetch: refetchLibraryCharacters } = useQuery({
    queryKey: ["step2-match-candidates", token, urlProjectId, projectData.projectKind],
    enabled: Boolean(token) && Boolean(urlProjectId) && showLibrarySelector,
    queryFn: async () => {
      if (!token || !urlProjectId) return { characters: [] };
      const kind = projectData.projectKind === "image" ? "image" : projectData.projectKind === "reverse" ? "reverse" : "video";
      return backendApi.getMatchCandidates(token, urlProjectId, kind);
    },
  });

  // 项目角色（进入 Step2 时主动查询 API）
  const [projectCharactersResp, setProjectCharactersResp] = useState<{
    items: Array<{
      id: string;
      projectId: string;
      libraryCharacterId: string;
      role: "main" | "secondary";
      sourceType: "generated" | "library";
      isSelected: boolean;
      generationSlot: number | null;
      createdAt: number;
      updatedAt: number;
      character: {
        id: string;
        name: string;
        thumbnailUrl: string;
        fiveViewOssImageUrl: string | null;
        tags: string[];
        kind: string;
        status: string;
        views: string[];
      } | null;
    }>;
    selectedCharacterId: string | null;
  } | null>(null);

  // 进入 Step2 时主动查询项目角色（仅生成角色）
  useEffect(() => {
    const effectiveProjectId = urlProjectId || projectData.projectId;
    if (!effectiveProjectId || !token) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await realProjectCharactersApi.listProjectCharacters(token, effectiveProjectId);
        if (cancelled) return;
        // 只保留生成角色，角色库推荐走独立接口
        const generatedItems = (res.items ?? [])
          .filter((item) => item.sourceType === "generated")
          .map((item) => ({
            id: item.id,
            projectId: item.projectId,
            libraryCharacterId: item.libraryCharacterId,
            role: item.role,
            sourceType: item.sourceType,
            isSelected: item.isSelected,
            generationSlot: item.generationSlot,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            character: item.character ? {
              id: item.character.id,
              name: item.character.name,
              thumbnailUrl: item.character.thumbnailUrl,
              fiveViewOssImageUrl: item.character.fiveViewOssImageUrl ?? null,
              tags: item.character.tags ?? [],
              kind: item.character.kind ?? "",
              status: item.character.status ?? "",
              views: item.character.views ?? [],
            } : null,
          }));
        setProjectCharactersResp({
          items: generatedItems,
          selectedCharacterId: res.selectedCharacterId ?? null,
        });
      } catch (err) {
        console.error("[CharacterSelection] listProjectCharacters failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [urlProjectId, projectData.projectId, token]);

  // React Query loading 状态同步到全局 loading
  useEffect(() => {
    if (loadingPresets) {
      useAppStore.getState().showGlobalLoading();
    } else {
      useAppStore.getState().hideGlobalLoading();
    }
  }, [loadingPresets]);

  const presets = useMemo(
    () =>
      (projectCharactersResp?.items ?? [])
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
          }),
        ),
    [projectCharactersResp?.items],
  );

  // 优先使用 workflow 中的选中状态（selectCharacter 会更新此字段）
  // 其次使用 projectCharactersResp 中的选中状态（页面初始化时从 API 获取）
  const selectedCharacterId = (workflow.videoSelectedCharacterId as string | null) ?? projectCharactersResp?.selectedCharacterId ?? null;

  // 角色库选择器数据（用于弹窗展示符合性别/年龄的角色列表）
  const librarySelectorCharacters = useMemo(
    () =>
      (matchCandidatesResp?.characters ?? [])
        .filter((item) => item.status === "ready")
        .map((item) => ({
          id: item.id,
          name: item.name,
          tags: item.tags ?? [],
          thumbnailUrl: item.thumbnailUrl,
          kind: item.kind,
          status: item.status,
          views: item.views ?? [],
          fiveViewOssImageUrl: item.fiveViewOssImageUrl ?? null,
        })),
    [matchCandidatesResp?.characters],
  );

  // Per-candidate 后台任务 Map：每个卡位独立的持久化任务状态
  const persistedBackgroundTasks: Record<string, unknown> = {}; // Always empty after refactor

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

  // 初始化：从持久化数据恢复本地 state（只在 persisted 数据变化时执行）
  const prevPersistedSourceRef = useRef(persistedCandidatePreviewSelection.source);
  const prevPersistedGeneratedIdRef = useRef(persistedCandidatePreviewSelection.generatedCandidateId);
  const prevPersistedLibraryIdRef = useRef(persistedCandidatePreviewSelection.libraryCandidateId);
  useEffect(() => {
    if (
      persistedCandidatePreviewSelection.source === prevPersistedSourceRef.current &&
      persistedCandidatePreviewSelection.generatedCandidateId === prevPersistedGeneratedIdRef.current &&
      persistedCandidatePreviewSelection.libraryCandidateId === prevPersistedLibraryIdRef.current
    ) {
      return;
    }
    prevPersistedSourceRef.current = persistedCandidatePreviewSelection.source;
    prevPersistedGeneratedIdRef.current = persistedCandidatePreviewSelection.generatedCandidateId;
    prevPersistedLibraryIdRef.current = persistedCandidatePreviewSelection.libraryCandidateId;

    if (!persistedCandidatePreviewSelection.source && !persistedCandidatePreviewSelection.generatedCandidateId && !persistedCandidatePreviewSelection.libraryCandidateId) {
      return;
    }
    setStep2V2ActivePreviewSource(persistedCandidatePreviewSelection.source);
    setStep2V2ActiveGeneratedCandidateId(persistedCandidatePreviewSelection.generatedCandidateId);
    setStep2V2ActiveLibraryCandidateId(persistedCandidatePreviewSelection.libraryCandidateId);
  }, [
    persistedCandidatePreviewSelection.generatedCandidateId,
    persistedCandidatePreviewSelection.libraryCandidateId,
    persistedCandidatePreviewSelection.source,
  ]);

  // Step2 关键状态直接同步保存
  // 注意：参数名对应 API payload 字段名（projectDataPatch → API 的 projectData 字段）
  // 由于 API 两字段均为 Record<string, unknown>，且总是展开完整当前状态，参数内容不会导致数据丢失
  useEffect(() => {
    // 用 ref 追踪值，避免 updateProjectData 导致的循环
    if (
      step2V2ActivePreviewSource === lastPersistedRef.current?.source &&
      step2V2ActiveGeneratedCandidateId === lastPersistedRef.current?.generatedId &&
      step2V2ActiveLibraryCandidateId === lastPersistedRef.current?.libraryId
    ) {
      return;
    }

    // 仅更新本地状态，不持久化
    lastPersistedRef.current = {
      source: step2V2ActivePreviewSource,
      generatedId: step2V2ActiveGeneratedCandidateId,
      libraryId: step2V2ActiveLibraryCandidateId,
    };
  }, [
    step2V2ActiveGeneratedCandidateId,
    step2V2ActiveLibraryCandidateId,
    step2V2ActivePreviewSource,
  ]);

  // 持久化 per-candidate 后台任务状态到本地 workflow
  const persistBackgroundTask = (candidateId: string, next: BackgroundGenerationTaskState | null) => {
    const currentMap = (getProjectState(urlProjectId!).workflow.backgroundGenerationTasks ?? {}) as Record<string, unknown>;
    const nextMap: Record<string, unknown> = { ...currentMap };
    if (next && next.phase !== "idle") {
      nextMap[candidateId] = next;
    } else {
      delete nextMap[candidateId];
    }
    setBackgroundGenerationTasks(nextMap);
  };

  // 标记指定 candidate 的后台任务为 running
  const markBackgroundTaskRunning = (candidateId: string, input: {
    taskId: string;
    progress: number;
    resultRefs?: string[];
    startedAt?: number | null;
  }) => {
    const now = Date.now();
    const currentMap = (getProjectState(urlProjectId!).workflow.backgroundGenerationTasks ?? {}) as Record<string, unknown>;
    const previous = normalizeBackgroundGenerationTask(currentMap[candidateId]);
    const mergedResultRefs = mergeBackgroundResultRefs(previous?.resultRefs ?? [], input.resultRefs ?? []);
    persistBackgroundTask(candidateId, {
      taskId: input.taskId,
      phase: "running",
      progress: clampTaskProgress(input.progress, previous?.progress ?? 0),
      startedAt:
        input.startedAt ??
        (previous?.taskId === input.taskId ? previous.startedAt : null) ??
        now,
      updatedAt: now,
      resultRefs: mergedResultRefs,
      error: null,
    });
  };

  // 标记指定 candidate 的后台任务为 completed
  const markBackgroundTaskCompleted = (candidateId: string, input: {
    taskId: string;
    resultRefs?: string[];
    startedAt?: number | null;
  }) => {
    const now = Date.now();
    const currentMap = (getProjectState(urlProjectId!).workflow.backgroundGenerationTasks ?? {}) as Record<string, unknown>;
    const previous = normalizeBackgroundGenerationTask(currentMap[candidateId]);
    persistBackgroundTask(candidateId, {
      taskId: input.taskId,
      phase: "completed",
      progress: 100,
      startedAt:
        input.startedAt ??
        (previous?.taskId === input.taskId ? previous.startedAt : null) ??
        now,
      updatedAt: now,
      resultRefs: mergeBackgroundResultRefs(previous?.resultRefs ?? [], input.resultRefs ?? []),
      error: null,
    });
  };

  // 标记指定 candidate 的后台任务为 failed
  const markBackgroundTaskFailed = (candidateId: string, input: {
    taskId: string;
    message: string;
    code?: string;
    resultRefs?: string[];
    startedAt?: number | null;
  }) => {
    const now = Date.now();
    const currentMap = (getProjectState(urlProjectId!).workflow.backgroundGenerationTasks ?? {}) as Record<string, unknown>;
    const previous = normalizeBackgroundGenerationTask(currentMap[candidateId]);
    persistBackgroundTask(candidateId, {
      taskId: input.taskId,
      phase: "failed",
      progress: clampTaskProgress(previous?.progress ?? 0, 0),
      startedAt:
        input.startedAt ??
        (previous?.taskId === input.taskId ? previous.startedAt : null) ??
        now,
      updatedAt: now,
      resultRefs: mergeBackgroundResultRefs(previous?.resultRefs ?? [], input.resultRefs ?? []),
      error: {
        code: input.code ?? null,
        message: input.message,
      },
    });
  };

  const backgroundTaskStatusText = useMemo(() => {
    // persistedBackgroundTasks is always empty after refactor
    return null;
  }, []);

  const activePreset = presets.find((preset) => preset.id === selectedCharacterId) ?? null;

  const step2V2GeneratedPreviewUrls = useMemo(
    () => {
      // Removed field step2V2GeneratedCandidateUrls
      return [];
    },
    [],
  );
  const step2LibraryBaseCards = useMemo(
    () => {
      // videoProjectLibraryCharacters 现在来自 getLibraryRecommendations（懒匹配）
      const libraryItems = (step2LibraryCharacters ?? [])
        .filter((item) => item.character != null);

      return libraryItems.map((item, index): Step2FiveViewCandidateCard => ({
        candidateId: `library-${item.libraryCharacterId}`,
        sourceType: "library" as const,
        rowIndex: 2,
        displayOrder: index + 1,
        title: item.character!.name,
        closeupPreviewUrl: item.character!.fiveViewOssImageUrl ?? item.character!.thumbnailUrl ?? null,
        fiveViewAssetUrl: item.character!.fiveViewOssImageUrl ?? item.character!.thumbnailUrl ?? null,
        // 优先使用 activeFiveViewStatus（五视图生成状态），如果没有则使用 status（角色整体状态）
        generationStatus: (item.character?.activeFiveViewStatus || item.character?.status || "ready") as "pending" | "processing" | "ready" | "failed",
        progressPercent: 100,
        generationSlot: item.generationSlot, // 保留 generationSlot 用于识别手动选入的角色
        isSelected: item.isSelected, // 是否已选中为项目主角色
      }));
    },
    [step2LibraryCharacters],
  );
  // 角色库卡片直接使用基础数据（无需 patches 覆盖）
  const step2LibraryCandidateCards = step2LibraryBaseCards;

  // 手动选择的角色注入到候选列表，确保预览面板能正确渲染
  // 角色库推荐区：固定 4 个推荐 + 第 5 位为手动选入的角色（generationSlot=5）
  const step2LibraryDisplayCards = useMemo(() => {
    // 从后端返回的数据中找出 generationSlot=5 的角色（刷新后仍能显示）
    const slot5Card = step2LibraryCandidateCards.find((card) => card.generationSlot === 5);
    // 剩余角色取前 4 个（排除 generationSlot=5）
    const top4 = step2LibraryCandidateCards
      .filter((card) => card.generationSlot !== 5)
      .slice(0, 4);

    // 手动选入的角色固定放在第 5 位
    let extraCard: Step2FiveViewCandidateCard | null = slot5Card ?? null;
    if (manuallySelectedLibraryChar && !slot5Card) {
      extraCard = {
        candidateId: `library-${manuallySelectedLibraryChar.id}`,  // 与角色库匹配推荐格式一致
        sourceType: "library",
        rowIndex: 2,
        displayOrder: 5,
        title: manuallySelectedLibraryChar.name,
        closeupPreviewUrl: manuallySelectedLibraryChar.thumbnailUrl || manuallySelectedLibraryChar.fiveViewOssImageUrl || null,
        fiveViewAssetUrl: manuallySelectedLibraryChar.fiveViewOssImageUrl ?? null,
        generationStatus: "ready",
        progressPercent: 100,
        generationSlot: 5,
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
          displayOrder: 5,
          title: newPreset.name ?? "",
          closeupPreviewUrl: (newPreset.thumbnail || newPreset.fiveViewOssImageUrl) ?? null,
          fiveViewAssetUrl: newPreset.fiveViewOssImageUrl ?? null,
          generationStatus: "ready",
          progressPercent: 100,
          generationSlot: 5,
        };
      }
    }

    return extraCard ? [...top4, extraCard] : top4;
  }, [step2LibraryCandidateCards, manuallySelectedLibraryChar, newlyUploadedCharacterId, presets]);
  const step2LibraryReadyCount = useMemo(
    () => step2LibraryDisplayCards.filter((card) => card.generationStatus === "ready").length,
    [step2LibraryDisplayCards],
  );

  useEffect(() => {
    // persistedBackgroundTasks is always empty after refactor
  }, []);

  const selectedOutfit = useMemo(() => {
    const outfits = (workflow.videoOutfitPlans as OutfitPlanDto[]) ?? [];
    const selectedId = workflow.videoSelectedOutfitId;
    if (!selectedId) return null;
    return outfits.find((item) => String(item.id) === String(selectedId)) ?? null;
  }, [workflow.videoOutfitPlans, workflow.videoSelectedOutfitId]);

  const selectedOutfitSource = null; // Removed field videoSelectedOutfitSource
  const step2Step1SelectedOutfitSummary = useMemo(() => {
    const sourceLabel =
      selectedOutfitSource === "analysis"
        ? "AI搜索分析"
        : selectedOutfitSource === "visual"
          ? "图片搭配"
          : "未指定";
    const title =
      typeof selectedOutfit?.title === "string" && selectedOutfit.title.trim().length > 0
        ? selectedOutfit.title.trim()
        : selectedOutfit
          ? `搭配方案 ${selectedOutfit.id}`
          : "未选择搭配方案";
    const selectedOutfitId =
      selectedOutfit && typeof selectedOutfit.id === "string"
        ? selectedOutfit.id.trim()
        : typeof workflow.videoSelectedOutfitId === "string"
          ? workflow.videoSelectedOutfitId.trim()
          : workflow.videoSelectedOutfitId !== null && workflow.videoSelectedOutfitId !== undefined
            ? String(workflow.videoSelectedOutfitId).trim()
            : "";
    const normalizedAnalysisCards: Array<{
      planId: string;
      index: number | null;
      items: Array<{ type: string; text: string }>;
    }> = []; // Removed field videoOutfitAnalysisCards
    let matchedCard = normalizedAnalysisCards.find((item) => item.planId.length > 0 && item.planId === selectedOutfitId) ?? null;
    if (!matchedCard && selectedOutfitId.length > 0) {
      const generatedOutfits = (workflow.videoOutfitPlans as OutfitPlanDto[]) ?? [];
      const selectedIndex = generatedOutfits.findIndex((item) => String(item.id).trim() === selectedOutfitId);
      if (selectedIndex >= 0) {
        matchedCard = normalizedAnalysisCards.find((item) => item.index === selectedIndex + 1) ?? null;
      }
    }
    return {
      sourceLabel,
      title,
      complementaryItems: (matchedCard?.items ?? []).map((it) => ({ id: it.type, label: it.type, text: it.text })),
    };
  }, [
    workflow.videoOutfitPlans,
    workflow.videoSelectedOutfitId,
    selectedOutfit,
    selectedOutfitSource,
  ]);

  const step1RoleDirectionCards = useMemo(
    () => adaptStep1RolePresetCards(workflow.videoRoleDirections, "character-selection-project-data"),
    [workflow.videoRoleDirections],
  );
  const step1SelectedRoleDirectionId =
    typeof workflow.videoSelectedRoleDirectionId === "string" && workflow.videoSelectedRoleDirectionId.trim().length > 0
      ? workflow.videoSelectedRoleDirectionId.trim()
      : null;
  const step1SelectedRoleDirection = useMemo(() => {
    const fromCards = resolveStep1RolePresetCardById(step1RoleDirectionCards, step1SelectedRoleDirectionId);
    if (fromCards) {
      return fromCards;
    }
    // 回退到项目表的 selectedRoleDirection 字段
    const rd = projectData.selectedRoleDirection as Record<string, unknown> | undefined;
    if (rd && rd.directionId === step1SelectedRoleDirectionId) {
      const result = {
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
      return result;
    }
    return undefined;
  }, [step1RoleDirectionCards, step1SelectedRoleDirectionId, projectData.selectedRoleDirection]);

  // 判断 Step1 服装搭配是否已确认：
  // 项目状态 >= OUTFIT_CONFIRMED 说明 Step1 已完成，可以进入 Step2
  const currentProjectStatus = projectData.projectStatus;
  const step1SelectedRoleDirectionConfirmed =
    currentProjectStatus === "OUTFIT_CONFIRMED" ||
    currentProjectStatus === "CHARACTER_VIEW_READY" ||
    currentProjectStatus === "CHARACTER_SELECTED" ||
    currentProjectStatus === "CHARACTER_CONFIRMED" ||
    currentProjectStatus === "SCRIPT_GENERATED" ||
    currentProjectStatus === "SCRIPT_SELECTED" ||
    currentProjectStatus === "SCRIPT_CONFIRMED" ||
    currentProjectStatus === "STORYBOARDING" ||
    currentProjectStatus === "STORYBOARD_PREVIEW_COMPLETED" ||
    currentProjectStatus === "FILMING" ||
    currentProjectStatus === "CLIPS_READY" ||
    currentProjectStatus === "FISSIONING" ||
    currentProjectStatus === "READY_TO_PUBLISH" ||
    currentProjectStatus === "PUBLISHED";

  const shouldRequireStep1RolePresetGate =
    step1RoleDirectionCards.length > 0 &&
    shouldRequireStep1RolePresetFirstPass({
      projectStatus: projectData.projectStatus,
      step1RolePresetConfirmed: step1SelectedRoleDirectionConfirmed,
      selectedCharacterId,
      selectedPreviewImageUrl: null, // Removed field
      workflowSelectedPreviewId: projectData.selectedPreviewId,
      characters: [...((workflow.videoProjectGeneratedCharacters as unknown[]) || []), ...((workflow.videoProjectLibraryCharacters as unknown[]) || [])] as unknown[] | undefined,
      script: workflow.script as unknown[] | undefined,
      clipStatuses: workflow.clipStatuses as unknown[] | undefined,
      pendingStoryboardImport: workflow.pendingStoryboardImport,
      pendingScriptImport: workflow.pendingScriptImport as boolean | undefined,
    });
  const step1SelectedRoleDirectionIndex = useMemo(
    () =>
      step1RoleDirectionCards.findIndex((item) => item.directionId === step1SelectedRoleDirectionId),
    [step1RoleDirectionCards, step1SelectedRoleDirectionId],
  );
  const step2SelectedRoleDirectionCompactLines = useMemo(
    () => (step1SelectedRoleDirection ? buildStep1RolePresetPanelCompactLines(step1SelectedRoleDirection as Parameters<typeof buildStep1RolePresetPanelCompactLines>[0]) : []),
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
    navigate(`/create/${pid}/step1`, {
      replace: true,
      state: {
        step1GuardMessage: "请先在 Step1 选中并确认推荐角色预设，再进入 Step2。",
      },
    });
  }, [navigate, shouldRequireStep1RolePresetGate, step1SelectedRoleDirectionConfirmed]);
  // Step2 no longer applies LLM slot-variation overrides.
  // Keep three cards as pure draw retries under the same Step1-confirmed prompt.
  const step2PromptVariantModes = useMemo(() => ["code", "code", "code"] as const, []);
  const step2FixedTemplatePromptAssembly = useMemo(
    () =>
      buildStep2FixedTemplatePromptAssembler({
        selectedRoleDirection: step1SelectedRoleDirection as Parameters<typeof buildStep2FixedTemplatePromptAssembler>[0]["selectedRoleDirection"],
        selectedPlanId: workflow.videoSelectedOutfitId as string | undefined,
        selectedOutfitSource,
        analysisCards: [], // Removed field videoOutfitAnalysisCards
        persistedOutfitSummary: null, // Removed field outfitSummary
        variantModes: step2PromptVariantModes,
      }),
    [
      workflow.videoSelectedOutfitId,
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
    () => buildStep2OutfitReferenceItems(workflow.videoGarmentModules as Parameters<typeof buildStep2OutfitReferenceItems>[0]),
    [workflow.videoGarmentModules],
  );

  const step2ReferencePolicyMode = selectedOutfitSource === "analysis" ? "single-confirmed" : "complete-outfit";
  const step2GenerationReferenceInput = useMemo(
    () =>
      resolveStep2GenerationReferenceWhitelist(outfitReferenceItems as Parameters<typeof resolveStep2GenerationReferenceWhitelist>[0], {
        policyMode: step2ReferencePolicyMode,
      }),
    [outfitReferenceItems, step2ReferencePolicyMode],
  );
  const step2GenerationReferenceImages = step2GenerationReferenceInput.referenceImages;
  const step2GenerationDependencyBridge = useMemo(
    () =>
      buildStep2GenerationDependencyBridge({
        referenceImages: step2GenerationReferenceInput.referenceImages,
        missingRequiredSlots: step2GenerationReferenceInput.missingRequiredSlots,
        fixedTemplateSlotValues: step2RoleSlotValues,
      }),
    [step2GenerationReferenceInput, step2RoleSlotValues],
  );
  const step2GeneratedBaseCards = useMemo(
    () =>
      buildStep2GeneratedFiveViewCandidates({
        projectId: projectData.projectId,
        dependencyReady: step2GenerationDependencyBridge.sharedState.status === "ready",
        generatedCharacters: step2GeneratedCharacters,
      }),
    [step2GenerationDependencyBridge, step2GeneratedCharacters, projectData.projectId, step2GeneratedCharactersKey],
  );
  // 生成卡片直接使用基础数据（无需 patches 覆盖）
  const step2GeneratedCandidateCards = step2GeneratedBaseCards;

  // 角色库弹窗过滤：排除界面上已显示的角色（生成角色 + 角色库推荐）
  const excludedSelectorIds = useMemo(() => {
    const ids = new Set<string>();
    // 排除所有显示的生成角色（candidateId 格式：generated-${libraryCharacterId} 或纯 ID）
    step2GeneratedCandidateCards.forEach((c) => {
      if (c.candidateId) {
        // 提取真实角色 ID（去除前缀）
        const realId = c.candidateId.startsWith("generated-")
          ? c.candidateId.replace("generated-", "")
          : c.candidateId;
        ids.add(realId);
      }
    });
    // 排除所有显示的角色库推荐（candidateId 格式：library-${libraryCharacterId}）
    step2LibraryCandidateCards.forEach((c) => {
      if (c.candidateId) {
        // 提取真实角色 ID（去除前缀）
        const realId = c.candidateId.startsWith("library-")
          ? c.candidateId.replace("library-", "")
          : c.candidateId;
        ids.add(realId);
      }
    });
    return ids;
  }, [step2GeneratedCandidateCards, step2LibraryCandidateCards]);
  const filteredLibrarySelectorCharacters = useMemo(
    () => librarySelectorCharacters.filter((c) => !excludedSelectorIds.has(c.id)),
    [librarySelectorCharacters, excludedSelectorIds],
  );

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
      // 使用 candidateId（角色ID）作为 key
      const cardKey = card.candidateId!;
      const runtimeMeta = step2V2CandidateRuntimeMeta[cardKey];
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
        runtimeMetaById[cardKey] = {
          startedAtMs,
          backendProgressPercent:
            resolveStep2AllInOneSimulatedPercent({
              nowMs: step2RuntimeClockMs,
              startedAtMs,
              estimatedDurationMs: step2AllInOneEstimatedDurationMs,
            }) ?? cardProgressPercent,
        };
        continue;
      }
      runtimeMetaById[cardKey] = {
        startedAtMs: runtimeMeta?.startedAtMs ?? null,
        backendProgressPercent: normalizedBackendPercent ?? cardProgressPercent,
      };
    }
    return runtimeMetaById;
  }, [
    step2AllInOneEstimatedDurationMs,
    step2GeneratedCandidateCards,
    step2RuntimeClockMs,
    step2V2CandidateRuntimeMeta,
  ]);


  // 恢复正在生成中的状态（页面刷新后从任务队列恢复）
  useEffect(() => {
    const effectiveProjectId = urlProjectId || projectData.projectId;
    if (!effectiveProjectId || !globalTaskQueueInitialized) return;

    // 查找当前项目的 running/pending step2_five_view 任务
    const runningTasks = globalTaskQueue.filter(
      (t) => t.type === GlobalTaskType.STEP2_FIVE_VIEW && t.projectId === effectiveProjectId && (t.status === TaskStatus.PENDING || t.status === TaskStatus.RUNNING)
    );

    if (runningTasks.length === 0) return;

    console.log("[Step2Restore] 恢复正在生成中的状态，任务数量:", runningTasks.length);

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
          const simulatedProgress = resolveStep2AllInOneSimulatedPercent({
            nowMs: Date.now(),
            startedAtMs: task.createdAt,
            estimatedDurationMs: step2AllInOneEstimatedDurationMs,
          });

          setStep2V2CandidateRuntimeMeta((current) => ({
            ...current,
            [cardKey]: {
              startedAtMs: task.createdAt,
              // 不设 backendProgressPercent，让模拟进度分支基于 startedAtMs 实时计算
              backendProgressPercent: null,
            },
          }));

          console.log("[Step2Restore] 恢复角色生成状态:", {
            candidateId,
            slot: input.slot,
            progress: simulatedProgress,
          });
        }

        // 如果有 slot，可以恢复对应的槽位状态（如果有 UI 需求）
        if (input.slot && !input.characterId) {
          console.log("[Step2Restore] 新建角色任务，slot:", input.slot);
        }
      } catch (err) {
        console.error("[Step2Restore] 解析任务 input 失败:", err);
      }
    }
  }, [urlProjectId, projectData.projectId, globalTaskQueueInitialized, globalTaskQueue, step2AllInOneEstimatedDurationMs]);

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
  const hasStartedStyledGeneration = false; // Removed field, always false
  const step2ControllerState = useMemo(
    () =>
      resolveStep2CharacterSelectionControllerState({
        step2GeneratedCandidateCards,
        step2LibraryCandidateCards: step2LibraryDisplayCards,
        step2V2ActivePreviewSource,
        step2V2ActiveGeneratedCandidateId,
        step2V2ActiveLibraryCandidateId,
        confirmedCandidateId: selectedCharacterId,
        selectedCharacterId,
        hasStartedStyledGeneration: false,
        isGeneratingPreview: step2V2Generating,
      }),
    [
      step2V2ActiveGeneratedCandidateId,
      step2V2ActiveLibraryCandidateId,
      step2V2ActivePreviewSource,
      selectedCharacterId,
      step2GeneratedCandidateCards,
      step2LibraryDisplayCards,
    ],
  );
  const {
    step2V2AllCandidates,
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
    // candidateId 格式：generated-{libraryCharacterId} 或 library-{item.id}
    return step2V2AllCandidates.find((card) => card.candidateId === confirmedCandidateId) ?? null;
  }, [step2Step3GateState.confirmedCandidateId, step2V2AllCandidates]);
  const confirmedStep2CandidateHasImage = resolveStep2CandidateHasImage(confirmedStep2Candidate);
  // 按钮禁用逻辑：项目状态 >= CHARACTER_SELECTED 时可直接进入下一步
  // 否则需要选中角色且有图片
  const effectiveProjectStatus = projectData.projectStatus;
  const isCharacterSelectedStatus = effectiveProjectStatus === "CHARACTER_SELECTED" ||
    effectiveProjectStatus === "CHARACTER_CONFIRMED" ||
    effectiveProjectStatus === "SCRIPT_GENERATED" ||
    effectiveProjectStatus === "SCRIPT_SELECTED" ||
    effectiveProjectStatus === "SCRIPT_CONFIRMED" ||
    effectiveProjectStatus === "STORYBOARDING" ||
    effectiveProjectStatus === "STORYBOARD_PREVIEW_COMPLETED" ||
    effectiveProjectStatus === "FILMING" ||
    effectiveProjectStatus === "CLIPS_READY" ||
    effectiveProjectStatus === "FISSIONING" ||
    effectiveProjectStatus === "READY_TO_PUBLISH" ||
    effectiveProjectStatus === "PUBLISHED";
  const step2NextDisabledWithImageGate = step2Locked ? false : (isCharacterSelectedStatus ? false : (step2NextDisabled || !confirmedStep2CandidateHasImage));
  const step2StatusTextWithImageGate =
    step2Step3GateState.confirmedCandidateId && !confirmedStep2CandidateHasImage
      ? "已选角色缺少图片"
      : step2StatusText;

  // 角色库上传角色保存回调
  const handleCreateCharacterSave = async (character: Character, skipGeneration?: boolean) => {
    if (!token) return;

    // 标记为新上传角色，持续显示直到页面刷新
    setNewlyUploadedCharacterId(character.id);

    // 自动选中新上传的角色并打开预览面板
    setStep2V2ActivePreviewSource("library");
    setStep2V2ActiveLibraryCandidateId(character.id);

    // 刷新角色库列表（弹窗内已完成五视图生成，直接刷新即可）
    await refetchLibraryCharacters();

    // 将新角色关联到项目
    if (projectData.projectId) {
      try {
        console.log('[CharacterSelection] addCharacter:', { projectId: projectData.projectId, libraryCharacterId: character.id });
        const result = await addCharacter(character.id);
        if (result.success && result.item) {
          const projectChar = result.item as { id: string; character?: { id: string } };
          console.log('[CharacterSelection] selectCharacter:', { characterId: projectChar.id });
          await selectCharacter(projectChar.id);
          updateProjectData({ selectedCharacterId: projectChar.character?.id ?? character.id, projectStatus: "CHARACTER_SELECTED" });
        }
      } catch (e) {
        console.error('[CharacterSelection] 项目关联失败:', e);
      }
      console.log('[CharacterSelection] refreshCharacters done');
    }

    setFeedback(`角色「${character.name}」已上传成功，已自动设为当前角色。`);

    // 如果跳过五视图生成（弹窗内已完成），则不需要再次调用
    if (skipGeneration) return;

    try {
      useAppStore.getState().showGlobalLoading();
      await backendApi.generateCharacterFiveView(token, character.id, {
        projectId: projectData.projectId ?? undefined,
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "五视图生成失败，角色已创建";
      setFeedback(message);
    } finally {
      useAppStore.getState().hideGlobalLoading();
    }
  };

  // 从角色库选择器中选择角色
  const handleSelectFromLibrary = useCallback(async (character: CharacterLibrarySelectorItem) => {
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

    // 同步选中角色到后端（项目角色表 + 项目表）
    // 从角色库选入的角色：sourceType=library, generationSlot=5
    if (token && projectData.projectId) {
      try {
        const result = await addCharacter(character.id, { sourceType: "library", generationSlot: 5 });
        if (result.success && result.item) {
          const projectChar = result.item as { id: string; character?: { id: string }; libraryCharacterId?: string };
          // 使用 libraryCharacterId 调用 selectCharacter（后端期望 library-{id} 格式或纯 libraryCharacterId）
          const libraryCharId = projectChar.libraryCharacterId ?? projectChar.character?.id ?? character.id;
          await selectCharacter(`library-${libraryCharId}`);
          updateProjectData({ selectedCharacterId: libraryCharId, projectStatus: "CHARACTER_SELECTED" });
          // 刷新角色列表（更新 isSelected 状态）
          void refreshCharacters();
        }
      } catch {
        // 后端同步失败不影响前端当前操作
      }
    }
  }, [addCharacter, selectCharacter, refreshCharacters, token, projectData.projectId, updateProjectData]);

  const handleToggleConfirmModel = async (checked: boolean) => {
    if (!token || !projectData.projectId) return;

    const confirmedCandidateId = null; // Removed field step2V2ConfirmedCandidateId
    const currentStatus = projectData.projectStatus as string;
    if (checked) {
      updateProjectData({ projectStatus: "CHARACTER_CONFIRMED" });
      void backendApi.step2Confirm(token, projectData.projectId, { confirmed: true, confirmedCandidateId });
    } else if (currentStatus === "CHARACTER_CONFIRMED") {
      // 取消确认：只有在 CHARACTER_CONFIRMED 状态才允许回退
      // 后端 API 会检查状态，但前端乐观更新也需要保护
      const statusIndex = VIDEO_PROJECT_STATUS_ORDER.indexOf(currentStatus as VideoProjectStatus);
      const characterConfirmedIndex = VIDEO_PROJECT_STATUS_ORDER.indexOf("CHARACTER_CONFIRMED");
      if (statusIndex >= 0 && statusIndex <= characterConfirmedIndex) {
        updateProjectData({ projectStatus: "DRAFT" });
      }
      void backendApi.step2Confirm(token, projectData.projectId, { confirmed: false, confirmedCandidateId });
    }
  };

  const handleOptimizeOutfitReferencePrompt = async () => {
    if (!token || !projectData.projectId) {
      setFeedback("请先完成项目创建与搭配确认。");
      return;
    }
    const draft = outfitReferencePromptDraft.trim();
    if (!draft) {
      setFeedback("请先填写服装参考提示词。");
      return;
    }
    try {
      setOptimizingOutfitReferencePrompt(true);
      setFeedback(null);
      const result = await backendApi.optimizeOutfitAnalysis(token, projectData.projectId, {
        analysis: draft,
        currentPrompt: draft,
      });
      const optimized = (result.prompt || "").trim();
      if (!optimized) {
        throw new Error("模型返回为空，无法覆盖当前提示词");
      }
      setOutfitReferencePromptDraft(optimized);
      // Removed updateWorkflow call with outfitSummary
      setFeedback(
        optimized === draft
          ? "服装参考提示词未变化（请检查路由模型）。"
          : "服装参考提示词已优化。",
      );
    } catch (error) {
      const message = error instanceof ApiError || error instanceof Error ? error.message : "提示词优化失败";
      setFeedback(message);
    } finally {
      setOptimizingOutfitReferencePrompt(false);
    }
  };

  useEffect(() => {
    if (step2V2ActivePreviewSource === "generated") {
      if (!step2V2ActiveGeneratedCandidateId) {
        return;
      }
      const exists = step2GeneratedCandidateCards.some(
        (card) => card.candidateId === step2V2ActiveGeneratedCandidateId
      );
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
      const exists = step2LibraryDisplayCards.some((card) => card.candidateId === step2V2ActiveLibraryCandidateId);
      if (!exists) {
        setStep2V2ActiveLibraryCandidateId(null);
        setStep2V2ActivePreviewSource(null);
        setStep2V2PromptDraft("");
      }
    }
  }, [
    step2GeneratedCandidateCards,
    step2LibraryDisplayCards,
    step2V2ActiveGeneratedCandidateId,
    step2V2ActiveLibraryCandidateId,
    step2V2ActivePreviewSource,
  ]);

  const handleOpenStep2V2CandidatePanel = (
    sourceType: "generated" | "library",
    candidate: Step2FiveViewCandidateCard,
  ) => {
    // candidateId 格式：generated-{libraryCharacterId} 或 library-{item.id}
    const cardKey = candidate.candidateId ?? "";
    // 始终同步活跃状态，保证两个区域的选中互斥
    setStep2V2ActivePreviewSource(sourceType);
    if (sourceType === "generated") {
      setStep2V2ActiveGeneratedCandidateId(cardKey);
      setStep2V2ActiveLibraryCandidateId(null);
    } else {
      setStep2V2ActiveLibraryCandidateId(cardKey);
      setStep2V2ActiveGeneratedCandidateId(null);
    }
    setStep2V2PromptDraft("");
    const hasCandidateImage = resolveStep2CandidateHasImage(candidate);
    // 根据 candidateId 提取真实的 libraryCharacterId
    // generated-{libraryCharacterId} -> libraryCharacterId
    // library-{item.id} -> item.id
    const rawCandidateId = candidate.candidateId ?? "";
    const backendCharacterId = rawCandidateId.startsWith("generated-")
      ? rawCandidateId.replace("generated-", "")
      : rawCandidateId.startsWith("library-")
        ? rawCandidateId.replace("library-", "")
        : rawCandidateId;
    const isRealCharacterId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(backendCharacterId);
    if (hasCandidateImage && token && projectData.projectId && isRealCharacterId && backendCharacterId) {
      void selectCharacter(backendCharacterId)
        .then(() => void refreshCharacters())
        .catch(() => undefined);
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
    // 只在角色真正成功过（有五视图图片）时才返回 ID，否则走创建流程
    const readyPreset = presets.find((item) => item.status === "ready" && item.fiveViewOssImageUrl);
    if (readyPreset) {
      return readyPreset.id;
    }
    return null;
  };

  const updateStep2V2GeneratedCandidateUrl = (order: 1 | 2 | 3, imageUrl: string) => {
    // Removed function body - step2V2GeneratedCandidateUrls field removed
  };

  // Hydration: 从 per-candidate Map 恢复每个卡位的状态
  useEffect(() => {
    // persistedBackgroundTasks is always empty after refactor
  }, []);

  // 从项目角色（/characters 接口）填充已有的五视图
  // 仅在首次检测到生成角色数据时填充，避免从角色库选入时覆盖生成角色区状态
  const step2GeneratedHydratedRef = useRef(false);
  useEffect(() => {
    if (!projectData.projectId || !projectCharactersResp) return;

    // 取 sourceType=generated 且 generation_slot 1-3 的角色（生成角色区）
    // 包含 processing 状态的角色（正在生成中）和 ready 状态的角色（已完成）
    const mainChars = (projectCharactersResp.items ?? [])
      .filter((item) =>
        item.sourceType === "generated" &&
        item.role === "main" &&
        typeof item.generationSlot === "number" &&
        item.generationSlot >= 1 &&
        item.generationSlot <= 3
      )
      .sort((a, b) => {
        const slotA = a.generationSlot ?? 999;
        const slotB = b.generationSlot ?? 999;
        if (slotA !== slotB) return slotA - slotB;
        return b.createdAt - a.createdAt;
      })
      .slice(0, 3);

    // 转换为 ProjectCharacterItem 格式
    const generatedCharacters: ProjectCharacterItem[] = mainChars.map((item) => ({
      id: item.id,
      projectId: item.projectId,
      libraryCharacterId: item.libraryCharacterId,
      role: item.role,
      sourceType: item.sourceType,
      isSelected: item.isSelected,
      generationSlot: item.generationSlot,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      character: item.character ? {
        id: item.character.id,
        name: item.character.name,
        thumbnailUrl: item.character.thumbnailUrl ?? "",
        fiveViewOssImageUrl: item.character.fiveViewOssImageUrl ?? null,
        tags: item.character.tags ?? [],
        kind: item.character.kind ?? "image",
        status: item.character.status ?? "",
        views: item.character.views ?? [],
      } : null,
    }));

    // 直接更新 workflow，不需要 patches 中间层
    if (generatedCharacters.length > 0) {
      if (projectFlowKind === "image") {
        setImageCharacters(generatedCharacters);
      } else {
        setVideoCharacters(generatedCharacters);
      }
    }
  }, [projectData.projectId, projectCharactersResp, setImageCharacters, setVideoCharacters, projectFlowKind]);

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

    // ===== 积分余额预检查 =====
    const age = Number(projectData.selectedRoleDirection?.age) || null;
    const requiredAmount = selectCreditCostByAge(
      age,
      creditPricing.step2FiveViewChildCost,
      creditPricing.step2FiveViewAdultCost,
    );

    try {
      const { sufficient, balance } = await checkCreditsBalance(token, requiredAmount);
      if (!sufficient) {
        step2V2CandidateInFlightRef.current.delete(candidateId);
        setFeedback(`积分不足，当前余额 ${balance}，需要 ${requiredAmount}，请先充值或联系管理员。`);
        return false;
      }
    } catch (error) {
      step2V2CandidateInFlightRef.current.delete(candidateId);
      setFeedback(resolveProjectFlowCreditSpendErrorMessage(error, "积分余额检查失败，请稍后重试。"));
      return false;
    }

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
      setFeedback("固定模板提示词尚未就绪，请返回上一步确认角色设定。");
      return false;
    }

    // candidateId 格式：generated-{libraryCharacterId} 或 library-{item.id}
    // 需要提取真实的 libraryCharacterId 作为 baseCharacterId
    const rawCandidateId = candidateId;
    const extractedCharacterId = rawCandidateId.startsWith("generated-")
      ? rawCandidateId.slice(10)
      : rawCandidateId.startsWith("library-")
        ? rawCandidateId.slice(8)
        : rawCandidateId;

    let baseCharacterId: string | null = extractedCharacterId;
    if (!baseCharacterId) {
      baseCharacterId = resolveStep2V2BaseCharacterId();
    }
    if (!baseCharacterId && activePreset) {
      baseCharacterId = activePreset.id;
    }
    // 从 per-candidate Map 中恢复该卡位的历史任务状态
    const recoveredTask = getBackgroundTaskForCandidate(persistedBackgroundTasks as Record<string, BackgroundGenerationTaskState>, candidateId);
    const startedAtMs =
      recoveredTask?.startedAt
        ? recoveredTask.startedAt
        : Date.now();
    const backgroundTaskId =
      recoveredTask?.taskId
        ? recoveredTask.taskId
        : buildStep2V2BackgroundTaskId(candidateId);
    setStep2V2CandidateRuntimeMeta((current) => ({
      ...current,
      [candidateId]: {
        startedAtMs,
        backendProgressPercent: 1, // 重试时显示 loading
      },
    }));
    updateProjectData({ selectedCharacterId: baseCharacterId });
    setStep2RoleSlotValues(step2RoleSlotValues);
    // 重试时先清除该 slot 的旧角色数据，生成完成后重新写入
    if (baseCharacterId && effectiveSlot) {
      const existingChars = (step2GeneratedCharacters ?? []).filter((c) => c.generationSlot !== effectiveSlot);
      if (projectFlowKind === "image") {
        setImageCharacters(existingChars);
      } else {
        setVideoCharacters(existingChars);
      }
    }
    markBackgroundTaskRunning(candidateId, {
      taskId: backgroundTaskId,
      progress: Math.max(1, recoveredTask?.progress ?? 1),
      startedAt: startedAtMs,
      resultRefs: [candidateId],
    });

    try {
      useAppStore.getState().showGlobalLoading();

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

      // 标记任务已启动（只更新 runtimeMeta，状态由 workflow 角色 status 决定）
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
      // 立即刷新 workflow 数据，获取最新的 character.status（processing）
      void refreshCharacters();
      setFeedback(result.message || "五视图生成任务已启动，请稍候...");
      return false; // 返回 false 表示任务仍在进行中，前端需要继续轮询
    } catch (error) {
      // 任务失败，刷新角色数据获取最新状态
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
      useAppStore.getState().hideGlobalLoading();
      step2V2CandidateInFlightRef.current.delete(candidateId);
    }
  };

  const handleStep2V2BatchGenerate = async () => {
    if (step2V2Generating) {
      return;
    }
    setStep2V2Generating(true);
    setStep2V2PendingCandidateId(null);
    setFeedback(null);
    const generatedRows = step2GeneratedCandidateCards.slice(0, 3);
    const pendingRows = generatedRows.filter((card) => !resolveStep2CandidateHasImage(card));
    if (pendingRows.length < 1) {
      setStep2V2Generating(false);
      setFeedback("3 个生成位已全部完成，如需刷新请使用单卡重试。");
      return;
    }

    // 提取待生成的槽位列表
    const pendingSlots = pendingRows.map((card) => card.displayOrder).filter((slot): slot is number => typeof slot === "number");

    const nowMs = Date.now();

    try {
      useAppStore.getState().showGlobalLoading();

      // 调用批量生成 API（创建父任务 + 多个子任务）
      // API 会立即返回三个空角色（有角色ID），用于设置 patches
      const result = await batchGenerateFiveViewCharacters({
        projectId: projectData.projectId!,
        slots: pendingSlots,
      });

      if (!result.success || !result.jobId) {
        throw new Error(result.message || "批量生成失败");
      }

      // 立即更新 step2GeneratedCharacters（使用 ProjectCharacterItem 格式）
      // 必须先更新角色列表，让卡片的 candidateId 有值，然后再设置 patches
      const now = Date.now();
      const newGeneratedCharacters: ProjectCharacterItem[] = (result.children ?? []).map((child) => ({
        id: `${now}-${child.slot}`,
        projectId: projectData.projectId!,
        libraryCharacterId: child.character.id,
        role: "main" as const,
        sourceType: "generated" as const,
        isSelected: true,
        generationSlot: child.slot,
        createdAt: now,
        updatedAt: now,
        character: {
          id: child.character.id,
          name: child.character.name,
          thumbnailUrl: child.character.thumbnailUrl ?? "",
          fiveViewOssImageUrl: child.character.fiveViewOssImageUrl ?? null,
          tags: [],
          kind: "image" as const,
          status: child.character.status,
          views: [],
        },
      }));
      // 合并到现有角色列表（替换相同 slot 的角色）
      const existingChars = (step2GeneratedCharacters ?? []).filter(
        (c) => !newGeneratedCharacters.some((n) => n.generationSlot === c.generationSlot)
      );
      const allGeneratedChars = [...existingChars, ...newGeneratedCharacters];
      if (projectFlowKind === "image") {
        setImageCharacters(allGeneratedChars);
      } else {
        setVideoCharacters(allGeneratedChars);
      }

      // 设置 runtimeMeta 用于进度追踪（状态由 workflow 角色 status 决定）
      setStep2V2CandidateRuntimeMeta((current) => {
        const next: typeof current = { ...current };
        for (const child of result.children ?? []) {
          const cardKey = `generated-${child.character.id}`;
          next[cardKey] = {
            startedAtMs: nowMs,
            backendProgressPercent: 1,
          };
        }
        return next;
      });

      setFeedback(result.message || "批量五视图生成任务已启动，请稍候...");
    } catch (error) {
      const message = error instanceof ApiError || error instanceof Error ? error.message : "批量生成失败";
      setFeedback(message);
    } finally {
      useAppStore.getState().hideGlobalLoading();
      setStep2V2Generating(false);
      setStep2V2PendingCandidateId(null);
    }
  };

  const handleStep2V2RegenerateCandidate = async (
    _displayOrder: number,
    candidateId?: string | null,
    promptOverride?: string
  ) => {
    if (step2V2Generating) {
      return;
    }
    const confirmed = await confirm("确定要重新生成吗？将扣除相应积分。", "重新生成");
    if (!confirmed) return;
    // 余额预检查（使用年龄分流定价）
    try {
      const age = Number(projectData.selectedRoleDirection?.age) || null;
      const requiredAmount = selectCreditCostByAge(
        age,
        creditPricing.step2FiveViewChildCost,
        creditPricing.step2FiveViewAdultCost,
      );
      const { sufficient, balance } = await checkCreditsBalance(token, requiredAmount);
      if (!sufficient) {
        setFeedback(`积分不足，当前余额 ${balance}，需要 ${requiredAmount}，请先充值或联系管理员。`);
        return;
      }
    } catch (error) {
      setFeedback(resolveProjectFlowCreditSpendErrorMessage(error, "积分余额检查失败，请稍后重试。"));
      return;
    }
    // candidateId 格式：generated-{libraryCharacterId} 或 library-{item.id}
    const targetCandidateId = candidateId ?? "";
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

    // 锁定状态：直接进入下一步，不弹出确认框
    if (step2Locked) {
      navigate(buildFlow41CanonicalRoute(3, projectData.projectId));
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

    // 确认框
    const confirmed = await confirm("确认后将进入脚本生成环节，角色定妆将锁定不可修改。是否确认？", "确认角色定妆");
    if (!confirmed) return;

    const directEnterResult = resolveStep2RoleConfirmDirectEnter(confirmedCandidateId);
    setEnteringStep3(true);
    try {
      const confirmedCandId = directEnterResult.confirmedCandidateId || null;
      if (projectFlowKind === "image") {
        const nextImageProjectPatch = buildStep2ImageProjectCompletionPatch({
          confirmedCandidateId: confirmedCandId,
        });
        setImageProjectPatch(nextImageProjectPatch);
        updateProjectData({ projectStatus: "CHARACTER_CONFIRMED" });
        void backendApi.step2Confirm(token!, projectData.projectId!, { confirmed: true, confirmedCandidateId: confirmedCandId! });

        setFeedback(resolveStep2FooterFeedback(projectFlowKind));
        navigate(resolveStep2FooterTargetRoute(projectFlowKind, projectData.projectId));
        return;
      }
      updateProjectData({ projectStatus: "CHARACTER_CONFIRMED" });
      void backendApi.step2Confirm(token!, projectData.projectId!, { confirmed: true, confirmedCandidateId: confirmedCandId! });

      setFeedback(directEnterResult.feedbackMessage);
      navigate(buildFlow41CanonicalRoute(3, projectData.projectId));
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "进入 Step3 前导入已确认角色失败";
      setFeedback(message);
    } finally {
      setEnteringStep3(false);
    }
  };

  const handleOpenPreviewForGeneration = useCallback(() => {
    void (async () => {
      if (!step2InitialGenerateCreditCharged) {
        try {
          if (!token) {
            throw new Error("登录状态已失效，请重新登录后重试。");
          }
          const latestPricing = normalizeProjectFlowCreditPricing(await backendApi.creditPricing(token));
          setCreditPricing(latestPricing);
        } catch (error) {
          setFeedback(
            resolveProjectFlowCreditSpendErrorMessage(error, "积分参数读取失败，请稍后重试后再执行定妆生成。"),
          );
          return;
        }
        // 余额预检查（使用年龄分流定价）
        try {
          const age = Number(projectData.selectedRoleDirection?.age) || null;
          const requiredAmount = selectCreditCostByAge(
            age,
            creditPricing.step2FiveViewChildCost,
            creditPricing.step2FiveViewAdultCost,
          );
          const { sufficient, balance } = await checkCreditsBalance(token, requiredAmount);
          if (!sufficient) {
            setFeedback(`积分不足，当前余额 ${balance}，需要 ${requiredAmount}，请先充值或联系管理员。`);
            return;
          }
        } catch (error) {
          setFeedback(resolveProjectFlowCreditSpendErrorMessage(error, "积分余额检查失败，请稍后重试。"));
          return;
        }
      }
      await handleStep2V2BatchGenerate();
      // 积分扣减：生成成功后扣减
      if (!step2InitialGenerateCreditCharged) {
        try {
          // 根据角色年龄选择RouteKey
          const age = step1SelectedRoleDirection?.age;
          const isChild = age != null && age <= 17;
          const routeKey = isChild ? "step2_five_view_generation_child" : "step2_five_view_generation_adult";
          await spendProjectFlowCredits({
            token,
            routeKey,
            operation: "single_image",
            reason: "step2_batch_generate",
            projectId: urlProjectId,
          });
        } catch (error) {
          setFeedback(resolveProjectFlowCreditSpendErrorMessage(error, "定妆已生成，但积分扣费失败，请联系管理员。"));
        }
      }
    })();
  }, [
    handleStep2V2BatchGenerate,
    step2BatchGenerateCreditCost,
    step2GeneratedCandidateCards,
    token,
    updateProjectData,
  ]);

  const triggerBatchGenerate = useCallback((projectId: string) => {
    void (async () => {
      const nowMs = Date.now();
      try {
        useAppStore.getState().showGlobalLoading();
        setStep2V2Generating(true);

        const result = await batchGenerateFiveViewCharacters({
          projectId,
          slots: [1, 2, 3],
        });

        if (!result.success || !result.jobId) {
          console.error("批量生成失败:", result.message);
          setFeedback(result.message || "批量生成失败");
          return;
        }

        setStep2V2CandidateRuntimeMeta((current) => {
          const next: typeof current = { ...current };
          for (const child of result.children ?? []) {
            const cardKey = `generated-${child.character.id}`;
            next[cardKey] = {
              startedAtMs: nowMs,
              backendProgressPercent: 1,
            };
          }
          return next;
        });

        setFeedback("五视图生成任务已启动，请稍候...");
      } catch (err) {
        console.error("批量生成异常:", err);
        setFeedback(err instanceof Error ? err.message : "批量生成失败");
      } finally {
        useAppStore.getState().hideGlobalLoading();
        setStep2V2Generating(false);
      }
    })();
  }, [batchGenerateFiveViewCharacters, setStep2V2Generating, setStep2V2CandidateRuntimeMeta, setFeedback]);

  const triggerSingleRetry = useCallback((item: ProjectCharacterItem) => {
    if (!item.character?.id || !item.generationSlot) return;
    const nowMs = Date.now();
    const characterId = item.character.id;
    void (async () => {
      // ===== 积分余额预检查 =====
      const age = Number(projectData.selectedRoleDirection?.age) || null;
      const requiredAmount = selectCreditCostByAge(
        age,
        creditPricing.step2FiveViewChildCost,
        creditPricing.step2FiveViewAdultCost,
      );

      try {
        const { sufficient, balance } = await checkCreditsBalance(token, requiredAmount);
        if (!sufficient) {
          setFeedback(`积分不足，当前余额 ${balance}，需要 ${requiredAmount}，请先充值或联系管理员。`);
          return;
        }
      } catch (error) {
        setFeedback(resolveProjectFlowCreditSpendErrorMessage(error, "积分余额检查失败，请稍后重试。"));
        return;
      }

      try {
        const result = await generateFiveViewCharacter({
          baseCharacterId: characterId,
          projectId: projectData.projectId!,
          generationSlot: item.generationSlot,
        });

        if (!result.success || !result.jobId) {
          console.error("单角色重试失败:", result.message);
          return;
        }

        const cardKey = `generated-${characterId}`;
        setStep2V2CandidateRuntimeMeta((current) => ({
          ...current,
          [cardKey]: { startedAtMs: nowMs, backendProgressPercent: 1 },
        }));
      } catch (err) {
        console.error("单角色重试异常:", err);
      }
    })();
  }, [generateFiveViewCharacter, projectData.projectId, setStep2V2CandidateRuntimeMeta, token, creditPricing, projectData.selectedRoleDirection]);

  // 进入 Step2 时自动触发五视图生成
  useEffect(() => {
    const projectId = typeof projectData.projectId === "string" ? projectData.projectId.trim() : "";
    const currentStatus = projectData.projectStatus;

    if (!projectId || !currentStatus) {
      console.log("[Step2AutoTrigger] skip: no projectId or status", { projectId, currentStatus });
      return;
    }
    // 等待全局任务队列加载完成（防止刷新时空数组误判）
    if (!globalTaskQueueInitialized) {
      console.log("[Step2AutoTrigger] skip: globalTaskQueue not initialized");
      return;
    }
    // 只在项目状态为刚从 Step1 进入时触发
    const isJustEnteredStep2 =
      currentStatus === "OUTFIT_CONFIRMED" ||
      currentStatus === "IMAGE_OUTFIT_CONFIRMED";
    if (!isJustEnteredStep2) {
      console.log("[Step2AutoTrigger] skip: status not OUTFIT_CONFIRMED", { currentStatus });
      return;
    }
    // 防止重复触发
    if (step2AutoEnterProjectIdRef.current === projectId) {
      console.log("[Step2AutoTrigger] skip: already triggered for", projectId);
      return;
    }
    // 当前无正在进行的生成任务
    if (step2V2Generating || step2V2PendingCandidateId) {
      console.log("[Step2AutoTrigger] skip: generating", { step2V2Generating, step2V2PendingCandidateId });
      return;
    }
    // 没有正在运行的五视图任务（队列已加载完成）
    const hasRunningFiveViewTask = globalTaskQueue.some(
      (t) => t.type === GlobalTaskType.STEP2_FIVE_VIEW && t.projectId === projectId && (t.status === TaskStatus.PENDING || t.status === TaskStatus.RUNNING)
    );
    if (hasRunningFiveViewTask) {
      console.log("[Step2AutoTrigger] skip: running five view task exists");
      return;
    }
    // 根据已有角色状态决定触发策略
    const generatedChars = (workflow.videoProjectGeneratedCharacters || workflow.imageProjectGeneratedCharacters || []) as ProjectCharacterItem[];

    if (generatedChars.length === 0) {
      // 无角色 → 首次批量触发
      console.log("[Step2AutoTrigger] no characters, triggering batch generate");
      step2AutoEnterProjectIdRef.current = projectId;
      void triggerBatchGenerate(projectId);
    } else {
      // 有角色 → 分类统计
      const hasProcessing = generatedChars.some(
        (item) => item.character?.status === "processing" || item.character?.activeFiveViewStatus === "processing"
      );
      if (hasProcessing) {
        console.log("[Step2AutoTrigger] skip: characters still processing");
        return;
      }

      const failedChars = generatedChars.filter(
        (item) => item.character && (item.character.status === "failed" || item.character.activeFiveViewStatus === "failed")
      );
      const allFailed = generatedChars.length > 0 && failedChars.length === generatedChars.length;

      if (failedChars.length === 0) {
        console.log("[Step2AutoTrigger] skip: all characters ready");
        return;
      }

      step2AutoEnterProjectIdRef.current = projectId;

      if (allFailed) {
        // 全部 failed → 批量重新触发
        console.log("[Step2AutoTrigger] all failed, triggering batch retry");
        void triggerBatchGenerate(projectId);
      } else {
        // 部分 failed → 单独重试 failed 的
        console.log("[Step2AutoTrigger] partial failed, retrying", failedChars.length, "characters");
        for (const item of failedChars) {
          void triggerSingleRetry(item);
        }
      }
    }
  }, [
    batchGenerateFiveViewCharacters,
    step2V2Generating,
    step2V2PendingCandidateId,
    projectData.projectId,
    projectData.projectStatus,
    globalTaskQueue,
    globalTaskQueueInitialized,
    workflow.videoProjectGeneratedCharacters,
    workflow.imageProjectGeneratedCharacters,
  ]);

  const step2LeftPanelMasterPromptEditor = buildStep2LeftPanelMasterPromptEditorView();

  // 数据加载中，显示全屏 loading
  if (isInitialLoading) {
    return <FullScreenLoading />;
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 overflow-hidden">
      <MobileConfigDrawer isOpen={showMobileConfig} onClose={() => setShowMobileConfig(false)}>
        <div className="space-y-4 px-4 pb-6">
          {/* 服饰参考图 */}
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-semibold text-gray-800">{step2LeftPanelMasterPromptEditor.referenceTitle}</div>
            {outfitReferenceItems.length < 1 ? (
              <div className="rounded border border-dashed border-gray-300 px-3 py-4 text-xs text-gray-400">暂无服装参考图。</div>
            ) : (
              <div className="flex gap-2 justify-center items-start">
                {outfitReferenceItems.map((item) => (
                  <div key={`step2-mobile-outfit-${item.category}`} className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50 cursor-pointer flex-1 min-w-0">
                    <div>
                      <img src={getOssThumbnailUrl(item.imageUrl as string, 300)} alt={item.label} className="h-auto w-full object-contain"  loading="lazy" />
                    </div>
                    <div className="border-t border-gray-200 px-2 py-1 text-[11px] text-gray-600 truncate">{item.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 已选搭配 */}
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
                    <div key={`step2-mobile-outfit-item-${item.id}`} className="rounded-md border border-orange-200/70 bg-white px-2 py-1.5">
                      <div className="text-[11px] font-bold text-gray-900">{item.label}</div>
                      <p className="mt-0.5 text-[11px] leading-5 text-gray-600">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 已选推荐角色预设 */}
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-semibold text-gray-800">已选推荐角色预设</div>
            {step1SelectedRoleDirection && step2SelectedRoleDirectionAvatar ? (
              <div className="rounded-lg border border-orange-100 bg-orange-50/50 px-2.5 py-2">
                <div className="flex items-center gap-2.5">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-orange-100 bg-white">
                    <img src={getOssThumbnailUrl(step2SelectedRoleDirectionAvatar.imageUrl, 120)} alt={`${step1SelectedRoleDirection.styleSummary} 头像`} className="h-full w-full object-cover"  loading="lazy" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold tracking-wide text-primary">{step1SelectedRoleDirection.styleSummary}</div>
                  </div>
                </div>
                <div className="mt-2 space-y-0.5 text-[11px] leading-4 text-gray-600">
                  {step2SelectedRoleDirectionCompactLines.map((line) => (
                    <div key={`step2-mobile-role-line-${line.lineId}`} className={line.emphasis ? "font-semibold text-gray-800" : ""}>
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
        </div>
      </MobileConfigDrawer>
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
        characters={filteredLibrarySelectorCharacters}
        onSelect={handleSelectFromLibrary}
        onClose={() => setShowLibrarySelector(false)}
        selectedId={step2V2ActiveLibraryCandidateId}
        loading={loadingPresets}
      />

      <ProjectFlowHistorySidebar
        currentStep={2}
        projectId={urlProjectId ?? projectData.projectId ?? undefined}
        onImagePreview={(frames, currentIndex) => setImagePreview({ frames, currentIndex })}
      >
        {/* 反推脚本预览（从广场"投入创作"携带或后端加载） */}
        {(workflow.pendingReverseDeckScript || loadedReverseScript) && (
          <div className="p-6 pb-0">
            <PendingScriptPreviewCard script={(workflow.pendingReverseDeckScript ?? loadedReverseScript!) as Parameters<typeof PendingScriptPreviewCard>[0]["script"]} />
          </div>
        )}
      </ProjectFlowHistorySidebar>

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
                    所有人像都是经过 AI 精心设计<span className="text-gray-300"> · </span>耗时较长<span className="text-gray-300"> · </span>生成完成后点击选择即可进入脚本生成
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
                        ? `已接入固定模板提示词与已确认服装参考，已就绪 ${step2GeneratedReadyCount}/3，双击预览`
                        : step2GenerationDependencyBridge.sharedState.blockedReason ?? "等待固定模板提示词与服装参考就绪"}
                    </div>
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500 border border-gray-200">
                    3 个生成位
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {/* 渲染已有的角色卡片 */}
                  {step2GeneratedCandidateCards.map((card) => {
                    // 有角色ID时正常渲染
                    const cardKey = card.candidateId!;
                    const runtimeState = step2GeneratedRuntimeProgressBridge[cardKey];
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
                        runtimeState?.percent === null
                          ? runtimePhase === "generating"
                            ? "等待后端进度"
                            : runtimeState?.statusText ?? "待生成"
                          : `${runtimeState?.percent ?? 0}%`;
                      const hasCardImage = Boolean(card.fiveViewAssetUrl || card.closeupPreviewUrl);
                      const videoShouldAnimate = runtimePhase === "generating";
                      const shouldShowLoadingVideoFrame =
                        videoShouldAnimate || runtimePhase === "idle" || runtimePhase === "blocked";
                      const loadingVideoSrc = shouldShowLoadingVideoFrame
                        ? runtimeState?.loadingVideoSrc ?? STEP2_RUNTIME_PROGRESS_LOADING_VIDEO_SRC
                        : runtimeState?.loadingVideoSrc ?? null;
                      const loadingPosterSrc = step2LoadingPosterFrameSrc;
                      const isLocallyActive = step2V2ActivePreviewSource === "generated" &&
                          step2V2ActiveGeneratedCandidateId === cardKey;
                      const hasAnyLocalSelection = step2V2ActiveGeneratedCandidateId || step2V2ActiveLibraryCandidateId;
                      const isCardSelected =
                        isLocallyActive ||
                        (card.isSelected && !hasAnyLocalSelection) ||
                        step2Step3GateState.confirmedCandidateId === cardKey;
                      return (
                        <div key={card.candidateId}>
                          <article
                          ref={(el) => {
                            if (el) cardRefMap.current.set(cardKey, el);
                            else cardRefMap.current.delete(cardKey);
                          }}
                          data-testid={`step2-v2-generated-card-${card.displayOrder}`}
                          className={`overflow-hidden rounded-2xl border-2 bg-white shadow-sm transition-all duration-200 ${
                            !hasCardImage
                              ? "border-gray-200 opacity-60 cursor-not-allowed"
                              : isCardSelected
                                ? "border-primary shadow-md shadow-primary/15 cursor-pointer"
                                : step2Locked
                                  ? "border-gray-200 cursor-pointer"
                                  : "border-gray-200 hover:border-primary/40 hover:shadow-md cursor-pointer"
                          }`}
                          onClick={() => {
                            if (!hasCardImage) return;
                            // 锁定状态：只预览，不确认选择
                            if (step2Locked) {
                              handlePreviewStep2V2CandidateFullImage(card);
                              return;
                            }
                            // 复用 Step1 穿搭方案的 outline 光晕 + scale 脉冲（primary 品牌色）
                            const el = cardRefMap.current.get(cardKey);
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
                                  title={step2Locked ? "项目已进入下一步，不可重新生成" : retryButtonState.title}
                                  disabled={retryButtonState.disabled || step2Locked}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleStep2V2RegenerateCandidate(card.displayOrder, card.candidateId ?? null, "");
                                  }}
                                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white/95 shadow-sm transition disabled:cursor-not-allowed ${
                                    retryButtonState.disabled || step2Locked
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
                              <div className="relative aspect-[16/9] bg-gray-100 overflow-hidden">
                                <video
                                  key={`${cardKey}-loading-playing-${loadingVideoSrc}`}
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
                                aspectClass="aspect-[16/9]"
                              />
                            ) : loadingPosterSrc ? (
                              <div className="relative aspect-[16/9] bg-gray-100 overflow-hidden">
                                <img
                                  src={loadingPosterSrc}
                                  alt={`${card.title} 加载占位`}
                                  className="absolute inset-0 h-full w-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="flex h-full w-full aspect-[16/9] items-center justify-center text-gray-400">
                                <span className="material-icons-round text-3xl">hourglass_top</span>
                              </div>
                            )}
                            {card.fiveViewAssetUrl && (
                              <span className="absolute top-2 left-2 z-20 bg-black/50 text-white text-[10px] font-medium px-1.5 py-1 rounded-md flex items-center gap-1">
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                                五视图
                              </span>
                            )}
                            <div className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} left-2 bottom-2 rounded-full border border-white/70 bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-gray-700 shadow-sm`}>
                              {runtimePercentLabel}
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
                                    : runtimeState?.percent === null
                                      ? "w-full animate-pulse bg-slate-300/60"
                                      : "bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400"
                                }`}
                                style={runtimeState?.percent === null ? undefined : {
                                  width: `${runtimeState?.percent ?? 0}%`,
                                  boxShadow: runtimeState?.phase === "failed"
                                    ? "0 0 6px 1px rgba(244, 63, 94, 0.5)"
                                    : runtimeState?.percent !== null && (runtimeState?.percent ?? 0) > 0
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
                    })}
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
                  上传的角色将直接用于后续生成短视频，无需经过服饰上身预览
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
                      disabled={step2Locked}
                      onClick={() => {
                        setShowLibrarySelector(true);
                        void refetchLibraryCharacters();
                      }}
                    >
                      <span className="material-icons-round text-sm">folder_open</span>
                      从角色库选择
                    </Button>
                    <Button
                      variant="secondary"
                      className="text-xs"
                      disabled={step2Locked}
                      onClick={() => setShowCreateCharacter(true)}
                    >
                      <span className="material-icons-round text-sm mr-0.5">cloud_upload</span>
                      上传角色
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-3">
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
                      <div
                        key={card.candidateId}
                        ref={(el) => {
                          if (el) cardRefMap.current.set(card.candidateId!, el);
                          else cardRefMap.current.delete(card.candidateId!);
                        }}
                        data-testid={`step2-v2-library-card-${card.displayOrder}`}
                        className={`overflow-hidden rounded-2xl border-2 bg-white shadow-sm transition-all duration-200 ${
                          !hasCardImage
                            ? "border-gray-200 opacity-60 cursor-not-allowed"
                            : step2Locked
                              ? "border-gray-200 cursor-pointer"
                              : isCardSelected
                                ? "border-primary shadow-md shadow-primary/15 cursor-pointer"
                                : isNewlyUploaded
                                  ? "border-emerald-300 shadow-md shadow-emerald-100 cursor-pointer"
                                  : "border-gray-200 hover:border-primary/40 hover:shadow-md cursor-pointer"
                        }`}
                        onClick={() => {
                          if (!hasCardImage) return;
                          if (step2Locked) {
                            handlePreviewStep2V2CandidateFullImage(card);
                            return;
                          }
                          // 复用生成角色的 outline 光晕 + scale 脉冲（primary 品牌色）
                          const el = cardRefMap.current.get(card.candidateId!);
                          if (el) {
                            const anim = el.animate([
                              { outline: "0px solid rgba(230,140,25,0)", transform: "scale(1)", offset: 0 },
                              { outline: "8px solid rgba(230,140,25,0.35)", transform: "scale(1.04)", offset: 0.4 },
                              { outline: "0px solid rgba(230,140,25,0)", transform: "scale(1)", offset: 1 },
                            ], { duration: 480, easing: "ease-out" });
                            anim.onfinish = () => handleOpenStep2V2CandidatePanel("library", card);
                          } else {
                            handleOpenStep2V2CandidatePanel("library", card);
                          }
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
                              aspectClass="aspect-[16/9]"
                              hoverClass="group-hover:scale-105"
                            />
                          ) : (
                            <div className="relative aspect-[16/9] bg-gray-50 overflow-hidden">
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
                            <div className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} bottom-1.5 right-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-orange-500 text-white shadow-lg shadow-primary/30`}>
                              <span className="material-icons-round text-[18px] leading-none">check</span>
                            </div>
                          )}
                        </div>
                        <div className={`px-2.5 py-2 border-t ${isCardSelected ? "bg-primary border-primary/30" : "border-gray-50"}`}>
                          <div className={`text-xs font-semibold truncate ${isCardSelected ? "text-white" : "text-gray-800"}`} title={card.title}>{card.title}</div>
                        </div>
                      </div>
                    );
                  })}
                  {/* 第 5 位：有手动选入角色时显示角色卡片，否则显示添加入口 */}
                  {step2LibraryDisplayCards.length <= 4 && (
                    <button
                      type="button"
                      disabled={step2Locked}
                      onClick={() => {
                        setShowLibrarySelector(true);
                        void refetchLibraryCharacters();
                      }}
                      className="w-full group relative overflow-hidden rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50 hover:border-indigo-300 transition-all duration-200 text-center flex flex-col items-center justify-center aspect-[16/9] disabled:opacity-50 disabled:cursor-not-allowed"
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
          <Button variant="ghost" onClick={() => { const pid = projectData.projectId ?? urlProjectId; navigate(`/create/${pid}/step1`); }} className="rounded-full px-4 text-gray-500 hover:text-gray-900 whitespace-nowrap">
            <span className="material-icons-round text-lg mr-1">arrow_back</span>
            <span className="hidden md:inline">上一步</span>
          </Button>

          <div className="h-4 w-px bg-gray-200" />

          <div
            data-testid="step2-background-task-status"
            className="text-[10px] text-gray-400 font-medium px-2 whitespace-nowrap flex items-center gap-1"
          >
            {step2StatusTextWithImageGate}
          </div>

          <div className="h-4 w-px bg-gray-200" />

          <div className="pr-1">
            <Button
              onClick={() => void handleEnterStep3FromFooter()}
              disabled={step2NextDisabledWithImageGate || enteringStep3}
              className="rounded-full px-6 bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/20 whitespace-nowrap disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none transition-transform animate-pulse-scale"
            >
              <span className="hidden md:inline">{step2PrimaryActionLabels.desktop}</span>
              <span className="md:hidden">{step2PrimaryActionLabels.mobile}</span>
              <span className="material-icons-round text-lg ml-1">arrow_forward</span>
            </Button>
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

      {/* 图片预览模态框（来自 ProjectFlowHistorySidebar） */}
      {imagePreview && imagePreview.frames.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setImagePreview(null)}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 关闭按钮 */}
            <button
              className="absolute -top-10 right-0 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
              onClick={() => setImagePreview(null)}
            >
              <span className="material-icons-round text-2xl">close</span>
            </button>

            {/* 图片标题 */}
            <div className="text-center text-white/80 text-sm mb-3">
              {imagePreview.frames[imagePreview.currentIndex]?.title ?? `图片 ${imagePreview.currentIndex + 1}`}
              <span className="ml-2 text-white/60">
                ({imagePreview.currentIndex + 1} / {imagePreview.frames.length})
              </span>
            </div>

            {/* 图片容器 */}
            <div className="relative flex items-center justify-center">
              {/* 左箭头 */}
              {imagePreview.frames.length > 1 && (
                <button
                  className="absolute -left-12 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors z-10"
                  onClick={() => {
                    const newIndex = imagePreview.currentIndex > 0
                      ? imagePreview.currentIndex - 1
                      : imagePreview.frames.length - 1;
                    setImagePreview({ ...imagePreview, currentIndex: newIndex });
                  }}
                >
                  <span className="material-icons-round text-3xl">chevron_left</span>
                </button>
              )}

              {/* 图片 */}
              <img
                src={imagePreview.frames[imagePreview.currentIndex]?.imageUrl ?? ""}
                alt={imagePreview.frames[imagePreview.currentIndex]?.title ?? "预览图片"}
                className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
              />

              {/* 右箭头 */}
              {imagePreview.frames.length > 1 && (
                <button
                  className="absolute -right-12 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors z-10"
                  onClick={() => {
                    const newIndex = imagePreview.currentIndex < imagePreview.frames.length - 1
                      ? imagePreview.currentIndex + 1
                      : 0;
                    setImagePreview({ ...imagePreview, currentIndex: newIndex });
                  }}
                >
                  <span className="material-icons-round text-3xl">chevron_right</span>
                </button>
              )}
            </div>

            {/* 底部提示 */}
            <div className="text-center text-white/60 text-xs mt-3">
              使用键盘 ← → 键切换图片，ESC 键关闭
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
