/**
 * ImageModelPhotos.tsx — 图片项目 Step 3 模特图网格展示页面
 *
 * 功能：网格展示模特图 + 灯箱预览 + 选择交互 + 重新生成
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BlurFillImage } from "../../components/shared/BlurFillImage";
import { useParams, useNavigate } from 'react-router';
import { useAppStore } from "../../store/useAppStore";
import { GlobalTaskType, TaskStatus } from "../../components/layout/taskQueueConfig";
import { useProjectState } from "../../hooks/useProjectState";
import { realBackendApi } from "../../services/realApi";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import {
  resolveStep3FooterTargetRoute,
  resolveStep3FooterPreviousRoute,
  resolveStep3FooterFeedback,
} from "../project-flow/step2ProjectFlowAction";
import type { ModelPhoto, ModelPhotoStatus, ImageProjectStatus } from "../../../../src/contracts/types";
import { isImageStatusBeyond } from "../../../../src/contracts/types";
import {
  StepContentHeader,
  ImageProjectFlowHistorySidebar,
} from "../../components/project-flow";
import { FLOW_SAFE_BOTTOM_PADDING } from "../project-flow/safeBottomPadding";

// ---------------------------------------------------------------------------
// 模特图卡片子组件
// ---------------------------------------------------------------------------

interface ModelPhotoCardProps {
  photo: ModelPhoto;
  onSelect: (photo: ModelPhoto) => void;
  onToggleSelect: (photoId: string) => void;
  onRegenerate: (photoId: string) => void;
  onDelete: (photoId: string) => void;
  disabled?: boolean;
}

const statusLabelMap: Record<ModelPhotoStatus, string> = {
  pending: "等待中",
  generating: "生成中...",
  success: "已完成",
  failed: "生成失败",
};

const ModelPhotoCard: React.FC<ModelPhotoCardProps> = ({ photo, onSelect, onToggleSelect, onRegenerate, onDelete, disabled = false }) => {
  const isGenerating = photo.status === "generating";
  const isFailed = photo.status === "failed";

  return (
    <div className={`relative group rounded-lg overflow-hidden bg-white border border-gray-200 transition-all ${disabled ? "cursor-not-allowed opacity-80" : "cursor-pointer hover:border-purple-400 hover:shadow-md"}`}>
      {/* 图片 / 状态占位 */}
      <div className="aspect-[4/3] relative">
        {isGenerating ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gray-50">
            <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-gray-400">生成中...</span>
          </div>
        ) : photo.imageUrl ? (
          <>
            <BlurFillImage src={photo.imageUrl} alt={`${photo.poseLabel}-${photo.bgLabel}`} aspectClass="w-full h-full" />
            {/* 左上角勾选点击区域（在 BlurFillImage 之上） */}
            <div
              className={`absolute top-0 left-0 z-20 w-12 h-12 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
              onClick={(e) => {
                e.stopPropagation();
                if (!disabled) onToggleSelect(photo.id);
              }}
              aria-label={photo.isSelected ? "取消选择" : "选择此图"}
            />
            {/* 其余区域点击预览 */}
            <div className="absolute inset-0 z-10" onClick={() => onSelect(photo)} />
          </>
        ) : photo.status === "pending" ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gray-50 animate-pulse">
            <div className="w-6 h-6 border-2 border-purple-300 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-gray-400">排队中</span>
          </div>
        ) : isFailed ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 px-3 bg-gray-50" onClick={() => onSelect(photo)}>
            <span className="text-xs text-red-400 text-center">{photo.errorMessage ?? "生成失败"}</span>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-50" onClick={() => onSelect(photo)}>
            <span className="text-xs text-gray-400">{statusLabelMap[photo.status]}</span>
          </div>
        )}
      </div>

      {/* 勾选框图标 */}
      <div
        className="absolute top-2 left-2 z-30 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all pointer-events-none"
        style={{
          borderColor: photo.isSelected ? "#a855f7" : "rgba(0,0,0,0.25)",
          backgroundColor: photo.isSelected ? "#a855f7" : "rgba(255,255,255,0.85)",
        }}
      >
        {photo.isSelected && (
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>

      {/* 右上角删除按钮（失败状态显示） */}
      {isFailed && (
        <button
          type="button"
          className="absolute top-2 right-2 z-30 w-6 h-6 rounded-full bg-red-500/90 hover:bg-red-600 flex items-center justify-center transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(photo.id);
          }}
          aria-label="删除失败图片"
        >
          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}

      {/* 右上角重新生成按钮 */}
      {/* {!isGenerating && photo.imageUrl && (
        <button
          type="button"
          className="absolute top-2 right-2 z-30 w-6 h-6 rounded-full bg-gray-100/80 hover:bg-purple-600/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onRegenerate(photo.id);
          }}
          aria-label="重新生成"
        >
          <svg className="w-3.5 h-3.5 text-gray-600 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      )} */}

      {/* 标签 */}
      <div className="px-2 py-1.5 flex gap-1 flex-wrap">
        <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-purple-50 text-purple-600 border border-purple-200">
          {photo.poseLabel}
        </span>
        <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-blue-50 text-blue-600 border border-blue-200">
          {photo.bgLabel}
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 灯箱组件
// ---------------------------------------------------------------------------

interface PhotoLightboxProps {
  photo: ModelPhoto;
  allPhotos: ModelPhoto[];
  onClose: () => void;
  onToggleSelect: (photoId: string) => void;
  onRegenerate: (photoId: string) => void;
  onNavigate: (photo: ModelPhoto) => void;
  disabled?: boolean;
}

const PhotoLightbox: React.FC<PhotoLightboxProps> = ({ photo, allPhotos, onClose, onToggleSelect, onRegenerate, onNavigate, disabled = false }) => {
  const isGenerating = photo.status === "generating";
  const isFailed = photo.status === "failed";

  // 计算当前图片索引
  const currentIndex = allPhotos.findIndex((p) => p.id === photo.id);
  const totalCount = allPhotos.length;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < totalCount - 1;

  // 图片加载状态
  const [imageLoading, setImageLoading] = useState(true);

  // 预加载相邻图片（提前加载上一张和下一张）
  useEffect(() => {
    const urlsToPreload: string[] = [];

    // 预加载上一张
    if (hasPrev && allPhotos[currentIndex - 1]?.imageUrl) {
      urlsToPreload.push(allPhotos[currentIndex - 1].imageUrl!);
    }

    // 预加载下一张
    if (hasNext && allPhotos[currentIndex + 1]?.imageUrl) {
      urlsToPreload.push(allPhotos[currentIndex + 1].imageUrl!);
    }

    // 预加载图片（静默加载，不阻塞 UI）
    urlsToPreload.forEach((url) => {
      const img = new Image();
      img.src = url;
    });
  }, [currentIndex, hasPrev, hasNext, allPhotos]);

  // 当前图片变化时重置加载状态
  useEffect(() => {
    setImageLoading(true);
  }, [photo.id]);

  // 导航到上一张
  const handlePrev = useCallback(() => {
    if (hasPrev) {
      onNavigate(allPhotos[currentIndex - 1]);
    }
  }, [hasPrev, currentIndex, allPhotos, onNavigate]);

  // 导航到下一张
  const handleNext = useCallback(() => {
    if (hasNext) {
      onNavigate(allPhotos[currentIndex + 1]);
    }
  }, [hasNext, currentIndex, allPhotos, onNavigate]);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") handlePrev();
      else if (e.key === "ArrowRight") handleNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, handlePrev, handleNext]);

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-4xl max-h-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        {/* 关闭按钮 */}
        <button
          type="button"
          className="absolute -top-10 right-0 text-white/70 hover:text-white text-2xl"
          onClick={onClose}
          aria-label="关闭灯箱"
        >
          &times;
        </button>

        {/* 左右切换按钮 */}
        {totalCount > 1 && (
          <>
            <button
              type="button"
              className={`absolute left-0 top-1/2 -translate-y-1/2 -translate-x-12 w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                hasPrev
                  ? "bg-white/20 hover:bg-white/30 text-white cursor-pointer"
                  : "bg-white/10 text-white/30 cursor-not-allowed"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              disabled={!hasPrev}
              aria-label="上一张"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                hasNext
                  ? "bg-white/20 hover:bg-white/30 text-white cursor-pointer"
                  : "bg-white/10 text-white/30 cursor-not-allowed"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              disabled={!hasNext}
              aria-label="下一张"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}

        {/* 大图 */}
        {photo.imageUrl && !isGenerating ? (
          <div className="relative max-h-[75vh] max-w-full">
            {/* 骨架 + 加载指示器 */}
            {imageLoading && (
              <div className="w-[512px] max-w-full aspect-square rounded-lg bg-gray-100 animate-pulse flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-3 border-purple-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-gray-400">加载中...</span>
                </div>
              </div>
            )}
            <img
              src={photo.imageUrl}
              alt={`${photo.poseLabel}-${photo.bgLabel}`}
              className={`max-h-[75vh] max-w-full object-contain rounded-lg bg-white ${imageLoading ? 'hidden' : ''}`}
              loading="eager"
              onLoad={() => setImageLoading(false)}
            />
          </div>
        ) : isGenerating ? (
          <div className="w-64 h-64 flex flex-col items-center justify-center gap-3 bg-white rounded-lg">
            <div className="w-12 h-12 border-3 border-purple-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-400">生成中...</span>
          </div>
        ) : (
          <div className="w-64 h-64 flex items-center justify-center bg-white rounded-lg text-red-400 text-sm">
            {photo.errorMessage ?? "暂无图片"}
          </div>
        )}

        {/* 底部操作栏 */}
        <div className="mt-4 flex items-center gap-4">
          {/* 图片索引指示器 */}
          {totalCount > 1 && (
            <span className="px-3 py-1 text-xs rounded-full bg-white/10 text-white/80">
              {currentIndex + 1} / {totalCount}
            </span>
          )}
          <button
            type="button"
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            style={{
              backgroundColor: photo.isSelected ? "rgba(168,85,247,0.3)" : "rgba(0,0,0,0.05)",
              color: photo.isSelected ? "#a855f7" : "#4b5563",
              border: `1px solid ${photo.isSelected ? "#a855f7" : "rgba(0,0,0,0.15)"}`,
              opacity: disabled ? 0.5 : 1,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
            onClick={() => {
              if (!disabled) onToggleSelect(photo.id);
            }}
          >
            {photo.isSelected ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            ) : null}
            {photo.isSelected ? "已选中" : "选中"}
          </button>
          {/* 重新生成按钮：待 prompt 优化后恢复 */}
          {/* {!isGenerating && !isFailed && photo.imageUrl && (
            <button
              type="button"
              className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-purple-600/80 hover:text-white transition-colors flex items-center gap-2"
              onClick={() => onRegenerate(photo.id)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              重新生成
            </button>
          )} */}
          <div className="flex gap-2">
            <span className="px-2 py-1 text-xs rounded-full bg-purple-50 text-purple-600 border border-purple-200">{photo.poseLabel}</span>
            <span className="px-2 py-1 text-xs rounded-full bg-blue-50 text-blue-600 border border-blue-200">{photo.bgLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 主页面组件
// ---------------------------------------------------------------------------

export const ImageModelPhotos: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const token = useAppStore((state) => state.token);
  const { projectData, workflow, updateProjectData } = useProjectState(projectId);
  const pushTaskNotification = useAppStore((state) => state.pushTaskNotification);
  const showGlobalLoading = useAppStore((state) => state.showGlobalLoading);
  const hideGlobalLoading = useAppStore((state) => state.hideGlobalLoading);
  const globalTaskQueue = useAppStore((state) => state.globalTaskQueue);
  const toast = useToast();
  const navigate = useNavigate();

  // 从数据库读取项目状态，判断 Step3 是否锁定
  const [projectStatusFromDb, setProjectStatusFromDb] = useState<string | null>(null);
  const step3Locked = isImageStatusBeyond(projectStatusFromDb as ImageProjectStatus | undefined, "IMAGE_MODEL_PHOTOS_READY");

  useEffect(() => {
    if (!projectId || !token) return;
    realBackendApi.getProject(token, projectId)
      .then((project) => {
        if (project && typeof project.status === "string") {
          setProjectStatusFromDb(project.status);
        }
      })
      .catch(() => { /* 静默 */ });
  }, [projectId, token]);

  // ImageModelPhotos 在 image-project 目录下，必然是图片项目
  const kind: "image" | "video" = "image";

  const [photos, setPhotos] = useState<ModelPhoto[]>([]);
  const [lightboxPhoto, setLightboxPhoto] = useState<ModelPhoto | null>(null);
  const [_regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set());
  const [enteringStep4, setEnteringStep4] = useState(false);
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [showEnterStep4Confirm, setShowEnterStep4Confirm] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string; label: string } | null>(null);
  const [photoCount, setPhotoCount] = useState(10);
  const [backgroundStyle, setBackgroundStyle] = useState<"solid" | "scene" | "balanced">("balanced");

  // 多色变体相关状态
  const [selectedVariantAssetIds, setSelectedVariantAssetIds] = useState<string[]>([]);
  const [multiColorShowcase, setMultiColorShowcase] = useState(false);
  /** 拍摄模式：单人/多人 */
  const [imageRelationMode, setImageRelationMode] = useState<"single" | "multi">("single");

  // 从后端加载已保存的关系模式（仅初始化时加载一次）
  const relationModeLoadedRef = useRef(false);
  useEffect(() => {
    if (!token || !projectId || relationModeLoadedRef.current) return;
    relationModeLoadedRef.current = true;
    realBackendApi.imageGetRelationMode(token, projectId)
      .then((res) => {
        if (res.relationMode) setImageRelationMode(res.relationMode as typeof imageRelationMode);
      })
      .catch(() => { /* 首次无数据，保持默认 single */ });
  }, [token, projectId]);

  /** 保存关系模式到后端（返回 Promise 以便等待完成） */
  const relationModeSavePromise = useRef<Promise<void> | null>(null);
  const handleSetRelationMode = useCallback(async (mode: typeof imageRelationMode) => {
    const prev = imageRelationMode;
    setImageRelationMode(mode);
    if (!token || !projectId) return;
    const p = realBackendApi.imageSetRelationMode(token, projectId, mode)
      .catch(() => {
        setImageRelationMode(prev);
      });
    relationModeSavePromise.current = p.then(() => {});
  }, [token, projectId, imageRelationMode]);

  /** 加载变体资产数据（从 Step1 模块关联资产中检测同款不同色） */
  const [variantOptions, setVariantOptions] = useState<Array<{ assetId: string; color: string | null; name: string; imageUrl: string; isPrimary: boolean }>>([]);
  useEffect(() => {
    if (!token) return;
    const modules = workflow.imageGarmentModules as Array<{ mainImage?: { libraryAssetId?: string } }> | undefined;
    if (!modules) return;
    const assetIds = modules.map(m => m.mainImage?.libraryAssetId).filter((id): id is string => Boolean(id));
    if (assetIds.length === 0) return;
    let cancelled = false;
    // 并行获取所有资产详情
    Promise.all(
      assetIds.map(id => realBackendApi.getGarmentAsset(token, id).catch(() => null))
    ).then(results => {
      if (cancelled) return;
      // 找出有变体组的资产
      const variantAssets = results.filter((a): a is NonNullable<typeof a> =>
        a !== null && a.variantGroupId !== null && a.variantGroupId !== undefined
      );
      if (variantAssets.length === 0) return;
      const options: typeof variantOptions = [];
      for (const ga of variantAssets) {
        options.push({
          assetId: ga.id,
          color: ga.variantColor ?? ga.mainColor ?? null,
          name: ga.name,
          imageUrl: ga.mainImageUrl,
          isPrimary: ga.isPrimaryVariant,
        });
      }
      // 按主色优先排序
      options.sort((a, b) => (a.isPrimary === b.isPrimary ? 0 : a.isPrimary ? -1 : 1));
      setVariantOptions(options);
    });
    return () => { cancelled = true; };
  }, [token, workflow.imageGarmentModules]);

  const PHOTO_COUNT_OPTIONS = [2, 4, 6, 8, 10, 12] as const;
  const BACKGROUND_STYLE_OPTIONS = [
    { value: "solid", label: "纯色背景", desc: "专业棚拍主图" },
    { value: "scene", label: "场景背景", desc: "生活化场景图" },
    { value: "balanced", label: "混合搭配", desc: "主图+场景图" },
  ] as const;

  // ========== Logo 状态 ==========
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoLoading, setLogoLoading] = useState(false);

  // 加载 Logo 配置
  useEffect(() => {
    if (!token || !projectId) return;
    realBackendApi.imageStep3GetLogo(token, projectId)
      .then((res) => setLogoUrl(res.logoUrl))
      .catch(() => setLogoUrl(null));
  }, [token, projectId]);

  // Logo 上传处理
  const handleLogoUpload = useCallback(async (file: File) => {
    if (!token || !projectId) return;
    setLogoLoading(true);
    try {
      // 直接调用 Logo 上传端点（后端处理 OSS 上传 + 保存 URL）
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch(`/neirongmiao/api/image-projects/${projectId}/logo/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!uploadRes.ok) {
        // 解析后端错误响应
        const errorData = await uploadRes.json() as { code?: string; message?: string };
        const errorCode = errorData?.code ?? "";

        // 根据错误码提供友好提示
        let friendlyMessage: string;
        switch (errorCode) {
          case "INVALID_FILE_TYPE":
            friendlyMessage = "请上传 PNG 或 WebP 格式的 Logo，这两种格式支持透明背景，展示效果更好 ✨";
            break;
          case "FILE_TOO_LARGE":
            friendlyMessage = "Logo 图片有点大哦，请压缩到 2MB 以内再上传。推荐使用在线压缩工具减小文件大小";
            break;
          case "LOGO_NOT_TRANSPARENT":
            friendlyMessage = "请上传带透明背景的 Logo 图片，这样叠加在模特图上会更自然美观。当前图片没有透明通道，可能显示不理想";
            break;
          default:
            friendlyMessage = errorData?.message ?? "Logo 上传失败，请稍后重试或检查网络连接";
        }

        toast.error(friendlyMessage, 5000);
        return;
      }

      const data = await uploadRes.json() as { logoUrl: string };
      setLogoUrl(data.logoUrl);
      toast.success("Logo 上传成功！", 2000);
    } catch (err) {
      console.error("Logo 上传失败:", err);
      toast.error(err instanceof Error ? err.message : "Logo 上传失败，请检查网络连接后重试", 5000);
    } finally {
      setLogoLoading(false);
    }
  }, [token, projectId, toast]);

  // Logo 删除处理
  const handleLogoDelete = useCallback(async () => {
    if (!token || !projectId) return;
    setLogoLoading(true);
    try {
      await realBackendApi.imageStep3DeleteLogo(token, projectId);
      setLogoUrl(null);
      toast.success("Logo 已删除", 2000);
    } catch (err) {
      console.error("Logo 删除失败:", err);
      toast.error("Logo 删除失败，请稍后重试", 3000);
    } finally {
      setLogoLoading(false);
    }
  }, [token, projectId, toast]);

  // ========== 从全局任务队列判断生成状态 ==========
  const activeStep3Job = globalTaskQueue.find(
    (t) => (t.type === GlobalTaskType.IMAGE_STEP3_MODEL_PHOTO || t.type === GlobalTaskType.IMAGE_STEP3_MULTI_PERSON)
      && t.projectId === projectId && (t.status === TaskStatus.PENDING || t.status === TaskStatus.RUNNING),
  );
  const failedStep3Job = globalTaskQueue.find(
    (t) => (t.type === GlobalTaskType.IMAGE_STEP3_MODEL_PHOTO || t.type === GlobalTaskType.IMAGE_STEP3_MULTI_PERSON)
      && t.projectId === projectId && t.status === TaskStatus.FAILED,
  );
  const isGenerating = Boolean(activeStep3Job);
  const isJobFailed = Boolean(failedStep3Job);
  const failedErrorMessage = (failedStep3Job?.error?.message ?? "生成失败")
    .replace(/image_step3_single_photo:\s*/g, "")
    .replace(/;+\s*/g, "；");
  const currentStage = activeStep3Job?.stage ?? "";
  const generatingProgress = useMemo(() => {
    if (!activeStep3Job?.result) return { current: 0, total: 0 };
    const result = activeStep3Job.result as Record<string, unknown>;
    return {
      current: (result.completedChildCount as number) ?? 0,
      total: (result.totalChildCount as number) ?? 0,
    };
  }, [activeStep3Job?.id, activeStep3Job?.status, activeStep3Job?.result]);

  // 查找规划子任务（照片在规划子任务中创建）
  const planJob = globalTaskQueue.find(
    (t) => (t.type === GlobalTaskType.IMAGE_STEP3_MODEL_PLAN || t.type === GlobalTaskType.IMAGE_STEP3_MULTI_PERSON_PLAN)
      && t.projectId === projectId && (t.status === TaskStatus.PENDING || t.status === TaskStatus.RUNNING),
  );
  const planJobStage = planJob?.stage ?? "";

  const stageLabel = planJobStage === "规划中" || planJobStage === "多人规划中" ? "AI 规划中"
    : planJobStage === "创建照片占位" || planJobStage === "创建多人照片占位" ? "创建照片"
    : planJobStage === "创建生成任务" || planJobStage === "创建多人生成任务" ? "准备生成"
    : currentStage === "等待多人规划完成" ? "AI 规划多人方案"
    : currentStage === "等待子任务完成" && generatingProgress.current > 0 ? "生成图片"
    : "准备中";

  // ========== GlobalTimer 集成 ==========
  const prevImageStep3LoadingCountRef = useRef(0);
  // 追踪已处理的完成任务 ID，防止重复刷新
  const handledCompletedJobIdsRef = useRef<Set<string>>(new Set());
  // 追踪上一次刷新时的已完成/失败数量，用于增量刷新
  const prevCompletedCountRef = useRef(0);
  const prevFailedCountRef = useRef(0);
  // 追踪上一次的 stage，用于检测阶段变化
  const prevStageRef = useRef<string>("");

  // 找到当前项目的已完成任务 ID（供两个 useEffect 共享判断）
  const completedStep3Job = globalTaskQueue.find(
    (t) => (t.type === GlobalTaskType.IMAGE_STEP3_MODEL_PHOTO || t.type === GlobalTaskType.IMAGE_STEP3_MULTI_PERSON)
      && t.projectId === projectId && t.status === TaskStatus.COMPLETED,
  );
  const completedStep3JobId = completedStep3Job?.id ?? null;

  // 当规划子任务的 stage 变成 "创建照片占位" 或之后时，刷新照片列表（照片刚创建）
  useEffect(() => {
    if (!isGenerating || !token || !projectId) return;
    // 规划子任务 stage 从空/"规划中" 变成其他阶段时，说明规划完成，照片已创建
    if (planJobStage !== prevStageRef.current && planJobStage !== "" && planJobStage !== "规划中") {
      prevStageRef.current = planJobStage;
      void realBackendApi.imageStep3ListPhotos(token, projectId).then((r) => setPhotos(r.photos));
    }
  }, [isGenerating, planJobStage, token, projectId]);

  useEffect(() => {
    if (isGenerating && prevImageStep3LoadingCountRef.current === 0) {
      showGlobalLoading();
      prevCompletedCountRef.current = 0;
      prevFailedCountRef.current = 0;
    } else if (!isGenerating && prevImageStep3LoadingCountRef.current > 0) {
      hideGlobalLoading();
      // 任务结束时刷新模特图列表和项目状态
      if (token && projectId) {
        if (completedStep3JobId) {
          handledCompletedJobIdsRef.current.add(completedStep3JobId);
        }
        void realBackendApi.imageStep3ListPhotos(token, projectId).then((r) => setPhotos(r.photos));
        void realBackendApi.getProject(token, projectId).then((project) => {
          if (project && typeof project.status === "string") {
            setProjectStatusFromDb(project.status);
          }
        });
      }
    }
    prevImageStep3LoadingCountRef.current = isGenerating ? 1 : 0;
  }, [isGenerating, showGlobalLoading, hideGlobalLoading, token, projectId, completedStep3JobId]);

  // 生成过程中：每当 completedCount 或 failedCount 增加时刷新照片列表
  useEffect(() => {
    if (!isGenerating || !token || !projectId) return;
    const currentCompleted = generatingProgress.current;
    const currentFailed = (activeStep3Job?.result as Record<string, unknown> | undefined)?.failedChildCount as number ?? 0;
    if (currentCompleted > prevCompletedCountRef.current || currentFailed > prevFailedCountRef.current) {
      prevCompletedCountRef.current = currentCompleted;
      prevFailedCountRef.current = currentFailed;
      void realBackendApi.imageStep3ListPhotos(token, projectId).then((r) => setPhotos(r.photos));
    }
  }, [isGenerating, generatingProgress.current, activeStep3Job?.result, token, projectId]);

  // 兜底：检测 globalTaskQueue 中新完成的 Step3 任务（处理任务在首次轮询前就完成的情况）
  useEffect(() => {
    if (completedStep3JobId && !handledCompletedJobIdsRef.current.has(completedStep3JobId)) {
      handledCompletedJobIdsRef.current.add(completedStep3JobId);
      if (token && projectId) {
        void realBackendApi.imageStep3ListPhotos(token, projectId).then((r) => setPhotos(r.photos));
      }
    }
  }, [completedStep3JobId, token, projectId]);

  // 加载已有模特图
  const loadPhotos = useCallback(async () => {
    if (!token || !projectId) return;
    try {
      const result = await realBackendApi.imageStep3ListPhotos(token, projectId);
      setPhotos(result.photos);
    } catch {
      // 静默处理
    }
  }, [token, projectId]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  // 从选中的搭配方案推导搭配摘要
  const outfitSummary = useMemo(() => {
    const outfitPlans = workflow.imageOutfitPlans as Array<{ id?: string; title?: string; reason?: string }> | undefined;
    if (!outfitPlans || !workflow.imageSelectedOutfitId) return undefined;
    const selected = outfitPlans.find((p) => p.id === workflow.imageSelectedOutfitId);
    return selected ? (selected.reason ?? selected.title) : undefined;
  }, [workflow.imageOutfitPlans, workflow.imageSelectedOutfitId]);

  // 一键生成（触发后端异步任务，进度由 globalTaskQueue 追踪）
  const handleGenerate = useCallback(async () => {
    if (!token || !projectId || isGenerating) return;
    // 等待模式保存完成，防止竞态
    if (relationModeSavePromise.current) {
      await relationModeSavePromise.current;
    }
    try {
      const result = await realBackendApi.imageStep3GenerateBatch(token, projectId, {
        outfitSummary: outfitSummary,
        characterDescription: workflow.imageSelectedCharacterId ? "根据定妆模型生成" : undefined,
        photoCount,
        backgroundStyle,
        colorVariantAssetIds: selectedVariantAssetIds.length > 0 ? selectedVariantAssetIds : undefined,
        multiColorShowcase: selectedVariantAssetIds.length > 0 ? multiColorShowcase : undefined,
      });
      // 任务已创建，后续进度由 globalTaskQueue 轮询追踪
      pushTaskNotification({
        category: "clip",
        title: "开始生成",
        detail: `已提交模特图生成任务，正在规划中...`,
        targetPath: `/image-create/${projectId}/step3`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "生成失败";
      pushTaskNotification({
        category: "clip",
        title: "生成失败",
        detail: message,
        targetPath: `/image-create/${projectId}/step3`,
      });
    }
  }, [token, projectId, isGenerating, outfitSummary, workflow.imageSelectedCharacterId, pushTaskNotification, photoCount, backgroundStyle, selectedVariantAssetIds, multiColorShowcase]);

  // 确认生成弹窗处理
  const handleConfirmGenerate = useCallback(() => {
    setShowGenerateConfirm(false);
    void handleGenerate();
  }, [handleGenerate]);

  // 切换选中（最多选 10 张）— 锁定状态下禁止操作
  const handleToggleSelect = useCallback(async (photoId: string) => {
    if (step3Locked) return;
    if (!token || !projectId) return;
    const photo = photos.find((p) => p.id === photoId);
    if (!photo) return;
    const newIsSelected = !photo.isSelected;
    if (newIsSelected && photos.filter((p) => p.isSelected).length >= 10) return;
    setPhotos((prev) => prev.map((p) => p.id === photoId ? { ...p, isSelected: newIsSelected } : p));
    try {
      await realBackendApi.imageStep3Select(token, projectId, photoId, { isSelected: newIsSelected });
    } catch {
      // 回滚
      setPhotos((prev) => prev.map((p) => p.id === photoId ? { ...p, isSelected: photo.isSelected } : p));
    }
  }, [token, projectId, photos]);

  // 重新生成
  const handleRegenerate = useCallback(async (photoId: string) => {
    if (!token || !projectId) return;
    setRegeneratingIds((prev) => new Set(prev).add(photoId));
    setPhotos((prev) => prev.map((p) => p.id === photoId ? { ...p, status: "generating" as ModelPhotoStatus, errorMessage: null } : p));
    try {
      const result = await realBackendApi.imageStep3Regenerate(token, projectId, photoId);
      setPhotos((prev) => prev.map((p) => p.id === photoId ? result.photo : p));
    } catch {
      setPhotos((prev) => prev.map((p) => p.id === photoId ? { ...p, status: "failed" as ModelPhotoStatus, errorMessage: "重新生成失败" } : p));
    } finally {
      setRegeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(photoId);
        return next;
      });
    }
  }, [token, projectId]);

  // 删除模特图
  const handleDelete = useCallback(async (photoId: string) => {
    if (!token || !projectId) return;
    try {
      await realBackendApi.imageStep3DeletePhoto(token, projectId, photoId);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      toast.success("已删除失败图片", 2000);
    } catch {
      toast.error("删除失败，请稍后重试", 3000);
    }
  }, [token, projectId, toast]);

  // 灯箱更新（从 photos 同步最新状态）
  useEffect(() => {
    if (lightboxPhoto) {
      const updated = photos.find((p) => p.id === lightboxPhoto.id);
      if (updated) {
        setLightboxPhoto(updated);
      } else {
        // 图片已被删除（自动或手动），关闭灯箱
        setLightboxPhoto(null);
      }
    }
  }, [photos, lightboxPhoto]);

  // 批量下载已选中图片
  const handleBatchDownload = useCallback(async () => {
    const selectedPhotos = photos.filter((p) => p.isSelected && p.status === "success" && p.imageUrl);
    if (selectedPhotos.length === 0) return;

    showGlobalLoading();
    try {
      for (let i = 0; i < selectedPhotos.length; i++) {
        const photo = selectedPhotos[i];
        try {
          const response = await fetch(photo.imageUrl!);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `模特图-${photo.poseLabel}-${photo.bgLabel}-${i + 1}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          // 避免请求过快被封
          if (i < selectedPhotos.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        } catch {
          pushTaskNotification({
            category: "clip",
            title: "下载失败",
            detail: `${photo.poseLabel} 下载失败`,
            targetPath: `/image-create/${projectId}/step3`,
          });
        }
      }
      pushTaskNotification({
        category: "clip",
        title: "下载完成",
        detail: `共下载 ${selectedPhotos.length} 张图片`,
        targetPath: `/image-create/${projectId}/step3`,
      });
    } catch {
      pushTaskNotification({
        category: "clip",
        title: "下载失败",
        detail: "部分图片下载失败，请重试",
        targetPath: `/image-create/${projectId}/step3`,
      });
    } finally {
      hideGlobalLoading();
    }
  }, [photos, projectId, showGlobalLoading, hideGlobalLoading, pushTaskNotification]);

  // 进入下一步（Step4 电商详情页）
  const handleEnterStep4 = async () => {
    if (!projectId || !token) return;
    setEnteringStep4(true);
    try {
      updateProjectData({ projectStatus: "IMAGE_MODEL_PHOTOS_READY" });
      // 持久化到后端
      await realBackendApi.updateProjectStatus(token, projectId, "IMAGE_MODEL_PHOTOS_READY");
      navigate(resolveStep3FooterTargetRoute(kind, projectId));
    } catch (err) {
      console.error("Failed to enter step 4:", err);
    } finally {
      setEnteringStep4(false);
    }
  };

  const selectedCount = photos.filter((p) => p.isSelected).length;
  const totalCount = photos.length;
  const generatedCount = photos.filter((p) => p.status === "success").length;
  const hasSelectablePhotos = photos.some((p) => p.status === "success");
  const canEnterStep4 = hasSelectablePhotos && selectedCount > 0;

  return (
    <>
      {/* 左侧栏：Step1 历史记录 */}
      <ImageProjectFlowHistorySidebar
        currentStep={3}
        projectId={projectId}
        onImagePreview={(imageUrl, label) => setPreviewImage({ url: imageUrl, label })}
      />

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#fdfbf7]">
        <StepContentHeader
          stepNumber={3}
          title="模特图生成"
          icon="photo_library"
          subtitle={`AI 自动创作 ${photoCount} 张专业模特图，可选择进入电商详情页。`}
          badges={step3Locked ? <span className="inline-flex items-center gap-1 text-amber-600"><span className="material-icons-round text-sm">lock</span>已锁定</span> : undefined}
        />

        <div className={`flex-1 min-h-0 overflow-y-auto ${FLOW_SAFE_BOTTOM_PADDING.standard}`}>
          <div className="max-w-6xl mx-auto px-4 py-6">
            {/* 顶部栏 */}
            <div className="mb-6">
              {/* 第一行：状态文字 */}
              <div className="mb-3">
                <p className="text-sm text-gray-500">
                  {totalCount > 0
                    ? `已生成 ${totalCount} 张，成功 ${generatedCount} 张，已选 ${selectedCount}/10 张`
                    : `点击一键生成，AI 将自动创作 ${photoCount} 张专业模特图`}
                </p>
              </div>
              {/* 第二行：选项区 */}
              <div className="flex items-center gap-4 flex-wrap justify-end">
                {/* 生成数量选择（未锁定时显示） */}
                {!step3Locked && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">数量</span>
                    {PHOTO_COUNT_OPTIONS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={isGenerating}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          photoCount === n
                            ? "bg-primary text-white"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        } ${isGenerating ? "opacity-50 cursor-not-allowed" : ""}`}
                        onClick={() => setPhotoCount(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
                {/* 背景风格选择（未锁定时显示） */}
                {!step3Locked && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">背景</span>
                    {BACKGROUND_STYLE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={isGenerating}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          backgroundStyle === opt.value
                            ? "bg-primary text-white"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        } ${isGenerating ? "opacity-50 cursor-not-allowed" : ""}`}
                        onClick={() => setBackgroundStyle(opt.value)}
                        title={opt.desc}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
                {/* 拍摄模式选择：单人/多人（具体关系模式由 AI 智能判断） */}
                {!step3Locked && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">拍摄模式</span>
                    {([
                      { value: "single" as const, label: "单人" },
                      { value: "multi" as const, label: "多人" },
                    ]).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={isGenerating}
                        onClick={() => {
                          handleSetRelationMode(opt.value);
                        }}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          imageRelationMode === opt.value
                            ? "bg-primary text-white"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        } ${isGenerating ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
                {/* 批量下载按钮（锁定状态下也允许下载） */}
                {selectedCount > 0 && (
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded bg-gray-100 text-gray-700 font-medium text-xs hover:bg-gray-200 transition-colors flex items-center gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleBatchDownload();
                    }}
                    title={`下载已选中的 ${selectedCount} 张图片`}
                  >
                    <span className="material-icons-round text-sm">download</span>
                    下载 {selectedCount} 张
                  </button>
                )}
                {/* 一键生成按钮（未锁定时显示） */}
                {!step3Locked && (
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded bg-primary text-white font-medium text-xs hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                    onClick={() => setShowGenerateConfirm(true)}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <span className="material-icons-round animate-spin text-sm">autorenew</span>
                        {generatingProgress.total > 0
                          ? `${generatingProgress.current}/${generatingProgress.total}`
                          : "生成中"}
                      </>
                    ) : (
                      <>
                        <span className="material-icons-round text-sm">auto_awesome</span>
                        一键生成
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

        {/* Logo 上传区域 */}
        {!step3Locked && (
          <div className="mb-6 p-4 rounded-lg bg-gray-50 border border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="material-icons-round text-gray-400">add_business</span>
                <div>
                  <p className="text-sm font-medium text-gray-700">品牌 Logo</p>
                  <p className="text-xs text-gray-500">请上传透明背景的 PNG 或 WebP 图片</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {logoUrl && (
                  <div className="flex items-center gap-2">
                    <img
                      src={logoUrl}
                      alt="Logo"
                      className="h-10 max-w-[100px] object-contain rounded border border-gray-200"
                    />
                    <button
                      type="button"
                      className={`px-2 py-1 text-xs text-red-500 hover:text-red-600 ${isGenerating ? "opacity-50 cursor-not-allowed" : ""}`}
                      onClick={() => void handleLogoDelete()}
                      disabled={logoLoading || isGenerating}
                    >
                      删除
                    </button>
                  </div>
                )}
                <label className={`px-3 py-1.5 rounded bg-white border border-gray-300 text-sm text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors ${isGenerating ? "opacity-50 pointer-events-none" : ""}`}>
                  {logoLoading ? "上传中..." : logoUrl ? "更换" : "上传 Logo"}
                  <input
                    type="file"
                    accept="image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleLogoUpload(file);
                      e.target.value = "";
                    }}
                    disabled={logoLoading || isGenerating}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* 生成中进度提示横幅 */}
        {isGenerating && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-orange-50 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <span className="material-icons-round text-primary animate-spin text-xl">autorenew</span>
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-gray-900">{stageLabel}</span>
                  {generatingProgress.total > 0 && (
                    <span className="text-sm text-gray-500">
                      {generatingProgress.current} / {generatingProgress.total}
                    </span>
                  )}
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500 ease-out animate-pulse"
                    style={{ width: `${generatingProgress.total > 0 ? (generatingProgress.current / generatingProgress.total) * 100 : 30}%` }}
                  />
                </div>
                {generatingProgress.total > 0 && (
                  <p className="text-xs text-gray-400 mt-1.5">后台正在生成，您可以先浏览已有图片</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 空状态（既不生成中也不失败） */}
        {photos.length === 0 && !isGenerating && !isJobFailed && (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm">暂无模特图，点击上方按钮开始生成</p>
          </div>
        )}

        {/* 骨架屏（生成中且无图片时） */}
        {photos.length === 0 && isGenerating && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: photoCount }).map((_, i) => (
              <div key={i} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <div className="aspect-[4/3] bg-gray-100 animate-pulse flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-purple-300 border-t-transparent rounded-full animate-spin" />
                </div>
                <div className="px-2 py-1.5 flex gap-1">
                  <div className="h-5 w-16 rounded-full bg-gray-100 animate-pulse" />
                  <div className="h-5 w-14 rounded-full bg-gray-100 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 失败提示（任务失败且无成功图片时） */}
        {photos.length === 0 && isJobFailed && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-sm text-red-500 mb-1">模特图生成失败</p>
            <p className="text-xs text-gray-400 max-w-xs">{failedErrorMessage}</p>
          </div>
        )}

        {/* 网格 */}
        {photos.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {photos.map((photo) => (
              <ModelPhotoCard
                key={photo.id}
                photo={photo}
                onSelect={setLightboxPhoto}
                onToggleSelect={handleToggleSelect}
                onRegenerate={handleRegenerate}
                onDelete={handleDelete}
                disabled={step3Locked}
              />
            ))}
          </div>
        )}
          </div>
        </div>
      </div>

      {/* 灯箱 */}
      {lightboxPhoto && (
        <PhotoLightbox
          photo={lightboxPhoto}
          allPhotos={photos}
          onClose={() => setLightboxPhoto(null)}
          onToggleSelect={handleToggleSelect}
          onRegenerate={handleRegenerate}
          onNavigate={setLightboxPhoto}
          disabled={step3Locked}
        />
      )}

      {/* 底部工具条 */}
      <div className="fixed bottom-6 inset-x-0 flex items-center justify-center z-50 pointer-events-none">
        <div className="bg-white border border-gray-200 rounded-full px-2 py-2 shadow-xl shadow-gray-200/50 pointer-events-auto flex items-center gap-4 max-w-[90%] md:max-w-none transform transition-all hover:scale-[1.01] active:scale-[0.99]">
          <Button variant="ghost" onClick={() => { navigate(resolveStep3FooterPreviousRoute(kind, projectId)); }} className="rounded-full px-4 text-gray-500 hover:text-gray-900 whitespace-nowrap">
            <span className="material-icons-round text-lg mr-1">arrow_back</span>
            <span className="hidden md:inline">上一步</span>
          </Button>

          <div className="h-4 w-px bg-gray-200" />

          <div className="text-[10px] text-gray-400 font-medium px-2 whitespace-nowrap flex items-center gap-1">
            {step3Locked ? "已完成" : resolveStep3FooterFeedback(kind)}
          </div>

          <div className="h-4 w-px bg-gray-200" />

          <div className="pr-1">
            {step3Locked ? (
              /* 锁定模式：直接跳转下一步 */
              <Button
                onClick={() => navigate(resolveStep3FooterTargetRoute(kind, projectId))}
                className="rounded-full px-6 bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/20 whitespace-nowrap"
              >
                <span className="material-icons-round text-sm mr-1">lock</span>
                <span className="hidden md:inline">下一步</span>
                <span className="md:hidden">下一步</span>
                <span className="material-icons-round text-lg ml-1">arrow_forward</span>
              </Button>
            ) : photos.length === 0 ? (
              <Button
                onClick={() => setShowGenerateConfirm(true)}
                disabled={isGenerating}
                className="rounded-full px-6 bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/20 whitespace-nowrap disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none transition-transform animate-pulse-scale"
              >
                {isGenerating ? (
                  <>
                    <span className="material-icons-round animate-spin text-lg">autorenew</span>
                    {generatingProgress.total > 0
                      ? `${generatingProgress.current}/${generatingProgress.total}`
                      : "生成中"}
                  </>
                ) : (
                  <>
                    <span className="material-icons-round text-lg">auto_awesome</span>
                    <span className="hidden md:inline">一键生成</span>
                    <span className="md:hidden">一键生成</span>
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={() => setShowEnterStep4Confirm(true)}
                disabled={enteringStep4 || !canEnterStep4}
                className="rounded-full px-6 bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/20 whitespace-nowrap disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none transition-transform animate-pulse-scale"
                title={!canEnterStep4 && hasSelectablePhotos ? "请至少选中一张图片" : !canEnterStep4 ? "请先生成模特图" : undefined}
              >
                <span className="hidden md:inline">进入电商详情页</span>
                <span className="md:hidden">下一步</span>
                <span className="material-icons-round text-lg ml-1">arrow_forward</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 一键生成确认框 */}
      {showGenerateConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowGenerateConfirm(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="material-icons-round text-3xl text-primary">auto_awesome</span>
                <h3 className="text-lg font-semibold text-gray-800">一键生成模特图</h3>
              </div>
              <p className="text-sm text-gray-500">
                AI 将自动创作 {photoCount} 张专业模特图，生成过程可能需要几分钟，确认开始？
              </p>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button
                onClick={() => setShowGenerateConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmGenerate}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white font-medium text-sm hover:bg-primary-hover transition-colors flex items-center justify-center gap-1.5"
              >
                <span className="material-icons-round text-base">check</span>
                确认生成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 进入电商详情页确认框 */}
      {showEnterStep4Confirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowEnterStep4Confirm(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="material-icons-round text-3xl text-primary">shopping_bag</span>
                <h3 className="text-lg font-semibold text-gray-800">进入电商详情页</h3>
              </div>
              <p className="text-sm text-gray-500">
                将使用已选中的 {selectedCount} 张模特图生成电商详情页，确认继续？
              </p>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button
                onClick={() => setShowEnterStep4Confirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => { setShowEnterStep4Confirm(false); void handleEnterStep4(); }}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white font-medium text-sm hover:bg-primary-hover transition-colors flex items-center justify-center gap-1.5"
              >
                <span className="material-icons-round text-base">check</span>
                确认进入
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 图片预览灯箱 */}
      {previewImage && (
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
      )}
    </>
  );
};
