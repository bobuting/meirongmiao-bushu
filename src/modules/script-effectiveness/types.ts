/**
 * 脚本有效性分析模块 - 类型定义
 *
 * 借鉴 BettaFish 的核心逻辑，基于服饰资产和角色信息生成符合 nrm_script_data 表格式的脚本
 */

import type { GarmentAsset, LibraryCharacter } from "../../contracts/types.js";
import { resolveGarmentImageUrl } from "../../contracts/types.js";

// 统一使用 scripts-data-db-service 中的 VideoScriptPayload
import type { VideoScriptPayload } from "../../service/scripts-data-db-service.js";
export type { VideoScriptPayload };

// ============================================================================
// 输入类型
// ============================================================================

/** 服饰资产输入（从资产表格提取） */
export interface OutfitAssetInput {
  assetId: string;
  name: string;
  /** 资产分类 */
  category: string;
  url: string;
  /** 服饰描述 */
  description?: string;
  /** 风格 */
  style?: string;
  /** 适用场景 */
  occasion?: string;
  /** 分类结果（来自 AI 分析） */
  classification?: {
    category?: string;
    viewLabel?: string;
    confidence?: number;
    reason?: string;
  };
}

/** 角色信息输入（从角色库提取） */
export interface CharacterInfoInput {
  characterId: string;
  name: string;
  kind: "basic" | "image" | "video";
  thumbnailUrl: string;
  tags: string[];
  /** 风格 */
  style?: string;
  /** 年龄 */
  age?: number;
  /** 性别 */
  gender?: "male" | "female";
  /** 体型 */
  bodyType?: string;
  /** 发型 */
  hairStyle?: string;
  /** 肤色 */
  skinTone?: string;
  /** 独特特征 */
  uniqueFeatures?: string;
  /** 五视图图板 URL */
  fiveViewOssImageUrl?: string | null;
}

/** 热点资产快照（从 nrm_hot_trend_assets + nrm_script_data 提取） */
export interface HotTrendAssetSnapshot {
  /** 热点资产 ID（来自 nrm_hot_trend_assets.id） */
  insightId: string;
  /** 热点话题标题 */
  title: string;
  /** 热点标签（从脚本分析结果提取） */
  labels: string[];
  /** 服饰植入适用性 */
  suitability: "high" | "medium" | "low";
  /** 脚本标题 */
  scriptTitle: string;
  /** 脚本摘要内容 */
  scriptContent: string;
  /** 提取的关键词（用于匹配） */
  keywords: string[];
  /** 情感倾向 */
  sentiment?: "positive" | "negative" | "neutral";
}

/** 角色方向信息（使用统一类型，不含 styleSummary） */
export type RoleDirectionInput = import("../video-step/shared/character-prompt-builder.js").CharacterDirectionInfo;

/** 脚本生成输入 */
export interface ScriptGenerationInput {
  /** 用户 ID */
  userId: string;
  /** 服饰资产列表 */
  assets: OutfitAssetInput[];
  /** 角色信息列表 */
  characters: CharacterInfoInput[];
  /** 角色描述（从 projectContext 汇总的综合描述） */
  characterDescription?: string;
  /** 穿搭/搭配描述（来自 selectedOutfit.analysis 或 optimizedPrompt） */
  outfitDescription?: string;
  /** 搭配参考描述（来自 projectContext.matchingReference） */
  matchingReference?: string;
  /** 服饰风格列表 */
  clothingStyles?: string[];
  /** 选中的角色方向 */
  selectedRoleDirection?: RoleDirectionInput | null;
  /** 分析配置 */
  analysisConfig?: {
    maxIterations?: number;
    effectivenessThreshold?: number;
  };
}

// ============================================================================
// 输出类型 - 统一使用 scripts-data-db-service 中的 VideoScriptPayload
// ============================================================================

/** 脚本数据记录（nrm_script_data 表行） */
export interface ScriptDataRecord {
  /** 主键 ID */
  id: string;
  /** 脚本类型：5 = ScriptType.EFFECTIVENESS */
  type: number;
  /** 脚本内容 */
  payloadJson: VideoScriptPayload;
  /** 来源脚本 ID */
  sourceScriptId?: string | null;
  /** 关联项目 ID */
  projectId?: string | null;
}

// ============================================================================
// 辅助函数
// ============================================================================

/** 从 GarmentAsset 转换为 OutfitAssetInput */
export function toOutfitAssetInput(asset: GarmentAsset): OutfitAssetInput {
  return {
    assetId: asset.id,
    name: asset.name,
    category: asset.category,
    url: resolveGarmentImageUrl(asset),
    classification: asset.aiCategory
      ? {
          category: asset.aiCategory,
          viewLabel: asset.aiViewLabel ?? undefined,
          confidence: asset.aiConfidence ?? undefined,
          reason: asset.aiReason ?? undefined,
        }
      : undefined,
  };
}

/** 从 LibraryCharacter 转换为 CharacterInfoInput */
export function toCharacterInfoInput(character: LibraryCharacter): CharacterInfoInput {
  return {
    characterId: character.id,
    name: character.name,
    kind: character.kind,
    thumbnailUrl: character.thumbnailUrl,
    tags: character.tags,
    style: character.style ?? undefined,
    age: character.age ?? undefined,
    gender: character.gender ?? undefined,
    bodyType: character.bodyType ?? undefined,
    hairStyle: character.hairStyle ?? undefined,
    skinTone: character.skinTone ?? undefined,
    uniqueFeatures: character.uniqueFeatures ?? undefined,
    fiveViewOssImageUrl: character.fiveViewOssImageUrl,
  };
}