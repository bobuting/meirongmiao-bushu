/**
 * Step5 数据加载 Hook
 *
 * 设计原则：
 * 1. 使用 loadedProjectIdRef 防止重复加载
 * 2. 一次性并行加载所有数据
 * 3. 不触发外部状态更新，避免无限循环
 */

import { useEffect, useRef, useState } from "react";
import { realProjectsApi } from "../../../services/realApi";
import type { SquarePublishCategory } from "../../../../../src/contracts/square-publish-category";

// ============================================================================
// 类型定义
// ============================================================================

/** 角色方向信息 */
interface RoleDirection {
  gender?: "male" | "female" | "uncertain";
  age?: number;
}

/** Step5 数据结构 */
export interface Step5Data {
  // 项目基础信息
  projectId: string;
  projectName: string | null;
  projectStatus: string;

  // 视频数据
  finalVideoUrl: string | null;
  clipVideoUrls: string[];
  durationSec: number | null;

  // 封面数据
  videoCoverImageUrl: string | null;
  coverCandidates: string[];

  // 标题数据
  titleCandidates: string[];
  publishTitle: string | null; // 用户已保存的发布标题

  // 分类
  squarePublishCategory: SquarePublishCategory | null;

  // 角色信息
  selectedRoleDirection: RoleDirection | null;
  step1SelectedRoleDirection: RoleDirection | null; // 别名，用于 UI 显示

  // 状态
  isLoading: boolean;
  error: string | null;
}

/** 空数据默认值 */
const emptyStep5Data = (): Step5Data => ({
  projectId: "",
  projectName: null,
  projectStatus: "DRAFT",
  finalVideoUrl: null,
  clipVideoUrls: [],
  durationSec: null,
  videoCoverImageUrl: null,
  coverCandidates: [],
  titleCandidates: [],
  publishTitle: null,
  squarePublishCategory: null,
  selectedRoleDirection: null,
  step1SelectedRoleDirection: null,
  isLoading: true,
  error: null,
});

// ============================================================================
// 辅助函数
// ============================================================================

/** 从角色方向计算广场分类 */
function calculateSquareCategory(
  roleDirection: Record<string, unknown> | null,
): SquarePublishCategory | null {
  if (!roleDirection) return null;

  const gender = roleDirection.gender as "male" | "female" | "uncertain" | undefined;
  const age = typeof roleDirection.age === "number" ? roleDirection.age : undefined;

  if (gender === "female") {
    return typeof age === "number" && age <= 17 ? "女童装" : "女装";
  } else if (gender === "male") {
    return typeof age === "number" && age <= 17 ? "男童装" : "男装";
  }
  return null;
}


/** 构建封面候选列表 */
function buildCoverCandidates(
  frames: Array<{ frameIndex: number; imageUrl: string; candidates?: string[] }>,
  segments: Array<{ visualCue?: string }>,
  fallbackCover: string | null,
): string[] {
  const urls: string[] = [];

  // 从分镜图片获取
  for (const frame of frames) {
    if (frame.imageUrl && frame.imageUrl.trim().length > 0) {
      urls.push(frame.imageUrl.trim());
    }
    // 也考虑候选图片
    if (frame.candidates) {
      for (const candidate of frame.candidates) {
        if (candidate && candidate.trim().length > 0 && !urls.includes(candidate.trim())) {
          urls.push(candidate.trim());
        }
      }
    }
  }

  // 添加回退封面
  if (fallbackCover && fallbackCover.trim().length > 0 && !urls.includes(fallbackCover.trim())) {
    urls.unshift(fallbackCover.trim());
  }

  return urls;
}

// ============================================================================
// Hook 实现
// ============================================================================

export function useStep5Data(
  token: string | null,
  projectId: string | null,
): Step5Data {
  const [data, setData] = useState<Step5Data>(emptyStep5Data);
  const loadedProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    // 缺少必要参数
    if (!token || !projectId) {
      setData((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    // 已加载过同一项目，跳过
    if (loadedProjectIdRef.current === projectId) {
      return;
    }

    // 标记加载中
    setData((prev) => ({ ...prev, isLoading: true, error: null }));

    // 一次性并行加载所有数据
    Promise.all([
      realProjectsApi.getProject(token, projectId),
      realProjectsApi.getStep4VideoScenes(token, projectId),
      realProjectsApi.getStep4ScriptSegments(token, projectId),
      realProjectsApi.getStep3FrameImages(token, projectId),
      realProjectsApi.getScriptSummary(token, projectId),
    ])
      .then(([project, scenesResult, segmentsResult, framesResult, scriptSummary]) => {
        // 提取视频 URL 列表
        const clipVideoUrls = (scenesResult.scenes ?? [])
          .map((s) => s.clipUrl)
          .filter((url): url is string => Boolean(url && url.trim().length > 0));

        // 提取脚本段落
        const segments = (segmentsResult.segments ?? []).map((seg) => ({
          title: seg.title,
          content: seg.content,
          visualCue: seg.visualCue,
        }));

        // 提取分镜图片
        const frames = (framesResult.frames ?? []).map((frame) => ({
          frameIndex: frame.frameIndex,
          imageUrl: frame.imageUrl,
          candidates: frame.candidates,
        }));

        const titleCandidates = scriptSummary.titleCandidates?.length
          ? scriptSummary.titleCandidates
          : scriptSummary.title ? [scriptSummary.title] : [];
        const squarePublishCategory = calculateSquareCategory(
          project.selectedRoleDirection as Record<string, unknown> | null,
        );
        const coverCandidates = buildCoverCandidates(frames, segments, project.videoCoverImageUrl);
        const roleDirection = (project.selectedRoleDirection as RoleDirection) ?? null;

        setData({
          projectId: project.id,
          projectName: project.name,
          projectStatus: project.status,
          finalVideoUrl: project.exportUrl,
          clipVideoUrls,
          durationSec: null, // getProject 不返回 durationSec，可从视频文件获取
          videoCoverImageUrl: project.videoCoverImageUrl,
          coverCandidates,
          titleCandidates: titleCandidates ?? [],
          publishTitle: (project as Record<string, unknown>).publishTitle as string | null ?? null,
          squarePublishCategory,
          selectedRoleDirection: roleDirection,
          step1SelectedRoleDirection: roleDirection, // 别名
          isLoading: false,
          error: null,
        });

        loadedProjectIdRef.current = projectId;
      })
      .catch((e) => {
        const errorMessage = e instanceof Error ? e.message : "数据加载失败";
        setData((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        console.error("[useStep5Data] Failed to load data:", e);
      });
  }, [token, projectId]);

  return data;
}