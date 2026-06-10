/**
 * 脚本反推解析纯函数
 *
 * 从 app.ts 提取的脚本/反推相关纯函数，
 * 负责标准化载荷、构建提示词、构建种子值等。
 */

import { unwrapQuotedText, isPlaceholderScriptContent } from "../utils/json-utils.js";
import { AppError } from "../../core/errors.js";

// ---------------------------------------------------------------------------
// 脚本提示 hints 类型（多个函数共用）
// ---------------------------------------------------------------------------

export interface ScriptHints {
  source: string;
  overviews: string[];
  itemCount: number;
}

// ---------------------------------------------------------------------------
// normalizeScriptPayload — 标准化脚本载荷
// ---------------------------------------------------------------------------

export function normalizeScriptPayload(raw: Record<string, unknown> | null): {
  basicInfo: string;
  roleTable: string;
  outfitTable: string;
  storyboard: string;
} | null {
  if (!raw) {
    return null;
  }
  const asText = (value: unknown, fallback: string): string => {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    return fallback;
  };
  return {
    basicInfo: asText(raw.basicInfo, "basic:external"),
    roleTable: asText(raw.roleTable, "role-table"),
    outfitTable: asText(raw.outfitTable, "outfit-table"),
    storyboard: asText(raw.storyboard, "storyboard-table"),
  };
}

// ---------------------------------------------------------------------------
// normalizeReverseOverviews — 标准化反推概览
// ---------------------------------------------------------------------------

export function normalizeReverseOverviews(
  scriptHints: ScriptHints | null | undefined,
): string[] {
  if (!scriptHints || !Array.isArray(scriptHints.overviews)) {
    return [];
  }
  return scriptHints.overviews
    .map((item) => String(item ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 5);
}

// ---------------------------------------------------------------------------
// buildReverseScriptPrompt — 构建反推脚本提示词
// ---------------------------------------------------------------------------

export function buildReverseScriptPrompt(
  resolvedVideoUrl: string,
  scriptHints: ScriptHints | null | undefined,
): string {
  const overviews = normalizeReverseOverviews(scriptHints);
  if (overviews.length < 1) {
    return `Reverse-engineer a short-video script from this Douyin video URL: ${resolvedVideoUrl}.`;
  }
  const lines = overviews.map((item, index) => `${index + 1}. ${item}`).join("\n");
  return [
    `Reverse-engineer a short-video script from this Douyin material.`,
    `Video URL: ${resolvedVideoUrl}`,
    `Use these extracted overviews as primary evidence:`,
    lines,
    `Target style: concise, practical, suitable for e-commerce soft-ad narration.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// buildReverseScriptSeed — 构建反推脚本种子
// ---------------------------------------------------------------------------

export function buildReverseScriptSeed(
  resolvedVideoUrl: string,
  scriptHints: ScriptHints | null | undefined,
): string {
  const overviews = normalizeReverseOverviews(scriptHints);
  if (overviews.length < 1) {
    return `reverse-video-url:${resolvedVideoUrl}`;
  }
  return `reverse-overview:${overviews.join(" | ").slice(0, 1200)}`;
}

// ---------------------------------------------------------------------------
// buildReverseScriptBasicInfo — 构建反推脚本基本信息
// ---------------------------------------------------------------------------

export function buildReverseScriptBasicInfo(
  resolvedVideoUrl: string,
  scriptHints: ScriptHints | null | undefined,
): string {
  const overviews = normalizeReverseOverviews(scriptHints);
  if (overviews.length < 1) {
    return `基于视频链接提取：${resolvedVideoUrl}`;
  }
  return overviews.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

// ---------------------------------------------------------------------------
// buildReverseScriptFallbackPayload — 构建反推脚本 fallback 载荷
// ---------------------------------------------------------------------------

export function buildReverseScriptFallbackPayload(
  resolvedVideoUrl: string,
  scriptHints: ScriptHints | null | undefined,
): {
  basicInfo: string;
  roleTable: string;
  outfitTable: string;
  storyboard: string;
  rawText: string;
} {
  return {
    basicInfo: buildReverseScriptBasicInfo(resolvedVideoUrl, scriptHints),
    roleTable: "角色分工：可按原视频人物关系自行补充。",
    outfitTable: "服装建议：延续原视频穿搭风格，突出主视觉对比。",
    storyboard: "分镜建议：按开场钩子-主体信息-行动引导三段式展开。",
    rawText: "fallback",
  };
}

// ---------------------------------------------------------------------------
// assertRealScriptContent — 断言真实脚本内容
// ---------------------------------------------------------------------------

export function assertRealScriptContent(raw: string): string {
  const text = unwrapQuotedText(raw).trim();
  if (isPlaceholderScriptContent(text)) {
    throw new AppError(502, "LLM_SCRIPT_CONTENT_INVALID", "LLM returned placeholder script content");
  }
  return text;
}

