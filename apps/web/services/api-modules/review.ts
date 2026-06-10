// apps/web/services/api-modules/review.ts
/**
 * 审核后台 API 模块
 * 包含审核队列、审批等方法
 */

// ============================================================================
// 请求函数类型（与新签名匹配）
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
// 审核 API 方法
// ============================================================================

/**
 * 获取审核队列
 */
export async function getReviewQueue(
  request: RequestFunction,
  token: string
): Promise<unknown> {
  return request("GET", "/review/queue", { token });
}

/**
 * 审批项目
 */
export async function approveReviewItem(
  request: RequestFunction,
  token: string,
  itemId: string
): Promise<unknown> {
  return request("POST", `/review/items/${itemId}/approve`, { token });
}