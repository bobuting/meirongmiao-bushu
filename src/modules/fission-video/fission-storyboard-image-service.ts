/**
 * 裂变分镜图片生成服务
 * 根据故事分镜描述 + 角色多视图参考生成图片
 */

// import { existsSync, readFileSync } from "node:fs";  // UNUSED REMOVED
// import { resolve } from "node:path";  // UNUSED REMOVED
// import { fileURLToPath } from "node:url";  // UNUSED REMOVED
// import { randomUUID } from "node:crypto";
import type { IObjectStorageAdapter } from "../../contracts/object-storage.js";
import type { AppContext } from "../../core/app-context.js";
import type { ResolvedRouteProvider } from "../../services/llm/llm-transport.js";
import type { ProviderRouteKey } from "../../contracts/provider-route-policy-contract.js";
import { requestLlmImageGenerationUrls, type ImageGenerationDebugOptions } from "../../services/media/image-generation-providers.js";
import { ProviderRouteKeys, selectRouteKeyByAge } from "../../contracts/provider-route-keys.js";
import { ProviderCallMode } from "../../contracts/types.js";
import { getLogger } from "../../core/logger/index.js";
import { optimizeImageBuffer } from "../../services/media/storage-persist.js";

const log = getLogger("fission-storyboard-image");

// ==================== 类型定义 ====================

// type JimengImageRatio = "1:1" | "3:4" | "9:16" | "16:9";
// type JimengImageResolution = "1k" | "2k" | "4k";

/**
 * 角色参考图片
 */
export interface CharacterReference {
  imageUrl: string;
  label?: string;
}

/**
 * 分镜图片生成选项
 */
export interface StoryboardImageOptions {
  /** 项目ID */
  projectId: string;
  /** 分镜描述列表 */
  storyboardDescriptions: string[];
  /** 存储适配器 */
  storage: IObjectStorageAdapter | null;
  /** 图片生成 Provider 配置（从数据库获取） */
  imageProvider?: ResolvedRouteProvider | null;
  /** 角色多视图参考图片 */
  characterReferences?: CharacterReference[];
  /** 服装参考图（只取第一张） */
  outfitReferenceImages?: string[];
  /** 应用上下文（用于图片生成审计记录） */
  ctx?: AppContext;
  /** 用户 ID（用于图片生成审计记录） */
  userId?: string;
}

/**
 * 分镜图片生成结果
 */
export interface StoryboardImageResult {
  /** 本地存储的图片路径 */
  imagePaths: string[];
  /** 本地存储的图片 URL */
  imageUrls: string[];
  /** LLM 返回的原始图片 URL（用于视频生成时转 base64） */
  originalImageUrls: string[];
}

// ==================== 未使用的辅助函数（已注释） ====================

// /**
//  * 解析密钥候选列表
//  */
// function parseSecretCandidates(secretRaw: string): string[] {
//   const candidates = secretRaw
//     .split(/[\r\n,;]+/)
//     .map((item) => item.trim())
//     .filter((item) => item.length > 0);
//   return [...new Set(candidates)];
// }

// /**
//  * 解析即梦区域候选
//  */
// function resolveJimengRegionCandidates(): string[] {
//   const preferred = (process.env.JIMENG_REGION ?? process.env.JIMENG_API_REGION ?? "")
//     .trim()
//     .toLowerCase();
//   const ordered = ["cn", "sg", "us", "hk", "jp"];
//   if (preferred && ordered.includes(preferred)) {
//     return [preferred, ...ordered.filter((item) => item !== preferred)];
//   }
//   return ordered;
// }

// /**
//  * 判断是否为代理平台（不需要地区前缀）
//  * 云雾等代理平台直接透传 token，不需要添加 cn- 等前缀
//  */
// function isProxyPlatform(vendor: string, baseUrl?: string): boolean {
//   const normalizedVendor = vendor.trim().toLowerCase();
//   const normalizedUrl = (baseUrl ?? "").trim().toLowerCase();
//   return (
//     normalizedVendor.includes("yunwu") ||
//     normalizedVendor.includes("云雾") ||
//     normalizedVendor.includes("openai-proxy") ||
//     normalizedVendor.includes("api-proxy") ||
//     normalizedUrl.includes("yunwu.ai") ||
//     normalizedUrl.includes("yunwu")
//   );
// }

// ==================== 未使用的辅助函数（已注释） ====================

// /**
//  * 构建认证头候选列表
//  */
// function buildAuthHeaderCandidates(secretRaw: string, vendor: string, baseUrl?: string): string[] {
//   const baseCandidates = parseSecretCandidates(secretRaw);
//   const candidates = baseCandidates.length > 0 ? baseCandidates : [secretRaw];
//   const headers: string[] = [];
//   const normalizedVendor = vendor.trim().toLowerCase();
//   const skipRegionPrefix = isProxyPlatform(normalizedVendor, baseUrl);
//   const isJimengVendor =
//     normalizedVendor.includes("jimeng") ||
//     normalizedVendor.includes("即梦") ||
//     normalizedVendor.includes("doubao") ||
//     normalizedVendor.includes("seedream");
//   const jimengRegions = resolveJimengRegionCandidates();
//   for (const candidate of candidates) {
//     const normalized = candidate.replace(/^Bearer\s+/i, "").trim();
//     if (!normalized) {
//       continue;
//     }
//     headers.push(`Bearer ${normalized}`);
//     if (!skipRegionPrefix && isJimengVendor && !/^(cn|us|hk|jp|sg)-/i.test(normalized)) {
//       for (const region of jimengRegions) {
//         headers.push(`Bearer ${region}-${normalized}`);
//       }
//     }
//   }
//   return [...new Set(headers)];
// }

// /**
//  * 带超时的 POST JSON 请求
//  */
// async function postJsonWithTimeout(
//   url: string,
//   payload: Record<string, unknown>,
//   headers: Record<string, string>,
//   timeoutMs: number,
// ): Promise<unknown> {
//   const controller = new AbortController();
//   const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
//   try {
//     const response = await fetch(url, {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//         ...headers,
//       },
//       body: JSON.stringify(payload),
//       signal: controller.signal,
//     });
//     const rawText = await response.text();
//     let data: unknown = {};
//     if (rawText.trim().length > 0) {
//       try {
//         data = JSON.parse(rawText);
//       } catch {
//         data = { raw: rawText };
//       }
//     }
//     if (!response.ok) {
//       throw new Error(`HTTP ${response.status} ${response.statusText}: ${rawText.slice(0, 300)}`);
//     }
//     return data;
//   } finally {
//     clearTimeout(timer);
//   }
// }

// /**
//  * 提取 Provider 错误信息
//  */
// function extractProviderErrorMessage(data: unknown): string | null {
//   if (!data || typeof data !== "object") {
//     return null;
//   }
//   const root = data as Record<string, unknown>;
//   const firstObject = (value: unknown): Record<string, unknown> | null =>
//     value && typeof value === "object" ? (value as Record<string, unknown>) : null;
//   const scopes = [root, firstObject(root.error), firstObject(root.data), firstObject(root.result)].filter(
//     (item): item is Record<string, unknown> => Boolean(item),
//   );
//   for (const scope of scopes) {
//     const codeRaw = scope.code ?? scope.error_code ?? scope.errorCode ?? scope.status;
//     const messageRaw =
//       scope.message ??
//       scope.msg ??
//       scope.detail ??
//       scope.error_message ??
//       scope.errorMessage ??
//       (typeof scope.error === "string" ? scope.error : null);
//     const message = typeof messageRaw === "string" ? messageRaw.trim() : "";
//     const codeText = typeof codeRaw === "string" || typeof codeRaw === "number" ? String(codeRaw).trim() : "";
//     if (message.length < 1) {
//       continue;
//     }
//     const normalizedMessage = message.toLowerCase();
//     if (["ok", "success", "succeeded"].includes(normalizedMessage)) {
//       continue;
//     }
//     if (codeText.length < 1) {
//       return message;
//     }
//     const normalizedCode = codeText.toLowerCase();
//     if (["0", "200", "ok", "success", "succeeded", "true"].includes(normalizedCode)) {
//       continue;
//     }
//     return `${codeText}: ${message}`;
//   }
//   return null;
// }

// /**
//  * 判断是否应将消息视为失败
//  */
// function shouldTreatProviderMessageAsFailure(message: string | null): boolean {
//   if (!message) {
//     return false;
//   }
//   const normalized = message.trim().toLowerCase();
//   if (normalized.length < 1) {
//     return false;
//   }
//   if (["ok", "success", "succeeded", "completed", "done"].includes(normalized)) {
//     return false;
//   }
//   return /(error|fail|invalid|forbidden|unauthorized|timeout|expired|insufficient|missing|exception|denied|not\s+allowed|not\s+found|gift_credit|rate.?limit|quota|blocked|reject)/i.test(
//     normalized,
//   );
// }

// /**
//  * 填充图片 URL 到指定数量
//  */
// function padImageUrls(urls: string[], count: number): string[] {
//   if (urls.length < 1) {
//     return [];
//   }
//   const normalized = [...urls];
//   while (normalized.length < count) {
//     normalized.push(normalized[normalized.length - 1] ?? normalized[0] ?? "");
//   }
//   return normalized.slice(0, count);
// }

// /**
//  * 标准化图片比例
//  */
// function normalizeJimengImageRatio(raw: string | undefined, fallback: JimengImageRatio): JimengImageRatio {
//   const value = (raw ?? "").trim();
//   if (value === "4:3") {
//     return "3:4";
//   }
//   if (value === "1:1" || value === "3:4" || value === "9:16" || value === "16:9") {
//     return value;
//   }
//   return fallback;
// }

// /**
//  * 标准化图片分辨率
//  */
// function normalizeJimengImageResolution(
//   raw: string | undefined,
//   fallback: JimengImageResolution,
// ): JimengImageResolution {
//   const value = (raw ?? "").trim().toLowerCase();
//   if (value === "1k" || value === "2k" || value === "4k") {
//     return value;
//   }
//   return fallback;
// }

// /**
//  * 标准化 Provider 传输的图片 URL
//  */
// function normalizeProviderTransportImageUrls(imageUrls: string[] | undefined): string[] {
//   if (!Array.isArray(imageUrls) || imageUrls.length < 1) {
//     return [];
//   }
//   const normalized = imageUrls
//     .map((item) => String(item ?? "").trim())
//     .filter((item) => item.length > 0)
//     .filter((item) => /^https?:\/\//i.test(item) || /^data:image\/[^;]+;base64,/i.test(item));
//   return [...new Set(normalized)];
// }

// /**
//  * 从 Provider 响应中提取图片 URL
//  */
// function extractImageUrlsFromProviderResponse(data: unknown): string[] {
//   const output: string[] = [];
//   const pushUrl = (value: unknown): void => {
//     const url = String(value ?? "").trim();
//     if (url.length < 1) {
//       return;
//     }
//     const isHttp = /^https?:\/\//i.test(url);
//     const isDataImage = /^data:image\/[^;]+;base64,/i.test(url);
//     if (!isHttp && !isDataImage) {
//       return;
//     }
//     if (!output.includes(url)) {
//       output.push(url);
//     }
//   };
//   const pushBase64 = (value: unknown): void => {
//     const raw = String(value ?? "").trim();
//     if (raw.length < 16) {
//       return;
//     }
//     const cleaned = raw.replace(/^data:image\/[^;]+;base64,/i, "").trim();
//     if (!/^[A-Za-z0-9+/=\r\n]+$/.test(cleaned)) {
//       return;
//     }
//     pushUrl(`data:image/png;base64,${cleaned}`);
//   };
//   const urlKeys = new Set(["url", "image", "href", "src", "uri", "image_url", "imageUrl", "file_url", "fileUrl"]);
//   const b64Keys = new Set(["b64_json", "b64Json", "image_base64", "imageBase64", "base64"]);
//   const queue: unknown[] = [data];
//   const visited = new Set<unknown>();
//   let guard = 0;
//   while (queue.length > 0 && guard < 20_000) {
//     guard += 1;
//     const current = queue.shift();
//     if (!current) {
//       continue;
//     }
//     if (typeof current === "string") {
//       pushUrl(current);
//       continue;
//     }
//     if (typeof current !== "object") {
//       continue;
//     }
//     if (visited.has(current)) {
//       continue;
//     }
//     visited.add(current);
//     if (Array.isArray(current)) {
//       for (const item of current) {
//         queue.push(item);
//       }
//       continue;
//     }
//     const record = current as Record<string, unknown>;
//     for (const [key, value] of Object.entries(record)) {
//       if (urlKeys.has(key)) {
//         pushUrl(value);
//       }
//       if (b64Keys.has(key)) {
//         pushBase64(value);
//       }
//       if (value && typeof value === "object") {
//         queue.push(value);
//       }
//       if (Array.isArray(value)) {
//         queue.push(...value);
//       }
//     }
//   }
//   return output;
// }

// /**
//  * 清理敏感头信息
//  */
// function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
//   const sanitized: Record<string, string> = {};
//   for (const [key, value] of Object.entries(headers)) {
//     if (key.toLowerCase() === "authorization" || key.toLowerCase().includes("api-key")) {
//       sanitized[key] = maskHeaderValue(value);
//       continue;
//     }
//     sanitized[key] = value;
//   }
//   return sanitized;
// }

// /**
//  * 压缩未知值为文本
//  */
// function compactUnknownText(value: unknown, maxLength = 1000): string {
//   if (typeof value === "string") {
//     return value.trim().slice(0, maxLength);
//   }
//   try {
//     return JSON.stringify(value).slice(0, maxLength);
//   } catch {
//     return String(value).slice(0, maxLength);
//   }
// }

// /**
//  * 解析 Gemini API Key
//  */
// function parseGeminiApiKey(secret: string): string {
//   return secret.replace(/^Bearer\s+/i, "").trim();
// }

// UNUSED REMOVED: parseImageDataUrl, guessImageMimeType, resolveLocalImageFilePath,
// fetchImageInlineData, readLocalImageInlineData (TS6133, cascade from resolveGeminiImageInlineData removal)
// (previously lines 413-518)

// UNUSED REMOVED: resolveGeminiImageInlineData (TS6133, no callers)

// UNUSED REMOVED: buildGeminiImageParts, extractGeminiImageDataUrls, extractUpstreamErrorMessage,
// DEFAULT_GEMINI_IMAGE_FALLBACK_MODELS, parseModelCandidates, dedupeModelCandidates
// (previously lines 555-702)

// ==================== 分镜图片生成主逻辑 ====================

// UNUSED REMOVED: DEFAULT_IMAGE_WIDTH, DEFAULT_IMAGE_HEIGHT (unused constants)

/**
 * 生成单个分镜图片
 */
async function generateSingleImage(
  description: string,
  index: number,
  options: StoryboardImageOptions
): Promise<{ path: string; url: string; originalUrl: string }> {
  const { projectId, storage, imageProvider, characterReferences } = options;

  const filename = `storyboard-${index + 1}-${Date.now()}.png`;
  const path = `projects/${projectId}/fission/storyboard-image/${filename}`;


  // 如果没有配置 Provider，返回占位图
  if (!imageProvider) {
    log.warn("StoryboardImageGenerator no image provider configured, using placeholder");
    const placeholderPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    if (storage) {
      await storage.putObject(path, placeholderPng, "image/png");
      const signedUrl = await storage.getSignedUrl(path);
      return { path, url: signedUrl || `/storage/objects/${path}`, originalUrl: "" };
    }
    return { path, url: `/storage/objects/${path}`, originalUrl: "" };
  }

  try {

    // 构建完整的 prompt
    let fullPrompt = description;
    const referenceImages: string[] = [];

    // 图片顺序：服饰平铺图 → 角色五视图
    // 第一张图对构图影响最大，确保服饰细节（logo、图案）优先保持

    // 1. 服饰参考图（先收集，主要参考）：只取1张
    if (options.outfitReferenceImages && options.outfitReferenceImages.length > 0) {
      referenceImages.push(options.outfitReferenceImages[0]);
    }

    // 2. 角色参考图（后收集，辅助参考）：只取1张
    if (characterReferences && characterReferences.length > 0) {
      const firstCharRef = characterReferences.find((ref) => ref.imageUrl);
      if (firstCharRef) {
        const refLabel = firstCharRef.label || "角色";
        fullPrompt = `参考角色特征（${refLabel}）：${description}。确保角色外观与参考图片一致。`;
        referenceImages.push(firstCharRef.imageUrl);
      }
    }


    // 判断 Provider 类型并调用相应的 API
    const providerType = imageProvider.callMode === ProviderCallMode.GEMINI_IMAGE || imageProvider.callMode === ProviderCallMode.GEMINI_IMAGE_INLINE ? "Gemini" : "ImageProvider";

    // 构建 debugOptions（用于审计记录）
    const imageGenMode = referenceImages.length > 0 ? "image_to_image" : "text_to_image";

    // 根据角色年龄选择图片生成 RouteKey
    let routeKey: ProviderRouteKey = ProviderRouteKeys.STEP3_STORYBOARD_IMAGE;
    if (options.ctx && options.projectId) {
      const project = await options.ctx.repos.projects.findById(options.projectId);
      const age = project?.selectedRoleDirection?.age;
      routeKey = selectRouteKeyByAge(
        age != null ? Number(age) : null,
        ProviderRouteKeys.FISSION_STORYBOARD_IMAGE_CHILD,
        ProviderRouteKeys.FISSION_STORYBOARD_IMAGE_ADULT,
      );
    }

    const debugOptions: ImageGenerationDebugOptions | undefined = options.ctx
      ? {
          ctx: options.ctx,
          routeKey,
          businessContext: `NewStory 分镜图片 ${index + 1}`,
          projectId: options.projectId,
          userId: options.userId,
          messages: [
            { role: "prompt", content: fullPrompt },
            { role: "reference_images", content: referenceImages.length > 0 ? referenceImages.join("\n") : "无" },
            { role: "params", content: JSON.stringify({ mode: imageGenMode, ratio: "9:16", resolution: "2k", count: 1 }) },
          ],
        }
      : undefined;

    // 调用 requestJimengImageUrls（会自动路由到 Gemini 或即梦 API）
    const imageResult = await requestLlmImageGenerationUrls(
      imageProvider,
      fullPrompt,
      {
        mode: imageGenMode,
        images: referenceImages,
        ratio: "9:16",  // 手机竖屏模式
        resolution: "2k",
        count: 1,
        debugOptions,
      }
    );

    const imageUrl = imageResult.urls[0];
    if (!imageUrl) {
      throw new Error("No image URL returned");
    }

    // 截断长 URL（包括 base64）
    const truncatedImageUrl = imageUrl?.length > 80 ? `${imageUrl.substring(0, 80)}...` : imageUrl;

    // 保存 LLM 返回的原始图片 URL（用于视频生成时转 base64）
    const originalImageUrl = imageUrl;

    // 下载图片并保存到存储
    let imageBuffer: Buffer;

    // 如果是 Data URL，直接解码
    if (imageUrl.startsWith("data:image")) {
      const base64Data = imageUrl.replace(/^data:image\/[^;]+;base64,/, "");
      imageBuffer = Buffer.from(base64Data, "base64");
    } else {
      // 否则从远程下载
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`下载图片失败: HTTP ${imageResponse.status}`);
      }
      imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    }

    if (storage) {
      // 优化图片：限制尺寸 + 转换 JPEG 格式（Gemini 不支持 WebP）
      const { buffer: optimizedBuffer, contentType: optimizedContentType } = await optimizeImageBuffer(imageBuffer);
      const jpegPath = path.replace(/\.png$/, ".jpg");
      await storage.putObject(jpegPath, optimizedBuffer, optimizedContentType);
      const signedUrl = await storage.getSignedUrl(jpegPath);
      return { path: jpegPath, url: signedUrl || `/storage/objects/${jpegPath}`, originalUrl: originalImageUrl };
    }

    return { path, url: imageUrl, originalUrl: originalImageUrl };
  } catch (error) {
    log.error({ err: error, projectId, storyboardIndex: index }, "StoryboardImageGenerator generation failed");
  }

  // 失败时使用占位图
  const placeholderPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  if (storage) {
    await storage.putObject(path, placeholderPng, "image/png");
    const signedUrl = await storage.getSignedUrl(path);
    return { path, url: signedUrl || `/storage/objects/${path}`, originalUrl: "" };
  }
  return { path, url: `/storage/objects/${path}`, originalUrl: "" };
}

/**
 * 生成分镜图片
 */
export async function generateStoryboardImages(
  options: StoryboardImageOptions,
  count: number = 5
): Promise<StoryboardImageResult> {
  const { storyboardDescriptions, projectId, imageProvider, characterReferences } = options;


  const descriptions = [...storyboardDescriptions];
  while (descriptions.length < count) {
    descriptions.push(`分镜场景 ${descriptions.length + 1}`);
  }

  // TODO: 调试模式 - 跳过 API 调用，改为 false 以启用 API 调用
  const SKIP_API_CALL = false;


  if (SKIP_API_CALL) {
    const allPaths: string[] = [];
    const allUrls: string[] = [];
    const allOriginalUrls: string[] = [];
    for (let i = 0; i < count; i++) {
      allPaths.push(`projects/${projectId}/fission/storyboard-image/placeholder-${i + 1}.png`);
      allUrls.push(`/storage/objects/${allPaths[i]}`);
      allOriginalUrls.push("");
    }
    return { imagePaths: allPaths, imageUrls: allUrls, originalImageUrls: allOriginalUrls };
  }

  const results = await Promise.all(
    descriptions.slice(0, count).map((desc, index) => generateSingleImage(desc, index, options))
  );

  results.forEach((r, i) => {
    // 截断长 URL（包括 base64）
    const truncatedUrl = r.url?.length > 60 ? `${r.url.substring(0, 60)}...` : r.url;
  });

  const allPaths = [...results.map((r) => r.path)];
  const allUrls = [...results.map((r) => r.url)];
  const allOriginalUrls = [...results.map((r) => r.originalUrl)];
  while (allPaths.length < count) {
    allPaths.push(`projects/${projectId}/fission/storyboard-image/placeholder-${allPaths.length + 1}.png`);
    allUrls.push(`/storage/objects/${allPaths[allPaths.length - 1]}`);
    allOriginalUrls.push("");
  }

  return { imagePaths: allPaths, imageUrls: allUrls, originalImageUrls: allOriginalUrls };
}

export const FissionStoryboardImageGenerator = { generateStoryboardImages };