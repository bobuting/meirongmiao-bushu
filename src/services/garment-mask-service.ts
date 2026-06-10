/**
 * 服饰遮罩预处理服务
 * 在平铺图生成前，用白色遮罩非主体服饰区域，防止生成模型脑补多余衣物
 */

import sharp from "sharp";
import type { GarmentAsset } from "../contracts/types.js";
import { getLogger } from "../core/logger/index.js";
import { AppError } from "../core/errors.js";
import { normalizeProviderTransportImageUrls } from "../services/media/image-utils.js";
import { persistImageSourceToStorage } from "../services/media/storage-persist.js";
import type { AppContext } from "../core/app-context.js";

const log = getLogger("garment-mask");

/** 服饰检测结果 */
interface GarmentRegion {
  index: number;
  category: string;
  isMainSubject: boolean;
  visibility: "full" | "partial" | "cropped";
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * 对图片进行遮罩预处理，移除非主体服饰区域
 * @param imageUrl 原始图片 URL
 * @param regions 检测到的服饰区域（从 garmentRegions 字段获取）
 * @param ctx 应用上下文（用于持久化遮罩后的图片）
 * @returns 遄罩后的图片 URL，如果无需遮罩则返回原 URL
 */
export async function maskNonMainGarments(
  imageUrl: string,
  regions: GarmentRegion[] | undefined,
  ctx: AppContext,
): Promise<string> {
  // 无检测数据或只有主体服饰，无需遮罩
  if (!regions || regions.length === 0) {
    log.debug({ imageUrl }, "无服饰检测数据，跳过遮罩");
    return imageUrl;
  }

  // 检查是否需要遮罩：存在 visibility !== "full" 的非主体服饰
  const needsMask = regions.some((r) => !r.isMainSubject && r.visibility !== "full");
  if (!needsMask) {
    log.debug({ imageUrl, regionCount: regions.length }, "所有服饰均为完整主体，跳过遮罩");
    return imageUrl;
  }

  log.info(
    {
      imageUrl,
      totalRegions: regions.length,
      nonMainRegions: regions.filter((r) => !r.isMainSubject).length,
    },
    "开始遮罩预处理",
  );

  try {
    // 1. 下载原图
    const resolvedUrl = normalizeProviderTransportImageUrls([imageUrl])[0] ?? imageUrl;
    const response = await fetch(resolvedUrl);
    if (!response.ok) {
      throw new AppError(502, "IMAGE_FETCH_FAILED", `无法下载图片: ${response.status}`);
    }
    const imageBuffer = Buffer.from(await response.arrayBuffer());

    // 2. 获取图片元数据（尺寸）
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width ?? 1024;
    const height = metadata.height ?? 1536;

    // 3. 为每个需要遮罩的区域创建白色矩形
    const maskOperations: sharp.OverlayOptions[] = regions
      .filter((r) => !r.isMainSubject && r.visibility !== "full")
      .map((r) => {
        // 将相对坐标转换为像素坐标（保守扩展 5% 边距避免切到边缘）
        const padding = Math.min(width, height) * 0.02; // 2% 边距
        const left = Math.max(0, Math.round(r.boundingBox.x * width - padding));
        const top = Math.max(0, Math.round(r.boundingBox.y * height - padding));
        const boxWidth = Math.min(width - left, Math.round(r.boundingBox.width * width + padding * 2));
        const boxHeight = Math.min(height - top, Math.round(r.boundingBox.height * height + padding * 2));

        // 创建白色矩形 Buffer
        const whiteRect = Buffer.alloc(boxWidth * boxHeight * 3, 255); // RGB 白色

        return {
          input: whiteRect,
          top,
          left,
          blend: "over",
          raw: {
            width: boxWidth,
            height: boxHeight,
            channels: 3,
          },
        };
      });

    if (maskOperations.length === 0) {
      log.debug({ imageUrl }, "无实际需要遮罩的区域");
      return imageUrl;
    }

    // 4. 应用遮罩（生成PNG buffer，不保留任何元数据）
    const maskedBuffer = await sharp(imageBuffer)
      .composite(maskOperations)
      .png()
      .toBuffer();

    log.info(
      {
        imageUrl,
        maskedRegions: maskOperations.length,
        imageSize: { width, height },
      },
      "遮罩完成",
    );

    // 5. 持久化到对象存储（自动转换为jpeg，Gemini 不支持 WebP）
    const maskedDataUrl = `data:image/png;base64,${maskedBuffer.toString("base64")}`;
    const maskedUrl = await persistImageSourceToStorage(ctx, maskedDataUrl, "garment-masked", {
      persistRemote: false,
      dedupeByContent: false, // 不去重，每次遮罩都生成新文件
      optimize: true, // 自动转换为jpeg格式
    });

    log.info({ maskedUrl }, "遮罩图片已持久化（jpeg格式）");
    return maskedUrl;
  } catch (error) {
    log.error(
      {
        err: error instanceof Error ? error : new Error(String(error)),
        imageUrl,
      },
      "遮罩预处理失败",
    );
    // 遮罩失败时降级返回原图（不阻断主流程）
    log.warn({ imageUrl }, "遮罩失败，降级使用原图");
    return imageUrl;
  }
}

/**
 * 从服饰资产中提取主图的检测区域
 */
export function extractMainImageRegions(asset: GarmentAsset): GarmentRegion[] | undefined {
  return asset.garmentRegions;
}