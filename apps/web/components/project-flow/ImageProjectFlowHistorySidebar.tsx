import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore, type ProjectState } from "../../store/useAppStore";
import { useProjectState } from "../../hooks/useProjectState";
import { HistoryStep1Panel, type HistoryStep1PanelProps, type OutfitReferenceItem, type RolePresetInfo } from "./HistoryStep1Panel";
import { HistoryStep2Panel, type CharacterReferenceItem } from "./HistoryStep2Panel";
import { SidebarPanelHeader } from "./SidebarPanelHeader";
import { buildStep1RolePresetPanelCompactLines } from "../../../../src/modules/step1-role-preset-panel-compact-render";
import { adaptStep1RolePresetCards, resolveStep1RolePresetCardById } from "../../../../src/modules/step1-role-preset-adapter";
import type { Gender } from "../../../../src/contracts/avatar-nine-grid-contract";
import type { ImageProjectStatus } from "../../../../src/contracts/types";
import { realBackendApi } from "../../services/realApi";

/** 图片项目左侧栏组件 */
export interface ImageProjectFlowHistorySidebarProps {
  /** 当前步骤编号 */
  currentStep: 2 | 3;
  /** 图片预览回调 */
  onImagePreview?: (imageUrl: string, label: string) => void;
  /** 可选：指定项目 ID */
  projectId?: string;
}

/** getOutfitPlans 返回的单个 plan 类型 */
type OutfitPlanItem = {
  id: string;
  index: number;
  title: string | null;
  items: Array<{ type: string; name: string; style?: string; description?: string; assetId?: string }>;
};

/** 服装数据类型 */
type GarmentItem = {
  id: string;
  categoryId: string;
  name: string;
  category: string;
  description: string | null;
  imageUrl: string | null;
  libraryAssetId: string | null;
  subImages: string[];
};

/**
 * 从 workflow + projectData 两个数据源构建角色预设
 * 优先从 workflow（imageRoleDirections + imageSelectedRoleDirectionId）解析，
 * 回退到 projectData.selectedRoleDirection（project 表 JSONB 字段）。
 */
function buildRolePresetFromSources(
  workflow: Record<string, unknown>,
  projectData: ProjectState,
): RolePresetInfo | null {
  // 优先：从 workflow 的角色方向卡片列表中解析
  const rawDirections = workflow.imageRoleDirections;
  const selectedDirectionId = typeof workflow.imageSelectedRoleDirectionId === "string"
    && workflow.imageSelectedRoleDirectionId.trim().length > 0
    ? workflow.imageSelectedRoleDirectionId.trim()
    : null;

  if (rawDirections && selectedDirectionId) {
    const cards = adaptStep1RolePresetCards(rawDirections, "sidebar-workflow");
    const card = resolveStep1RolePresetCardById(cards, selectedDirectionId);
    if (card) {
      return {
        title: card.styleSummary || "已选角色预设",
        imageUrl: card.portraitUrl ?? "",
        compactLines: buildStep1RolePresetPanelCompactLines({
          gender: card.gender || null,
          age: typeof card.age === "number" ? card.age : null,
          styleWords: card.styleWords ?? [],
          ethnicityOrRegion: card.ethnicityOrRegion || null,
        }),
        gender: card.gender || null,
        age: typeof card.age === "number" ? card.age : null,
        styleWords: card.styleWords ?? null,
        ethnicityOrRegion: card.ethnicityOrRegion || null,
      };
    }
  }

  // 回退：从 projectData.selectedRoleDirection 获取
  const savedDirection = projectData.selectedRoleDirection as Record<string, unknown> | null;
  const hasSavedDirection = savedDirection && typeof savedDirection.directionId === "string";
  if (!hasSavedDirection) return null;

  return {
    title: (savedDirection.title as string) || (savedDirection.styleSummary as string) || "已选角色预设",
    imageUrl: (savedDirection.portraitUrl as string | null) ?? "",
    compactLines: buildStep1RolePresetPanelCompactLines({
      gender: (savedDirection.gender as Gender) || null,
      age: typeof savedDirection.age === "number" ? savedDirection.age : null,
      styleWords: Array.isArray(savedDirection.styleWords) ? savedDirection.styleWords as string[] : [],
      ethnicityOrRegion: (savedDirection.ethnicityOrRegion as string) || null,
    }),
    gender: (savedDirection.gender as Gender) || null,
    age: typeof savedDirection.age === "number" ? savedDirection.age : null,
    styleWords: Array.isArray(savedDirection.styleWords) ? savedDirection.styleWords as string[] : null,
    ethnicityOrRegion: (savedDirection.ethnicityOrRegion as string) || null,
  };
}

/**
 * 从 projectData + workflow 数据构建 Step1 面板数据（图片项目专用）
 * 角色预设优先从 workflow（imageRoleDirections + imageSelectedRoleDirectionId）获取，
 * 回退到 projectData.selectedRoleDirection（project 表 JSONB 字段）。
 */
function buildImageStep1PanelProps(
  projectData: ProjectState,
  garments: GarmentItem[],
  outfitPlans: OutfitPlanItem[],
  selectedOutfitPlanId: string | null,
  workflow: Record<string, unknown>,
): HistoryStep1PanelProps | undefined {
  // 服装参考图：从 garments 构建
  const garmentItems: OutfitReferenceItem[] = garments
    .filter((g) => g.imageUrl)
    .map((g) => ({ category: g.category || "服饰", label: g.name || g.category || "服饰", imageUrl: g.imageUrl! }));

  // 已选搭配：从 outfitPlans 构建
  const selectedOutfit = selectedOutfitPlanId
    ? outfitPlans.find((p) => p.id === selectedOutfitPlanId) ?? null
    : null;
  // 搭配详情：直接从 items 数组构建 complementaryItems
  const complementaryItems = (Array.isArray(selectedOutfit?.items) ? selectedOutfit.items : [])
    .filter((item) => item.name || item.description)
    .map((item, index) => ({
      id: `${item.type}-${index}`,
      label: item.type,
      text: item.description ? `${item.name} — ${item.description}` : item.name,
    }));
  const outfitSummary = selectedOutfit
    ? {
        sourceLabel: "搭配推荐",
        title: selectedOutfit.title ?? "已选搭配",
        complementaryItems,
      }
    : { sourceLabel: "搭配", title: "暂无搭配", complementaryItems: [] as Array<{ id: string; label: string; text: string }> };

  // 角色预设：优先从 workflow 数据获取（懒加载已就绪），回退到 projectData.selectedRoleDirection
  const rolePreset = buildRolePresetFromSources(workflow, projectData);

  if (!rolePreset) {
    // 没有角色预设数据
    if (garmentItems.length === 0 && !selectedOutfit) {
      return undefined;
    }
    return {
      outfitReferenceItems: garmentItems,
      outfitSummary,
      rolePreset: null,
    };
  }

  return {
    outfitReferenceItems: garmentItems,
    outfitSummary,
    rolePreset,
  };
}

/**
 * 图片项目左侧栏组件（独立于视频项目）
 */
export const ImageProjectFlowHistorySidebar: React.FC<ImageProjectFlowHistorySidebarProps> = ({
  currentStep,
  onImagePreview,
  projectId: propProjectId,
}) => {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const token = useAppStore((s) => s.token);
  const effectiveProjectId = propProjectId || activeProjectId;
  const { projectData, workflow, isInitialLoading } = useProjectState(effectiveProjectId);
  const projectId = projectData.projectId;

  // 状态：从API获取的选中角色五视图信息
  const [selectedCharacterFiveView, setSelectedCharacterFiveView] = useState<{
    imageUrl: string | null;
    name: string | null;
    loading: boolean;
  }>({ imageUrl: null, name: null, loading: false });

  // 追踪当前请求的 projectId，防止竞态条件
  const requestIdRef = useRef<string | null>(null);

  // 主动从API获取选中角色的五视图信息
  // 监听 workflow.imageSelectedCharacterId 变化（核心修复：角色选择变化时重新请求）
  useEffect(() => {
    if (!token || !projectId || currentStep < 3) {
      setSelectedCharacterFiveView({ imageUrl: null, name: null, loading: false });
      return;
    }

    // 记录当前请求的 projectId
    const currentRequestId = projectId;
    requestIdRef.current = currentRequestId;

    setSelectedCharacterFiveView({ imageUrl: null, name: null, loading: true });

    realBackendApi.listProjectCharacters(token, projectId)
      .then((res) => {
        // 竞态条件检查：只更新当前请求的状态
        if (requestIdRef.current !== currentRequestId) return;

        // 找到已选择的角色
        const selectedChar = res.items.find((item) => item.isSelected);
        if (selectedChar?.character?.fiveViewOssImageUrl) {
          setSelectedCharacterFiveView({
            imageUrl: selectedChar.character.fiveViewOssImageUrl,
            name: selectedChar.character.name,
            loading: false,
          });
        } else {
          setSelectedCharacterFiveView({ imageUrl: null, name: null, loading: false });
        }
      })
      .catch((err) => {
        // 竞态条件检查：只处理当前请求的错误
        if (requestIdRef.current !== currentRequestId) return;

        console.error("[ImageProjectFlowHistorySidebar] 获取角色信息失败:", err);
        setSelectedCharacterFiveView({ imageUrl: null, name: null, loading: false });
      });
  }, [token, projectId, currentStep, workflow.imageSelectedCharacterId]);

  // 从 workflow 派生 Step1 数据（图片项目专用）
  const { garments, outfitPlans, selectedOutfitPlanId } = useMemo(() => {
    const modules = (workflow.imageGarmentModules as Array<{
      subjectType?: string;
      subjectName?: string;
      mainImage?: { activeImageUrl?: string };
    }>) ?? [];
    const plans = (workflow.imageOutfitPlans as Array<{
      id: string;
      index: number;
      title: string | null;
      items: Array<{ type: string; name: string; style?: string; description?: string }>;
    }>) ?? [];
    const selectedId = workflow.imageSelectedOutfitId as string | null;

    const garmentItems: GarmentItem[] = modules
      .filter((m) => m.mainImage?.activeImageUrl)
      .map((m, i) => ({
        id: `garment-${i}`,
        categoryId: m.subjectType || "clothing",
        name: m.subjectName || m.subjectType || "服饰",
        category: m.subjectType || "服饰",
        description: null,
        imageUrl: m.mainImage?.activeImageUrl || null,
        libraryAssetId: null,
        subImages: [],
      }));

    const outfitItems: OutfitPlanItem[] = plans.map((p) => ({
      id: p.id,
      index: p.index,
      title: p.title,
      items: p.items || [],
    }));

    return { garments: garmentItems, outfitPlans: outfitItems, selectedOutfitPlanId: selectedId };
  }, [workflow.imageGarmentModules, workflow.imageOutfitPlans, workflow.imageSelectedOutfitId]);

  const step1Data = buildImageStep1PanelProps(projectData, garments, outfitPlans, selectedOutfitPlanId, workflow);

  // Step2 数据：角色定妆信息（使用API获取的五视图数据）
  const step2Data = useMemo(() => {
    // 角色预设：复用统一的构建逻辑（workflow 优先，projectData 回退）
    const rolePreset = buildRolePresetFromSources(workflow, projectData);

    // 使用API获取的五视图数据（而不是缓存的workflow数据）
    const characterReferences: CharacterReferenceItem[] = selectedCharacterFiveView.imageUrl
      ? [{ id: "selected-character", label: selectedCharacterFiveView.name || "已选角色", imageUrl: selectedCharacterFiveView.imageUrl }]
      : [];

    return { characterReferences, rolePreset };
  }, [workflow.imageRoleDirections, workflow.imageSelectedRoleDirectionId, projectData.selectedRoleDirection, selectedCharacterFiveView]);

  return (
    <div className="z-20 hidden h-full min-w-0 lg:w-[400px] flex-shrink-0 flex-col border-r border-gray-100 bg-white shadow-[4px_0_24px_rgba(0,0,0,0.02)] lg:flex">
      {/* 面板头部：步骤进度 + 面板用途引导 */}
      <SidebarPanelHeader
        currentStep={currentStep}
        projectStatus={projectData.projectStatus as ImageProjectStatus}
      />
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {/* 加载状态 */}
        {isInitialLoading ? (
          <div className="p-6 space-y-4">
            <div className="h-20 bg-gray-100 rounded-lg animate-pulse" />
            <div className="h-16 bg-gray-100 rounded-lg animate-pulse" />
          </div>
        ) : (
          <>
            {/* Step1 历史面板（Step2/Step3 时显示） - Step3时不显示角色预设避免重复 */}
            {currentStep >= 2 && step1Data && (
              <HistoryStep1Panel
                {...step1Data}
                rolePreset={currentStep >= 3 ? null : step1Data.rolePreset}
                onImagePreview={(imageUrl, label) => {
                  onImagePreview?.(imageUrl, label);
                }}
              />
            )}
            {/* Step2 历史面板（Step3 时显示） */}
            {currentStep >= 3 && step2Data && (
              <HistoryStep2Panel
                {...step2Data}
                loading={selectedCharacterFiveView.loading}
                onImagePreview={(imageUrl, label) => {
                  onImagePreview?.(imageUrl, label);
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};