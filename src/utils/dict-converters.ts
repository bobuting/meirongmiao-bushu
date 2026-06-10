/**
 * 统一字典类型转换辅助函数
 * 用于处理旧数据或未严格遵循统一字典的输出
 */

import type { AtmosphereSceneCategory, EmotionToneCategory } from "../contant-config/style-atmosphere-dict.js";
import {
  isValidAtmosphereScene,
  isValidEmotionTone,
  parseAtmosphereSceneFromText,
  parseEmotionToneFromText,
  ATMOSPHERE_SCENE_OPTIONS,
  EMOTION_TONE_OPTIONS,
} from "../contant-config/style-atmosphere-dict.js";

/**
 * 安全转换 atmosphere 字符串为统一字典类型
 */
export function safeParseAtmosphere(value: string | undefined | null): AtmosphereSceneCategory | null {
  if (!value) return null;

  // 直接验证
  if (isValidAtmosphereScene(value)) {
    return value as AtmosphereSceneCategory;
  }

  // 尝试解析
  const parsed = parseAtmosphereSceneFromText(value);
  return parsed;
}

/**
 * 安全转换 emotionTone 字符串为统一字典类型
 */
export function safeParseEmotionTone(value: string | undefined | null): EmotionToneCategory | null {
  if (!value) return null;

  // 直接验证
  if (isValidEmotionTone(value)) {
    return value as EmotionToneCategory;
  }

  // 尝试解析
  const parsed = parseEmotionToneFromText(value);
  return parsed;
}

/**
 * 批量转换 atmosphere 数组
 */
export function safeParseAtmosphereArray(values: string[] | undefined | null): AtmosphereSceneCategory[] {
  if (!values || !Array.isArray(values)) return [];

  return values
    .map(safeParseAtmosphere)
    .filter((v): v is AtmosphereSceneCategory => v !== null);
}

/**
 * 批量转换 emotionTone 数组
 */
export function safeParseEmotionToneArray(values: string[] | undefined | null): EmotionToneCategory[] {
  if (!values || !Array.isArray(values)) return [];

  return values
    .map(safeParseEmotionTone)
    .filter((v): v is EmotionToneCategory => v !== null);
}