/**
 * 审美特征库服务
 * 负责提取主流审美特征（细化类别）、用户反馈分析、流行度评分计算
 */

import type { PgAestheticLibraryRepository } from "../repositories/pg/aesthetic-library-pg-repository.js";
import { randomUUID } from "node:crypto";
import { AppError } from "../core/errors.js";
import { AGE_GROUPS, getAgeGroupByAge, type AgeGroupRange } from "../constants/age-groups.js";

// ========== 类型定义 ==========

export interface AestheticFeature {
  featureCategory: string;  // 细化类别：'eye_shape_width', 'eye_color_hazel', 'skin_tone_warm_beige'
  featureName: string;
  featureDescription: string;
  ethnicityApplicable: string[];
  ageRange: string;
  popularityScore: number;
  trendPeriod: string;
  source: string;
  sourceMetadata: Record<string, any>;
  sourceImageUrl?: string;  // 原始 CDN URL
  ossImageUrl?: string;     // OSS 持久化 URL
}

/** 审美特征组合结果（与模板字段一一对应） */
export interface AestheticFeaturesResult {
  /** 眼型特征（眼型 + 眼色组合描述） */
  eyeShape: string;
  /** 面部轮廓特征（鼻型等轮廓组合描述） */
  faceContour: string;
  /** 皮肤质感特征（肤色 + 质感组合描述） */
  skinTexture: string;
  /** 整体风格特征（发型等整体风格描述） */
  overallStyle: string;
}

export class AestheticLibraryService {
  constructor(private repo: PgAestheticLibraryRepository) {}

  // ========== 提取主流审美特征（细化类别） ==========

  /**
   * 从审美特征库提取主流特征（细化类别，popularity_score >= 0.7）
   * 注入到提示词变量中
   */
  async extractAestheticFeatures(
    ethnicity: string | null,
    age: number | null,
    trendPeriod: string = "current",
  ): Promise<AestheticFeaturesResult> {
    // 1. 校验必需参数
    if (age == null) {
      throw new AppError(400, "MISSING_AGE", "年龄参数缺失，无法确定查询哪个年龄段的审美特征库");
    }

    // 2. 确定趋势周期（默认当前季度）
    const currentPeriod = trendPeriod === "current" ? this.getCurrentQuarter() : trendPeriod;

    // 3. 查询高流行度细化特征（popularity_score >= 0.7）
    const rows = await this.repo.extractFeatures({
      ethnicityList: ethnicity ? [ethnicity] : ["Asian", "Mixed", "Caucasian"],
      ageRange: AGE_GROUPS[getAgeGroupByAge(age)].range as AgeGroupRange,
      trendPeriod: currentPeriod,
    });

    // 3. 随机组合细化特征（每个子类别随机选择一个）
    const featuresMap: Record<string, string> = {};

    for (const row of rows) {
      const category = row.feature_category;
      if (!featuresMap[category]) {
        // 首次遇到该细化类别，赋值（随机化已保证多样性）
        featuresMap[category] = row.feature_description;
      }
    }

    // 4. 按 ethnicity 选择种族匹配的 fallback（数据库无数据时使用）
    const fallbacks = getAestheticFallbacks(ethnicity);

    // 5. 将细粒度特征组合为模板期望的 4 个字段
    const compose = (categories: string[], fallback: string): string => {
      const parts = categories
        .map((c) => featuresMap[c])
        .filter(Boolean);
      return parts.length > 0 ? parts.join(", ") : fallback;
    };

    const features: AestheticFeaturesResult = {
      eyeShape: compose(
        ["eye_shape_width", "eye_shape_almond", "eye_shape_round", "eye_color_hazel", "eye_color_dark_brown", "eye_color_light_brown"],
        fallbacks.eyeShape,
      ),
      faceContour: compose(
        ["nose_shape_button_defined", "nose_shape_small_flat"],
        fallbacks.faceContour,
      ),
      skinTexture: compose(
        ["skin_tone_warm_beige", "skin_tone_olive", "skin_tone_rosy_cheeks"],
        fallbacks.skinTexture,
      ),
      overallStyle: compose(
        ["hair_style_soft_waves", "hair_style_natural_straight", "hair_style_chestnut_brown"],
        fallbacks.overallStyle,
      ),
    };

    return features;
  }

  // ========== 用户反馈分析 ==========

  /**
   * 分析用户评分，动态调整特征流行度
   * 实时执行（每次五视图生成完成后）
   */
  async analyzeUserFeedback(
    characterId: string,
    userRating: number, // 1-5星
    generatedFeatures: Record<string, string>, // 本次生成使用的细化特征
  ): Promise<void> {
    // 1. 高分案例（>=4星）：提升特征流行度
    if (userRating >= 4) {
      for (const [category, description] of Object.entries(generatedFeatures)) {
        await this.repo.boostFeaturePopularity(category, description);
      }
    }

    // 2. 低分案例（<=2星）：降低特征流行度（甚至淘汰）
    if (userRating <= 2) {
      for (const [category, description] of Object.entries(generatedFeatures)) {
        await this.repo.reduceFeaturePopularity(category, description);
        await this.repo.deactivateLowPopularity();
      }
    }
  }

  // ========== 工具方法 ==========

  /**
   * 获取当前季度（如 2026-q1）
   */
  private getCurrentQuarter(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-12
    const quarter = Math.ceil(month / 3); // 1-4
    return `${year}-q${quarter}`;
  }

  /**
   * 创建或更新审美特征（入库）
   */
  async upsertAestheticFeature(feature: AestheticFeature): Promise<void> {
    await this.repo.upsertFeature({
      id: randomUUID(),
      featureCategory: feature.featureCategory,
      featureName: feature.featureName,
      featureDescription: feature.featureDescription,
      ethnicityApplicable: feature.ethnicityApplicable,
      ageRange: feature.ageRange,
      popularityScore: feature.popularityScore,
      trendPeriod: feature.trendPeriod,
      source: feature.source,
      sourceMetadata: feature.sourceMetadata,
      createdAt: Date.now(),
      sourceImageUrl: feature.sourceImageUrl ?? null,
      ossImageUrl: feature.ossImageUrl ?? null,
    });
  }
}

// ============================================================================
// 种族匹配的审美特征 fallback
// ============================================================================

/** fallback 按种族大类分组，避免和 ethnicityBaseline 矛盾 */
const AESTHETIC_FALLBACKS: Record<string, AestheticFeaturesResult> = {
  // 欧洲类：高鼻梁、多变眼色、浅肤色
  european: {
    eyeShape: "Natural almond eyes, varied eye colors (blue, green, brown)",
    faceContour: "Defined jawline, prominent nose bridge, high cheekbones",
    skinTexture: "Fair to medium skin tone",
    overallStyle: "Natural wavy or straight hair, varied colors",
  },
  // 亚洲类：柔和轮廓、深色眼、黑发
  asian: {
    eyeShape: "Natural almond eyes, dark brown",
    faceContour: "Soft jawline, small straight nose",
    skinTexture: "Natural skin tone",
    overallStyle: "Natural straight hair",
  },
  // 非洲类：深色皮肤、卷发、饱满嘴唇
  african: {
    eyeShape: "Round almond eyes, dark brown",
    faceContour: "Defined cheekbones, broad nose, full lips",
    skinTexture: "Dark skin tone",
    overallStyle: "Natural curly or coily hair",
  },
  // 拉丁类：暖色调、深色头发、立体五官
  latino: {
    eyeShape: "Expressive almond eyes, dark brown",
    faceContour: "Warm features, defined cheekbones, medium nose bridge",
    skinTexture: "Warm skin tone",
    overallStyle: "Natural wavy dark hair",
  },
  // 中东类：橄榄色皮肤、深色特征
  middle_eastern: {
    eyeShape: "Expressive almond eyes, dark brown",
    faceContour: "Olive skin, defined features, prominent nose",
    skinTexture: "Olive skin tone",
    overallStyle: "Dark wavy or straight hair",
  },
};

const DEFAULT_FALLBACK: AestheticFeaturesResult = AESTHETIC_FALLBACKS.asian;

/** 根据 ethnicity 选择匹配的 fallback */
function getAestheticFallbacks(ethnicity: string | null): AestheticFeaturesResult {
  if (!ethnicity) return DEFAULT_FALLBACK;

  const lower = ethnicity.toLowerCase();

  if (/(europe|caucasian|white|western|north european|nordic)/.test(lower)) {
    return AESTHETIC_FALLBACKS.european;
  }
  if (/(african|black)/.test(lower)) {
    return AESTHETIC_FALLBACKS.african;
  }
  if (/(latin|hispanic)/.test(lower)) {
    return AESTHETIC_FALLBACKS.latino;
  }
  if (/(middle east|arab|persian|turkish)/.test(lower)) {
    return AESTHETIC_FALLBACKS.middle_eastern;
  }

  // Asian 及其他默认
  return DEFAULT_FALLBACK;
}
