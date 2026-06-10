/**
 * 单图服饰分析模块 — 背景移除功能
 *
 * 仅保留背景移除函数，其他未使用的代码已删除
 */

import sharp from "sharp";
import { removeBackground } from "@imgly/background-removal-node";

import { getLogger } from "../core/logger/index.js";
import { normalizeProviderTransportImageUrls } from "../services/media/image-utils.js";

const logger = getLogger("single-image-outfit");

// ---------------------------------------------------------------------------
// 背景移除（白底）
// ---------------------------------------------------------------------------

/**
 * 移除图片背景并填充为白色
 * @param imageUrl 图片 URL
 * @returns 白底图片的 base64 data URL
 */
export async function removeStep1ImageBackgroundToWhiteDataUrl(imageUrl: string): Promise<string> {
  const resolvedImageUrl = normalizeProviderTransportImageUrls([imageUrl])[0] ?? imageUrl;

  logger.debug({ imageUrl, resolvedImageUrl }, "开始背景移除");

  const foregroundBlob = await removeBackground(resolvedImageUrl, {
    model: "small",
    output: {
      format: "image/png",
      quality: 0.9,
    },
  });

  const foregroundBuffer = Buffer.from(await foregroundBlob.arrayBuffer());
  const whiteBackgroundPng = await sharp(foregroundBuffer)
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();

  logger.debug({ imageUrl }, "背景移除完成");

  return `data:image/png;base64,${whiteBackgroundPng.toString("base64")}`;
}