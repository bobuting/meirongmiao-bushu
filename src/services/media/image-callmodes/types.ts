/**
 * image-callmodes/types.ts
 *
 * 图像生成 CallMode 统一接口定义。
 * 每个 CallMode 实现此接口，封装请求构建和响应提取逻辑。
 */

import type { ResolvedRouteProvider } from "../../llm/provider-resolver.js";

/** 图像生成 CallMode 统一选项 */
export interface ImageCallModeOptions {
  mode?: "text_to_image" | "image_to_image";
  images?: string[];
  ratio?: string;
  resolution?: string;
  count?: number;
  temperature?: number;
  negativePrompt?: string;
}

/** buildRequest 返回的请求结构 */
export interface ImageCallModeRequest {
  endpoint: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  /** multipart 请求时为 true，主流程使用 postMultipartWithTimeout */
  isMultipart?: boolean;
  /** multipart 时携带 FormData */
  formData?: FormData;
}

/** 图像生成 CallMode 处理器接口 */
export interface ImageCallModeHandler {
  /** 构建请求（endpoint + headers + body），不发送 HTTP */
  buildRequest(
    provider: ResolvedRouteProvider,
    prompt: string,
    options?: ImageCallModeOptions,
  ): ImageCallModeRequest | Promise<ImageCallModeRequest>;

  /** 从 HTTP 响应中提取图片 URL */
  extractImageUrls(response: unknown): string[];
}
