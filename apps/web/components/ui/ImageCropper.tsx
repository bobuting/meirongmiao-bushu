import React, { useCallback, useRef, useState } from "react";
import ReactCrop, { centerCrop, makeAspectCrop, type Crop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

interface ImageCropperProps {
  /** 图片源（URL 或 Data URL） */
  imageSrc: string;
  /** 裁剪宽高比，默认 9/16 */
  aspectRatio?: number;
  /** 确认裁剪回调 */
  onConfirm: (croppedImageUrl: string) => void;
  /** 取消回调 */
  onCancel: () => void;
  /** 标题 */
  title?: string;
}

/**
 * 图片裁剪组件
 * 支持固定宽高比裁剪，默认 9:16
 */
export const ImageCropper: React.FC<ImageCropperProps> = ({
  imageSrc,
  aspectRatio = 9 / 16,
  onConfirm,
  onCancel,
  title = "裁剪图片",
}) => {
  // crop 状态用于显示（百分比格式）
  const [crop, setCrop] = useState<Crop | undefined>();
  const imgRef = useRef<HTMLImageElement>(null);

  // 图片加载时自动设置默认裁剪区域
  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth, naturalHeight } = e.currentTarget;
      // 居中裁剪，覆盖尽可能大的区域
      const defaultCrop = centerCrop(
        makeAspectCrop(
          {
            unit: "%",
            width: 100,
          },
          aspectRatio,
          naturalWidth,
          naturalHeight
        ),
        naturalWidth,
        naturalHeight
      );
      setCrop(defaultCrop);
    },
    [aspectRatio]
  );

  // 执行裁剪
  const handleConfirm = useCallback(async () => {
    const image = imgRef.current;
    if (!crop || !image) {
      console.error("[ImageCropper] No crop or image");
      return;
    }

    // 使用 canvas 进行裁剪
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    // crop 是百分比格式，需要转换为自然尺寸像素
    // 注意：百分比是基于图片显示尺寸，但我们直接用自然尺寸计算
    // 因为百分比 50% 在显示尺寸和自然尺寸上对应的是同一个相对位置
    const cropX = (crop.x / 100) * image.naturalWidth;
    const cropY = (crop.y / 100) * image.naturalHeight;
    const cropWidth = (crop.width / 100) * image.naturalWidth;
    const cropHeight = (crop.height / 100) * image.naturalHeight;

    // 边界检查
    const finalX = Math.max(0, Math.round(cropX));
    const finalY = Math.max(0, Math.round(cropY));
    const finalWidth = Math.min(Math.round(cropWidth), image.naturalWidth - finalX);
    const finalHeight = Math.min(Math.round(cropHeight), image.naturalHeight - finalY);

    if (finalWidth <= 0 || finalHeight <= 0) {
      alert("裁剪区域无效，请重新选择");
      return;
    }

    // 设置 canvas 尺寸（限制最大分辨率）
    const maxDimension = 1080;
    const scale = Math.min(1, maxDimension / Math.max(finalWidth, finalHeight));
    const outputWidth = Math.round(finalWidth * scale);
    const outputHeight = Math.round(finalHeight * scale);

    canvas.width = outputWidth;
    canvas.height = outputHeight;

    // 填充白色背景
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, outputWidth, outputHeight);

    // 高质量绘制
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(
      image,
      finalX,
      finalY,
      finalWidth,
      finalHeight,
      0,
      0,
      outputWidth,
      outputHeight
    );

    // 转换为 Data URL
    const croppedImageUrl = canvas.toDataURL("image/jpeg", 0.9);
    onConfirm(croppedImageUrl);
  }, [crop, onConfirm]);

  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!crop}
            className="px-4 py-2 text-sm font-bold text-white bg-primary hover:bg-primary-hover rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            确认裁剪
          </button>
        </div>
      </div>

      {/* 裁剪区域 */}
      <div className="flex-1 bg-gray-100 flex items-center justify-center overflow-auto p-4">
        <ReactCrop
          crop={crop}
          onChange={(_, percentCrop) => setCrop(percentCrop)}
          aspect={aspectRatio}
          minWidth={10}
          minHeight={10}
        >
          <img
            ref={imgRef}
            src={imageSrc}
            alt="裁剪预览"
            onLoad={onImageLoad}
            style={{ maxHeight: "60vh", maxWidth: "100%" }}
          />
        </ReactCrop>
      </div>

      {/* 底部提示 */}
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
        <p className="text-xs text-gray-500 text-center">
          拖动调整裁剪区域，松开鼠标确认位置。裁剪比例固定为 9:16
        </p>
      </div>
    </div>
  );
};
