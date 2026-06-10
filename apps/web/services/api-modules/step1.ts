// apps/web/services/api-modules/step1.ts
/**
 * Step1 API 模块
 * 包含服装上传、图像分类、背景移除等方法
 */

import type { Step1ImageClassificationResultDto } from '../backendApi.types';

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
// Step1 API 方法
// ============================================================================

/**
 * 图像分类
 */
export async function classifyStep1Image(
  request: RequestFunction,
  token: string,
  imageUrl: string
): Promise<Step1ImageClassificationResultDto> {
  return request("POST", "/step1/classify", { token, body: { imageUrl } });
}

/**
 * 分析服装模块
 */
export async function analyzeStep1OutfitModule(
  request: RequestFunction,
  token: string,
  projectId: string,
  moduleId: string,
  images: string[]
): Promise<unknown> {
  return request("POST", `/projects/${projectId}/step1/modules/${moduleId}/analyze`, { token, body: { images } });
}