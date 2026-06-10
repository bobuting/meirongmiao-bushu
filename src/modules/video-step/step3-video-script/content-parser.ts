/**
 * Step3 视频脚本生成 - 内容解析器
 * 从 VideoScriptDataRecord 的扁平字段提取结构化数据
 * DDL 采用传统列式存储，不再有 payload_json 列
 * shot_breakdown 从独立的 nrm_shot_breakdown 表查询
 */

import type { VideoScriptDataRecord } from "../../../service/scripts-data-db-service.js";
import type {
  VideoScriptData,
  VideoScriptContent,
  VideoAnalysis,
  VideoFashionPlacement,
  ShotBreakdownItem,
} from "./types.js";
import { getLogger } from "../../../core/logger/index.js";
import type { PgShotBreakdownRepository } from "../../../repositories/pg/shot-breakdown-pg-repository.js";

const log = getLogger("content-parser");

/**
 * 批量查询多个脚本的 shot_breakdown（通过 repo）
 * 按 script_data_id 分组，解决 N+1 查询问题
 */
async function fetchShotBreakdownBatch(
  shotBreakdowns: PgShotBreakdownRepository,
  scriptIds: string[],
): Promise<Map<string, ShotBreakdownItem[]>> {
  if (scriptIds.length === 0) {
    return new Map();
  }

  try {
    const grouped = await shotBreakdowns.findByScriptDataIds(scriptIds);

    // 将原始行转换为 ShotBreakdownItem
    const result = new Map<string, ShotBreakdownItem[]>();
    for (const [scriptId, rows] of grouped) {
      const items = rows.map((row) => mapRowToShotBreakdownItem(row));
      result.set(scriptId, items);
    }
    return result;
  } catch (error) {
    log.warn({ err: error, scriptIds }, "VideoScriptParser failed to fetch shot_breakdown batch");
    return new Map();
  }
}

/**
 * 从 nrm_shot_breakdown 表查询单个脚本的分镜数据（通过 repo）
 */
async function fetchShotBreakdownByScriptId(
  shotBreakdowns: PgShotBreakdownRepository,
  scriptId: string,
): Promise<ShotBreakdownItem[]> {
  try {
    const rows = await shotBreakdowns.findByScriptDataIdFull(scriptId);
    if (rows.length === 0) {
      return [];
    }
    return rows.map((row) => mapRowToShotBreakdownItem(row));
  } catch (error) {
    log.warn({ err: error, scriptId }, "VideoScriptParser failed to fetch shot_breakdown");
    return [];
  }
}

/**
 * 将数据库行映射为 ShotBreakdownItem
 */
function mapRowToShotBreakdownItem(row: Record<string, unknown>): ShotBreakdownItem {
  const transition = row.transition_json as {
    in?: Record<string, unknown>;
    out?: Record<string, unknown>;
  } | null;

  return {
    shot_id: row.shot_index as number,
    shot_type: (row.shot_type as string) ?? undefined,
    camera_movement: (row.camera_movement as string) ?? undefined,
    shot_description: (row.shot_description as string) ?? undefined,
    timecode: row.timecode_start && row.timecode_end
      ? {
          start: row.timecode_start as string,
          end: row.timecode_end as string,
          duration_seconds: (row.duration_seconds as number) ?? 4,
        }
      : undefined,
    transition_in: (transition?.in as ShotBreakdownItem["transition_in"]) ?? undefined,
    transition_out: (transition?.out as ShotBreakdownItem["transition_out"]) ?? undefined,
    visual: (row.visual_json as ShotBreakdownItem["visual"]) ?? undefined,
    subjects: (row.subjects_json as ShotBreakdownItem["subjects"]) ?? undefined,
    audio: (row.audio_json as ShotBreakdownItem["audio"]) ?? undefined,
    text_elements: (row.text_elements_json as ShotBreakdownItem["text_elements"]) ?? undefined,
    camera_details: (row.camera_details_json as ShotBreakdownItem["camera_details"]) ?? undefined,
    speed_effects: (row.speed_effects_json as ShotBreakdownItem["speed_effects"]) ?? undefined,
  };
}

/**
 * 解析单个脚本记录（同步版本，不含 shot_breakdown）
 * 从 DDL 扁平字段重建结构化数据
 *
 * @param record VideoScriptDataRecord 数据库记录
 * @returns VideoScriptData 解析后的数据（shot_breakdown 为空数组）
 */
export function parseVideoScriptContent(record: VideoScriptDataRecord): VideoScriptData {
  const { id, title } = record;

  // 从扁平字段重建 video_analysis
  const videoAnalysis: VideoAnalysis = {
    title: title ?? undefined,
    theme: record.theme ?? undefined,
    summary: record.summary ?? undefined,
    emotion: record.emotionDetail as unknown as VideoAnalysis["emotion"] ?? undefined,
    video_type: record.videoType ?? undefined,
    video_style: record.videoStyle ?? undefined,
    target_audience: record.targetAudience ?? undefined,
    on_screen_presence: record.onScreenPresence as unknown as VideoAnalysis["on_screen_presence"] ?? undefined,
    fashion_placement: record.fashionSuitable != null ? {
      suitable: record.fashionSuitable,
      reason: record.fashionReason ?? undefined,
      recommended_styles: (record.fashionStyles as unknown as VideoFashionPlacement["recommended_styles"]) ?? undefined,
    } : undefined,
  };

  // 从扁平字段重建 video_info
  const videoInfo = {
    title: title ?? undefined,
    duration_seconds: record.durationSeconds ?? undefined,
    source: record.source ?? undefined,
    time_of_day: record.timeOfDay ?? undefined,
    weather: record.weather ?? undefined,
  };

  const parsed: VideoScriptContent = {
    video_info: videoInfo,
    video_analysis: videoAnalysis,
    shot_breakdown: [],
    editing_analysis: record.editingAnalysis as VideoScriptContent["editing_analysis"] ?? undefined,
  };

  return {
    id,
    title: title ?? "未命名脚本",
    record,
    parsed,
    sourceOssUrl: record.sourceOssUrl ?? null,
  };
}

/**
 * 解析单个脚本记录（异步版本，含 shot_breakdown 查询）
 * 从 DDL 扁平字段重建结构化数据，并从 nrm_shot_breakdown 查询分镜数据
 *
 * @param pool 数据库连接池
 * @param record VideoScriptDataRecord 数据库记录
 * @returns VideoScriptData 解析后的数据（含完整 shot_breakdown）
 */
export async function parseVideoScriptContentWithShots(
  shotBreakdowns: PgShotBreakdownRepository,
  record: VideoScriptDataRecord,
): Promise<VideoScriptData> {
  const { id, title } = record;

  // 从扁平字段重建 video_analysis
  const videoAnalysis: VideoAnalysis = {
    title: title ?? undefined,
    theme: record.theme ?? undefined,
    summary: record.summary ?? undefined,
    emotion: record.emotionDetail as unknown as VideoAnalysis["emotion"] ?? undefined,
    video_type: record.videoType ?? undefined,
    video_style: record.videoStyle ?? undefined,
    target_audience: record.targetAudience ?? undefined,
    on_screen_presence: record.onScreenPresence as unknown as VideoAnalysis["on_screen_presence"] ?? undefined,
    fashion_placement: record.fashionSuitable != null ? {
      suitable: record.fashionSuitable,
      reason: record.fashionReason ?? undefined,
      recommended_styles: (record.fashionStyles as unknown as VideoFashionPlacement["recommended_styles"]) ?? undefined,
    } : undefined,
  };

  // 从扁平字段重建 video_info
  const videoInfo = {
    title: title ?? undefined,
    duration_seconds: record.durationSeconds ?? undefined,
    source: record.source ?? undefined,
    time_of_day: record.timeOfDay ?? undefined,
    weather: record.weather ?? undefined,
  };

  // 从 nrm_shot_breakdown 表查询分镜数据
  const shotBreakdown = await fetchShotBreakdownByScriptId(shotBreakdowns, id);

  const parsed: VideoScriptContent = {
    video_info: videoInfo,
    video_analysis: videoAnalysis,
    shot_breakdown: shotBreakdown.length > 0 ? shotBreakdown : undefined,
    editing_analysis: record.editingAnalysis as VideoScriptContent["editing_analysis"] ?? undefined,
  };

  return {
    id,
    title: title ?? "未命名脚本",
    record,
    parsed,
    sourceOssUrl: record.sourceOssUrl ?? null,
  };
}

/**
 * 批量解析脚本记录（同步版本，不含 shot_breakdown）
 *
 * @param records VideoScriptDataRecord 数组
 * @returns VideoScriptData 数组
 */
export function parseVideoScriptsContents(
  records: VideoScriptDataRecord[],
): VideoScriptData[] {
  const results = records.map(parseVideoScriptContent);
  return results;
}

/**
 * 批量解析脚本记录（异步版本，含 shot_breakdown 查询）
 * 使用批量查询优化，解决 N+1 问题
 *
 * @param pool 数据库连接池
 * @param records VideoScriptDataRecord 数组
 * @returns VideoScriptData 数组（含完整 shot_breakdown）
 */
export async function parseVideoScriptsContentsWithShots(
  shotBreakdowns: PgShotBreakdownRepository,
  records: VideoScriptDataRecord[],
): Promise<VideoScriptData[]> {
  if (records.length === 0) {
    return [];
  }

  // 批量查询所有脚本的 shot_breakdown（一次 SQL）
  const scriptIds = records.map((r) => r.id);
  const shotBreakdownMap = await fetchShotBreakdownBatch(shotBreakdowns, scriptIds);

  // 解析每条记录，注入对应的 shot_breakdown
  const results = records.map((record) => {
    const { id, title } = record;

    // 从扁平字段重建 video_analysis
    const videoAnalysis: VideoAnalysis = {
      title: title ?? undefined,
      theme: record.theme ?? undefined,
      summary: record.summary ?? undefined,
      emotion: record.emotionDetail as unknown as VideoAnalysis["emotion"] ?? undefined,
      video_type: record.videoType ?? undefined,
      video_style: record.videoStyle ?? undefined,
      target_audience: record.targetAudience ?? undefined,
      atmosphere: record.atmosphere ?? undefined,
      on_screen_presence: record.onScreenPresence as unknown as VideoAnalysis["on_screen_presence"] ?? undefined,
      fashion_placement: record.fashionSuitable != null ? {
        suitable: record.fashionSuitable,
        reason: record.fashionReason ?? undefined,
        recommended_styles: (record.fashionStyles as unknown as VideoFashionPlacement["recommended_styles"]) ?? undefined,
      } : undefined,
    };

    // 从扁平字段重建 video_info
    const videoInfo = {
      title: title ?? undefined,
      duration_seconds: record.durationSeconds ?? undefined,
      source: record.source ?? undefined,
      time_of_day: record.timeOfDay ?? undefined,
      weather: record.weather ?? undefined,
      main_scene: record.mainScene ?? undefined,
    };

    // 从批量查询结果中获取 shot_breakdown
    const shotBreakdown = shotBreakdownMap.get(id) ?? [];

    const parsed: VideoScriptContent = {
      video_info: videoInfo,
      video_analysis: videoAnalysis,
      shot_breakdown: shotBreakdown.length > 0 ? shotBreakdown : undefined,
      editing_analysis: record.editingAnalysis as VideoScriptContent["editing_analysis"] ?? undefined,
    };

    return {
      id,
      title: title ?? "未命名脚本",
      record,
      parsed,
      sourceOssUrl: record.sourceOssUrl ?? null,
    };
  });

  return results;
}

/**
 * 批量解析脚本记录（不含 shot_breakdown），用于延迟查询场景
 * 先解析基础字段用于过滤，shot_breakdown 后续单独查询
 *
 * @param records VideoScriptDataRecord 数组
 * @returns VideoScriptData 数组（shot_breakdown 为空数组）
 */
export function parseVideoScriptsContentsWithoutShots(
  records: VideoScriptDataRecord[],
): VideoScriptData[] {
  const results = records.map(parseVideoScriptContent);
  return results;
}

/**
 * 为已解析的脚本补充 shot_breakdown（延迟查询）
 * 用于先过滤再查询 shot_breakdown 的场景
 *
 * @param pool 数据库连接池
 * @param scripts 已解析的脚本数组
 * @returns 补充了 shot_breakdown 的脚本数组
 */
export async function enrichWithShotBreakdown(
  shotBreakdowns: PgShotBreakdownRepository,
  scripts: VideoScriptData[],
): Promise<VideoScriptData[]> {
  if (scripts.length === 0) {
    return scripts;
  }

  // 批量查询 shot_breakdown
  const scriptIds = scripts.map((s) => s.id);
  const shotBreakdownMap = await fetchShotBreakdownBatch(shotBreakdowns, scriptIds);

  // 注入 shot_breakdown
  return scripts.map((script) => {
    if (!script.parsed) {
      return script;
    }

    const shotBreakdown = shotBreakdownMap.get(script.id) ?? [];
    return {
      ...script,
      parsed: {
        ...script.parsed,
        shot_breakdown: shotBreakdown.length > 0 ? shotBreakdown : undefined,
      },
    };
  });
}
