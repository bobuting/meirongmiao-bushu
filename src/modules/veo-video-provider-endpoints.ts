import { ProviderCallMode } from "../contracts/types.js";

/**
 * VEO 视频生成 API 端点构建函数
 * 云雾第三方接口：https://yunwu.apifox.cn/
 * 支持模型：veo3.1, veo3.1-fast, veo3.1-pro, veo3.1-4k, veo3.1-pro-4k 等
 */

/**
 * 构建创建视频端点候选列表
 * @param baseUrl 基础 URL
 * @returns 端点 URL 列表
 */
export function buildVeoVideoCreateEndpointCandidates(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/+$/, "");
  const lowerBase = base.toLowerCase();
  const candidates = new Set<string>();

  // VEO 创建视频端点：/v1/video/create
  const createSuffixes = [
    "/v1/video/create",
    "/video/create",
  ];

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
 * 构建查询视频任务端点候选列表
 * @param baseUrl 基础 URL
 * @param taskId 任务 ID
 * @returns 端点 URL 列表
 */
export function buildVeoVideoQueryEndpointCandidates(baseUrl: string, taskId: string): string[] {
  const safeTaskId = encodeURIComponent(taskId.trim());
  if (!safeTaskId) {
    return [];
  }

  const base = baseUrl.replace(/\/+$/, "");
  const lowerBase = base.toLowerCase();
  const candidates = new Set<string>();

  // VEO 查询端点：/v1/video/query?id={taskId}
  const querySuffixes = [
    `/v1/video/query?id=${safeTaskId}`,
    `/video/query?id=${safeTaskId}`,
  ];

  // 如果 URL 已经是查询端点格式，直接返回
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
    "/api/v1/video/create",
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
 * 判断是否使用 VEO 协议
 * 基于 callMode 枚举值判断
 */
export function isVeoProvider(callMode: string): boolean {
  return callMode === ProviderCallMode.VEO_VIDEO_YUNWU_TONGYI;
}