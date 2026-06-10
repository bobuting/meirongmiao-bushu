import type { ProviderRouteKey } from "./provider-route-policy-contract.js";
import { ALL_PROVIDER_ROUTE_KEYS } from "./provider-route-keys.js";
import { parseProviderRouteKey } from "./provider-route-policy-contract.js";

// 所有 Provider routeKey 都参与调试气泡，不再维护白名单。
// 新增 routeKey 时自动包含，无需额外配置。
export const LLM_DEBUG_BUBBLE_ROUTE_KEYS: readonly ProviderRouteKey[] = ALL_PROVIDER_ROUTE_KEYS as readonly ProviderRouteKey[];

const LLM_DEBUG_BUBBLE_ROUTE_KEY_SET = new Set<string>(LLM_DEBUG_BUBBLE_ROUTE_KEYS);

export type LlmDebugBubbleRouteKey = ProviderRouteKey;

export function isLlmDebugBubbleRouteKey(value: unknown): value is LlmDebugBubbleRouteKey {
  return typeof value === "string" && LLM_DEBUG_BUBBLE_ROUTE_KEY_SET.has(value.trim());
}

export function parseLlmDebugBubbleRouteKey(value: unknown): LlmDebugBubbleRouteKey {
  const normalized = parseProviderRouteKey(value);
  if (!LLM_DEBUG_BUBBLE_ROUTE_KEY_SET.has(normalized)) {
    throw new Error(`debug bubble routeKey must be one of: ${LLM_DEBUG_BUBBLE_ROUTE_KEYS.join(", ")}`);
  }
  return normalized as LlmDebugBubbleRouteKey;
}

export const LLM_DEBUG_BUBBLE_ROUTE_WHITELIST_VERSION = "ALL-1.v1";
