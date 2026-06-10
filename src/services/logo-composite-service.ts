/**
 * Logo 合成服务
 * 使用 Sharp 在模特图左上角叠加 Logo
 */

import sharp from "sharp";
import type { LogoPosition } from "../contracts/types.js";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("logo-composite");

/** Logo 合成配置 */
export interface LogoCompositeConfig {
  /** Logo 图片 URL 或 Buffer */
  logoSource: string | Buffer;
  /** Logo 位置 */
  position: LogoPosition;
  /** Logo 宽度比例（相对于图片宽度，0.10 表示占图片宽度的 10%） */
  widthRatio: number;
  /** Logo 最小宽度 px（避免在小图上太小） */
  minWidth: number;
  /** Logo 最大宽度 px（避免在大图上太大） */
  maxWidth: number;
  /** Logo 边距 px */
  margin: number;
  /** Logo 透明度 0.0-1.0 */
  opacity: number;
}

/**
 * 合成 Logo 到模特图
 * @param modelPhotoBuffer 模特图 Buffer 或 Uint8Array
 * @param config Logo 合成配置
 * @returns 合成后的图片 Buffer
 */
export async function compositeLogo(
  modelPhotoBuffer: unknown,
  config: LogoCompositeConfig,
): Promise<Buffer> {
  try {
    // 确保输入是 Buffer（Sharp 需要 Buffer 类型）
    const inputBuffer: Buffer = Buffer.isBuffer(modelPhotoBuffer)
      ? (modelPhotoBuffer as Buffer)
      : Buffer.from(modelPhotoBuffer as Uint8Array);

    // 加载 Logo（支持 URL 或 Buffer）
    let logoInput: Buffer;
    if (typeof config.logoSource === "string") {
      // URL 形式：下载 Logo 图片
      const response = await fetch(config.logoSource);
      if (!response.ok) {
        throw new Error(`Failed to fetch logo: ${response.status}`);
      }
      logoInput = Buffer.from(await response.arrayBuffer());
    } else {
      logoInput = config.logoSource;
    }

    // 获取模特图元数据
    const modelMeta = await sharp(inputBuffer).metadata();
    const modelWidth = modelMeta.width ?? 1024;
    const modelHeight = modelMeta.height ?? 1536;

    // 处理 Logo：缩放 + 透明度
    const logoMeta = await sharp(logoInput).metadata();
    const logoWidth = logoMeta.width ?? 150;
    const logoHeight = logoMeta.height ?? 50;

    // 动态计算 Logo 宽度（基于图片宽度的比例）
    const dynamicWidth = Math.min(
      Math.max(
        modelWidth * config.widthRatio,  // 图片宽度 × 比例
        config.minWidth,                   // 最小宽度（避免太小）
      ),
      config.maxWidth,                    // 最大宽度（避免太大）
    );

    // 计算缩放比例
    const scaleRatio = Math.min(1, dynamicWidth / logoWidth);
    const scaledWidth = Math.round(logoWidth * scaleRatio);
    const scaledHeight = Math.round(logoHeight * scaleRatio);

    log.info(
      {
        modelSize: { width: modelWidth, height: modelHeight },
        originalLogoSize: { width: logoWidth, height: logoHeight },
        config: {
          widthRatio: config.widthRatio,
          minWidth: config.minWidth,
          maxWidth: config.maxWidth,
          margin: config.margin,
          opacity: config.opacity,
          position: config.position,
        },
        calculated: {
          dynamicWidth,
          scaleRatio,
          finalLogoSize: { width: scaledWidth, height: scaledHeight },
        },
      },
      "Logo 合成参数详情",
    );

    // 缩放 Logo
    const resizedLogo = await sharp(logoInput).resize(scaledWidth, scaledHeight).toBuffer();

    // 如果需要调整透明度（opacity < 1.0），创建半透明版本
    let processedLogo: Buffer;
    if (config.opacity < 1.0) {
      // 创建一个与 Logo 大小相同的灰度 alpha mask
      const alphaValue = Math.round(255 * config.opacity);
      const alphaMaskBuffer = Buffer.alloc(scaledWidth * scaledHeight, alphaValue);
      const alphaMask = await sharp(alphaMaskBuffer, {
        raw: { width: scaledWidth, height: scaledHeight, channels: 1 },
      })
        .png()
        .toBuffer();

      // 用遮罩调整 Logo 透明度
      processedLogo = await sharp(resizedLogo)
        .composite([
          {
            input: alphaMask,
            blend: "dest-in",
          },
        ])
        .toBuffer();
    } else {
      processedLogo = resizedLogo;
    }

    // 计算位置坐标
    const { x, y } = calculatePosition(
      modelWidth,
      modelHeight,
      scaledWidth,
      scaledHeight,
      config.position,
      config.margin,
    );

    // 合成 Logo 到模特图
    const result = await sharp(inputBuffer)
      .composite([
        {
          input: processedLogo,
          top: y,
          left: x,
          blend: "over",
        },
      ])
      .toBuffer();

    log.info(
      {
        modelSize: { width: modelWidth, height: modelHeight },
        logoSize: { width: scaledWidth, height: scaledHeight },
        position: config.position,
      },
      "Logo 合成成功",
    );

    return result;
  } catch (error) {
    log.error(error instanceof Error ? error : new Error(String(error)), "Logo 合成失败");
    throw error;
  }
}

/**
 * 计算 Logo 位置坐标
 */
function calculatePosition(
  modelWidth: number,
  modelHeight: number,
  logoWidth: number,
  logoHeight: number,
  position: LogoPosition,
  margin: number,
): { x: number; y: number } {
  switch (position) {
    case "top-left":
      return { x: margin, y: margin };
    case "top-right":
      return { x: modelWidth - logoWidth - margin, y: margin };
    case "bottom-left":
      return { x: margin, y: modelHeight - logoHeight - margin };
    case "bottom-right":
      return { x: modelWidth - logoWidth - margin, y: modelHeight - logoHeight - margin };
    default:
      return { x: margin, y: margin };
  }
}