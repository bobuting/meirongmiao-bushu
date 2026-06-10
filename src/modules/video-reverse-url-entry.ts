export type ReverseVideoEntrySource = "douyin_url" | "video_url" | "local_file";

export const REVERSE_PARSE_V2_VIDEO_URL_GOAL = "分析这个视频的内容主题、镜头节奏和可复刻脚本。";

import type { VideoScriptPayload } from "../service/scripts-data-db-service.js";

function normalizeText(value: string): string {
  return value.trim();
}

export function buildReverseVideoUrlPayload(resultText: string): VideoScriptPayload {
  // 尝试解析 JSON 结构化响应
  try {
    const parsed = JSON.parse(resultText);
    if (parsed && typeof parsed === "object") {
      // LLM 返回完整结构化数据，直接使用
      return {
        video_info: parsed.video_info ?? { source: "upload_file" },
        video_analysis: parsed.video_analysis ?? { summary: "反推脚本内容为空" },
        shot_breakdown: parsed.shot_breakdown ?? [],
        editing_analysis: parsed.editing_analysis ?? undefined,
      };
    }
  } catch {
    // JSON 解析失败，按旧逻辑处理
  }
  // 非结构化响应，把文本当 summary
  const summary = normalizeText(resultText);
  return {
    video_info: {
      source: "upload_file",
    },
    video_analysis: {
      summary: summary.length > 0 ? summary : "反推脚本内容为空",
    },
  };
}

export function resolveReverseEntryKeyword(source: ReverseVideoEntrySource): "#URL反推" | "#视频链接反推" | "#文件反推" {
  if (source === "video_url") {
    return "#视频链接反推";
  }
  if (source === "local_file") {
    return "#文件反推";
  }
  return "#URL反推";
}

export function shouldPersistReverseSourceInput(source: ReverseVideoEntrySource): boolean {
  return source === "douyin_url" || source === "video_url";
}
