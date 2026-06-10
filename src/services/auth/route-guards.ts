/**
 * 认证路由守卫函数
 * 从 app.ts 提取的路由级认证辅助函数
 */

import { type FastifyRequest } from "fastify";
import { type User } from "../../contracts/types.js";
import { AppError } from "../../core/errors.js";
import { type AppContext } from "../../core/app-context.js";

/** 从请求头提取 Bearer token */
export function getBearerToken(request: FastifyRequest): string {
  const header = request.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) {
    throw new AppError(401, "UNAUTHORIZED", "Missing bearer token");
  }
  return header.slice("Bearer ".length);
}

/** 要求用户登录，返回 User 对象 */
export async function requireUser(ctx: AppContext, request: FastifyRequest): Promise<User> {
  return await ctx.authService.requireUser(getBearerToken(request));
}

/** 要求管理员权限，调用 requireUser */
export async function requireAdmin(ctx: AppContext, request: FastifyRequest): Promise<User> {
  const user = await requireUser(ctx, request);
  if (user.role !== "admin") {
    throw new AppError(403, "FORBIDDEN", "Admin only");
  }
  return user;
}

/** 通过扩展 Token 验证身份，返回关联的 User 对象 */
export async function requireExtUser(ctx: AppContext, request: FastifyRequest): Promise<User> {
  const token = getBearerToken(request);
  const userId = await ctx.repos.extTokens.findValidUserIdByToken(token, Date.now());
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "无效或已过期的扩展 Token");
  }
  return await ctx.authService.requireUserById(userId);
}

/** 同时支持 session token 和 ext token 认证 */
export async function requireAnyUser(ctx: AppContext, request: FastifyRequest): Promise<User> {
  // 优先尝试 session 认证
  try {
    return await requireUser(ctx, request);
  } catch (sessionError) {
    // 只对认证失败 fallback 到 ext token，其他错误（如数据库故障）直接抛出
    if (sessionError instanceof AppError && sessionError.statusCode === 401) {
      return await requireExtUser(ctx, request);
    }
    throw sessionError;
  }
}
