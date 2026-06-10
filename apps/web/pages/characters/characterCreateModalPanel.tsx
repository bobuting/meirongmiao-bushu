// apps/web/pages/characters/characterCreateModalPanel.tsx
/**
 * 角色创建弹窗 — 参考 AssetModal 的 UI 模式
 * 三步流程：人像分析 → 创建角色 → 生成五视图（弹窗内完成）
 */

import React, { useEffect, useRef, useState } from "react";
import { BlurFillImage } from "../../components/shared/BlurFillImage";
import { Button } from "../../components/ui/Button";
import type { Character } from "../../types";
import { backendApi } from "../../services/backendApi";
import { useAppStore } from "../../store/useAppStore";
import { useShallow } from 'zustand/react/shallow';
import { uploadFileToOss } from "../../services/ossUpload";

// 提示词模板代码

// ============================================================================
// 类型定义
// ============================================================================

/** 上传阶段状态机 */
type UploadPhase = "idle" | "uploading" | "analyzing" | "saving" | "failed";
/** 五视图预览阶段 */
type FiveViewPreviewPhase = "idle" | "generating" | "success" | "failed";

/** 人像分析结果 */
interface PortraitAnalysis {
  ethnicity?: string | null;
  age?: number | null;
  gender?: "male" | "female" | null;
  style?: string;
  bodyType?: string;
  faceShape?: string;
  facialFeatures?: string;
  eyebrows?: string;
  eyes?: string;
  eyeExpression?: string;
  nose?: string;
  lips?: string;
  chin?: string;
  skinTone?: string;
  hairStyle?: string;
  uniqueFeatures?: string;
}

/** 五视图生成模式 */
type FiveViewMode = "real-portrait" | "outfit" | "outfit-portrait";

interface CreateCharacterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (character: Character, skipGeneration?: boolean) => void;
  suggestedTags: string[];
  /** 跳过弹窗内五视图生成（由调用方自行处理） */
  skipFiveViewGeneration?: boolean;
  /** 五视图生成模式：真人五视图 vs 项目服饰搭配 */
  fiveViewMode?: FiveViewMode;
  /** 项目 ID（fiveViewMode="outfit" 时需要） */
  projectId?: string;
}

// ============================================================================
// 常量
// ============================================================================

/** 性别标签映射 */
const GENDER_LABELS: Record<string, string> = {
  male: "男性",
  female: "女性",
};

/** AI 分析属性显示配置（短文本字段，适合药丸标签） */
const ANALYSIS_PILL_FIELDS: { key: keyof PortraitAnalysis; label: string }[] = [
  { key: "gender", label: "性别" },
  { key: "age", label: "年龄" },
  { key: "style", label: "风格" },
  { key: "ethnicity", label: "人种" },
  { key: "skinTone", label: "肤色" },
  { key: "hairStyle", label: "发型" },
  { key: "bodyType", label: "体型" },
  { key: "faceShape", label: "脸型" },
];

// ============================================================================
// 组件
// ============================================================================

export const CreateCharacterModal: React.FC<CreateCharacterModalProps> = ({
  isOpen,
  onClose,
  onSave,
  suggestedTags,
  skipFiveViewGeneration: _skipFiveViewGeneration = false,
  fiveViewMode = "real-portrait",
  projectId,
}) => {
  const { token } = useAppStore(useShallow((state) => ({ token: state.token })));

  // --- 上传阶段状态机 ---
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);

  // --- 文件与图片 ---
  const [_rawFile, setRawFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  /** 用户上传照片后上传到 OSS 的 URL（用于人像分析和五视图生成，避免重复上传） */
  const [uploadedOssUrl, setUploadedOssUrl] = useState<string | null>(null);

  // --- 表单 ---
  const [name, setName] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState("");

  // --- 人像分析结果 ---
  const [portraitAnalysis, setPortraitAnalysis] = useState<PortraitAnalysis | null>(null);

  // --- 五视图预览状态 ---
  const [fiveViewPreviewPhase, setFiveViewPreviewPhase] = useState<FiveViewPreviewPhase>("idle");
  const [fiveViewImageUrl, setFiveViewImageUrl] = useState<string | null>(null);
  const [fiveViewError, setFiveViewError] = useState<string | null>(null);
  /** 五视图生成进度（0-95%，完成后置 100%） */
  const [fiveViewProgress, setFiveViewProgress] = useState(0);

  // --- 灯箱 ---
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // --- Refs ---
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const generatedObjectUrlsRef = useRef<string[]>([]);

  // --- 计算标志 ---
  const isUploading = uploadPhase !== "idle" && uploadPhase !== "failed";
  /** 五视图预览中 */
  const isGeneratingFiveView = fiveViewPreviewPhase === "generating";

  // ============================================================================
  // Object URL 生命周期管理
  // ============================================================================

  const registerObjectUrl = (file: File): string => {
    const objectUrl = URL.createObjectURL(file);
    generatedObjectUrlsRef.current.push(objectUrl);
    return objectUrl;
  };

  const clearObjectUrls = () => {
    for (const url of generatedObjectUrlsRef.current) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
    generatedObjectUrlsRef.current = [];
  };

  // ============================================================================
  // 生命周期：打开/关闭重置 + 卸载清理
  // ============================================================================

  useEffect(() => {
    if (!isOpen) {
      setLightboxUrl(null);
      // 延迟释放 ObjectURL（等待关闭动画）
      const urlsToRevoke = [...generatedObjectUrlsRef.current];
      generatedObjectUrlsRef.current = [];
      if (urlsToRevoke.length > 0) {
        setTimeout(() => {
          for (const url of urlsToRevoke) {
            try {
              URL.revokeObjectURL(url);
            } catch {
              /* ignore */
            }
          }
        }, 500);
      }
      return;
    }
    // 打开时重置所有状态
    setUploadPhase("idle");
    setUploadError(null);
    setRawFile(null);
    setPreviewUrl(null);
    setName("");
    setSelectedTags([]);
    setCustomTagInput("");
    setPortraitAnalysis(null);
    setFiveViewImageUrl(null);
    setFiveViewPreviewPhase("idle");
    setFiveViewError(null);
    setUploadedOssUrl(null);
  }, [isOpen]);

  useEffect(() => {
    return () => {
      clearObjectUrls();
    };
  }, []);

  // 弹窗 loading（上传 + 五视图生成）同步到全局计时器
  const hasShownRef = useRef(false);

  useEffect(() => {
    if (isUploading || isGeneratingFiveView) {
      hasShownRef.current = true;
      useAppStore.getState().showGlobalLoading();
    } else if (hasShownRef.current) {
      // 只在自己曾 showGlobalLoading 时才 hide，避免覆盖欢迎计时器
      hasShownRef.current = false;
      useAppStore.getState().hideGlobalLoading();
    }
  }, [isUploading, isGeneratingFiveView]);

  // 五视图生成进度条：从 0 缓慢增长到 95%，最多 90 秒
  useEffect(() => {
    if (!isGeneratingFiveView) {
      setFiveViewProgress(0);
      return;
    }
    setFiveViewProgress(0);
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      // 0 → 95% 缓慢增长，先快后慢（指数曲线）
      const progress = Math.min(95, Math.round((1 - Math.exp(-elapsed / 30_000)) * 100));
      setFiveViewProgress(progress);
    }, 500);
    return () => clearInterval(interval);
  }, [isGeneratingFiveView]);

  // ============================================================================
  // 处理函数：文件上传 + 人像分析
  // ============================================================================

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || !event.target.files[0]) return;
    const selected = event.target.files[0];

    // 创建预览 URL
    const objectUrl = registerObjectUrl(selected);
    setRawFile(selected);
    setPreviewUrl(objectUrl);
    setPortraitAnalysis(null);
    setUploadError(null);
    setFiveViewImageUrl(null);
    setFiveViewPreviewPhase("idle");
    setFiveViewError(null);
    setUploadedOssUrl(null);
    event.target.value = "";

    if (!token) return;

    // 开始分析
    setUploadPhase("analyzing");
    try {
      // 上传到 OSS，拿到 HTTP URL 后传给 LLM
      const { fileUrl: ossUrl } = await uploadFileToOss(token, "library", selected, true);
      setUploadedOssUrl(ossUrl);

      const result = await backendApi.checkPortraitImage(token, { imageUrl: ossUrl });

      if (!result.isPortrait) {
        setUploadPhase("failed");
        setUploadError(result.reason || "未检测到有效人像，建议上传清晰的正面人像照片");
        return;
      }

      // 分析成功，回填信息
      setPortraitAnalysis(result.analysis ?? null);
      setUploadPhase("idle");

      if (result.analysis) {
        autoFillFromAnalysis(result.analysis);
      }
    } catch (error) {
      setUploadPhase("failed");
      setUploadError(error instanceof Error ? error.message : "人像检测失败，请重试");
    }
  };

  /** 根据人像分析结果自动回填名称和标签 */
  const autoFillFromAnalysis = (analysis: PortraitAnalysis) => {
    // 自动生成名称
    const genderLabel = analysis.gender === "male" ? "男性" : analysis.gender === "female" ? "女性" : "";
    const ageLabel = analysis.age != null ? `${analysis.age}岁` : "";
    const styleLabel = analysis.style || "";
    const suggestedName = `${genderLabel}${ageLabel}${styleLabel}`.trim() || "新建角色";
    setName((prev) => prev || suggestedName);

    // 自动添加标签
    const autoTags: string[] = [];

    // 性别标签
    if (analysis.gender === "male") autoTags.push("男性");
    else if (analysis.gender === "female") autoTags.push("女性");

    // 年龄标签
    if (analysis.age != null) {
      if (analysis.age < 18) autoTags.push("儿童");
      else if (analysis.age >= 60) autoTags.push("老年");
    }

    // 风格标签
    if (analysis.style) {
      const styleStr = analysis.style.toLowerCase();
      if (styleStr.includes("business") || styleStr.includes("professional") || styleStr.includes("formal") || styleStr.includes("商务") || styleStr.includes("职业") || styleStr.includes("正式")) {
        autoTags.push("商务");
      } else if (styleStr.includes("casual") || styleStr.includes("daily") || styleStr.includes("休闲") || styleStr.includes("日常") || styleStr.includes("随性")) {
        autoTags.push("休闲");
      } else if (styleStr.includes("traditional") || styleStr.includes("classic") || styleStr.includes("古风") || styleStr.includes("传统") || styleStr.includes("古典")) {
        autoTags.push("古风");
      } else if (styleStr.includes("realistic") || styleStr.includes("real") || styleStr.includes("真实") || styleStr.includes("写实")) {
        autoTags.push("真实感");
      } else if (styleStr.includes("3d") || styleStr.includes("三维") || styleStr.includes("cg")) {
        autoTags.push("3D");
      } else if (styleStr.includes("anime") || styleStr.includes("cartoon") || styleStr.includes("二次元") || styleStr.includes("动漫") || styleStr.includes("卡通")) {
        autoTags.push("二次元");
      }
    }

    // 人种/地区标签
    if (analysis.ethnicity) {
      const ethnicityStr = analysis.ethnicity.toLowerCase();
      if (ethnicityStr.includes("asian") || ethnicityStr.includes("china") || ethnicityStr.includes("east") || ethnicityStr.includes("亚洲") || ethnicityStr.includes("中国") || ethnicityStr.includes("东方") || ethnicityStr.includes("黄种")) {
        autoTags.push("亚洲");
      } else if (ethnicityStr.includes("western") || ethnicityStr.includes("european") || ethnicityStr.includes("white") || ethnicityStr.includes("欧美") || ethnicityStr.includes("西方") || ethnicityStr.includes("白人") || ethnicityStr.includes("caucasian")) {
        autoTags.push("欧美");
      }
    }

    // 去重添加
    setSelectedTags((prev) => {
      const newTags = autoTags.filter((tag) => !prev.includes(tag));
      return newTags.length > 0 ? [...prev, ...newTags] : prev;
    });
  };

  // ============================================================================
  // 处理函数：生成五视图预览 + 确认创建
  // ============================================================================

  /**
   * 生成真人五视图预览（角色管理页，使用用户上传的头像）
   */
  const handleGenerateRealPortraitFiveView = async () => {
    if (!uploadedOssUrl || !name || !token) return;

    setFiveViewPreviewPhase("generating");
    setFiveViewError(null);
    try {
      const result = await backendApi.generateRealPortraitFiveViewPreview(token, {
        portraitImageUrl: uploadedOssUrl,
      });
      setFiveViewImageUrl(result.imageUrl);
      setFiveViewPreviewPhase("success");
    } catch (error) {
      setFiveViewError(error instanceof Error ? error.message : "五视图生成失败，可重试");
      setFiveViewPreviewPhase("failed");
    }
  };

  /**
   * 生成服饰搭配五视图预览（项目内，使用项目关联的服饰平铺图）
   */
  const handleGenerateOutfitFiveView = async () => {
    if (!projectId || !name || !token) return;

    setFiveViewPreviewPhase("generating");
    setFiveViewError(null);
    try {
      const result = await backendApi.generateFiveViewPreview(token, {
        projectId,
      });
      setFiveViewImageUrl(result.imageUrl);
      setFiveViewPreviewPhase("success");
    } catch (error) {
      setFiveViewError(error instanceof Error ? error.message : "五视图生成失败，可重试");
      setFiveViewPreviewPhase("failed");
    }
  };

  /**
   * 生成服饰+真人结合五视图预览（项目内 + 角色头像同时传入）
   */
  const handleGenerateOutfitPortraitFiveView = async () => {
    if (!projectId || !uploadedOssUrl || !name || !token) return;

    setFiveViewPreviewPhase("generating");
    setFiveViewError(null);
    try {
      const result = await backendApi.generateOutfitPortraitFiveViewPreview(token, {
        projectId,
        portraitImageUrl: uploadedOssUrl,
      });
      setFiveViewImageUrl(result.imageUrl);
      setFiveViewPreviewPhase("success");
    } catch (error) {
      setFiveViewError(error instanceof Error ? error.message : "五视图生成失败，可重试");
      setFiveViewPreviewPhase("failed");
    }
  };

  /**
   * 阶段二：确认创建角色（五视图预览成功后，上传并创建角色）
   */
  const handleConfirmCreate = async () => {
    if (!uploadedOssUrl || !fiveViewImageUrl || !token) return;

    setUploadPhase("saving");
    try {
      const created = await backendApi.createLibraryCharacter(token, {
        name,
        kind: "basic",
        thumbnailUrl: uploadedOssUrl,
        fiveViewOssImageUrl: fiveViewImageUrl,
        tags: selectedTags,
        ethnicity: portraitAnalysis?.ethnicity || null,
        age: portraitAnalysis?.age ?? null,
        gender: portraitAnalysis?.gender ?? null,
        style: portraitAnalysis?.style || null,
        bodyType: portraitAnalysis?.bodyType || null,
        faceShape: portraitAnalysis?.faceShape || null,
        facialFeatures: portraitAnalysis?.facialFeatures || null,
        eyebrows: portraitAnalysis?.eyebrows || null,
        eyes: portraitAnalysis?.eyes || null,
        eyeExpression: portraitAnalysis?.eyeExpression || null,
        nose: portraitAnalysis?.nose || null,
        lips: portraitAnalysis?.lips || null,
        chin: portraitAnalysis?.chin || null,
        skinTone: portraitAnalysis?.skinTone || null,
        hairStyle: portraitAnalysis?.hairStyle || null,
        uniqueFeatures: portraitAnalysis?.uniqueFeatures || null,
      });

      const newCharacter: Character = {
        id: created.id,
        name,
        thumbnail: uploadedOssUrl,
        type: "basic",
        tags: selectedTags,
        status: "ready",
        createdAt: "Just now",
      };
      onSave(newCharacter, true);
      onClose();
    } catch (error) {
      setUploadPhase("failed");
      setUploadError(error instanceof Error ? error.message : "创建角色失败");
    }
  };

  /** 重试五视图生成：重置预览状态，由用户再次点击"生成五视图"触发 */
  const handleRetryFiveView = () => {
    setFiveViewPreviewPhase("idle");
    setFiveViewImageUrl(null);
    setFiveViewError(null);
  };

  /** 重试上传（从失败状态恢复） */
  const handleRetryUpload = () => {
    setUploadPhase("idle");
    setUploadError(null);
    setRawFile(null);
    setPreviewUrl(null);
    setPortraitAnalysis(null);
    fileInputRef.current?.click();
  };

  // ============================================================================
  // 标签处理
  // ============================================================================

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
    );
  };

  const addCustomTag = () => {
    if (customTagInput.trim() && !selectedTags.includes(customTagInput.trim())) {
      setSelectedTags([...selectedTags, customTagInput.trim()]);
      setCustomTagInput("");
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addCustomTag();
    }
  };

  // ============================================================================
  // 渲染
  // ============================================================================

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        {/* ===== 头部 ===== */}
        <div className="shrink-0 px-6 py-4 flex justify-between items-center bg-gradient-to-r from-primary/5 via-transparent to-purple-500/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="material-icons-round text-primary text-lg">person_add</span>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">新建角色</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">上传人像照片，AI 自动分析角色特征并生成五视图</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isGeneratingFiveView}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <span className="material-icons-round text-xl">close</span>
          </button>
        </div>

        {/* ===== 主体 ===== */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileUpload}
            accept="image/*"
          />

          <div className="flex flex-col">
            {/* ===== 顶部图片区 ===== */}
            <div className="px-8 pt-6 pb-4">
              {/* 两步进度条 */}
              <div className="flex items-center gap-3 mb-4">
                {/* Step 1: 人像分析 */}
                <div className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-all duration-300 ${
                      uploadPhase === "analyzing"
                        ? "bg-primary text-white shadow-md shadow-primary/30 ring-2 ring-primary/20"
                        : uploadPhase === "failed"
                          ? "bg-red-500 text-white"
                          : portraitAnalysis
                            ? "bg-primary text-white"
                            : "bg-gray-200 text-gray-400"
                    }`}
                  >
                    {uploadPhase === "analyzing" ? (
                      <span className="material-icons-round text-xs animate-spin">refresh</span>
                    ) : uploadPhase === "failed" ? (
                      <span className="material-icons-round text-xs">close</span>
                    ) : portraitAnalysis ? (
                      <span className="material-icons-round text-xs">check</span>
                    ) : (
                      "1"
                    )}
                  </div>
                  <span
                    className={`text-xs font-semibold transition-colors duration-300 ${
                      uploadPhase === "analyzing"
                        ? "text-primary"
                        : uploadPhase === "failed"
                          ? "text-red-500"
                          : portraitAnalysis
                            ? "text-gray-700"
                            : "text-gray-400"
                    }`}
                  >
                    人像分析
                  </span>
                </div>
                {/* 连接线 */}
                <div
                  className={`h-[2px] flex-1 rounded-full transition-colors duration-500 ${
                    previewUrl ? "bg-primary/40" : "bg-gray-200"
                  }`}
                />
                {/* Step 2: 五视图生成 */}
                <div className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-all duration-300 ${
                      isGeneratingFiveView
                        ? "bg-primary text-white shadow-md shadow-primary/30 ring-2 ring-primary/20"
                        : fiveViewPreviewPhase === "success"
                          ? "bg-primary text-white"
                          : fiveViewPreviewPhase === "failed"
                            ? "bg-red-500 text-white"
                            : portraitAnalysis
                              ? "bg-gray-200 text-gray-400"
                              : "bg-gray-100 text-gray-300"
                    }`}
                  >
                    {isGeneratingFiveView ? (
                      <span className="material-icons-round text-xs animate-spin">refresh</span>
                    ) : fiveViewPreviewPhase === "success" ? (
                      <span className="material-icons-round text-xs">check</span>
                    ) : fiveViewPreviewPhase === "failed" ? (
                      <span className="material-icons-round text-xs">close</span>
                    ) : (
                      "2"
                    )}
                  </div>
                  <span
                    className={`text-xs font-semibold transition-colors duration-300 ${
                      isGeneratingFiveView
                        ? "text-primary"
                        : fiveViewPreviewPhase === "success"
                          ? "text-gray-700"
                          : fiveViewPreviewPhase === "failed"
                            ? "text-red-500"
                            : portraitAnalysis
                              ? "text-gray-400"
                              : "text-gray-300"
                    }`}
                  >
                    五视图生成
                  </span>
                </div>
              </div>

              {/* 图片双栏布局 */}
              <div className="flex items-center gap-4 justify-center">
                {/* 左侧：用户上传原图 */}
                <div className="flex flex-col items-center gap-2 w-40">
                  {previewUrl ? (
                    <div
                      className="w-full aspect-[3/4] rounded-xl overflow-hidden bg-white shadow-md ring-1 ring-gray-200/80 cursor-pointer group relative"
                      onClick={() => !isUploading && setLightboxUrl(previewUrl)}
                    >
                      <BlurFillImage src={previewUrl} alt="角色预览" aspectClass="w-full h-full" />
                      {/* 分析中遮罩 */}
                      {uploadPhase === "analyzing" && (
                        <div className="absolute inset-0 z-20 bg-white/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                          <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                          <span className="text-xs text-gray-600 font-medium">正在分析人像...</span>
                        </div>
                      )}
                      {/* 分析失败遮罩 */}
                      {uploadPhase === "failed" && uploadError && (
                        <div className="absolute left-0 bottom-0 right-0 z-20 bg-gradient-to-t from-red-500 via-red-500/90 to-transparent text-white text-xs p-3 pt-8">
                          <div className="flex items-start gap-1.5">
                            <span className="material-icons-round text-sm mt-0.5 shrink-0">warning</span>
                            <span className="line-clamp-2">{uploadError}</span>
                          </div>
                        </div>
                      )}
                      {/* 悬停操作 */}
                      {!isUploading && uploadPhase !== "failed" && !isGeneratingFiveView && (
                        <div className="absolute inset-0 z-20 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                          <span className="material-icons-round text-white text-2xl">zoom_in</span>
                        </div>
                      )}
                      {/* 更换/删除按钮 */}
                      {!isUploading && uploadPhase !== "failed" && !isGeneratingFiveView && (
                        <div className="absolute top-2 right-2 z-20 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            className="w-7 h-7 rounded-lg bg-black/40 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/60 transition-colors"
                            title="更换图片"
                            onClick={(e) => {
                              e.stopPropagation();
                              fileInputRef.current?.click();
                            }}
                          >
                            <span className="material-icons-round text-sm">image</span>
                          </button>
                          <button
                            type="button"
                            className="w-7 h-7 rounded-lg bg-black/40 backdrop-blur-sm text-white flex items-center justify-center hover:bg-red-500 transition-colors"
                            title="删除图片"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewUrl(null);
                              setRawFile(null);
                              setPortraitAnalysis(null);
                              setUploadPhase("idle");
                              setUploadError(null);
                              setFiveViewPreviewPhase("idle");
                              setFiveViewImageUrl(null);
                              setFiveViewError(null);
                              setUploadedOssUrl(null);
                            }}
                          >
                            <span className="material-icons-round text-sm">delete</span>
                          </button>
                        </div>
                      )}
                      {/* 失败时重新上传 */}
                      {uploadPhase === "failed" && (
                        <button
                          type="button"
                          className="absolute left-2 top-2 z-20 w-7 h-7 rounded-lg bg-white/90 text-primary flex items-center justify-center shadow-sm hover:bg-white transition-colors"
                          title="重新上传"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRetryUpload();
                          }}
                        >
                          <span className="material-icons-round text-sm">refresh</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    /* 无图上传区 */
                    <div
                      className={`w-full aspect-[3/4] rounded-xl flex flex-col items-center justify-center transition-all ${
                        uploadPhase === "failed" && uploadError
                          ? "bg-red-50 ring-1 ring-red-200"
                          : "border-2 border-dashed border-gray-200 bg-gray-50/50 hover:border-primary/40 hover:bg-primary/[0.02]"
                      } cursor-pointer`}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploadPhase === "failed" && uploadError ? (
                        <div className="text-center p-4">
                          <span className="material-icons-round text-red-400 text-4xl mb-2">error</span>
                          <div className="text-red-500 text-sm font-medium mb-1">识别失败</div>
                          <div className="text-gray-400 text-xs mb-3 line-clamp-2">{uploadError}</div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRetryUpload();
                            }}
                            className="text-primary text-xs font-medium hover:underline"
                          >
                            重新上传
                          </button>
                        </div>
                      ) : (
                        <div className="text-gray-300 flex flex-col items-center gap-2 py-4">
                          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
                            <span className="material-icons-round text-2xl text-gray-300">cloud_upload</span>
                          </div>
                          <div className="text-center">
                            <span className="text-sm text-gray-400 font-medium">点击上传人像照片</span>
                            <p className="text-[11px] text-gray-300 mt-1">支持 JPG / PNG 格式</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <span className="text-[11px] text-gray-400 font-medium">{previewUrl ? "用户上传原图" : ""}</span>
                </div>

                {/* 中间：箭头过渡 */}
                <div className="flex flex-col items-center shrink-0 gap-3">
                  <div className="relative flex items-center">
                    <div
                      className={`w-10 h-[2px] rounded-full transition-colors duration-300 ${
                        fiveViewImageUrl || isGeneratingFiveView
                          ? "bg-gradient-to-r from-transparent via-primary/60 to-primary"
                          : "bg-gradient-to-r from-transparent via-gray-200 to-gray-300"
                      }`}
                    />
                    <div
                      className={`absolute -inset-2 w-14 h-6 rounded-full blur-sm transition-all duration-500 ${
                        isGeneratingFiveView
                          ? "bg-primary/15"
                          : fiveViewImageUrl
                            ? "bg-primary/8"
                            : "bg-gray-200/50"
                      }`}
                      style={isGeneratingFiveView ? { animation: "flow-glow-pulse 2s ease-in-out infinite" } : undefined}
                    />
                    <span
                      className={`material-icons-round text-3xl drop-shadow-sm transition-colors duration-300 ${
                        fiveViewImageUrl || isGeneratingFiveView ? "text-primary" : "text-gray-300"
                      }`}
                      style={isGeneratingFiveView ? { animation: "flow-arrow-bounce 1s ease-in-out infinite" } : undefined}
                    >
                      arrow_forward
                    </span>
                    <div
                      className={`w-10 h-[2px] rounded-full transition-colors duration-300 ${
                        fiveViewImageUrl || isGeneratingFiveView
                          ? "bg-gradient-to-r from-primary via-primary/60 to-transparent"
                          : "bg-gradient-to-r from-gray-300 via-gray-200 to-transparent"
                      }`}
                    />
                  </div>
                  <span
                    className={`text-[10px] tracking-widest font-medium uppercase transition-colors duration-300 ${
                      fiveViewImageUrl || isGeneratingFiveView ? "text-primary/60" : "text-gray-300"
                    }`}
                  >
                    AI
                  </span>
                </div>

                {/* 右侧：AI 五视图结果 */}
                <div className="flex flex-col items-center gap-2 w-48">
                  {fiveViewImageUrl ? (
                    <div
                      className="w-full aspect-[16/9] rounded-xl overflow-hidden bg-white shadow-lg ring-2 ring-primary/20 cursor-pointer group relative"
                      onClick={() => setLightboxUrl(fiveViewImageUrl)}
                    >
                      <img
                        src={fiveViewImageUrl}
                        className="w-full h-full object-contain bg-[repeating-conic-gradient(#f9fafb_0%_25%,#fff_0%_50%)] bg-[length:12px_12px]"
                        alt="AI 五视图"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-end justify-center pb-3 pointer-events-none">
                        <span className="bg-white/25 backdrop-blur-md text-white text-[11px] font-medium px-3 py-1 rounded-full flex items-center gap-1">
                          <span className="material-icons-round text-sm">zoom_in</span>
                          查看大图
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full aspect-[16/9] rounded-xl overflow-hidden bg-gray-50 ring-1 ring-gray-200/80 flex flex-col items-center justify-center gap-2 relative">
                      {isGeneratingFiveView ? (
                        <>
                          <div className="relative">
                            <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-transparent animate-spin" />
                            <div className="absolute inset-0 w-10 h-10 rounded-full border border-primary/10 animate-ping" />
                          </div>
                          <span className="text-[11px] text-gray-600 font-medium">正在生成五视图...</span>
                          {/* 优雅进度条 */}
                          <div className="w-32 h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-primary/40 via-primary to-purple-400"
                              style={{
                                width: `${fiveViewProgress}%`,
                                backgroundSize: "200% 100%",
                                animation: "flow-gradient 2s ease-in-out infinite",
                              }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-300">预计需要 30-60 秒</span>
                        </>
                      ) : fiveViewError ? (
                        <>
                          <span className="material-icons-round text-3xl text-red-300">error</span>
                          <span className="text-[11px] text-red-400 font-medium">生成失败</span>
                          <span className="text-[10px] text-gray-300 line-clamp-2 px-3">{fiveViewError}</span>
                        </>
                      ) : (
                        <>
                          <span className="material-icons-round text-3xl text-gray-200">auto_fix_high</span>
                          <span className="text-[11px] text-gray-300 font-medium">AI 五视图</span>
                          <span className="text-[10px] text-gray-300">创建角色后自动生成</span>
                        </>
                      )}
                    </div>
                  )}
                  <span
                    className={`text-[11px] font-semibold transition-colors duration-300 ${
                      fiveViewImageUrl ? "text-primary" : isGeneratingFiveView ? "text-primary/60" : "text-gray-300"
                    }`}
                  >
                    {fiveViewImageUrl ? "AI 五视图 · 多角度" : isGeneratingFiveView ? "生成中..." : "AI 五视图 · 多角度"}
                  </span>
                </div>
              </div>
            </div>

            {/* ===== 五视图生成进度（仅生成中显示） ===== */}
            {isGeneratingFiveView && (
              <div className="px-8 pb-4">
                <div className="rounded-xl border border-primary/10 bg-gradient-to-r from-primary/[0.03] via-purple-500/[0.02] to-primary/[0.03] p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="relative w-8 h-8 shrink-0">
                      <div className="absolute inset-0 w-8 h-8 rounded-full border-2 border-primary/30 border-t-transparent animate-spin" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-primary/60" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-700">AI 正在精心打磨五视图细节</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">五视图追求角色各视角的高度一致性，生成时间较久，请耐心等待</div>
                    </div>
                  </div>
                  {/* 进度条 */}
                  <div className="relative h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-400 via-primary to-purple-400"
                      style={{
                        width: `${fiveViewProgress}%`,
                        backgroundSize: "200% 100%",
                        animation: "flow-gradient 2.5s ease-in-out infinite",
                      }}
                    />
                    {/* 光泽扫过效果 */}
                    <div
                      className="absolute inset-y-0 w-12 rounded-full bg-gradient-to-r from-transparent via-white/60 to-transparent"
                      style={{ animation: "progress-shimmer 2s ease-in-out infinite" }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ===== 底部表单区 ===== */}
            <div className="px-8 pb-6 pt-2 border-t border-gray-100">
              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                {/* 角色名称 */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    角色名称
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 text-sm transition-all"
                    placeholder="例如：2024 夏季模特"
                    disabled={isUploading}
                  />
                </div>

                {/* 特征标签 */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    特征标签
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={customTagInput}
                      onChange={(e) => setCustomTagInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="输入自定义标签 + 回车"
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-primary"
                      disabled={isUploading}
                    />
                    <button
                      onClick={addCustomTag}
                      className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold text-gray-600 disabled:opacity-50"
                      disabled={isUploading}
                    >
                      添加
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestedTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-all ${
                          selectedTags.includes(tag)
                            ? "bg-primary text-white border-primary"
                            : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                        }`}
                        disabled={isUploading}
                      >
                        {tag}
                      </button>
                    ))}
                    {selectedTags
                      .filter((tag) => !suggestedTags.includes(tag))
                      .map((tag) => (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className="px-2.5 py-1 rounded text-xs font-medium bg-primary text-white border border-primary transition-all"
                          disabled={isUploading}
                        >
                          {tag} <span className="ml-1 opacity-70">x</span>
                        </button>
                      ))}
                  </div>
                </div>
              </div>

              {/* AI 识别属性（药丸标签） */}
              {portraitAnalysis && (
                <div className="mt-4 rounded-xl bg-gray-50/80 border border-gray-100 p-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="material-icons-round text-primary text-sm">auto_awesome</span>
                      <span className="text-[11px] font-bold text-gray-500">AI 识别属性</span>
                    </div>
                    {ANALYSIS_PILL_FIELDS.map(({ key, label }) => {
                      const value = portraitAnalysis[key];
                      if (!value) return null;
                      const displayValue =
                        key === "gender" ? GENDER_LABELS[value] || value : value;
                      return (
                        <span
                          key={key}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white text-[11px] text-gray-600 ring-1 ring-gray-200/80"
                        >
                          <span className="text-gray-400">{label}</span>
                          <span className="font-semibold">{displayValue}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ===== 底部操作栏 ===== */}
            <div className="px-8 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/50">
              {fiveViewPreviewPhase === "success" ? (
                <button
                  type="button"
                  onClick={handleRetryFiveView}
                  disabled={isGeneratingFiveView}
                  className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <span className={`material-icons-round text-sm ${isGeneratingFiveView ? "animate-spin" : ""}`}>
                    {isGeneratingFiveView ? "refresh" : "autorenew"}
                  </span>
                  重新生成五视图
                </button>
              ) : fiveViewPreviewPhase === "failed" ? (
                <button
                  type="button"
                  onClick={handleRetryFiveView}
                  disabled={isGeneratingFiveView}
                  className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 disabled:opacity-50 transition-colors"
                >
                  <span className="material-icons-round text-sm">refresh</span>
                  重试生成
                </button>
              ) : (
                <div />
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isUploading || isGeneratingFiveView}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  {fiveViewPreviewPhase === "success" ? "关闭" : "取消"}
                </button>
                {/* 主按钮：根据五视图预览阶段切换 */}
                {fiveViewPreviewPhase === "success" ? (
                  // 五视图预览成功 → 显示"确定创建"
                  <Button onClick={() => void handleConfirmCreate()} disabled={isUploading} className="px-8">
                    <span className="flex items-center gap-2">
                      <span className="material-icons-round text-sm">check</span>
                      确定创建
                    </span>
                  </Button>
                ) : fiveViewPreviewPhase === "generating" ? (
                  // 五视图生成中
                  <Button disabled className="px-8 opacity-70 cursor-not-allowed">
                    <span className="flex items-center gap-2">
                      <span className="material-icons-round text-sm animate-spin">refresh</span>
                      正在生成五视图...
                    </span>
                  </Button>
                ) : (
                  // idle / failed → 根据模式调用对应的生成函数
                  <Button
                    onClick={() => void (() => {
                      if (fiveViewMode === "outfit") return handleGenerateOutfitFiveView();
                      if (fiveViewMode === "outfit-portrait") return handleGenerateOutfitPortraitFiveView();
                      return handleGenerateRealPortraitFiveView();
                    })()}
                    disabled={
                      !previewUrl ||
                      !name ||
                      isUploading ||
                      uploadPhase === "failed"
                    }
                    className={
                      isUploading || uploadPhase === "failed"
                        ? "opacity-70 cursor-not-allowed"
                        : ""
                    }
                  >
                    {isUploading ? (
                      <span className="flex items-center gap-2">
                        <span className="material-icons-round text-sm animate-spin">refresh</span>
                        {uploadPhase === "uploading" && "上传中..."}
                        {uploadPhase === "analyzing" && "深度分析中..."}
                        {uploadPhase === "saving" && "创建中..."}
                      </span>
                    ) : uploadPhase === "failed" ? (
                      <span className="flex items-center gap-2 text-red-500">
                        <span className="material-icons-round text-sm">error</span>
                        识别失败，请重新上传
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="material-icons-round text-sm">auto_fix_high</span>
                        生成五视图
                      </span>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* 五视图生成错误提示 */}
            {fiveViewError && !isGeneratingFiveView && (
              <div className="mx-8 mb-4 bg-red-50 rounded-xl p-3 border border-red-100">
                <div className="flex items-start gap-2">
                  <span className="material-icons-round text-red-400 text-base shrink-0 mt-0.5">error</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-red-600 text-xs font-medium mb-0.5">五视图生成失败</div>
                    <div className="text-gray-500 text-[11px] line-clamp-2">{fiveViewError}</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRetryFiveView}
                    className="text-primary text-[11px] font-semibold hover:underline whitespace-nowrap"
                  >
                    重试
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== 灯箱预览 ===== */}
      {lightboxUrl ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-6 backdrop-blur-md"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            className="absolute right-5 top-5 w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md text-white flex items-center justify-center hover:bg-white/20 transition-colors"
            onClick={() => setLightboxUrl(null)}
          >
            <span className="material-icons-round">close</span>
          </button>
          <img
            src={lightboxUrl}
            alt="预览大图"
            className="max-h-full max-w-full rounded-2xl shadow-2xl object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}

      {/* ===== 动画样式 ===== */}
      <style>{`
        @keyframes flow-gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes flow-glow-pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes flow-arrow-bounce {
          0%, 100% { transform: translateY(0); opacity: 0.6; }
          50% { transform: translateY(2px); opacity: 1; }
        }
        @keyframes progress-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
};
