import React, { useEffect, useState, useMemo } from "react";
import { useAppStore, type ProjectState } from "../../store/useAppStore";
import { useProjectState, type ProjectLoadCategory } from "../../hooks/useProjectState";
import { backendApi } from "../../services/backendApi";
import { request } from "../../services/backendApi.request";
import type { ProjectVideoMusicDto } from "../../services/backendApi.videoMusic";
import { createVideoMusicRealBackendApi } from "../../services/backendApi.videoMusic";
import { HistoryStep1Panel, type HistoryStep1PanelProps, type OutfitReferenceItem } from "./HistoryStep1Panel";
import { HistoryStep2Panel, type HistoryStep2PanelProps, type CharacterReferenceItem } from "./HistoryStep2Panel";
import { HistoryStep3Panel, type HistoryStep3PanelProps, StoryboardFrameForPreview } from "./HistoryStep3Panel";
import { HistoryStep4Panel, type HistoryStep4PanelProps, type HistoryMusicDto, VideoClipItem } from "./HistoryStep4Panel";
import { SidebarPanelHeader } from "./SidebarPanelHeader";
import { buildStep1RolePresetPanelCompactLines } from "../../../../src/modules/step1-role-preset-panel-compact-render";
import type { Gender } from "../../../../src/contracts/avatar-nine-grid-contract";

/** getOutfitPlans 返回的单个 plan 类型 */
type OutfitPlanItem = {
  id: string;
  index: number;
  title: string | null;
  items: Array<{ type: string; name: string; style?: string; description?: string; assetId?: string }>;
};

export interface ProjectFlowHistorySidebarProps {
  /** 当前步骤编号 */
  currentStep: 2 | 3 | 4 | 5 | 6;
  /** 当前步骤的自定义内容（渲染队列、脚本工具等） */
  children?: React.ReactNode;
  /** 图片预览回调（传递有效 frames 和当前索引，imageUrl 必须存在） */
  onImagePreview?: (frames: StoryboardFrameForPreview[], currentIndex: number) => void;
  /** 视频预览回调（传递视频片段列表和当前索引） */
  onVideoPreview?: (clips: VideoClipItem[], currentIndex: number) => void;
  /** 可选：指定项目 ID，优先于 activeProjectId */
  projectId?: string;
}

/** 服装数据类型（来自 getStep1Garments API） */
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
 * 从 projectData + API 数据构建 Step1 面板数据
 */
function buildStep1PanelProps(
  projectData: ProjectState,
  garments: GarmentItem[],
  outfitPlans: OutfitPlanItem[],
  selectedOutfitPlanId: string | null,
): HistoryStep1PanelProps | undefined {
  // 服装参考图：从 API 获取的 garments 构建
  const garmentItems: OutfitReferenceItem[] = garments
    .filter((g) => g.imageUrl)
    .map((g) => ({ category: g.category || "服饰", label: g.name || g.category || "服饰", imageUrl: g.imageUrl! }));

  // 已选搭配：从 getOutfitPlans API 返回数据构建
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

  // 角色预设：从 projectData.selectedRoleDirection 获取
  const savedDirection = projectData.selectedRoleDirection as Record<string, unknown> | null;
  const hasSavedDirection = savedDirection && typeof savedDirection.directionId === "string";

  if (!hasSavedDirection) {
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

  const portraitUrl = (savedDirection.portraitUrl as string | null) ?? "";
  const rolePreset = {
    title: (savedDirection.title as string) || "已选角色预设",
    imageUrl: portraitUrl,
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

  // 如果没有任何数据，返回 undefined
  if (garmentItems.length === 0 && !selectedOutfit && !hasSavedDirection) {
    return undefined;
  }

  return {
    outfitReferenceItems: garmentItems,
    outfitSummary,
    rolePreset,
  };
}

/**
 * 从 projectData 和 workflow 构建 Step2 面板数据
 */
function buildStep2PanelProps(
  projectData: ProjectState,
  workflow: Record<string, unknown>,
): HistoryStep2PanelProps | undefined {
  // 角色预设信息：从 projectData.selectedRoleDirection 获取
  const savedDirection = projectData.selectedRoleDirection as Record<string, unknown> | null;
  const hasSavedDirection = savedDirection && typeof savedDirection.directionId === "string";

  // 五视图数据：从 videoProjectGeneratedCharacters + videoProjectLibraryCharacters 获取
  // 使用 videoSelectedCharacterId 确定选中角色（比 isSelected 更可靠）
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
  const hasFiveView = !!(selectedCharacter?.character?.fiveViewOssImageUrl || selectedCharacter?.character?.thumbnailUrl);

  // 如果既没有角色预设也没有五视图，返回 undefined
  if (!hasSavedDirection && !hasFiveView) {
    return undefined;
  }

  // 构建角色预设
  const rolePreset = hasSavedDirection
    ? {
        title: (savedDirection.title as string) || "已选角色预设",
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
      }
    : null;

  // 构建五视图
  const characterReferences: CharacterReferenceItem[] = [];
  if (selectedCharacter?.character?.fiveViewOssImageUrl) {
    characterReferences.push({
      id: "five-view",
      label: selectedCharacter.character.name || "角色五视图",
      imageUrl: selectedCharacter.character.fiveViewOssImageUrl,
    });
  } else if (selectedCharacter?.character?.thumbnailUrl) {
    characterReferences.push({
      id: "thumbnail",
      label: selectedCharacter.character.name || "角色参考图",
      imageUrl: selectedCharacter.character.thumbnailUrl,
    });
  }

  return {
    characterReferences,
    rolePreset,
  };
}

/** API 返回的分镜帧数据类型 */
type Step3FrameFromApi = {
  frameIndex: number;
  imageUrl: string;
  prompt?: string;
  candidates?: string[];
};

/** API 返回的视频场景数据类型 */
type Step4VideoSceneFromApi = {
  id: string;
  projectId: string;
  sceneIndex: number;
  variantUrls: string[];
  selectedIndex: number;
  clipStatus: string;
  clipUrl: string | null;
  clipPrompt: string | null;
  clipProgress: number;
};

/**
 * 从 API 数据构建 Step3 面板数据
 */
function buildStep3PanelProps(
  apiFrames: Step3FrameFromApi[],
  scriptOverview: { title: string | null; summary: string | null } | null,
): HistoryStep3PanelProps | undefined {
  // 分镜帧：从 API 数据构建
  const frames: Array<{ index: number; title: string; imageUrl: string }> = apiFrames
    .filter((f) => f.imageUrl)
    .map((f) => ({
      index: f.frameIndex,
      title: `镜头 ${f.frameIndex + 1}`,
      imageUrl: f.imageUrl,
    }));

  // 脚本信息：标题 + 概要
  const scriptTitle = scriptOverview?.title?.trim() || null;
  const scriptPreview = scriptOverview?.summary?.trim() || undefined;

  if (!scriptTitle && !scriptPreview && frames.length === 0) return undefined;

  return {
    scriptInfo: (scriptTitle || scriptPreview)
      ? { title: scriptTitle || "脚本概要", durationSec: undefined, shotCount: frames.length, suitability: null, preview: scriptPreview }
      : null,
    frames,
  };
}

/**
 * 从 API 数据构建 Step4 面板数据
 */
function buildStep4PanelProps(
  videoScenes: Step4VideoSceneFromApi[],
  music: ProjectVideoMusicDto | null,
): HistoryStep4PanelProps | undefined {
  // 视频片段：从 API 数据构建
  const clips = videoScenes
    .filter((scene) => scene.clipUrl)
    .map((scene) => ({
      index: scene.sceneIndex,
      title: scene.clipPrompt ?? `片段 ${scene.sceneIndex + 1}`,
      thumbnailUrl: scene.clipUrl ?? null,
    }));

  // 音乐：从 API 数据构建
  const musicDto: HistoryMusicDto | null = music
    ? {
        id: music.id,
        title: music.title ?? "",
        artist: music.artist ?? null,
        album: null,
        musicUrl: music.musicUrl,
        atmospheres: music.atmospheres ?? [],
      }
    : null;

  if (clips.length === 0 && !musicDto) return undefined;

  return { clips, music: musicDto };
}

/**
 * 项目流程历史侧边栏
 * 用于 Step2/Step3/Step4/Step5/Step6 展示前面步骤的历史数据
 * 所有数据通过 API 获取，不依赖 workflow
 */
export const ProjectFlowHistorySidebar: React.FC<ProjectFlowHistorySidebarProps> = ({
  currentStep,
  children,
  onImagePreview,
  onVideoPreview,
  projectId: propProjectId,
}) => {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const effectiveProjectId = propProjectId || activeProjectId;

  // 根据 currentStep 按需加载数据，避免 Step5/6 加载不必要的 Step1-3 接口
  const sidebarLoadCategories = useMemo<ProjectLoadCategory[]>(() => {
    // Step2: 显示 Step1 面板 → 需要服饰、搭配、Step1 状态、项目信息
    if (currentStep === 2) return ['garments', 'outfits', 'step1State', 'characters', 'project'];
    // Step3: 显示 Step2 面板 → 需要角色、项目信息
    if (currentStep === 3) return ['characters', 'step1State', 'project'];
    // Step4: 显示 Step3 面板 → 需要角色数据（分镜中角色信息）
    if (currentStep === 4) return ['characters', 'project'];
    // Step5: 显示 Step4 面板 → 只需项目信息（视频场景由单独 useEffect 获取）
    if (currentStep === 5) return ['project'];
    // Step6: 无历史面板 → 不加载任何数据
    if (currentStep === 6) return [];
    return ['garments', 'outfits', 'step1State', 'characters', 'project', 'outfitChange'];
  }, [currentStep]);

  const { projectData, workflow, isInitialLoading: sidebarIsLoading } = useProjectState(effectiveProjectId, { loadCategories: sidebarLoadCategories });
  const token = useAppStore((s) => s.token);
  const projectId = projectData.projectId;

  // Step3: 分镜图（从 API 获取）
  const [step3Frames, setStep3Frames] = useState<Step3FrameFromApi[]>([]);

  // Step4: 脚本概要（标题 + 概要内容，从 API 获取）
  const [scriptOverview, setScriptOverview] = useState<{ title: string | null; summary: string | null } | null>(null);

  // Step4: 视频场景和音乐（从 API 获取）
  const [step4VideoScenes, setStep4VideoScenes] = useState<Step4VideoSceneFromApi[]>([]);
  const [step4Music, setStep4Music] = useState<ProjectVideoMusicDto | null>(null);

  // 从 workflow 派生 Step1 数据
  const { garments, outfitPlans, selectedOutfitPlanId } = useMemo(() => {
    const modules = (workflow.videoGarmentModules as Array<{
      subjectType?: string;
      subjectName?: string;
      mainImage?: { activeImageUrl?: string };
    }>) ?? [];
    const plans = (workflow.videoOutfitPlans as Array<{
      id: string;
      index: number;
      title: string | null;
      items: Array<{ type: string; name: string; style?: string; description?: string }>;
    }>) ?? [];
    const selectedId = workflow.videoSelectedOutfitId as string | null;

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
  }, [workflow.videoGarmentModules, workflow.videoOutfitPlans, workflow.videoSelectedOutfitId]);

  // Step3: 获取分镜图数据（Step4 页面需要）
  useEffect(() => {
    if (!token || !projectId || currentStep < 4) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await backendApi.getStep3FrameImages(token, projectId);
        if (cancelled) return;
        setStep3Frames(res.frames || []);
      } catch {
        // 获取失败不影响其他面板
      }
    })();
    return () => { cancelled = true; };
  }, [token, projectId, currentStep]);

  // Step4: 获取脚本概要（Step4 页面需要）
  useEffect(() => {
    if (!token || !projectId || currentStep < 4) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await backendApi.getScriptSummary(token, projectId);
        if (cancelled) return;
        setScriptOverview({ title: res.title ?? null, summary: res.summary ?? null });
      } catch {
        // 获取失败不影响其他面板
      }
    })();
    return () => { cancelled = true; };
  }, [token, projectId, currentStep]);

  // Step4: 获取视频场景和音乐数据（Step5/Step6 页面需要）
  useEffect(() => {
    if (!token || !projectId || (currentStep !== 5 && currentStep !== 6)) return;
    let cancelled = false;
    void (async () => {
      try {
        // 并行获取视频场景和音乐
        const musicApi = createVideoMusicRealBackendApi(request);
        const [scenesRes, musicRes] = await Promise.all([
          backendApi.getStep4VideoScenes(token, projectId),
          musicApi.listProjectVideoMusics(token, projectId),
        ]);
        if (cancelled) return;
        setStep4VideoScenes(scenesRes.scenes || []);
        // 找到选中的音乐
        const selectedMusic = (musicRes.items || []).find((m) => m.isSelected) || null;
        setStep4Music(selectedMusic);
      } catch {
        // 获取失败不影响其他面板
      }
    })();
    return () => { cancelled = true; };
  }, [token, projectId, currentStep]);

  const step1Data = buildStep1PanelProps(projectData, garments, outfitPlans, selectedOutfitPlanId);
  const step2Data = buildStep2PanelProps(projectData, workflow);
  const step3Data = buildStep3PanelProps(step3Frames, scriptOverview);
  const step4Data = buildStep4PanelProps(step4VideoScenes, step4Music);

  return (
    <div className="z-20 hidden h-full min-w-0 lg:w-[400px] flex-shrink-0 flex-col border-r border-gray-100 bg-white shadow-[4px_0_24px_rgba(0,0,0,0.02)] lg:flex">
      {/* 面板头部：步骤进度 + 面板用途引导 */}
      <SidebarPanelHeader
        currentStep={currentStep}
        projectStatus={projectData.projectStatus as import("../../../../src/contant-config/shared_dict").ProjectStatus}
      />
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {/* 当前步骤内容 */}
        {children}

        {/* Step1 历史面板（Step2 时显示，Step3/Step4/Step5/Step6 隐藏） */}
        {currentStep >= 2 && currentStep !== 3 && currentStep !== 4 && currentStep !== 5 && currentStep !== 6 && step1Data && (
          <HistoryStep1Panel
            {...step1Data}
            onImagePreview={(imageUrl, label) => {
              onImagePreview?.([{ index: 0, title: label, imageUrl }], 0);
            }}
          />
        )}

        {/* Step2 历史面板（Step3 时显示角色方向和五视图，Step4/Step5/Step6 隐藏） */}
        {currentStep >= 3 && currentStep !== 4 && currentStep !== 5 && currentStep !== 6 && step2Data && (
          <HistoryStep2Panel
            {...step2Data}
            onImagePreview={(imageUrl, label) => {
              onImagePreview?.([{ index: 0, title: label, imageUrl }], 0);
            }}
          />
        )}

        {/* Step3 历史面板（Step4 时显示，Step5/Step6 隐藏） */}
        {currentStep >= 4 && currentStep !== 5 && currentStep !== 6 && step3Data && (
          <HistoryStep3Panel
            {...step3Data}
            onImagePreview={(frames, currentIndex) => {
              onImagePreview?.(frames, currentIndex);
            }}
          />
        )}

        {/* Step4 历史面板（Step5/Step6 时显示） */}
        {(currentStep === 5 || currentStep === 6) && step4Data && (
          <HistoryStep4Panel
            {...step4Data}
            onImagePreview={(clips, currentIndex) => {
              const frames: StoryboardFrameForPreview[] = clips.map((clip) => ({
                index: clip.index,
                title: clip.title,
                imageUrl: clip.thumbnailUrl ?? "",
              }));
              onImagePreview?.(frames, currentIndex);
            }}
            onVideoPreview={(clips, currentIndex) => {
              onVideoPreview?.(clips, currentIndex);
            }}
          />
        )}

      </div>
    </div>
  );
};

export { HistoryStep1Panel, type HistoryStep1PanelProps, type OutfitReferenceItem } from "./HistoryStep1Panel";
export { HistoryStep2Panel, type HistoryStep2PanelProps } from "./HistoryStep2Panel";
export { HistoryStep3Panel, type HistoryStep3PanelProps } from "./HistoryStep3Panel";
export { HistoryStep4Panel, type HistoryStep4PanelProps } from "./HistoryStep4Panel";
