/**
 * 图片路由解析服务
 *
 * 从 app.ts 提取的图片生成路由解析功能。
 */

import type { AppContext } from "../core/app-context.js";
import type { ProviderRouteKey } from "../contracts/types.js";
import type { ResolvedRouteProvider } from "../services/llm/provider-resolver.js";
import { AppError } from "../core/errors.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";
import { resolveRouteProviderWithFallback } from "../services/llm/provider-resolver.js";

/**
 * 解析图片生成路由
 *
 * 按优先级尝试 image_to_image, text_to_image, image_generation 路由。
 * 当没有可用的 provider 时抛出 AppError。
 */
export async function resolveImageRoute(
  ctx: AppContext,
): Promise<{ routeKey: ProviderRouteKey; provider: ResolvedRouteProvider }> {
  const result = await resolveRouteProviderWithFallback(ctx, [ProviderRouteKeys.IMAGE_GENERATION]);
  if (!result) {
    throw new AppError(503, "IMAGE_PROVIDER_NOT_AVAILABLE", "没有可用的图片生成服务提供者");
  }
  return result;
}

/**
 * 尝试解析图片生成路由（带降级处理）
 *
 * 用于需要在 UI 层优雅展示错误的场景（如视图生成）。
 * 按优先级尝试 image_to_image, text_to_image, image_generation 路由。
 *
 * 注意：此函数用于需要优雅降级的特定场景。主流程应使用 resolveImageRoute。
 */
export async function tryResolveImageRoute(
  ctx: AppContext,
  routeKey?: ProviderRouteKey,
): Promise<{ route: { routeKey: ProviderRouteKey; provider: ResolvedRouteProvider } | null; warning: string | null }> {
  try {
    const result = await resolveRouteProviderWithFallback(ctx, [routeKey ?? ProviderRouteKeys.IMAGE_GENERATION]);
    return { route: result, warning: null };
  } catch (error) {
    return {
      route: null,
      warning: error instanceof Error ? error.message : String(error),
    };
  }
}