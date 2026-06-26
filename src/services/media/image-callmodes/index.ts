/**
 * image-callmodes/index.ts
 *
 * 图像生成 CallMode 注册表。
 * 每个 CallMode 的请求构建和响应提取封装在独立文件中。
 *
 * 新增 CallMode 流程：
 * 1. 在 image-callmodes/ 下创建新文件
 * 2. 实现 ImageCallModeHandler 接口（buildRequest + extractImageUrls）
 * 3. 在此文件注册到 registry
 * 4. 主文件 image-generation-providers.ts 无需修改
 */

import { ProviderCallMode } from "../../../contracts/types.js";
import type { ImageCallModeHandler } from "./types.js";
import { openaiImageHandler } from "./openai-image.js";
import { openaiImageCaixiangHandler, openaiImageCaixiangUtils } from "./openai-image-caixiang.js";
import { openaiImageEditHandler } from "./openai-image-edit.js";
import { seedreamImageHandler } from "./seedream-image.js";
import { seedreamImageArkYunwuHandler } from "./seedream-image-ark-yunwu.js";
import { geminiImageHandler, geminiImageInlineHandler } from "./gemini-image.js";
import { grokImageHandler } from "./grok-image.js";
import { grokImageEditHandler } from "./grok-image-edit.js";
import { nanoBananaImageHandler } from "./nano-banana-image.js";
import { wanxImageHandler } from "./wanx-image.js";

const registry = new Map<ProviderCallMode, ImageCallModeHandler>([
  [ProviderCallMode.OPENAI_IMAGE, openaiImageHandler],
  [ProviderCallMode.OPENAI_IMAGE_CAIXIANG, openaiImageCaixiangHandler],
  [ProviderCallMode.SEEDREAM_IMAGE_ARK, seedreamImageHandler],
  [ProviderCallMode.SEEDREAM_IMAGE_ARK_YUNWU, seedreamImageArkYunwuHandler],
  [ProviderCallMode.GEMINI_IMAGE, geminiImageHandler],
  [ProviderCallMode.GEMINI_IMAGE_INLINE, geminiImageInlineHandler],
  [ProviderCallMode.GROK_IMAGE, grokImageHandler],
  [ProviderCallMode.GROK_IMAGE_EDIT, grokImageEditHandler],
  [ProviderCallMode.OPENAI_IMAGE_EDIT, openaiImageEditHandler],
  [ProviderCallMode.NANO_BANANA_IMAGE, nanoBananaImageHandler],
  [ProviderCallMode.WANX_IMAGE_BAILIAN, wanxImageHandler],
]);

/** 获取指定 CallMode 的处理器 */
export function getImageCallModeHandler(callMode: ProviderCallMode): ImageCallModeHandler {
  const handler = registry.get(callMode);
  if (!handler) throw new Error(`Unsupported image callMode: ${callMode}`);
  return handler;
}

/** 检查 CallMode 是否已注册 */
export function isSupportedImageCallMode(callMode: string): boolean {
  return registry.has(callMode as ProviderCallMode);
}

export type { ImageCallModeHandler, ImageCallModeOptions, ImageCallModeRequest } from "./types.js";

// 导出异步任务工具函数（供主流程使用）
export { openaiImageCaixiangUtils } from "./openai-image-caixiang.js";
