/**
 * 阿里云市场万相营造商详长图 API Provider
 *
 * 异步任务模式：submit → genId → poll (GET)
 * 认证方式：Authorization: APPCODE {secret}
 *
 * API 端点：
 * - Pro submit:   POST /maigc/api/starlink/pro/submit
 * - Query:        GET  /maigc/api/starlink/query?genId={genId}
 */

import { httpGetWithTimeout, postJsonWithTimeout } from "../../utils/http-request.js";
import { getLogger } from "../../core/logger/index.js";

const log = getLogger("alicloud-market-provider");

/** 提交长图生成参数 */
export interface WanxiangSubmitParams {
  /** 商品标题 */
  itemTitle?: string;
  /** 商品描述/卖点文本（最少 50 字符，最多 1000） */
  introduction: string;
  /** 商品图片 URL 列表（JPG/PNG，≥512x512，<9MB，最多 10 张） */
  images: string[];
  /** 模板 ID（可选，不传则 AI 自动选择） */
  templateId?: string;
  /** 白底商品照片 URL（可选，可显著提升输出效果） */
  imageWhitebg?: string;
}

/** 模板列表项 */
export interface WanxiangTemplate {
  /** 模板 ID */
  templateId: string;
  /** 模板名称 */
  templateName: string;
  /** 模板缩略图 URL */
  thumbnailUrl: string;
  /** 模板分类 */
  category?: string;
  /** 模板描述 */
  description?: string;
}

/** 提交结果 */
export interface WanxiangSubmitResult {
  /** 生成任务 ID（API 返回的 genId） */
  genId: string;
  /** 实际调用的 API 地址（调试气泡用） */
  actualEndpoint: string;
}

/** 查询结果 */
export interface WanxiangQueryResult {
  /** 任务状态 */
  status: "pending" | "running" | "succeeded" | "failed";
  /** 渲染后的长图 URL */
  imageUrl?: string;
  /** Sketch 源文件下载 URL（Pro 版） */
  sketchUrl?: string;
  /** 失败时的错误信息 */
  error?: string;
  /** 实际调用的 API 地址（调试气泡用） */
  actualEndpoint?: string;
}

/** 已解析的 Provider 配置 */
interface ProviderConfig {
  baseUrl: string;
  model: string;
  callMode: string;
  secret: string;
  timeoutMs: number;
}

/**
 * 提交万相营造商详长图生成任务
 *
 * Pro/Basic 版使用不同 submit 路径
 * 请求体: { item_title, introduction, images }
 * 响应体: { data: { genId }, code: 200, message: "success" }
 * 实测确认字段名为 message（非 msg）
 */
export async function submitWanxiangLongImage(
  provider: ProviderConfig,
  params: WanxiangSubmitParams,
): Promise<WanxiangSubmitResult> {
  const url = `${provider.baseUrl}/maigc/api/starlink/pro/submit`;

  const headers = buildAppCodeHeaders(provider.secret);

  const payload: Record<string, unknown> = {
    introduction: params.introduction,
    images: params.images,
  };
  if (params.itemTitle) payload.item_title = params.itemTitle;
  if (params.templateId) payload.template_id = params.templateId;
  if (params.imageWhitebg) payload.image_whitebg = params.imageWhitebg;

  log.info({ url, imageCount: params.images.length }, "提交万相营造长图生成");

  const response = await postJsonWithTimeout(url, payload, headers, provider.timeoutMs) as Record<string, unknown>;

  const code = response.code as number;
  if (code !== 200) {
    throw new Error(`万相营造 API 返回错误 code=${code}: ${response.message}`);
  }

  const data = (response.data ?? {}) as Record<string, unknown>;
  const genId = data.genId as string;
  if (!genId) {
    throw new Error(`万相营造 API 未返回 genId，响应: ${JSON.stringify(response).slice(0, 500)}`);
  }

  log.info({ genId }, "万相营造任务已提交");

  return { genId, actualEndpoint: url };
}

/**
 * 查询万相营造长图生成任务状态
 *
 * GET /maigc/api/starlink/query?genId={genId}
 * 响应体: { genId, data: { fullImage, width, height, download_sketch }, genStatus: "success"|"failed"|"running", code: 200 }
 * 实测 genStatus 值为 "success"（非 "succeeded"），长图字段为 fullImage，Sketch 为 download_sketch
 */
export async function pollWanxiangTaskResult(
  provider: ProviderConfig,
  genId: string,
): Promise<WanxiangQueryResult> {
  const url = `${provider.baseUrl}/maigc/api/starlink/query?genId=${encodeURIComponent(genId)}`;

  const headers = buildAppCodeHeaders(provider.secret);
  // GET 请求不需要 Content-Type
  delete headers["Content-Type"];

  const response = await httpGetWithTimeout(url, headers, provider.timeoutMs) as Record<string, unknown>;

  const genStatus = (response.genStatus as string) ?? "pending";
  const status = mapStatus(genStatus);

  const result: WanxiangQueryResult = { status, actualEndpoint: url };

  if (status === "succeeded") {
    const data = (response.data ?? {}) as Record<string, unknown>;
    // 长图 URL：实测字段名为 fullImage（860×11020 的高图）
    result.imageUrl = data.fullImage as string
      ?? data.imageUrl as string
      ?? data.image_url as string
      ?? data.longImageUrl as string;
    // Sketch URL：实测字段名为 download_sketch
    result.sketchUrl = data.download_sketch as string
      ?? data.sketchUrl as string
      ?? data.sketch_url as string;
  }

  if (status === "failed") {
    const data = (response.data ?? {}) as Record<string, unknown>;
    result.error = data.message as string ?? data.msg as string ?? response.message as string ?? "万相营造生成任务失败";
  }

  log.info({ genId, status: result.status }, "万相营造任务状态查询");

  return result;
}

/** 构建阿里云市场 AppCode 认证头 */
function buildAppCodeHeaders(secret: string): Record<string, string> {
  const code = secret.replace(/^APPCODE\s+/i, "").trim();
  return {
    "Authorization": `APPCODE ${code}`,
    "Content-Type": "application/json",
  };
}

/** 映射 API genStatus 为统一状态 */
function mapStatus(raw: string): WanxiangQueryResult["status"] {
  const normalized = raw.toLowerCase().trim();
  if (normalized === "succeeded" || normalized === "success" || normalized === "completed" || normalized === "done") {
    return "succeeded";
  }
  if (normalized === "failed" || normalized === "error" || normalized === "failure") {
    return "failed";
  }
  if (normalized === "running" || normalized === "processing" || normalized === "in_progress") {
    return "running";
  }
  return "pending";
}

/**
 * 获取万相营造模板列表
 *
 * GET https://mos.m.taobao.com/taojimu/yunselling_longpic_templates
 * 无需认证，返回 { flag: true, templates: [{ id, name, desc, cate, coverImageUrl }] }
 */
export async function fetchWanxiangTemplates(): Promise<WanxiangTemplate[]> {
  const url = "https://mos.m.taobao.com/taojimu/yunselling_longpic_templates";

  log.info("获取万相营造模板列表");

  const response = await httpGetWithTimeout(url, {}, 15_000) as Record<string, unknown>;

  const rawTemplates = response.templates as Array<Record<string, unknown>> ?? [];
  const templates: WanxiangTemplate[] = rawTemplates.map((item) => ({
    templateId: String(item.id ?? ""),
    templateName: String(item.name ?? ""),
    thumbnailUrl: String(item.coverImageUrl ?? ""),
    category: item.cate != null ? String(item.cate) : undefined,
    description: item.desc != null ? String(item.desc) : undefined,
  }));

  log.info({ count: templates.length }, "获取万相营造模板列表成功");
  return templates;
}

/**
 * 查询万相营造 Sketch 任务，获取真正的 OSS 下载地址
 *
 * download_sketch URL（如 https://mos.m.taobao.com/mixo/download/sketch?id=sketch_xxx）
 * 是前端 SPA 页面，不能直接下载。需要通过 mixo API 查询获取 ossUrl。
 *
 * POST https://fether.m.taobao.com/aigc/mixo-query-sketch-tasks?&token=ft
 * Body: { "id": "sketch_xxx" }
 * Response: { code: 200, result: { success: true, data: { status, ossUrl, previewUrl } } }
 *
 * @param sketchId sketch ID（从 download_sketch URL 的 id 参数提取）
 * @returns ossUrl（.sketch 文件的真实 OSS 下载地址）或 null
 */
export async function resolveSketchOssUrl(sketchId: string): Promise<string | null> {
  const url = "https://fether.m.taobao.com/aigc/mixo-query-sketch-tasks?&token=ft";

  log.info({ sketchId }, "查询 Sketch 任务 OSS 地址");

  const response = await postJsonWithTimeout(url, { id: sketchId }, {}, 15_000) as Record<string, unknown>;

  if (response.code !== 200) {
    log.warn({ sketchId, code: response.code }, "Sketch 任务查询返回非 200");
    return null;
  }

  const result = response.result as Record<string, unknown>;
  if (!result?.success) {
    log.warn({ sketchId, error: result?.error }, "Sketch 任务查询失败");
    return null;
  }

  const data = (result.data ?? {}) as Record<string, unknown>;
  const ossUrl = data.ossUrl as string;
  if (!ossUrl) {
    log.warn({ sketchId, status: data.status }, "Sketch 任务无 ossUrl");
    return null;
  }

  // 强制 HTTPS + 替换跨域 OSS 域名为公网域名
  // mixo API 返回的 ossUrl 使用 oss-cn-hangzhou-cross（内网跨域），外部无法访问
  // 需要替换为 oss-cn-hangzhou（公网域名）
  const httpsUrl = ossUrl
    .replace(/^http:\/\//i, "https://")
    .replace(/\.oss-cn-hangzhou-cross\./i, ".oss-cn-hangzhou.");
  log.info({ sketchId, ossUrl: httpsUrl.slice(0, 100) }, "获取 Sketch OSS 地址成功");
  return httpsUrl;
}

/**
 * 从 download_sketch URL 中提取 sketch ID
 * 输入: "https://mos.m.taobao.com/mixo/download/sketch?id=sketch_xxx"
 * 输出: "sketch_xxx"
 */
export function extractSketchId(downloadSketchUrl: string): string | null {
  try {
    const url = new URL(downloadSketchUrl);
    return url.searchParams.get("id")?.trim() || null;
  } catch {
    return null;
  }
}
