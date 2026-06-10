/**
 * 换装项目 Step 4 - 一键换装
 * 布局风格对齐视频项目 Step1：左侧栏 + 右侧操作区
 * 执行换装任务并展示结果
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from 'react-router';
import { Button } from "../../components/ui/Button";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { GlobalProgressIndicator } from "../../components/shared/GlobalProgressIndicator";
import { BlurFillImage } from "../../components/shared/BlurFillImage";
import { useAppStore } from "../../store/useAppStore";
import { GlobalTaskType, TaskStatus } from "../../components/layout/taskQueueConfig";
import { useProjectState } from "../../hooks/useProjectState";
import { SidebarPanelHeader } from "../../components/project-flow/SidebarPanelHeader";
import { backendApi } from "../../services/backendApi";
import { realOutfitChangeApi } from "../../services/realApi/outfit-change";
import { realGarmentAssetsApi } from "../../services/realApi/garment-assets";
import { getOssThumbnailUrl } from "../../utils/ossImage";
import { mergeVideosWithTransitions, checkVideoMergeSupport } from "../../libs/video-merge";
import { uploadBlobToOss } from "../../services/ossUpload";
import { VideoPreviewModal, type VideoPreviewItem } from "../../components/shared/VideoPreviewModal";

/** 图片预览弹窗（骨架 → 缩略图 → 大图，带错误处理） */
const ImagePreviewModal: React.FC<{
  preview: { imageUrl: string; thumbnailUrl?: string; label: string } | null;
  onClose: () => void;
}> = ({ preview, onClose }) => {
  const [thumbnailLoaded, setThumbnailLoaded] = React.useState(false);
  const [imageLoaded, setImageLoaded] = React.useState(false);
  const [thumbnailError, setThumbnailError] = React.useState(false);
  const [imageError, setImageError] = React.useState(false);

  React.useEffect(() => {
    if (preview) {
      setThumbnailLoaded(false);
      setImageLoaded(false);
      setThumbnailError(false);
      setImageError(false);
    }
  }, [preview?.imageUrl]);

  if (!preview) return null;

  // 缩略图：优先用传入的（页面上已缓存），否则生成一个
  const thumbnailSrc = preview.thumbnailUrl || getOssThumbnailUrl(preview.imageUrl, 200);

  // 错误状态：大图加载失败时显示错误提示
  const hasError = imageError && !imageLoaded;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col items-center rounded-2xl bg-white shadow-2xl overflow-visible"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/80"
        >
          <span className="material-icons-round text-base">close</span>
        </button>

        {/* 图片显示区域 */}
        <div className="relative p-2">
          {/* 错误状态：大图加载失败（竖屏比例） */}
          {hasError && (
            <div className="w-[200px] h-[356px] flex items-center justify-center bg-gray-100 rounded-lg">
              <div className="flex flex-col items-center gap-2 text-red-400">
                <span className="material-icons-round text-2xl">broken_image</span>
                <span className="text-sm">图片加载失败</span>
                <button
                  type="button"
                  onClick={() => {
                    setThumbnailLoaded(false);
                    setImageLoaded(false);
                    setThumbnailError(false);
                    setImageError(false);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  点击重试
                </button>
              </div>
            </div>
          )}

          {/* 骨架：缩略图未加载且未出错时显示（竖屏比例） */}
          {!thumbnailLoaded && !thumbnailError && !hasError && (
            <div className="w-[200px] h-[356px] flex items-center justify-center bg-gray-100 rounded-lg">
              <div className="flex flex-col items-center gap-2 text-gray-400">
                <span className="material-icons-round animate-spin text-2xl">refresh</span>
                <span className="text-sm">加载中...</span>
              </div>
            </div>
          )}

          {/* 图片：加载成功后显示，自适应尺寸 */}
          {!hasError && (
            <div className="relative">
              {/* 缩略图 */}
              <img
                src={thumbnailSrc}
                alt={preview.label}
                onLoad={() => setThumbnailLoaded(true)}
                onError={() => setThumbnailError(true)}
                className={`max-h-[85vh] max-w-[85vw] h-auto w-auto object-contain transition-all duration-300 ${!thumbnailLoaded || thumbnailError ? 'hidden' : imageLoaded ? 'opacity-0 absolute inset-0' : 'opacity-100'}`}
                style={{ display: thumbnailLoaded && !imageLoaded ? 'block' : 'none' }}
              />
              {/* 大图 */}
              <img
                src={preview.imageUrl}
                alt={preview.label}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
                className={`max-h-[85vh] max-w-[85vw] h-auto w-auto object-contain transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
              />
            </div>
          )}
        </div>

        {(thumbnailLoaded || imageLoaded) && (
          <div className="border-t border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 w-full text-center">{preview.label}</div>
        )}
      </div>
    </div>
  );
};

/** 异步任务阶段 → 中文标签 */
const STAGE_LABEL_MAP: Record<string, string> = {
  capturing: "参考图采集中...",
  understanding: "视频理解中...",
  adapting: "角色服装适配中...",
  generating: "视频生成中...",
};

/** 步骤进度卡片 */
const StepProgressCard: React.FC<{
  stepNumber: number;
  title: string;
  summary: string;
  status: "completed" | "current" | "locked" | "pending";
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}> = ({ stepNumber, title, summary, status, expanded, onToggle, children }) => {
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
          onToggle();
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
          {(isCompleted || isLocked) && summary && (
            <div className="text-xs text-gray-500 truncate mt-0.5">{summary}</div>
          )}
        </div>

        {/* 展开/折叠图标 */}
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

      {/* 步骤内容 */}
      <div
        className={`
          grid overflow-hidden transition-all duration-500 ease-in-out
          ${expanded && children
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
          }
        `}
      >
        <div className="overflow-hidden">
          {expanded && children && (
            <div className="px-4 pb-4 pt-1">{children}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export const OutfitChangeStep4: React.FC = () => {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const token = useAppStore((state) => state.token);
  const globalTaskQueue = useAppStore((state) => state.globalTaskQueue);
  const { workflow, projectData } = useProjectState(projectId);
  const { confirm } = useConfirm();

  // === 任务状态（统一从全局队列获取，无独立轮询） ===
  const [submitting, setSubmitting] = useState(false);
  /** 乐观加载标记：createTask 成功后立即置 true，直到 globalTaskQueue 中确认出现任务 */
  const [optimisticLoading, setOptimisticLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [stepExpandState, setStepExpandState] = useState<Record<number, boolean>>({ 1: true });
  const [imagePreview, setImagePreview] = useState<{ imageUrl: string; thumbnailUrl?: string; label: string } | null>(null);
  const [videoPreview, setVideoPreview] = useState<{ videos: VideoPreviewItem[]; currentIndex: number } | null>(null);

  // === 数据加载 ===
  const [sourceVideo, setSourceVideo] = useState<string | null>(null);
  const [garment, setGarment] = useState<{ id: string; name: string; mainImageUrl: string } | null>(null);
  const [character, setCharacter] = useState<{ id: string; name: string; thumbnailUrl: string; fiveViewOssImageUrl?: string | null } | null>(null);

  // 加载已选择的数据（优先 workflow，回退到后端 draft）
  useEffect(() => {
    const loadData = async () => {
      if (!token || !projectId) return;

      // 数据源：workflow 中有值就用 workflow，否则从后端 draft 获取
      let videoUrl: string | null = typeof workflow.outfitChangeSourceVideoUrl === "string"
        ? (workflow.outfitChangeSourceVideoUrl as string) : null;
      let garmentId: string | null = typeof workflow.outfitChangeSelectedGarmentId === "string"
        ? (workflow.outfitChangeSelectedGarmentId as string) : null;
      let characterId: string | null = typeof workflow.outfitChangeSelectedCharacterId === "string"
        ? (workflow.outfitChangeSelectedCharacterId as string) : null;

      // workflow 数据不全时，从后端 draft 恢复
      if (!videoUrl && !garmentId && !characterId) {
        try {
          const draftRes = await realOutfitChangeApi.getDraft(token, projectId);
          const draft = draftRes.data;
          if (draft) {
            videoUrl = draft.sourceVideoUrl ?? null;
            garmentId = draft.targetOutfitId ?? null;
            characterId = draft.characterId ?? null;
          }
        } catch {
          // 无 draft 不影响流程
        }
      }

      // 源视频
      if (videoUrl) {
        setSourceVideo(videoUrl);
      }

      // 服装
      if (garmentId) {
        try {
          const g = await realGarmentAssetsApi.getGarmentAsset(token, garmentId);
          setGarment({ id: g.id, name: g.name, mainImageUrl: g.mainImageUrl });
        } catch (e) {
          console.error("[Step4] 加载服装失败:", e);
        }
      }

      // 角色
      if (characterId) {
        try {
          const chars = await backendApi.listLibraryCharacters(token);
          const char = chars.items?.find(c => c.id === characterId);
          if (char) {
            setCharacter({
              id: char.id,
              name: char.name,
              thumbnailUrl: char.thumbnailUrl,
              fiveViewOssImageUrl: char.fiveViewOssImageUrl,
            });
          }
        } catch (e) {
          console.error("[Step4] 加载角色失败:", e);
        }
      }
    };

    void loadData();
  }, [token, projectId, workflow]);

  // 从全局任务队列同步换装任务（包含所有非过期状态，统一状态源）
  const outfitAsyncJob = useMemo(
    () =>
      globalTaskQueue.find(
        (t) =>
          t.type === GlobalTaskType.OUTFIT_CHANGE &&
          t.projectId === projectId &&
          t.status !== TaskStatus.EXPIRED
      ),
    [globalTaskQueue, projectId]
  );

  // 异步任务阶段标签
  const currentStageLabel = useMemo(
    () => (outfitAsyncJob?.stage ? STAGE_LABEL_MAP[outfitAsyncJob.stage] ?? "处理中..." : null),
    [outfitAsyncJob?.stage]
  );

  // 进度百分比
  const progressPercent = useMemo(() => {
    if (!outfitAsyncJob) return optimisticLoading ? 10 : 0;
    const stage = outfitAsyncJob.stage;
    if (outfitAsyncJob.status === TaskStatus.COMPLETED) return 100;
    if (stage === "capturing") return 20;
    if (stage === "understanding") return 40;
    if (stage === "adapting") return 60;
    if (stage === "generating") return 80;
    return 10;
  }, [outfitAsyncJob, optimisticLoading]);

  // 从全局队列 result 字段提取结果数据（优先从项目持久化数据获取）
  const resultVideoUrl = useMemo(
    () => {
      // 优先从项目持久化数据获取（export_url 字段）
      const projectExportUrl = projectData?.exportUrl as string | undefined;
      if (projectExportUrl) return projectExportUrl;

      // 回退从异步任务队列获取
      return (outfitAsyncJob?.result?.finalVideoUrl as string) ?? null;
    },
    [projectData?.exportUrl, outfitAsyncJob?.result]
  );
  // video-edit 模式的参考图结果（从父任务 result.videoEditFrames 或子任务结果提取）
  const videoEditFrames = useMemo(() => {
    // 方式 1：从父任务 result.videoEditFrames（后端 handleGenComplete 写入）
    const parentFrames = outfitAsyncJob?.result?.videoEditFrames as Array<{
      segmentIndex: number;
      sourceVideoUrl?: string;
      sourceVideoThumbnails?: Array<{ url: string; timeMs: number }>;
      referenceImageUrl: string;
      editedVideoUrl?: string;
    }> | undefined;
    if (parentFrames && parentFrames.length > 0) {
      return parentFrames.sort((a, b) => a.segmentIndex - b.segmentIndex);
    }

    // 方式 2：从全局队列直接找 video-edit adapt 子任务的 result
    const adaptJobs = globalTaskQueue.filter(
      (t) => t.parentJobId === outfitAsyncJob?.id && t.type === GlobalTaskType.OUTFIT_CHANGE_ADAPT_VIDEO_EDIT
    );
    if (adaptJobs.length > 0) {
      return adaptJobs
        .filter((t) => t.result && typeof t.result === "object")
        .map((t) => {
          const r = t.result as Record<string, unknown>;
          // segmentVideoUrl 是切片视频 URL（后端写入的字段名）
          const segmentVideoUrl = r.segmentVideoUrl as string | undefined;
          const sourceVideoThumbnails = r.sourceVideoThumbnails as Array<{ url: string; timeMs: number }> | undefined;
          return {
            segmentIndex: (r.segmentIndex as number) ?? 0,
            sourceVideoUrl: segmentVideoUrl, // 切片视频 URL
            sourceVideoThumbnails: sourceVideoThumbnails || [], // 关键帧截图数组
            referenceImageUrl: r.referenceImageUrl as string,
            editedVideoUrl: segmentVideoUrl,
          };
        })
        .sort((a, b) => a.segmentIndex - b.segmentIndex);
    }
    return [];
  }, [globalTaskQueue, outfitAsyncJob?.id, outfitAsyncJob?.result]);

  /** 获取 OSS 视频截图 URL（首帧） */
  const getOssVideoSnapshot = useCallback((videoUrl: string) => {
    if (!videoUrl) return "";
    // OSS 视频截图格式：?x-oss-process=video/snapshot,t_0
    // t_0 表示截取第 0 毫秒（首帧）
    return `${videoUrl}?x-oss-process=video/snapshot,t_0`;
  }, []);

  // 从 understand 子任务结果中提取分镜数量，用于骨架占位
  // 优先从全局队列直接查找子任务（父任务 running 时 result 可能为空）
  const segmentCount = useMemo(() => {
    // 方式 1：从全局队列直接找 understand 子任务
    const understandJob = globalTaskQueue.find(
      (t) => t.parentJobId === outfitAsyncJob?.id && t.type === GlobalTaskType.OUTFIT_CHANGE_UNDERSTAND
    );
    if (understandJob?.result && typeof understandJob.result === "object") {
      const count = (understandJob.result as Record<string, unknown>).actionSegmentCount as number | undefined;
      if (count && count > 0) return count;
    }
    // 方式 2：从父任务 result.childResults 回退
    const childResults = outfitAsyncJob?.result?.childResults as Array<{
      jobType: string;
      result?: { actionSegmentCount?: number };
    }> | undefined;
    if (!childResults) return 0;
    const understand = childResults.find((c) => c.jobType === "outfit_change_understand" && c.result);
    return understand?.result?.actionSegmentCount ?? 0;
  }, [globalTaskQueue, outfitAsyncJob?.id, outfitAsyncJob?.result]);

  const taskError = useMemo(
    () => outfitAsyncJob?.error?.message ?? null,
    [outfitAsyncJob?.error]
  );

  // 判断是否准备好合并（后端状态为 ready_for_merge）
  const readyForMerge = useMemo(
    () => (outfitAsyncJob?.result?.readyForMerge as boolean) ?? false,
    [outfitAsyncJob?.result]
  );

  // 任务完成判断：有最终视频 URL（不依赖异步任务状态，支持持久化数据）
  const hasResult = !!resultVideoUrl;

  // 合并进度状态
  const [isMerging, setIsMerging] = useState(false);
  const [mergeProgress, setMergeProgress] = useState(0);
  const [mergeStatus, setMergeStatus] = useState("");

  // 切换步骤展开状态
  const toggleStepExpand = useCallback((step: number) => {
    setStepExpandState((prev) => ({ ...prev, [step]: !prev[step] }));
  }, []);

  // 提交换装任务（支持无角色情况，将使用原视频人物）
  const handleSubmit = useCallback(async () => {
    if (!token || !projectId || !sourceVideo || !garment) return;

    setSubmitting(true);
    setFeedback(null);
    setOptimisticLoading(true);

    try {
      const taskBody: {
        sourceVideoUrl: string;
        targetOutfitId: string;
        projectId: string;
        characterType?: "library" | "generated";
        characterId?: string;
      } = {
        sourceVideoUrl: sourceVideo,
        targetOutfitId: garment.id,
        projectId,
      };

      // 选了角色才传角色信息，未选则用原视频角色
      if (character) {
        taskBody.characterType = "library";
        taskBody.characterId = character.id;
      }

      await realOutfitChangeApi.createTask(token, taskBody);

      // 立即刷新全局队列，不等下一个 3s 周期
      await useAppStore.getState().refreshGlobalTasks();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setFeedback(`提交失败：${errorMsg}`);
      setOptimisticLoading(false);
    } finally {
      setSubmitting(false);
    }
  }, [token, projectId, sourceVideo, garment, character]);

  // 前端合并视频（WebCodecos）
  const handleMerge = useCallback(async () => {
    if (!token || !projectId || !outfitAsyncJob) return;

    // 获取所有分镜视频 URL
    const editedVideoUrls = videoEditFrames
      .filter((frame) => frame.editedVideoUrl)
      .sort((a, b) => a.segmentIndex - b.segmentIndex)
      .map((frame) => frame.editedVideoUrl!);

    if (editedVideoUrls.length === 0) {
      setFeedback("没有可合并的视频片段");
      return;
    }

    setIsMerging(true);
    setMergeProgress(0);
    setMergeStatus("准备合并...");

    try {
      // 检查浏览器是否支持 WebCodecos
      const browserMergeSupported = await checkVideoMergeSupport();
      if (!browserMergeSupported) {
        throw new Error("您的浏览器不支持视频合成功能，请使用最新版 Chrome、Edge 或 Safari 浏览器");
      }

      setMergeStatus("下载视频片段...");
      setMergeProgress(5);

      // 使用前端 WebCodecos 合并视频
      const result = await mergeVideosWithTransitions({
        videos: editedVideoUrls,
        transitionType: "random",
        fps: 30,
        timing: 'ease-in-out',
        alignment: 0.5,
        onProgress: (percent, message) => {
          setMergeProgress(Math.max(5, percent * 0.9));
          setMergeStatus(message);
        },
      });

      setMergeProgress(95);
      setMergeStatus("上传视频到云端...");

      // 上传合并后的视频到 OSS
      const { fileUrl } = await uploadBlobToOss(
        token,
        projectId,
        result.blob,
        `outfit-change-merged_${Date.now()}.mp4`,
        (percent) => {
          setMergeProgress(95 + Math.floor(percent * 0.05));
          setMergeStatus(`上传中 ${percent}%`);
        },
      );

      setMergeProgress(100);
      setMergeStatus("合成完成！");

      // 调用后端 API 更新任务和项目状态
      await realOutfitChangeApi.completeMerge(token, outfitAsyncJob.id, {
        mergedVideoUrl: fileUrl,
        durationSec: Math.round(result.duration),
      });

      // 刷新全局队列
      await useAppStore.getState().refreshGlobalTasks();

      setFeedback(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setFeedback(`合并失败：${errorMsg}`);
    } finally {
      setIsMerging(false);
      setMergeProgress(0);
      setMergeStatus("");
    }
  }, [token, projectId, outfitAsyncJob, videoEditFrames]);

  // 上一步
  const handleBack = useCallback(() => {
    navigate(`/outfit-create/${projectId}/step3`);
  }, [navigate, projectId]);

  const isProcessing = !!outfitAsyncJob && (outfitAsyncJob.status === TaskStatus.PENDING || outfitAsyncJob.status === TaskStatus.RUNNING);

  // optimisticLoading: createTask 成功但 globalTaskQueue 尚未同步到时的过渡态
  const isLoading = isProcessing || optimisticLoading;

  const canSubmit = sourceVideo && garment && !submitting && !isLoading;

  // 当 globalTaskQueue 中确认出现任务后（任何状态），关闭乐观加载
  useEffect(() => {
    if (optimisticLoading && outfitAsyncJob) {
      setOptimisticLoading(false);
    }
  }, [optimisticLoading, outfitAsyncJob]);

  // 组件挂载时加载全局任务队列（恢复正在进行中的任务状态）
  useEffect(() => {
    if (token) {
      void useAppStore.getState().refreshGlobalTasks();
    }
  }, [token]);

  // 步骤状态
  const getStepStatus = () => {
    if (hasResult) return "completed";
    if (isLoading || submitting) return "current";
    return "current";
  };

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto bg-[#fdfbf7] lg:flex-row lg:overflow-hidden">
      {/* 合成进度覆盖层 */}
      {isMerging && (
        <div className="absolute inset-0 z-[110] flex flex-col items-center justify-center bg-white/95 backdrop-blur-md">
          <div className="relative mx-auto mb-8 h-64 w-64">
            {/* 进度圆环 */}
            <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
              {/* 背景圆环 */}
              <circle cx="50" cy="50" r="45" fill="none" stroke="#f3f4f6" strokeWidth="6" />
              {/* 进度圆环 */}
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinecap="round"
                className="text-primary"
                strokeDasharray={`${mergeProgress * 2.83} 283`}
                style={{ transition: "stroke-dasharray 0.3s ease-out" }}
              />
            </svg>
            {/* 中心进度数字 */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-4xl font-bold text-gray-900">{Math.round(mergeProgress)}%</span>
            </div>
          </div>
          <h2 className="mb-2 font-display text-2xl font-bold text-gray-900">
            {mergeProgress < 100 ? "正在合成视频..." : "合成完成！"}
          </h2>
          <p className="text-gray-500 text-center max-w-md px-4">
            {mergeStatus || "正在应用转场效果并导出最终视频，请稍候..."}
          </p>
          {/* 进度条 */}
          <div className="mt-6 w-64 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
              style={{ width: `${mergeProgress}%` }}
            />
          </div>
        </div>
      )}
      {/* 左侧栏 */}
      <div className="w-full lg:w-[400px] bg-white border-b lg:border-r lg:border-b-0 border-gray-100 flex flex-col z-10 shadow-lg shrink-0">
        {/* 面板头部 */}
        <SidebarPanelHeader
          currentStep={4}
          projectStatus={projectData.projectStatus as any}
        />

        <div className="lg:flex-1 lg:overflow-y-auto scrollbar-hide p-6 space-y-6">
          {/* 步骤进度卡片 */}
          <StepProgressCard
            stepNumber={1}
            title="一键换装"
            summary={hasResult ? "换装完成" : isLoading ? "处理中" : ""}
            status={getStepStatus()}
            expanded={stepExpandState[1]}
            onToggle={() => toggleStepExpand(1)}
          >
            <div className="space-y-3">
              {/* 源视频 */}
              <div
                className={`p-2 rounded-lg bg-gray-50 flex items-center gap-2 ${sourceVideo ? "cursor-pointer hover:bg-gray-100 transition-colors" : ""}`}
                onClick={() => {
                  if (sourceVideo) {
                    setVideoPreview({
                      videos: [{ url: sourceVideo, title: "源视频" }],
                      currentIndex: 0,
                    });
                  }
                }}
              >
                <span className="material-icons-round text-gray-400 text-lg">movie</span>
                <span className="text-xs text-gray-600 truncate flex-1">
                  {sourceVideo ? "源视频已就绪" : "未选择视频"}
                </span>
                {sourceVideo && <span className="material-icons-round text-gray-400 text-sm">zoom_in</span>}
              </div>

              {/* 服装 */}
              <div
                className={`p-2 rounded-lg bg-gray-50 flex items-center gap-2 ${garment ? "cursor-pointer hover:bg-gray-100 transition-colors" : ""}`}
                onClick={() => {
                  if (garment) {
                    setImagePreview({
                      imageUrl: garment.mainImageUrl,
                      thumbnailUrl: getOssThumbnailUrl(garment.mainImageUrl, 200),
                      label: garment.name,
                    });
                  }
                }}
              >
                {garment ? (
                  <>
                    <BlurFillImage
                      src={getOssThumbnailUrl(garment.mainImageUrl, 32)}
                      alt={garment.name}
                      className="w-6 h-6 rounded object-cover"
                    />
                    <span className="text-xs text-gray-600 truncate flex-1">{garment.name}</span>
                    <span className="material-icons-round text-gray-400 text-sm">zoom_in</span>
                  </>
                ) : (
                  <span className="text-xs text-gray-400">未选择服装</span>
                )}
              </div>

              {/* 角色（优先显示五视图） */}
              <div
                className={`p-2 rounded-lg bg-gray-50 flex items-center gap-2 ${character ? "cursor-pointer hover:bg-gray-100 transition-colors" : ""}`}
                onClick={() => {
                  if (character) {
                    const previewUrl = character.fiveViewOssImageUrl || character.thumbnailUrl;
                    if (previewUrl) {
                      setImagePreview({
                        imageUrl: previewUrl,
                        thumbnailUrl: getOssThumbnailUrl(previewUrl, 200),
                        label: character.fiveViewOssImageUrl ? `${character.name} - 五视图` : character.name,
                      });
                    }
                  }
                }}
              >
                {character ? (
                  <>
                    <BlurFillImage
                      src={getOssThumbnailUrl(character.fiveViewOssImageUrl || character.thumbnailUrl, 32)}
                      alt={character.name}
                      className="w-6 h-6 rounded object-cover"
                    />
                    <span className="text-xs text-gray-600 truncate flex-1">{character.name}</span>
                    {character.fiveViewOssImageUrl && (
                      <span className="text-xs text-purple-500 bg-purple-100 px-1.5 py-0.5 rounded">五视图</span>
                    )}
                    <span className="material-icons-round text-gray-400 text-sm">zoom_in</span>
                  </>
                ) : (
                  <span className="text-xs text-gray-400">未选择角色</span>
                )}
              </div>
            </div>
          </StepProgressCard>

          {/* 提示信息 */}
          <div className="rounded-xl bg-purple-50 border border-purple-100 p-4">
            <div className="flex items-start gap-3">
              <span className="material-icons-round text-purple-400 text-lg">auto_fix_high</span>
              <div className="text-xs text-purple-600 leading-relaxed">
                <p className="font-medium mb-1">换装说明</p>
                <p>AI 将自动处理视频，将选择的服装应用到目标角色上。</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧操作区 */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* 右侧 Header */}
        <div className="shrink-0 px-6 py-5 bg-white border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-400 text-white shadow-md">
              <span className="material-icons-round text-xl">auto_fix_high</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">一键换装</h2>
              <p className="text-sm text-gray-500 mt-0.5">AI 将自动处理视频，将服装应用到角色上</p>
            </div>
          </div>
        </div>

        {/* 右侧内容区 */}
        <div className="flex-1 lg:overflow-y-auto p-4 pb-28 md:px-8 md:pt-8">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* 主视频预览区：合成前显示原视频，合成后显示合成视频 */}
            {(sourceVideo || resultVideoUrl) && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
                  <span className="material-icons-round text-lg text-primary">
                    {hasResult && resultVideoUrl ? "play_circle" : "movie"}
                  </span>
                  <span className="text-sm font-medium text-gray-700">
                    {hasResult && resultVideoUrl ? "换装结果视频" : "源视频"}
                  </span>
                  {isLoading && (
                    <span className="ml-auto text-xs text-primary animate-pulse">{currentStageLabel ?? "处理中..."}</span>
                  )}
                  {!isMerging && hasResult && resultVideoUrl && (
                    <button
                      type="button"
                      onClick={handleMerge}
                      className="ml-auto text-xs text-gray-500 hover:text-primary flex items-center gap-1 transition-colors"
                    >
                      <span className="material-icons-round text-sm">replay</span>
                      重新合成
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-center bg-black/5 p-2">
                  <video
                    src={hasResult && resultVideoUrl ? resultVideoUrl : sourceVideo!}
                    controls
                    autoPlay={hasResult && !!resultVideoUrl}
                    muted
                    loop
                    className="max-h-[50vh] w-auto rounded-lg object-contain"
                  />
                </div>
              </div>
            )}

            {/* 进度指示器（非视频区，显示在下方） */}
            {isLoading && (
              <GlobalProgressIndicator
                variant="global"
                visible={true}
                title="换装视频生成"
                progress={progressPercent}
                hint={currentStageLabel ?? "处理中..."}
              />
            )}
            {/* 错误信息 */}
            {taskError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 flex items-center gap-2">
                <span className="material-icons-round text-lg">error_outline</span>
                {taskError}
              </div>
            )}

            {/* Loading 骨架占位 - 早期阶段（分镜数量未确定时显示简单提示） */}
            {isLoading && !hasResult && segmentCount === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-icons-round text-primary text-xl animate-pulse">auto_fix_high</span>
                  <h3 className="text-sm font-semibold text-gray-900">换装处理中</h3>
                  <span className="ml-auto text-xs text-gray-400 animate-pulse">{currentStageLabel ?? "正在分析视频..."}</span>
                </div>
                <div className="flex items-center justify-center py-8">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-400/20 animate-pulse flex items-center justify-center">
                      <span className="material-icons-round text-primary text-2xl animate-spin">refresh</span>
                    </div>
                    <p className="text-sm text-gray-500">AI 正在分析视频内容...</p>
                  </div>
                </div>
              </div>
            )}

            {/* Loading 骨架占位（分镜数量已确定，显示分镜骨架） */}
            {isLoading && !hasResult && segmentCount > 0 && videoEditFrames.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-icons-round text-primary text-xl animate-pulse">auto_fix_high</span>
                  <h3 className="text-sm font-semibold text-gray-900">换装处理中</h3>
                  <span className="ml-auto text-xs text-gray-400 animate-pulse">{currentStageLabel ?? "处理中..."}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Array.from({ length: segmentCount }).map((_, i) => (
                    <div key={i}>
                      <p className="text-xs text-gray-400 mb-1">分镜 {i + 1}</p>
                      <div className="rounded-lg bg-gray-100 border border-gray-200 overflow-hidden">
                        <div className="w-full aspect-[9/16] bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* video-edit 模式分镜结果展示（所有分镜生成完成后显示） */}
            {videoEditFrames.length > 0 && !hasResult && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                {/* 标题栏 */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <span className="material-icons-round text-lg text-green-500">check_circle</span>
                    <h3 className="text-base font-semibold text-gray-900">分镜结果</h3>
                    <span className="text-xs text-gray-500">({videoEditFrames.length} 个分镜已生成)</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 text-green-600 text-xs font-medium">
                    <span className="material-icons-round text-sm">verified</span>
                    准备合成
                  </div>
                </div>

                {/* 卡片网格 */}
                <div className="px-5 pb-5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {videoEditFrames.map((frame, idx) => (
                      <div
                        key={idx}
                        className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-300"
                      >
                        {/* 分镜序号 */}
                        <div className="px-3 pt-2 pb-0">
                          <div className="text-[10px] text-gray-400 flex items-center gap-1">
                            <span className="material-icons-round text-[10px]">movie_filter</span>
                            分镜 {frame.segmentIndex + 1}
                          </div>
                        </div>

                        {/* 内容区 - 两张图并排 */}
                        <div className="p-3 pt-1.5 flex gap-2">
                          {/* 切片视频截图 */}
                          <div className="flex-1">
                            <div className="text-[10px] text-gray-400 mb-1 flex items-center gap-1">
                              <span className="material-icons-round text-xs text-blue-400">videocam</span>
                              切片
                            </div>
                            {(frame.sourceVideoThumbnails?.[0]?.url || frame.sourceVideoUrl) && (
                              <div
                                className="aspect-[9/16] rounded-lg overflow-hidden bg-gray-100 cursor-pointer hover:opacity-90 transition-opacity relative"
                                onClick={() => {
                                  if (frame.sourceVideoUrl) {
                                    setVideoPreview({
                                      videos: [{ url: frame.sourceVideoUrl, title: `分镜 ${frame.segmentIndex + 1} - 切片视频` }],
                                      currentIndex: 0,
                                    });
                                  }
                                }}
                              >
                                <img
                                  src={frame.sourceVideoThumbnails?.[0]?.url || getOssVideoSnapshot(frame.sourceVideoUrl!)}
                                  alt={`分镜 ${frame.segmentIndex + 1} 切片截图`}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                                {/* 播放图标 */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-6 h-6 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                                    <span className="material-icons-round text-white text-sm">play_arrow</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* 参考图 */}
                          <div className="flex-1">
                            <div className="text-[10px] text-gray-400 mb-1 flex items-center gap-1">
                              <span className="material-icons-round text-xs text-green-400">image</span>
                              参考图
                            </div>
                            {frame.referenceImageUrl && (
                              <div
                                className="aspect-[9/16] rounded-lg overflow-hidden bg-gray-100 cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => setImagePreview({
                                  imageUrl: frame.referenceImageUrl,
                                  thumbnailUrl: getOssThumbnailUrl(frame.referenceImageUrl, 200),
                                  label: `分镜 ${frame.segmentIndex + 1} - 参考图`
                                })}
                              >
                                <img
                                  src={getOssThumbnailUrl(frame.referenceImageUrl, 200)}
                                  alt={`分镜 ${frame.segmentIndex + 1} 参考图`}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 底部状态栏 */}
                        <div className="px-3 py-1.5 border-t border-gray-100 rounded-b-xl flex items-center justify-between">
                          <span className="text-[11px] font-medium text-green-600 flex items-center gap-0.5">
                            <span className="material-icons-round text-xs">check_circle</span>
                            已完成
                          </span>
                          {frame.editedVideoUrl && (
                            <span className="text-[10px] text-gray-400">可预览</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 生成结果 */}
            {hasResult && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                {/* 标题栏 */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <span className="material-icons-round text-lg text-green-500">verified</span>
                    <h3 className="text-base font-semibold text-gray-900">分镜结果</h3>
                    <span className="text-xs text-gray-500">({videoEditFrames.length} 个分镜)</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 text-green-600 text-xs font-medium">
                    <span className="material-icons-round text-sm">check_circle</span>
                    合成完成
                  </div>
                </div>

                {/* 卡片网格 */}
                <div className="px-5 pb-5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {videoEditFrames.map((frame, idx) => (
                      <div
                        key={idx}
                        className="bg-white rounded-xl border-2 border-emerald-300 bg-emerald-50/50 shadow-md transition-all duration-300"
                      >
                        {/* 分镜序号 */}
                        <div className="px-3 pt-2 pb-0">
                          <div className="text-[10px] text-gray-400 flex items-center gap-1">
                            <span className="material-icons-round text-[10px]">movie_filter</span>
                            分镜 {frame.segmentIndex + 1}
                          </div>
                        </div>

                        {/* 内容区 - 两张图并排 */}
                        <div className="p-3 pt-1.5 flex gap-2">
                          {/* 参考图 */}
                          <div className="flex-1">
                            <div className="text-[10px] text-gray-400 mb-1 flex items-center gap-1">
                              <span className="material-icons-round text-xs text-green-400">image</span>
                              参考图
                            </div>
                            {frame.referenceImageUrl && (
                              <div
                                className="aspect-[9/16] rounded-lg overflow-hidden bg-gray-100 cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => setImagePreview({
                                  imageUrl: frame.referenceImageUrl,
                                  thumbnailUrl: getOssThumbnailUrl(frame.referenceImageUrl, 200),
                                  label: `分镜 ${frame.segmentIndex + 1} - 参考图`
                                })}
                              >
                                <img
                                  src={getOssThumbnailUrl(frame.referenceImageUrl, 200)}
                                  alt={`分镜 ${frame.segmentIndex + 1} 参考图`}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                            )}
                          </div>

                          {/* 编辑视频 */}
                          <div className="flex-1">
                            <div className="text-[10px] text-gray-400 mb-1 flex items-center gap-1">
                              <span className="material-icons-round text-xs text-blue-400">videocam</span>
                              视频
                            </div>
                            {frame.editedVideoUrl && (
                              <div
                                className="aspect-[9/16] rounded-lg overflow-hidden bg-gray-100 cursor-pointer hover:opacity-90 transition-opacity relative"
                                onClick={() => setVideoPreview({
                                  videos: [{ url: frame.editedVideoUrl!, title: `分镜 ${frame.segmentIndex + 1} - 编辑视频` }],
                                  currentIndex: 0,
                                })}
                              >
                                <img
                                  src={getOssVideoSnapshot(frame.editedVideoUrl!)}
                                  alt={`分镜 ${frame.segmentIndex + 1} 编辑视频`}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                                {/* 播放图标 */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-6 h-6 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                                    <span className="material-icons-round text-white text-sm">play_arrow</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 底部状态栏 + 重试按钮 */}
                        <div className="px-3 py-1.5 border-t border-emerald-300 rounded-b-xl flex items-center justify-between">
                          <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-0.5">
                            <span className="material-icons-round text-xs">check_circle</span>
                            已完成
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              // TODO: 实现单分镜重试抽卡
                              console.log(`重试分镜 ${frame.segmentIndex + 1}`);
                            }}
                            className="text-[10px] text-gray-500 hover:text-primary flex items-center gap-0.5 transition-colors"
                          >
                            <span className="material-icons-round text-xs">refresh</span>
                            重试
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 底部浮动操作栏 */}
      <div className="fixed bottom-6 left-0 right-0 z-40 flex justify-center pointer-events-none lg:left-[400px] lg:right-0">
        <div className="bg-white/60 backdrop-blur-md border border-gray-200/50 rounded-2xl sm:rounded-full px-2 sm:px-3 py-2 shadow-xl shadow-gray-200/30 pointer-events-auto flex items-center justify-center gap-2 sm:gap-4 w-[calc(100%-1rem)] sm:w-auto max-w-[960px]">
          {/* 上一步按钮 */}
          <Button variant="ghost" onClick={handleBack} className="rounded-full px-3 sm:px-4 text-gray-500 hover:text-gray-900 whitespace-nowrap shrink-0">
            <span className="material-icons-round text-lg mr-1">arrow_back</span>
            <span className="hidden md:inline">上一步</span>
          </Button>

          <div className="h-4 w-px bg-gray-200 hidden sm:block" />

          <div className="text-[10px] sm:text-xs text-gray-400 font-medium px-1 sm:px-2 min-w-0 max-w-[42vw] sm:max-w-[320px] truncate">
            {!sourceVideo || !garment
              ? "请先完成前面的步骤"
              : hasResult
                ? "换装已完成"
                : readyForMerge
                  ? "分镜已生成，可合成视频"
                  : isLoading
                    ? "AI 正在处理..."
                    : character
                      ? "点击右侧按钮开始换装"
                      : "未选择角色，将使用原视频人物"}
          </div>

          <div className="h-4 w-px bg-gray-200 hidden sm:block" />

          {/* 主按钮区 */}
          <div className="shrink-0">
            {/* 合成中：显示进度 */}
            {isMerging && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary">
                <span className="material-icons-round text-lg animate-spin">refresh</span>
                <span className="text-sm font-medium">{Math.round(mergeProgress)}%</span>
              </div>
            )}
            {/* 合成完成：显示下载视频按钮 */}
            {!isMerging && hasResult && resultVideoUrl && (
              <Button
                variant="primary"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = resultVideoUrl;
                  link.download = 'outfit-change-video.mp4';
                  link.click();
                }}
                className="rounded-full px-4 sm:px-6 shadow-lg shadow-primary/20 whitespace-nowrap"
              >
                <span className="material-icons-round text-lg mr-1">download</span>
                <span>下载视频</span>
              </Button>
            )}
            {/* 准备合并：显示合成视频按钮（主按钮） */}
            {!isMerging && !hasResult && readyForMerge && (
              <Button
                onClick={handleMerge}
                className="rounded-full px-4 sm:px-6 bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/20 whitespace-nowrap"
              >
                <span className="material-icons-round text-lg mr-1">merge_type</span>
                <span>合成视频</span>
              </Button>
            )}
            {/* 处理中（已提交，正在生成分镜）：显示生成进度 */}
            {!isMerging && !hasResult && !readyForMerge && isLoading && (
              <Button
                disabled
                className="rounded-full px-4 sm:px-6 bg-gray-400 text-white whitespace-nowrap cursor-not-allowed"
              >
                <span className="material-icons-round text-lg mr-1 animate-spin">refresh</span>
                <span>生成中...</span>
              </Button>
            )}
            {/* 未开始（未提交）：显示开始换装按钮 */}
            {!isMerging && !hasResult && !readyForMerge && !isLoading && (
              <Button
                onClick={async () => {
                  const garmentName = garment?.name ?? "未选择";
                  const characterName = character?.name ?? "未选择";
                  const ok = await confirm(
                    `服装：${garmentName}\n角色：${characterName}\n\n确认后将开始生成换装视频，请耐心等待。`,
                    "确认开始换装？"
                  );
                  if (ok) handleSubmit();
                }}
                disabled={!canSubmit}
                className="rounded-full px-4 sm:px-6 bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/20 whitespace-nowrap transition-transform disabled:opacity-50"
              >
                <span className="material-icons-round text-lg mr-1">auto_fix_high</span>
                <span>{submitting ? "提交中..." : "开始换装"}</span>
              </Button>
            )}
          </div>
          {feedback && (
            <p className="mt-2 text-sm text-red-500 text-center">{feedback}</p>
          )}
        </div>
      </div>

      {/* 图片预览弹窗 */}
      <ImagePreviewModal preview={imagePreview} onClose={() => setImagePreview(null)} />
      {/* 视频预览弹窗 */}
      <VideoPreviewModal
        isOpen={!!videoPreview}
        videos={videoPreview?.videos ?? []}
        currentIndex={videoPreview?.currentIndex ?? 0}
        onIndexChange={(i) => videoPreview && setVideoPreview({ ...videoPreview, currentIndex: i })}
        onClose={() => setVideoPreview(null)}
      />
    </div>
  );
};
