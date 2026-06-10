// apps/web/services/api-modules/auth.ts
/**
 * 认证 API 模块
 * 包含登录、注册、用户信息等方法
 */

import type { LoginUser, UserRole } from '../backendApi.types';

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
// 认证 API 方法
// ============================================================================

/**
 * 用户注册
 */
export async function register(
  request: RequestFunction,
  email: string,
  password: string
): Promise<{ id: string; email: string; role: UserRole }> {
  return request("POST", "/auth/register", { body: { email, password } });
}

/**
 * 用户登录
 */
export async function login(
  request: RequestFunction,
  email: string,
  password: string
): Promise<{ token: string; user: LoginUser }> {
  return request("POST", "/auth/login", { body: { email, password } });
}

/**
 * 获取当前用户信息
 */
export async function getUserInfo(
  request: RequestFunction,
  token: string
): Promise<LoginUser> {
  return request("GET", "/auth/me", { token });
}

/**
 * 用户登出
 */
export async function logout(
  request: RequestFunction,
  token: string
): Promise<void> {
  return request("POST", "/auth/logout", { token });
}