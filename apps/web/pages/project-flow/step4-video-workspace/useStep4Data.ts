/**
 * Step4 数据加载 Hook
 * 从 API 加载 Step4 所需的所有数据，替代 workflow store 依赖
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { backendApi } from "../../../services/backendApi";
import type { Step4ScriptSegment, Step4VideoScene } from "../../../services/realApi/projects";
import type { ProjectVideoMusicDto } from "../../../services/backendApi.videoMusic";

/** Step3 分镜图片 */
export interface Step3FrameImage {
  frameIndex: number;
  imageUrl: string;
  candidates?: string[];
}

/** 音乐数据 */
export interface Step4MusicData {
  items: ProjectVideoMusicDto[];
  selectedMusicId: string | null;
}

/** 刷新范围：指定只刷新哪些数据，避免不必要的请求 */
export type Step4RefreshScope = "all" | "scenes" | "scenesAndMusic";

/** Hook 返回的数据结构 */
export interface Step4Data {
  /** 分镜脚本段落（API 原始类型） */
  segments: Step4ScriptSegment[];
  /** 分镜图片 */
  frameImages: Step3FrameImage[];
  /** 视频场景数据（API 原始类型） */
  scenes: Step4VideoScene[];
  /** 音乐数据 */
  music: Step4MusicData | null;
  /** 数据加载中 */
  isLoading: boolean;
  /** 数据加载错误 */
  error: string | null;
  /** 刷新数据，可指定范围 */
  refresh: (scope?: Step4RefreshScope) => Promise<void>;
  /** 刷新单个场景数据 */
  refreshScene: (sceneIndex: number) => Promise<void>;
}

/**
 * Step4 数据加载 Hook
 * @param token 认证 token
 * @param projectId 项目 ID
 */
export function useStep4Data(token: string | null, projectId: string | null): Step4Data {
  const [segments, setSegments] = useState<Step4ScriptSegment[]>([]);
  const [frameImages, setFrameImages] = useState<Step3FrameImage[]>([]);
  const [scenes, setScenes] = useState<Step4VideoScene[]>([]);
  const [music, setMusic] = useState<Step4MusicData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 使用 ref 追踪已加载的 projectId，防止重复加载
  const loadedProjectIdRef = useRef<string | null>(null);

  // 加载数据（支持按范围刷新）
  const loadData = useCallback(async (forceRefresh: boolean | Step4RefreshScope = false) => {
    if (!token || !projectId) {
      setIsLoading(false);
      return;
    }

    // 解析 scope：首次加载用 "all"，forceRefresh=true 也用 "all"
    const scope: Step4RefreshScope = forceRefresh === true ? "all" : forceRefresh === false ? "all" : forceRefresh;
    const isInitialLoad = forceRefresh === false;

    // 防止同一项目重复加载（首次加载检查）
    if (isInitialLoad && loadedProjectIdRef.current === projectId) {
      return;
    }

    // 首次加载：重置数据 + 显示 loading
    if (isInitialLoad) {
      setSegments([]);
      setFrameImages([]);
      setScenes([]);
      setMusic(null);
      setIsLoading(true);
    }
    // 非首次加载：静默刷新，保留旧数据
    setError(null);

    try {
      // 根据 scope 决定加载哪些数据
      const needSegments = scope === "all";
      const needFrames = scope === "all";
      const needScenes = scope === "all" || scope === "scenes" || scope === "scenesAndMusic";
      const needMusic = scope === "all" || scope === "scenesAndMusic";

      const [segmentsResult, framesResult, scenesResult, musicResult] = await Promise.all([
        needSegments
          ? backendApi.getStep4ScriptSegments(token, projectId).catch((e) => {
              console.error("[useStep4Data] Failed to load segments:", e);
              return { segments: [] as Step4ScriptSegment[] };
            })
          : Promise.resolve({ segments: undefined as Step4ScriptSegment[] | undefined }),
        needFrames
          ? backendApi.getStep3FrameImages(token, projectId).catch((e) => {
              console.error("[useStep4Data] Failed to load frame images:", e);
              return { frames: [] as Step3FrameImage[] };
            })
          : Promise.resolve({ frames: undefined as Step3FrameImage[] | undefined }),
        needScenes
          ? backendApi.getStep4VideoScenes(token, projectId).catch((e) => {
              console.error("[useStep4Data] Failed to load video scenes:", e);
              return { scenes: [] as Step4VideoScene[] };
            })
          : Promise.resolve({ scenes: undefined as Step4VideoScene[] | undefined }),
        needMusic
          ? backendApi.listProjectVideoMusics(token, projectId).catch((e) => {
              console.error("[useStep4Data] Failed to load music:", e);
              return { items: [] as ProjectVideoMusicDto[], selectedMusic: null };
            })
          : Promise.resolve(undefined as unknown as { items: ProjectVideoMusicDto[]; selectedMusic: null }),
      ]);

      // 处理 segments（只在 scope=all 时更新）
      if (segmentsResult.segments !== undefined) {
        setSegments(segmentsResult.segments ?? []);
      }

      // 处理 frame images（只在 scope=all 时更新）
      if (framesResult.frames !== undefined) {
        setFrameImages(
          (framesResult.frames ?? []).map((frame) => ({
            frameIndex: frame.frameIndex,
            imageUrl: frame.imageUrl,
            candidates: frame.candidates,
          })),
        );
      }

      // 处理 video scenes（直接暴露 API 类型）
      // 防竞态：如果当前 scenes 已有 variantUrls 而新数据没有，说明新数据是过时的（初始加载慢于 refresh）
      if (scenesResult.scenes !== undefined) {
        const newScenes = scenesResult.scenes ?? [];
        setScenes((prev) => {
          const prevHasUrls = prev.some((s) => (s.variantUrls?.length ?? 0) > 0);
          const newHasUrls = newScenes.some((s) => (s.variantUrls?.length ?? 0) > 0);
          if (prevHasUrls && !newHasUrls) {
            return prev;
          }
          return newScenes;
        });
      }

      // 处理 music
      if (musicResult && musicResult.items !== undefined) {
        setMusic({
          items: musicResult.items ?? [],
          selectedMusicId: musicResult.selectedMusic?.id ?? null,
        });
      }

      loadedProjectIdRef.current = projectId;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "数据加载失败";
      setError(errorMessage);
      console.error("[useStep4Data] Failed to load data:", e);
    } finally {
      setIsLoading(false);
    }
  }, [token, projectId]);

  // 刷新单个场景数据
  const refreshScene = useCallback(
    async (sceneIndex: number) => {
      if (!token || !projectId) return;

      try {
        const result = await backendApi.getStep4VideoScenes(token, projectId);
        const sceneData = (result.scenes ?? []).find(
          (s) => s.sceneIndex === sceneIndex,
        );

        if (sceneData) {
          setScenes((prev) => {
            const updated = [...prev];
            updated[sceneIndex] = sceneData;
            return updated;
          });
        }
      } catch (e) {
        console.error(`[useStep4Data] Failed to refresh scene ${sceneIndex}:`, e);
      }
    },
    [token, projectId],
  );

  // 项目切换或初始加载
  useEffect(() => {
    // 缺少必要参数
    if (!token || !projectId) {
      setIsLoading(false);
      return;
    }

    // 已加载过同一项目，跳过
    if (loadedProjectIdRef.current === projectId) {
      return;
    }

    // 执行加载
    loadData();
  }, [token, projectId, loadData]);

  // 使用 useMemo 稳定返回对象，避免每次渲染创建新对象
  return useMemo(() => ({
    segments,
    frameImages,
    scenes,
    music,
    isLoading,
    error,
    refresh: (scope?: Step4RefreshScope) => loadData(scope ?? true),
    refreshScene,
  }), [segments, frameImages, scenes, music, isLoading, error, loadData, refreshScene]);
}
