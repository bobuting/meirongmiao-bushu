import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageCropper } from "../../../components/ui/ImageCropper";
import {
  PROJECT_FLOW_MEDIA_CHROME_Z_CLASS,
  PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS,
} from "../projectFlowMediaLayerGuard";
import { uploadFileToOss } from "../../../services/ossUpload";
import { getOssThumbnailUrl } from "../../../utils/ossImage";

interface CoverCandidate {
  id: string;
  url: string;
  label: string;
}

interface Step4CoverSelectorModalProps {
  /** 是否打开 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 当前选中的封面 URL */
  currentCoverUrl: string;
  /** 封面候选列表（分镜图） */
  candidates: CoverCandidate[];
  /** 确认选择回调 */
  onConfirm: (coverUrl: string) => void;
  /** 用户 token（用于上传） */
  token: string | null;
  /** 项目 ID */
  projectId: string | null;
}

/**
 * Step4 封面选择模态框
 * 支持：从分镜图选择、上传自定义图片、裁剪
 */
export const Step4CoverSelectorModal: React.FC<Step4CoverSelectorModalProps> = ({
  isOpen,
  onClose,
  currentCoverUrl,
  candidates,
  onConfirm,
  token,
  projectId,
}) => {
  // Tab 状态：'select' | 'upload' | 'crop'
  const [activeTab, setActiveTab] = useState<"select" | "upload">("select");
  const [selectedUrl, setSelectedUrl] = useState<string>(currentCoverUrl);
  const [, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 当模态框打开时，同步 currentCoverUrl 到 selectedUrl
  useEffect(() => {
    if (isOpen) {
      setSelectedUrl(currentCoverUrl);
      setActiveTab("select");
      setCropImageSrc(null);
    }
  }, [isOpen, currentCoverUrl]);

  // 去重后的候选列表
  const uniqueCandidates = useMemo(() => {
    const seen = new Set<string>();
    return candidates.filter((item) => {
      if (seen.has(item.url)) {
        return false;
      }
      seen.add(item.url);
      return true;
    });
  }, [candidates]);

  // 选择候选图
  const handleSelectCandidate = useCallback((url: string) => {
    setSelectedUrl(url);
  }, []);

  // 确认选择（不裁剪）
  const handleConfirmSelection = useCallback(() => {
    if (selectedUrl.trim()) {
      onConfirm(selectedUrl.trim());
      onClose();
    }
  }, [selectedUrl, onConfirm, onClose]);

  // 触发文件选择
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // 处理文件选择
  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      // 验证文件类型
      if (!file.type.startsWith("image/")) {
        alert("请选择图片文件");
        return;
      }

      // 验证文件大小（最大 10MB）
      if (file.size > 10 * 1024 * 1024) {
        alert("图片大小不能超过 10MB");
        return;
      }

      // 读取文件为 Data URL 用于预览和裁剪
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          setCropImageSrc(dataUrl);
          setActiveTab("upload");
        }
      };
      reader.readAsDataURL(file);

      // 清空 input，允许重复选择同一文件
      event.target.value = "";
    },
    []
  );

  // 裁剪完成
  const handleCropComplete = useCallback(
    async (croppedDataUrl: string) => {
      if (!token || !projectId) {
        alert("登录状态已失效，请重新登录");
        return;
      }

      setIsUploading(true);

      try {
        // 将 Data URL 转换为 Blob
        const response = await fetch(croppedDataUrl);
        const blob = await response.blob();

        // 生成文件名
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const fileName = `cover_${timestamp}_${randomSuffix}.jpg`;

        // 上传到 OSS
        const file = new File([blob], fileName, { type: "image/jpeg" });
        const { fileUrl } = await uploadFileToOss(token, projectId, file);

        // 返回上传后的 URL
        onConfirm(fileUrl);
        setCropImageSrc(null);
        onClose();
      } catch (error) {
        console.error("封面上传失败:", error);
        setUploadError("封面上传失败，请重试");
      } finally {
        setIsUploading(false);
      }
    },
    [token, projectId, onConfirm, onClose]
  );

  // 取消裁剪
  const handleCropCancel = useCallback(() => {
    setCropImageSrc(null);
  }, []);

  if (!isOpen) {
    return null;
  }

  // 裁剪模式
  if (cropImageSrc) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden">
          <ImageCropper
            imageSrc={cropImageSrc}
            aspectRatio={9 / 16}
            onConfirm={handleCropComplete}
            onCancel={handleCropCancel}
            title="裁剪封面 (9:16)"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">选择封面</h3>
          <button
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <span className="material-icons-round text-base">close</span>
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab("select")}
            className={`flex-1 px-4 py-3 text-sm font-bold transition-colors ${
              activeTab === "select"
                ? "text-primary border-b-2 border-primary"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            从分镜图选择
          </button>
          <button
            onClick={() => setActiveTab("upload")}
            className={`flex-1 px-4 py-3 text-sm font-bold transition-colors ${
              activeTab === "upload"
                ? "text-primary border-b-2 border-primary"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            上传自定义图片
          </button>
        </div>

        {/* Tab 内容 */}
        <div className="p-6">
          {activeTab === "select" && (
            <>
              {uniqueCandidates.length > 0 ? (
                <div className="space-y-4">
                  {/* 当前选中预览 */}
                  <div className="flex justify-center">
                    <div className="relative w-40 aspect-[9/16] rounded-xl overflow-hidden border-2 border-primary shadow-lg">
                      {selectedUrl ? (
                        <img
                          src={getOssThumbnailUrl(selectedUrl, 300)}
                          alt="当前封面"
                          className={`${PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS} w-full h-full object-cover`}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-xs">
                          暂无封面
                        </div>
                      )}
                      <div
                        className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5`}
                      >
                        <p className="text-[10px] text-white font-medium truncate">当前封面</p>
                      </div>
                    </div>
                  </div>

                  {/* 候选列表 */}
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {uniqueCandidates.map((candidate, _index) => {
                      const isSelected = selectedUrl === candidate.url;
                      return (
                        <button
                          key={candidate.id}
                          onClick={() => handleSelectCandidate(candidate.url)}
                          className={`relative w-24 aspect-[9/16] shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                            isSelected
                              ? "border-primary ring-2 ring-primary/20"
                              : "border-gray-200 hover:border-primary/50"
                          }`}
                          title={candidate.label}
                        >
                          <img
                            src={getOssThumbnailUrl(candidate.url, 120)}
                            alt={candidate.label}
                            className={`${PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS} h-full w-full object-cover`}
                          />
                          {isSelected && (
                            <div
                              className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} inset-0 bg-primary/10 flex items-center justify-center`}
                            >
                              <span className="material-icons-round text-white text-2xl drop-shadow-lg">
                                check_circle
                              </span>
                            </div>
                          )}
                          <div
                            className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} bottom-0 inset-x-0 bg-black/50 px-1 py-0.5`}
                          >
                            <p className="text-[9px] text-white truncate">{candidate.label}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 text-sm">
                  暂无分镜图可选，请先完成分镜生成
                </div>
              )}
            </>
          )}

          {activeTab === "upload" && (
            <div className="space-y-4">
              {/* 上传预览占位区（保持与分镜图选择相同高度） */}
              <div className="flex justify-center">
                <div className="relative w-40 aspect-[9/16] rounded-xl overflow-hidden border-2 border-gray-200 bg-gray-100">
                  <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                    <span className="material-icons-round text-4xl mb-2">cloud_upload</span>
                    <p className="text-xs">等待上传</p>
                  </div>
                  <div
                    className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5`}
                  >
                    <p className="text-[10px] text-white font-medium truncate">待上传</p>
                  </div>
                </div>
              </div>

              {/* 上传区域 */}
              <div
                onClick={handleUploadClick}
                className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <p className="text-sm font-medium text-gray-600">点击选择图片文件</p>
                <p className="text-xs text-gray-400 mt-1">支持 JPG、PNG、WebP，最大 10MB</p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />

              {/* 上传提示 */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
                <p className="text-xs text-amber-700">
                  <span className="font-bold">提示：</span>
                  图片将裁剪为 9:16 比例，建议上传接近该比例的图片。
                </p>
              </div>
              {/* 上传错误提示 */}
              {uploadError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 flex items-center justify-between">
                  <p className="text-xs text-red-700">{uploadError}</p>
                  <button
                    onClick={() => setUploadError(null)}
                    className="text-red-400 hover:text-red-600 ml-2"
                  >
                    <span className="material-icons-round text-sm">close</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部操作 */}
        {activeTab === "select" && uniqueCandidates.length > 0 && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleConfirmSelection}
              disabled={!selectedUrl.trim()}
              className="px-6 py-2 text-sm font-bold text-white bg-primary hover:bg-primary-hover rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              确认选择
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
