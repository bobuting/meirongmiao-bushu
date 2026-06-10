// apps/web/services/api-modules/square.ts
/**
 * 广场 API 模块
 * 仅包含模板数据的查询方法
 */

// ============================================================================
// 类型定义
// ============================================================================

/** 来源类型（仅模板） */
export type SourceType = "template";

/** 广场内容项统一结构 */
export interface SquareContentItem {
  id: string;
  title: string;
  coverUrl: string;
  videoUrl: string | null;
  category: string;
  sourceType: SourceType;
  sourceLabel: string; // "✨精选"
  author: string | null;
  views: number;
  likes: number;
  createdAt: number;
}

/** 聚合查询参数 */
export interface AggregateQueryParams {
  category?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/** 分页结果 */
export interface AggregateQueryResult {
  data: SquareContentItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 行为类型 - 仅支持 view 和 click */
export type BehaviorType = "view" | "click";

/** 行为追踪参数 */
export interface TrackBehaviorParams {
  itemId: string;
  itemType: "template";
  itemCategory: string;
  behaviorType: BehaviorType;
  sessionId?: string;
}

/** 行为追踪响应 */
export interface TrackBehaviorResponse {
  success: boolean;
}

// ============================================================================
// 请求函数类型
// ============================================================================

type RequestOptions = {
  token?: string;
  body?: unknown;
};

type RequestFunction = <T>(
  method: string,
  path: string,
  options?: RequestOptions
) => Promise<T>;

// ============================================================================
// 广场 API 方法
// ============================================================================

/**
 * 聚合查询广场内容（仅模板）
 * 支持分类筛选和分页
 */
export async function getSquareAggregate(
  request: RequestFunction,
  params?: AggregateQueryParams
): Promise<AggregateQueryResult> {
  const searchParams = new URLSearchParams();
  if (params?.category) searchParams.set("category", params.category);
  if (params?.keyword) searchParams.set("keyword", params.keyword);
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.pageSize) searchParams.set("pageSize", String(params.pageSize));

  const queryString = searchParams.toString();
  const path = queryString ? `/square/aggregate?${queryString}` : "/square/aggregate";

  const raw = await request<Record<string, unknown>>("GET", path);
  // 后端返回 { success, data, pagination: { page, pageSize, total, totalPages } }
  const pagination = (raw.pagination ?? {}) as Record<string, unknown>;
  return {
    data: (raw.data ?? []) as SquareContentItem[],
    total: (pagination.total ?? 0) as number,
    page: (pagination.page ?? 1) as number,
    pageSize: (pagination.pageSize ?? 20) as number,
    totalPages: (pagination.totalPages ?? 1) as number,
  };
}

/**
 * 行为追踪
 * 记录用户在广场的浏览、点击等行为
 */
export async function trackSquareBehavior(
  request: RequestFunction,
  token: string,
  params: TrackBehaviorParams
): Promise<TrackBehaviorResponse> {
  return request("POST", "/square/track-behavior", { token, body: params });
}