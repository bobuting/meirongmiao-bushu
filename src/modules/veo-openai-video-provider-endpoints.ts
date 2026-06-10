import { ProviderCallMode } from "../contracts/types.js";

/**
 * VEO OpenAI 视频格式 API 端点构建函数
 * 云雾第三方接口统一格式：https://yunwu.apifox.cn/
 * 端点: POST /v1/video/create（JSON 格式，图片传 URL）
 * 查询: GET /v1/video/query?id={taskId}
 */

/**
 * 构建创建视频端点候选列表（统一格式）
 * @param baseUrl 基础 URL
 * @returns 端点 URL 列表
 */
export function buildVeoOpenaiVideoCreateEndpointCandidates(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/+$/, "");
  const lowerBase = base.toLowerCase();
  const candidates = new Set<string>();

  // 统一格式创建端点：/v1/video/create
  const createSuffixes = ["/v1/video/create"];

  // 如果 URL 已经是完整端点，直接添加
  if (lowerBase.endsWith("/v1/video/create") || lowerBase.endsWith("/video/create")) {
    candidates.add(base);
    return [...candidates];
  }

  // 去除已知的后缀
  const knownSuffixes = [
    "/api/v1/chat/completions",
    "/v1/chat/completions",
    "/chat/completions",
    "/api/v1/videos/generations",
    "/v1/videos/generations",
    "/videos/generations",
    "/v1/videos",
    "/volc/v1/contents/generations/tasks",
  ];

  let root = base;
  for (const suffix of knownSuffixes) {
    if (lowerBase.endsWith(suffix.toLowerCase())) {
      root = base.slice(0, Math.max(0, base.length - suffix.length)).replace(/\/+$/, "");
      break;
    }
  }

  // 添加创建端点
  for (const suffix of createSuffixes) {
    candidates.add(`${root}${suffix}`);
  }

  return [...candidates];
}

/**
 * 构建查询视频任务端点候选列表（统一格式）
 * @param baseUrl 基础 URL
 * @param taskId 任务 ID
 * @returns 端点 URL 列表
 */
export function buildVeoOpenaiVideoQueryEndpointCandidates(baseUrl: string, taskId: string): string[] {
  const safeTaskId = encodeURIComponent(taskId.trim());
  if (!safeTaskId) {
    return [];
  }

  const base = baseUrl.replace(/\/+$/, "");
  const lowerBase = base.toLowerCase();
  const candidates = new Set<string>();

  // 统一格式查询端点：GET /v1/video/query?id={taskId}
  const querySuffixes = [
    `/v1/video/query?id=${safeTaskId}`,
    `/video/query?id=${safeTaskId}`,
  ];

  // 如果 URL 已经包含 /video/query，直接返回
  if (lowerBase.includes("/video/query")) {
    candidates.add(base);
    return [...candidates];
  }

  // 去除已知的后缀
  const knownSuffixes = [
    "/api/v1/chat/completions",
    "/v1/chat/completions",
    "/chat/completions",
    "/api/v1/videos/generations",
    "/v1/videos/generations",
    "/videos/generations",
    "/v1/videos",
    "/v1/video/create",
    "/video/create",
    "/volc/v1/contents/generations/tasks",
  ];

  let root = base;
  for (const suffix of knownSuffixes) {
    if (lowerBase.endsWith(suffix.toLowerCase())) {
      root = base.slice(0, Math.max(0, base.length - suffix.length)).replace(/\/+$/, "");
      break;
    }
  }

  // 添加查询端点
  for (const suffix of querySuffixes) {
    candidates.add(`${root}${suffix}`);
  }

  return [...candidates];
}

/**
 * 判断是否使用 VEO OpenAI 协议
 * @param callMode 调用模式
 */
export function isVeoOpenaiProvider(callMode: string): boolean {
  return callMode === ProviderCallMode.VEO_VIDEO_YUNWU_OPENAI;
}
