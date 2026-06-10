/**
 * 热榜文本清理函数
 * 从 app.ts 迁移，包含文本标准化和清理相关函数
 *
 * 迁移源: app.ts 行 7780-7915
 */

import {
  HOT_TREND_MIN_NARRATION_CHARS,
  HOT_TREND_STEP3_MAX_STORYBOARD_SEGMENTS,
} from "../constants.js";
import type { HotTrendShotBreakdown } from "../types.js";

// ============================================================================
// 营销词汇清理
// ============================================================================

/** 显式营销词汇模式 */
const HOT_TREND_EXPLICIT_MARKETING_PATTERN =
  /(可承载服装软广叙事|可承载软广叙事|可承载软广|可承载种草|可承载植入|服装软广|软广告|软广|种草|强植入|自然植入|植入位|广告感|硬广|转化导向|转化|下单|卖点|带货)/gu;

// ============================================================================
// 文本清理函数
// ============================================================================

/**
 * 清理热榜叙述文本
 * 去除营销词汇、多余标点、空白字符
 */
export function sanitizeHotTrendNarrativeText(text: string): string {
  const normalized = String(text ?? "").trim();
  if (!normalized) {
    return "";
  }
  return normalized
    .replace(HOT_TREND_EXPLICIT_MARKETING_PATTERN, "")
    .replace(/[（(]\s*[)）]/gu, "")
    .replace(/[，,。.!！？?；;]{2,}/gu, "。")
    .replace(/\s{2,}/gu, " ")
    .replace(/\s+([，。！？；])/gu, "$1")
    .trim();
}

/**
 * 标准化热榜叙述行
 * 去除镜头前缀、列表前缀、旁白前缀
 */
export function normalizeHotTrendNarrationLine(line: string): string {
  return sanitizeHotTrendNarrativeText(
    line
      .replace(/^镜头\s*\d+\s*[:：-]?\s*/u, "")
      .replace(/^(?:[-*•·]|\d+[.)、]|[（(]?\d+[）)])\s*/u, "")
      .replace(/^旁白\s*[:：]\s*/u, "")
      .trim(),
  );
}

/**
 * 检查是否应跳过该叙述行
 */
export function shouldSkipHotTrendNarrationLine(line: string): boolean {
  return /^(?:#\s*热榜元数据|视频主题|视频简介|场景设定|主场景|辅助场景|时间|天气|氛围|抖音标题|封面文案|角色设定表|服装设定表|分镜表)\b/u.test(
    line,
  );
}

// ============================================================================
// 句子分割与合并
// ============================================================================

/**
 * 合并短叙述块
 */
export function mergeShortHotTrendNarrationBlocks(blocks: string[]): string[] {
  const merged: string[] = [];
  let pending = "";

  for (const raw of blocks) {
    const normalized = sanitizeHotTrendNarrativeText(String(raw ?? ""));
    if (!normalized) {
      continue;
    }

    if (pending.length > 0) {
      const joined = sanitizeHotTrendNarrativeText(`${pending}${normalized}`);
      if (joined.length < HOT_TREND_MIN_NARRATION_CHARS) {
        pending = joined;
        continue;
      }
      merged.push(joined);
      pending = "";
      continue;
    }

    if (normalized.length < HOT_TREND_MIN_NARRATION_CHARS) {
      if (merged.length > 0) {
        merged[merged.length - 1] = sanitizeHotTrendNarrativeText(`${merged[merged.length - 1]}${normalized}`);
      } else {
        pending = normalized;
      }
      continue;
    }

    merged.push(normalized);
  }

  if (pending.length > 0) {
    if (merged.length > 0) {
      merged[merged.length - 1] = sanitizeHotTrendNarrativeText(`${merged[merged.length - 1]}${pending}`);
    } else {
      merged.push(pending);
    }
  }

  return merged.filter((item) => item.length > 0);
}

/**
 * 分割热榜叙述句子
 */
export function splitHotTrendNarrationSentences(text: string): string[] {
  const rawLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const scriptLines: string[] = [];
  let inMetaSection = false;

  for (const rawLine of rawLines) {
    if (rawLine.startsWith("# 热榜元数据")) {
      inMetaSection = true;
      continue;
    }
    if (inMetaSection && rawLine.startsWith("- ")) {
      continue;
    }
    const normalized = normalizeHotTrendNarrationLine(rawLine);
    if (!normalized || shouldSkipHotTrendNarrationLine(normalized)) {
      continue;
    }
    scriptLines.push(normalized);
  }

  const baseLines =
    scriptLines.length > 0
      ? scriptLines
      : [normalizeHotTrendNarrationLine(text)].filter((line) => line.length > 0);

  const sentenceBlocks = baseLines
    .flatMap((line) =>
      line
        .split(/(?<=[。！？!?；;])/u)
        .map((chunk) => sanitizeHotTrendNarrativeText(chunk))
        .filter((chunk) => chunk.length > 0),
    );

  return mergeShortHotTrendNarrationBlocks(sentenceBlocks).slice(0, HOT_TREND_STEP3_MAX_STORYBOARD_SEGMENTS);
}

// ============================================================================
// 分镜限制
// ============================================================================

/**
 * 限制分镜片段数量
 */
export function limitHotTrendShotBreakdowns<T>(segments: T[]): T[] {
  return segments.slice(0, HOT_TREND_STEP3_MAX_STORYBOARD_SEGMENTS);
}

// ============================================================================
// 分镜脚本构建
// ============================================================================

/**
 * 从脚本文本构建分镜片段
 */
export function buildHotTrendShotBreakdownsFromScriptText(scriptText: string): HotTrendShotBreakdown[] {
  const sentenceLines = splitHotTrendNarrationSentences(scriptText);
  if (sentenceLines.length < 1) {
    return [
      {
        title: "镜头 1",
        content: "（暂无脚本内容）",
        visualCue: "画面：补充主体动作与环境细节",
        visualPrompt: "画面：补充主体动作与环境细节",
      },
    ];
  }

  const shotPlan = [
    { title: "场景建立", lens: "远景", movement: "轻推", focus: "人物与环境关系" },
    { title: "动作承接", lens: "中景", movement: "跟拍", focus: "主角动作与步态" },
    { title: "细节捕捉", lens: "近景", movement: "平移", focus: "面料纹理与穿着状态" },
    { title: "情绪推进", lens: "半身", movement: "环绕", focus: "人物神态与互动" },
    { title: "氛围收束", lens: "特写", movement: "缓推", focus: "情绪落点与收尾动作" },
  ] as const;

  return sentenceLines.slice(0, HOT_TREND_STEP3_MAX_STORYBOARD_SEGMENTS).map((line, index) => {
    const compact = sanitizeHotTrendNarrativeText(line.replace(/\s+/g, " ").trim());
    const plan = shotPlan[index % shotPlan.length]!;
    const visualCue = sanitizeHotTrendNarrativeText(
      `画面：${plan.lens}${plan.movement}，${compact.slice(0, 56) || "补充主体动作与环境细节"}；重点呈现${plan.focus}。`,
    );

    return {
      title: `镜头 ${index + 1} · ${plan.title}`,
      content: compact,
      visualCue,
      visualPrompt: visualCue,
    };
  });
}

// ============================================================================
// 抖音来源URL清理
// ============================================================================

/**
 * 清理抖音来源URL
 */
export function normalizeHotTrendDouyinSourceUrl(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl || typeof sourceUrl !== "string") {
    return null;
  }
  const trimmed = sourceUrl.trim();
  if (!trimmed.startsWith("http")) {
    return null;
  }
  // 移除尾部无效字符
  return trimmed.replace(/[，。；、]$/u, "");
}

/**
 * 压缩文本行（移除多余空白，截断到指定长度）
 */
export function compactHotTrendTextLine(value: string, maxLength = 1000): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/**
 * 汇总热榜审计片段
 */
export function summarizeHotTrendAuditSnippet(text: string, max = 180): string {
  return compactHotTrendTextLine(sanitizeHotTrendNarrativeText(text), max);
}