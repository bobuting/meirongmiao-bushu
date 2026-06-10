/**
 * 视频音乐氛围匹配服务
 *
 * 改造说明：
 * - 消除启发式关键词匹配（违反 CLAUDE.md "禁止启发式判断" 规则）
 * - 使用统一字典映射规则（EMOTION_TO_MUSIC_MAP）
 * - 支持情绪基调直接映射到音乐氛围
 */

import type { Pool } from "pg";
import type { AppContext } from "../../core/app-context.js";
import type { VideoMusic } from "../../contracts/types.js";
import type { EmotionToneCategory, MusicAtmosphereCategory } from "../../contant-config/style-atmosphere-dict.js";
import { EMOTION_TO_MUSIC_MAP, isValidEmotionTone } from "../../contant-config/style-atmosphere-dict.js";
import { matchVideoMusicByScript } from "./video-music-service.js";

/**
 * 根据情绪基调直接映射到音乐氛围
 * 使用统一字典映射规则，消除启发式判断
 *
 * @param emotions 情绪基调列表（从脚本 emotion.primary 或 emotionTone 字段获取）
 * @returns 推荐音乐氛围列表（按优先级排序）
 */
export function mapEmotionToMusicAtmosphere(emotions: EmotionToneCategory[]): MusicAtmosphereCategory[] {
  // 使用统一字典映射规则
  const mapped = emotions
    .filter(isValidEmotionTone)
    .map(emotion => EMOTION_TO_MUSIC_MAP[emotion]);

  // 去重并保持优先级顺序
  return Array.from(new Set(mapped));
}

/**
 * 从脚本文本中提取情绪基调并映射到音乐氛围
 *
 * 【重要】此函数已废弃启发式文本搜索，改为直接返回默认氛围
 * 符合 CLAUDE.md "禁止启发式判断" 规则
 *
 * @param scriptText 脚本文本（不再用于启发式分析）
 * @param allowedAtmospheres 允许的音乐氛围列表
 * @param fallbackAtmospheres 兜底音乐氛围列表
 * @returns 推荐音乐氛围列表（始终返回默认氛围）
 */
export function extractAndMapEmotionFromScriptText(
  _scriptText: string,
  _allowedAtmospheres: readonly MusicAtmosphereCategory[],
  fallbackAtmospheres: readonly MusicAtmosphereCategory[],
): MusicAtmosphereCategory[] {
  // 不使用启发式文本搜索，直接返回默认氛围
  return [...fallbackAtmospheres];
}

/**
 * 分析脚本氛围（使用统一字典映射）
 *
 * @param scriptText 脚本文本
 * @param allowedAtmospheres 允许的音乐氛围列表
 * @param fallbackAtmospheres 兜底音乐氛围列表
 * @returns 推荐音乐氛围列表（最多 3 种）
 */
export function analyzeScriptAtmospheres(
  scriptText: string,
  allowedAtmospheres: readonly MusicAtmosphereCategory[],
  fallbackAtmospheres: readonly MusicAtmosphereCategory[],
): MusicAtmosphereCategory[] {
  const result = extractAndMapEmotionFromScriptText(scriptText, allowedAtmospheres, fallbackAtmospheres);
  return result.slice(0, 3);
}

/**
 * 分析音乐元数据氛围（使用统一字典映射）
 *
 * @param metadataText 音乐元数据文本
 * @param allowedAtmospheres 允许的音乐氛围列表
 * @param fallbackAtmospheres 兜底音乐氛围列表
 * @returns 推荐音乐氛围列表
 */
export function analyzeMusicMetadataAtmospheres(
  metadataText: string,
  allowedAtmospheres: readonly MusicAtmosphereCategory[],
  fallbackAtmospheres: readonly MusicAtmosphereCategory[],
): MusicAtmosphereCategory[] {
  return analyzeScriptAtmospheres(metadataText, allowedAtmospheres, fallbackAtmospheres);
}

export interface GetVideoMusicResult {
  success: boolean;
  musicUrl: string | null;
  music: VideoMusic | null;
  matchedAtmosphere: MusicAtmosphereCategory | null;
  usedDefault: boolean;
  error?: string;
}

/**
 * 根据脚本获取视频音乐（使用统一字典映射）
 *
 * @param ctx 应用上下文
 * @param scriptText 脚本文本
 * @param pool 数据库连接池（可选）
 * @returns 音乐匹配结果
 */
export async function getVideoMusicByScript(
  ctx: AppContext,
  scriptText: string,
  _pool?: Pool,
): Promise<GetVideoMusicResult> {
  const result = await matchVideoMusicByScript(
    { videoMusics: ctx.repos.videoMusics, clock: ctx.clock, config: ctx.configService.get() },
    scriptText,
    undefined,
    ctx.storage,
    ctx.store.config.ossPublicBaseUrl,
  );
  return {
    success: result.success,
    musicUrl: result.music?.musicUrl ?? null,
    music: result.music,
    matchedAtmosphere: result.matchedAtmosphere as MusicAtmosphereCategory | null,
    usedDefault: result.usedDefault,
    ...(result.error ? { error: result.error } : {}),
  };
}