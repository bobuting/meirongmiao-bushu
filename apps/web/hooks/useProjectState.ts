import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore, emptyProjectData } from "../store/useAppStore";
import type { ProjectState } from "../store/useAppStore";
import { realProjectsApi } from "../services/realApi";
import { backendApi } from "../services/backendApi";
import { realProjectGarmentAssocApi } from "../services/realApi/project-garment-assoc";
import { realOutfitChangeApi } from "../services/realApi/outfit-change";
import { queryClient as globalQueryClient } from "../App";
import {
  normalizeToLibraryCategory,
  uniqTrimmed,
  STEP1_MAX_OTHER_VIEWS,
} from "../pages/shared/step1-utils";
import type { Step1LibraryCategory } from "../../../src/contracts/step1-outfit-module-contract";

// ========== 类型定义 ==========

/** 项目角色项（workflow 中存储的结构） */
export interface ProjectCharacterItem {
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
    fiveViewOssImageUrl?: string | null;
    tags?: string[];
    kind?: string;
    status?: string;
    views?: string[];
    activeFiveViewStatus?: "pending" | "processing" | "ready" | "failed" | null;
  } | null;
}

/** 五视图角色简要信息（后端返回） */
export interface FiveViewCharacterBrief {
  id: string;
  name: string;
  status: "processing" | "ready";
  thumbnailUrl: string | null;
  fiveViewOssImageUrl: string | null;
}

// ========== Query Keys ==========

/** 可加载的数据分类 */
export type ProjectLoadCategory = 'garments' | 'outfits' | 'step1State' | 'characters' | 'project' | 'outfitChange';

const ALL_CATEGORIES: ProjectLoadCategory[] = ['garments', 'outfits', 'step1State', 'characters', 'project', 'outfitChange'];

// TanStack Query keys - 按分类隔离，支持细粒度缓存控制
export const projectQueryKeys = {
  garments: (projectId: string) => ['project', projectId, 'garments'] as const,
  outfits: (projectId: string) => ['project', projectId, 'outfits'] as const,
  step1State: (projectId: string) => ['project', projectId, 'step1State'] as const,
  characters: (projectId: string) => ['project', projectId, 'characters'] as const,
  project: (projectId: string) => ['project', projectId, 'info'] as const,
  outfitChange: (projectId: string) => ['project', projectId, 'outfitChange'] as const,
  all: (projectId: string) => ['project', projectId] as const,
};

// ========== Query Hooks ==========

/**
 * 服饰模块 Query
 */
export function useProjectGarmentsQuery(projectId: string | null | undefined) {
  const token = useAppStore((s) => s.token);
  const updateWorkflowForProject = useAppStore((s) => s.updateWorkflowForProject);

  return useQuery({
    queryKey: projectQueryKeys.garments(projectId ?? ''),
    queryFn: async () => {
      if (!projectId || !token) return null;
      const res = await realProjectGarmentAssocApi.listProjectGarmentAssocs(token, projectId);
      const garmentModules = res.items.map((assoc) => {
        const asset = assoc.asset;
        const mainImageUrl = asset?.mainImageUrl?.trim() || null;
        const resolvedCategory: Step1LibraryCategory = normalizeToLibraryCategory(asset?.category ?? "");
        const subjectType = resolveModuleSubjectTypeByLibraryCategory(resolvedCategory);
        const resolvedAssetName = typeof asset?.name === "string" ? asset.name.trim() : "";
        const resolvedDescription = typeof asset?.description === "string" ? asset.description.trim() : "";

        const allImageUrls = uniqTrimmed([
          asset?.mainImageUrl,
          asset?.subImageUrl1,
          asset?.subImageUrl2,
          asset?.subImageUrl3,
        ].filter(Boolean) as string[]);
        const otherViewUrls = mainImageUrl ? allImageUrls.filter((url) => url !== mainImageUrl).slice(0, STEP1_MAX_OTHER_VIEWS) : [];

        const mainImage = mainImageUrl ? {
          imageId: `step1-module-image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          imageUrl: mainImageUrl,
          libraryAssetId: assoc.garmentAssetId,
          fileName: resolvedAssetName || null,
          classification: {
            category: resolvedCategory,
            confidence: 0.95,
            viewLabel: "main" as const,
            reason: "library-import",
            feedbackCategory: null,
            feedbackConfidence: null,
            feedbackViewLabel: null,
            feedbackReason: null,
            feedbackMode: "none" as const,
          },
          removedBgImageUrl: null,
          activeImageUrl: mainImageUrl,
          removeBgStatus: "idle" as const,
          removeBgError: null,
          flatLayImageUrl: asset?.flatLayImageUrl?.trim() || null,
          variantGroupId: asset?.variantGroupId ?? null,
          variantColor: asset?.variantColor ?? null,
          mainColor: asset?.mainColor ?? null,
          isPrimaryVariant: asset?.isPrimaryVariant ?? false,
        } : null;

        const otherViews = otherViewUrls.map((url, idx) => ({
          imageId: `step1-module-image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${idx}`,
          imageUrl: url,
          libraryAssetId: assoc.garmentAssetId,
          fileName: resolvedAssetName || null,
          classification: {
            category: resolvedCategory,
            confidence: 0.95,
            viewLabel: "detail" as const,
            reason: "library-import",
            feedbackCategory: null,
            feedbackConfidence: null,
            feedbackViewLabel: null,
            feedbackReason: null,
            feedbackMode: "none" as const,
          },
          removedBgImageUrl: null,
          activeImageUrl: url,
          removeBgStatus: "idle" as const,
          removeBgError: null,
        }));

        return {
          moduleId: assoc.id,
          subjectType,
          subjectName: resolvedAssetName,
          subjectDescription: resolvedDescription,
          mainImage,
          otherViews,
          multiViewWarning: null,
        };
      });
      // 更新 workflow
      updateWorkflowForProject(projectId, {
        videoGarmentModules: garmentModules,
        imageGarmentModules: garmentModules,
      });
      return garmentModules;
    },
    enabled: !!projectId && !!token,
    staleTime: 5 * 60 * 1000, // 5 分钟内不重新请求
  });
}

/**
 * 搭配方案 Query
 */
export function useProjectOutfitsQuery(projectId: string | null | undefined) {
  const token = useAppStore((s) => s.token);
  const updateWorkflowForProject = useAppStore((s) => s.updateWorkflowForProject);

  return useQuery({
    queryKey: projectQueryKeys.outfits(projectId ?? ''),
    queryFn: async () => {
      if (!projectId || !token) return null;
      const res = await realProjectsApi.getOutfitPlans(token, projectId);
      updateWorkflowForProject(projectId, {
        videoOutfitPlans: res.outfitPlans || [],
        videoSelectedOutfitId: res.selectedOutfitPlanId,
        imageOutfitPlans: res.outfitPlans || [],
        imageSelectedOutfitId: res.selectedOutfitPlanId,
      });
      return res;
    },
    enabled: !!projectId && !!token,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Step1 状态 Query
 */
export function useProjectStep1StateQuery(projectId: string | null | undefined) {
  const token = useAppStore((s) => s.token);
  const updateWorkflowForProject = useAppStore((s) => s.updateWorkflowForProject);

  return useQuery({
    queryKey: projectQueryKeys.step1State(projectId ?? ''),
    queryFn: async () => {
      if (!projectId || !token) return null;
      const res = await backendApi.getStep1State(token, projectId);
      updateWorkflowForProject(projectId, {
        videoRoleDirections: res.step1RoleDirectionCards || [],
        videoSelectedRoleDirectionId: res.step1SelectedRoleDirectionId,
        imageRoleDirections: res.step1RoleDirectionCards || [],
        imageSelectedRoleDirectionId: res.step1SelectedRoleDirectionId,
      });
      return res;
    },
    enabled: !!projectId && !!token,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * 角色 Query（包含 generated 和 library）
 */
export function useProjectCharactersQuery(projectId: string | null | undefined) {
  const token = useAppStore((s) => s.token);
  const updateWorkflowForProject = useAppStore((s) => s.updateWorkflowForProject);

  const mapCharacterItem = (item: {
    id: string; projectId: string; libraryCharacterId: string;
    role: "main" | "secondary"; sourceType: "generated" | "library";
    isSelected: boolean; generationSlot: number | null;
    character: {
      id: string; name: string; thumbnailUrl: string;
      fiveViewOssImageUrl?: string | null; tags?: string[];
      kind?: string; status?: string; views?: string[];
      activeFiveViewStatus?: "pending" | "processing" | "ready" | "failed" | null;
    } | null;
    createdAt: number; updatedAt: number;
  }) => ({
    id: item.id, projectId: item.projectId,
    libraryCharacterId: item.libraryCharacterId, role: item.role,
    sourceType: item.sourceType, isSelected: item.isSelected,
    generationSlot: item.generationSlot,
    createdAt: item.createdAt, updatedAt: item.updatedAt,
    character: item.character ? {
      id: item.character.id, name: item.character.name,
      thumbnailUrl: item.character.thumbnailUrl,
      fiveViewOssImageUrl: item.character.fiveViewOssImageUrl ?? null,
      tags: item.character.tags ?? [], kind: item.character.kind ?? "",
      status: item.character.status ?? "", views: item.character.views ?? [],
      activeFiveViewStatus: item.character.activeFiveViewStatus ?? null,
    } : null,
  });

  return useQuery({
    queryKey: projectQueryKeys.characters(projectId ?? ''),
    queryFn: async () => {
      if (!projectId || !token) return null;
      const [charactersRes, libraryRes] = await Promise.all([
        backendApi.listProjectCharacters(token, projectId).catch(() => ({ items: [], selectedCharacterId: null })),
        backendApi.getLibraryRecommendations(token, projectId).catch(() => ({ items: [] })),
      ]);
      const generatedCharacters = (charactersRes.items || [])
        .filter((item: { sourceType: string }) => item.sourceType === "generated")
        .map(mapCharacterItem);
      const libraryCharacters = (libraryRes.items || []).map(mapCharacterItem);
      const selectedCharacterId = (charactersRes as { selectedCharacterId?: string }).selectedCharacterId ?? null;

      updateWorkflowForProject(projectId, {
        videoProjectGeneratedCharacters: generatedCharacters,
        videoProjectLibraryCharacters: libraryCharacters,
        videoSelectedCharacterId: selectedCharacterId,
        imageProjectGeneratedCharacters: generatedCharacters,
        imageProjectLibraryCharacters: libraryCharacters,
        imageSelectedCharacterId: selectedCharacterId,
      });
      return { generatedCharacters, libraryCharacters, selectedCharacterId };
    },
    enabled: !!projectId && !!token,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * 项目信息 Query
 */
export function useProjectInfoQuery(
  projectId: string | null | undefined,
  onError?: (error: { code: string; message: string; projectName?: string | null }) => void
) {
  const token = useAppStore((s) => s.token);
  const updateProjectDataForProject = useAppStore((s) => s.updateProjectDataForProject);

  return useQuery({
    queryKey: projectQueryKeys.project(projectId ?? ''),
    queryFn: async () => {
      if (!projectId || !token) return null;
      const res = await backendApi.getProject(token, projectId).catch(() => null);
      if (!res) {
        onError?.({ code: 'PROJECT_FETCH_FAILED', message: '项目信息获取失败' });
        return null;
      }
      if (!res.status) {
        onError?.({ code: 'PROJECT_STATUS_MISSING', message: '项目状态缺失', projectName: res.name ?? null });
        return null;
      }
      updateProjectDataForProject(projectId, {
        projectStatus: String(res.status),
        projectName: res.name ?? null,
        exportUrl: res.exportUrl ?? null,
        coverImageUrl: res.coverImageUrl ?? null,
        videoCoverImageUrl: res.videoCoverImageUrl ?? null,
        selectedRoleDirection: res.selectedRoleDirection ?? null,
        activeScriptId: res.activeScriptId ?? null,
      });
      return res;
    },
    enabled: !!projectId && !!token,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * 换装项目 Draft Query
 */
export function useOutfitChangeDraftQuery(projectId: string | null | undefined, projectKind: string | null) {
  const token = useAppStore((s) => s.token);
  const updateWorkflowForProject = useAppStore((s) => s.updateWorkflowForProject);

  return useQuery({
    queryKey: projectQueryKeys.outfitChange(projectId ?? ''),
    queryFn: async () => {
      if (!projectId || !token || projectKind !== "outfit_change") return null;
      try {
        const draftRes = await realOutfitChangeApi.getDraft(token, projectId);
        const draft = draftRes.data;
        if (draft) {
          updateWorkflowForProject(projectId, {
            outfitChangeSourceVideoUrl: draft.sourceVideoUrl ?? null,
            outfitChangeBuiltinTemplateId: draft.builtinTemplateId ?? null,
            outfitChangeSelectedGarmentId: draft.targetOutfitId ?? null,
            outfitChangeSelectedCharacterId: draft.characterId ?? null,
          });
        }
        return draft;
      } catch {
        return null;
      }
    },
    enabled: !!projectId && !!token && projectKind === "outfit_change",
    staleTime: 5 * 60 * 1000,
  });
}

// ========== 辅助函数 ==========

/**
 * 根据 projectKind 返回字段前缀
 */
function getFieldPrefix(kind: string | null): "video" | "image" {
  return kind === "image" ? "image" : "video";
}

/**
 * 根据服饰资产分类返回主体类型
 */
function resolveModuleSubjectTypeByLibraryCategory(category: Step1LibraryCategory): string {
  if (category === "bottom") return "下装";
  if (category === "shoes") return "鞋履";
  if (category === "accessory") return "配饰";
  if (category === "suit") return "套装";
  return "上装";
}

// ========== 主 Hook ==========

const EMPTY_WORKFLOW: Record<string, unknown> = {};
const EMPTY_PROJECT_DATA = emptyProjectData();

/**
 * 按 projectId 隔离的项目状态 hook
 * 使用 TanStack Query 管理数据获取和缓存
 */
export function useProjectState(projectId: string | null | undefined, options?: {
  skipLoad?: boolean;
  loadCategories?: ProjectLoadCategory[];
  onError?: (error: { code: string; message: string; projectName?: string | null }) => void;
}) {
  // 从 store 订阅 workflow 和 projectData
  const workflow = useAppStore((state) =>
    projectId ? (state.projectStateMap[projectId]?.workflow ?? EMPTY_WORKFLOW) : EMPTY_WORKFLOW,
  );
  const projectData: ProjectState = useAppStore((state) =>
    projectId ? (state.projectStateMap[projectId]?.projectData ?? EMPTY_PROJECT_DATA) : EMPTY_PROJECT_DATA,
  );
  const updateProjectDataForProject = useAppStore((state) => state.updateProjectDataForProject);
  const updateWorkflowForProject = useAppStore((state) => state.updateWorkflowForProject);

  // 确定需要加载的分类
  const requestedCategories = options?.skipLoad
    ? []
    : (options?.loadCategories ?? ALL_CATEGORIES);

  // 按分类触发 Query（TanStack Query 自动去重和缓存）
  const garmentsQuery = useProjectGarmentsQuery(
    requestedCategories.includes('garments') ? projectId : null
  );
  const outfitsQuery = useProjectOutfitsQuery(
    requestedCategories.includes('outfits') ? projectId : null
  );
  const step1StateQuery = useProjectStep1StateQuery(
    requestedCategories.includes('step1State') ? projectId : null
  );
  const charactersQuery = useProjectCharactersQuery(
    requestedCategories.includes('characters') ? projectId : null
  );
  const projectQuery = useProjectInfoQuery(
    requestedCategories.includes('project') ? projectId : null,
    options?.onError
  );
  const outfitChangeQuery = useOutfitChangeDraftQuery(
    requestedCategories.includes('outfitChange') ? projectId : null,
    projectData.projectKind
  );

  // 计算整体加载状态
  const activeQueries = [
    garmentsQuery,
    outfitsQuery,
    step1StateQuery,
    charactersQuery,
    projectQuery,
    outfitChangeQuery,
  ].filter(q => q.isEnabled);

  const isInitialLoading = activeQueries.some(q => q.isFetching && !q.data);

  // ========== 更新方法（保持原有接口） ==========

  const updateProjectData = useCallback(
    (patch: Partial<ProjectState>) => {
      if (!projectId) return;
      updateProjectDataForProject(projectId, patch);
    },
    [projectId, updateProjectDataForProject],
  );

  const updateWorkflow = useCallback(
    (patch: Record<string, unknown>) => {
      if (!projectId) return;
      updateWorkflowForProject(projectId, patch);
    },
    [projectId, updateWorkflowForProject],
  );

  const resetProjectData = useCallback(() => {
    if (!projectId) return;
    updateProjectDataForProject(projectId, emptyProjectData());
    updateWorkflowForProject(projectId, {});
  }, [projectId, updateProjectDataForProject, updateWorkflowForProject]);

  // ========== 细粒度 workflow 更新方法 ==========

  const setProjectGeneratedCharacters = useCallback((characters: ProjectCharacterItem[]) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, {
      videoProjectGeneratedCharacters: characters,
      imageProjectGeneratedCharacters: characters,
    });
  }, [projectId, updateWorkflowForProject]);

  const setProjectLibraryCharacters = useCallback((characters: ProjectCharacterItem[]) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, {
      videoProjectLibraryCharacters: characters,
      imageProjectLibraryCharacters: characters,
    });
  }, [projectId, updateWorkflowForProject]);

  const setProjectCharacters = useCallback((characters: ProjectCharacterItem[]) => {
    if (!projectId) return;
    const generatedCharacters = characters.filter(c => c.sourceType === "generated");
    const libraryCharacters = characters.filter(c => c.sourceType === "library");
    const projectKind = projectData?.projectKind;
    if (projectKind === "image") {
      updateWorkflowForProject(projectId, {
        imageProjectGeneratedCharacters: generatedCharacters,
        imageProjectLibraryCharacters: libraryCharacters,
      });
    } else {
      updateWorkflowForProject(projectId, {
        videoProjectGeneratedCharacters: generatedCharacters,
        videoProjectLibraryCharacters: libraryCharacters,
      });
    }
  }, [projectId, projectData?.projectKind, updateWorkflowForProject]);

  const setSelectedCharacterId = useCallback((characterId: string | null) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, {
      videoSelectedCharacterId: characterId,
      imageSelectedCharacterId: characterId,
    });
  }, [projectId, updateWorkflowForProject]);

  const setOutfitPlans = useCallback((plans: unknown[]) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, {
      videoOutfitPlans: plans,
      imageOutfitPlans: plans,
    });
  }, [projectId, updateWorkflowForProject]);

  const setSelectedOutfitId = useCallback((outfitId: string | null) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, {
      videoSelectedOutfitId: outfitId,
      imageSelectedOutfitId: outfitId,
    });
  }, [projectId, updateWorkflowForProject]);

  const setRoleDirections = useCallback((directions: unknown[]) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, {
      videoRoleDirections: directions,
      imageRoleDirections: directions,
    });
  }, [projectId, updateWorkflowForProject]);

  const setSelectedRoleDirectionId = useCallback((directionId: string | null) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, {
      videoSelectedRoleDirectionId: directionId,
      imageSelectedRoleDirectionId: directionId,
    });
  }, [projectId, updateWorkflowForProject]);

  const setGarmentModules = useCallback((modules: unknown[]) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, {
      videoGarmentModules: modules,
      imageGarmentModules: modules,
    });
  }, [projectId, updateWorkflowForProject]);

  // Step3 细粒度更新方法
  const setSceneReferences = useCallback((references: unknown) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, {
      videoSceneReferences: references,
      imageSceneReferences: references,
    });
  }, [projectId, updateWorkflowForProject]);

  const setPreviewCandidatesByFrame = useCallback((candidates: unknown) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, {
      videoPreviewCandidatesByFrame: candidates,
      imagePreviewCandidatesByFrame: candidates,
    });
  }, [projectId, updateWorkflowForProject]);

  const setPreviewJobsByFrame = useCallback((jobs: unknown) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, {
      videoPreviewJobsByFrame: jobs,
      imagePreviewJobsByFrame: jobs,
    });
  }, [projectId, updateWorkflowForProject]);

  const setStoryboardCueScriptSource = useCallback((source: unknown) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, {
      videoStoryboardCueScriptSource: source,
      imageStoryboardCueScriptSource: source,
    });
  }, [projectId, updateWorkflowForProject]);

  const setPendingStoryboardImport = useCallback((payload: unknown) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, { pendingStoryboardImport: payload });
  }, [projectId, updateWorkflowForProject]);

  const setPendingReverseDeckScript = useCallback((payload: unknown) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, { pendingReverseDeckScript: payload });
  }, [projectId, updateWorkflowForProject]);

  const setRewrittenScriptSegments = useCallback((segments: unknown) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, { step3RewrittenScriptSegments: segments });
  }, [projectId, updateWorkflowForProject]);

  const setPreviewRatio = useCallback((ratio: unknown) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, { videoPreviewRatio: ratio, imagePreviewRatio: ratio });
  }, [projectId, updateWorkflowForProject]);

  const setPreviewResolution = useCallback((resolution: unknown) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, { videoPreviewResolution: resolution, imagePreviewResolution: resolution });
  }, [projectId, updateWorkflowForProject]);

  const setPreviewSharpness = useCallback((sharpness: unknown) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, { videoPreviewSharpness: sharpness, imagePreviewSharpness: sharpness });
  }, [projectId, updateWorkflowForProject]);

  const setFrameOverrideSettings = useCallback((settings: unknown) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, { videoFrameOverrideSettings: settings, imageFrameOverrideSettings: settings });
  }, [projectId, updateWorkflowForProject]);

  const clearPendingImportState = useCallback(() => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, {
      pendingScriptImport: false,
      pendingStoryboardImport: null,
      pendingReverseDeckScript: null,
    });
  }, [projectId, updateWorkflowForProject]);

  const setPendingStoryboardImportAndClear = useCallback((payload: unknown) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, {
      pendingScriptImport: false,
      pendingStoryboardImport: payload,
      pendingReverseDeckScript: null,
    });
  }, [projectId, updateWorkflowForProject]);

  const setStep4HandoffData = useCallback((patch: Record<string, unknown>) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, patch);
  }, [projectId, updateWorkflowForProject]);

  // Step1/Step2 细粒度更新方法
  const setBackgroundGenerationTasks = useCallback((tasks: unknown) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, { backgroundGenerationTasks: tasks });
  }, [projectId, updateWorkflowForProject]);

  const setVideoCharacters = useCallback((characters: unknown) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, { videoCharacters: characters });
  }, [projectId, updateWorkflowForProject]);

  const setImageCharacters = useCallback((characters: unknown) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, { imageCharacters: characters });
  }, [projectId, updateWorkflowForProject]);

  const setStep2RoleSlotValues = useCallback((values: unknown) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, { step2RoleSlotValues: values });
  }, [projectId, updateWorkflowForProject]);

  const setImageProjectPatch = useCallback((patch: Record<string, unknown>) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, patch);
  }, [projectId, updateWorkflowForProject]);

  const setOutfitRecommendationTaskStatus = useCallback((status: unknown) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, { outfitRecommendationTaskStatus: status });
  }, [projectId, updateWorkflowForProject]);

  const setOutfitSummary = useCallback((summary: unknown) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, { outfitSummary: summary });
  }, [projectId, updateWorkflowForProject]);

  const setRoleDirectionCards = useCallback((cards: unknown) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, {
      videoRoleDirections: cards,
      imageRoleDirections: cards,
    });
  }, [projectId, updateWorkflowForProject]);

  const setVideoSelectedRoleDirectionId = useCallback((id: string | null) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, { videoSelectedRoleDirectionId: id });
  }, [projectId, updateWorkflowForProject]);

  const setImageSelectedRoleDirectionId = useCallback((id: string | null) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, { imageSelectedRoleDirectionId: id });
  }, [projectId, updateWorkflowForProject]);

  const setImageSelectedOutfitId = useCallback((id: string | null) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, { imageSelectedOutfitId: id });
  }, [projectId, updateWorkflowForProject]);

  const setStep5DeliveryPayload = useCallback((payload: unknown) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, { step5DeliveryPayload: payload });
  }, [projectId, updateWorkflowForProject]);

  const batchUpdateWorkflow = useCallback((patch: Record<string, unknown>) => {
    if (!projectId) return;
    updateWorkflowForProject(projectId, patch);
  }, [projectId, updateWorkflowForProject]);

  // ========== 集中式操作方法 ==========

  const token = useAppStore((s) => s.token);
  const queryClient = useQueryClient();

  const selectOutfit = useCallback(async (outfitId: string): Promise<boolean> => {
    if (!projectId || !token) return false;
    const previousId = workflow.videoSelectedOutfitId as string | null;
    setSelectedOutfitId(outfitId);
    try {
      await backendApi.selectOutfit(token, projectId, outfitId);
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.outfits(projectId) });
      return true;
    } catch (err) {
      setSelectedOutfitId(previousId);
      console.error("[useProjectState] selectOutfit failed:", err);
      return false;
    }
  }, [projectId, token, workflow.videoSelectedOutfitId, setSelectedOutfitId, queryClient]);

  const buildCharacterItems = (items: Array<{
    id: string; projectId: string; libraryCharacterId: string;
    role: "main" | "secondary"; sourceType: "generated" | "library";
    isSelected: boolean; generationSlot: number | null;
    character: {
      id: string; name: string; thumbnailUrl: string;
      fiveViewOssImageUrl?: string | null; tags?: string[];
      kind?: string; status?: string; views?: string[];
      activeFiveViewStatus?: "pending" | "processing" | "ready" | "failed" | null;
    } | null;
    createdAt: number; updatedAt: number;
  }>) => items.map((item) => ({
    id: item.id, projectId: item.projectId, libraryCharacterId: item.libraryCharacterId,
    role: item.role, sourceType: item.sourceType, isSelected: item.isSelected,
    generationSlot: item.generationSlot, createdAt: item.createdAt, updatedAt: item.updatedAt,
    character: item.character ? {
      id: item.character.id, name: item.character.name, thumbnailUrl: item.character.thumbnailUrl,
      fiveViewOssImageUrl: item.character.fiveViewOssImageUrl ?? null,
      tags: item.character.tags ?? [], kind: item.character.kind ?? "",
      status: item.character.status ?? "", views: item.character.views ?? [],
      activeFiveViewStatus: item.character.activeFiveViewStatus ?? null,
    } : null,
  }));

  const addCharacter = useCallback(async (
    libraryCharacterId: string,
    options?: { sourceType?: "generated" | "library"; generationSlot?: number },
  ): Promise<{ success: boolean; item?: unknown }> => {
    if (!projectId || !token) return { success: false };
    try {
      const res = await backendApi.addProjectCharacter(token, projectId, {
        libraryCharacterId,
        sourceType: options?.sourceType,
        generationSlot: options?.generationSlot,
      });
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.characters(projectId) });
      return { success: true, item: res.item };
    } catch (err) {
      console.error("[useProjectState] addCharacter failed:", err);
      return { success: false };
    }
  }, [projectId, token, queryClient]);

  const upsertCharacterToLocalWorkflow = useCallback((character: FiveViewCharacterBrief, generationSlot?: number | null): void => {
    const newCharacterItem: ProjectCharacterItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      projectId: projectId!,
      libraryCharacterId: character.id,
      role: "main",
      sourceType: "generated",
      isSelected: true,
      generationSlot: generationSlot ?? null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      character: {
        id: character.id, name: character.name, thumbnailUrl: character.thumbnailUrl ?? "",
        fiveViewOssImageUrl: character.fiveViewOssImageUrl ?? null,
        tags: [], kind: "image", status: character.status, views: [],
      },
    };
    const currentCharacters = (workflow.videoProjectGeneratedCharacters || []) as ProjectCharacterItem[];
    const existingIndex = currentCharacters.findIndex(c => c.libraryCharacterId === character.id);
    const updatedCharacters = existingIndex >= 0
      ? currentCharacters.map((c, i) => i === existingIndex ? newCharacterItem : c)
      : [...currentCharacters, newCharacterItem];
    setProjectGeneratedCharacters(updatedCharacters);
  }, [projectId, workflow.videoProjectGeneratedCharacters, setProjectGeneratedCharacters]);

  const removeCharacter = useCallback(async (characterId: string): Promise<boolean> => {
    if (!projectId || !token) return false;
    try {
      await backendApi.removeProjectCharacter(token, projectId, characterId);
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.characters(projectId) });
      return true;
    } catch (err) {
      console.error("[useProjectState] removeCharacter failed:", err);
      return false;
    }
  }, [projectId, token, queryClient]);

  const selectCharacter = useCallback(async (characterId: string): Promise<boolean> => {
    if (!projectId || !token) return false;
    const previousId = projectData?.projectKind === "image"
      ? (workflow.imageSelectedCharacterId as string | null)
      : (workflow.videoSelectedCharacterId as string | null);
    setSelectedCharacterId(characterId);
    try {
      await backendApi.selectProjectCharacterWithProject(token, projectId, characterId);
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.characters(projectId) });
      return true;
    } catch (err) {
      setSelectedCharacterId(previousId);
      console.error("[useProjectState] selectCharacter failed:", err);
      return false;
    }
  }, [projectId, token, projectData?.projectKind, workflow.imageSelectedCharacterId, workflow.videoSelectedCharacterId, setSelectedCharacterId, queryClient]);

  const refreshCharacters = useCallback(async (): Promise<void> => {
    if (!projectId || !token) return;
    queryClient.invalidateQueries({ queryKey: projectQueryKeys.characters(projectId) });
  }, [projectId, token, queryClient]);

  const refreshOutfitPlans = useCallback(async (): Promise<void> => {
    if (!projectId || !token) return;
    queryClient.invalidateQueries({ queryKey: projectQueryKeys.outfits(projectId) });
  }, [projectId, token, queryClient]);

  const refreshGarmentModules = useCallback(async (): Promise<void> => {
    if (!projectId || !token) return;
    queryClient.invalidateQueries({ queryKey: projectQueryKeys.garments(projectId) });
  }, [projectId, token, queryClient]);

  return {
    projectData,
    workflow,
    isInitialLoading,
    // 基础方法
    updateProjectData,
    updateWorkflow,
    resetProjectData,
    // 细粒度更新方法
    setProjectCharacters,
    setProjectGeneratedCharacters,
    setProjectLibraryCharacters,
    setSelectedCharacterId,
    setOutfitPlans,
    setSelectedOutfitId,
    setRoleDirections,
    setSelectedRoleDirectionId,
    setGarmentModules,
    // Step3 细粒度更新方法
    setSceneReferences,
    setPreviewCandidatesByFrame,
    setPreviewJobsByFrame,
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
    // Step1/Step2 细粒度更新方法
    setBackgroundGenerationTasks,
    setVideoCharacters,
    setImageCharacters,
    setStep2RoleSlotValues,
    setImageProjectPatch,
    setOutfitRecommendationTaskStatus,
    setOutfitSummary,
    setRoleDirectionCards,
    setVideoSelectedRoleDirectionId,
    setImageSelectedRoleDirectionId,
    setImageSelectedOutfitId,
    setStep5DeliveryPayload,
    batchUpdateWorkflow,
    // 集中式操作
    selectOutfit,
    addCharacter,
    removeCharacter,
    selectCharacter,
    refreshCharacters,
    refreshOutfitPlans,
    refreshGarmentModules,
    // 本地更新
    upsertCharacterToLocalWorkflow,
  };
}

// ========== 辅助导出 ==========

/** 异步回调中获取最新项目状态 */
export function getProjectState(projectId: string): {
  projectData: ProjectState;
  workflow: Record<string, unknown>;
} {
  const state = useAppStore.getState();
  const entry = state.projectStateMap[projectId];
  return {
    projectData: entry?.projectData ?? emptyProjectData(),
    workflow: entry?.workflow ?? {},
  };
}

/** 清除指定项目的 TanStack Query 缓存（在非 React 上下文中使用） */
export function clearProjectQueries(projectId: string): void {
  globalQueryClient.removeQueries({ queryKey: projectQueryKeys.all(projectId) });
}

/** 清除项目 workflow 和 Query 缓存（TanStack Query 会重新请求） */
export function refreshProjectData(projectId: string): void {
  clearProjectQueries(projectId);
  const state = useAppStore.getState();
  state.updateWorkflowForProject(projectId, {});
}

// 五视图生成类型导出
export type { FiveViewGenerationOptions, FiveViewGenerationResult, BatchFiveViewGenerationOptions, BatchFiveViewGenerationResult } from "./useFiveViewGeneration";