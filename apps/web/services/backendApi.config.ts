// apps/web/services/backendApi.config.ts
/**
 * backendApi 配置模块
 * 提取环境变量解析和 API 模式配置
 */

import type { ApiFeature } from './backendApi.types';

// ============================================================================
// 环境变量解析
// ============================================================================

const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}) as Record<
  string,
  string | undefined
>;

const API_BASE = (env.VITE_API_BASE_URL ?? "").trim();
/** 所有 API 路由统一前缀，导出供其他模块使用 */
export const API_PATH_PREFIX = "/neirongmiao/api";

// ============================================================================
// API 模式配置
// ============================================================================

type ApiMode = "real" | "mock" | "hybrid";

function normalizeMode(raw: string | undefined): ApiMode {
  const normalized = (raw ?? "").toLowerCase().trim();
  if (normalized === "real") return "real";
  if (normalized === "mock") return "mock";
  if (normalized === "hybrid") return "hybrid";
  return "real"; // 默认使用真实 API
}

function normalizeBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return fallback;
}

function parseFeatureList(raw: string | undefined): Set<ApiFeature> {
  if (!raw) return new Set();
  const items = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return new Set(items.map((item) => FEATURE_ALIAS[item] ?? item as ApiFeature));
}

// ============================================================================
// 配置常量
// ============================================================================

export const API_MODE: ApiMode = normalizeMode(env.VITE_API_MODE);
export const API_REAL_FEATURES: Set<ApiFeature> = parseFeatureList(env.VITE_API_REAL_FEATURES);
export const API_REAL_FALLBACK_TO_MOCK: boolean = normalizeBoolean(env.VITE_API_REAL_FALLBACK_TO_MOCK, false);
export const API_MOCK_DELAY_MS: number = Number.parseInt(env.VITE_API_MOCK_DELAY_MS ?? "120", 10) || 0;

// ============================================================================
// Feature 别名映射
// ============================================================================

export const FEATURE_ALIAS: Record<string, ApiFeature> = {
  auth: "auth",
  projects: "projects",
  project: "projects",
  uploads: "uploads",
  upload: "uploads",
  outfit: "outfit",
  outfits: "outfit",
  characters: "characters",
  character: "characters",
  scripts: "scripts",
  script: "scripts",
  storyboard: "storyboard",
  storyboards: "storyboard",
  video: "video",
  "video-jobs": "video",
  videojobs: "video",
  export: "export",
  reverse: "reverse",
  review: "review",
  reviews: "review",
  square: "square",
  me: "me",
  admin: "admin",
  library: "library",
  assets: "library",
  characters_library: "library",
  scripts_library: "library",
};

export const ALL_FEATURES: ApiFeature[] = [
  "auth",
  "projects",
  "uploads",
  "outfit",
  "characters",
  "scripts",
  "storyboard",
  "video",
  "export",
  "reverse",
  "review",
  "square",
  "me",
  "admin",
  "library",
];

// ============================================================================
// API 基础 URL
// ============================================================================

export function getApiBaseUrl(): string {
  return API_BASE + API_PATH_PREFIX;
}

// ============================================================================
// runtime 导出
// ============================================================================

export const backendApiRuntime = {
  mode: API_MODE,
  realFeatures: API_REAL_FEATURES,
  fallbackToMock: API_REAL_FALLBACK_TO_MOCK,
  mockDelayMs: API_MOCK_DELAY_MS,
};