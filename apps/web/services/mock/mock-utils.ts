// apps/web/services/mock/mock-utils.ts
/**
 * Mock 辅助函数模块
 * 提供 ID 生成、延迟、错误处理等工具函数
 */

import { ApiError } from '../backendApi.types';
import { mockState, ensureMockSeeded, MockUserRecord } from './mock-state';
import { API_MOCK_DELAY_MS } from '../backendApi.config';

// ============================================================================
// ID 生成
// ============================================================================

/**
 * 生成 Mock ID
 * @param prefix ID 前缀
 */
export function mockId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================================
// 延迟模拟
// ============================================================================

/**
 * Mock API 响应延迟
 * @param delayMs 延迟毫秒数（默认使用配置值）
 */
export async function mockDelay(delayMs?: number): Promise<void> {
  const ms = delayMs ?? API_MOCK_DELAY_MS;
  if (ms > 0) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// 错误处理
// ============================================================================

/**
 * 抛出未授权错误
 */
export function unauthorized(message = "Unauthorized"): never {
  throw new ApiError(401, "UNAUTHORIZED", message);
}

/**
 * 抛出禁止访问错误
 */
export function forbidden(message = "Admin role required"): never {
  throw new ApiError(403, "FORBIDDEN", message);
}

/**
 * 抛出资源不存在错误
 */
export function notFound(message: string): never {
  throw new ApiError(404, "NOT_FOUND", message);
}

/**
 * 抛出请求错误
 */
export function badRequest(message: string): never {
  throw new ApiError(400, "BAD_REQUEST", message);
}

/**
 * 抛出冲突错误
 */
export function conflict(message: string): never {
  throw new ApiError(409, "CONFLICT", message);
}

// ============================================================================
// 用户验证
// ============================================================================

/**
 * 根据 token 获取用户
 */
export function getUserByToken(token: string): MockUserRecord {
  ensureMockSeeded();
  const userId = mockState.sessions.get(token);
  if (!userId) {
    unauthorized("Invalid or expired token");
  }
  for (const user of mockState.users.values()) {
    if (user.id === userId) {
      return user;
    }
  }
  unauthorized("User not found");
}

/**
 * 验证管理员权限
 */
export function requireAdmin(token: string): MockUserRecord {
  const user = getUserByToken(token);
  if (user.role !== "admin") {
    forbidden("Admin role required");
  }
  return user;
}