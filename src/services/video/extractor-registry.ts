/**
 * 视频响应提取器注册表
 * 根据 callMode 路由到对应的提取器
 */

import type { VideoResponseExtractor } from "./types.js";
import type { ProviderCallMode } from "../../contracts/types.js";

// 导入各 Provider 提取器
import { klingVideoExtractor } from "../../modules/kling-video-extractor.js";
import { klingOfficialVideoExtractor } from "../../modules/kling-official-video-extractor.js";
import { veoVideoExtractor } from "../../modules/veo-video-extractor.js";
import { veoOpenaiVideoExtractor } from "../../modules/veo-openai-video-extractor.js";
import { doubaoVideoExtractor } from "../../modules/doubao-video-extractor.js";
import { wanxVideoExtractor } from "../../modules/wanx-video-extractor.js";
import { happyHorseVideoExtractor } from "../../modules/happyhorse-video-extractor.js";
import { happyHorseVideoEditExtractor } from "../../modules/happyhorse-video-edit-extractor.js";
import { wanxiangVideoMixExtractor } from "../../modules/wanxiang-video-mix-extractor.js";
import { grokVideoExtractor } from "../../modules/grok-video-extractor.js";
import { grokImagineVideoExtractor } from "../../modules/grok-imagine-video-extractor.js";
import { grokVideoCaixiangExtractor } from "../../modules/grok-video-caixiang-extractor.js";
import { veoVideoCaixiangExtractor } from "../../modules/veo-video-caixiang-extractor.js";
import {
  animateAnyoneDetectExtractor,
  animateAnyoneTemplateExtractor,
  animateAnyoneVideoExtractor,
} from "../../modules/animate-anyone-extractor.js";

/**
 * 提取器注册表
 * callMode → 提取器实例 映射
 */
const extractorRegistry = new Map<ProviderCallMode, VideoResponseExtractor>([
  // 可灵云雾
  ["kling-video-yunwu", klingVideoExtractor],
  // 可灵官方
  ["kling-video-official", klingOfficialVideoExtractor],
  // 可灵视频编辑（云雾，响应格式与 kling-video-yunwu 一致）
  ["kling-video-edit-yunwu", klingVideoExtractor],
  // 可灵 Omni-Video（云雾，单步提交，响应格式与 kling-video-yunwu 一致）
  ["kling-omni-video-yunwu", klingVideoExtractor],

  // VEO tongyi（统一格式）
  ["veo-video-yunwu-tongyi", veoVideoExtractor],
  // VEO openai（统一格式，独立提取器）
  ["veo-video-yunwu-openai", veoOpenaiVideoExtractor],

  // 豆包
  ["doubao-seedance-video-yunwu", doubaoVideoExtractor],

  // 万相
  ["wanx-video-bailian", wanxVideoExtractor],

  // 快乐马（参考生视频，多图指代）
  ["happyhorse-video-bailian", happyHorseVideoExtractor],
  // 快乐马视频编辑（视频+参考图编辑换装）
  ["happyhorse-video-edit-bailian", happyHorseVideoEditExtractor],
  // 万相视频换人（wan2.2-animate-mix，视频角色替换）
  ["wanxiang-video-mix-bailian", wanxiangVideoMixExtractor],

  // Grok 视频（云雾，扁平响应格式）
  ["grok-video-yunwu", grokVideoExtractor],
  // Grok Imagine 视频（云雾，OpenAI 视频格式）
  ["grok-imagine-video-yunwu", grokImagineVideoExtractor],
  // Grok 视频（才翔AI，嵌套 params 格式）
  ["grok-video-caixiang", grokVideoCaixiangExtractor],
  // VEO 视频（才翔AI，嵌套 params 格式）
  ["veo-video-caixiang", veoVideoCaixiangExtractor],

  // AnimateAnyone 动作迁移（三步流程）
  ["animate-anyone-detect-bailian", animateAnyoneDetectExtractor],
  ["animate-anyone-template-bailian", animateAnyoneTemplateExtractor],
  ["animate-anyone-video-bailian", animateAnyoneVideoExtractor],
]);

/**
 * 获取提取器
 * @param callMode Provider 调用模式
 * @returns 对应的提取器实例
 * @throws Error 如果 callMode 未注册
 */
export function getExtractor(callMode: ProviderCallMode): VideoResponseExtractor {
  const extractor = extractorRegistry.get(callMode);
  if (!extractor) {
    throw new Error(`Unsupported video callMode: ${callMode}`);
  }
  return extractor;
}

/**
 * 检查 callMode 是否支持
 */
export function isSupportedCallMode(callMode: string): boolean {
  return extractorRegistry.has(callMode as ProviderCallMode);
}

/**
 * 获取所有支持的 callMode 列表
 */
export function getSupportedCallModes(): ProviderCallMode[] {
  return [...extractorRegistry.keys()];
}
