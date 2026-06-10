/**
 * JSON / 文本工具函数
 *
 * 从 app.ts 提取的纯函数，处理 JSON 提取、引号去除、占位符检测等。
 */

import { jsonrepair } from "jsonrepair";

/** 从文本中提取 JSON 对象，支持 markdown 代码块包裹 */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (codeMatch?.[1] ?? text).trim();
  if (!candidate) {
    return null;
  }
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const snippet = candidate.slice(start, end + 1);
      try {
        const parsed = JSON.parse(snippet);
        if (parsed && typeof parsed === "object") {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * 修复并解析 JSON（使用 jsonrepair + 结构后处理）
 *
 * 适用于 LLM 返回的 JSON 可能存在结构缺陷的场景。
 * 策略：
 * 1. 使用 jsonrepair 修复语法错误（缺失括号、截断等）
 * 2. 后处理修正结构错误（如 video_prompt 被嵌套在 keyframe_prompt 内）
 */
export function repairAndParseJson(text: string): Record<string, unknown> | null {
  try {
    // 1. 使用 jsonrepair 修复语法
    const repaired = jsonrepair(text);

    // 2. 解析修复后的 JSON
    const parsed = JSON.parse(repaired);

    // 3. 运行时检查：确保返回的是对象（不是字符串、数字、数组等）
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    // 4. 后处理：修正 shot prompt 的结构错误
    fixShotPromptStructure(parsed as Record<string, unknown>);

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 后处理：修正 shot prompt 结构错误
 *
 * 处理 LLM 输出的常见结构问题：
 * - video_prompt 被错误嵌套在 keyframe_prompt 内
 */
function fixShotPromptStructure(parsed: Record<string, unknown>): void {
  // 检查是否有 shots 数组
  const shots = parsed.shots;
  if (!Array.isArray(shots)) return;

  for (const shot of shots) {
    if (!shot || typeof shot !== "object") continue;

    // 检查 keyframe_prompt 是否错误地包含了 video_prompt
    const keyframePrompt = shot.keyframe_prompt as Record<string, unknown> | undefined;
    if (keyframePrompt && keyframePrompt.video_prompt) {
      // 修正：把 video_prompt 提取到 shot 层级
      (shot as Record<string, unknown>).video_prompt = keyframePrompt.video_prompt;
      delete keyframePrompt.video_prompt;
    }
  }
}

/** 去除文本周围的引号（双引号、单引号、反引号） */
export function unwrapQuotedText(raw: string): string {
  const text = raw.trim();
  if (text.length < 2) {
    return text;
  }
  const quotePairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ["`", "`"],
  ];
  for (const [start, end] of quotePairs) {
    if (text.startsWith(start) && text.endsWith(end)) {
      return text.slice(1, -1).trim();
    }
  }
  return text;
}

/** 检查是否为占位符脚本内容（非真实剧本） */
export function isPlaceholderScriptContent(raw: string): boolean {
  const text = unwrapQuotedText(raw).trim();
  if (text.length < 1) {
    return true;
  }
  const normalized = text
    .toLowerCase()
    .replace(/[\s"'`]/g, "");
  if (normalized === "external" || normalized === "basic:external") {
    return true;
  }
  const lines = text
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const isReferenceLabelLine = (line: string): boolean =>
    /^参考图片\d+(?:\s*[:：]\s*.*)?$/i.test(line) || /^image\s*\d+(?:\s*[:：]\s*.*)?$/i.test(line);
  if (lines.length > 0 && lines.every(isReferenceLabelLine)) {
    return true;
  }
  return false;
}

/** 将任意值转为普通 Record（通过 JSON 序列化/反序列化） */
export function toPlainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  try {
    const normalized = JSON.parse(JSON.stringify(value)) as unknown;
    if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
      return null;
    }
    return normalized as Record<string, unknown>;
  } catch {
    return null;
  }
}