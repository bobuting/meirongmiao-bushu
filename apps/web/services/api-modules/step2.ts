// apps/web/services/api-modules/step2.ts
/**
 * Step2 API 模块
 * 包含角色定妆、视图生成等方法
 */

import type { CharacterViewKey } from '../backendApi.types';

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
// Step2 API 方法
// ============================================================================

/**
 * 创建角色
 */
export async function createStep2Character(
  request: RequestFunction,
  token: string,
  projectId: string,
  name: string
): Promise<{ id: string; name: string }> {
  return request("POST", `/projects/${projectId}/step2/characters`, { token, body: { name } });
}

/**
 * 生成角色视图
 */
export async function generateStep2View(
  request: RequestFunction,
  token: string,
  projectId: string,
  characterId: string,
  viewKey: CharacterViewKey
): Promise<unknown> {
  return request("POST", `/projects/${projectId}/step2/characters/${characterId}/views/${viewKey}/generate`, { token });
}

/**
 * 确认视图选择
 */
export async function confirmStep2ViewSelection(
  request: RequestFunction,
  token: string,
  projectId: string,
  characterId: string,
  viewKey: CharacterViewKey,
  imageUrl: string
): Promise<unknown> {
  return request("POST", `/projects/${projectId}/step2/characters/${characterId}/views/${viewKey}/confirm`, { token, body: { imageUrl } });
}