/**
 * 视频生成 LLM 服务
 *
 * 统一的视频生成服务，支持五种协议：
 *   1. 可灵 Kling（/v1/videos/generations）
 *   2. VEO Google 视频（/v1/models/...:predictLongRunning）
 *   3. 豆包/火山引擎（/api/v1/contents/generations/tasks）
 *   4. 万相/DashScope（/api/v1/services/aigc/video-generation/video-synthesis）
 *   5. 即梦/剪映（/api/v1/videos/generations）
 *
 * 流程：创建任务 -> 轮询查询 -> 返回视频 URL
 * 存储持久化由调用方处理
 *
 * 协议路由：基于 provider.callMode 枚举值（kling/veo/doubao/wanx-video-bailian/jimeng）
 */

import { AppError } from "../../core/errors.js";
import { sanitizeUrlField } from "../../contracts/media-url-safety.js";
import {
  buildAuthHeaderCandidates,
  parseModelCandidates,
  // toBearerToken,
} from "../../utils/http-request.js";
import { compactUnknownText } from "../../utils/text.js";
import { ProviderCallMode } from "../../contracts/types.js";
import {
  normalizeObjectStoragePublicBase,
} from "../../services/media/storage-persist.js";
import {
  resolveObjectStorageLocalRoot,
} from "../../storage/runtime.js";
import { resolveRuntimeConfig } from "../../core/runtime-config.js";
import {
  resolveServerRelativeImageUrl,
  readLocalImageInlineData,
  fetchImageInlineData,
} from "../../services/media/image-utils.js";
import {
  buildDoubaoVolcVideoCreateEndpointCandidates,
  buildDoubaoVolcVideoQueryEndpointCandidates,
  buildJimengVideoEndpointCandidates,
  buildJimengVideoQueryEndpointCandidates,
  isDoubaoProvider,
} from "../../modules/jimeng-video-provider-endpoints.js";
import {
  buildKlingMultiImageVideoCreateEndpointCandidates,
  buildKlingMultiImageVideoQueryEndpointCandidates,
  buildKlingVideoRequestBody,
  isKlingProvider,
  buildKlingOfficialVideoCreateEndpointCandidates,
  buildKlingOfficialVideoQueryEndpointCandidates,
  buildKlingOfficialVideoRequestBody,
  isKlingOfficialProvider,
  extractVideoUrlsFromKlingResponse,
  extractTaskIdFromKlingResponse,
  extractTaskStatusFromKlingResponse,
  // 视频编辑端点
  isKlingVideoEditProvider,
  buildKlingVideoEditCreateEndpointCandidates,
  buildKlingVideoEditQueryEndpointCandidates,
  buildKlingVideoEditRequestBody,
  extractVideoUrlsFromKlingVideoEditResponse,
  extractTaskIdFromKlingVideoEditResponse,
  extractTaskStatusFromKlingVideoEditResponse,
  // Omni-Video 端点
  isKlingOmniVideoProvider,
  buildKlingOmniVideoRequestBody,
  buildKlingVideoCreateEndpointCandidates,
  buildKlingVideoQueryEndpointCandidates,
} from "../../modules/kling-video-provider-endpoints.js";
// 视频响应提取器
import { getExtractor } from "../../services/video/index.js";
import {
  buildVeoVideoCreateEndpointCandidates,
  buildVeoVideoQueryEndpointCandidates,
} from "../../modules/veo-video-provider-endpoints.js";
import {
  buildVeoOpenaiVideoCreateEndpointCandidates,
  buildVeoOpenaiVideoQueryEndpointCandidates,
  isVeoOpenaiProvider,
} from "../../modules/veo-openai-video-provider-endpoints.js";
import {
  buildWanxVideoCreateEndpointCandidates,
  buildWanxVideoQueryEndpointCandidates,
  buildWanxVideoRequestBody,
} from "../../modules/wanx-video-provider-endpoints.js";
import {
  buildHappyHorseVideoCreateEndpointCandidates,
  buildHappyHorseVideoQueryEndpointCandidates,
  buildHappyHorseVideoRequestBody,
} from "../../modules/happyhorse-video-provider-endpoints.js";
import {
  isGrokProvider,
  buildGrokVideoCreateEndpointCandidates,
  buildGrokVideoQueryEndpointCandidates,
  buildGrokVideoRequestBody,
} from "../../modules/grok-video-provider-endpoints.js";
import {
  isGrokImagineProvider,
  buildGrokImagineVideoCreateEndpointCandidates,
  buildGrokImagineVideoQueryEndpointCandidates,
  buildGrokImagineVideoRequestBody,
  buildGrokImagineVideoDataeyesRequestBody,
  buildGrokImagineVideoCaixiangRequestBody,
} from "../../modules/grok-imagine-video-provider-endpoints.js";
import {
  buildGrokCaixiangVideoCreateEndpointCandidates,
  buildGrokCaixiangVideoQueryEndpointCandidates,
  buildGrokCaixiangVideoRequestBody,
} from "../../modules/grok-video-caixiang-provider-endpoints.js";
import {
  buildVeoCaixiangVideoCreateEndpointCandidates,
  buildVeoCaixiangVideoQueryEndpointCandidates,
  buildVeoCaixiangVideoRequestBody,
} from "../../modules/veo-video-caixiang-provider-endpoints.js";
import {
  createHappyHorseVideoEditTask,
  queryHappyHorseVideoEditTask,
} from "./llm-happyhorse-video-edit.js";
import type { ResolvedRouteProvider } from "../../services/llm/provider-resolver.js";
import {
  getVideoGenerationConfig,
  getVideoPollingConfig,
  getVideoRetryConfig,
  getVideoModelConfig,
  // computeProgressivePollInterval,
  // classifyVideoError,
} from "../../core/video-config.js";
import { videoGenerationLogger as log } from "../../core/logger/index.js";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 即梦图片比例 */
export type JimengImageRatio = "1:1" | "3:4" | "9:16" | "16:9";
/** 即梦图片分辨率 */
export type JimengImageResolution = "1k" | "2k" | "4k";

// ---------------------------------------------------------------------------
// 即梦图片辅助类型 & 归一化（向后兼容导出）
// ---------------------------------------------------------------------------

export function normalizeJimengImageRatio(raw: string | undefined, fallback: JimengImageRatio): JimengImageRatio {
  const value = (raw ?? "").trim();
  if (value === "4:3") {
    return "3:4";
  }
  if (value === "1:1" || value === "3:4" || value === "9:16" || value === "16:9") {
    return value;
  }
  return fallback;
}

export function normalizeJimengImageResolution(
  raw: string | undefined,
  fallback: JimengImageResolution,
): JimengImageResolution {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "1k" || value === "2k" || value === "4k") {
    return value;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// 协议路由（基于 callMode 枚举）
// ---------------------------------------------------------------------------

/**
 * 解析视频生成协议
 * 基于 provider.callMode 枚举值路由，不再使用 baseUrl/vendor 启发式匹配
 *
 * @returns 协议标识符：'kling' | 'veo' | 'doubao' | 'wanx-video-bailian' | 'jimeng'
 */
export function resolveVideoCallMode(provider: Pick<ResolvedRouteProvider, "callMode">): string {
  return provider.callMode;
}

// ---------------------------------------------------------------------------
// 豆包视频 prompt 构建
// ---------------------------------------------------------------------------

export function buildDoubaoVideoPromptWithFlags(input: {
  prompt: string;
  ratio: string;
  resolution: string;
  durationSeconds: number;
}): string {
  const basePrompt = input.prompt.trim();
  const nextLines: string[] = [];
  const hasFlag = (flag: string): boolean => new RegExp(`(?:^|\\s)${flag}\\s+`, "i").test(basePrompt);
  if (!hasFlag("--rs")) {
    nextLines.push(`--rs ${input.resolution}`);
  }
  if (!hasFlag("--rt")) {
    nextLines.push(`--rt ${input.ratio}`);
  }
  if (!hasFlag("--dur")) {
    nextLines.push(`--dur ${input.durationSeconds}`);
  }
  if (!hasFlag("--fps")) {
    nextLines.push("--fps 24");
  }
  if (!hasFlag("--wm")) {
    nextLines.push("--wm 1");
  }
  if (!hasFlag("--cf")) {
    nextLines.push("--cf 0.5");
  }
  return nextLines.length > 0 ? `${basePrompt}\n${nextLines.join(" ")}` : basePrompt;
}

// ---------------------------------------------------------------------------
// 提供商错误消息提取
// ---------------------------------------------------------------------------

/** 从提供商响应中提取错误消息 */
export function extractProviderErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const root = data as Record<string, unknown>;
  const firstObject = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const scopes = [root, firstObject(root.error), firstObject(root.data), firstObject(root.result)].filter(
    (item): item is Record<string, unknown> => Boolean(item),
  );
  for (const scope of scopes) {
    const codeRaw = scope.code ?? scope.error_code ?? scope.errorCode ?? scope.status;
    const messageRaw =
      scope.message ??
      scope.msg ??
      scope.detail ??
      scope.error_message ??
      scope.errorMessage ??
      (typeof scope.error === "string" ? scope.error : null);
    const message = typeof messageRaw === "string" ? messageRaw.trim() : "";
    const codeText = typeof codeRaw === "string" || typeof codeRaw === "number" ? String(codeRaw).trim() : "";

    // 跳过成功状态
    const normalizedCode = codeText.toLowerCase();
    if (["0", "200", "ok", "success", "succeeded", "true"].includes(normalizedCode)) {
      continue;
    }
    const normalizedMessage = message.toLowerCase();
    if (normalizedMessage === "ok" || normalizedMessage === "success" || normalizedMessage === "succeeded") {
      continue;
    }

    // 有明确错误码但无消息文本：返回错误码（例如可灵 code:1200 message:""）
    if (message.length < 1) {
      if (codeText.length > 0 && !["0", "200", "ok", "success", "succeeded", "true"].includes(normalizedCode)) {
        return `code=${codeText}`;
      }
      continue;
    }

    if (codeText.length < 1) {
      return message;
    }

    return `${codeText}: ${message}`;
  }
  return null;
}

/** 判断提供商消息是否表示失败 */
export function shouldTreatProviderMessageAsFailure(message: string | null): boolean {
  if (!message) {
    return false;
  }
  const normalized = message.trim().toLowerCase();
  if (normalized.length < 1) {
    return false;
  }
  if (["ok", "success", "succeeded", "completed", "done"].includes(normalized)) {
    return false;
  }
  return /(error|fail|invalid|forbidden|unauthorized|timeout|expired|insufficient|missing|exception|denied|not\s+allowed|not\s+found|gift_credit|rate.?limit|quota|blocked|reject)/i.test(
    normalized,
  );
}

/** 判断视频提供商失败是否应视为过载 */
export function shouldTreatVideoProviderFailureAsOverload(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("负载已饱和") ||
    normalized.includes("upstream overload") ||
    normalized.includes("overloaded") ||
    normalized.includes("try again later")
  );
}

// ---------------------------------------------------------------------------
// 图片 URL 辅助
// ---------------------------------------------------------------------------

/** 判断是否为 data:image 的内联 URL */
function isDataImageUrl(value: string): boolean {
  return /^data:image\/[a-z+]+;base64,/i.test(value);
}

/** 判断是否为 HTTP(S) URL */
function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** 归一化视频参考图片 URL（支持 data:image 内联格式，拒绝视频 URL） */
export function normalizeVideoReferenceImageUrl(value: unknown): string | null {
  const safeUrl = sanitizeUrlField(value);
  if (safeUrl) {
    // 拒绝包含视频扩展名的 URL
    if (/\.(mp4|webm|mov|avi|mkv|m4v)(\?|$)/i.test(safeUrl)) {
      return null;
    }
    return safeUrl;
  }
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }
  // 拒绝视频 URL 扩展名
  if (/\.(mp4|webm|mov|avi|mkv|m4v)(\?|$)/i.test(raw)) {
    return null;
  }
  if (!isDataImageUrl(raw)) {
    return null;
  }
  if (raw.length > 2_000_000) {
    return null;
  }
  return raw;
}

/** 从 URL 中解析对象存储图片的本地文件路径 */
function resolveObjectStorageImageFilePathFromUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }
  const objectStoragePublicBase = normalizeObjectStoragePublicBase();
  let pathname = trimmed;
  if (isHttpUrl(trimmed)) {
    try {
      pathname = new URL(trimmed).pathname;
    } catch {
      return null;
    }
  }
  if (!pathname.startsWith(`${objectStoragePublicBase}/`)) {
    return null;
  }
  const relativePath = pathname.slice(objectStoragePublicBase.length + 1);
  if (!relativePath) {
    return null;
  }
  const runtime = resolveRuntimeConfig(process.env);
  const objectStorageLocalRoot = resolveObjectStorageLocalRoot(runtime.objectStorage.localDir ?? undefined);
  const absolutePath = resolve(join(objectStorageLocalRoot, relativePath));
  if (!absolutePath.startsWith(objectStorageLocalRoot)) {
    return null;
  }
  return absolutePath;
}

/** 将 mimeType + base64 data 转为内联 data URL */
function toInlineImageDataUrl(payload: { mimeType: string; data: string }): string {
  return `data:${payload.mimeType};base64,${payload.data}`;
}

/**
 * 为豆包/VEO协议解析视频参考图片 URL
 * 支持 data-url，优先将本地对象存储引用转为 data-url
 */
export async function resolveVideoReferenceImageUrlForDoubao(
  imageUrl: string | null,
  timeoutMs: number,
): Promise<string | null> {
  const trimmed = String(imageUrl ?? "").trim();
  if (!trimmed) {
    return null;
  }
  if (isDataImageUrl(trimmed)) {
    return trimmed;
  }

  // 豆包/VEO img2video 接受 data-url 可靠；优先转换本地对象存储引用
  const objectStorageImageFilePath = resolveObjectStorageImageFilePathFromUrl(trimmed);
  if (objectStorageImageFilePath) {
    try {
      return toInlineImageDataUrl(await readLocalImageInlineData(objectStorageImageFilePath));
    } catch (error) {
      log.warn({ err: error }, "本地图片读取失败，回退到原始 URL");
    }
  }

  if (!isHttpUrl(trimmed)) {
    const serverRelativeUrl = resolveServerRelativeImageUrl(trimmed);
    if (serverRelativeUrl) {
      try {
        return toInlineImageDataUrl(await fetchImageInlineData(serverRelativeUrl, timeoutMs));
      } catch (error) {
        log.warn({ err: error }, "服务端相对路径图片转换失败");
      }
    }
  } else {
    try {
      return toInlineImageDataUrl(await fetchImageInlineData(trimmed, timeoutMs));
    } catch (error) {
      log.warn({ err: error }, "远程图片获取失败，回退");
    }
  }

  return trimmed;
}

// ---------------------------------------------------------------------------
// 延迟配置（向后兼容导出，内部使用 video-config.ts）
// ---------------------------------------------------------------------------

/** 解析视频提供商过载重试延迟（ms）- 已迁移到 video-config.ts */
export function resolveVideoProviderOverloadRetryDelayMs(): number {
  return getVideoRetryConfig().overloadRetryDelayMs;
}

/** 解析视频任务 pending 重试延迟（ms）- 已迁移到 video-config.ts */
export function resolveVideoProviderPendingRetryDelayMs(): number {
  return getVideoRetryConfig().pendingRetryDelayMs;
}

// ---------------------------------------------------------------------------
// 可灵官方 JWT 认证
// ---------------------------------------------------------------------------

/**
 * 生成可灵官方 API 的 JWT Token
 * 可灵官方 API 使用 JWT 认证（AccessKey + SecretKey 签名）
 * 文档：https://klingai.com/document-api/apiReference/model/OmniVideo
 */
function generateKlingJWT(accessKey: string, secretKey: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: accessKey,
    iat: now,
    exp: now + 24 * 60 * 60,  // 24 小时有效
    nbf: now - 60,             // 提前 60 秒生效
  })).toString("base64url");

  const signingInput = header + "." + payload;
  const signature = crypto.createHmac("sha256", secretKey).update(signingInput).digest("base64url");
  return signingInput + "." + signature;
}

import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// 需要从 node:path 导入
// ---------------------------------------------------------------------------

import { resolve, join } from "node:path";

// ---------------------------------------------------------------------------
// VEO 时长补充建议生成
// ---------------------------------------------------------------------------

/**
 * 为 VEO 模型生成时长补充建议
 *
 * VEO 固定生成 8 秒视频，当脚本时长不足 8 秒时，需要补充内容填满时长。
 * 补充策略根据时长差距动态调整：
 * - < 1 秒差距：保持当前动作/情绪的自然延展
 * - 1-2 秒差距：增加动作细节（如"缓缓转身"、"整理衣领"）
 * - 3-4 秒差距：增加镜头变化 + 动作延展
 * - 5+ 秒差距：增加情绪延展 + 镜头变化 + 动作细节
 *
 * 注意：补充建议是通用的，无法根据原 prompt 内容智能适配，
 * 实际效果可能因场景不同而有差异。
 *
 * @param scriptDuration 脚本原始时长（秒）
 * @param fixedDuration VEO 固定时长（秒），默认为 8
 * @returns 补充建议文本，追加到 prompt 后面；时长充足时返回 null
 */
function buildVeoDurationExtensionHint(
  scriptDuration: number,
  fixedDuration: number = 8,
): string | null {
  // 时长充足，无需补充
  if (scriptDuration >= fixedDuration) {
    return null;
  }

  const gapSeconds = fixedDuration - scriptDuration;

  // 动作补充建议库（适用于 1-2 秒差距）
  const actionExtensions = [
    "缓缓转身回望",
    "轻轻整理衣领",
    "低头沉思片刻",
    "手指轻触周围物体",
    "微微点头确认",
    "嘴角浮现微笑",
    "深呼吸放松",
    "眼神流转观察四周",
  ];

  // 镜头变化建议库（适用于 3-4 秒差距）
  const cameraExtensions = [
    "镜头缓慢推进特写",
    "焦点从背景转向主体",
    "镜头微微上移展示全景",
    "光影渐变呈现氛围",
    "视角轻微切换呈现侧面",
  ];

  // 情绪延展建议库（适用于 5+ 秒差距）
  const emotionExtensions = [
    "情绪由平静渐转为满足",
    "表情从专注过渡到释然",
    "眼神逐渐柔和充满温情",
    "姿态从紧张转变为放松",
    "氛围从静谧过渡到温馨",
  ];

  const selectedHints: string[] = [];

  // 根据时长差距选择补充策略
  if (gapSeconds >= 5) {
    // 大时长差距：情绪 + 镜头 + 动作（选择前 2 个避免过多内容）
    selectedHints.push(
      emotionExtensions[0],  // 固定选择第一个，避免随机导致不确定性
      cameraExtensions[0],
      actionExtensions[0],
    );
  } else if (gapSeconds >= 3) {
    // 中时长差距：镜头 + 动作
    selectedHints.push(
      cameraExtensions[0],
      actionExtensions[0],
    );
  } else if (gapSeconds >= 1) {
    // 小时长差距：动作细节
    selectedHints.push(actionExtensions[0]);
  } else if (gapSeconds >= 0.5) {
    // 极小时长差距（0.5-1 秒）：保持当前动作的自然延展
    selectedHints.push("保持当前动作的自然延展");
  }

  if (selectedHints.length === 0) {
    // gapSeconds < 0.5 秒，差异极小，无需补充
    return null;
  }

  // 构建补充提示文本
  const hintText = `【时长补充】VEO 固定生成 ${fixedDuration} 秒视频，脚本时长 ${scriptDuration} 秒，需补充 ${gapSeconds.toFixed(1)} 秒内容。请自然延展以下动作或镜头变化，保持情绪连贯：
${selectedHints.join("；")}

注意：补充内容需与原脚本动作和情绪自然衔接，避免突兀或违和感。`;

  return hintText;
}

// ---------------------------------------------------------------------------
// 主函数：视频生成请求
// ---------------------------------------------------------------------------

/** 请求视频生成返回的审计信息 */
export interface VideoRequestAuditInfo {
  actualEndpoint: string;
  requestBodySummary: Record<string, unknown>;
  /** 实际发送给视频 API 的完整提示词（含角色说明前缀、协议标志等） */
  effectivePrompt: string;
  /** 请求头信息（排除 Authorization） */
  requestHeadersJson: string;
  /** 实际请求体内容（不含 base64 图片数据） */
  requestBodyJson: string;
}

/**
 * 请求视频生成 URL（统一入口）
 *
 * 支持五种协议：VEO、豆包、可灵、万相、即梦（基于 callMode 路由）
 * 流程：创建任务 -> 轮询查询 -> 返回视频 URL
 * 只使用第一个候选，失败直接报错
 *
 * @param provider 提供商配置
 * @param prompt 提示词
 * @param options 可选参数（imageUrl, taskId）
 * @returns 视频 URL（或包含审计信息的对象）
 */
export async function requestVideoUrl(
  provider: ResolvedRouteProvider,
  prompt: string,
  options?: {
    imageUrl?: string | null;
    taskId?: string | null;
    referenceImages?: string[];
    /** 是否返回审计信息（用于 LLM 调用记录） */
    returnAuditInfo?: boolean;
    /** 分镜时长（秒），优先级高于全局配置 */
    duration?: number;
  },
): Promise<string | { videoUrl: string; taskId?: string; auditInfo: VideoRequestAuditInfo }> {
  log.debug({ providerId: provider.id, model: provider.model, baseUrl: provider.baseUrl }, 'requestVideoUrl 开始');

  // 解析模型候选
  const modelCandidates = parseModelCandidates(provider.model);
  const modelConfig = getVideoModelConfig();
  const candidates = modelCandidates.length > 0 ? modelCandidates : modelConfig.candidates;
  const model = candidates[0] ?? "jimeng-video-3.0";

  // 基于 callMode 枚举值路由协议
  const callMode = resolveVideoCallMode(provider);
  const useVeoProtocol = callMode === ProviderCallMode.VEO_VIDEO_YUNWU_TONGYI;
  const useVeoOpenaiProtocol = isVeoOpenaiProvider(callMode);
  const useDoubaoVolcProtocol = isDoubaoProvider(callMode);
  const useKlingProtocol = isKlingProvider(callMode);
  const useKlingOfficialProtocol = isKlingOfficialProvider(callMode);
  const useWanxDashScopeProtocol = callMode === ProviderCallMode.WANX_VIDEO_BAILIAN;
  const useHappyHorseProtocol = callMode === ProviderCallMode.HAPPYHORSE_VIDEO_BAILIAN;
  const useGrokProtocol = isGrokProvider(callMode);
  const useGrokImagineProtocol = isGrokImagineProvider(callMode);
  log.debug({ model, callMode, useVeoFamily: useVeoProtocol || useVeoOpenaiProtocol, useDoubao: useDoubaoVolcProtocol, useKling: useKlingProtocol, useKlingOfficial: useKlingOfficialProtocol, useWanx: useWanxDashScopeProtocol, useHappyHorse: useHappyHorseProtocol, useGrok: useGrokProtocol || useGrokImagineProtocol }, '协议路由');

  // 认证头
  // 可灵官方协议：使用 JWT 认证（AccessKey + SecretKey 签名）
  let auth: string;
  log.debug({ useKlingOfficialProtocol, accessKey: provider.accessKey ? provider.accessKey.substring(0, 4) + '...' : null }, '可灵官方认证检查');
  if (useKlingOfficialProtocol && provider.accessKey) {
    auth = `Bearer ${generateKlingJWT(provider.accessKey, provider.secret)}`;
    log.debug({ tokenStart: auth.substring(0, 30) }, '可灵官方 JWT 认证成功');
  } else {
    const authCandidates = buildAuthHeaderCandidates(provider.secret, provider.vendor, provider.baseUrl);
    auth = authCandidates[0] ?? `Bearer ${provider.secret}`;
  }
  const apiKey = auth.replace(/^Bearer\s+/i, "").trim();
  log.debug({ apiKeyLength: apiKey.length, apiKeyPrefix: apiKey.substring(0, 15) + '...' }, 'API Key 提取结果');

  // 配置
  const generationConfig = getVideoGenerationConfig();
  const pollingConfig = getVideoPollingConfig();
  // 优先级：分镜传入 duration > 全局配置
  const duration = options?.duration ?? generationConfig.duration;
  const resolution = generationConfig.resolution;
  const queryPollCount = pollingConfig.maxAttempts;
  const queryPollIntervalMs = pollingConfig.intervalMs;
  const queryRequestTimeoutMs = pollingConfig.requestTimeoutMs;
  const imageUrl = normalizeVideoReferenceImageUrl(options?.imageUrl);
  const existingTaskId = String(options?.taskId ?? "").trim();
  // 如果已有 taskId 且查到结果，缓存在这里（wrapResult 定义后再返回）
  let existingVideoUrl: string | null = null;

  // VEO 时长补充：VEO 固定生成 8 秒视频（不接受 duration 参数），当脚本时长不足时通过 prompt 补充内容
  let veoDurationExtensionHint: string | null = null;
  if ((useVeoProtocol || useVeoOpenaiProtocol) && duration < 8) {
    // VEO 固定生成 8 秒，无需通过 API 参数设置时长，通过 prompt 补充建议让 LLM 填满时长
    veoDurationExtensionHint = buildVeoDurationExtensionHint(duration, 8);
    log.info({
      scriptDuration: duration,
      veoFixedDuration: 8,
      gapSeconds: 8 - duration,
      hasExtensionHint: !!veoDurationExtensionHint,
      providerId: provider.id,
      model,
    }, 'VEO 时长补充：脚本时长不足 8 秒，生成补充建议通过 prompt 延展内容填满固定时长');
  }

  const includeApiKeyHeaders = !useDoubaoVolcProtocol && !(useVeoProtocol || useVeoOpenaiProtocol) && !useKlingProtocol && !useKlingOfficialProtocol && !useWanxDashScopeProtocol && !useHappyHorseProtocol && !useGrokProtocol && !useGrokImagineProtocol;
  const _doubaoPrompt = buildDoubaoVideoPromptWithFlags({
    prompt,
    ratio: "9:16",
    resolution,
    durationSeconds: duration,
  });

  // 根据协议选择创建端点（switch 替代三元嵌套）
  let createEndpoints: string[];
  switch (callMode) {
    case ProviderCallMode.VEO_VIDEO_YUNWU_TONGYI:
      createEndpoints = buildVeoVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    case ProviderCallMode.VEO_VIDEO_YUNWU_OPENAI:
      createEndpoints = buildVeoOpenaiVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    case ProviderCallMode.DOUBAO_SEEDANCE_VIDEO_YUNWU:
      createEndpoints = buildDoubaoVolcVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    case ProviderCallMode.KLING_VIDEO_YUNWU:
      createEndpoints = buildKlingMultiImageVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    case ProviderCallMode.KLING_OMNI_VIDEO_YUNWU:
    case ProviderCallMode.KLING_OMNI_VIDEO_DATAEYES:
      createEndpoints = buildKlingVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    case ProviderCallMode.KLING_VIDEO_OFFICIAL:
      createEndpoints = buildKlingOfficialVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    case ProviderCallMode.WANX_VIDEO_BAILIAN:
      createEndpoints = buildWanxVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    case ProviderCallMode.HAPPYHORSE_VIDEO_BAILIAN:
      createEndpoints = buildHappyHorseVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    case ProviderCallMode.GROK_VIDEO_YUNWU:
      createEndpoints = buildGrokVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    case ProviderCallMode.GROK_IMAGINE_VIDEO_YUNWU:
    case ProviderCallMode.GROK_IMAGINE_VIDEO_DATAEYES:
      createEndpoints = buildGrokImagineVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    case ProviderCallMode.GROK_VIDEO_CAIXIANG:
    case ProviderCallMode.GROK_IMAGINE_VIDEO_CAIXIANG:
      createEndpoints = buildGrokCaixiangVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    case ProviderCallMode.VEO_VIDEO_CAIXIANG:
      createEndpoints = buildVeoCaixiangVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    default:
      // 即梦协议作为默认
      createEndpoints = buildJimengVideoEndpointCandidates(provider.baseUrl);
      break;
  }
  const resolvedEndpoint = createEndpoints[0] ?? provider.baseUrl;

  // 验证端点有效性：必须是完整 HTTP(S) URL
  if (!resolvedEndpoint || !/^https?:\/\/\S+/i.test(resolvedEndpoint)) {
    log.error({ resolvedEndpoint, baseUrl: provider.baseUrl, callMode, createEndpoints }, '视频生成端点无效：必须是完整 HTTP(S) URL');
    throw new AppError(500, "INVALID_VIDEO_ENDPOINT", `视频生成端点无效: ${resolvedEndpoint || '(空)'}，请检查 Provider baseUrl 配置`);
  }

  log.debug({ resolvedEndpoint, baseUrl: provider.baseUrl, callMode }, '视频生成端点解析成功');

  // 如果有已存在的 taskId，先查询结果
  if (existingTaskId) {
    log.debug({ taskId: existingTaskId }, '检测到已存在的taskId，先查询结果');
    // 根据协议选择查询端点（switch 替代三元嵌套）
    let existingTaskQueryCandidates: string[];
    switch (callMode) {
      case ProviderCallMode.VEO_VIDEO_YUNWU_TONGYI:
        existingTaskQueryCandidates = buildVeoVideoQueryEndpointCandidates(provider.baseUrl, existingTaskId);
        break;
      case ProviderCallMode.VEO_VIDEO_YUNWU_OPENAI:
        existingTaskQueryCandidates = buildVeoOpenaiVideoQueryEndpointCandidates(provider.baseUrl, existingTaskId);
        break;
      case ProviderCallMode.DOUBAO_SEEDANCE_VIDEO_YUNWU:
        existingTaskQueryCandidates = buildDoubaoVolcVideoQueryEndpointCandidates(provider.baseUrl, existingTaskId);
        break;
      case ProviderCallMode.KLING_VIDEO_YUNWU:
        existingTaskQueryCandidates = buildKlingMultiImageVideoQueryEndpointCandidates(provider.baseUrl, existingTaskId);
        break;
      case ProviderCallMode.KLING_OMNI_VIDEO_YUNWU:
      case ProviderCallMode.KLING_OMNI_VIDEO_DATAEYES:
        existingTaskQueryCandidates = buildKlingVideoQueryEndpointCandidates(provider.baseUrl, existingTaskId);
        break;
      case ProviderCallMode.KLING_VIDEO_OFFICIAL:
        existingTaskQueryCandidates = buildKlingOfficialVideoQueryEndpointCandidates(provider.baseUrl, existingTaskId);
        break;
        existingTaskQueryCandidates = buildWanxVideoQueryEndpointCandidates(provider.baseUrl, existingTaskId);
        break;
      case ProviderCallMode.HAPPYHORSE_VIDEO_BAILIAN:
        existingTaskQueryCandidates = buildHappyHorseVideoQueryEndpointCandidates(provider.baseUrl, existingTaskId);
        break;
      case ProviderCallMode.GROK_VIDEO_YUNWU:
        existingTaskQueryCandidates = buildGrokVideoQueryEndpointCandidates(provider.baseUrl, existingTaskId);
        break;
      case ProviderCallMode.GROK_IMAGINE_VIDEO_YUNWU:
      case ProviderCallMode.GROK_IMAGINE_VIDEO_DATAEYES:
        existingTaskQueryCandidates = buildGrokImagineVideoQueryEndpointCandidates(provider.baseUrl, existingTaskId);
        break;
      case ProviderCallMode.GROK_VIDEO_CAIXIANG:
      case ProviderCallMode.GROK_IMAGINE_VIDEO_CAIXIANG:
        existingTaskQueryCandidates = buildGrokCaixiangVideoQueryEndpointCandidates(provider.baseUrl, existingTaskId);
        break;
      case ProviderCallMode.VEO_VIDEO_CAIXIANG:
        existingTaskQueryCandidates = buildVeoCaixiangVideoQueryEndpointCandidates(provider.baseUrl, existingTaskId);
        break;
      default:
        existingTaskQueryCandidates = buildJimengVideoQueryEndpointCandidates(provider.baseUrl, existingTaskId);
        break;
    }
    const existingQueryResult = await queryVideoResultSingle(
      existingTaskId, auth, model, apiKey, existingTaskQueryCandidates[0] ?? "",
      queryPollCount, queryPollIntervalMs, includeApiKeyHeaders,
      callMode, queryRequestTimeoutMs
    );
    if (existingQueryResult.url) {
      log.info({ url: existingQueryResult.url }, '已存在的任务获取视频URL成功');
      // 缓存结果，等 wrapResult 定义后返回
      existingVideoUrl = existingQueryResult.url;
    } else if (existingQueryResult.pending) {
      throw new AppError(202, "VIDEO_TASK_PENDING", `Task ${existingTaskId} still pending`, { taskId: existingTaskId });
    }
    if (existingQueryResult.error) {
      throw new AppError(502, "VIDEO_PROVIDER_ERROR", existingQueryResult.error);
    }
  }

  // 创建视频任务
  const headers: Record<string, string> = { Authorization: auth };
  if (includeApiKeyHeaders && apiKey) {
    headers["x-api-key"] = apiKey;
    headers["api-key"] = apiKey;
  }
  // 万相 DashScope 必须设置异步 Header（独立设置）
  if (useWanxDashScopeProtocol) {
    headers["X-DashScope-Async"] = "enable";
  }
  // 快乐马 DashScope 必须设置异步 Header（独立设置）
  if (useHappyHorseProtocol) {
    headers["X-DashScope-Async"] = "enable";
  }

  // 解析图片 URL（豆包需要 data URL，云雾 VEO 需要公网 HTTP URL）
  let effectiveImageUrl = imageUrl;
  if (useDoubaoVolcProtocol) {
    effectiveImageUrl = await resolveVideoReferenceImageUrlForDoubao(imageUrl, provider.timeoutMs);
  } else if (useVeoProtocol) {
    // VEO tongyi 协议需要公网可访问的 HTTP URL，不转换为 data URL
    effectiveImageUrl = normalizeVideoReferenceImageUrl(imageUrl);
  } else if (useVeoOpenaiProtocol) {
    // VEO openai 协议需要公网可访问的 HTTP URL，不转换为 data URL
    effectiveImageUrl = normalizeVideoReferenceImageUrl(imageUrl);
  }

  // 解析参考图 URL（豆包需要 data URL，云雾 VEO 需要公网 HTTP URL）
  let effectiveReferenceImages: string[] = [];
  if (options?.referenceImages && options.referenceImages.length > 0) {
    if (useDoubaoVolcProtocol) {
      for (const refUrl of options.referenceImages) {
        // 去掉 URL 中的 hash 片段（浏览器不会发送到服务端）
        const cleanUrl = refUrl.split('#')[0];
        const resolved = await resolveVideoReferenceImageUrlForDoubao(cleanUrl, provider.timeoutMs);
        if (resolved) effectiveReferenceImages.push(resolved);
      }
    } else if (useVeoProtocol) {
      // VEO tongyi 协议需要公网可访问的 HTTP URL
      effectiveReferenceImages = options.referenceImages
        .map(url => url.split('#')[0])
        .filter(Boolean);
    } else if (useVeoOpenaiProtocol) {
      // VEO openai 协议需要公网可访问的 HTTP URL
      effectiveReferenceImages = options.referenceImages
        .map(url => url.split('#')[0])
        .filter(Boolean);
    } else {
      // 其他协议也去掉 hash
      effectiveReferenceImages = options.referenceImages
        .map(url => url.split('#')[0])
        .filter(Boolean);
    }
  }

  // 构建请求体
  let requestBody: BodyInit;
  // 请求体摘要（用于审计记录，不含敏感数据如 base64 图片）
  const requestBodySummary: Record<string, unknown> = { model };

  // 强化 prompt：向大模型明确图片的主次角色
  // 场景图（imageUrl）是主图，决定视频画面内容
  // referenceImages 是辅助参考，仅用于保持角色外观和服装一致性
  let effectivePrompt = prompt;
  if (effectiveReferenceImages.length > 0) {
    effectivePrompt = `【图片角色说明】
- 主图（场景图）：决定视频画面内容，请以此图为基础生成视频
- 辅助参考图（${effectiveReferenceImages.length}张）：仅用于保持角色外观和服装一致性，不主导画面内容

${prompt}`;
    requestBodySummary.imageRoleHint = "scene=main, references=auxiliary";
  }

  // VEO 时长补充：将补充建议追加到 prompt
  if (veoDurationExtensionHint) {
    effectivePrompt = `${effectivePrompt}\n\n${veoDurationExtensionHint}`;
    requestBodySummary.veoDurationExtension = {
      scriptDuration: duration,
      targetDuration: 8,
      gapSeconds: 8 - duration,
    };
  }

  // 根据协议构建请求体（switch 替代 else if）
  switch (callMode) {
    case ProviderCallMode.VEO_VIDEO_YUNWU_TONGYI: {
      // VEO tongyi 协议：统一格式端点 /v1/video/create，JSON + URL 传图
      // 注意：VEO 固定生成 8 秒视频，不接受 duration_seconds 参数
      headers["Content-Type"] = "application/json";
      headers["Accept"] = "application/json";
      const veoRequest: Record<string, unknown> = {
        model,
        prompt: effectivePrompt,
        aspect_ratio: "9:16",
        enhance_prompt: true,
      };
      const allImages = [effectiveImageUrl, ...effectiveReferenceImages].filter(Boolean);
      if (allImages.length > 0) {
        veoRequest.images = allImages;
        requestBodySummary.imageCount = allImages.length;
      }
      requestBody = JSON.stringify(veoRequest);
      Object.assign(requestBodySummary, { protocol: "veo", promptLength: prompt.length, fixedDuration: 8 });
      break;
    }
    case ProviderCallMode.VEO_VIDEO_YUNWU_OPENAI: {
      // VEO openai 协议：统一格式端点 /v1/video/create，JSON + URL 传图
      // 注意：VEO 固定生成 8 秒视频，不接受 duration_seconds 参数
      headers["Content-Type"] = "application/json";
      headers["Accept"] = "application/json";
      const veoRequest: Record<string, unknown> = {
        model,
        prompt: effectivePrompt,
        aspect_ratio: "9:16",
        enhance_prompt: true,
      };
      // veo3.1-components 最多支持 3 张参考图
      const allImages = [effectiveImageUrl, ...effectiveReferenceImages].filter(Boolean).slice(0, 3);
      if (allImages.length > 0) {
        veoRequest.images = allImages;
        requestBodySummary.imageCount = allImages.length;
      }
      requestBody = JSON.stringify(veoRequest);
      Object.assign(requestBodySummary, { protocol: "veo-openai", promptLength: prompt.length, fixedDuration: 8 });
      break;
    }
    case ProviderCallMode.DOUBAO_SEEDANCE_VIDEO_YUNWU: {
      headers["Content-Type"] = "application/json";
      // 用 effectivePrompt 重建 doubaoPrompt
      const effectiveDoubaoPrompt = buildDoubaoVideoPromptWithFlags({
        prompt: effectivePrompt,
        ratio: "9:16",
        resolution,
        durationSeconds: duration,
      });
      // 云雾 Seedance 1.5 Pro：只支持 first_frame/last_frame role，不支持 reference_image 和多图
      // 主图作为首帧传入，参考图不入 content（该模型不支持多图）
      const content: Array<Record<string, unknown>> = [{ type: "text", text: effectiveDoubaoPrompt }];
      if (effectiveImageUrl) {
        content.push({ type: "image_url", image_url: { url: effectiveImageUrl }, role: "first_frame" });
      }
      requestBody = JSON.stringify({ model, content, ratio: "adaptive", duration, watermark: false });
      log.info({ requestBody: requestBody.substring(0, 500) }, "Seedance 请求体调试");
      Object.assign(requestBodySummary, { protocol: "doubao-volc", contentCount: content.length, promptLength: prompt.length });
      break;
    }
    case ProviderCallMode.KLING_VIDEO_YUNWU: {
      headers["Content-Type"] = "application/json";
      requestBody = buildKlingVideoRequestBody({
        model,
        prompt: effectivePrompt,
        imageUrl: effectiveImageUrl,
        imageUrls: effectiveReferenceImages.length > 0 ? effectiveReferenceImages : undefined,
        duration,
        aspectRatio: "9:16",  // 竖屏
      });
      Object.assign(requestBodySummary, {
        protocol: "kling",
        duration,
        aspectRatio: "9:16",
        imageCount: 1 + effectiveReferenceImages.length,
      });
      break;
    }
    case ProviderCallMode.KLING_OMNI_VIDEO_YUNWU:
    case ProviderCallMode.KLING_OMNI_VIDEO_DATAEYES: {
      headers["Content-Type"] = "application/json";
      // 主图作为首帧，参考图作为风格参考
      const omniImageList: Array<{ image_url: string; type?: string }> = [];
      if (effectiveImageUrl) {
        omniImageList.push({ image_url: effectiveImageUrl, type: "first_frame" });
      }
      for (const refUrl of effectiveReferenceImages) {
        omniImageList.push({ image_url: refUrl });
      }
      requestBody = buildKlingOmniVideoRequestBody({
        modelName: model,
        prompt: effectivePrompt,
        mode: "std",
        duration: String(duration),
        aspectRatio: "9:16",
        imageList: omniImageList.length > 0 ? omniImageList : undefined,
      });
      Object.assign(requestBodySummary, {
        protocol: "kling-omni",
        duration,
        aspectRatio: "9:16",
        imageCount: omniImageList.length,
      });
      break;
    }
    case ProviderCallMode.KLING_VIDEO_OFFICIAL: {
      // 可灵官方协议：JSON 格式（OpenAI 兼容）
      headers["Content-Type"] = "application/json";
      requestBody = buildKlingOfficialVideoRequestBody({
        model,
        prompt: effectivePrompt,
        imageUrl: effectiveImageUrl,
        imageUrls: effectiveReferenceImages.length > 0 ? effectiveReferenceImages : undefined,
        duration,
        aspectRatio: "9:16",
      });
      Object.assign(requestBodySummary, {
        protocol: "kling-official",
        duration,
        aspectRatio: "9:16",
        imageCount: 1 + effectiveReferenceImages.length,
      });
      break;
    }
    case ProviderCallMode.WANX_VIDEO_BAILIAN: {
      // 万相 DashScope 协议：JSON 格式
      headers["Content-Type"] = "application/json";
      requestBody = buildWanxVideoRequestBody({
        model,
        prompt: effectivePrompt,
        imageUrl: effectiveImageUrl,
        referenceImages: effectiveReferenceImages.length > 0 ? effectiveReferenceImages : undefined,
        duration,
        resolution: resolution === "1080p" ? "1080P" : resolution === "540p" ? "480P" : "720P",
        ratio: "9:16",
        promptExtend: true,
      });
      Object.assign(requestBodySummary, {
        protocol: "wanx",
        duration,
        resolution: resolution === "1080p" ? "1080P" : resolution === "540p" ? "480P" : "720P",
        ratio: "9:16",
        referenceImageCount: effectiveReferenceImages.length,
      });
      break;
    }
    case ProviderCallMode.HAPPYHORSE_VIDEO_BAILIAN: {
      // 快乐马 DashScope 协议：JSON 格式（完全独立实现）
      // 快乐马是参考生视频模型，必须有参考图，不支持首帧图
      headers["Content-Type"] = "application/json";
      // 快乐马必须有参考图：合并主场景图和辅助参考图（主场景图放在第一位，最多9张）
      const happyHorseReferenceImages = [
        ...effectiveImageUrl ? [effectiveImageUrl] : [],
        ...effectiveReferenceImages.slice(0, 8)  // 辅助参考图最多8张，确保总数不超过9张
      ].slice(0, 9);
      requestBody = buildHappyHorseVideoRequestBody({
        model,
        prompt: effectivePrompt,
        referenceImages: happyHorseReferenceImages,
        duration,
        resolution: resolution === "1080p" ? "1080P" : "720P",
        ratio: "9:16",
        watermark: false,  // 显式关闭水印
      });
      Object.assign(requestBodySummary, {
        protocol: "happyhorse",
        duration,
        resolution: resolution === "1080p" ? "1080P" : "720P",
        ratio: "9:16",
        referenceImageCount: happyHorseReferenceImages.length,
        hasSceneImage: !!effectiveImageUrl,
      });
      break;
    }
    case ProviderCallMode.GROK_VIDEO_YUNWU: {
      headers["Content-Type"] = "application/json";
      requestBody = buildGrokVideoRequestBody({
        model,
        prompt: effectivePrompt,
        imageUrl: effectiveImageUrl,
        referenceImages: effectiveReferenceImages.length > 0 ? effectiveReferenceImages : undefined,
        aspectRatio: "9:16",
        size: resolution === "1080p" ? "1080P" : "720P",
      });
      Object.assign(requestBodySummary, {
        protocol: "grok",
        aspectRatio: "9:16",
        size: resolution === "1080p" ? "1080P" : "720P",
        imageCount: 1 + effectiveReferenceImages.length,
      });
      break;
    }
    case ProviderCallMode.GROK_IMAGINE_VIDEO_YUNWU: {
      headers["Content-Type"] = "application/json";
      requestBody = buildGrokImagineVideoRequestBody({
        model,
        prompt: effectivePrompt,
        imageUrl: effectiveImageUrl,
        referenceImages: effectiveReferenceImages.length > 0 ? effectiveReferenceImages : undefined,
        aspectRatio: "9:16",
        resolution: resolution === "1080p" ? "720p" : "720p",
        duration,
      });
      Object.assign(requestBodySummary, {
        protocol: "grok-imagine",
        aspectRatio: "9:16",
        resolution: resolution === "1080p" ? "720p" : "720p",
        duration,
        imageCount: (effectiveImageUrl ? 1 : 0) + effectiveReferenceImages.length,
      });
      break;
    }
    case ProviderCallMode.GROK_IMAGINE_VIDEO_DATAEYES: {
      headers["Content-Type"] = "application/json";
      requestBody = buildGrokImagineVideoDataeyesRequestBody({
        model,
        prompt: effectivePrompt,
        imageUrl: effectiveImageUrl,
        referenceImages: effectiveReferenceImages.length > 0 ? effectiveReferenceImages : undefined,
        aspectRatio: "9:16",
        resolution: resolution === "1080p" ? "720p" : "720p",
        duration,
      });
      Object.assign(requestBodySummary, {
        protocol: "grok-imagine-dataeyes",
        aspectRatio: "9:16",
        resolution: resolution === "1080p" ? "720p" : "720p",
        duration,
        imageCount: (effectiveImageUrl ? 1 : 0) + effectiveReferenceImages.length,
      });
      break;
    }
    case ProviderCallMode.GROK_IMAGINE_VIDEO_CAIXIANG: {
      headers["Content-Type"] = "application/json";
      requestBody = buildGrokImagineVideoCaixiangRequestBody({
        model,
        prompt: effectivePrompt,
        imageUrl: effectiveImageUrl,
        referenceImages: effectiveReferenceImages.length > 0 ? effectiveReferenceImages : undefined,
        // 才翔AI Imagine 支持 16:9/9:16/1:1/3:2/2:3，默认用 9:16（竖屏）
        aspectRatio: "9:16",
        resolution: resolution === "1080p" ? "720p" : "720p",
        duration: String(duration),
      });
      Object.assign(requestBodySummary, {
        protocol: "grok-imagine-caixiang",
        aspectRatio: "9:16",
        resolution: resolution === "1080p" ? "720p" : "720p",
        duration,
        imageCount: (effectiveImageUrl ? 1 : 0) + effectiveReferenceImages.length,
      });
      break;
    }
    case ProviderCallMode.GROK_VIDEO_CAIXIANG: {
      headers["Content-Type"] = "application/json";
      requestBody = buildGrokCaixiangVideoRequestBody({
        model,
        prompt: effectivePrompt,
        imageUrl: effectiveImageUrl,
        referenceImages: effectiveReferenceImages.length > 0 ? effectiveReferenceImages : undefined,
        // 才翔AI 只支持 2:3/3:2/1:1，默认用 2:3（竖屏）
        aspectRatio: "9:16",
        size: resolution === "1080p" ? "1080P" : "720P",
        duration: "6",
      });
      Object.assign(requestBodySummary, {
        protocol: "grok-caixiang",
        aspectRatio: "2:3",
        size: resolution === "1080p" ? "1080P" : "720P",
        duration: "6",
        imageCount: 1 + effectiveReferenceImages.length,
      });
      break;
    }
    case ProviderCallMode.VEO_VIDEO_CAIXIANG: {
      headers["Content-Type"] = "application/json";
      requestBody = buildVeoCaixiangVideoRequestBody({
        model,
        prompt: effectivePrompt,
        imageUrl: effectiveImageUrl,
        referenceImages: effectiveReferenceImages.length > 0 ? effectiveReferenceImages : undefined,
        // VEO 才翔AI 支持 9:16/16:9
        aspectRatio: "9:16",
        generationMode: "fast",
        enhancePrompt: true,
        enableUpsample: resolution === "1080p",
      });
      Object.assign(requestBodySummary, {
        protocol: "veo-caixiang",
        aspectRatio: "9:16",
        generationMode: "fast",
        imageCount: effectiveImageUrl ? 1 : 0,
      });
      break;
    }
    default: {
      // 即梦协议：FormData
      const allImageUrls = [effectiveImageUrl, ...effectiveReferenceImages].filter((u): u is string => Boolean(u));
      requestBody = new FormData();
      (requestBody as FormData).append("model", model);
      (requestBody as FormData).append("prompt", effectivePrompt);
      (requestBody as FormData).append("ratio", "9:16");
      (requestBody as FormData).append("resolution", resolution);
      (requestBody as FormData).append("duration", String(duration));
      if (allImageUrls.length > 0) {
        (requestBody as FormData).append("image_url", allImageUrls[0]);
        (requestBody as FormData).append("image_urls", JSON.stringify(allImageUrls));
        (requestBody as FormData).append("mode", "img2video");
      }
      Object.assign(requestBodySummary, {
        protocol: "jimeng",
        duration,
        resolution,
        imageCount: allImageUrls.length,
      });
      break;
    }
  }

  log.debug({ endpoint: resolvedEndpoint, model }, '创建视频任务 POST');

  // 审计信息：捕获请求头和请求体（不含 base64 数据）
  const sanitizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "authorization") {
      sanitizedHeaders[key] = "Bearer ***";
    } else {
      sanitizedHeaders[key] = value;
    }
  }
  const auditRequestHeadersJson = JSON.stringify(sanitizedHeaders);

  // 构建审计用请求体（移除 base64 图片数据，保留结构）
  function buildAuditRequestBody(): Record<string, unknown> {
    if (typeof requestBody === "string") {
      try {
        const parsed = JSON.parse(requestBody) as Record<string, unknown>;
        // 移除数组中的 base64 data URL
        for (const key of Object.keys(parsed)) {
          if (Array.isArray(parsed[key])) {
            parsed[key] = (parsed[key] as unknown[]).map((item) => {
              if (typeof item === "string" && item.startsWith("data:")) {
                return "data:...[truncated]";
              }
              if (item && typeof item === "object" && !Array.isArray(item)) {
                const obj = item as Record<string, unknown>;
                if (obj.image_url && typeof obj.image_url === "object") {
                  const urlObj = obj.image_url as Record<string, unknown>;
                  if (typeof urlObj.url === "string" && urlObj.url.startsWith("data:")) {
                    urlObj.url = "data:...[truncated]";
                  }
                }
              }
              return item;
            });
          }
        }
        return parsed;
      } catch {
        return { raw: typeof requestBody === "string" ? requestBody.slice(0, 2000) : String(requestBody) };
      }
    }
    // FormData: 返回摘要
    if (requestBody instanceof FormData) {
      const summary: Record<string, unknown> = { formData: true };
      for (const [key] of (requestBody as FormData).entries()) {
        summary[key] = "(file/binary)";
      }
      return summary;
    }
    return { raw: "(unknown body type)" };
  }
  const auditRequestBodyJson = JSON.stringify(buildAuditRequestBody());

  // 审计信息包装函数
  const returnAuditInfo = options?.returnAuditInfo ?? false;
  const wrapResult = (videoUrl: string, taskId?: string) => {
    if (returnAuditInfo) {
      return { videoUrl, taskId, auditInfo: { actualEndpoint: resolvedEndpoint, requestBodySummary, effectivePrompt, requestHeadersJson: auditRequestHeadersJson, requestBodyJson: auditRequestBodyJson } };
    }
    return videoUrl;
  };

  // 如果已有 taskId 的查询已返回结果，直接返回（带 taskId）
  if (existingVideoUrl) {
    return wrapResult(existingVideoUrl, existingTaskId);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, provider.timeoutMs));

  // 【可灵官方调试日志】打印完整请求体，排查 code:1200 参数错误
  if (useKlingOfficialProtocol && typeof requestBody === 'string') {
    try {
      const parsedBody = JSON.parse(requestBody);
    } catch {
    }
  }

  try {
    const response = await fetch(resolvedEndpoint, { method: "POST", headers, body: requestBody, signal: controller.signal });
    const rawText = await response.text();
    const data = parseResponsePayload(rawText);
    const responseSummary = compactUnknownText(data, 1200);

    // 调试日志：记录创建响应的完整结构
    log.info({ endpoint: resolvedEndpoint, rawResponse: compactUnknownText(data, 3000) }, '[VEO-Debug] 创建响应原始数据');

    if (!response.ok) {
      throw new AppError(502, "VIDEO_PROVIDER_ERROR", `HTTP ${response.status} ${response.statusText}; endpoint=${resolvedEndpoint}; response=${responseSummary}`);
    }

    const providerMessage = extractProviderErrorMessage(data);
    if (shouldTreatProviderMessageAsFailure(providerMessage)) {
      log.warn({ providerMessage, rawResponse: compactUnknownText(data, 3000) }, '[VEO-Debug] 创建响应被 extractProviderErrorMessage 判定为失败');
      throw new AppError(502, "VIDEO_PROVIDER_ERROR", `${providerMessage}; endpoint=${resolvedEndpoint}`);
    }

    // 使用提取器解析响应
    const extractor = getExtractor(callMode as ProviderCallMode);
    const parsedResponse = extractor.parse(data);
    log.info({ taskId: parsedResponse.taskId, status: parsedResponse.status, videoCount: parsedResponse.videoUrls.length }, '[VEO-Debug] 创建响应提取结果');

    // 提取视频 URL
    if (parsedResponse.videoUrls.length > 0) {
      log.info({ url: parsedResponse.videoUrls[0] }, '直接获取视频URL成功');
      return wrapResult(parsedResponse.videoUrls[0], parsedResponse.taskId ?? undefined);
    }

    // 提取任务 ID
    const taskId = parsedResponse.taskId;
    if (taskId) {
      log.debug({ taskId }, '获取taskId，开始轮询查询结果');
      // 根据协议选择查询端点（switch 替代三元嵌套）
      let queryCandidates: string[];
      switch (callMode) {
        case ProviderCallMode.VEO_VIDEO_YUNWU_TONGYI:
          queryCandidates = buildVeoVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
        case ProviderCallMode.VEO_VIDEO_YUNWU_OPENAI:
          queryCandidates = buildVeoOpenaiVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
        case ProviderCallMode.DOUBAO_SEEDANCE_VIDEO_YUNWU:
          queryCandidates = buildDoubaoVolcVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
        case ProviderCallMode.KLING_VIDEO_YUNWU:
          queryCandidates = buildKlingMultiImageVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
        case ProviderCallMode.KLING_OMNI_VIDEO_YUNWU:
        case ProviderCallMode.KLING_OMNI_VIDEO_DATAEYES:
          queryCandidates = buildKlingVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
        case ProviderCallMode.KLING_VIDEO_OFFICIAL:
          queryCandidates = buildKlingOfficialVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
        case ProviderCallMode.WANX_VIDEO_BAILIAN:
          queryCandidates = buildWanxVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
        case ProviderCallMode.HAPPYHORSE_VIDEO_BAILIAN:
          queryCandidates = buildHappyHorseVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
        case ProviderCallMode.GROK_VIDEO_YUNWU:
          queryCandidates = buildGrokVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
        case ProviderCallMode.GROK_IMAGINE_VIDEO_YUNWU:
        case ProviderCallMode.GROK_IMAGINE_VIDEO_DATAEYES:
          queryCandidates = buildGrokImagineVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
        case ProviderCallMode.GROK_IMAGINE_VIDEO_CAIXIANG:
          queryCandidates = buildGrokCaixiangVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
        default:
          queryCandidates = buildJimengVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
      }

      const queryResult = await queryVideoResultSingle(
        taskId, auth, model, apiKey, queryCandidates[0] ?? "",
        queryPollCount, queryPollIntervalMs, includeApiKeyHeaders,
        callMode, queryRequestTimeoutMs
      );
      if (queryResult.url) {
        log.info({ url: queryResult.url }, '轮询获取视频URL成功');
        return wrapResult(queryResult.url, taskId);
      }
      if (queryResult.pending) {
        throw new AppError(202, "VIDEO_TASK_PENDING", `Task ${taskId} still pending`, { taskId });
      }
      throw new AppError(502, "VIDEO_PROVIDER_ERROR", queryResult.error ?? "Query failed");
    }

    throw new AppError(502, "VIDEO_PROVIDER_ERROR", providerMessage ?? `EMPTY_VIDEO_RESULT; endpoint=${resolvedEndpoint}; response=${responseSummary}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 向后兼容别名
 * @deprecated 使用 requestVideoUrl 代替
 */
export const requestJimengVideoUrl = requestVideoUrl;

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/** 解析响应 payload */
function parseResponsePayload(rawText: string): unknown {
  if (rawText.trim().length < 1) return {};
  try {
    return JSON.parse(rawText);
  } catch {
    return { raw: rawText };
  }
}

/** 查询单个端点的视频结果（带轮询） */
async function queryVideoResultSingle(
  _taskId: string,
  auth: string,
  _model: string,
  apiKey: string,
  queryEndpoint: string,
  maxPollCount: number,
  pollIntervalMs: number,
  includeApiKeyHeaders: boolean,
  callMode: string,
  requestTimeoutMs: number,
): Promise<{ url: string | null; pending: boolean; error?: string }> {
  if (!queryEndpoint) return { url: null, pending: false, error: "No query endpoint" };

  // 获取提取器
  const extractor = getExtractor(callMode as ProviderCallMode);

  for (let round = 0; round < maxPollCount; round += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const headers: Record<string, string> = { Authorization: auth };
      if (includeApiKeyHeaders && apiKey) {
        headers["x-api-key"] = apiKey;
        headers["api-key"] = apiKey;
      }

      const response = await fetch(queryEndpoint, { method: "GET", headers, signal: controller.signal });
      const rawText = await response.text();

      if (rawText.trim().startsWith("<!DOCTYPE") || rawText.trim().startsWith("<html")) {
        continue;
      }

      const data = parseResponsePayload(rawText);

      if (!response.ok) {
        continue;
      }

      const providerMessage = extractProviderErrorMessage(data);
      if (shouldTreatProviderMessageAsFailure(providerMessage)) {
        return { url: null, pending: false, error: providerMessage ?? undefined };
      }

      // 使用提取器解析响应
      const parsed = extractor.parse(data);

      // 有视频 URL 则返回
      if (parsed.videoUrls.length > 0) {
        return { url: parsed.videoUrls[0], pending: false };
      }

      // 检查状态
      if (parsed.status === "failed") {
        return { url: null, pending: false, error: parsed.error?.message ?? "VIDEO_TASK_FAILED" };
      }

      if (parsed.status === "succeeded") {
        // 任务完成但没有 URL
        return { url: null, pending: false, error: "VIDEO_TASK_COMPLETED_WITHOUT_URL" };
      }

      // pending 或 processing 状态继续轮询
    } catch (error) {
      // 继续轮询
    } finally {
      clearTimeout(timer);
    }

    if (round < maxPollCount - 1) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  return { url: null, pending: true, error: `Poll timeout after ${maxPollCount} rounds` };
}

// ---------------------------------------------------------------------------
// 异步模式：创建任务和查询单次（不轮询）
// ---------------------------------------------------------------------------

/**
 * 创建视频任务（不轮询）
 * 只负责调用提供商创建任务，返回 taskId 或直接返回的 videoUrl
 *
 * @param provider 提供商配置
 * @param prompt 视频提示词
 * @param options 可选参数：图片URL、参考图等
 * @returns taskId（异步模式）或 videoUrl（同步模式）
 */
export async function createVideoTask(
  provider: ResolvedRouteProvider,
  prompt: string,
  options?: {
    imageUrl?: string | null;
    referenceImages?: string[];
    /** 服饰平铺图（正面+背面），VEO 重点保留 logo/图案/纹理 */
    garmentImages?: string[];
    /** 角色参考图（五视图），用于保持角色外观一致性 */
    characterImages?: string[];
    /** 分镜时长（秒），优先级高于全局配置 */
    duration?: number;
    /** 是否生成音频，"on" | "off"，仅 Kling V2.6+ 模型支持 */
    sound?: string;
  },
): Promise<{
  taskId: string | null;
  videoUrl: string | null;
  /** 查询任务状态的 URL（仅 taskId 模式返回） */
  queryUrl: string | null;
  /** 调用模式 */
  callMode: string;
  auditInfo?: VideoRequestAuditInfo;
}> {
  log.debug({ providerId: provider.id, model: provider.model, baseUrl: provider.baseUrl }, 'createVideoTask 开始');

  // 解析模型候选
  const modelCandidates = parseModelCandidates(provider.model);
  const modelConfig = getVideoModelConfig();
  const candidates = modelCandidates.length > 0 ? modelCandidates : modelConfig.candidates;
  const model = candidates[0] ?? "jimeng-video-3.0";

  // 基于 callMode 枚举值路由协议
  const callMode = resolveVideoCallMode(provider);
  const useVeoProtocol = callMode === ProviderCallMode.VEO_VIDEO_YUNWU_TONGYI;
  const useVeoOpenaiProtocol = isVeoOpenaiProvider(callMode);
  const useDoubaoVolcProtocol = isDoubaoProvider(callMode);
  const useKlingProtocol = isKlingProvider(callMode);
  const useKlingOfficialProtocol = isKlingOfficialProvider(callMode);
  const useWanxDashScopeProtocol = callMode === ProviderCallMode.WANX_VIDEO_BAILIAN;
  const useHappyHorseProtocol = callMode === ProviderCallMode.HAPPYHORSE_VIDEO_BAILIAN;
  const useGrokProtocol = isGrokProvider(callMode);
  const useGrokImagineProtocol = isGrokImagineProvider(callMode);

  // 认证头
  let auth: string;
  if (useKlingOfficialProtocol && provider.accessKey) {
    auth = `Bearer ${generateKlingJWT(provider.accessKey, provider.secret)}`;
  } else {
    const authCandidates = buildAuthHeaderCandidates(provider.secret, provider.vendor, provider.baseUrl);
    auth = authCandidates[0] ?? `Bearer ${provider.secret}`;
  }
  const apiKey = auth.replace(/^Bearer\s+/i, "").trim();

  // 配置
  const generationConfig = getVideoGenerationConfig();
  // 优先级：分镜传入 duration > 全局配置
  const duration = options?.duration ?? generationConfig.duration;
  const resolution = generationConfig.resolution;
  const imageUrl = normalizeVideoReferenceImageUrl(options?.imageUrl);

  // VEO 时长补充：VEO 固定生成 8 秒视频（不接受 duration 参数），当脚本时长不足时通过 prompt 补充内容
  let veoDurationExtensionHint: string | null = null;
  if ((useVeoProtocol || useVeoOpenaiProtocol) && duration < 8) {
    // VEO 固定生成 8 秒，无需通过 API 参数设置时长，通过 prompt 补充建议让 LLM 填满时长
    veoDurationExtensionHint = buildVeoDurationExtensionHint(duration, 8);
    log.info({
      scriptDuration: duration,
      veoFixedDuration: 8,
      gapSeconds: 8 - duration,
      hasExtensionHint: !!veoDurationExtensionHint,
      providerId: provider.id,
      model,
    }, 'VEO 时长补充：脚本时长不足 8 秒，生成补充建议通过 prompt 延展内容填满固定时长');
  }

  const includeApiKeyHeaders = !useDoubaoVolcProtocol && !(useVeoProtocol || useVeoOpenaiProtocol) && !useKlingProtocol && !useKlingOfficialProtocol && !useWanxDashScopeProtocol && !useHappyHorseProtocol && !useGrokProtocol && !useGrokImagineProtocol;
  const _doubaoPrompt = buildDoubaoVideoPromptWithFlags({
    prompt,
    ratio: "9:16",
    resolution,
    durationSeconds: duration,
  });

  // 根据协议选择创建端点（switch 替代三元嵌套）
  let createEndpoints: string[];
  switch (callMode) {
    case ProviderCallMode.VEO_VIDEO_YUNWU_TONGYI:
      createEndpoints = buildVeoVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    case ProviderCallMode.VEO_VIDEO_YUNWU_OPENAI:
      createEndpoints = buildVeoOpenaiVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    case ProviderCallMode.DOUBAO_SEEDANCE_VIDEO_YUNWU:
      createEndpoints = buildDoubaoVolcVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    case ProviderCallMode.KLING_VIDEO_YUNWU:
      createEndpoints = buildKlingMultiImageVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    case ProviderCallMode.KLING_OMNI_VIDEO_YUNWU:
    case ProviderCallMode.KLING_OMNI_VIDEO_DATAEYES:
      createEndpoints = buildKlingVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    case ProviderCallMode.KLING_VIDEO_OFFICIAL:
      createEndpoints = buildKlingOfficialVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    case ProviderCallMode.WANX_VIDEO_BAILIAN:
      createEndpoints = buildWanxVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    case ProviderCallMode.HAPPYHORSE_VIDEO_BAILIAN:
      createEndpoints = buildHappyHorseVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    case ProviderCallMode.GROK_VIDEO_YUNWU:
      createEndpoints = buildGrokVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    case ProviderCallMode.GROK_IMAGINE_VIDEO_YUNWU:
    case ProviderCallMode.GROK_IMAGINE_VIDEO_DATAEYES:
      createEndpoints = buildGrokImagineVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    case ProviderCallMode.GROK_VIDEO_CAIXIANG:
    case ProviderCallMode.GROK_IMAGINE_VIDEO_CAIXIANG:
      createEndpoints = buildGrokCaixiangVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    case ProviderCallMode.VEO_VIDEO_CAIXIANG:
      createEndpoints = buildVeoCaixiangVideoCreateEndpointCandidates(provider.baseUrl);
      break;
    default:
      createEndpoints = buildJimengVideoEndpointCandidates(provider.baseUrl);
      break;
  }
  const resolvedEndpoint = createEndpoints[0] ?? provider.baseUrl;

  // 构建请求头
  const headers: Record<string, string> = { Authorization: auth };
  if (includeApiKeyHeaders && apiKey) {
    headers["x-api-key"] = apiKey;
    headers["api-key"] = apiKey;
  }
  // 万相 DashScope 异步 Header（独立设置）
  if (useWanxDashScopeProtocol) {
    headers["X-DashScope-Async"] = "enable";
  }
  // 快乐马 DashScope 异步 Header（独立设置）
  if (useHappyHorseProtocol) {
    headers["X-DashScope-Async"] = "enable";
  }

  // 解析图片 URL（豆包需要 data URL，云雾 VEO 需要公网 HTTP URL）
  let effectiveImageUrl = imageUrl;
  if (useDoubaoVolcProtocol) {
    effectiveImageUrl = await resolveVideoReferenceImageUrlForDoubao(imageUrl, provider.timeoutMs);
  } else if (useVeoProtocol) {
    // VEO tongyi 协议需要公网可访问的 HTTP URL，不转换为 data URL
    effectiveImageUrl = normalizeVideoReferenceImageUrl(imageUrl);
  } else if (useVeoOpenaiProtocol) {
    // VEO openai 协议需要公网可访问的 HTTP URL，不转换为 data URL
    effectiveImageUrl = normalizeVideoReferenceImageUrl(imageUrl);
  }

  // 解析参考图 URL
  let effectiveReferenceImages: string[] = [];
  if (options?.referenceImages && options.referenceImages.length > 0) {
    if (useDoubaoVolcProtocol) {
      // 豆包需要 data URL 格式
      for (const refUrl of options.referenceImages) {
        const cleanUrl = refUrl.split('#')[0];
        const resolved = await resolveVideoReferenceImageUrlForDoubao(cleanUrl, provider.timeoutMs);
        if (resolved) effectiveReferenceImages.push(resolved);
      }
    } else {
      // VEO/可灵/即梦等：保留原始 HTTP URL
      effectiveReferenceImages = options.referenceImages
        .map(url => url.split('#')[0])
        .filter(Boolean);
    }
  }

  // 审计信息变量（在 try 外声明，确保 catch 中可访问）
  let auditRequestHeadersJson: string | undefined;
  let auditRequestBodyJson: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  // 构建请求体（可能抛出验证错误）到 fetch 响应处理，统一用 try/catch 覆盖
  // 确保 catch 中能携带 endpoint/headers/body 等审计信息
  try {
  // 构建请求体
  let requestBody: BodyInit;
  const requestBodySummary: Record<string, unknown> = { model };

  // 强化 prompt：明确引用分离的参考图，区分平铺图和角色图
  let effectivePrompt = prompt;
  if (effectiveReferenceImages.length > 0) {
    const garmentCount = options?.garmentImages?.length ?? 0;
    const characterCount = options?.characterImages?.length ?? 0;

    const referenceDescriptions: string[] = [];
    if (imageUrl) {
      referenceDescriptions.push(`- 首帧图（分镜预览图）：决定视频画面内容和场景，请以此图为基础生成视频动作`);
    }
    if (garmentCount > 0) {
      referenceDescriptions.push(`- 服饰平铺图（${garmentCount}张）：包含服饰正面和背面平铺展示，重点保留其中的 logo、品牌标识、图案印花、缝线纹理等精确细节`);
    }
    if (characterCount > 0) {
      referenceDescriptions.push(`- 角色参考图（${characterCount}张）：用于保持角色面部、发型、体型等外观一致性，不主导画面内容`);
    }
    // 没有分类信息时，回退到笼统描述
    if (garmentCount === 0 && characterCount === 0) {
      effectiveReferenceImages.forEach((_url, index) => {
        const imageNum = index + 1;
        referenceDescriptions.push(`- 图${imageNum}：角色/服饰参考图，用于保持人物造型和服装细节的一致性`);
      });
    }

    effectivePrompt = `【图片参考说明】
${referenceDescriptions.join('\n')}

${prompt}`;
    requestBodySummary.imageRoleHint = `first_frame=scene, garment=${garmentCount}, character=${characterCount}`;
  }

  // VEO 时长补充：将补充建议追加到 prompt
  if (veoDurationExtensionHint) {
    effectivePrompt = `${effectivePrompt}\n\n${veoDurationExtensionHint}`;
    requestBodySummary.veoDurationExtension = {
      scriptDuration: duration,
      targetDuration: 8,
      gapSeconds: 8 - duration,
    };
  }

  // 根据协议构建请求体（switch 替代 else if）
  switch (callMode) {
    case ProviderCallMode.VEO_VIDEO_YUNWU_TONGYI: {
      // VEO tongyi 协议：统一格式端点 /v1/video/create，JSON + URL 传图
      // 注意：VEO 固定生成 8 秒视频，不接受 duration_seconds 参数
      headers["Content-Type"] = "application/json";
      headers["Accept"] = "application/json";
      const veoRequest: Record<string, unknown> = {
        model,
        prompt: effectivePrompt,
        aspect_ratio: "9:16",
        enhance_prompt: true,
      };
      const allImages = [effectiveImageUrl, ...effectiveReferenceImages].filter(Boolean);
      if (allImages.length > 0) {
        veoRequest.images = allImages;
        requestBodySummary.imageCount = allImages.length;
      }
      requestBody = JSON.stringify(veoRequest);
      Object.assign(requestBodySummary, { protocol: "veo", promptLength: prompt.length, fixedDuration: 8 });
      break;
    }
    case ProviderCallMode.VEO_VIDEO_YUNWU_OPENAI: {
      // VEO openai 协议：统一格式端点 /v1/video/create，JSON + URL 传图
      // 注意：VEO 固定生成 8 秒视频，不接受 duration_seconds 参数
      headers["Content-Type"] = "application/json";
      headers["Accept"] = "application/json";
      const veoRequest: Record<string, unknown> = {
        model,
        prompt: effectivePrompt,
        aspect_ratio: "9:16",
        enhance_prompt: true,
      };
      // veo3.1-components 最多支持 3 张参考图
      const allImages = [effectiveImageUrl, ...effectiveReferenceImages].filter(Boolean).slice(0, 3);
      if (allImages.length > 0) {
        veoRequest.images = allImages;
        requestBodySummary.imageCount = allImages.length;
      }
      requestBody = JSON.stringify(veoRequest);
      Object.assign(requestBodySummary, { protocol: "veo-openai", promptLength: prompt.length, fixedDuration: 8 });
      break;
    }
    case ProviderCallMode.DOUBAO_SEEDANCE_VIDEO_YUNWU: {
      headers["Content-Type"] = "application/json";
      const effectiveDoubaoPrompt = buildDoubaoVideoPromptWithFlags({
        prompt: effectivePrompt,
        ratio: "9:16",
        resolution,
        durationSeconds: duration,
      });
      // 云雾 Seedance 1.5 Pro：只支持 first_frame/last_frame role，不支持 reference_image 和多图
      // 主图作为首帧传入，参考图不入 content（该模型不支持多图）
      const content: Array<Record<string, unknown>> = [{ type: "text", text: effectiveDoubaoPrompt }];
      if (effectiveImageUrl) {
        content.push({ type: "image_url", image_url: { url: effectiveImageUrl }, role: "first_frame" });
      }
      requestBody = JSON.stringify({ model, content, ratio: "adaptive", duration, watermark: false });
      Object.assign(requestBodySummary, { protocol: "doubao-volc", contentCount: content.length, promptLength: prompt.length });
      break;
    }
    case ProviderCallMode.KLING_VIDEO_YUNWU: {
      headers["Content-Type"] = "application/json";
      requestBody = buildKlingVideoRequestBody({
        model,
        prompt: effectivePrompt,
        imageUrl: effectiveImageUrl,
        imageUrls: effectiveReferenceImages.length > 0 ? effectiveReferenceImages : undefined,
        duration,
        aspectRatio: "9:16",
        sound: options?.sound,
      });
      Object.assign(requestBodySummary, {
        protocol: "kling",
        duration,
        aspectRatio: "9:16",
        imageCount: 1 + effectiveReferenceImages.length,
      });
      break;
    }
    case ProviderCallMode.KLING_OMNI_VIDEO_YUNWU:
    case ProviderCallMode.KLING_OMNI_VIDEO_DATAEYES: {
      headers["Content-Type"] = "application/json";
      const omniImageList: Array<{ image_url: string; type?: string }> = [];
      if (effectiveImageUrl) {
        omniImageList.push({ image_url: effectiveImageUrl, type: "first_frame" });
      }
      for (const refUrl of effectiveReferenceImages) {
        omniImageList.push({ image_url: refUrl });
      }
      requestBody = buildKlingOmniVideoRequestBody({
        modelName: model,
        prompt: effectivePrompt,
        mode: "std",
        duration: String(duration),
        aspectRatio: "9:16",
        imageList: omniImageList.length > 0 ? omniImageList : undefined,
      });
      Object.assign(requestBodySummary, {
        protocol: "kling-omni",
        duration,
        aspectRatio: "9:16",
        imageCount: omniImageList.length,
      });
      break;
    }
    case ProviderCallMode.KLING_VIDEO_OFFICIAL: {
      headers["Content-Type"] = "application/json";
      requestBody = buildKlingOfficialVideoRequestBody({
        model,
        prompt: effectivePrompt,
        imageUrl: effectiveImageUrl,
        imageUrls: effectiveReferenceImages.length > 0 ? effectiveReferenceImages : undefined,
        duration,
        aspectRatio: "9:16",
        sound: options?.sound,
      });
      Object.assign(requestBodySummary, {
        protocol: "kling-official",
        duration,
        aspectRatio: "9:16",
        imageCount: 1 + effectiveReferenceImages.length,
      });
      break;
    }
    case ProviderCallMode.WANX_VIDEO_BAILIAN: {
      headers["Content-Type"] = "application/json";
      requestBody = buildWanxVideoRequestBody({
        model,
        prompt: effectivePrompt,
        imageUrl: effectiveImageUrl,
        referenceImages: effectiveReferenceImages.length > 0 ? effectiveReferenceImages : undefined,
        duration,
        resolution: resolution === "1080p" ? "1080P" : resolution === "540p" ? "480P" : "720P",
        ratio: "9:16",
        promptExtend: true,
      });
      Object.assign(requestBodySummary, {
        protocol: "wanx",
        duration,
        resolution: resolution === "1080p" ? "1080P" : resolution === "540p" ? "480P" : "720P",
        ratio: "9:16",
        referenceImageCount: effectiveReferenceImages.length,
      });
      break;
    }
    case ProviderCallMode.HAPPYHORSE_VIDEO_BAILIAN: {
      // 快乐马 DashScope 协议：JSON 格式（完全独立实现）
      headers["Content-Type"] = "application/json";
      // 快乐马必须有参考图：合并主场景图和辅助参考图（主场景图放在第一位，最多9张）
      const happyHorseRefImages = [
        ...effectiveImageUrl ? [effectiveImageUrl] : [],
        ...effectiveReferenceImages.slice(0, 8)
      ].slice(0, 9);
      requestBody = buildHappyHorseVideoRequestBody({
        model,
        prompt: effectivePrompt,
        referenceImages: happyHorseRefImages,
        duration,
        resolution: resolution === "1080p" ? "1080P" : "720P",
        ratio: "9:16",
        watermark: false,
      });
      Object.assign(requestBodySummary, {
        protocol: "happyhorse",
        duration,
        resolution: resolution === "1080p" ? "1080P" : "720P",
        ratio: "9:16",
        referenceImageCount: happyHorseRefImages.length,
        hasSceneImage: !!effectiveImageUrl,
      });
      break;
    }
    case ProviderCallMode.GROK_VIDEO_YUNWU: {
      headers["Content-Type"] = "application/json";
      requestBody = buildGrokVideoRequestBody({
        model,
        prompt: effectivePrompt,
        imageUrl: effectiveImageUrl,
        referenceImages: effectiveReferenceImages.length > 0 ? effectiveReferenceImages : undefined,
        aspectRatio: "9:16",
        size: resolution === "1080p" ? "1080P" : "720P",
      });
      Object.assign(requestBodySummary, {
        protocol: "grok",
        aspectRatio: "9:16",
        size: resolution === "1080p" ? "1080P" : "720P",
        imageCount: 1 + effectiveReferenceImages.length,
      });
      break;
    }
    case ProviderCallMode.GROK_IMAGINE_VIDEO_YUNWU: {
      headers["Content-Type"] = "application/json";
      requestBody = buildGrokImagineVideoRequestBody({
        model,
        prompt: effectivePrompt,
        imageUrl: effectiveImageUrl,
        referenceImages: effectiveReferenceImages.length > 0 ? effectiveReferenceImages : undefined,
        aspectRatio: "9:16",
        resolution: resolution === "1080p" ? "720p" : "720p",
        duration,
      });
      Object.assign(requestBodySummary, {
        protocol: "grok-imagine",
        aspectRatio: "9:16",
        resolution: resolution === "1080p" ? "720p" : "720p",
        duration,
        imageCount: (effectiveImageUrl ? 1 : 0) + effectiveReferenceImages.length,
      });
      break;
    }
    case ProviderCallMode.GROK_IMAGINE_VIDEO_DATAEYES: {
      headers["Content-Type"] = "application/json";
      requestBody = buildGrokImagineVideoDataeyesRequestBody({
        model,
        prompt: effectivePrompt,
        imageUrl: effectiveImageUrl,
        referenceImages: effectiveReferenceImages.length > 0 ? effectiveReferenceImages : undefined,
        aspectRatio: "9:16",
        resolution: resolution === "1080p" ? "720p" : "720p",
        duration,
      });
      Object.assign(requestBodySummary, {
        protocol: "grok-imagine-dataeyes",
        aspectRatio: "9:16",
        resolution: resolution === "1080p" ? "720p" : "720p",
        duration,
        imageCount: (effectiveImageUrl ? 1 : 0) + effectiveReferenceImages.length,
      });
      break;
    }
    case ProviderCallMode.GROK_IMAGINE_VIDEO_CAIXIANG: {
      headers["Content-Type"] = "application/json";
      requestBody = buildGrokImagineVideoCaixiangRequestBody({
        model,
        prompt: effectivePrompt,
        imageUrl: effectiveImageUrl,
        referenceImages: effectiveReferenceImages.length > 0 ? effectiveReferenceImages : undefined,
        // 才翔AI Imagine 支持 16:9/9:16/1:1/3:2/2:3，默认用 9:16（竖屏）
        aspectRatio: "9:16",
        resolution: resolution === "1080p" ? "720p" : "720p",
        duration: String(duration),
      });
      Object.assign(requestBodySummary, {
        protocol: "grok-imagine-caixiang",
        aspectRatio: "9:16",
        resolution: resolution === "1080p" ? "720p" : "720p",
        duration,
        imageCount: (effectiveImageUrl ? 1 : 0) + effectiveReferenceImages.length,
      });
      break;
    }
    case ProviderCallMode.GROK_VIDEO_CAIXIANG: {
      headers["Content-Type"] = "application/json";
      requestBody = buildGrokCaixiangVideoRequestBody({
        model,
        prompt: effectivePrompt,
        imageUrl: effectiveImageUrl,
        referenceImages: effectiveReferenceImages.length > 0 ? effectiveReferenceImages : undefined,
        // 才翔AI 只支持 2:3/3:2/1:1，默认用 2:3（竖屏）
        aspectRatio: "9:16",
        size: resolution === "1080p" ? "1080P" : "720P",
        duration: "6",
      });
      Object.assign(requestBodySummary, {
        protocol: "grok-caixiang",
        aspectRatio: "9:16",
        size: resolution === "1080p" ? "1080P" : "720P",
        duration: "6",
        imageCount: 1 + effectiveReferenceImages.length,
      });
      break;
    }
    case ProviderCallMode.VEO_VIDEO_CAIXIANG: {
      headers["Content-Type"] = "application/json";
      requestBody = buildVeoCaixiangVideoRequestBody({
        model,
        prompt: effectivePrompt,
        imageUrl: effectiveImageUrl,
        referenceImages: effectiveReferenceImages.length > 0 ? effectiveReferenceImages : undefined,
        // VEO 才翔AI 支持 9:16/16:9
        aspectRatio: "9:16",
        generationMode: "fast",
        enhancePrompt: true,
        enableUpsample: resolution === "1080p",
      });
      Object.assign(requestBodySummary, {
        protocol: "veo-caixiang",
        aspectRatio: "9:16",
        generationMode: "fast",
        imageCount: effectiveImageUrl ? 1 : 0,
      });
      break;
    }
    default: {
      // 即梦协议：FormData
      const allImageUrls = [effectiveImageUrl, ...effectiveReferenceImages].filter((u): u is string => Boolean(u));
      requestBody = new FormData();
      (requestBody as FormData).append("model", model);
      (requestBody as FormData).append("prompt", effectivePrompt);
      (requestBody as FormData).append("ratio", "9:16");
      (requestBody as FormData).append("resolution", resolution);
      (requestBody as FormData).append("duration", String(duration));
      if (allImageUrls.length > 0) {
        (requestBody as FormData).append("image_url", allImageUrls[0]);
        (requestBody as FormData).append("image_urls", JSON.stringify(allImageUrls));
        (requestBody as FormData).append("mode", "img2video");
      }
      Object.assign(requestBodySummary, {
        protocol: "jimeng",
        duration,
        resolution,
        imageCount: allImageUrls.length,
      });
      break;
    }
  }

  log.debug({ endpoint: resolvedEndpoint, model }, '创建视频任务 POST');

  // 构建审计信息
  const sanitizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "authorization") {
      sanitizedHeaders[key] = "Bearer ***";
    } else {
      sanitizedHeaders[key] = value;
    }
  }
  auditRequestHeadersJson = JSON.stringify(sanitizedHeaders);

  function buildAuditRequestBody(): Record<string, unknown> {
    if (typeof requestBody === "string") {
      try {
        const parsed = JSON.parse(requestBody) as Record<string, unknown>;
        for (const key of Object.keys(parsed)) {
          if (Array.isArray(parsed[key])) {
            parsed[key] = (parsed[key] as unknown[]).map((item) => {
              if (typeof item === "string" && item.startsWith("data:")) {
                return "data:...[truncated]";
              }
              if (item && typeof item === "object" && !Array.isArray(item)) {
                const obj = item as Record<string, unknown>;
                if (obj.image_url && typeof obj.image_url === "object") {
                  const urlObj = obj.image_url as Record<string, unknown>;
                  if (typeof urlObj.url === "string" && urlObj.url.startsWith("data:")) {
                    urlObj.url = "data:...[truncated]";
                  }
                }
              }
              return item;
            });
          }
        }
        return parsed;
      } catch {
        return { raw: typeof requestBody === "string" ? requestBody.slice(0, 2000) : String(requestBody) };
      }
    }
    if (requestBody instanceof FormData) {
      const summary: Record<string, unknown> = { formData: true };
      for (const [key] of (requestBody as FormData).entries()) {
        summary[key] = "(file/binary)";
      }
      return summary;
    }
    return { raw: "(unknown body type)" };
  }
  auditRequestBodyJson = JSON.stringify(buildAuditRequestBody());

  const controller = new AbortController();
  timer = setTimeout(() => controller.abort(), Math.max(1000, provider.timeoutMs));

    const response = await fetch(resolvedEndpoint, { method: "POST", headers, body: requestBody, signal: controller.signal });
    const rawText = await response.text();
    const data = parseResponsePayload(rawText);
    const responseSummary = compactUnknownText(data, 1200);

    if (!response.ok) {
      throw new AppError(502, "VIDEO_PROVIDER_ERROR", `HTTP ${response.status} ${response.statusText}; endpoint=${resolvedEndpoint}; response=${responseSummary}`);
    }

    const providerMessage = extractProviderErrorMessage(data);
    if (shouldTreatProviderMessageAsFailure(providerMessage)) {
      throw new AppError(502, "VIDEO_PROVIDER_ERROR", `${providerMessage}; endpoint=${resolvedEndpoint}`);
    }

    // 使用提取器解析响应
    const extractor = getExtractor(callMode as ProviderCallMode);
    const parsed = extractor.parse(data);

    // 提取视频 URL（同步返回）
    if (parsed.videoUrls.length > 0) {
      log.info({ url: parsed.videoUrls[0] }, '创建任务直接返回视频URL');
      return {
        taskId: null,
        videoUrl: parsed.videoUrls[0],
        queryUrl: null,
        callMode,
        auditInfo: {
          actualEndpoint: resolvedEndpoint,
          requestBodySummary,
          effectivePrompt,
          requestHeadersJson: auditRequestHeadersJson,
          requestBodyJson: auditRequestBodyJson,
        },
      };
    }

    // 提取任务 ID（异步返回）
    const taskId = parsed.taskId;
    if (taskId) {
      log.info({ taskId }, '创建任务返回taskId');
      // 构建 queryUrl（switch 替代三元嵌套）
      let queryEndpoints: string[];
      switch (callMode) {
        case ProviderCallMode.VEO_VIDEO_YUNWU_TONGYI:
          queryEndpoints = buildVeoVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
        case ProviderCallMode.VEO_VIDEO_YUNWU_OPENAI:
          queryEndpoints = buildVeoOpenaiVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
        case ProviderCallMode.DOUBAO_SEEDANCE_VIDEO_YUNWU:
          queryEndpoints = buildDoubaoVolcVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
        case ProviderCallMode.KLING_VIDEO_YUNWU:
          queryEndpoints = buildKlingMultiImageVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
        case ProviderCallMode.KLING_OMNI_VIDEO_YUNWU:
        case ProviderCallMode.KLING_OMNI_VIDEO_DATAEYES:
          queryEndpoints = buildKlingVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
        case ProviderCallMode.KLING_VIDEO_OFFICIAL:
          queryEndpoints = buildKlingOfficialVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
        case ProviderCallMode.WANX_VIDEO_BAILIAN:
          queryEndpoints = buildWanxVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
        case ProviderCallMode.HAPPYHORSE_VIDEO_BAILIAN:
          queryEndpoints = buildHappyHorseVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
        case ProviderCallMode.GROK_VIDEO_YUNWU:
          queryEndpoints = buildGrokVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
        case ProviderCallMode.GROK_IMAGINE_VIDEO_YUNWU:
        case ProviderCallMode.GROK_IMAGINE_VIDEO_DATAEYES:
          queryEndpoints = buildGrokImagineVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
        case ProviderCallMode.GROK_VIDEO_CAIXIANG:
        case ProviderCallMode.GROK_IMAGINE_VIDEO_CAIXIANG:
          queryEndpoints = buildGrokCaixiangVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
        case ProviderCallMode.VEO_VIDEO_CAIXIANG:
          queryEndpoints = buildVeoCaixiangVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
        default:
          queryEndpoints = buildJimengVideoQueryEndpointCandidates(provider.baseUrl, taskId);
          break;
      }
      const queryUrl = queryEndpoints[0] ?? null;
      return {
        taskId,
        videoUrl: null,
        queryUrl,
        callMode,
        auditInfo: {
          actualEndpoint: resolvedEndpoint,
          requestBodySummary,
          effectivePrompt,
          requestHeadersJson: auditRequestHeadersJson,
          requestBodyJson: auditRequestBodyJson,
        },
      };
    }

    throw new AppError(502, "VIDEO_PROVIDER_ERROR", providerMessage ?? `EMPTY_VIDEO_RESULT; endpoint=${resolvedEndpoint}; response=${responseSummary}`);
  } catch (error) {
    // 统一附加审计信息：确保失败时也能在调试气泡中看到 API 地址和请求体
    const fallbackAuditInfo = {
      actualEndpoint: resolvedEndpoint,
      requestHeadersJson: auditRequestHeadersJson ?? JSON.stringify(headers),
      requestBodyJson: auditRequestBodyJson ?? null,
    };
    if (error instanceof AppError) {
      throw new AppError(error.statusCode, error.code, error.message, { ...error.extras, auditInfo: fallbackAuditInfo });
    }
    throw new AppError(502, "VIDEO_PROVIDER_ERROR", error instanceof Error ? error.message : String(error), { auditInfo: fallbackAuditInfo });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 查询视频任务状态（单次查询，不轮询）
 * 根据 taskId 查询提供商任务状态
 *
 * @param provider 提供商配置
 * @param taskId 任务 ID
 * @returns 任务状态和视频 URL（如果已完成）
 */
export async function queryVideoTask(
  provider: ResolvedRouteProvider,
  taskId: string,
): Promise<{
  status: "pending" | "succeeded" | "failed";
  videoUrl?: string;
  error?: { code: string; message: string };
  /** 查询端点信息（用于审计记录） */
  auditInfo?: {
    actualEndpoint: string;
    requestHeadersJson: string;
  };
}> {
  log.debug({ providerId: provider.id, taskId }, 'queryVideoTask 开始');

  if (!taskId || !taskId.trim()) {
    return { status: "failed", error: { code: "INVALID_TASK_ID", message: "taskId 为空" } };
  }

  // 获取轮询配置（用于请求超时）
  const pollingConfig = getVideoPollingConfig();

  // 解析模型候选（当前函数未使用 model，保留解析逻辑）
  const _modelCandidates = parseModelCandidates(provider.model);
  const _modelConfig = getVideoModelConfig();
  const _candidates = _modelCandidates.length > 0 ? _modelCandidates : _modelConfig.candidates;
  // model 在此函数中未使用

  // 基于 callMode 枚举值路由协议
  const callMode = resolveVideoCallMode(provider);
  const useVeoProtocol = callMode === ProviderCallMode.VEO_VIDEO_YUNWU_TONGYI;
  const useVeoOpenaiProtocol = isVeoOpenaiProvider(callMode);
  const useDoubaoVolcProtocol = isDoubaoProvider(callMode);
  const useKlingProtocol = isKlingProvider(callMode);
  const useKlingOfficialProtocol = isKlingOfficialProvider(callMode);
  const useWanxDashScopeProtocol = callMode === ProviderCallMode.WANX_VIDEO_BAILIAN;
  const useHappyHorseProtocol = callMode === ProviderCallMode.HAPPYHORSE_VIDEO_BAILIAN;
  const useGrokProtocol = isGrokProvider(callMode);
  const useGrokImagineProtocol = isGrokImagineProvider(callMode);

  // 认证头
  let auth: string;
  if (useKlingOfficialProtocol && provider.accessKey) {
    auth = `Bearer ${generateKlingJWT(provider.accessKey, provider.secret)}`;
  } else {
    const authCandidates = buildAuthHeaderCandidates(provider.secret, provider.vendor, provider.baseUrl);
    auth = authCandidates[0] ?? `Bearer ${provider.secret}`;
  }
  const apiKey = auth.replace(/^Bearer\s+/i, "").trim();

  const includeApiKeyHeaders = !useDoubaoVolcProtocol && !(useVeoProtocol || useVeoOpenaiProtocol) && !useKlingProtocol && !useKlingOfficialProtocol && !useWanxDashScopeProtocol && !useHappyHorseProtocol && !useGrokProtocol && !useGrokImagineProtocol;

  // 构建查询端点（switch 替代三元嵌套）
  let queryEndpoints: string[];
  switch (callMode) {
    case ProviderCallMode.VEO_VIDEO_YUNWU_TONGYI:
      queryEndpoints = buildVeoVideoQueryEndpointCandidates(provider.baseUrl, taskId);
      break;
    case ProviderCallMode.VEO_VIDEO_YUNWU_OPENAI:
      queryEndpoints = buildVeoOpenaiVideoQueryEndpointCandidates(provider.baseUrl, taskId);
      break;
    case ProviderCallMode.DOUBAO_SEEDANCE_VIDEO_YUNWU:
      queryEndpoints = buildDoubaoVolcVideoQueryEndpointCandidates(provider.baseUrl, taskId);
      break;
    case ProviderCallMode.KLING_VIDEO_YUNWU:
      queryEndpoints = buildKlingMultiImageVideoQueryEndpointCandidates(provider.baseUrl, taskId);
      break;
    case ProviderCallMode.KLING_OMNI_VIDEO_YUNWU:
    case ProviderCallMode.KLING_OMNI_VIDEO_DATAEYES:
      queryEndpoints = buildKlingVideoQueryEndpointCandidates(provider.baseUrl, taskId);
      break;
    case ProviderCallMode.KLING_VIDEO_OFFICIAL:
      queryEndpoints = buildKlingOfficialVideoQueryEndpointCandidates(provider.baseUrl, taskId);
      break;
      queryEndpoints = buildWanxVideoQueryEndpointCandidates(provider.baseUrl, taskId);
      break;
    case ProviderCallMode.HAPPYHORSE_VIDEO_BAILIAN:
      queryEndpoints = buildHappyHorseVideoQueryEndpointCandidates(provider.baseUrl, taskId);
      break;
    case ProviderCallMode.GROK_VIDEO_YUNWU:
      queryEndpoints = buildGrokVideoQueryEndpointCandidates(provider.baseUrl, taskId);
      break;
    case ProviderCallMode.GROK_IMAGINE_VIDEO_YUNWU:
    case ProviderCallMode.GROK_IMAGINE_VIDEO_DATAEYES:
      queryEndpoints = buildGrokImagineVideoQueryEndpointCandidates(provider.baseUrl, taskId);
      break;
    case ProviderCallMode.GROK_VIDEO_CAIXIANG:
    case ProviderCallMode.GROK_IMAGINE_VIDEO_CAIXIANG:
      queryEndpoints = buildGrokCaixiangVideoQueryEndpointCandidates(provider.baseUrl, taskId);
      break;
    case ProviderCallMode.VEO_VIDEO_CAIXIANG:
      queryEndpoints = buildVeoCaixiangVideoQueryEndpointCandidates(provider.baseUrl, taskId);
      break;
    default:
      queryEndpoints = buildJimengVideoQueryEndpointCandidates(provider.baseUrl, taskId);
      break;
  }

  const queryEndpoint = queryEndpoints[0] ?? "";
  if (!queryEndpoint) {
    return { status: "failed", error: { code: "NO_QUERY_ENDPOINT", message: "无法构建查询端点" } };
  }

  const headers: Record<string, string> = { Authorization: auth };
  if (includeApiKeyHeaders && apiKey) {
    headers["x-api-key"] = apiKey;
    headers["api-key"] = apiKey;
  }

  // 构建审计信息（查询端点）
  const sanitizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "authorization") {
      sanitizedHeaders[key] = "Bearer ***";
    } else {
      sanitizedHeaders[key] = value;
    }
  }
  const queryAuditInfo = {
    actualEndpoint: queryEndpoint,
    requestHeadersJson: JSON.stringify(sanitizedHeaders),
  };

  log.debug({ queryEndpoint, taskId }, '查询视频任务状态 GET');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), pollingConfig.requestTimeoutMs);

  try {
    const response = await fetch(queryEndpoint, { method: "GET", headers, signal: controller.signal });
    const rawText = await response.text();

    // 跳过 HTML 响应
    if (rawText.trim().startsWith("<!DOCTYPE") || rawText.trim().startsWith("<html")) {
      return { status: "pending", auditInfo: queryAuditInfo };
    }

    const data = parseResponsePayload(rawText);
    const responseSummary = compactUnknownText(data, 1200);

    // 调试日志：记录查询响应的完整结构
    log.info({ taskId, queryEndpoint, rawResponse: compactUnknownText(data, 3000) }, '[VEO-Debug] 查询响应原始数据');

    if (!response.ok) {
      return {
        status: "failed",
        error: { code: "QUERY_HTTP_ERROR", message: `HTTP ${response.status} ${response.statusText}; response=${responseSummary}` },
      };
    }

    const providerMessage = extractProviderErrorMessage(data);
    if (shouldTreatProviderMessageAsFailure(providerMessage)) {
      log.warn({ taskId, providerMessage, rawResponse: compactUnknownText(data, 3000) }, '[VEO-Debug] 查询响应被 extractProviderErrorMessage 判定为失败');
      return { status: "failed", error: { code: "PROVIDER_ERROR", message: providerMessage ?? "Unknown provider error" } };
    }

    // 使用提取器解析响应
    const extractor = getExtractor(callMode as ProviderCallMode);
    const parsed = extractor.parse(data);
    log.info({ taskId, parsedStatus: parsed.status, parsedVideoUrls: parsed.videoUrls, parsedTaskId: parsed.taskId, rawKeys: Object.keys(data ?? {}), rawPreview: compactUnknownText(data, 1000) }, "Seedance 查询响应解析结果");

    // 有视频 URL 则返回成功
    if (parsed.videoUrls.length > 0) {
      log.info({ url: parsed.videoUrls[0], taskId }, '查询任务成功，返回视频URL');
      return { status: "succeeded", videoUrl: parsed.videoUrls[0], auditInfo: queryAuditInfo };
    }

    // 根据状态返回
    if (parsed.status === "failed") {
      return { status: "failed", error: parsed.error ?? { code: "TASK_FAILED", message: "任务失败" } };
    }

    if (parsed.status === "succeeded") {
      // 任务完成但没有 URL
      return { status: "failed", error: { code: "NO_VIDEO_URL", message: "任务完成但未返回视频URL" } };
    }

    // 默认返回 pending
    return { status: "pending", auditInfo: queryAuditInfo };
  } catch (error) {
    if (error instanceof AppError) {
      return { status: "failed", error: { code: error.code, message: error.message } };
    }
    return { status: "failed", error: { code: "QUERY_ERROR", message: String(error) } };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// 可灵视频编辑 API（独立实现）
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 视频编辑异步模式：创建任务和查询单次（不轮询）
// ---------------------------------------------------------------------------

/**
 * 创建视频编辑任务（不轮询）
 * 只负责调用可灵视频编辑 API 创建任务，返回 taskId
 *
 * @param provider 提供商配置（callMode 必须为 kling-video-edit-yunwu）
 * @param videoUrl 源视频 URL
 * @param prompt 编辑提示词
 * @param options 可选参数：参考图片、负向提示词、时长
 * @returns taskId（异步模式）或 videoUrl（同步模式，极少见）
 */
export async function createVideoEditTask(
  provider: ResolvedRouteProvider,
  videoUrl: string,
  prompt: string,
  options?: {
    referenceImages?: string[];
    negativePrompt?: string;
    duration?: number;
  },
): Promise<{
  taskId: string | null;
  videoUrl: string | null;
  /** 查询端点 */
  queryUrl: string | null;
  auditInfo?: VideoRequestAuditInfo;
}> {
  log.debug({ providerId: provider.id, model: provider.model, videoUrl }, 'createVideoEditTask 开始');

  const callMode = resolveVideoCallMode(provider);

  // 快乐马视频编辑：分发到独立服务
  if (callMode === ProviderCallMode.HAPPYHORSE_VIDEO_EDIT_BAILIAN) {
    const result = await createHappyHorseVideoEditTask(provider, prompt, videoUrl, {
      referenceImages: options?.referenceImages,
    });
    return {
      taskId: result.taskId,
      videoUrl: result.videoUrl,
      queryUrl: result.queryUrl,
      auditInfo: result.auditInfo,
    };
  }

  // 可灵 Omni-Video：分发到 createOmniVideoTask
  if (isKlingOmniVideoProvider(callMode)) {
    const duration = options?.duration != null ? String(Math.max(3, Math.min(10, Math.round(options.duration)))) : "5";
    const modelName = provider.model ?? "kling-v3-omni";
    const result = await createOmniVideoTask(provider, {
      videoUrl,
      imageUrls: options?.referenceImages ?? [],
      prompt,
      negativePrompt: options?.negativePrompt,
      duration,
      modelName,
    });
    return {
      taskId: result.taskId,
      videoUrl: null,
      queryUrl: result.queryUrl,
    };
  }

  // 以下为 kling-video-edit-yunwu 原有逻辑
  if (!isKlingVideoEditProvider(callMode)) {
    throw new AppError(400, "INVALID_CALL_MODE", `createVideoEditTask 需要 callMode=kling-video-edit-yunwu，当前为 ${callMode}`);
  }

  const modelCandidates = parseModelCandidates(provider.model);
  const model = modelCandidates[0] ?? "kling-video-o3-pro";

  const authCandidates = buildAuthHeaderCandidates(provider.secret, provider.vendor, provider.baseUrl);
  const auth = authCandidates[0] ?? `Bearer ${provider.secret}`;

  const createEndpoints = buildKlingVideoEditCreateEndpointCandidates(provider.baseUrl);
  const resolvedEndpoint = createEndpoints[0] ?? provider.baseUrl;

  const headers: Record<string, string> = {
    Authorization: auth,
    "Content-Type": "application/json",
  };

  const requestBody = buildKlingVideoEditRequestBody({
    model,
    videoUrl,
    referenceImages: options?.referenceImages,
    prompt,
    negativePrompt: options?.negativePrompt,
    duration: options?.duration,
  });

  const requestBodySummary: Record<string, unknown> = {
    model,
    videoUrl,
    referenceImageCount: options?.referenceImages?.length ?? 0,
    promptLength: prompt.length,
    duration: options?.duration,
  };

  // 审计信息
  const sanitizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "authorization") {
      sanitizedHeaders[key] = "Bearer ***";
    } else {
      sanitizedHeaders[key] = value;
    }
  }

  log.debug({ endpoint: resolvedEndpoint, model, videoUrl }, '创建视频编辑任务 POST');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, provider.timeoutMs));

  try {
    const response = await fetch(resolvedEndpoint, { method: "POST", headers, body: requestBody, signal: controller.signal });
    const rawText = await response.text();
    const data = parseResponsePayload(rawText);
    const responseSummary = compactUnknownText(data, 1200);

    if (!response.ok) {
      throw new AppError(502, "VIDEO_EDIT_PROVIDER_ERROR", `HTTP ${response.status} ${response.statusText}; endpoint=${resolvedEndpoint}; response=${responseSummary}`);
    }

    const providerMessage = extractProviderErrorMessage(data);
    if (shouldTreatProviderMessageAsFailure(providerMessage)) {
      throw new AppError(502, "VIDEO_EDIT_PROVIDER_ERROR", `${providerMessage}; endpoint=${resolvedEndpoint}`);
    }

    // 提取任务 ID
    const taskId = extractTaskIdFromKlingVideoEditResponse(data);
    if (!taskId) {
      throw new AppError(502, "VIDEO_EDIT_NO_TASK_ID", `未返回 taskId; endpoint=${resolvedEndpoint}; response=${responseSummary}`);
    }

    log.info({ taskId }, '视频编辑任务创建成功');

    // 构建查询端点
    const queryEndpoints = buildKlingVideoEditQueryEndpointCandidates(provider.baseUrl, taskId);
    const queryUrl = queryEndpoints[0] ?? null;

    return {
      taskId,
      videoUrl: null,
      queryUrl,
      auditInfo: {
        actualEndpoint: resolvedEndpoint,
        requestBodySummary,
        effectivePrompt: prompt,
        requestHeadersJson: JSON.stringify(sanitizedHeaders),
        requestBodyJson: requestBody,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 查询视频编辑任务状态（单次查询，不轮询）
 *
 * @param provider 提供商配置
 * @param taskId 任务 ID
 * @returns 任务状态和视频 URL（如果已完成）
 */
export async function queryVideoEditTask(
  provider: ResolvedRouteProvider,
  taskId: string,
): Promise<{
  status: "pending" | "succeeded" | "failed";
  videoUrl?: string;
  error?: { code: string; message: string };
}> {
  log.debug({ providerId: provider.id, taskId }, 'queryVideoEditTask 开始');

  if (!taskId || !taskId.trim()) {
    return { status: "failed", error: { code: "INVALID_TASK_ID", message: "taskId 为空" } };
  }

  const callMode = resolveVideoCallMode(provider);

  // 快乐马视频编辑：分发到独立服务
  if (callMode === ProviderCallMode.HAPPYHORSE_VIDEO_EDIT_BAILIAN) {
    return queryHappyHorseVideoEditTask(provider, taskId);
  }

  // 可灵 Omni-Video：分发到 queryOmniVideoTask
  if (isKlingOmniVideoProvider(callMode)) {
    return queryOmniVideoTask(provider, taskId);
  }

  // 以下为 kling-video-edit-yunwu 原有逻辑

  // 获取轮询配置（用于请求超时）
  const pollingConfig = getVideoPollingConfig();
  if (!isKlingVideoEditProvider(callMode)) {
    return { status: "failed", error: { code: "INVALID_CALL_MODE", message: `需要 callMode=kling-video-edit-yunwu，当前为 ${callMode}` } };
  }

  const authCandidates = buildAuthHeaderCandidates(provider.secret, provider.vendor, provider.baseUrl);
  const auth = authCandidates[0] ?? `Bearer ${provider.secret}`;

  const queryEndpoints = buildKlingVideoEditQueryEndpointCandidates(provider.baseUrl, taskId);
  const queryEndpoint = queryEndpoints[0] ?? "";
  if (!queryEndpoint) {
    return { status: "failed", error: { code: "NO_QUERY_ENDPOINT", message: "无法构建查询端点" } };
  }

  const headers: Record<string, string> = { Authorization: auth };

  log.debug({ queryEndpoint, taskId }, '查询视频编辑任务状态 GET');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), pollingConfig.requestTimeoutMs);

  try {
    const response = await fetch(queryEndpoint, { method: "GET", headers, signal: controller.signal });
    const rawText = await response.text();

    // 跳过 HTML 响应
    if (rawText.trim().startsWith("<!DOCTYPE") || rawText.trim().startsWith("<html")) {
      return { status: "pending" };
    }

    const data = parseResponsePayload(rawText);
    const responseSummary = compactUnknownText(data, 1200);

    if (!response.ok) {
      return {
        status: "failed",
        error: { code: "QUERY_HTTP_ERROR", message: `HTTP ${response.status} ${response.statusText}; response=${responseSummary}` },
      };
    }

    const providerMessage = extractProviderErrorMessage(data);
    if (shouldTreatProviderMessageAsFailure(providerMessage)) {
      return { status: "failed", error: { code: "PROVIDER_ERROR", message: providerMessage ?? "Unknown provider error" } };
    }

    // 提取视频 URL
    const videoUrls = extractVideoUrlsFromKlingVideoEditResponse(data);
    if (videoUrls.length > 0) {
      log.info({ url: videoUrls[0], taskId }, '视频编辑查询成功，返回视频URL');
      return { status: "succeeded", videoUrl: videoUrls[0] };
    }

    // 检查状态
    const status = extractTaskStatusFromKlingVideoEditResponse(data);
    if (status === "failed") {
      return { status: "failed", error: { code: "TASK_FAILED", message: `任务失败; taskId=${taskId}` } };
    }

    // 默认返回 pending
    return { status: "pending" };
  } catch (error) {
    if (error instanceof AppError) {
      return { status: "failed", error: { code: error.code, message: error.message } };
    }
    return { status: "failed", error: { code: "QUERY_ERROR", message: String(error) } };
  } finally {
    clearTimeout(timer);
  }
}


// ---------------------------------------------------------------------------
// 可灵 Omni-Video API（单步提交，替代 multi-elements 多步工作流）
// 文档：https://yunwu.apifox.cn/api-393296337
// POST /kling/v1/videos/omni-video → 返回 task_id
// GET /kling/v1/videos/omni-video/{taskId} → 查询状态
// ---------------------------------------------------------------------------

/**
 * 提交 Omni-Video 任务
 * 单步提交：video_list + image_list → task_id
 */
export async function createOmniVideoTask(
  provider: ResolvedRouteProvider,
  params: {
    videoUrl: string;
    imageUrls: string[];
    prompt?: string;
    negativePrompt?: string;
    mode?: string;
    duration?: string;
    modelName?: string;
  },
): Promise<{
  taskId: string;
  queryUrl: string;
}> {
  log.debug({ providerId: provider.id }, 'createOmniVideoTask 开始');

  const callMode = resolveVideoCallMode(provider);
  if (!isKlingOmniVideoProvider(callMode)) {
    throw new AppError(400, "INVALID_CALL_MODE", `createOmniVideoTask 需要 callMode=kling-omni-video-yunwu 或 kling-omni-video-dataeyes，当前为 ${callMode}`);
  }

  const authCandidates = buildAuthHeaderCandidates(provider.secret, provider.vendor, provider.baseUrl);
  const auth = authCandidates[0] ?? `Bearer ${provider.secret}`;

  const createEndpoints = buildKlingVideoCreateEndpointCandidates(provider.baseUrl);
  const endpoint = createEndpoints[0] ?? provider.baseUrl;

  const headers: Record<string, string> = {
    Authorization: auth,
    "Content-Type": "application/json",
  };

  // video_list：源视频 + refer_type: "base" 保留原始音频
  const videoList = [{
    video_url: params.videoUrl,
    refer_type: "base",
    keep_original_sound: "yes",
  }];

  // image_list：参考图（换装结果图等，video-edit 模式不传 type）
  const imageList = params.imageUrls.map((url) => ({
    image_url: url,
  }));

  const requestBody = buildKlingOmniVideoRequestBody({
    modelName: params.modelName ?? provider.model ?? "kling-v3-omni",
    prompt: params.prompt,
    negativePrompt: params.negativePrompt,
    mode: params.mode ?? "std",
    duration: params.duration ?? "5",
    imageList,
    videoList,
  });

  log.debug({ endpoint, videoUrl: params.videoUrl.slice(0, 100), imageCount: imageList.length }, 'omni-video POST');

  // 记录完整请求体用于排查（视频 URL、duration、mode 等关键参数）
  log.info({
    endpoint,
    modelName: params.modelName ?? provider.model ?? "kling-v3-omni",
    duration: params.duration ?? "5",
    mode: params.mode ?? "std",
    videoUrl: params.videoUrl,
    imageCount: imageList.length,
    imageUrls: imageList.map(i => (i as { image_url: string }).image_url.slice(0, 100)),
  }, 'omni-video 完整请求参数');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, provider.timeoutMs));

  try {
    const response = await fetch(endpoint, { method: "POST", headers, body: requestBody, signal: controller.signal });
    const rawText = await response.text();
    const data = parseResponsePayload(rawText);
    const responseSummary = compactUnknownText(data, 1200);

    if (!response.ok) {
      log.error({
        status: response.status,
        endpoint,
        requestBody: requestBody.slice(0, 500),
        response: responseSummary,
      }, 'omni-video 创建失败，记录请求体');
      throw new AppError(502, "OMNI_VIDEO_CREATE_ERROR", `omni-video HTTP ${response.status}; endpoint=${endpoint}; response=${responseSummary}`);
    }

    const providerMessage = extractProviderErrorMessage(data);
    if (shouldTreatProviderMessageAsFailure(providerMessage)) {
      throw new AppError(502, "OMNI_VIDEO_CREATE_ERROR", `${providerMessage}; endpoint=${endpoint}`);
    }

    const taskId = extractTaskIdFromKlingResponse(data);
    if (!taskId) {
      throw new AppError(502, "OMNI_VIDEO_NO_TASK_ID", `omni-video 未返回 task_id; endpoint=${endpoint}; response=${responseSummary}`);
    }

    const queryEndpoints = buildKlingVideoQueryEndpointCandidates(provider.baseUrl, taskId);
    const queryUrl = queryEndpoints[0] ?? "";

    log.info({ taskId }, 'omni-video 任务创建成功');
    return { taskId, queryUrl };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 查询 Omni-Video 任务状态
 * GET /kling/v1/videos/omni-video/{taskId}
 */
export async function queryOmniVideoTask(
  provider: ResolvedRouteProvider,
  taskId: string,
): Promise<{
  status: "pending" | "succeeded" | "failed";
  videoUrl?: string;
  error?: { code: string; message: string };
}> {
  log.debug({ providerId: provider.id, taskId }, 'queryOmniVideoTask 开始');

  if (!taskId || !taskId.trim()) {
    return { status: "failed", error: { code: "INVALID_TASK_ID", message: "taskId 为空" } };
  }

  // 获取轮询配置（用于请求超时）
  const pollingConfig = getVideoPollingConfig();

  const callMode = resolveVideoCallMode(provider);
  if (!isKlingOmniVideoProvider(callMode)) {
    return { status: "failed", error: { code: "INVALID_CALL_MODE", message: `需要 callMode=kling-omni-video-yunwu 或 kling-omni-video-dataeyes，当前为 ${callMode}` } };
  }

  const authCandidates = buildAuthHeaderCandidates(provider.secret, provider.vendor, provider.baseUrl);
  const auth = authCandidates[0] ?? `Bearer ${provider.secret}`;

  const queryEndpoints = buildKlingVideoQueryEndpointCandidates(provider.baseUrl, taskId);
  const queryEndpoint = queryEndpoints[0] ?? "";
  if (!queryEndpoint) {
    return { status: "failed", error: { code: "NO_QUERY_ENDPOINT", message: "无法构建查询端点" } };
  }

  const headers: Record<string, string> = { Authorization: auth };

  log.debug({ queryEndpoint, taskId }, 'omni-video 查询 GET');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), pollingConfig.requestTimeoutMs);

  try {
    const response = await fetch(queryEndpoint, { method: "GET", headers, signal: controller.signal });
    const rawText = await response.text();

    if (rawText.trim().startsWith("<!DOCTYPE") || rawText.trim().startsWith("<html")) {
      return { status: "pending" };
    }

    const data = parseResponsePayload(rawText);
    const responseSummary = compactUnknownText(data, 1200);

    if (!response.ok) {
      return {
        status: "failed",
        error: { code: "QUERY_HTTP_ERROR", message: `HTTP ${response.status}; response=${responseSummary}` },
      };
    }

    const providerMessage = extractProviderErrorMessage(data);
    if (shouldTreatProviderMessageAsFailure(providerMessage)) {
      return { status: "failed", error: { code: "PROVIDER_ERROR", message: providerMessage ?? "Unknown provider error" } };
    }

    const videoUrls = extractVideoUrlsFromKlingResponse(data);
    if (videoUrls.length > 0) {
      log.info({ url: videoUrls[0], taskId }, 'omni-video 查询成功');
      return { status: "succeeded", videoUrl: videoUrls[0] };
    }

    const taskStatus = extractTaskStatusFromKlingResponse(data);
    if (taskStatus === "failed") {
      return { status: "failed", error: { code: "TASK_FAILED", message: `任务失败; taskId=${taskId}` } };
    }

    return { status: "pending" };
  } catch (error) {
    if (error instanceof AppError) {
      return { status: "failed", error: { code: error.code, message: error.message } };
    }
    return { status: "failed", error: { code: "QUERY_ERROR", message: String(error) } };
  } finally {
    clearTimeout(timer);
  }
}