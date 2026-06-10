// apps/web/services/api-modules/step4.ts
/**
 * Step4 API 模块
 * 包含视频生成、任务状态等方法
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
// Step4 API 方法
// ============================================================================

/**
 * 创建视频任务
 */
export async function createStep4VideoJob(
  request: RequestFunction,
  token: string,
  projectId: string
): Promise<{ jobId: string }> {
  return request("POST", `/projects/${projectId}/step4/jobs`, { token });
}

/**
 * 获取视频任务状态
 */
export async function getStep4VideoJobStatus(
  request: RequestFunction,
  token: string,
  jobId: string
): Promise<unknown> {
  return request("GET", `/step4/jobs/${jobId}`, { token });
}

/**
 * 更新片段变体
 */
export async function updateStep4ClipVariant(
  request: RequestFunction,
  token: string,
  jobId: string,
  sceneIndex: number,
  variantIndex: number
): Promise<unknown> {
  return request("PATCH", `/step4/jobs/${jobId}/scenes/${sceneIndex}/variant`, { token, body: { variantIndex } });
}