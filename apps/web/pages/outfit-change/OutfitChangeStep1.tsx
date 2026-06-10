/**
 * 换装项目 Step 1 - 选择源视频或动作模板
 * 布局风格对齐视频项目 Step1：左侧栏 + 右侧操作区
 *
 * 两种模式：
 * - 上传视频：上传或输入视频 URL
 * - 选择模板：从内置动作模板库选择
 *
 * 视频截取逻辑：
 * - 如果视频时长超过 MAX_VIDEO_DURATION 秒，自动截取前 MAX_VIDEO_DURATION 秒
 * - 使用 ffmpeg.wasm 进行前端截取（保留音频）
 * - 浏览器不支持 ffmpeg.wasm 时直接报错，不降级
 */
import React, { useCallback, useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from 'react-router';
import { Button } from "../../components/ui/Button";
import { useAppStore } from "../../store/useAppStore";
import { useProjectState } from "../../hooks/useProjectState";
import { uploadFileToOss } from "../../services/ossUpload";
import { SidebarPanelHeader } from "../../components/project-flow/SidebarPanelHeader";
import { BlurFillImage } from "../../components/shared/BlurFillImage";
import { getOssThumbnailUrl } from "../../utils/ossImage";
import { realOutfitChangeApi } from "../../services/realApi/outfit-change";
import { realActionTemplatesApi, type ActionTemplate, type ActionTemplateCategory } from "../../services/realApi/action-templates";
import { backendApi } from "../../services/backendApi";
import { trimVideoWithFfmpeg, isFfmpegWasmSupported } from "../../utils/videoTrim";

/** 换装视频最大时长（秒） */
const MAX_VIDEO_DURATION = 30;

/** 换装视频最小时长（秒），低于此值无法生成有效视频 */
const MIN_VIDEO_DURATION = 5;

/** 步骤进度卡片 */
const StepProgressCard: React.FC<{
  stepNumber: number;
  title: string;
  summary: string;
  status: "completed" | "current" | "locked" | "pending";
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
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

export const OutfitChangeStep1: React.FC = () => {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const token = useAppStore((state) => state.token);
  const { workflow, updateWorkflow, projectData } = useProjectState(projectId);

  // 源模式：上传视频 或 选择模板
  const [sourceMode, setSourceMode] = useState<"upload_video" | "builtin_template">("upload_video");

  // 视频上传相关状态
  const [videoUrl, setVideoUrl] = useState<string>(
    typeof workflow.outfitChangeSourceVideoUrl === "string"
      ? (workflow.outfitChangeSourceVideoUrl as string)
      : ""
  );
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [trimming, setTrimming] = useState(false);
  const [trimProgress, setTrimProgress] = useState(0);

  // 模板选择相关状态
  const [templates, setTemplates] = useState<ActionTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ActionTemplate | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ActionTemplateCategory | "all">("all");

  // 通用状态
  const [feedback, setFeedback] = useState<string | null>(null);
  const [stepExpandState, setStepExpandState] = useState<Record<number, boolean>>({ 1: true });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 步骤状态
  const hasVideo = sourceMode === "upload_video" && videoUrl.trim().length > 0;
  const hasTemplate = sourceMode === "builtin_template" && selectedTemplate !== null;
  const hasSource = hasVideo || hasTemplate;
  const currentStep = hasSource ? 2 : 1;

  // 加载动作模板列表
  useEffect(() => {
    if (sourceMode !== "builtin_template" || !token) return;

    setTemplatesLoading(true);
    realActionTemplatesApi.listTemplates(token, selectedCategory === "all" ? undefined : { category: selectedCategory })
      .then((res) => {
        if (res.success && res.data.items) {
          setTemplates(res.data.items);
        }
      })
      .catch((err) => {
        console.error("[OutfitChangeStep1] 加载模板失败:", err);
        setFeedback("加载动作模板失败，请刷新重试");
      })
      .finally(() => {
        setTemplatesLoading(false);
      });
  }, [sourceMode, token, selectedCategory]);

  // 同步持久化的视频 URL
  useEffect(() => {
    if (typeof workflow.outfitChangeSourceVideoUrl === "string" && !videoUrl) {
      setVideoUrl(workflow.outfitChangeSourceVideoUrl as string);
      setSourceMode("upload_video");
    }
  }, [workflow.outfitChangeSourceVideoUrl, videoUrl]);

  // 同步持久化的模板 ID
  useEffect(() => {
    const templateId = workflow.outfitChangeBuiltinTemplateId;
    if (typeof templateId === "string" && templateId && token) {
      // 加载模板详情
      realActionTemplatesApi.getTemplate(token, templateId)
        .then((res) => {
          if (res.success && res.data) {
            setSelectedTemplate(res.data);
            setSourceMode("builtin_template");
          }
        })
        .catch((err) => {
          console.error("[OutfitChangeStep1] 加载模板详情失败:", err);
        });
    }
  }, [workflow.outfitChangeBuiltinTemplateId, token]);

  // 切换步骤展开状态
  const toggleStepExpand = useCallback((step: number) => {
    setStepExpandState((prev) => ({ ...prev, [step]: !prev[step] }));
  }, []);

  /**
   * 截取视频到最大时长
   * 使用 ffmpeg.wasm 裁切（保留音频）
   */
  const trimVideoTo30Seconds = useCallback(async (file: File): Promise<File> => {
    const duration = await getVideoDuration(file);
    if (duration <= MAX_VIDEO_DURATION) {
      return file;
    }

    setTrimming(true);
    setTrimProgress(0);
    setFeedback(`视频时长 ${Math.round(duration)}秒，正在截取前 ${MAX_VIDEO_DURATION} 秒...`);

    try {
      return await trimVideoWithFfmpeg(file, MAX_VIDEO_DURATION, (percent) => {
        setTrimProgress(percent);
      });
    } finally {
      setTrimming(false);
      setTrimProgress(0);
    }
  }, []);

  /**
   * 获取视频时长
   */
  const getVideoDuration = useCallback(async (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.src = URL.createObjectURL(file);

      video.onloadedmetadata = () => {
        const duration = video.duration;
        URL.revokeObjectURL(video.src);
        resolve(duration);
      };

      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        reject(new Error("无法加载视频"));
      };
    });
  }, []);

  // 处理视频文件上传
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token || !projectId) return;

    if (!file.type.startsWith("video/")) {
      setFeedback("请上传视频文件");
      return;
    }

    if (file.size > 500 * 1024 * 1024) {
      setFeedback("视频文件不能超过 500MB");
      return;
    }

    // 校验视频最小时长
    const videoDuration = await getVideoDuration(file);
    if (videoDuration < MIN_VIDEO_DURATION) {
      setFeedback(`视频时长过短，至少需要 ${MIN_VIDEO_DURATION} 秒`);
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setFeedback(null);

    try {
      // 截取视频到最大时长（如果超限）
      const fileToUpload = await trimVideoTo30Seconds(file);
      if (fileToUpload !== file) {
        setFeedback(`已自动截取前 ${MAX_VIDEO_DURATION} 秒，正在上传...`);
      }

      // 重置状态
      setTrimming(false);
      setTrimProgress(0);

      const result = await uploadFileToOss(token, projectId, fileToUpload, false, {
        onProgress: (percent) => {
          setUploadProgress(percent);
        }
      });
      setVideoUrl(result.fileUrl);
      updateWorkflow({ outfitChangeSourceVideoUrl: result.fileUrl });
      // 持久化到后端 draft
      if (projectId) {
        try {
          await realOutfitChangeApi.saveDraft(token, { projectId, sourceVideoUrl: result.fileUrl });
        } catch (e) {
          console.error("[OutfitChangeStep1] 保存 draft 失败:", e);
          setFeedback("视频已上传，但保存失败，请刷新页面重试");
        }
      }
      setFeedback("视频上传成功");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[OutfitChangeStep1] 上传失败:", error);
      setTrimming(false);
      setTrimProgress(0);
      setUploading(false);
      setUploadProgress(0);
      setFeedback(`上传失败：${errorMsg}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [token, projectId, updateWorkflow]);

  // 处理 URL 输入
  const handleUrlInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setVideoUrl(e.target.value);
    setFeedback(null);
  }, []);

  // 选择模板
  const handleSelectTemplate = useCallback((template: ActionTemplate) => {
    setSelectedTemplate(template);
    updateWorkflow({ outfitChangeBuiltinTemplateId: template.id });
    // 清除视频 URL（互斥）
    setVideoUrl("");
    updateWorkflow({ outfitChangeSourceVideoUrl: undefined });
    // 持久化到后端 draft
    if (projectId && token) {
      realOutfitChangeApi.saveDraft(token, { projectId, builtinTemplateId: template.id, sourceVideoUrl: null })
        .catch((e) => {
          console.error("[OutfitChangeStep1] 保存 draft 失败:", e);
          setFeedback("保存失败，请重试");
        });
    }
    setFeedback(null);
  }, [projectId, token, updateWorkflow]);

  // 切换源模式
  const handleSwitchMode = useCallback((mode: "upload_video" | "builtin_template") => {
    setSourceMode(mode);
    setFeedback(null);
    // 切换模式时清除另一种源，并同步到后端 draft
    if (mode === "upload_video") {
      setSelectedTemplate(null);
      updateWorkflow({ outfitChangeBuiltinTemplateId: undefined });
      // 同步清除后端 draft 中的 builtinTemplateId
      if (projectId && token) {
        realOutfitChangeApi.saveDraft(token, { projectId, builtinTemplateId: null }).catch((e) => {
          console.error("[OutfitChangeStep1] 清除模板 draft 失败:", e);
        });
      }
    } else {
      setVideoUrl("");
      updateWorkflow({ outfitChangeSourceVideoUrl: undefined });
      // 同步清除后端 draft 中的 sourceVideoUrl
      if (projectId && token) {
        realOutfitChangeApi.saveDraft(token, { projectId, sourceVideoUrl: null }).catch((e) => {
          console.error("[OutfitChangeStep1] 清除视频 draft 失败:", e);
        });
      }
    }
  }, [updateWorkflow, projectId, token]);

  // 确认视频
  const handleConfirmVideo = useCallback(() => {
    if (!videoUrl.trim()) {
      setFeedback("请先选择或上传视频");
      return;
    }
    updateWorkflow({ outfitChangeSourceVideoUrl: videoUrl });
    // 清除模板选择（互斥）
    setSelectedTemplate(null);
    updateWorkflow({ outfitChangeBuiltinTemplateId: undefined });
    // 持久化到后端 draft
    if (projectId) {
      realOutfitChangeApi.saveDraft(token!, { projectId, sourceVideoUrl: videoUrl, builtinTemplateId: null }).catch((e) => {
        console.error("[OutfitChangeStep1] 保存 draft 失败:", e);
        setFeedback("保存失败，请重试");
      });
    }
  }, [videoUrl, updateWorkflow, token, projectId]);

  // 下一步
  const handleNext = useCallback(() => {
    if (!hasSource) {
      setFeedback(sourceMode === "upload_video" ? "请先选择或上传视频" : "请先选择动作模板");
      return;
    }
    // 根据模式持久化
    if (sourceMode === "upload_video" && videoUrl.trim()) {
      updateWorkflow({ outfitChangeSourceVideoUrl: videoUrl, outfitChangeBuiltinTemplateId: undefined });
    } else if (sourceMode === "builtin_template" && selectedTemplate) {
      updateWorkflow({ outfitChangeBuiltinTemplateId: selectedTemplate.id, outfitChangeSourceVideoUrl: undefined });
    }
    navigate(`/outfit-create/${projectId}/step2`);
  }, [hasSource, sourceMode, videoUrl, selectedTemplate, updateWorkflow, navigate, projectId]);

  // 返回项目列表（空项目静默删除）
  const handleExitToProjects = useCallback(async () => {
    if (!hasSource && projectData.projectId && token) {
      try {
        await backendApi.deleteProject(token, projectData.projectId);
      } catch { /* 删除失败不阻塞 */ }
    }
    navigate("/projects");
  }, [navigate, hasSource, projectData.projectId, token]);

  // 模板分类标签
  const templateCategories: { key: ActionTemplateCategory | "all"; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "dance", label: "舞蹈" },
    { key: "sport", label: "运动" },
    { key: "expression", label: "表情" },
    { key: "daily", label: "日常" },
    { key: "special", label: "特效" },
  ];

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto bg-[#fdfbf7] lg:flex-row lg:overflow-hidden">
      {/* 左侧栏 */}
      <div className="w-full lg:w-[400px] bg-white border-b lg:border-r lg:border-b-0 border-gray-100 flex flex-col z-10 shadow-lg shrink-0">
        {/* 面板头部 */}
        <SidebarPanelHeader
          currentStep={1}
          projectStatus={projectData.projectStatus as any}
        />

        <div className="lg:flex-1 lg:overflow-y-auto scrollbar-hide p-6 space-y-6">
          {/* 步骤进度卡片 */}
          <StepProgressCard
            stepNumber={1}
            title="上传源视频"
            summary={hasVideo ? "已上传视频" : ""}
            status={hasVideo ? "completed" : "current"}
            expanded={stepExpandState[1]}
            onToggle={() => toggleStepExpand(1)}
            onClickHeader={!hasVideo ? () => { fileInputRef.current?.click(); return true; } : undefined}
          >
            <div className="flex flex-col items-center justify-center text-gray-400 py-4">
              {trimming ? (
                <div className="flex flex-col items-center">
                  <div className="relative w-16 h-16 mb-3">
                    <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-purple-500 border-t-transparent animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="material-icons-round text-lg text-purple-500">content_cut</span>
                    </div>
                  </div>
                  <p className="font-medium text-purple-600 text-sm">截取前 {MAX_VIDEO_DURATION} 秒... {trimProgress}%</p>
                </div>
              ) : uploading ? (
                <div className="flex flex-col items-center">
                  <div className="relative w-16 h-16 mb-3">
                    <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
                    <div
                      className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"
                      style={{
                        animation: 'spin 1s linear infinite',
                      }}
                    ></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="material-icons-round text-lg text-primary">movie</span>
                    </div>
                  </div>
                  <p className="font-medium text-primary text-sm">上传中... {uploadProgress}%</p>
                </div>
              ) : (
                <div className="text-center">
                  <span className="material-icons-round text-4xl text-gray-300 mb-2 block">cloud_upload</span>
                  <p className="text-xs">支持 MP4、MOV 等格式</p>
                  <p className="text-xs">最大 500MB，{MIN_VIDEO_DURATION}-{MAX_VIDEO_DURATION} 秒</p>
                </div>
              )}
            </div>
          </StepProgressCard>

          {/* 步骤2：确认视频 */}
          <StepProgressCard
            stepNumber={2}
            title="确认视频"
            summary={hasVideo ? "视频已确认" : ""}
            status={currentStep === 2 ? "current" : hasVideo ? "completed" : "locked"}
            expanded={stepExpandState[2]}
            onToggle={() => hasVideo && toggleStepExpand(2)}
          >
            {hasVideo && (
              <div className="space-y-3">
                <div className="rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                  <video
                    src={videoUrl}
                    className="w-full max-h-[200px] object-contain"
                    controls
                    muted
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={handleConfirmVideo}
                  className="w-full"
                >
                  <span className="material-icons-round text-sm mr-1">check</span>
                  确认使用此视频
                </Button>
              </div>
            )}
          </StepProgressCard>

          {/* 提示信息 */}
          <div className="rounded-xl bg-purple-50 border border-purple-100 p-4">
            <div className="flex items-start gap-3">
              <span className="material-icons-round text-purple-400 text-lg">info</span>
              <div className="text-xs text-purple-600 leading-relaxed">
                <p className="font-medium mb-1">换装时长限制</p>
                <p className="mb-2">当前换装功能仅开放 <strong>{MIN_VIDEO_DURATION}-{MAX_VIDEO_DURATION} 秒</strong> 的视频。如果视频超过 {MAX_VIDEO_DURATION} 秒，将自动截取前 {MAX_VIDEO_DURATION} 秒进行处理。</p>
                <p className="text-purple-500">请上传包含清晰人物画面的视频，AI 将自动识别人物并进行换装。</p>
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
              <span className="material-icons-round text-xl">
                {sourceMode === "upload_video" ? "movie" : "directions_run"}
              </span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {sourceMode === "upload_video" ? "选择源视频" : "选择动作模板"}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {sourceMode === "upload_video" ? "上传或输入视频 URL 作为换装素材" : "从内置模板库选择动作模板"}
              </p>
            </div>
          </div>
        </div>

        {/* 模式切换标签 */}
        <div className="shrink-0 px-6 py-3 bg-gray-50 border-b border-gray-100">
          <div className="flex gap-2">
            <button
              onClick={() => handleSwitchMode("upload_video")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                sourceMode === "upload_video"
                  ? "bg-primary text-white shadow-sm"
                  : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              <span className="material-icons-round text-lg">movie</span>
              上传视频
            </button>
            <button
              onClick={() => handleSwitchMode("builtin_template")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                sourceMode === "builtin_template"
                  ? "bg-primary text-white shadow-sm"
                  : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              <span className="material-icons-round text-lg">directions_run</span>
              选择模板
            </button>
          </div>
        </div>

        {/* 右侧内容区 */}
        <div className="flex-1 overflow-auto p-4 pb-28 md:px-8 md:pt-8">
          {/* 上传视频模式 */}
          {sourceMode === "upload_video" && (
            <div className="max-w-lg mx-auto space-y-6">
              {/* 视频预览区 */}
              {videoUrl && (
                <div className="rounded-2xl overflow-hidden border border-gray-200 bg-black shadow-lg">
                  <video
                    src={videoUrl}
                    controls
                    muted
                    className="w-full max-h-[400px] object-contain"
                  />
                </div>
              )}

              {/* 上传区域 */}
              <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white p-10 text-center hover:border-primary/50 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleFileUpload}
                  disabled={uploading || trimming}
                  className="hidden"
                  id="video-upload-step1"
                />
                <label
                  htmlFor="video-upload-step1"
                  className={`cursor-pointer ${uploading || trimming ? "pointer-events-none" : ""}`}
                >
                  <div className="flex flex-col items-center">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center mb-4">
                      <span className="material-icons-round text-4xl text-purple-500">
                        {trimming ? "content_cut" : uploading ? "hourglass_empty" : "cloud_upload"}
                      </span>
                    </div>
                    <p className="text-base font-medium text-gray-700 mb-2">
                      {trimming ? `截取前 ${MAX_VIDEO_DURATION} 秒...` : uploading ? "上传中..." : "点击上传视频文件"}
                    </p>
                    <p className="text-sm text-gray-400">支持 MP4、MOV 等格式，最大 500MB</p>
                    <p className="text-sm text-purple-500 mt-1">换装仅开放 {MIN_VIDEO_DURATION}-{MAX_VIDEO_DURATION} 秒视频</p>
                  </div>
                </label>
              </div>

              {/* 或输入 URL */}
              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-sm text-gray-400 font-medium">或输入视频 URL</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <div>
                <div className="flex gap-3">
                  <input
                    type="url"
                    value={videoUrl}
                    onChange={handleUrlInput}
                    placeholder="https://example.com/video.mp4"
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                  <Button
                    variant="outline"
                    onClick={handleConfirmVideo}
                    disabled={!videoUrl.trim()}
                  >
                    确认
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 选择模板模式 */}
          {sourceMode === "builtin_template" && (
            <div className="max-w-3xl mx-auto space-y-6">
              {/* 分类筛选 */}
              <div className="flex gap-2 flex-wrap">
                {templateCategories.map((cat) => (
                  <button
                    key={cat.key}
                    onClick={() => setSelectedCategory(cat.key)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      selectedCategory === cat.key
                        ? "bg-primary text-white"
                        : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* 已选模板预览 */}
              {selectedTemplate && (
                <div className="rounded-2xl border-2 border-primary bg-primary/5 p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-24 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center">
                      {selectedTemplate.thumbnailUrl ? (
                        <img
                          src={selectedTemplate.thumbnailUrl}
                          alt={selectedTemplate.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="material-icons-round text-3xl text-gray-400">directions_run</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{selectedTemplate.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        分类：{templateCategories.find(c => c.key === selectedTemplate.category)?.label || selectedTemplate.category}
                      </p>
                      <p className="text-sm text-gray-500">时长：{selectedTemplate.durationSec} 秒</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-primary text-lg">check_circle</span>
                      <span className="text-sm font-medium text-primary">已选择</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 模板网格 */}
              {templatesLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="relative w-16 h-16 mb-3">
                    <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
                  </div>
                  <p className="text-gray-500">加载模板中...</p>
                </div>
              ) : templates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <span className="material-icons-round text-4xl mb-2">search_off</span>
                  <p>暂无模板</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => handleSelectTemplate(template)}
                      className={`group rounded-xl border-2 overflow-hidden transition-all ${
                        selectedTemplate?.id === template.id
                          ? "border-primary bg-primary/5"
                          : "border-gray-200 hover:border-primary/50 hover:shadow-md"
                      }`}
                    >
                      {/* 模板缩略图/视频预览（竖屏 9:16） */}
                      <div className="relative aspect-[9/16] bg-gray-100 overflow-hidden"
                        onMouseEnter={(e) => {
                          if (template.previewVideoUrl) {
                            const video = e.currentTarget.querySelector('video') as HTMLVideoElement;
                            if (video) video.play().catch(() => {/* 浏览器自动播放策略限制，预期失败 */});
                          }
                        }}
                        onMouseLeave={(e) => {
                          const video = e.currentTarget.querySelector('video') as HTMLVideoElement;
                          if (video) { video.pause(); video.currentTime = 0; }
                        }}
                      >
                        {template.previewVideoUrl ? (
                          <video
                            src={template.previewVideoUrl}
                            muted
                            loop
                            playsInline
                            poster={template.thumbnailUrl || undefined}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : template.thumbnailUrl ? (
                          <img
                            src={template.thumbnailUrl}
                            alt={template.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="material-icons-round text-3xl text-gray-400">directions_run</span>
                          </div>
                        )}
                        {/* 播放图标提示 */}
                        {template.previewVideoUrl && (
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                              <span className="material-icons-round text-white text-xl">play_arrow</span>
                            </div>
                          </div>
                        )}
                        {/* 时长标签 */}
                        <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                          {template.durationSec}s
                        </div>
                        {/* 已选标记 */}
                        {selectedTemplate?.id === template.id && (
                          <div className="absolute top-2 right-2 bg-primary text-white rounded-full p-1">
                            <span className="material-icons-round text-sm">check</span>
                          </div>
                        )}
                      </div>
                      {/* 模板信息 */}
                      <div className="p-3">
                        <h3 className="font-medium text-sm text-gray-900 truncate">{template.name}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {templateCategories.find(c => c.key === template.category)?.label || template.category}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 反馈信息 */}
          {feedback && (
            <div className="max-w-lg mx-auto mt-6">
              <div
                className={`p-4 rounded-xl text-sm flex items-center gap-2 ${
                  feedback.includes("成功")
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-600"
                    : feedback.includes("截取") || feedback.includes("模板")
                      ? "bg-purple-50 border border-purple-200 text-purple-600"
                      : "bg-red-50 border border-red-200 text-red-500"
                }`}
              >
                <span className="material-icons-round text-lg">
                  {feedback.includes("成功") ? "check_circle" : feedback.includes("截取") || feedback.includes("模板") ? "info" : "error_outline"}
                </span>
                {feedback}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 底部浮动操作栏 */}
      <div className="fixed bottom-6 left-0 right-0 z-40 flex justify-center pointer-events-none lg:left-[400px] lg:right-0">
        <div className="bg-white/60 backdrop-blur-md border border-gray-200/50 rounded-2xl sm:rounded-full px-2 sm:px-3 py-2 shadow-xl shadow-gray-200/30 pointer-events-auto flex items-center justify-center gap-2 sm:gap-4 w-[calc(100%-1rem)] sm:w-auto max-w-[960px]">
          <Button variant="ghost" onClick={handleExitToProjects} className="rounded-full px-3 sm:px-4 text-gray-500 hover:text-gray-900 whitespace-nowrap shrink-0">
            <span className="material-icons-round text-lg mr-1">arrow_back</span>
            <span className="hidden md:inline">返回我的项目</span>
          </Button>

          <div className="h-4 w-px bg-gray-200 hidden sm:block" />

          <div className="text-[10px] sm:text-xs text-gray-400 font-medium px-1 sm:px-2 min-w-0 max-w-[42vw] sm:max-w-[320px] truncate">
            {!hasSource
              ? sourceMode === "upload_video"
                ? "请先上传或输入视频 URL"
                : "请先选择动作模板"
              : sourceMode === "upload_video"
                ? "视频已就绪，可以进入下一步"
                : "模板已选择，可以进入下一步"}
          </div>

          <div className="h-4 w-px bg-gray-200 hidden sm:block" />

          <div className="shrink-0">
            <Button
              onClick={handleNext}
              disabled={!hasSource || uploading || trimming}
              className="rounded-full px-4 sm:px-6 bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/20 whitespace-nowrap transition-transform disabled:opacity-50"
            >
              <span>下一步</span>
              <span className="material-icons-round text-lg ml-1">arrow_forward</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
