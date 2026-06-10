import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from 'react-router';
import { Button } from "../../components/ui/Button";
import { GlobalProgressIndicator } from "../../components/shared/GlobalProgressIndicator";
import { AssetModal } from "../../components/shared/AssetModal";
import { LoadMoreButton } from "../../components/shared/LoadMoreButton";
import { StepContentHeader } from "../../components/project-flow";
import { SidebarPanelHeader } from "../../components/project-flow/SidebarPanelHeader";
import { useAppStore } from "../../store/useAppStore";
import { useShallow } from 'zustand/react/shallow';
import { useProjectState, getProjectState } from "../../hooks/useProjectState";
import { usePagedList } from "../../hooks/usePagedList";
import {
  ApiError,
  backendApi,
} from "../../services/backendApi";
import {
  imageStep2Api,
} from "../../services/realApi/image-step2";
import {
  buildStep1NonClothingUploadMessage,
  classifyProjectFlowUploadImage,
  shouldEnforceStep1UploadNonClothingBlock,
  shouldBlockStep1UploadByClassification,
} from "../../services/step1ClothingUploadGuard";
import {
  buildBlockedStep1ModuleMessage,
  findBlockedStep1Module,
} from "../project-flow/step1ClothingInterceptValidation";
import {
  createDefaultCharacterWorkflowSystemSettings,
  type CharacterWorkflowSystemSettings,
} from "../../../../src/contracts/character-workflow-system-settings";
import { loadStep1CharacterWorkflowSettings } from "../project-flow/step1CharacterWorkflowSettingsBridge";
import { buildOutfitReferenceSeed } from "../project-flow/outfitReferenceSeed";
import { REGION_LABEL } from "../../../../src/contracts/ethnicity-dictionary";
import type { OutfitPlanDto } from "../../../../src/contracts/outfit-plan.dto";
import {
  buildStep1JointReversePendingResult,
  isStep1PendingOutfitId,
  mapStep1JointReverseRecommendResult,
  normalizeStep1OutfitCardLimit,
  type RecommendOutfitsResponse,
  type OutfitAnalysisCardData,
} from "../project-flow/step1JointReverseService";
import {
  normalizeStep1OutfitAnalysisCard,
  type Step1OutfitAnalysisCard,
} from "../../../../src/contracts/step1-outfit-analysis-card-contract";
import {
  realGarmentAssetsApi,
  type GarmentAsset,
} from "../../services/realApi/garment-assets";
import {
  realProjectGarmentAssocApi,
} from "../../services/realApi/project-garment-assoc";
import {
  imageStep1Api,
} from "../../services/realApi/image-step1";
import {
  applyStep1AdminDebugPromptEdit,
  buildStep1RolePromptPayload,
  resolveStep1AdminDebugPrompt,
} from "../project-flow/step1HiddenPromptAdminDebug";
import {
  adaptStep1RolePresetCards,
  buildControlledRolePresetFromDirection,
  buildStep1RolePromptInputFromCard,
  resolveStep1RolePresetCardById,
} from "../../../../src/modules/step1-role-preset-adapter";
import type { Step1RoleDirectionCard } from "../../../../src/contracts/step1-joint-reverse-contract";
import {
  PROJECT_FLOW_MEDIA_CHROME_Z_CLASS,
  PROJECT_FLOW_MEDIA_HOVER_OVERLAY_Z_CLASS,
  PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS,
} from "../project-flow/projectFlowMediaLayerGuard";
import {
  confirmStep1RoleDirectionSelection,
} from "../project-flow/step1RoleDirectionDrawer";
import {
  resolveRoleDirectionAvatarRenderModel,
} from "../project-flow/step1RoleDirectionAvatarController";
import {
  buildStep1RoleDirectionSuggestions,
  resolveStep1RoleDirectionAdjustmentRemainingCount,
  type Step1RoleDirectionSuggestion,
} from "../project-flow/step1RoleDirectionSuggestionRuntime";
import { Step1RoleDirectionSuggestionPanel } from "../project-flow/step1RoleDirectionSuggestionPanel";
import {
  buildOptimisticStep1ModuleImage, patchStep1ModuleImageSlot,
} from "../project-flow/step1ModuleUploadPreviewBridge";
import { type Step1OutfitSource } from "../project-flow/step1SelectionState";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import {
  DEFAULT_PROJECT_FLOW_CREDIT_PRICING,
  loadProjectFlowCreditPricing,
} from "../project-flow/projectFlowCredit";
import {
  createEmptyStep1OutfitModule,
  normalizeStep1OutfitSubjectType,
  normalizeStep1OutfitModules,
  STEP1_OUTFIT_SUBJECT_TYPE_OPTIONS,
  type Step1OutfitModuleCategory,
  type Step1OutfitModule,
  type Step1OutfitModuleImage,
  type Step1OutfitSubjectType,
  type Step1OutfitViewLabel,
} from "../../../../src/contracts/step1-outfit-module-contract";
import type { AssetClassificationResult, ImageProjectStatus } from "../../../../src/contracts/types";
import { isImageStatusAtOrBeyond } from "../../../../src/contracts/types";
import { uploadFileToOss, deleteFileFromOss } from "../../services/ossUpload";
import { getOssThumbnailUrl } from "../../utils/ossImage";
import type { Step1LibraryCategory } from "../../../../src/contracts/step1-outfit-module-contract";
import {
  type Step1ModuleImageSlotTarget,
  STEP1_MAX_OUTFIT_MODULES,
  STEP1_MAX_OTHER_VIEWS,
  STEP1_UPLOAD_FEEDBACK_CLASSIFYING,
  STEP1_UPLOAD_FEEDBACK_SYNCING,
  STEP1_SUBJECT_TYPE_TO_CLASSIFICATION_CATEGORY,
  STEP1_MODULE_CATEGORY_LABELS,
  GARMENT_CATEGORY_LABELS,
  resolveStep1SubjectTypeFromClassificationCategory,
  normalizeToLibraryCategory,
  uniqTrimmed,
  normalizeStep1AnalysisText,
  extractStep1SubjectNameFromAnalysis,
  extractStep1SubjectDescriptionFromAnalysis,
  findStep1AnalysisCardForModule,
  fileToDataUrl,
  estimateImageSizeMbFromSourceUrl,
} from "../shared/step1-utils";
import {
  OutfitAnalysisCard,
} from "../shared/step1-shared-components";

/** 根据性别返回色块渐变色 Tailwind class */
function getGradientByGender(gender?: string | null): string {
  switch (gender) {
    case "female":
      return "from-pink-50 via-purple-50 to-blue-50";
    case "male":
      return "from-blue-50 via-cyan-50 to-green-50";
    default:
      return "from-gray-100 to-gray-50";
  }
}

function hydrateStep1ModuleSubjectsFromAnalysisCards(
  modules: Step1OutfitModule[],
  analysisCards: OutfitAnalysisCardData[],
): Step1OutfitModule[] | null {
  const readyAnalysisCards = analysisCards.filter(
    (card) => card.status !== "pending" && normalizeStep1AnalysisText(card.analysis).length > 0,
  );
  if (readyAnalysisCards.length < 1) {
    return null;
  }
  let changed = false;
  const nextModules = modules.map((module) => {
    if (!module.mainImage && module.otherViews.length < 1) {
      return module;
    }
    const hasSubjectName = module.subjectName.trim().length > 0;
    const hasSubjectDescription = module.subjectDescription.trim().length > 0;
    if (hasSubjectName && hasSubjectDescription) {
      return module;
    }
    const matchedCard = findStep1AnalysisCardForModule(module, readyAnalysisCards);
    if (!matchedCard) {
      return module;
    }
    const suggestedName = extractStep1SubjectNameFromAnalysis(matchedCard.analysis);
    const suggestedDescription = extractStep1SubjectDescriptionFromAnalysis(matchedCard.analysis);
    const nextSubjectName = hasSubjectName ? module.subjectName : suggestedName;
    const nextSubjectDescription = hasSubjectDescription ? module.subjectDescription : suggestedDescription;
    if (nextSubjectName === module.subjectName && nextSubjectDescription === module.subjectDescription) {
      return module;
    }
    changed = true;
    return {
      ...module,
      subjectName: hasSubjectName ? module.subjectName : nextSubjectName.slice(0, 20),
      subjectDescription: hasSubjectDescription ? module.subjectDescription : nextSubjectDescription.slice(0, 200),
    };
  });
  return changed ? nextModules : null;
}


/** 步骤进度卡片 — 独立组件，避免 Assets 重渲染时卸载重建内部 DOM（导致滚动重置） */
const StepProgressCard: React.FC<{
  stepNumber: number;
  title: string;
  summary: string;
  status: "completed" | "current" | "locked" | "pending";
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
  /** 可选：点击步骤头部时触发额外操作（如触发上传），返回 true 阻止默认 toggle */
  onClickHeader?: () => boolean | void;
}> = ({ stepNumber, title, summary, status, expanded, onToggle, children, onClickHeader }) => {
  const isCompleted = status === "completed";
  const isCurrent = status === "current";
  const isLocked = status === "locked";

  return (
    <div
      data-step={stepNumber}
      className={`
        rounded-xl border
        ${isCompleted ? "border-emerald-200 bg-emerald-50/50" : ""}
        ${isCurrent ? "border-primary/30 bg-primary/5 shadow-sm" : ""}
        ${isLocked ? "border-gray-200 bg-gray-50/50 opacity-60" : ""}
      `}
    >
      {/* 步骤头部 */}
      <div
        className={`
          flex items-center gap-3 px-4 py-3 cursor-pointer
          ${isLocked ? "cursor-not-allowed" : ""}
        `}
        onClick={() => {
          if (isLocked) return;
          const shouldPreventDefault = onClickHeader?.();
          if (!shouldPreventDefault) {
            onToggle();
          }
        }}
      >
        {/* 步骤徽章 */}
        <div
          className={`
            flex items-center justify-center w-6 h-6 rounded-full text-sm font-semibold
            ${isCompleted ? "bg-emerald-500 text-white" : ""}
            ${isCurrent ? "bg-primary text-white animate-pulse" : ""}
            ${isLocked ? "bg-gray-300 text-gray-500" : ""}
          `}
        >
          {isCompleted ? (
            <span className="material-icons-round text-sm">check</span>
          ) : (
            stepNumber
          )}
        </div>

        {/* 步骤标题 */}
        <div className="flex-1 min-w-0">
          <div
            className={`
              font-medium truncate
              ${isCompleted ? "text-emerald-700" : ""}
              ${isCurrent ? "text-primary" : ""}
              ${isLocked ? "text-gray-500" : ""}
            `}
          >
            {title}
          </div>
          {/* 已完成步骤显示摘要 */}
          {(isCompleted || isLocked) && summary && (
            <div className="text-xs text-gray-500 truncate mt-0.5">{summary}</div>
          )}
        </div>

        {/* 展开/折叠图标（仅已完成和当前步骤可折叠） */}
        {!isLocked && (
          <span
            className={`
              material-icons-round text-lg transition-transform
              ${expanded ? "rotate-180" : ""}
              ${isCompleted ? "text-emerald-500" : "text-primary"}
            `}
          >
            expand_more
          </span>
        )}
      </div>

      {/* 步骤内容（仅当前步骤或用户展开时显示） */}
      <div
        className={`
          grid overflow-hidden transition-all duration-500 ease-in-out
          ${expanded && !isLocked && children
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
          }
        `}
      >
        <div className="overflow-hidden">
          {expanded && !isLocked && children && (
            <div className="px-4 pb-4 pt-1">{children}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export const ImageAssets: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId: urlProjectId } = useParams<{ projectId: string }>();
  const {
    token,
    currentUser,
    showGlobalLoading,
    hideGlobalLoading,
  } = useAppStore(useShallow((state) => ({ token: state.token, currentUser: state.currentUser, showGlobalLoading: state.showGlobalLoading, hideGlobalLoading: state.hideGlobalLoading })));
  const { projectData, workflow, updateProjectData, selectOutfit, setGarmentModules, setOutfitPlans, setRoleDirectionCards, setImageSelectedRoleDirectionId, setImageSelectedOutfitId, batchUpdateWorkflow, refreshGarmentModules } = useProjectState(urlProjectId, {
    // Step1 只加载服饰相关分类，characters 在 Step2 才加载（避免 library 匹配时 selectedRoleDirection 未设置）
    loadCategories: ['garments', 'outfits', 'step1State', 'project'],
  });

  // 全局确认对话框
  const { confirm } = useConfirm();

  const generatedOutfits = (workflow.imageOutfitPlans as OutfitPlanDto[]) ?? [];
  const selectedOutfitId = workflow.imageSelectedOutfitId ? String(workflow.imageSelectedOutfitId) : null;

  // 从 workflow 读取生成状态
  const outfitRecommendationTaskStatus = (workflow.outfitRecommendationTaskStatus as string) ?? "idle";

  const roleDirectionCards = useMemo(() => {
    const raw = workflow.imageRoleDirections;
    const adapted = adaptStep1RolePresetCards(raw, "assets-project-data");
    return adapted;
  }, [workflow.imageRoleDirections]);
  const step1SelectedRoleDirectionId =
    typeof workflow.imageSelectedRoleDirectionId === "string" && workflow.imageSelectedRoleDirectionId.trim().length > 0
      ? workflow.imageSelectedRoleDirectionId.trim()
      : null;
  const isAdminUser = currentUser?.role === "admin";
  const configuredAnalysisCardCount = 3;
  const step1OutfitModules = useMemo(
    () => normalizeStep1OutfitModules(workflow.imageGarmentModules, { minModules: 1, maxModules: STEP1_MAX_OUTFIT_MODULES }),
    [workflow.imageGarmentModules],
  );

  const step1ModuleUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [step1ModuleUploadTarget, setStep1ModuleUploadTarget] = useState<Step1ModuleImageSlotTarget | null>(null);
  const [step1ModulePreview, setStep1ModulePreview] = useState<{
    url: string;
    label: string;
    target: Step1ModuleImageSlotTarget | null;
  } | null>(null);
  const [isUploadingModuleImage, setIsUploadingModuleImage] = useState(false);
  const [step1ModuleLibraryImportOpen, setStep1ModuleLibraryImportOpen] = useState(false);
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [assetModalTargetModuleId, setAssetModalTargetModuleId] = useState<string | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState(0); // 生成进度 0-95
  const [isEnteringStep2, setIsEnteringStep2] = useState(false);
  // isLoadingLibrary 和 hasLoadedLibraryOnce 状态已由 usePagedList Hook 提供
  const [isUploadingLibrary, setIsUploadingLibrary] = useState(false);
  const [apiFeedback, setApiFeedback] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [adminDebugPromptDraft, setAdminDebugPromptDraft] = useState("");
  const [creditPricing, setCreditPricing] = useState(DEFAULT_PROJECT_FLOW_CREDIT_PRICING);

  // 服饰库分页加载（使用 usePagedList Hook）
  const {
    items: garmentAssets,
    total: garmentAssetsTotal,
    hasMore: garmentAssetsHasMore,
    isLoading: isLoadingLibrary,
    isLoadingMore: isLoadingMoreLibrary,
    loadFirstPage: loadGarmentAssetsFirstPage,
    loadNextPage: loadGarmentAssetsNextPage,
    reset: resetGarmentAssets,
  } = usePagedList({
    pageSize: 20,
    autoLoad: false, // 手动触发加载
    fetcher: async ({ page, pageSize }) => {
      if (!token) {
        return { items: [], total: 0, hasMore: false };
      }
      const data = await realGarmentAssetsApi.listGarmentAssets(token, { page, pageSize });
      // 过滤：仅保留图片类型、有效分类、且有平铺图的服饰资产
      const filtered = (data.items ?? []).filter(
        (item) =>
          item.type === "image" &&
          item.flatLayImageUrl &&  // 必须有平铺图才能导入项目
          (item.category === "top" ||
            item.category === "bottom" ||
            item.category === "shoes" ||
            item.category === "accessory" ||
            item.category === "suit" ||
            item.category === "dress" ||
            item.category === "outer"),
      );
      return {
        items: filtered,
        total: data.total,
        hasMore: data.hasMore,
      };
    },
    fetcherParams: { token },
  });

  const [hasLoadedLibraryOnce, setHasLoadedLibraryOnce] = useState(false);
  const [promptDraftByPlanId, setPromptDraftByPlanId] = useState<Record<string, string>>({});
  const [, setOptimizingPlanId] = useState<string | null>(null);
  const [characterWorkflowSettings, setCharacterWorkflowSettings] = useState<CharacterWorkflowSystemSettings>(
    createDefaultCharacterWorkflowSystemSettings(),
  );
  // 角色方向生成状态
  const [roleDirectionGenerating, setRoleDirectionGenerating] = useState(false);

  // ========== GlobalTimer 集成 ==========
  const prevImageStep1LoadingCountRef = useRef(0);
  useEffect(() => {
    const shouldShowTimer = isUploadingModuleImage || isGenerating || isLoadingLibrary || isUploadingLibrary || roleDirectionGenerating;
    if (shouldShowTimer && prevImageStep1LoadingCountRef.current === 0) {
      showGlobalLoading();
    } else if (!shouldShowTimer && prevImageStep1LoadingCountRef.current > 0) {
      hideGlobalLoading();
    }
    prevImageStep1LoadingCountRef.current = shouldShowTimer ? 1 : 0;
  }, [isUploadingModuleImage, isGenerating, isLoadingLibrary, isUploadingLibrary, roleDirectionGenerating, showGlobalLoading, hideGlobalLoading]);

  // ========== 步骤锁定：使用全局 projectData.projectStatus ==========
  // 步骤锁定：状态 >= IMAGE_OUTFIT_CONFIRMED 时，Step1 只读（穿搭已确认，进入定妆阶段）
  const step1Locked = isImageStatusAtOrBeyond(
    projectData.projectStatus as ImageProjectStatus | undefined,
    "IMAGE_OUTFIT_CONFIRMED",
  );
  // 从数据库获取项目真实状态，同步到全局 projectData
  useEffect(() => {
    if (!urlProjectId || !token) return;
    backendApi.getProject(token, urlProjectId)
      .then((project: { status?: string }) => {
        if (project && typeof project.status === "string") {
          updateProjectData({ projectStatus: project.status });
        }
      })
      .catch(() => { /* 静默 */ });
  }, [urlProjectId, token, updateProjectData]);

  const [appliedSuggestionCount, setAppliedSuggestionCount] = useState(0);

  const runtimeRoleDirections = useMemo(() => {
    const cards = roleDirectionCards;
    if (appliedSuggestionCount < 1) return cards;
    return cards;
  }, [roleDirectionCards, appliedSuggestionCount]);

  const step1RoleDirectionSuggestions = useMemo(
    () => buildStep1RoleDirectionSuggestions({
      roleDirections: roleDirectionCards,
      refreshIndex: appliedSuggestionCount,
    }),
    [roleDirectionCards, appliedSuggestionCount],
  );
  const step1RoleDirectionSuggestionRemaining = resolveStep1RoleDirectionAdjustmentRemainingCount(appliedSuggestionCount);
  const step1RoleDirectionSuggestionLocked = step1RoleDirectionSuggestionRemaining < 1;
  const [roleDirectionCanScrollRight, setRoleDirectionCanScrollRight] = useState(false);
  const roleDirectionScrollRef = useRef<HTMLDivElement | null>(null);
  const step1ModuleLibraryBackfillRunningRef = useRef(false);
  const step1LeftPanelScrollRef = useRef<HTMLDivElement | null>(null);

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

  // 生成搭配时进度动画：0 → 95% 匀速递增
  useEffect(() => {
    if (!isGenerating) {
      setGenerateProgress(0);
      return;
    }
    setGenerateProgress(0);
    const interval = setInterval(() => {
      setGenerateProgress((prev) => {
        if (prev >= 95) {
          clearInterval(interval);
          return 95;
        }
        return Math.min(95, prev + 2);
      });
    }, 200);
    return () => clearInterval(interval);
  }, [isGenerating]);

  const applyStep1OutfitModules = useCallback(
    (nextModules: Step1OutfitModule[]) => {
      const normalizedModules = normalizeStep1OutfitModules(nextModules, {
        minModules: 1,
        maxModules: STEP1_MAX_OUTFIT_MODULES,
      });
      setGarmentModules(normalizedModules);
    },
    [setGarmentModules],
  );
  const readLatestStep1OutfitModules = useCallback(() => {
    const latestWorkflow = getProjectState(urlProjectId!).workflow;
    return normalizeStep1OutfitModules(latestWorkflow.imageGarmentModules, {
      minModules: 1,
      maxModules: STEP1_MAX_OUTFIT_MODULES,
    });
  }, []);
  const resolveModuleSubjectTypeByLibraryCategory = useCallback((category: Step1LibraryCategory): Step1OutfitSubjectType => {
    if (category === "bottom") {
      return "下装";
    }
    if (category === "shoes") {
      return "鞋履";
    }
    if (category === "accessory") {
      return "配饰";
    }
    if (category === "suit") {
      return "套装";
    }
    if (category === "dress") {
      return "连衣裙";
    }
    if (category === "outer") {
      return "外套";
    }
    return "上装";
  }, []);

  const resolveRoleDirectionGatePatch = useCallback(
    (nextRoleDirectionCards: ReturnType<typeof adaptStep1RolePresetCards>) => {
      const resolvedRoleDirectionCards =
        nextRoleDirectionCards.length < 1 && roleDirectionCards.length > 0
          ? roleDirectionCards
          : nextRoleDirectionCards;
      const selectedDirectionId = step1SelectedRoleDirectionId;
      const keepSelection =
        selectedDirectionId !== null &&
        resolvedRoleDirectionCards.some((item) => item.directionId === selectedDirectionId);
      return {
        imageRoleDirections: resolvedRoleDirectionCards,
        imageSelectedRoleDirectionId: keepSelection ? selectedDirectionId : null,
      };
    },
    [
      roleDirectionCards,
      step1SelectedRoleDirectionId,
    ],
  );

  /** 加载服饰资产列表（首次加载，使用 usePagedList Hook） */
  const loadGarmentAssets = useCallback(async () => {
    if (!token) {
      resetGarmentAssets();
      setHasLoadedLibraryOnce(false);
      return;
    }
    try {
      await loadGarmentAssetsFirstPage();
      setHasLoadedLibraryOnce(true);
    } catch (error) {
      // 401 已由 backendApi.request.ts 统一处理弹窗，这里只处理其他错误
      if (error instanceof ApiError && error.status !== 401) {
        setApiFeedback(error.message);
      }
      setHasLoadedLibraryOnce(false);
    }
  }, [token, loadGarmentAssetsFirstPage, resetGarmentAssets]);

  /** 打开服饰库导入弹窗，首次打开时触发加载 */
  const handleOpenLibraryImport = useCallback(() => {
    setStep1ModuleLibraryImportOpen(true);
    // 首次打开时加载服饰库
    if (!hasLoadedLibraryOnce && !isLoadingLibrary) {
      void loadGarmentAssets();
    }
  }, [hasLoadedLibraryOnce, isLoadingLibrary, loadGarmentAssets]);

  // 初始加载角色工作流设置
  useEffect(() => {
    if (!token) {
      setCharacterWorkflowSettings(createDefaultCharacterWorkflowSystemSettings());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const settings = await loadStep1CharacterWorkflowSettings(token);
        if (!cancelled) {
          setCharacterWorkflowSettings(settings);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]); // setCharacterWorkflowSettings/loadStep1CharacterWorkflowSettings/createDefaultCharacterWorkflowSystemSettings 是稳定引用

  const refreshCharacterWorkflowSettings = useCallback(async (): Promise<CharacterWorkflowSystemSettings> => {
    const settings = await loadStep1CharacterWorkflowSettings(token);
    setCharacterWorkflowSettings(settings);
    return settings;
  }, [token]);

  /** 资产 ID 到资产对象的映射 */
  const garmentById = useMemo(() => {
    return new Map(garmentAssets.map((item) => [item.id, item] as const));
  }, [garmentAssets]);

  /** 模块变体组映射：moduleId → 变体信息（直接从模块 mainImage 的变体字段获取） */
  const moduleVariantInfo = useMemo(() => {
    // DEBUG: 打印模块数据看变体字段是否存在
    console.log('[DEBUG] step1OutfitModules:', step1OutfitModules.map(m => ({
      moduleId: m.moduleId,
      libraryAssetId: m.mainImage?.libraryAssetId,
      variantGroupId: m.mainImage?.variantGroupId,
      variantColor: m.mainImage?.variantColor,
      mainColor: m.mainImage?.mainColor,
    })));

    const infoMap = new Map<string, { variantGroupId: string; variantColor: string | null; isPrimary: boolean; siblings: Array<{ moduleId: string; color: string | null; isPrimary: boolean }> }>();
    // 先收集每个模块的变体组（直接用 mainImage 内嵌的变体字段）
    const groupToModules = new Map<string, Array<{ moduleId: string; color: string | null; isPrimary: boolean }>>();
    for (const mod of step1OutfitModules) {
      const vgId = mod.mainImage?.variantGroupId;
      if (!vgId) continue;
      const entry = { moduleId: mod.moduleId, color: mod.mainImage?.variantColor ?? mod.mainImage?.mainColor ?? null, isPrimary: mod.mainImage?.isPrimaryVariant ?? false };
      const list = groupToModules.get(vgId) ?? [];
      list.push(entry);
      groupToModules.set(vgId, list);
    }
    // 构建映射
    for (const [, members] of groupToModules) {
      for (const m of members) {
        infoMap.set(m.moduleId, {
          variantGroupId: groupToModules.keys().next().value ?? "",
          variantColor: m.color,
          isPrimary: m.isPrimary,
          siblings: members,
        });
      }
    }
    console.log('[DEBUG] moduleVariantInfo:', infoMap);
    return infoMap;
  }, [step1OutfitModules]);

  /**
   * 兼容适配器：将 GarmentAsset 映射为 LibraryAssetItem 格式
   * 用于 mapStep1JointReverseRecommendResult 等依赖 LibraryAssetItem 格式的函数
   */
  const libraryById = useMemo(() => {
    return new Map(
      garmentAssets.map((item) => [
        item.id,
        {
          id: item.id,
          name: item.name,
          category: normalizeToLibraryCategory(item.category),
          mainImageUrl: item.mainImageUrl,
          url: item.mainImageUrl,
          relatedImageUrls: uniqTrimmed([
            item.mainImageUrl,
            item.subImageUrl1,
            item.subImageUrl2,
            item.subImageUrl3,
          ].filter(Boolean) as string[]),
          sizeMb: item.sizeMb ?? 0,
          tags: [], // GarmentAsset 无 tags 字段，保留空数组
        },
      ]),
    );
  }, [garmentAssets]);

  /** 已导入项目的服饰资产 ID 集合 */
  const importedAssetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const module of step1OutfitModules) {
      if (module.mainImage?.libraryAssetId) {
        ids.add(module.mainImage.libraryAssetId);
      }
      for (const image of module.otherViews) {
        if (image.libraryAssetId) {
          ids.add(image.libraryAssetId);
        }
      }
    }
    return ids;
  }, [step1OutfitModules]);

  /** 模块级别的服饰资产列表（一条 GarmentAsset 就是一个模块，无需分组，过滤掉已导入的） */
  const moduleGarmentAssets = useMemo(() => {
    return garmentAssets
      .filter((asset) => !importedAssetIds.has(asset.id))
      .map((asset) => ({
        ...asset,
        // 合并主图和视角图 URL 用于展示
        allImageUrls: uniqTrimmed([
          asset.mainImageUrl,
          asset.subImageUrl1,
          asset.subImageUrl2,
          asset.subImageUrl3,
        ].filter(Boolean) as string[]),
      }));
  }, [garmentAssets, importedAssetIds]);

  const normalizePlanId = useCallback((value: string | number | null | undefined) => {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value).trim();
  }, []);

  
  const isAnalysisSelected = useCallback(
    (planId: string) =>
      normalizePlanId(selectedOutfitId) === normalizePlanId(planId),
    [normalizePlanId, selectedOutfitId],
  );

  const analysisCardsToRender: Step1OutfitAnalysisCard[] = useMemo(() => {
    const plans = workflow.imageOutfitPlans as OutfitPlanDto[];
    if (!Array.isArray(plans) || plans.length === 0) return [];
    // 根据生成状态判断 status
    const isGeneratingPlans = outfitRecommendationTaskStatus === "running" || isGenerating;
    const cardStatus: "pending" | "ready" = isGeneratingPlans ? "pending" : "ready";
    // 使用 normalize 函数转换，保证字段必填
    return plans.map((plan) => normalizeStep1OutfitAnalysisCard(plan, cardStatus));
  }, [workflow.imageOutfitPlans, outfitRecommendationTaskStatus, isGenerating]);

  const mapRecommendedOutfits = useCallback(
    (recommended: RecommendOutfitsResponse) => {
      return mapStep1JointReverseRecommendResult({
        recommended,
        garmentModules: step1OutfitModules,
        libraryById,
        fallbackAnalysisCardCount: configuredAnalysisCardCount,
        roleDirectionCount: 3,
      });
    },
    [
      3,
      configuredAnalysisCardCount,
      libraryById,
      step1OutfitModules,
    ],
  );
  const buildStep1ModuleSubjectBackfillPatch = useCallback(
    (analysisCards: OutfitAnalysisCardData[]) => {
      const latestModules = readLatestStep1OutfitModules();
      const nextModules = hydrateStep1ModuleSubjectsFromAnalysisCards(latestModules, analysisCards);
      if (!nextModules) {
        return null;
      }
      return {
        step1OutfitModules: nextModules,
      };
    },
    [readLatestStep1OutfitModules],
  );
  const mapRecommendedOutfitsRef = useRef(mapRecommendedOutfits);
  mapRecommendedOutfitsRef.current = mapRecommendedOutfits;
  const buildStep1ModuleSubjectBackfillPatchRef = useRef(buildStep1ModuleSubjectBackfillPatch);
  buildStep1ModuleSubjectBackfillPatchRef.current = buildStep1ModuleSubjectBackfillPatch;
  const resolveRoleDirectionGatePatchRef = useRef(resolveRoleDirectionGatePatch);
  resolveRoleDirectionGatePatchRef.current = resolveRoleDirectionGatePatch;

  const resolveModuleCategoryBySubjectType = useCallback((subjectTypeRaw: string): Step1OutfitModuleCategory => {
    const normalizedSubjectType = normalizeStep1OutfitSubjectType(subjectTypeRaw, { allowEmpty: true, fallback: "" });
    if (!normalizedSubjectType) {
      return "unknown";
    }
    return STEP1_SUBJECT_TYPE_TO_CLASSIFICATION_CATEGORY[normalizedSubjectType];
  }, []);

  const toLegacyLibraryCategory = useCallback(
    (category: Step1OutfitModuleCategory, target: Step1ModuleImageSlotTarget["target"]): Step1LibraryCategory => {
      const normalizedCategory = category === "unknown" ? (target === "main" ? "top" : "accessory") : category;
      if (
        normalizedCategory === "top" ||
        normalizedCategory === "bottom" ||
        normalizedCategory === "shoes" ||
        normalizedCategory === "accessory" ||
        normalizedCategory === "dress" ||
        normalizedCategory === "outer"
      ) {
        return normalizedCategory;
      }
      if (normalizedCategory === "suit") {
        return "suit";
      }
      return target === "main" ? "top" : "accessory";
    },
    [],
  );
  const resolveModuleImageLibraryCategory = useCallback(
    (module: Step1OutfitModule, image: Step1OutfitModuleImage, target: Step1ModuleImageSlotTarget["target"]): Step1LibraryCategory => {
      const classificationCategory = image.classification.category;
      const fallbackCategory = resolveModuleCategoryBySubjectType(module.subjectType);
      const resolvedCategory =
        classificationCategory === "top" ||
        classificationCategory === "bottom" ||
        classificationCategory === "shoes" ||
        classificationCategory === "accessory" ||
        classificationCategory === "dress" ||
        classificationCategory === "outer" ||
        classificationCategory === "suit" ||
        classificationCategory === "unknown"
          ? classificationCategory
          : fallbackCategory;
      return toLegacyLibraryCategory(resolvedCategory, target);
    },
    [resolveModuleCategoryBySubjectType, toLegacyLibraryCategory],
  );
  /** 同步服饰资产分类 */
  const syncGarmentAssetCategory = useCallback(
    async (assetIds: string[], category: Step1LibraryCategory) => {
      if (!token) {
        return;
      }
      const uniqueAssetIds = uniqTrimmed(assetIds);
      if (uniqueAssetIds.length < 1) {
        return;
      }
      await Promise.all(
        uniqueAssetIds.map((assetId) =>
          realGarmentAssetsApi.updateGarmentAsset(token, assetId, { category }).catch(() => null),
        ),
      );
      // 刷新服饰库列表
      resetGarmentAssets();
    },
    [token, resetGarmentAssets],
  );

  useEffect(() => {
    if (!token || !hasLoadedLibraryOnce || isLoadingLibrary || isUploadingModuleImage) {
      return;
    }
    if (step1ModuleLibraryBackfillRunningRef.current) {
      return;
    }

    // 检查是否需要回填：模块图片 URL 是否与 GarmentAsset 记录一致
    const needsBackfill = step1OutfitModules.some((module) => {
      const allImages = [module.mainImage, ...module.otherViews].filter(
        (image): image is Step1OutfitModuleImage => Boolean(image),
      );
      if (allImages.length < 1) {
        return false;
      }
      const rootLinkedId = module.mainImage?.libraryAssetId?.trim() || allImages[0].libraryAssetId?.trim() || "";
      if (!rootLinkedId || !garmentById.has(rootLinkedId)) {
        return true;
      }
      const rootAsset = garmentById.get(rootLinkedId);
      if (!rootAsset) {
        return true;
      }
      // 检查所有图片 URL 是否存在于 GarmentAsset 的 mainImageUrl 或 subImageUrl 中
      const assetUrls = uniqTrimmed([
        rootAsset.mainImageUrl,
        rootAsset.subImageUrl1,
        rootAsset.subImageUrl2,
        rootAsset.subImageUrl3,
      ].filter(Boolean) as string[]);
      const expectedUrls = uniqTrimmed(
        allImages.map((image) => image.activeImageUrl.trim() || image.imageUrl.trim()).filter(Boolean),
      );
      if (expectedUrls.some((url) => !assetUrls.includes(url))) {
        return true;
      }
      if (module.mainImage && module.mainImage.libraryAssetId !== rootLinkedId) {
        return true;
      }
      if (module.otherViews.some((image) => image.libraryAssetId !== rootLinkedId)) {
        return true;
      }
      return false;
    });

    if (!needsBackfill) {
      return;
    }

    let cancelled = false;
    step1ModuleLibraryBackfillRunningRef.current = true;

    (async () => {
      let nextModules = readLatestStep1OutfitModules();
      let modulesChanged = false;
      let touchedCount = 0;
      const nextGarmentMap = new Map<string, GarmentAsset>(garmentById);

      for (const module of nextModules) {
        if (cancelled) {
          break;
        }
        const moduleImages: Array<{
          target: Step1ModuleImageSlotTarget["target"];
          viewIndex: number | null;
          image: Step1OutfitModuleImage;
        }> = [
          ...(module.mainImage
            ? [{ target: "main" as const, viewIndex: null, image: module.mainImage }]
            : []),
          ...module.otherViews.map((image, index) => ({
            target: "other" as const,
            viewIndex: index,
            image,
          })),
        ].filter(
          (entry) => (entry.image.activeImageUrl.trim().length > 0 || entry.image.imageUrl.trim().length > 0),
        );
        if (moduleImages.length < 1) {
          continue;
        }

        const rootSeed = module.mainImage ?? moduleImages[0].image;
        const rootSeedUrl = rootSeed.activeImageUrl.trim() || rootSeed.imageUrl.trim();
        const rootSeedName = rootSeed.fileName?.trim() || `module-${module.moduleId}.png`;
        const rootSeedCategory = resolveModuleImageLibraryCategory(module, rootSeed, "main");

        let rootAssetId =
          module.mainImage?.libraryAssetId?.trim() ||
          moduleImages.find((entry) => !!entry.image?.libraryAssetId?.trim())?.image?.libraryAssetId?.trim() ||
          "";
        let rootAsset: GarmentAsset | undefined = rootAssetId ? nextGarmentMap.get(rootAssetId) : undefined;

        // 如果资产不存在，创建新的 GarmentAsset
        if (!rootAsset) {
          const created = await realGarmentAssetsApi.createGarmentAsset(token, {
            name: rootSeedName,
            type: "image",
            category: rootSeedCategory,
            mainImageUrl: rootSeedUrl,
            subImageUrl1: null,
            subImageUrl2: null,
            subImageUrl3: null,
            sizeMb: estimateImageSizeMbFromSourceUrl(rootSeedUrl),
            source: "step1-module-upload",
          });
          rootAssetId = created.id;
          rootAsset = created;
          nextGarmentMap.set(rootAsset.id, rootAsset);
          touchedCount += 1;
        }

        if (!rootAssetId || !rootAsset) {
          continue;
        }

        // 检查是否需要更新资产 URL
        const expectedUrls = uniqTrimmed(
          moduleImages.map((entry) => entry.image.activeImageUrl.trim() || entry.image.imageUrl.trim()).filter(Boolean),
        );
        const currentUrls = uniqTrimmed([
          rootAsset.mainImageUrl,
          rootAsset.subImageUrl1,
          rootAsset.subImageUrl2,
          rootAsset.subImageUrl3,
        ].filter(Boolean) as string[]);
        const allUrls = uniqTrimmed([...currentUrls, ...expectedUrls]);
        const urlsChanged = allUrls.length !== currentUrls.length || allUrls.some((url, index) => currentUrls[index] !== url);
        if (urlsChanged) {
          const mainUrl = rootAsset.mainImageUrl || allUrls[0];
          const otherUrls = allUrls.filter((url) => url !== mainUrl);
          await realGarmentAssetsApi.updateGarmentAsset(token, rootAssetId, {
            mainImageUrl: mainUrl,
            subImageUrl1: otherUrls[0] ?? null,
            subImageUrl2: otherUrls[1] ?? null,
            subImageUrl3: otherUrls[2] ?? null,
          });
          rootAsset = {
            ...rootAsset,
            mainImageUrl: mainUrl,
            subImageUrl1: otherUrls[0] ?? null,
            subImageUrl2: otherUrls[1] ?? null,
            subImageUrl3: otherUrls[2] ?? null,
          };
          nextGarmentMap.set(rootAssetId, rootAsset);
          touchedCount += 1;
        }

        const patchImage = (image: Step1OutfitModuleImage) =>
          image.libraryAssetId === rootAssetId
            ? image
            : {
                ...image,
                libraryAssetId: rootAssetId,
              };

        const patchedMainImage = module.mainImage ? patchImage(module.mainImage) : null;
        const patchedOtherViews = module.otherViews.map((image) => patchImage(image));
        const modulePatched =
          patchedMainImage !== module.mainImage ||
          patchedOtherViews.some((image, index) => image !== module.otherViews[index]);
        if (modulePatched) {
          nextModules = nextModules.map((entry) =>
            entry.moduleId === module.moduleId
              ? {
                  ...entry,
                  mainImage: patchedMainImage,
                  otherViews: patchedOtherViews,
                }
              : entry,
          );
          modulesChanged = true;
        }
      }

      if (cancelled) {
        return;
      }
      if (modulesChanged) {
        applyStep1OutfitModules(nextModules);
      }
      if (touchedCount > 0) {
        await loadGarmentAssets();
        setApiFeedback((current) => current ?? "已自动同步同一服饰的多角度图片。");
      }
    })()
      .catch((error) => {
        if (cancelled) {
          return;
        }
        const message = error instanceof ApiError ? error.message : "多角度素材自动同步失败，请重试上传。";
        setApiFeedback(message);
      })
      .finally(() => {
        step1ModuleLibraryBackfillRunningRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [
    applyStep1OutfitModules,
    garmentById,
    hasLoadedLibraryOnce,
    isLoadingLibrary,
    isUploadingModuleImage,
    loadGarmentAssets,
    readLatestStep1OutfitModules,
    resolveModuleImageLibraryCategory,
    step1OutfitModules,
    token,
  ]);

  const openStep1ModuleUpload = useCallback((target: Step1ModuleImageSlotTarget) => {
    // 其他视角图必须先上传主图
    if (target.target === "other") {
      const module = step1OutfitModules.find((m) => m.moduleId === target.moduleId);
      if (!module?.mainImage) {
        setApiFeedback("请先上传主图，再上传其他视角图。");
        return;
      }
    }
    setStep1ModuleUploadTarget(target);
    step1ModuleUploadInputRef.current?.click();
  }, [step1OutfitModules]);

  const handleStep1ModuleFieldChange = useCallback(
    (moduleId: string, field: "subjectName" | "subjectType" | "subjectDescription", value: string) => {
      const latestModules = readLatestStep1OutfitModules();
      const nextModules = latestModules.map((module) => {
        if (module.moduleId !== moduleId) {
          return module;
        }
        if (field === "subjectType") {
          const normalizedSubjectType = normalizeStep1OutfitSubjectType(value, { allowEmpty: true, fallback: "" });
          const nextCategory = resolveModuleCategoryBySubjectType(normalizedSubjectType);
          const patchImageCategory = (image: Step1OutfitModuleImage): Step1OutfitModuleImage => ({
            ...image,
            classification: {
              ...image.classification,
              category: nextCategory,
            },
          });
          return {
            ...module,
            subjectType: normalizedSubjectType,
            mainImage: module.mainImage ? patchImageCategory(module.mainImage) : null,
            otherViews: module.otherViews.map((image) => patchImageCategory(image)),
          };
        }
        return {
          ...module,
          [field]: field === "subjectDescription" ? value.slice(0, 200) : value.slice(0, 20),
        };
      });
      applyStep1OutfitModules(nextModules);
      if (field === "subjectType") {
        const changedModule = nextModules.find((module) => module.moduleId === moduleId);
        if (!changedModule) {
          return;
        }
        const normalizedSubjectType = normalizeStep1OutfitSubjectType(changedModule.subjectType, { allowEmpty: true, fallback: "" });
        if (!normalizedSubjectType) {
          return;
        }
        const nextCategory = resolveModuleCategoryBySubjectType(normalizedSubjectType);
        const legacyCategory = toLegacyLibraryCategory(nextCategory, "main");
        const linkedAssetIds = uniqTrimmed([
          changedModule.mainImage?.libraryAssetId ?? "",
          ...changedModule.otherViews.map((image) => image.libraryAssetId ?? ""),
        ]);
        queueMicrotask(() => {
          void syncGarmentAssetCategory(linkedAssetIds, legacyCategory);
        });
      }
    },
    [
      applyStep1OutfitModules,
      readLatestStep1OutfitModules,
      resolveModuleCategoryBySubjectType,
      syncGarmentAssetCategory,
      toLegacyLibraryCategory,
    ],
  );

  const handleDeleteStep1ModuleImage = useCallback(
    async (target: Step1ModuleImageSlotTarget) => {
      // 删除前确认
      const isMainImage = target.target === "main";
      const confirmed = await confirm(
        isMainImage ? "删除主图后，对应的搭配方案也会被清空。确定删除吗？" : "确定删除这张视角图吗？",
        "删除确认",
      );
      if (!confirmed) return;

      const latestModules = readLatestStep1OutfitModules();
      const targetModule = latestModules.find((module) => module.moduleId === target.moduleId);
      if (!targetModule) {
        setApiFeedback("未找到对应服饰模块，请刷新后重试。");
        return;
      }
      const targetImage =
        target.target === "main"
          ? targetModule.mainImage
          : target.viewIndex !== undefined
            ? targetModule.otherViews[target.viewIndex] ?? null
            : null;

      const nextModules = latestModules.map((module) => {
        if (module.moduleId !== target.moduleId) {
          return module;
        }
        if (target.target === "main") {
          // 删除主图时，清空所有信息回到初始状态
          return {
            ...module,
            subjectName: "",
            subjectDescription: "",
            mainImage: null,
            otherViews: [],
            multiViewWarning: "请先上传主图。",
          };
        }
        return {
          ...module,
          otherViews: module.otherViews.filter((_, index) => index !== target.viewIndex),
        };
      });
      applyStep1OutfitModules(nextModules);

      // 删除主图时，同步移除后端服饰关联
      if (isMainImage && token && targetModule.mainImage) {
        try {
          await realProjectGarmentAssocApi.removeProjectGarmentAssoc(token, target.moduleId);
        } catch (e) {
          console.warn("[Step1] remove garment assoc failed:", e);
        }
      }

      // 如果删除主图后没有任何主图了，清除所有生成状态
      const hasAnyMainImageAfterDelete = nextModules.some((module) => Boolean(module.mainImage));
      if (!hasAnyMainImageAfterDelete) {
        batchUpdateWorkflow({
          imageOutfitPlans: [],
          imageSelectedOutfitId: null,
          imageRoleDirections: [],
          imageSelectedRoleDirectionId: null,
        });
        updateProjectData({
          selectedOutfitPlanId: null,
          projectStatus: "IMAGE_DRAFT",
        });
        setApiFeedback("主图已删除，搭配方案已清空，请重新上传。");
      }

      },
    [applyStep1OutfitModules, readLatestStep1OutfitModules, token],
  );

  const handleDeleteStep1OutfitModule = useCallback(
    async (moduleId: string) => {
      // 检查是否有主图，有主图才需要确认
      const targetModule = step1OutfitModules.find((module) => module.moduleId === moduleId);
      const hasMainImage = targetModule?.mainImage;

      if (hasMainImage) {
        const confirmed = await confirm(
          "删除服饰卡片后，该卡片的搭配方案也会被清空。确定删除吗？",
          "删除确认",
        );
        if (!confirmed) return;
      }

      if (step1OutfitModules.length <= 1) {
        setApiFeedback("至少保留 1 个服饰模块。");
        return;
      }
      const nextModules = step1OutfitModules.filter((module) => module.moduleId !== moduleId);
      if (nextModules.length === step1OutfitModules.length) {
        setApiFeedback("未找到对应服饰模块，请刷新后重试。");
        return;
      }
      applyStep1OutfitModules(nextModules);
      setApiFeedback("已删除服饰模块。");

      // 持久化删除到后端
      if (token && hasMainImage) {
        try {
          await realProjectGarmentAssocApi.removeProjectGarmentAssoc(token, moduleId);
        } catch (e) {
          console.warn("[Step1] remove garment assoc failed:", e);
        }
      }
    },
    [applyStep1OutfitModules, step1OutfitModules, confirm, token],
  );

  /** Step1 进度卡片快捷上传：无图时点击直接触发上传 */
  const handleStep1QuickUpload = useCallback(() => {
    setAssetModalOpen(true);
  }, []);

  const handleAddStep1OutfitModule = useCallback(() => {
    if (step1OutfitModules.length >= STEP1_MAX_OUTFIT_MODULES) {
      setApiFeedback(`最多可添加 ${STEP1_MAX_OUTFIT_MODULES} 个服饰模块。`);
      return;
    }
    applyStep1OutfitModules([...step1OutfitModules, createEmptyStep1OutfitModule(step1OutfitModules.length + 1)]);
    // 滚动到左侧栏底部
    setTimeout(() => {
      step1LeftPanelScrollRef.current?.scrollTo({ top: step1LeftPanelScrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 100);
  }, [applyStep1OutfitModules, step1OutfitModules]);
  /** 从服饰库导入模块（使用 GarmentAsset） */
  const handleImportStep1ModuleFromLibrary = useCallback(
    async (asset: GarmentAsset) => {
      const resolvedImageUrl = typeof asset.mainImageUrl === "string" ? asset.mainImageUrl.trim() : "";
      if (!resolvedImageUrl) {
        setApiFeedback("所选服饰缺少图片地址，请更换其他素材。");
        return;
      }
      const resolvedAssetName = typeof asset.name === "string" ? asset.name.trim() : "";
      const latestModules = readLatestStep1OutfitModules();
      const targetModuleIndex = latestModules.findIndex((module) => !module.mainImage);
      const resolvedCategory: Step1LibraryCategory = normalizeToLibraryCategory(asset.category);
      const subjectType = resolveModuleSubjectTypeByLibraryCategory(resolvedCategory);
      // 从 GarmentAsset 的 subImageUrl 提取其他视角
      const allImageUrls = uniqTrimmed([
        asset.mainImageUrl,
        asset.subImageUrl1,
        asset.subImageUrl2,
        asset.subImageUrl3,
      ].filter(Boolean) as string[]);
      const otherViewUrls = allImageUrls.filter((url) => url !== resolvedImageUrl).slice(0, STEP1_MAX_OTHER_VIEWS);
      const nextImage: Step1OutfitModuleImage = {
        imageId: `step1-module-image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        imageUrl: resolvedImageUrl,
        libraryAssetId: asset.id,
        fileName: resolvedAssetName || null,
        classification: {
          category: resolvedCategory,
          confidence: 0.95,
          viewLabel: "main",
          reason: "library-import",
          feedbackCategory: null,
          feedbackConfidence: null,
          feedbackViewLabel: null,
          feedbackReason: null,
          feedbackMode: "none",
        },
        flatLayImageUrl: asset.flatLayImageUrl || null,
        removedBgImageUrl: null,
        activeImageUrl: resolvedImageUrl,
        removeBgStatus: "idle",
        removeBgError: null,
      };
      const nextOtherViews: Step1OutfitModuleImage[] = otherViewUrls.map((url, index) => ({
        imageId: `step1-module-image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${index}`,
        imageUrl: url,
        libraryAssetId: asset.id,
        fileName: resolvedAssetName || null,
        classification: {
          category: resolvedCategory,
          confidence: 0.95,
          viewLabel: "detail",
          reason: "library-import",
          feedbackCategory: null,
          feedbackConfidence: null,
          feedbackViewLabel: null,
          feedbackReason: null,
          feedbackMode: "none",
        },
        removedBgImageUrl: null,
        activeImageUrl: url,
        removeBgStatus: "idle",
        removeBgError: null,
      }));

      if (targetModuleIndex >= 0) {
        const resolvedDescription = asset.description?.trim() || "";
        const nextModules = latestModules.map((module, index) =>
          index === targetModuleIndex
            ? {
                ...module,
                subjectName: module.subjectName.trim().length > 0 ? module.subjectName : resolvedAssetName,
                subjectDescription: module.subjectDescription.trim().length > 0 ? module.subjectDescription : resolvedDescription,
                subjectType,
                mainImage: nextImage,
                otherViews: nextOtherViews,
              }
            : module,
        );
        applyStep1OutfitModules(nextModules);
      } else if (latestModules.length < STEP1_MAX_OUTFIT_MODULES) {
        const nextModule = createEmptyStep1OutfitModule(latestModules.length + 1);
        nextModule.subjectName = resolvedAssetName;
        nextModule.subjectDescription = asset.description?.trim() || "";
        nextModule.subjectType = subjectType;
        nextModule.mainImage = nextImage;
        nextModule.otherViews = nextOtherViews;
        applyStep1OutfitModules([...latestModules, nextModule]);
      } else {
        setApiFeedback(`最多可添加 ${STEP1_MAX_OUTFIT_MODULES} 个服饰模块，请先删除后再导入。`);
        return;
      }

      setStep1ModuleLibraryImportOpen(false);
      setApiFeedback(`已从服饰库导入「${resolvedAssetName || "未命名服饰"}」。`);
      // 项目在导航前已创建，urlProjectId 为唯一来源
      const projectId = urlProjectId;
      if (!projectId) {
        setApiFeedback("项目 ID 缺失，请刷新页面重试。");
        return;
      }
      // 持久化服饰关联到数据库并回填数据库 ID
      try {
        const assoc = await realProjectGarmentAssocApi.addProjectGarmentAssoc(token!, projectId!, asset.id);
        // 回填后端生成的数据库 ID，确保后续删除能正确调用
        const latestAfterAssoc = readLatestStep1OutfitModules();
        const importedModule = latestAfterAssoc.find(
          (m) => m.mainImage?.libraryAssetId === asset.id,
        );
        if (importedModule && importedModule.moduleId !== assoc.id) {
          applyStep1OutfitModules(
            latestAfterAssoc.map((m) =>
              m.moduleId === importedModule.moduleId ? { ...m, moduleId: assoc.id, hasMainImage: true } : m,
            ),
          );
        }
        // 【修复】从服饰库导入成功后，更新项目状态为 IMAGE_GARMENT_UPLOADED（图片项目）
        updateProjectData({ projectStatus: "IMAGE_GARMENT_UPLOADED" });
        // 刷新服饰模块列表，确保 UI 同步更新
        await refreshGarmentModules();
      } catch (e) {
        console.warn("[Step1] persist garment assoc failed:", e);
      }
    },
    [applyStep1OutfitModules, urlProjectId, readLatestStep1OutfitModules, resolveModuleSubjectTypeByLibraryCategory, token, updateProjectData, refreshGarmentModules],
  );

  /** AssetModal 创建成功后回填到指定模块（或第一个空模块） */
  const handleAssetModalCreated = useCallback(
    async (asset: GarmentAsset) => {
      try {
        // 弹窗上传也需要项目已存在
        if (!urlProjectId) {
          setApiFeedback("请先上传主图创建项目。");
          return;
        }
        const targetModuleId = assetModalTargetModuleId;
        if (targetModuleId) {
          // 指定模块：直接将资产映射到目标模块
          const resolvedImageUrl = typeof asset.mainImageUrl === "string" ? asset.mainImageUrl.trim() : "";
          if (!resolvedImageUrl) {
            setApiFeedback("所选服饰缺少图片地址，请更换其他素材。");
            return;
          }
          const resolvedAssetName = typeof asset.name === "string" ? asset.name.trim() : "";
          const latestModules = readLatestStep1OutfitModules();
          const resolvedCategory: Step1LibraryCategory = normalizeToLibraryCategory(asset.category);
          const subjectType = resolveModuleSubjectTypeByLibraryCategory(resolvedCategory);
          const allImageUrls = uniqTrimmed([
            asset.mainImageUrl,
            asset.subImageUrl1,
            asset.subImageUrl2,
            asset.subImageUrl3,
          ].filter(Boolean) as string[]);
          const otherViewUrls = allImageUrls.filter((url) => url !== resolvedImageUrl).slice(0, STEP1_MAX_OTHER_VIEWS);
          const nextImage: Step1OutfitModuleImage = {
            imageId: `step1-module-image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            imageUrl: resolvedImageUrl,
            libraryAssetId: asset.id,
            fileName: resolvedAssetName || null,
            classification: {
              category: resolvedCategory,
              confidence: 0.95,
              viewLabel: "main",
              reason: "library-import",
              feedbackCategory: null,
              feedbackConfidence: null,
              feedbackViewLabel: null,
              feedbackReason: null,
              feedbackMode: "none",
            },
            removedBgImageUrl: null,
            activeImageUrl: resolvedImageUrl,
            removeBgStatus: "idle",
            removeBgError: null,
          };
          const nextOtherViews: Step1OutfitModuleImage[] = otherViewUrls.map((url, index) => ({
            imageId: `step1-module-image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${index}`,
            imageUrl: url,
            libraryAssetId: asset.id,
            fileName: resolvedAssetName || null,
            classification: {
              category: resolvedCategory,
              confidence: 0.95,
              viewLabel: "detail",
              reason: "library-import",
              feedbackCategory: null,
              feedbackConfidence: null,
              feedbackViewLabel: null,
              feedbackReason: null,
              feedbackMode: "none",
            },
            removedBgImageUrl: null,
            activeImageUrl: url,
            removeBgStatus: "idle",
            removeBgError: null,
          }));
          const resolvedDescription = asset.description?.trim() || "";
          const nextModules = latestModules.map((module) =>
            module.moduleId === targetModuleId
              ? {
                  ...module,
                  subjectName: module.subjectName.trim().length > 0 ? module.subjectName : resolvedAssetName,
                  subjectDescription: module.subjectDescription.trim().length > 0 ? module.subjectDescription : resolvedDescription,
                  subjectType,
                  mainImage: nextImage,
                  otherViews: nextOtherViews,
                }
              : module,
          );
          applyStep1OutfitModules(nextModules);
          // 项目在导航前已创建，urlProjectId 为唯一来源
          const projectId = urlProjectId;
          if (!projectId) {
            setApiFeedback("项目 ID 缺失，请刷新页面重试。");
            return;
          }
          // 持久化服饰关联到数据库并回填数据库 ID
          try {
            const assoc = await realProjectGarmentAssocApi.addProjectGarmentAssoc(token!, projectId!, asset.id);
            // 回填后端生成的数据库 ID
            if (targetModuleId && assoc.id !== targetModuleId) {
              const latestModules = readLatestStep1OutfitModules();
              applyStep1OutfitModules(
                latestModules.map((m) =>
                  m.moduleId === targetModuleId ? { ...m, moduleId: assoc.id, hasMainImage: true } : m,
                ),
              );
            }
            // 【修复】创建服饰并绑定后，更新项目状态为 IMAGE_GARMENT_UPLOADED（图片项目）
            updateProjectData({ projectStatus: "IMAGE_GARMENT_UPLOADED" });
            // 刷新服饰模块列表，确保 UI 同步更新
            await refreshGarmentModules();
          } catch (e) {
            console.warn("[Step1] persist garment assoc failed:", e);
          }
          setApiFeedback(`已导入「${resolvedAssetName || "未命名服饰"}」到指定模块。`);
        } else {
          // 未指定模块：使用原有逻辑找第一个空模块
          await handleImportStep1ModuleFromLibrary(asset);
          // 刷新本地服饰库列表
          resetGarmentAssets();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "导入服饰失败，请重试。";
        setApiFeedback(message);
      } finally {
        // 只清理 targetModuleId，弹窗关闭由 AssetModal 的 onClose 处理
        setAssetModalTargetModuleId(null);
      }
    },
    [applyStep1OutfitModules, assetModalTargetModuleId, urlProjectId, handleImportStep1ModuleFromLibrary, readLatestStep1OutfitModules, resolveModuleSubjectTypeByLibraryCategory, token, updateProjectData, setApiFeedback, refreshGarmentModules],
  );

  const handleUploadStep1ModuleImage = useCallback(
    async (target: Step1ModuleImageSlotTarget, file: File) => {
      if (!token) {
        setApiFeedback("请先登录后再上传。");
        return;
      }
      let rollbackModules: Step1OutfitModule[] | null = null;
      let ossStorageKey: string | null = null;
      let resolvedProjectId = "";
      // 跟踪后端 classify 自动创建的服饰资产 ID（用于异常时清理孤儿记录）
      let createdAssetId: string | null = null;
      setIsUploadingModuleImage(true);
      useAppStore.getState().showGlobalLoading();
      setApiFeedback(STEP1_UPLOAD_FEEDBACK_SYNCING);
      try {
        const dataUrl = await fileToDataUrl(file);
        const sizeMb = Math.max(0.01, Number((file.size / 1024 / 1024).toFixed(3)));
        const latestModules = readLatestStep1OutfitModules();
        const targetModule =
          latestModules.find((module) => module.moduleId === target.moduleId) ??
          latestModules[0] ??
          createEmptyStep1OutfitModule(1);
        setStep1ModuleUploadTarget(null);
        const normalizedSubjectType = normalizeStep1OutfitSubjectType(targetModule.subjectType, { allowEmpty: true, fallback: "" });
        const fallbackClassificationCategory = resolveModuleCategoryBySubjectType(normalizedSubjectType);
        // 始终使用自动分类，未知类别默认为 top
        const provisionalClassificationCategory =
          fallbackClassificationCategory === "unknown" && target.target === "main"
            ? "top"
            : fallbackClassificationCategory;
        const resolvedClassificationViewLabel: Step1OutfitViewLabel =
          target.target === "main" ? "main" : "detail";
        rollbackModules = latestModules;
        applyStep1OutfitModules(
          patchStep1ModuleImageSlot({
            modules: latestModules,
            target,
            nextImage: buildOptimisticStep1ModuleImage({
              dataUrl,
              fileName: file.name || null,
              category: provisionalClassificationCategory,
              viewLabel: resolvedClassificationViewLabel,
              reason: "local-preview-pending-sync",
              confidence: 0.2,
            }),
            maxOtherViews: STEP1_MAX_OTHER_VIEWS,
          }),
        );
        // 项目已在导航前创建，URL 中必有 projectId
        if (!urlProjectId) {
          applyStep1OutfitModules(rollbackModules);
          setApiFeedback("请先上传主图创建项目。");
          setIsUploadingModuleImage(false);
          useAppStore.getState().hideGlobalLoading();
          setStep1ModuleUploadTarget(null);
          return;
        }
        resolvedProjectId = urlProjectId;
        // 上传文件到 OSS 获取 URL
        const uploadResult = await uploadFileToOss(token, resolvedProjectId, file);
        const fileUrl = uploadResult.fileUrl;
        ossStorageKey = uploadResult.storageKey;
        const rootAssetId = targetModule.mainImage?.libraryAssetId?.trim() || "";
        const rootAsset = rootAssetId ? garmentById.get(rootAssetId) : undefined;

        let resolvedClassificationCategory = provisionalClassificationCategory;
        let resolvedViewLabel: Step1OutfitViewLabel = resolvedClassificationViewLabel;
        let resolvedReason: string | null = normalizedSubjectType ? "manual-subject-type" : "rule-based-fallback";
        let feedbackCategory: Step1OutfitModuleCategory | null = null;
        let feedbackConfidence: number | null = null;
        let feedbackViewLabel: Step1OutfitViewLabel | null = null;
        let feedbackReason: string | null = null;
        let feedbackMode: "llm" | "heuristic" | "none" = "none";
        let resolvedClothingTitle: string | null = null;
        let resolvedClothingDescription: string | null = null;
        let resolvedClothingStyle: string[] | null = null;
        let classificationBlocked = false;

        if (target.target === "main") {
          try {
            const classification = await classifyProjectFlowUploadImage(token, resolvedProjectId, {
              imageUrl: fileUrl,
              fileName: file.name,
              target: target.target,
              hasMainImage: Boolean(targetModule.mainImage) || target.target === "main",
              existingOtherViewCount: targetModule.otherViews.length,
              includeFeedback: true,
              // 图片项目专属：后端分类成功后自动创建服饰资产
              sizeMb,
              source: "step1-module-upload",
            });
            const validCategories: Step1OutfitModuleCategory[] = ["top", "bottom", "shoes", "accessory", "dress", "outer", "suit", "unknown"];
            const rawCategory = classification.classification.category;
            resolvedClassificationCategory = validCategories.includes(rawCategory as Step1OutfitModuleCategory)
              ? (rawCategory as Step1OutfitModuleCategory)
              : "unknown";
            resolvedViewLabel = classification.classification.viewLabel;
            resolvedReason = classification.classification.reason;
            const rawFeedbackCategory = classification.classificationFeedback?.category;
            feedbackCategory = rawFeedbackCategory && validCategories.includes(rawFeedbackCategory as Step1OutfitModuleCategory)
              ? (rawFeedbackCategory as Step1OutfitModuleCategory)
              : null;
            feedbackConfidence = classification.classificationFeedback?.confidence ?? null;
            feedbackViewLabel = classification.classificationFeedback?.viewLabel ?? null;
            feedbackReason = classification.classificationFeedback?.reason ?? null;
            const rawMode = classification.classificationFeedback?.mode;
            feedbackMode = rawMode === "provider" ? "llm" : (rawMode === "heuristic" || rawMode === "llm" || rawMode === "none" ? rawMode : "heuristic");
            resolvedClothingTitle = classification.clothingTitle ?? null;
            resolvedClothingDescription = classification.clothingDescription ?? null;
            resolvedClothingStyle = classification.clothingStyle ?? null;
            // 后端已自动创建服饰资产，获取 assetId
            createdAssetId = classification.assetId ?? null;

            // LLM 识别为非服饰图片，删除 OSS 文件并回滚，不创建服饰资产
            if (shouldBlockStep1UploadByClassification(classification)) {
              classificationBlocked = true;
            }
          } catch {
            classificationBlocked = true;
            resolvedReason = "auto-classification-fallback";
          }
        } else {
          resolvedReason = "other-view-skip-llm";
        }

        if (classificationBlocked) {
          await deleteFileFromOss(token, resolvedProjectId, ossStorageKey).catch((e) => {
            console.warn('[ImageAssets] 清理分类拒绝文件失败:', ossStorageKey, e);
          });
          applyStep1OutfitModules(rollbackModules);
          setIsUploadingModuleImage(false);
          useAppStore.getState().hideGlobalLoading();
          setStep1ModuleUploadTarget(null);
          // 用 fallback 分类构造一个假结果用于提示
          setApiFeedback(buildStep1NonClothingUploadMessage({
            mode: "fallback",
            isClothingImage: false,
            clothingImageReason: "图片未识别为服饰",
            classification: { category: "person", confidence: 1, viewLabel: "main", reason: "not-clothing" },
            classificationFeedback: null,
            multiViewWarning: null,
          }));
          return;
        }

        // 获取已创建的服饰资产（后端 classify 已自动创建，通过 assetId 获取）
        let linkedGarmentAsset: GarmentAsset;

        if (rootAssetId && rootAsset) {
          // 已有资产 → 更新副图
          const currentUrls = uniqTrimmed([
            rootAsset.mainImageUrl,
            rootAsset.subImageUrl1,
            rootAsset.subImageUrl2,
            rootAsset.subImageUrl3,
          ].filter(Boolean) as string[]);
          const allUrls = target.target === "main"
            ? uniqTrimmed([fileUrl, ...currentUrls])
            : uniqTrimmed([...currentUrls, fileUrl]);
          const mainUrl = target.target === "main" ? fileUrl : rootAsset.mainImageUrl;
          const otherUrls = allUrls.filter((url) => url !== mainUrl);
          linkedGarmentAsset = await realGarmentAssetsApi.updateGarmentAsset(token, rootAssetId, {
            ...(target.target === "main" ? { name: resolvedClothingTitle || file.name || rootAsset.name || `${target.target}-${Date.now()}.png` } : {}),
            mainImageUrl: mainUrl,
            subImageUrl1: otherUrls[0] ?? null,
            subImageUrl2: otherUrls[1] ?? null,
            subImageUrl3: otherUrls[2] ?? null,
          });
        } else if (createdAssetId) {
          // 后端 classify 已自动创建资产，直接获取
          linkedGarmentAsset = await realGarmentAssetsApi.getGarmentAsset(token, createdAssetId);
        } else {
          // 兜底：后端未自动创建时前端手动创建
          const finalCategory = toLegacyLibraryCategory(resolvedClassificationCategory, target.target);
          linkedGarmentAsset = await realGarmentAssetsApi.createGarmentAsset(token, {
            name: resolvedClothingTitle || file.name || `${target.target}-${Date.now()}.png`,
            type: "image",
            category: finalCategory,
            mainImageUrl: fileUrl,
            subImageUrl1: null,
            subImageUrl2: null,
            subImageUrl3: null,
            sizeMb,
            source: "step1-module-upload",
          });
        }

        // 获取上传的图片 URL
        const assetUrls = uniqTrimmed([
          linkedGarmentAsset.mainImageUrl,
          linkedGarmentAsset.subImageUrl1,
          linkedGarmentAsset.subImageUrl2,
          linkedGarmentAsset.subImageUrl3,
        ].filter(Boolean) as string[]);
        const resolvedUploadedImageUrl =
          target.target === "main"
            ? linkedGarmentAsset.mainImageUrl?.trim() || fileUrl
            : assetUrls[assetUrls.length - 1] || fileUrl;

        const nextImageId = `step1-module-image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const nextImage: Step1OutfitModuleImage = {
          imageId: nextImageId,
          imageUrl: resolvedUploadedImageUrl,
          libraryAssetId: linkedGarmentAsset.id,
          fileName: file.name || linkedGarmentAsset.name || null,
          classification: {
            category: resolvedClassificationCategory,
            confidence: 0.78,
            viewLabel: resolvedViewLabel,
            reason: resolvedReason,
            feedbackCategory,
            feedbackConfidence,
            feedbackViewLabel,
            feedbackReason,
            feedbackMode,
            clothingTitle: resolvedClothingTitle,
            clothingDescription: resolvedClothingDescription,
            clothingStyle: resolvedClothingStyle,
          },
          removedBgImageUrl: null,
          activeImageUrl: resolvedUploadedImageUrl,
          removeBgStatus: "idle",
          removeBgError: null,
          // 顶层直接访问标题和描述
          clothingTitle: resolvedClothingTitle,
          clothingDescription: resolvedClothingDescription,
          // 顶层直接访问风格标签
          clothingStyle: resolvedClothingStyle,
        };
        const latestAfterUpload = readLatestStep1OutfitModules();
        const nextModules = patchStep1ModuleImageSlot({
          modules: latestAfterUpload,
          target,
          nextImage,
          maxOtherViews: STEP1_MAX_OTHER_VIEWS,
          resolveSubjectType: (module) => {
            // 始终从分类结果推导类别
            const nextSubjectType = resolveStep1SubjectTypeFromClassificationCategory(resolvedClassificationCategory);
            return target.target === "main" ? nextSubjectType || module.subjectType : module.subjectType || nextSubjectType;
          },
          // 主图上传且字段为空时，回填 LLM 生成的标题和描述
          resolveSubjectFields: (module, image) => {
            if (!module.subjectName.trim() && image.clothingTitle) {
              return {
                subjectName: image.clothingTitle.slice(0, 20),
                subjectDescription: image.clothingDescription?.slice(0, 200) ?? "",
              };
            }
            return {};
          },
        });
        applyStep1OutfitModules(nextModules);
        // 创建项目服饰关联（主图上传时）
        if (target.target === "main" && urlProjectId) {
          try {
            await realProjectGarmentAssocApi.addProjectGarmentAssoc(token, urlProjectId, linkedGarmentAsset.id);
            // 刷新服饰模块列表，确保 UI 同步更新
            await refreshGarmentModules();
          } catch (e) {
            // 关联失败时清理孤儿服饰记录（后端 classify 已自动创建，避免残留）
            console.warn("[Step1] 创建项目服饰关联失败，清理孤儿资产:", e);
            try {
              await realGarmentAssetsApi.deleteGarmentAsset(token, linkedGarmentAsset.id);
            } catch { /* 清理失败不影响主流程 */ }
          }
        }
        const categoryLabel =
          (STEP1_MODULE_CATEGORY_LABELS[resolvedClassificationCategory] ?? normalizedSubjectType) || "未选择类别";
        setApiFeedback(
          target.target === "other"
            ? `${STEP1_UPLOAD_FEEDBACK_CLASSIFYING} 其他视角图片已并入当前服饰：${categoryLabel}。`
            : `主图已上传并自动识别为：${categoryLabel}，已保存到服饰库。`,
        );
      } catch (error) {
        // 上传失败时清理后端已创建的孤儿服饰记录
        if (createdAssetId) {
          try {
            await realGarmentAssetsApi.deleteGarmentAsset(token, createdAssetId);
          } catch { /* 清理失败不影响主流程 */ }
        }
        if (rollbackModules) {
          applyStep1OutfitModules(rollbackModules);
        }
        console.error("[step1-upload] 上传失败详情:", error);
        const message = error instanceof ApiError ? error.message : "服饰模块上传失败，请稍后重试。";
        setApiFeedback(message);
      } finally {
        setIsUploadingModuleImage(false);
        useAppStore.getState().hideGlobalLoading();
        setStep1ModuleUploadTarget(null);
      }
    },
    [
      applyStep1OutfitModules,
      garmentById,
      loadGarmentAssets,
      readLatestStep1OutfitModules,
      refreshCharacterWorkflowSettings,
      refreshGarmentModules,
      resolveModuleCategoryBySubjectType,
      toLegacyLibraryCategory,
      token,
      urlProjectId,
    ],
  );

  const handleGenerate = async () => {
    if (step1Locked) return;
    try {
      if (!token) {
        setApiFeedback("请先登录后再继续。");
        return;
      }
      const latestWorkflow = getProjectState(urlProjectId!).workflow;
      const latestStep1OutfitModules = normalizeStep1OutfitModules(latestWorkflow.imageGarmentModules, {
        minModules: 1,
        maxModules: STEP1_MAX_OUTFIT_MODULES,
      });
      const latestCharacterWorkflowSettings = await refreshCharacterWorkflowSettings();
      if (shouldEnforceStep1UploadNonClothingBlock()) {
        const blockedModule = findBlockedStep1Module(latestStep1OutfitModules);
        if (blockedModule) {
          setApiFeedback(buildBlockedStep1ModuleMessage(blockedModule));
          return;
        }
      }

      // 从 imageGarmentModules 提取所有 libraryAssetId
      const garmentAssetIds = new Set<string>();
      for (const module of latestStep1OutfitModules) {
        if (module.mainImage?.libraryAssetId) {
          garmentAssetIds.add(module.mainImage.libraryAssetId);
        }
        for (const view of module.otherViews) {
          if (view.libraryAssetId) {
            garmentAssetIds.add(view.libraryAssetId);
          }
        }
      }

      if (garmentAssetIds.size === 0) {
        setApiFeedback("请先添加服饰模块后再生成搭配。");
        return;
      }

      setIsGenerating(true);
      useAppStore.getState().showGlobalLoading();
      setApiFeedback(null);

      // 生成搭配需要项目已存在（URL 中已有 projectId）
      if (!urlProjectId) {
        setApiFeedback("请先上传主图创建项目。");
        setIsGenerating(false);
        useAppStore.getState().hideGlobalLoading();
        return;
      }
      const projectId = urlProjectId;

      const uploadFiles = Array.from(garmentAssetIds).map((assetId) => ({
        garmentAssetId: assetId,
        fileName: libraryById.get(assetId)?.name || `garment-${Date.now()}.png`,
        sizeMb: 1,
      }));

      if (uploadFiles.length === 0) {
        setApiFeedback("Step1 还没有有效的优选库选品，请先完成上传或选择。");
        return;
      }

      // 显示占位卡片和进度条 - 使用 step1OutfitModules 的图片
      const pendingSelectedAssets: Record<string, string | null> = {};
      latestStep1OutfitModules.forEach((module) => {
        if (module.mainImage?.libraryAssetId) {
          const asset = libraryById.get(module.mainImage.libraryAssetId);
          const category = asset?.category || "top";
          pendingSelectedAssets[category] = module.mainImage.activeImageUrl || module.mainImage.imageUrl;
        }
      });

      const pendingResult = buildStep1JointReversePendingResult({
        analysisCardCount: configuredAnalysisCardCount,
        roleDirectionCount: 3,
      });
      batchUpdateWorkflow({
        imageOutfitPlans: pendingResult.nextOutfits.map((o, idx) => ({ ...o, index: idx + 1 })),
        imageRoleDirections: pendingResult.roleDirectionCards,
        imageSelectedRoleDirectionId: null,
        imageSelectedOutfitId: null,
      });
      setPromptDraftByPlanId(
        pendingResult.nextAnalysisCards.reduce<Record<string, string>>((acc, card) => {
          acc[card.planId] = card.optimizedPrompt;
          return acc;
        }, {}),
      );

      await backendApi.uploadAssets(token, projectId, uploadFiles);

      const recommended = await backendApi.recommendOutfits(token, projectId, {
        selection: {
          selectedSource: "visual",
          selectedAssetIds: uploadFiles.map((file) => file.garmentAssetId),
        },
      });
      const {
        nextOutfits,
        nextAnalysisCards,
        roleDirectionCards: nextRoleDirectionCards,
        analysisStatusMessage,
        reverseTaskId,
      } =
        mapRecommendedOutfits(recommended);
      const step1ModuleSubjectBackfillPatch = buildStep1ModuleSubjectBackfillPatch(nextAnalysisCards);
      batchUpdateWorkflow({
        imageOutfitPlans: nextOutfits.map((o, idx) => ({ ...o, index: idx + 1 })),
        ...(step1ModuleSubjectBackfillPatch ?? {}),
        ...resolveRoleDirectionGatePatch(nextRoleDirectionCards),
        imageSelectedOutfitId: null,
      });
      setPromptDraftByPlanId(
        nextAnalysisCards.reduce<Record<string, string>>((acc, card) => {
          acc[card.planId] = card.optimizedPrompt;
          return acc;
        }, {}),
      );
      setApiFeedback(
        recommended.taskStatus === "running"
          ? `已生成 ${nextOutfits.length} 套搭配，时尚穿搭分析正在后台生成中。`
          : nextAnalysisCards.length > 0
          ? `已生成 ${nextOutfits.length} 套搭配，可选择图片方案或时尚穿搭方案进入下一步。`
          : `已生成 ${nextOutfits.length} 套搭配。时尚穿搭分析暂无可用数据，请先选择图片方案或联系管理员开启 API。`,
      );
      // 生成搭配方案成功后由各 step API 独立保存
      // 更新项目状态为 IMAGE_GARMENT_UPLOADED（已生成搭配，等待确认角色预设）
      if (!projectData.projectStatus || projectData.projectStatus === "IMAGE_DRAFT") {
        updateProjectData({ projectStatus: "IMAGE_GARMENT_UPLOADED" });
      }
    } catch (error) {
      // 401 已由 backendApi.request.ts 统一处理弹窗
      setOutfitPlans([]);
      if (error instanceof ApiError && error.status !== 401) {
        setApiFeedback(error.message);
      }
    } finally {
      setIsGenerating(false);
      useAppStore.getState().hideGlobalLoading();
    }
  };

  // 新流程：基于服饰信息生成角色预设（不依赖穿搭方案）
  const handleGenerateRoleDirectionFromGarments = useCallback(async (suggestion: Step1RoleDirectionSuggestion) => {
    if (!urlProjectId || !token) {
      setApiFeedback("项目 ID 或登录状态缺失，请刷新页面重试。");
      return;
    }

    setRoleDirectionGenerating(true);
    setApiFeedback(null);

    try {
      useAppStore.getState().showGlobalLoading();

      // 获取已有角色方向卡片（用于合并）
      const latestCards = adaptStep1RolePresetCards(
        getProjectState(urlProjectId!).workflow?.imageRoleDirections || [],
        "assets-project-data",
      );

      const result = await backendApi.imageStep1GenerateRoleDirectionFromGarments(
        token,
        urlProjectId,
        {
          gender: suggestion.gender as "male" | "female",
          ageRange: suggestion.ageRange,
        },
      );

      // 前端合并：新卡片在前，历史卡片在后（去重）
      const newCardIds = new Set(result.roleDirectionCards.map((c) => c.directionId));
      const mergedCards = [
        ...result.roleDirectionCards,
        ...latestCards.filter((c) => !newCardIds.has(c.directionId)),
      ];

      batchUpdateWorkflow({
        imageRoleDirections: mergedCards,
        imageSelectedRoleDirectionId: null,
      });
      setAppliedSuggestionCount((c) => c + 1);
      setRoleDirectionGenerating(false);
      setApiFeedback(
        mergedCards.length > 0
          ? `已根据「${suggestion.summary || suggestion.ageRange}」生成 ${mergedCards.length} 个角色预设。`
          : "角色预设已更新，但暂无可用数据。",
      );
      useAppStore.getState().hideGlobalLoading();
    } catch (error) {
      setRoleDirectionGenerating(false);
      const message = error instanceof ApiError ? error.message : "生成角色预设失败，请稍后重试";
      setApiFeedback(message);
      useAppStore.getState().hideGlobalLoading();
    }
  }, [token, urlProjectId, updateProjectData]);

  // 角色预设卡片滚动状态更新
  const handleRoleDirectionScroll = useCallback(() => {
    const container = roleDirectionScrollRef.current;
    if (!container) return;
    setRoleDirectionCanScrollRight(container.scrollLeft + container.clientWidth < container.scrollWidth - 10);
  }, []);

  // 滚动到上一张
  const handleRoleDirectionPrev = useCallback(() => {
    const container = roleDirectionScrollRef.current;
    if (!container) return;
    container.scrollTo({ left: container.scrollLeft - 212, behavior: "smooth" });
  }, []);

  // 滚动到下一张
  const handleRoleDirectionNext = useCallback(() => {
    const container = roleDirectionScrollRef.current;
    if (!container) return;
    container.scrollTo({ left: container.scrollLeft + 212, behavior: "smooth" });
  }, []);

  // 选中卡片时自动滚动到容器中间
  useEffect(() => {
    if (!step1SelectedRoleDirectionId || !roleDirectionScrollRef.current) return;
    const container = roleDirectionScrollRef.current;
    const selectedCard = container.querySelector(`[data-testid="step2-role-${step1SelectedRoleDirectionId}"]`) as HTMLElement | null;
    if (!selectedCard) return;
    const containerRect = container.getBoundingClientRect();
    const cardRect = selectedCard.getBoundingClientRect();
    const targetScroll = container.scrollLeft + (cardRect.left - containerRect.left) - (containerRect.width / 2) + (cardRect.width / 2);
    const maxScroll = container.scrollWidth - container.clientWidth;
    container.scrollTo({ left: Math.max(0, Math.min(targetScroll, maxScroll)), behavior: "smooth" });
  }, [step1SelectedRoleDirectionId]);

  const handleSelectRoleDirection = async (
    directionId: string,
    visibleRoleDirections?: Step1RoleDirectionCard[],
  ) => {
    if (step1Locked) return;
    if (step1SelectedRoleDirectionId === directionId) {
      // 取消选择：同步清除后端数据
      if (token && urlProjectId) {
        await backendApi.imageStep1UpdateProjectRoleDirection(token, urlProjectId, null);
      }
      setImageSelectedRoleDirectionId(null);
      setApiFeedback("已取消当前推荐角色预设，可重新选择。");
      return;
    }
    // 优先使用传入的调整后数据，否则从原始数据查找
    const cards = visibleRoleDirections ?? roleDirectionCards;
    const selectedDirection = resolveStep1RolePresetCardById(cards, directionId);
    if (!selectedDirection) {
      setApiFeedback("当前推荐角色预设已失效，请重新选择。");
      return;
    }
    const confirmed = confirmStep1RoleDirectionSelection(directionId);
    const controlledPreset = buildControlledRolePresetFromDirection(selectedDirection);
    // 从当前选中的搭配方案构建 outfitSummary
    const currentOutfitSummary = selectedOutfitId
      ? generatedOutfits.find((o) => o.id === selectedOutfitId)?.title ||
        generatedOutfits.find((o) => o.id === selectedOutfitId)?.reason ||
        null
      : null;
    const promptPayload = buildStep1RolePromptPayload(
      buildStep1RolePromptInputFromCard(
        {
          ...selectedDirection,
          ethnicityOrRegion: controlledPreset.ethnicityOrRegion,
          gender: controlledPreset.gender,
          age: controlledPreset.age,
          styleWords: controlledPreset.styleWords,
        },
        currentOutfitSummary,
      ),
    );
    const adminDebugPrompt = resolveStep1AdminDebugPrompt(
      promptPayload,
      isAdminUser ? "admin" : "user",
    );

    // 同步写入后端（含头像 URL）
    if (token && urlProjectId) {
      const cardIndex = cards.findIndex((item) => item.directionId === directionId);
      const avatarRender = resolveRoleDirectionAvatarRenderModel(
        cardIndex >= 0 ? cardIndex : 0,
        selectedDirection.gender,
        selectedDirection.portraitUrl,
      );
      const directionWithAvatar = { ...selectedDirection, portraitUrl: avatarRender.imageUrl };
      await backendApi.imageStep1UpdateProjectRoleDirection(token, urlProjectId, directionWithAvatar);
    }

    setImageSelectedRoleDirectionId(confirmed.selectedDirectionId);
    setAdminDebugPromptDraft(adminDebugPrompt ?? "");
    setApiFeedback("推荐角色预设已确认，正在生成穿搭方案...");

    // 角色预设确认后，更新项目状态
    updateProjectData({
      projectStatus: "IMAGE_ROLE_DIRECTION_CONFIRMED",
    });

    // 折叠 Step 2，展开 Step 3，触发穿搭方案生成
    setTimeout(() => {
      setStepExpandState((prev) => ({ ...prev, 2: false, 3: true }));
      setTimeout(() => {
        document.querySelector('[data-step="3"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 800);
    }, 1200);

    // 生成穿搭方案（后端从数据库获取服饰和角色预设信息）
    if (token && urlProjectId) {
      setIsGenerating(true);
      useAppStore.getState().showGlobalLoading();

      // 先设置 pending 状态，显示骨架
      const pendingResult = buildStep1JointReversePendingResult({
        analysisCardCount: configuredAnalysisCardCount,
        roleDirectionCount: 3,
      });
      batchUpdateWorkflow({
        imageOutfitPlans: pendingResult.nextOutfits.map((o, idx) => ({ ...o, index: idx + 1 })),
        imageSelectedOutfitId: null,
        outfitAnalysisCards: pendingResult.nextAnalysisCards,
        outfitRecommendationTaskStatus: "running",
        outfitRecommendationTaskId: pendingResult.reverseTaskId,
      });

      try {
        const recommended = await backendApi.recommendOutfits(token, urlProjectId);

        const { nextOutfits, nextAnalysisCards } = mapRecommendedOutfits(recommended);

        // 更新穿搭方案列表
        batchUpdateWorkflow({
          imageOutfitPlans: nextOutfits.map((o, idx) => ({ ...o, index: idx + 1 })),
          imageSelectedOutfitId: null,
          outfitAnalysisCards: nextAnalysisCards,
          outfitRecommendationTaskStatus: recommended.taskStatus ?? "completed",
          outfitRecommendationTaskId: recommended.taskId ?? null,
        });

        setPromptDraftByPlanId(
          nextAnalysisCards.reduce<Record<string, string>>((acc, card) => {
            acc[card.planId] = card.optimizedPrompt;
            return acc;
          }, {}),
        );

        setApiFeedback(
          recommended.taskStatus === "running"
            ? `已生成 ${nextOutfits.length} 套搭配方案，时尚穿搭分析正在后台生成中。`
            : nextAnalysisCards.length > 0
            ? `已生成 ${nextOutfits.length} 套搭配方案，可选择进入下一步。`
            : `已生成 ${nextOutfits.length} 套搭配方案。`,
        );
      } catch (error) {
        batchUpdateWorkflow({
          outfitRecommendationTaskStatus: "failed",
          imageOutfitPlans: [],
          outfitAnalysisCards: [],
        });
        if (error instanceof ApiError && error.status !== 401) {
          setApiFeedback(error.message);
        } else if (error instanceof Error) {
          setApiFeedback(error.message);
        } else {
          setApiFeedback("生成穿搭方案失败，请重试。");
        }
        console.error("[ImageAssets] handleSelectRoleDirection recommendOutfits error:", error);
      } finally {
        useAppStore.getState().hideGlobalLoading();
        setIsGenerating(false);
      }
    }
  };

  const handleSelectOutfit = async (outfitId: string, source: Step1OutfitSource = "visual") => {
    if (step1Locked) return;
    const normalizedTargetId = normalizePlanId(outfitId);
    // 已选中的方案再次点击，不做任何操作
    if (normalizePlanId(selectedOutfitId) === normalizedTargetId) {
      return;
    }

    let projectId: string | null = null;
    if (isStep1PendingOutfitId(normalizedTargetId)) {
      setApiFeedback("时尚穿搭分析仍在生成中，请等待卡片就绪后再选择。");
      return;
    }
    try {
      if (!token) {
        setApiFeedback("请先登录后再继续。");
        return;
      }
      // 确认搭配需要项目已存在（URL 中已有 projectId）
      if (!urlProjectId) {
        setApiFeedback("请先上传主图创建项目。");
        return;
      }
      projectId = urlProjectId;
      // 选中穿搭方案（图片项目专用 API）
      await imageStep2Api.imageSelectOutfit(token, projectId, normalizedTargetId);
      batchUpdateWorkflow({
        imageSelectedOutfitId: normalizedTargetId,
      });
      updateProjectData({
        selectedOutfitPlanId: normalizedTargetId,
        projectStatus: "IMAGE_OUTFIT_SELECTED",
      });
      setApiFeedback(source === "analysis" ? "时尚穿搭方案已确认。" : "图片搭配方案已确认。");
    } catch (error) {
      // 401 已由 backendApi.request.ts 统一处理弹窗
      if (error instanceof ApiError && error.status === 401) {
        return;
      }
      const message = error instanceof ApiError ? error.message : "确认搭配失败，请稍后重试";
      setApiFeedback(message);
    }
  };



  const handleExitToProjects = () => {
    if (urlProjectId && projectData.projectStatus !== "IMAGE_READY_TO_PUBLISH" && projectData.projectStatus !== "IMAGE_PUBLISHED") {
      updateProjectData({ projectStatus: "IMAGE_DRAFT" });
    }
    navigate("/projects");
  };

  const hasGeneratedStep1Recommendations = generatedOutfits.length > 0;
  const hasSelectedOutfit = Boolean(selectedOutfitId);
  const canEnterStep2 =
    hasSelectedOutfit &&
    roleDirectionCards.length > 0 &&
    Boolean(step1SelectedRoleDirectionId);
  // 判断是否有主图（用于决定底部按钮状态）
  const hasAnyMainImage = step1OutfitModules.some((module) => Boolean(module.mainImage));
  // 获取第一个模块的 ID（用于触发上传）
  const firstModuleId = step1OutfitModules[0]?.moduleId ?? "";
  const requiresRoleDirectionConfirm = hasGeneratedStep1Recommendations && hasSelectedOutfit && !canEnterStep2;
  const step1EnterStep2CreditCost = Math.max(0, Math.floor(creditPricing.singleImageCreditCost) * 3);

  // 步骤进度引导状态（三步流程）
  // 步骤1完成：已上传服饰
  const step1Complete = hasAnyMainImage;
  // 步骤2完成：已确认角色预设
  const step2Complete = step1SelectedRoleDirectionId !== null;
  // 步骤3完成：已选择穿搭方案
  const step3Complete = hasSelectedOutfit;

  // 计算当前激活步骤（1-3）— 使用项目状态判断，防止重新生成时误跳
  const currentStep = useMemo(() => {
    // 没有主图则在第一步
    if (!hasAnyMainImage) return 1;

    // 使用项目状态判断进度
    const status = projectData.projectStatus as ImageProjectStatus;
    // 锁定状态（已进入 Step2）：显示第3步（穿搭方案已完成）
    if (step1Locked) return 3;
    if (status === "IMAGE_GARMENT_UPLOADED") return 2;  // 第2步：角色预设
    if (status === "IMAGE_ROLE_DIRECTION_CONFIRMED" || status === "IMAGE_OUTFIT_SELECTED" || status === "IMAGE_OUTFIT_CONFIRMED") return 3;  // 第3步：穿搭方案
    return 1;  // IMAGE_DRAFT 或其他状态，在第一步
  }, [hasAnyMainImage, projectData.projectStatus, step1Locked]);

  // 步骤折叠状态（记录用户主动展开/折叠的步骤）
  const [stepExpandState, setStepExpandState] = useState<Record<number, boolean>>({
    1: false,
    2: false,
    3: false,
  });

  // 锁定状态时：强制三步全部展开
  useEffect(() => {
    if (step1Locked) {
      setStepExpandState({ 1: true, 2: true, 3: true });
    }
  }, [step1Locked]);

  // 同步当前步骤为展开状态，其他步骤折叠
  // 锁定状态时：跳过自动折叠，保持三步全部展开
  useEffect(() => {
    if (step1Locked) return; // 锁定状态不自动折叠
    setStepExpandState((prev) => {
      const othersCollapsed = [1, 2, 3].every((s) => s === currentStep || !prev[s]);
      if (prev[currentStep] && othersCollapsed) return prev;
      const next: Record<number, boolean> = { 1: false, 2: false, 3: false };
      next[currentStep] = true;
      return next;
    });
  }, [currentStep, step1Locked]);


  // 切换步骤折叠状态
  const toggleStepExpand = useCallback((step: number) => {
    setStepExpandState((prev) => ({ ...prev, [step]: !prev[step] }));
  }, []);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto bg-[#fdfbf7] lg:flex-row lg:overflow-hidden">
      {showToast && (
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-50 animate-slide-down">
          <div className="bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3">
            <span className="material-icons-round text-green-400">check_circle</span>
            <div className="text-sm">
              <span className="font-bold">脚本已成功导入！</span>
              <span className="opacity-80 ml-1">请先完成选品与定妆，随后脚本将自动加载。</span>
            </div>
            <button onClick={() => setShowToast(false)} className="ml-2 opacity-60 hover:opacity-100">
              <span className="material-icons-round text-sm">close</span>
            </button>
          </div>
        </div>
      )}
      <input
        ref={step1ModuleUploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const target = step1ModuleUploadTarget;
          event.currentTarget.value = "";
          if (!file || !target) {
            return;
          }
          void handleUploadStep1ModuleImage(target, file);
        }}
      />
      <AssetModal
        isOpen={assetModalOpen}
        onClose={() => { setAssetModalOpen(false); setAssetModalTargetModuleId(null); }}
        onAssetCreated={(asset) => void handleAssetModalCreated(asset)}
        token={token}
        projectId={urlProjectId}
      />
      {step1ModuleLibraryImportOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            data-testid="step1-module-library-import-modal"
            className="flex h-[78vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <div className="text-base font-bold text-gray-900">从服饰库导入服饰</div>
                <div className="mt-1 text-xs text-gray-500">每张卡片代表 1 套服饰，可包含主图与多个视角图。</div>
              </div>
              <button
                type="button"
                onClick={() => setStep1ModuleLibraryImportOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                title="关闭"
              >
                <span className="material-icons-round text-lg">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
              {isLoadingLibrary ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
                  正在加载服饰库...
                </div>
              ) : moduleGarmentAssets.length < 1 ? (
                <div className="rounded-xl border border-dashed border-orange-200 bg-orange-50 p-8 text-center text-sm text-orange-800">
                  服饰库暂无可用服饰，请先上传素材。
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                  {moduleGarmentAssets.map((asset) => (
                    <button
                      key={`step1-module-garment-asset-${asset.id}`}
                      type="button"
                      onClick={() => handleImportStep1ModuleFromLibrary(asset)}
                      className="group overflow-hidden rounded-xl border border-gray-200 bg-white text-left transition hover:border-primary/40 hover:shadow-sm"
                    >
                      <div className="aspect-[3/4] overflow-hidden bg-gray-50">
                        <img src={getOssThumbnailUrl(asset.mainImageUrl, 400)} alt={asset.name} className="h-full w-full object-cover transition group-hover:scale-[1.02]"  loading="lazy" />
                      </div>
                      <div className="space-y-1 border-t border-gray-100 px-2.5 py-2">
                        <div className="line-clamp-1 text-xs font-semibold text-gray-800">
                          {asset.name?.trim() || "未命名服饰"}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                            {GARMENT_CATEGORY_LABELS[normalizeToLibraryCategory(asset.category)] ?? asset.category}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            {Math.max(1, asset.allImageUrls?.length ?? 1)} 张视角
                          </span>
                        </div>
                        {(asset.allImageUrls?.length ?? 0) > 1 ? (
                          <div className="grid grid-cols-3 gap-1 pt-0.5">
                            {(asset.allImageUrls ?? []).slice(0, 3).map((url) => (
                              <img
                                key={`${asset.id}-${url}`}
                                src={getOssThumbnailUrl(url, 120)}
                                alt="视角预览"
                                className="h-8 w-full rounded border border-gray-100 object-cover"
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {/* 加载更多按钮 */}
              {!isLoadingLibrary && moduleGarmentAssets.length > 0 && (
                <LoadMoreButton
                  isLoading={isLoadingMoreLibrary}
                  hasMore={garmentAssetsHasMore}
                  currentCount={moduleGarmentAssets.length}
                  totalCount={garmentAssetsTotal}
                  onClick={loadGarmentAssetsNextPage}
                  loadText="加载更多服饰"
                  noMoreText="已加载全部可用服饰"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="w-full lg:w-[400px] bg-white border-b lg:border-r lg:border-b-0 border-gray-100 flex flex-col z-10 shadow-lg shrink-0">
        {/* 面板头部：步骤进度 + 面板用途引导 */}
        <SidebarPanelHeader
          currentStep={1}
          projectStatus={projectData.projectStatus as ImageProjectStatus}
        />

        <div ref={step1LeftPanelScrollRef} className="lg:flex-1 lg:overflow-y-auto scrollbar-hide p-6 space-y-6">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">服饰模块</label>
            <div className="flex flex-nowrap items-center gap-2">
              <button
                type="button"
                data-testid="step1-module-import-library-button"
                onClick={handleOpenLibraryImport}
                disabled={step1Locked || isLoadingLibrary && step1ModuleLibraryImportOpen}
                className="inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-semibold leading-none text-gray-700 hover:border-primary/30 hover:text-primary disabled:opacity-50 disabled:cursor-wait"
              >
                {isLoadingLibrary && step1ModuleLibraryImportOpen ? (
                  <>
                    <span className="material-icons-round text-sm animate-spin">refresh</span>
                    加载中...
                  </>
                ) : (
                  <>
                    <span className="material-icons-round text-sm">inventory_2</span>
                    从服饰库导入
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {step1OutfitModules.map((module, moduleIndex) => {
              const vInfo = moduleVariantInfo.get(module.moduleId);
              return (
              <div
                key={module.moduleId}
                data-testid={`step1-outfit-module-${module.moduleId}`}
                className={`rounded-2xl border bg-white p-4 relative ${
                  vInfo ? 'border-primary/40' : 'border-gray-200'
                }`}
              >
                {/* 连线：在卡片级别统一绘制 */}
                {vInfo && vInfo.siblings.length > 1 && (() => {
                  const siblingIds = vInfo.siblings.map(s => s.moduleId);
                  const myIndex = siblingIds.indexOf(module.moduleId);
                  const isFirst = myIndex === 0;
                  const isLast = myIndex === siblingIds.length - 1;
                  const isMiddle = !isFirst && !isLast;

                  // 位置计算（所有元素统一使用）
                  const lineLeft = '-16px';  // 竖线位置：卡片外16px
                  const labelY = '32px';     // 标签中心位置
                  const cornerSize = '10px'; // 圆角尺寸
                  const lineWidth = '8px';   // 横线长度

                  return (
                    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
                      {/* 第一个模块：竖线向下 + 左上圆角 + 横线 + 圆点 */}
                      {isFirst && (
                        <>
                          {/* 竖线：从圆角底部向下延伸 */}
                          <div
                            className="absolute w-0.5 bg-primary"
                            style={{ left: lineLeft, top: `calc(${labelY} + ${cornerSize})`, bottom: '-40px' }}
                          />
                          {/* 左上圆角：borderLeft + borderTop，div 顶部在 labelY */}
                          <div
                            className="absolute"
                            style={{
                              left: lineLeft,
                              top: labelY,
                              width: cornerSize,
                              height: cornerSize,
                              borderLeft: '2px solid',
                              borderTop: '2px solid',
                              borderColor: 'var(--color-primary, #F97316)',
                              borderTopLeftRadius: '8px',
                              boxSizing: 'border-box'
                            }}
                          />
                          {/* 横线：从圆角右边缘到卡片边缘，中心对齐 borderTop */}
                          {/* borderTop 在 div 顶部(32px)，中心在 33px，横线 top=32px 使其中心也在 33px */}
                          <div
                            className="absolute h-0.5 bg-primary"
                            style={{
                              left: `calc(${lineLeft} + ${cornerSize})`,
                              top: labelY,
                              width: lineWidth
                            }}
                          />
                          {/* 圆点：在卡片左边缘，中心对齐横线 */}
                          <div
                            className="absolute w-1.5 h-1.5 bg-primary rounded-full"
                            style={{ left: '0px', top: `calc(${labelY} + 1px)`, transform: 'translateY(-50%)' }}
                          />
                        </>
                      )}
                      {/* 最后一个模块：竖线从上 + 左下圆角 + 横线 + 圆点 */}
                      {isLast && (
                        <>
                          {/* 竖线：从上方延伸到圆角顶部 */}
                          <div
                            className="absolute w-0.5 bg-primary"
                            style={{ left: lineLeft, top: '-40px', height: `calc(40px + ${labelY} - ${cornerSize})` }}
                          />
                          {/* 左下圆角：borderLeft + borderBottom，div 底部在 labelY */}
                          <div
                            className="absolute"
                            style={{
                              left: lineLeft,
                              top: `calc(${labelY} - ${cornerSize})`,
                              width: cornerSize,
                              height: cornerSize,
                              borderLeft: '2px solid',
                              borderBottom: '2px solid',
                              borderColor: 'var(--color-primary, #F97316)',
                              borderBottomLeftRadius: '8px',
                              boxSizing: 'border-box'
                            }}
                          />
                          {/* 横线：从圆角右边缘到卡片边缘，中心对齐 borderBottom */}
                          {/* borderBottom 在 div 底部(32px)，中心在 31px，横线 top=30px 使其中心也在 31px */}
                          <div
                            className="absolute h-0.5 bg-primary"
                            style={{
                              left: `calc(${lineLeft} + ${cornerSize})`,
                              top: `calc(${labelY} - 2px)`,
                              width: lineWidth
                            }}
                          />
                          {/* 圆点：在卡片左边缘，中心对齐横线 */}
                          <div
                            className="absolute w-1.5 h-1.5 bg-primary rounded-full"
                            style={{ left: '0px', top: `calc(${labelY} - 1px)`, transform: 'translateY(-50%)' }}
                          />
                        </>
                      )}
                      {/* 中间模块：竖线贯穿 */}
                      {isMiddle && (
                        <div
                          className="absolute w-0.5 bg-primary rounded-full"
                          style={{ left: lineLeft, top: '-40px', bottom: '-40px' }}
                        />
                      )}
                    </div>
                  );
                })()}
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-500">服饰 #{moduleIndex + 1}</span>
                    {/* 变体标识：主色标签 + 同款数量，点击可切换主色 */}
                    {vInfo && vInfo.siblings.length > 1 && (
                      <button
                        type="button"
                        disabled={step1Locked || vInfo.isPrimary}
                        title={vInfo.isPrimary ? '当前已是主色' : '点击切换为此主色'}
                        onClick={() => {
                          if (!vInfo.isPrimary && !step1Locked && token) {
                            const colorName = vInfo.variantColor || '此颜色';
                            confirm(`确定要将「${colorName}」设为主色吗？`, '切换主色')
                              .then((ok) => {
                                if (ok) {
                                  const assetId = module.mainImage?.libraryAssetId;
                                  if (assetId) {
                                    realBackendApi.setPrimaryVariant(token, assetId)
                                      .then(() => refreshGarmentModules?.())
                                      .catch(err => console.error('切换主色失败:', err));
                                  }
                                }
                              });
                          }
                        }}
                        className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-all ${
                          vInfo.isPrimary
                            ? 'bg-gradient-to-r from-primary to-primary/80 text-white font-medium shadow-sm'
                            : 'bg-gray-50 text-gray-600 hover:bg-primary/5 hover:text-primary border border-gray-200 hover:border-primary/30'
                        } ${step1Locked && !vInfo.isPrimary ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {vInfo.isPrimary ? (
                          <>
                            <span className="material-icons-round text-sm">star</span>
                            主色
                          </>
                        ) : (
                          <>
                            <span className="material-icons-round text-sm text-gray-400">link</span>
                            同款 {vInfo.siblings.length} 色
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-[11px] text-gray-400">其他视角最多 {STEP1_MAX_OTHER_VIEWS} 张</div>
                    <button
                      type="button"
                      onClick={() => handleDeleteStep1OutfitModule(module.moduleId)}
                      disabled={step1Locked || isUploadingModuleImage || step1OutfitModules.length <= 1}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={step1OutfitModules.length <= 1 ? "至少保留 1 个服饰模块" : "删除服饰模块"}
                    >
                      <span className="material-icons-round text-sm">delete</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div
                    role="button"
                    tabIndex={0}
                    data-testid={`step1-module-main-upload-${module.moduleId}`}
                    onClick={() => {
                      if (module.mainImage) {
                        setStep1ModulePreview({
                          url: module.mainImage.activeImageUrl,
                          label: `服饰 #${moduleIndex + 1} 主图`,
                          target: { moduleId: module.moduleId, target: "main" },
                        });
                        return;
                      }
                      setAssetModalTargetModuleId(module.moduleId);
                      setAssetModalOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        if (module.mainImage) {
                          setStep1ModulePreview({
                            url: module.mainImage.activeImageUrl,
                            label: `服饰 #${moduleIndex + 1} 主图`,
                            target: { moduleId: module.moduleId, target: "main" },
                          });
                          return;
                        }
                        setAssetModalTargetModuleId(module.moduleId);
                        setAssetModalOpen(true);
                      }
                    }}
                    className={`group relative h-40 overflow-hidden rounded-xl border border-dashed transition cursor-pointer ${
                      module.mainImage
                        ? "border-primary/40 bg-primary/5"
                        : "border-gray-300 bg-gray-50 hover:border-primary/40 hover:bg-white"
                    }`}
                  >
                    {/* 上传/识别中loading覆盖层 - 主图上传时显示 */}
                    {isUploadingModuleImage && !step1ModuleUploadTarget && module.mainImage && (
                      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
                        <span className="material-icons-round text-3xl text-white animate-spin">refresh</span>
                        <span className="mt-2 text-xs font-medium text-white">识别中...</span>
                      </div>
                    )}
                    {isUploadingModuleImage && !module.mainImage && (
                      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
                        <span className="material-icons-round text-3xl text-white animate-spin">refresh</span>
                        <span className="mt-2 text-xs font-medium text-white">上传识别中...</span>
                      </div>
                    )}
                    {module.mainImage ? (
                      <>
                        <img
                          src={getOssThumbnailUrl(module.mainImage.activeImageUrl, 400)}
                          alt="主图"
                          className={`${PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS} h-full w-full object-cover`}
                        />
                        <div className={`${PROJECT_FLOW_MEDIA_HOVER_OVERLAY_Z_CLASS} bg-black/45 opacity-0 transition-opacity group-hover:opacity-100`} />
                        <div className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[10px] text-white`}>
                          主图
                        </div>
                        {module.mainImage.flatLayImageUrl && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setStep1ModulePreview({
                                url: module.mainImage!.flatLayImageUrl!,
                                label: `服饰 #${moduleIndex + 1} 平铺图`,
                                target: null,
                              });
                            }}
                            className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} left-1/2 -translate-x-1/2 bottom-2 inline-flex h-6 items-center gap-1 rounded-full bg-white/80 backdrop-blur-sm px-2.5 text-[10px] font-medium leading-none text-gray-700 shadow-sm hover:bg-white transition-colors`}
                            title="查看平铺图"
                          >
                            <span className="material-icons-round !text-[10px]">
                              image
                            </span>
                            平铺图
                          </button>
                        )}
                        {/* 主图删除按钮已移除 */}
                      </>
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center text-gray-500">
                        <span className="material-icons-round text-3xl text-gray-400">add_photo_alternate</span>
                        <span className="mt-2 text-xs font-semibold">添加主要参考图</span>
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 h-40 flex flex-col items-center justify-center p-2">
                      {module.otherViews.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-gray-400 py-4">
                          <span className="material-icons-round text-xl">photo_library</span>
                          <span className="mt-1.5 text-[11px] font-medium">暂无其他视角图</span>
                        </div>
                      ) : (
                        <>
                          <div className="rounded bg-black/70 px-2 py-0.5 text-[10px] text-white mb-2">其他视角图</div>
                          <div className="grid grid-cols-3 gap-2">
                            {module.otherViews.map((view, viewIndex) => (
                              <div
                                key={view.imageId}
                                role="button"
                                tabIndex={0}
                                onClick={() =>
                                  setStep1ModulePreview({
                                    url: view.activeImageUrl,
                                    label: `服饰 #${moduleIndex + 1} 其他视角 ${viewIndex + 1}`,
                                    target: {
                                      moduleId: module.moduleId,
                                      target: "other",
                                      viewIndex,
                                    },
                                  })
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    setStep1ModulePreview({
                                      url: view.activeImageUrl,
                                      label: `服饰 #${moduleIndex + 1} 其他视角 ${viewIndex + 1}`,
                                      target: {
                                        moduleId: module.moduleId,
                                        target: "other",
                                        viewIndex,
                                      },
                                    });
                                  }
                                }}
                                className="group relative h-20 cursor-pointer overflow-hidden rounded-lg border border-gray-200 bg-white"
                              >
                                <img src={getOssThumbnailUrl(view.activeImageUrl, 200)} className={`${PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS} h-full w-full object-cover`}  loading="lazy" />
                                {/* 视角图删除按钮已移除 */}
                              </div>
                            ))}
                            {/* 添加其他视角图按钮已移除 */}
                          </div>
                        </>
                      )}
                    {module.otherViews.length > 0 && module.mainImage?.flatLayImageUrl ? (
                      <div className="mt-2 flex justify-center">
                        <button
                          type="button"
                          onClick={() => {
                            setStep1ModulePreview({
                              url: module.mainImage!.flatLayImageUrl!,
                              label: `服饰 #${moduleIndex + 1} 平铺图`,
                              target: null,
                            });
                          }}
                          className="inline-flex h-6 items-center gap-1 rounded-full bg-white/80 backdrop-blur-sm px-2.5 text-[10px] font-medium leading-none text-gray-700 shadow-sm hover:bg-white transition-colors"
                          title="查看平铺图"
                        >
                          <span className="material-icons-round !text-[10px]">
                            image
                          </span>
                          平铺图
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    value={module.subjectName}
                    onChange={(event) => handleStep1ModuleFieldChange(module.moduleId, "subjectName", event.target.value)}
                    maxLength={20}
                    placeholder="主体名称"
                    disabled={step1Locked}
                    className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <select
                    value={normalizeStep1OutfitSubjectType(module.subjectType, { allowEmpty: true, fallback: "" })}
                    onChange={(event) => handleStep1ModuleFieldChange(module.moduleId, "subjectType", event.target.value)}
                    disabled={step1Locked}
                    className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">服装类别</option>
                    {STEP1_OUTFIT_SUBJECT_TYPE_OPTIONS.map((option) => (
                      <option key={`${module.moduleId}-${option}`} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                      value={module.subjectDescription}
                      onChange={(event) => handleStep1ModuleFieldChange(module.moduleId, "subjectDescription", event.target.value)}
                      maxLength={200}
                      placeholder="主体描述"
                      disabled={step1Locked}
                      className="mt-2 h-20 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
                />
                {module.multiViewWarning ? (
                  <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-[11px] text-orange-700">
                    {module.multiViewWarning}
                  </div>
                ) : null}
              </div>
            );
            })}
          </div>

          {/* 新增服饰按钮（锁定时隐藏） */}
          {!step1Locked && step1OutfitModules.length < STEP1_MAX_OUTFIT_MODULES && (
            <button
              type="button"
              data-testid="step1-module-add-button"
              onClick={handleAddStep1OutfitModule}
              className="mt-4 w-full inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 text-sm font-semibold text-primary hover:border-primary hover:bg-primary/10 transition-colors"
            >
              <span className="material-icons-round text-lg">add</span>
              新增服饰
            </button>
          )}

          {isUploadingModuleImage ? (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
              图片上传处理中，完成后会自动入服饰库...
            </div>
          ) : null}
        </div>

        <div className="p-6 border-t border-gray-100">
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
            通过底部主按钮触发生成搭配与进入下一步。
          </div>
        </div>
      </div>

      <div className="w-full h-auto lg:h-full lg:flex-1 flex flex-col relative lg:min-h-0 bg-[#fdfbf7]">
        <StepContentHeader stepNumber={1} title="服饰搭配" icon="checkroom" subtitle="上传服饰单品，AI 将自动生成搭配方案。" badges={step1Locked ? <span className="inline-flex items-center gap-1 text-amber-600"><span className="material-icons-round text-sm">lock</span>已锁定</span> : apiFeedback ? <span className="max-w-[200px] truncate">{apiFeedback}</span> : undefined} />

        {/* 步骤进度引导卡片 - 始终显示 */}
        <div className="flex-1 lg:overflow-y-auto p-4 pb-28 md:px-8 md:pt-8">
          <div className="mb-6 max-w-6xl mx-auto space-y-3">
            {/* 步骤1：上传服饰 */}
            <StepProgressCard
              stepNumber={1}
              title="上传服饰"
              summary={hasAnyMainImage ? `已上传 ${step1OutfitModules.length} 件服饰` : ""}
              status={hasAnyMainImage && !isUploadingModuleImage ? "completed" : "current"}
              expanded={stepExpandState[1]}
              onToggle={() => toggleStepExpand(1)}
              onClickHeader={!hasAnyMainImage ? () => { setAssetModalOpen(true); return true; } : undefined}
            >
              {/* 步骤1展开内容：显示上传状态 */}
              <div className="flex flex-col items-center justify-center text-gray-400 py-8">
                {isUploadingModuleImage ? (
                  <div className="flex flex-col items-center">
                    <div className="relative w-16 h-16 mb-3">
                      <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
                      <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="material-icons-round text-lg text-primary">auto_awesome</span>
                      </div>
                    </div>
                    <p className="font-medium text-primary text-sm">AI 正在识别图片...</p>
                  </div>
                ) : !hasAnyMainImage ? (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={handleStep1QuickUpload}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleStep1QuickUpload(); } }}
                    className="py-10 cursor-pointer group"
                  >
                    <div className="text-center">
                      {/* 装饰图标 */}
                      <div className="relative mx-auto w-20 h-20 mb-4">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-purple-100 rounded-2xl group-hover:from-primary/20 group-hover:to-purple-200 transition-all duration-300"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="material-icons-round text-3xl text-primary/70 group-hover:text-primary transition-colors">upload_file</span>
                        </div>
                      </div>

                      <p className="text-base font-semibold text-gray-700 mb-1">上传你的第一件服饰</p>
                      <p className="text-sm text-gray-400 mb-5">支持 JPG、PNG 格式，也点击左侧精细化上传</p>

                      {/* 快捷指引 */}
                      <div className="flex items-center justify-center gap-6 text-xs text-gray-400">
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-400 flex items-center justify-center text-xs">1</span>
                          <span>上传主图</span>
                        </div>
                        <span className="text-gray-300">→</span>
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-purple-50 text-purple-400 flex items-center justify-center text-xs">2</span>
                          <span>AI 生成搭配</span>
                        </div>
                        <span className="text-gray-300">→</span>
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-400 flex items-center justify-center text-xs">3</span>
                          <span>定妆出图</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                      <span className="material-icons-round text-2xl text-gray-300">check_circle</span>
                    </div>
                    <p className="font-medium text-sm">
                      已上传 {step1OutfitModules.length} 件服饰，可继续点击左侧栏精细化添加或生成搭配
                    </p>
                  </>
                )}
              </div>
            </StepProgressCard>

            {/* 步骤2：选择角色预设 */}
            <StepProgressCard
              stepNumber={2}
              title="选择角色预设"
              summary={step2Complete ? `已确认预设：${runtimeRoleDirections.find(d => d.directionId === step1SelectedRoleDirectionId)?.styleSummary || ""}` : ""}
              status={currentStep === 2 ? "current" : step2Complete ? "completed" : roleDirectionCards.length > 0 ? "pending" : roleDirectionGenerating ? "current" : "locked"}
              expanded={stepExpandState[2]}
              onToggle={() => roleDirectionCards.length > 0 || roleDirectionGenerating || step2Complete ? toggleStepExpand(2) : null}
            >
              {/* 步骤2展开内容：显示角色预设选择 */}
              {stepExpandState[2] && (
                roleDirectionGenerating ? (
                  <div className="space-y-3">
                    {/* 角色预设骨架屏 — 5个，横排滚动 */}
                    <div className="relative overflow-x-auto pb-2 scrollbar-hide py-4 px-2">
                      <div className="flex gap-3">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <div
                            key={index}
                            className="relative flex-shrink-0 w-[200px] rounded-[18px] overflow-hidden bg-white border border-gray-100 shadow-sm"
                          >
                            {/* 加载中标签 */}
                            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-full bg-primary/90 px-2.5 py-0.5 text-[11px] font-medium text-white shadow-sm">
                              <span className="material-icons-round text-[12px] animate-spin">autorenew</span>
                              加载中
                            </div>
                            {/* 色块区域骨架 */}
                            <div className="h-40 bg-gray-100 flex items-center justify-center">
                              <div className="w-20 h-20 rounded-full bg-gray-200 animate-pulse" />
                            </div>
                            {/* 信息区域骨架 */}
                            <div className="px-4 pt-3.5 pb-4 space-y-2">
                              <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse" />
                              <div className="flex gap-1">
                                <div className="h-5 w-14 bg-gray-100 rounded-full animate-pulse" />
                                <div className="h-5 w-10 bg-gray-100 rounded-full animate-pulse" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-400 py-2">
                      <span className="material-icons-round text-base animate-spin">autorenew</span>
                      <span>正在生成角色预设，请稍候...</span>
                    </div>
                  </div>
                ) : roleDirectionCards.length > 0 ? (
                  <div className="space-y-3">
                    {/* 角色预设卡片 — 横排滚动 */}
                    <div className="relative">
                      {/* 左箭头 */}
                      <button
                        type="button"
                        onClick={handleRoleDirectionPrev}
                        className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white/90 shadow-md flex items-center justify-center text-gray-500 hover:text-primary transition"
                      >
                        <span className="material-icons-round text-lg">chevron_left</span>
                      </button>
                      {/* 滚动容器 */}
                      <div
                        ref={roleDirectionScrollRef}
                        onScroll={handleRoleDirectionScroll}
                        className="overflow-x-auto pb-2 scrollbar-hide py-4 pl-2 pr-16"
                      >
                        <div className="flex gap-3">
                          {runtimeRoleDirections.map((direction, index) => {
                            const selected = step1SelectedRoleDirectionId === direction.directionId;
                            const avatarRender = resolveRoleDirectionAvatarRenderModel(index, direction.gender, direction.portraitUrl);
                            return (
                              <button
                                key={direction.directionId}
                                type="button"
                                data-testid={`step2-role-${direction.directionId}`}
                                onClick={async () => {
                                  if (!step1Locked && !selected) {
                                    const confirmed = await confirm("确定选择此角色预设吗？", "选择角色预设");
                                    if (confirmed) {
                                      handleSelectRoleDirection(direction.directionId, runtimeRoleDirections);
                                    }
                                  }
                                }}
                                disabled={step1Locked}
                                aria-pressed={selected}
                                className={`flex-shrink-0 snap-start w-[200px] rounded-[18px] overflow-hidden text-left transition-all duration-300 ease-out ${
                                  selected
                                    ? "shadow-[0_0_0_3px_var(--color-primary),0_12px_32px_rgba(99,102,241,0.3)] -translate-y-1"
                                    : "bg-white border border-black/5 shadow-sm hover:shadow-md hover:border-primary/30"
                                }`}
                              >
                                {/* 上方渐变色块区 */}
                                <div className={`relative h-40 bg-gradient-to-br ${getGradientByGender(direction.gender)} flex items-center justify-center overflow-hidden`}>
                                  {selected && (
                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,var(--color-primary)_15%,transparent_70%)]" />
                                  )}
                                  {/* 头像 */}
                                  <div className="relative w-20 h-20 rounded-full overflow-hidden border-[3px] border-white/80 shadow-lg z-10">
                                    <img
                                      className="w-full h-full object-cover"
                                      src={avatarRender.imageUrl}
                                      alt={`${direction.styleSummary || `角色预设 ${index + 1}`} 头像`}
                                    />
                                  </div>
                                  {/* 选中角标 */}
                                  {selected && (
                                    <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center shadow-md z-20">
                                      <span className="material-icons-round text-white text-sm">check</span>
                                    </div>
                                  )}
                                </div>
                                {/* 下方信息区 */}
                                <div className="px-4 pt-3.5 pb-4">
                                  <div className="text-[15px] font-bold text-gray-900 truncate">
                                    {Array.isArray(direction.styleWords) && direction.styleWords.length > 0
                                      ? direction.styleWords.slice(0, 2).join(" / ")
                                      : `预设 ${index + 1}`}
                                  </div>
                                  <div className="flex flex-wrap gap-1 mt-2 h-[46px] overflow-hidden">
                                    {(direction.gender || direction.age != null) && (
                                      <span className={`text-[11px] leading-[18px] px-2 py-0.5 rounded-full ${selected ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-600"}`}>
                                        {[
                                          direction.gender === "male" ? "男" : direction.gender === "female" ? "女" : null,
                                          direction.age != null ? `${direction.age}岁` : null,
                                        ].filter(Boolean).join(" · ")}
                                      </span>
                                    )}
                                    {direction.ethnicityOrRegion && (
                                      <span className={`text-[11px] leading-[18px] px-2 py-0.5 rounded-full ${selected ? "bg-primary/10 text-primary" : "bg-gray-50 text-gray-400"}`}>
                                        {REGION_LABEL[direction.ethnicityOrRegion] ?? direction.ethnicityOrRegion}
                                      </span>
                                    )}
                                    {/* 显示所有风格词 */}
                                    {Array.isArray(direction.styleWords) && direction.styleWords.map((word, wi) => (
                                      <span key={wi} className={`text-[11px] leading-[18px] px-2 py-0.5 rounded-full ${selected ? "bg-primary/10 text-primary" : "bg-gray-50 text-gray-400"}`}>
                                        {word}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {/* 右箭头 */}
                      {roleDirectionCanScrollRight && (
                        <button
                          type="button"
                          onClick={handleRoleDirectionNext}
                          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white/90 shadow-md flex items-center justify-center text-gray-500 hover:text-primary transition"
                        >
                          <span className="material-icons-round text-lg">chevron_right</span>
                        </button>
                      )}
                    </div>
                    {/* 建议调整面板 — 用于选择性别年龄生成新预设（锁定时隐藏） */}
                    {!step1Locked && (
                      <Step1RoleDirectionSuggestionPanel
                        suggestions={step1RoleDirectionSuggestions}
                        remainingCount={step1RoleDirectionSuggestionRemaining}
                        disabled={step1RoleDirectionSuggestionLocked || roleDirectionGenerating}
                        onApply={(suggestion) => {
                          void handleGenerateRoleDirectionFromGarments(suggestion);
                        }}
                      />
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* 引导用户选择性别年龄 */}
                    <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-primary/40 bg-gradient-to-r from-primary/5 via-purple-50 to-orange-50 px-5 py-4 text-center">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(128,90,213,0.08),transparent_60%)]" />
                      <div className="relative flex flex-col items-center gap-2">
                        <div className="flex items-center gap-2">
                          <span className="material-icons-round text-2xl text-primary">face</span>
                          <span className="text-base font-bold text-gray-900">先选择角色方向</span>
                        </div>
                        <p className="text-sm text-gray-600 whitespace-nowrap">
                          点击下方性别年龄卡片，AI 将根据你的服饰生成匹配的角色预设
                        </p>
                      </div>
                    </div>
                    {/* 建议调整面板 — 用于选择性别年龄生成预设（锁定时隐藏） */}
                    {!step1Locked && (
                      <Step1RoleDirectionSuggestionPanel
                        suggestions={step1RoleDirectionSuggestions}
                        remainingCount={step1RoleDirectionSuggestionRemaining}
                        disabled={step1RoleDirectionSuggestionLocked || roleDirectionGenerating}
                        onApply={(suggestion) => {
                          void handleGenerateRoleDirectionFromGarments(suggestion);
                        }}
                      />
                    )}
                  </div>
                )
              )}
              {currentStep !== 2 && roleDirectionCards.length > 0 && !step2Complete && (
                <div className="text-xs text-gray-400">
                  共 {roleDirectionCards.length} 个角色预设，展开选择
                </div>
              )}
            </StepProgressCard>

            {/* 步骤3：选择穿搭方案 */}
            <StepProgressCard
              stepNumber={3}
              title="选择穿搭方案"
              summary={step3Complete ? `已选择方案` : ""}
              status={currentStep === 3 ? "current" : step3Complete ? "completed" : step2Complete ? "pending" : "locked"}
              expanded={stepExpandState[3]}
              onToggle={() => step2Complete ? toggleStepExpand(3) : null}
            >
              {/* 步骤3展开内容：显示穿搭分析卡片 */}
              {currentStep === 3 && (
                generatedOutfits.length === 0 && analysisCardsToRender.length === 0 ? (
                  <div className="space-y-3">
                    {/* 加载骨架 */}
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="rounded-2xl border border-gray-200 bg-white p-5 animate-pulse">
                        <div className="h-4 bg-gray-200 rounded w-1/3 mb-3"></div>
                        <div className="h-3 bg-gray-100 rounded w-full mb-2"></div>
                        <div className="h-3 bg-gray-100 rounded w-2/3"></div>
                      </div>
                    ))}
                    {/* 生成按钮 */}
                    <div className="flex justify-center">
                      <button
                        onClick={handleGenerate}
                        disabled={isGenerating || !hasAnyMainImage}
                        className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className={`material-icons-round ${isGenerating ? "animate-spin" : ""}`}>
                          {isGenerating ? "autorenew" : "auto_awesome"}
                        </span>
                        {isGenerating ? "生成中..." : "生成穿搭方案"}
                      </button>
                    </div>
                  </div>
                ) : analysisCardsToRender.length > 0 ? (
                  <div className="space-y-3">
                    {/* 进度条 */}
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <span className="material-icons-round text-base text-emerald-600">auto_awesome</span>
                            AI搜索分析
                          </div>
                          <div className="mt-1 text-xs text-slate-600">
                            已生成 {analysisCardsToRender.length} 套穿搭分析方案，点击选择一个方案。
                          </div>
                        </div>
                        <button
                          onClick={handleGenerate}
                          disabled={step1Locked || isGenerating}
                          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-orange-100 px-3 py-1.5 text-xs font-semibold text-orange-600 hover:bg-orange-200 disabled:opacity-50"
                        >
                          <span className={`material-icons-round text-sm ${isGenerating ? "animate-spin" : ""}`}>refresh</span>
                          {isGenerating ? "生成中..." : "重新生成"}
                        </button>
                      </div>
                    </div>

                    {/* 后台任务进度条 */}
                    <GlobalProgressIndicator
                      variant="inline"
                      visible={isGenerating}
                      title="AI 正在后台生成时尚穿搭分析..."
                      progress={generateProgress}
                      hint="正在分析服装风格、匹配推荐方案..."
                    />

                    {/* 趋势参考来源 */}
                    {analysisCardsToRender.some((c) => c.groundingSources && c.groundingSources.length > 0) && (
                      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                        <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-2">
                          <span className="material-icons-round text-sm text-gray-400">public</span>
                          <span className="font-medium">趋势参考来源：</span>
                          <span className="text-gray-400">本次 AI 分析基于以下趋势数据</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {analysisCardsToRender
                            .flatMap((c) => c.groundingSources ?? [])
                            .filter((s, i, arr) => arr.findIndex((x) => x.url === s.url) === i)
                            .slice(0, 6)
                            .map((source, si) => (
                              <a
                                key={si}
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-100 text-xs text-gray-600 hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition"
                              >
                                <span className="material-icons-round text-xs text-gray-400">open_in_new</span>
                                {source.title || source.url}
                              </a>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* 选择引导提示 */}
                    {!step1Locked && !selectedOutfitId && !isGenerating && (
                      <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-primary/40 bg-gradient-to-r from-primary/5 via-purple-50 to-orange-50 px-5 py-4 text-center">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(128,90,213,0.08),transparent_60%)]" />
                        <div className="relative flex flex-col items-center gap-2">
                          <div className="flex items-center gap-2">
                            <span className="inline-block" style={{ transform: "rotate(180deg)" }}>
                              <span className="material-icons-round text-2xl text-primary animate-bounce">touch_app</span>
                            </span>
                            <span className="text-base font-bold text-gray-900">选择一套你喜欢的搭配方案</span>
                          </div>
                          <p className="text-sm text-gray-600 max-w-sm">
                            点击下方任意卡片进行选择，选中后即可进入下一步
                          </p>
                        </div>
                      </div>
                    )}

                    {/* 穿搭分析卡片网格 */}
                    {step1Locked && (
                      <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                        <span className="material-icons-round text-sm">lock</span>
                        <span>穿搭方案已锁定，不可修改</span>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {analysisCardsToRender.map((card) => (
                        <div
                          key={`analysis-wrap-${card.planId}`}
                          data-testid={`step3-analysis-wrap-${card.planId}`}
                          className={analysisCardsToRender.length === 1 ? "md:col-span-2" : ""}
                        >
                          <OutfitAnalysisCard
                            card={card}
                            selected={isAnalysisSelected(card.planId)}
                            disabled={step1Locked}
                            status={card.status ?? "ready"}
                            onSelect={() => void handleSelectOutfit(card.planId, "analysis")}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* 后台任务进度条 */}
                    <GlobalProgressIndicator
                      variant="inline"
                      visible={isGenerating}
                      title="AI 正在后台生成时尚穿搭分析..."
                      progress={generateProgress}
                      hint="正在分析服装风格、匹配推荐方案..."
                    />
                    {/* 无数据提示 */}
                    {!isGenerating && (
                      <div className="flex justify-center">
                        <div className="rounded-xl border border-dashed border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900 text-center max-w-md">
                          暂无时尚穿搭分析数据，等待接入或联系管理员开启 API。
                        </div>
                      </div>
                    )}
                  </div>
                )
              )}
            </StepProgressCard>
          </div>
        </div>
      </div>

      {step1ModulePreview ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setStep1ModulePreview(null)}
        >
          <div className="absolute right-4 top-4 flex items-center gap-2">
            {!step1Locked && step1ModulePreview.target && (
              <button
                type="button"
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-600/90 p-0 text-white shadow-lg backdrop-blur-sm transition-transform hover:scale-110"
                title="删除当前图片"
                onClick={(event) => {
                  event.stopPropagation();
                  handleDeleteStep1ModuleImage(step1ModulePreview.target!);
                  setStep1ModulePreview(null);
                }}
              >
                <span className="material-icons-round">delete</span>
              </button>
            )}
            <button
              type="button"
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black/60 p-0 text-white shadow-lg backdrop-blur-sm transition-transform hover:scale-110"
              title="关闭预览"
              onClick={(event) => {
                event.stopPropagation();
                setStep1ModulePreview(null);
              }}
            >
              <span className="material-icons-round">close</span>
            </button>
          </div>
          <img
            src={step1ModulePreview.url}
            alt={step1ModulePreview.label}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}

      <div data-testid="step1-floating-footer" className="fixed bottom-6 left-0 right-0 z-40 flex justify-center pointer-events-none lg:left-[400px] lg:right-0">
        <div className="bg-white/60 backdrop-blur-md border border-gray-200/50 rounded-2xl sm:rounded-full px-2 sm:px-3 py-2 shadow-xl shadow-gray-200/30 pointer-events-auto flex items-center justify-center gap-2 sm:gap-4 w-[calc(100%-1rem)] sm:w-auto max-w-[960px] transform transition-all hover:scale-[1.01] active:scale-[0.99]">
          <Button variant="ghost" onClick={handleExitToProjects} className="rounded-full px-3 sm:px-4 text-gray-500 hover:text-gray-900 whitespace-nowrap shrink-0">
            <span className="material-icons-round text-lg mr-1">arrow_back</span>
            <span className="hidden md:inline">返回我的项目</span>
          </Button>

          <div className="h-4 w-px bg-gray-200 hidden sm:block" />

          <div className="text-[10px] sm:text-xs text-gray-400 font-medium px-1 sm:px-2 min-w-0 max-w-[42vw] sm:max-w-[320px] truncate">
            {step1Locked ? "已完成" : !hasAnyMainImage
              ? "请先上传服饰主图"
              : !hasGeneratedStep1Recommendations
                ? isGenerating
                  ? "AI 正在分析搭配..."
                  : "请先生成搭配"
                : selectedOutfitId
                  ? canEnterStep2
                    ? "方案与推荐角色预设已确认"
                    : "已确认搭配方案"
                  : "请先选择搭配方案"}
          </div>

          <div className="h-4 w-px bg-gray-200 hidden sm:block" />

          <div className="shrink-0">
            {step1Locked ? (
              <Button
                onClick={() => {
                  navigate(`/image-create/${urlProjectId}/step2`);
                }}
                className="rounded-full px-4 sm:px-6 bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/20 whitespace-nowrap"
              >
                <span className="material-icons-round text-sm mr-1">lock</span>
                <span className="hidden md:inline">下一步</span>
                <span className="md:hidden">下一步</span>
                <span className="material-icons-round text-lg ml-1">arrow_forward</span>
              </Button>
            ) : (
            <Button
              onClick={async () => {
                // 如果没有主图，触发上传
                if (!hasAnyMainImage) {
                  setAssetModalOpen(true);
                  return;
                }
                if (!hasGeneratedStep1Recommendations) {
                  await handleGenerate();
                  return;
                }
                if (requiresRoleDirectionConfirm) {
                  if (roleDirectionCards.length < 1) {
                    setApiFeedback("推荐角色预设尚未准备好，请先生成时尚搭配后再试。");
                    return;
                  }
                  setStepExpandState((prev) => ({ ...prev, 3: true }));
                  requestAnimationFrame(() => {
                    document.querySelector('[data-step="3"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
                  });
                  setApiFeedback("请在下方选择推荐角色预设，再进入定妆。");
                  return;
                }
                if (!canEnterStep2) {
                  setApiFeedback("请先选择推荐角色预设后再进入定妆。");
                  return;
                }
                // 确认进入定妆阶段
                const confirmed = await confirm(
                  "确认进入定妆阶段？",
                  "进入定妆",
                );
                if (!confirmed) {
                  return;
                }
                try {
                  setIsEnteringStep2(true);
                  // 状态为 IMAGE_OUTFIT_SELECTED 时，先调用确认穿搭 API
                  const status = projectData.projectStatus as ImageProjectStatus;
                  if (status === "IMAGE_OUTFIT_SELECTED" && token && urlProjectId) {
                    try {
                      await imageStep1Api.imageStep1ConfirmOutfit(token, urlProjectId);
                      updateProjectData({ projectStatus: "IMAGE_OUTFIT_CONFIRMED" });
                    } catch (error) {
                      if (error instanceof ApiError && error.status === 401) {
                        return;
                      }
                      setApiFeedback(error instanceof ApiError ? error.message : "确认穿搭失败，请重试");
                      return;
                    }
                  }
                  navigate(`/image-create/${urlProjectId}/step2`);
                } finally {
                  setIsEnteringStep2(false);
                }
              }}
              disabled={
                !hasAnyMainImage
                  ? isUploadingModuleImage
                  : !hasGeneratedStep1Recommendations
                    ? isGenerating || isUploadingModuleImage || roleDirectionGenerating
                    : !hasSelectedOutfit || isEnteringStep2 || isGenerating || roleDirectionGenerating
              }
              data-testid="step1-footer-primary-action"
              aria-label={
                !hasAnyMainImage
                  ? "上传服饰"
                  : !hasGeneratedStep1Recommendations
                    ? "生成搭配"
                    : requiresRoleDirectionConfirm
                      ? "选择推荐角色预设 下一步"
                      : "确认进入定妆 下一步"
              }
              className="rounded-full px-4 sm:px-6 bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/20 whitespace-nowrap disabled:opacity-70 transition-transform animate-pulse-scale"
            >
              {(roleDirectionGenerating || (!hasAnyMainImage && isUploadingModuleImage) || (hasAnyMainImage && !hasGeneratedStep1Recommendations && (isGenerating || isUploadingModuleImage))) && (
                <span className="material-icons-round text-lg mr-1 animate-spin">refresh</span>
              )}
              <span className="hidden md:inline flex items-center gap-2">
                {roleDirectionGenerating
                  ? "角色预设生成中..."
                  : !hasAnyMainImage
                    ? isUploadingModuleImage
                      ? "上传中..."
                      : "上传服饰"
                    : (() => {
                        const status = projectData.projectStatus as ImageProjectStatus;
                        if (status === "IMAGE_GARMENT_UPLOADED") {
                          return roleDirectionGenerating ? "生成中..." : "确认角色预设";
                        }
                        if (status === "IMAGE_ROLE_DIRECTION_CONFIRMED") {
                          return isGenerating ? "生成中..." : selectedOutfitId ? "已选择方案" : "选择穿搭方案";
                        }
                        if (status === "IMAGE_OUTFIT_SELECTED" || status === "IMAGE_OUTFIT_CONFIRMED") {
                          return "进入定妆";
                        }
                        // IMAGE_DRAFT 或其他状态
                        return isGenerating ? "生成中..." : "生成搭配";
                      })()}
                {canEnterStep2 && step1EnterStep2CreditCost > 0 && (
                  <>
                    <span className="w-px h-4 bg-white/30" />
                    <span className="inline-flex items-center rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">
                      {step1EnterStep2CreditCost}积分
                    </span>
                  </>
                )}
              </span>
              <span className="md:hidden">
                {roleDirectionGenerating
                  ? "生成中..."
                  : !hasAnyMainImage
                    ? (isUploadingModuleImage ? "上传中" : "上传")
                    : (() => {
                        const status = projectData.projectStatus as ImageProjectStatus;
                        if (status === "IMAGE_GARMENT_UPLOADED") {
                          return roleDirectionGenerating ? "生成中" : "确认预设";
                        }
                        if (status === "IMAGE_ROLE_DIRECTION_CONFIRMED") {
                          return isGenerating ? "生成中" : selectedOutfitId ? "已选择" : "选方案";
                        }
                        if (status === "IMAGE_OUTFIT_SELECTED" || status === "IMAGE_OUTFIT_CONFIRMED") {
                          return step1EnterStep2CreditCost > 0 ? `定妆(${step1EnterStep2CreditCost})` : "定妆";
                        }
                        // IMAGE_DRAFT 或其他状态
                        return isGenerating ? "生成中" : "生成";
                      })()}
              </span>
              <span className="material-icons-round text-lg ml-1">arrow_forward</span>
            </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
