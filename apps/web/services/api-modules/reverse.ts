// apps/web/services/api-modules/reverse.ts
/**
 * 逆向解析 API 模块
 * 包含任务创建、状态查询等方法
 */

import type { ReverseParseV2JobDto, ReverseParseV2ResultDto } from '../backendApi.types';
import type { ReverseParseV2UploadRequestPayload } from '../backendApi.reverseParseUpload';

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
// 逆向解析 API 方法
// ============================================================================

/**
 * 启动逆向解析任务
 */
export async function startReverseParseV2Job(
  request: RequestFunction,
  token: string,
  payload: ReverseParseV2UploadRequestPayload
): Promise<{ jobId: string }> {
  return request("POST", "/reverse/parse-v2/jobs", { token, body: payload });
}

/**
 * 获取逆向解析任务状态
 */
export async function getReverseParseV2Job(
  request: RequestFunction,
  token: string,
  jobId: string
): Promise<ReverseParseV2JobDto> {
  return request("GET", `/reverse/parse-v2/jobs/${jobId}`, { token });
}

/**
 * 逆向解析（快速模式）
 */
export async function reverseParse(
  request: RequestFunction,
  token: string,
  payload: { input: string; projectId?: string }
): Promise<ReverseParseV2ResultDto> {
  return request("POST", "/reverse/parse", { token, body: payload });
}