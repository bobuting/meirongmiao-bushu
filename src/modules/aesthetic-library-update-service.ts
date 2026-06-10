/**
 * 审美特征库定时更新服务
 * 每日运行 TikHub API 爬取小红书/Instagram/微博/抖音数据，使用 AI 分析图片提取审美特征
 */

import type { AppContext } from "../core/app-context.js";
import type { XiaohongshuNote, InstagramPost, WeiboPost, DouyinPost } from "../services/crawler/tikhub-client.js";
import type { ResolvedRouteProvider } from "../services/llm/provider-resolver.js";
import type { PgRepositoryCollection } from "../repositories/pg/index.js";
import { TikHubClient } from "../services/crawler/tikhub-client.js";
import { AestheticLibraryService, type AestheticFeature } from "../services/aesthetic-library-service.js";
import { resolveRouteProvider } from "../services/llm/provider-resolver.js";
import { requestLlmPlainTextWithMetadata } from "../services/llm/llm-transport.js";
import { downloadAndUploadImage } from "../service/oss/download-upload.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";
import { getLogger } from "../core/logger/index.js";
import { AppError } from "../core/errors.js";
import { skillLoader } from "../services/skills/index.js";
import { crawlAllPlatforms, type PlatformCrawlConfig } from "./platform-crawl-utils.js";
import {
  type AgeGroupRange,
  AGE_GROUP_RANGES,
  isChildAgeGroup,
  getAgeGroupByRange,
} from "../constants/age-groups.js";

const log = getLogger("AestheticLibraryUpdateService");

// ============================================================================
// 关键词配置常量（按统一年龄段分类）
// ============================================================================

/** 新生儿关键词配置（0-1岁） */
const NEWBORN_KEYWORDS_CONFIG = {
  xiaohongshuKeywords: [
    "新生儿穿搭", "婴儿穿搭", "宝宝穿搭", "0岁穿搭", "1岁穿搭", "新生儿摄影"
  ],
  instagramHashtags: [
    "newbornfashion", "babyfashion", "newbornstyle", "babyootd"
  ],
  weiboKeywords: [
    "新生儿穿搭", "婴儿搭配", "新生宝宝日常"
  ],
  douyinKeywords: [
    "新生儿穿搭", "婴儿时尚", "新生宝宝日常"
  ]
};

/** 婴童关键词配置（2-3岁） */
const INFANT_KEYWORDS_CONFIG = {
  xiaohongshuKeywords: [
    "婴童穿搭", "婴儿发型", "宝宝时尚", "2岁穿搭", "3岁穿搭"
  ],
  instagramHashtags: [
    "infantfashion", "babyfashion", "babystyle", "toddlerootd"
  ],
  weiboKeywords: [
    "婴童穿搭", "宝宝搭配", "萌宝日常"
  ],
  douyinKeywords: [
    "婴童穿搭", "宝宝时尚", "萌宝日常"
  ]
};

/** 幼童关键词配置（4-6岁） */
const TODDLER_KEYWORDS_CONFIG = {
  xiaohongshuKeywords: [
    "幼童穿搭", "幼儿园穿搭", "4岁穿搭", "5岁穿搭", "6岁穿搭"
  ],
  instagramHashtags: [
    "toddlerfashion", "preschoolerstyle", "kidsootd"
  ],
  weiboKeywords: [
    "幼童穿搭", "幼儿园搭配", "萌娃日常"
  ],
  douyinKeywords: [
    "幼童穿搭", "幼儿园穿搭", "萌娃日常"
  ]
};

/** 儿童关键词配置（7-12岁） */
const KID_KEYWORDS_CONFIG = {
  xiaohongshuKeywords: [
    "儿童穿搭", "混血宝宝", "潮童", "儿童发型", "儿童时尚"
  ],
  instagramHashtags: [
    "childfashion", "mixedracechild", "kidstyle", "childrenswear"
  ],
  weiboKeywords: [
    "儿童穿搭", "童装搭配", "萌娃穿搭"
  ],
  douyinKeywords: [
    "儿童穿搭", "潮童穿搭", "萌娃日常"
  ]
};

/** 青少年关键词配置（13-17岁） */
const TEEN_KEYWORDS_CONFIG = {
  xiaohongshuKeywords: [
    "青少年穿搭", "学生穿搭", "青春期穿搭", "高中生穿搭", "初中生穿搭"
  ],
  instagramHashtags: [
    "teenfashion", "studentstyle", "teenstyle", "teenootd"
  ],
  weiboKeywords: [
    "青少年穿搭", "学生搭配", "校园穿搭"
  ],
  douyinKeywords: [
    "青少年穿搭", "学生穿搭", "校园日常"
  ]
};

/** 年轻成人关键词配置（18-25岁） */
const YOUNG_ADULT_KEYWORDS_CONFIG = {
  xiaohongshuKeywords: [
    "年轻人穿搭", "大学生穿搭", "轻熟穿搭", "时尚博主", "年轻发型"
  ],
  instagramHashtags: [
    "youngadultfashion", "collegefashion", "youngstyle", "ootdyoung"
  ],
  weiboKeywords: [
    "年轻人穿搭", "大学生搭配", "轻熟风"
  ],
  douyinKeywords: [
    "年轻人穿搭", "大学生穿搭", "轻熟日常"
  ]
};

/** 成人关键词配置（26-30岁） */
const ADULT_KEYWORDS_CONFIG = {
  xiaohongshuKeywords: [
    "成人穿搭", "时尚博主", "成人发型", "模特脸型", "成人化妆"
  ],
  instagramHashtags: [
    "adultfashion", "fashionblogger", "adultstyle", "professionalstyle"
  ],
  weiboKeywords: [
    "成人穿搭", "职场穿搭", "时尚搭配"
  ],
  douyinKeywords: [
    "成人穿搭", "职场穿搭", "时尚日常"
  ]
};

/** 年龄段关键词配置映射（使用统一年龄段，键与 AgeGroupRange 一致） */
const AGE_RANGE_KEYWORDS_CONFIG: Record<string, typeof INFANT_KEYWORDS_CONFIG> = {
  "0-1": NEWBORN_KEYWORDS_CONFIG,
  "2-3": INFANT_KEYWORDS_CONFIG,
  "4-6": TODDLER_KEYWORDS_CONFIG,
  "7-12": KID_KEYWORDS_CONFIG,
  "13-17": TEEN_KEYWORDS_CONFIG,
  "18-25": YOUNG_ADULT_KEYWORDS_CONFIG,
  "26-30": ADULT_KEYWORDS_CONFIG,
};

/** 成人特征分类关键词映射 */
const ADULT_FEATURE_KEYWORDS = {
  jawline_definition: {
    xiaohongshu: ["下颌线", "瓜子脸", "V脸", "下颌角"],
    instagram: ["jawline", "vshapeface", "definedjaw"],
    weibo: ["下颌线", "瓜子脸", "V脸"],
    douyin: ["下颌线", "瓜子脸", "V脸"]
  },
  cheekbone_prominence: {
    xiaohongshu: ["颧骨", "高颧骨", "苹果肌"],
    instagram: ["cheekbones", "highcheekbones"],
    weibo: ["颧骨", "高颧骨", "苹果肌"],
    douyin: ["颧骨", "高颧骨", "苹果肌"]
  },
  lip_fullness: {
    xiaohongshu: ["唇形", "丰满嘴唇", "M唇", "嘟嘟唇"],
    instagram: ["fulllips", "mplips", "lipshape"],
    weibo: ["唇形", "M唇", "嘟嘟唇"],
    douyin: ["唇形", "嘟嘟唇"]
  },
  eyebrow_shape: {
    xiaohongshu: ["眉形", "眉毛", "眉弓", "剑眉"],
    instagram: ["eyebrowshape", "brows", "archedbrows"],
    weibo: ["眉形", "眉毛", "眉弓"],
    douyin: ["眉形", "眉毛", "眉弓"]
  }
};

/**
 * 年龄范围类型（使用统一年龄段）
 */
export type AgeRange = AgeGroupRange;

/**
 * 审美特征库更新配置
 */
export interface AestheticUpdateConfig extends PlatformCrawlConfig {
  /** TikHub API Key（从环境变量读取） */
  tikhubApiKey: string;
  /** 年龄范围（儿童或成人） */
  ageRange: AgeRange;
  /** 是否启用更新（可通过环境变量控制） */
  enabled: boolean;
}

/**
 * 审美特征库更新结果
 */
export interface AestheticUpdateResult {
  /** 是否成功执行 */
  success: boolean;
  /** 小红书爬取数量 */
  xiaohongshuCount: number;
  /** Instagram 爬取数量 */
  instagramCount: number;
  /** 微博爬取数量 */
  weiboCount: number;
  /** 抖音爬取数量 */
  douyinCount: number;
  /** 新增/更新特征数量 */
  featuresUpdated: number;
  /** 执行耗时（毫秒） */
  durationMs: number;
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * 运行记录的触发方式
 */
export type UpdateTriggerType = "scheduled" | "manual";

/**
 * 运行记录状态
 */
export type UpdateLogStatus = "running" | "success" | "failed" | "skipped";

/**
 * 运行记录
 */
export interface AestheticUpdateLog {
  id: string;
  triggerType: UpdateTriggerType;
  status: UpdateLogStatus;
  ageRange: string | null;
  xiaohongshuCount: number;
  instagramCount: number;
  weiboCount: number;
  douyinCount: number;
  featuresUpdated: number;
  durationMs: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}

/**
 * 运行记录列表结果（分页）
 */
export interface UpdateLogListResult {
  items: AestheticUpdateLog[];
  total: number;
  page: number;
  limit: number;
}

/**
 * 审美特征库定时更新服务
 * 负责每日爬取社交媒体数据，AI 分析图片，更新审美特征库
 */
export class AestheticLibraryUpdateService {
  private tikhubClient: TikHubClient;
  private aestheticLibraryService: AestheticLibraryService;
  private config: AestheticUpdateConfig;

  constructor(
    private repos: PgRepositoryCollection,
    private ctx: AppContext,
    config?: Partial<AestheticUpdateConfig>
  ) {
    // 默认年龄范围（使用新格式）
    const defaultAgeRange: AgeRange = '7-12'; // 儿童段，最常用
    const defaultKeywordsConfig = AGE_RANGE_KEYWORDS_CONFIG[defaultAgeRange];

    // 从环境变量读取配置
    this.config = {
      tikhubApiKey: process.env.TIKHUB_API_TOKEN || "",
      ageRange: config?.ageRange || defaultAgeRange,
      xiaohongshuKeywords: defaultKeywordsConfig.xiaohongshuKeywords,
      instagramHashtags: defaultKeywordsConfig.instagramHashtags,
      weiboKeywords: defaultKeywordsConfig.weiboKeywords,
      douyinKeywords: defaultKeywordsConfig.douyinKeywords,
      fetchLimit: 50,
      enabled: process.env.AESTHETIC_LIBRARY_UPDATE_ENABLED !== "false",
      ...config,
    };

    this.tikhubClient = new TikHubClient(this.config.tikhubApiKey);
    this.aestheticLibraryService = new AestheticLibraryService(this.ctx.repos.aestheticLibrary);
  }

  /**
   * 执行审美特征库更新（定时任务和手动触发共用）
   * @param triggerType 触发方式：scheduled=定时任务, manual=手动触发
   */
  async runScheduledUpdate(triggerType: UpdateTriggerType = "scheduled"): Promise<AestheticUpdateResult> {
    const startTime = Date.now();

    // 1. 检查是否启用
    if (!this.config.enabled && triggerType === "scheduled") {
      log.info("审美特征库更新已禁用，跳过执行");
      return {
        success: false, xiaohongshuCount: 0, instagramCount: 0, weiboCount: 0, douyinCount: 0,
        featuresUpdated: 0, durationMs: 0, error: "更新已禁用",
      };
    }

    // 2. 检查 API Key 配置
    if (!this.config.tikhubApiKey) {
      log.warn("TikHub API Key 未配置，跳过执行");
      return {
        success: false, xiaohongshuCount: 0, instagramCount: 0, weiboCount: 0, douyinCount: 0,
        featuresUpdated: 0, durationMs: 0, error: "TikHub API Key 未配置",
      };
    }

    // 3. 插入 running 状态的运行记录
    const logId = await this.repos.aestheticUpdateLogs.insertLog({
      triggerType,
      ageRange: this.config.ageRange,
    });

    log.info("开始执行审美特征库更新任务");

    try {
      // 4. 并行爬取各平台数据
      const { xiaohongshuNotes, instagramPosts, weiboPosts, douyinPosts } = await crawlAllPlatforms(this.tikhubClient, this.config);
      // 全部平台爬取失败时应直接报错，而非静默完成空更新
      const totalFetched = xiaohongshuNotes.length + instagramPosts.length + weiboPosts.length + douyinPosts.length;
      if (totalFetched === 0) {
        throw new Error("所有平台爬取均失败（小红书、Instagram、微博、抖音），无法执行审美特征库更新");
      }
      log.info(`爬取完成：小红书 ${xiaohongshuNotes.length} 条，Instagram ${instagramPosts.length} 条，微博 ${weiboPosts.length} 条，抖音 ${douyinPosts.length} 条`);

      // 5. AI 分析图片，提取审美特征
      const extractedFeatures = await this.extractFeaturesFromData(
        xiaohongshuNotes, instagramPosts, weiboPosts, douyinPosts
      );
      log.info(`AI 分析完成，提取 ${extractedFeatures.length} 个特征`);

      // 6. 更新数据库
      let featuresUpdated = 0;
      for (const feature of extractedFeatures) {
        await this.aestheticLibraryService.upsertAestheticFeature(feature);
        featuresUpdated++;
      }
      log.info(`数据库更新完成，共 ${featuresUpdated} 个特征`);

      // 7. 计算综合评分（每日）
      await this.repos.aestheticLibrary.updatePopularityScores();
      log.info("综合评分计算完成");

      const durationMs = Date.now() - startTime;
      log.info(`审美特征库更新完成，耗时 ${Math.round(durationMs / 1000)} 秒`);

      // 8. 更新运行记录为成功
      await this.repos.aestheticUpdateLogs.finishLog(logId, "success", {
        xiaohongshuCount: xiaohongshuNotes.length,
        instagramCount: instagramPosts.length,
        weiboCount: weiboPosts.length,
        douyinCount: douyinPosts.length,
        featuresUpdated,
        durationMs,
      });

      return {
        success: true,
        xiaohongshuCount: xiaohongshuNotes.length,
        instagramCount: instagramPosts.length,
        weiboCount: weiboPosts.length,
        douyinCount: douyinPosts.length,
        featuresUpdated,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error({ error: errorMessage }, "审美特征库更新失败");

      // 更新运行记录为失败
      await this.repos.aestheticUpdateLogs.finishLog(logId, "failed", {
        xiaohongshuCount: 0, instagramCount: 0, weiboCount: 0, douyinCount: 0,
        featuresUpdated: 0, durationMs, errorMessage,
      });

      return {
        success: false, xiaohongshuCount: 0, instagramCount: 0, weiboCount: 0, douyinCount: 0,
        featuresUpdated: 0, durationMs, error: errorMessage,
      };
    }
  }

  /**
   * 更新审美特征库（支持指定年龄范围和特征分类）
   * 可手动调用，用于按年龄范围和特征分类更新特征库
   *
   * ⚠️ 并发警告：此方法临时修改实例配置，不支持并发调用。
   * 当前无路由暴露，仅用于内部定时任务。如需对外暴露，需重构为参数传递模式。
   */
  async updateLibrary(params: {
    ageRange: AgeRange;
    featureCategories?: string[];
    triggerType?: UpdateTriggerType;
  }): Promise<{ updated: number; added: number }> {
    // 将 ageRange 中的 '-' 替换为 '_' 以匹配配置键
    const config = AGE_RANGE_KEYWORDS_CONFIG[params.ageRange];

    if (!config) {
      throw new AppError(400, 'INVALID_AGE_RANGE', `不支持的年龄范围: ${params.ageRange}`);
    }

    // 构建临时关键词（不修改实例状态）
    let xiaohongshuKeywords = [...config.xiaohongshuKeywords];
    let instagramHashtags = [...config.instagramHashtags];
    let weiboKeywords = [...config.weiboKeywords];
    let douyinKeywords = [...config.douyinKeywords];

    // 合并特征分类关键词（仅成人范围：18-25 或 26-30）
    if ((params.ageRange === '18-25' || params.ageRange === '26-30') && params.featureCategories?.length) {
      for (const category of params.featureCategories) {
        const featureKeywords = ADULT_FEATURE_KEYWORDS[category as keyof typeof ADULT_FEATURE_KEYWORDS];
        if (featureKeywords) {
          xiaohongshuKeywords.push(...featureKeywords.xiaohongshu);
          instagramHashtags.push(...featureKeywords.instagram);
          weiboKeywords.push(...featureKeywords.weibo);
          douyinKeywords.push(...featureKeywords.douyin);
        }
      }
    }

    // 保存原始配置
    const originalXiaohongshuKeywords = this.config.xiaohongshuKeywords;
    const originalInstagramHashtags = this.config.instagramHashtags;
    const originalWeiboKeywords = this.config.weiboKeywords;
    const originalDouyinKeywords = this.config.douyinKeywords;
    const originalAgeRange = this.config.ageRange;

    try {
      // 临时更新配置
      this.config.xiaohongshuKeywords = xiaohongshuKeywords;
      this.config.instagramHashtags = instagramHashtags;
      this.config.weiboKeywords = weiboKeywords;
      this.config.douyinKeywords = douyinKeywords;
      this.config.ageRange = params.ageRange;

      log.info({
        ageRange: params.ageRange,
        featureCategories: params.featureCategories,
        keywordCount: xiaohongshuKeywords.length + instagramHashtags.length + weiboKeywords.length + douyinKeywords.length
      }, "开始按年龄范围和特征分类更新审美特征库");

      // 执行更新（复用 runScheduledUpdate 的核心逻辑）
      const triggerType = params.triggerType || "manual";
      const result = await this.runScheduledUpdate(triggerType);

      return {
        updated: result.featuresUpdated,
        added: result.featuresUpdated
      };
    } finally {
      // 恢复原始配置（确保并发安全）
      this.config.xiaohongshuKeywords = originalXiaohongshuKeywords;
      this.config.instagramHashtags = originalInstagramHashtags;
      this.config.weiboKeywords = originalWeiboKeywords;
      this.config.douyinKeywords = originalDouyinKeywords;
      this.config.ageRange = originalAgeRange;
    }
  }

  /**
   * AI 分析图片数据，提取审美特征
   * 使用 LLM 分析图片 URL，提取儿童面部特征（细化类别）
   */
  private async extractFeaturesFromData(
    xiaohongshuNotes: XiaohongshuNote[],
    instagramPosts: InstagramPost[],
    weiboPosts: WeiboPost[],
    douyinPosts: DouyinPost[]
  ): Promise<AestheticFeature[]> {
    const features: AestheticFeature[] = [];

    // 合并所有平台数据为统一结构
    const allData = [
      ...xiaohongshuNotes.map((note) => ({
        platform: "xiaohongshu",
        id: note.noteId,
        title: note.title,
        description: note.description,
        imageUrls: note.imageUrls,
        likesCount: note.likesCount,
        fansCount: note.authorFansCount,
        tags: note.tags,
      })),
      ...instagramPosts.map((post) => ({
        platform: "instagram",
        id: post.postId,
        title: "",
        description: post.caption,
        imageUrls: post.imageUrls,
        likesCount: post.likesCount,
        fansCount: post.authorFansCount,
        tags: [],
      })),
      ...weiboPosts.map((post) => ({
        platform: "weibo",
        id: post.postId,
        title: "",
        description: post.text,
        imageUrls: post.imageUrls,
        likesCount: post.likesCount,
        fansCount: post.authorFansCount,
        tags: [],
      })),
      ...douyinPosts.map((post) => ({
        platform: "douyin",
        id: post.awemeId,
        title: "",
        description: post.description,
        imageUrls: post.imageUrls,
        likesCount: post.likesCount,
        fansCount: post.authorFansCount,
        tags: [],
      })),
    ];

    // 批量分析（每批 5 张图片，避免 API 费用过高）
    const batchSize = 5;
    for (let i = 0; i < Math.min(allData.length, 10); i += batchSize) {
      const batch = allData.slice(i, i + batchSize);

      for (const item of batch) {
        if (item.imageUrls.length === 0) continue;

        try {
          // 下载图片到 OSS，用稳定的 OSS URL 传给模型
          const sourceImageUrl = item.imageUrls[0];
          let ossImageUrl: string | undefined;

          const storage = this.ctx.storage;
          if (storage) {
            try {
              const ossKey = `aesthetic/${this.config.ageRange}/${item.platform}/${item.id}_${Date.now()}.jpg`;
              const uploadResult = await downloadAndUploadImage(sourceImageUrl, storage, ossKey);
              ossImageUrl = uploadResult.url;
              log.info({ platform: item.platform, ossKey }, "图片已上传到 OSS");
            } catch (ossError) {
              log.warn({ error: ossError instanceof Error ? ossError.message : String(ossError) }, "图片下载到 OSS 失败，使用原始 URL");
            }
          }

          // 优先用 OSS URL，回退到原始 CDN URL
          const imageUrlForLlm = ossImageUrl || sourceImageUrl;

          // 调用 LLM API 分析图片
          const extractedFeature = await this.analyzeImageWithLLM(imageUrlForLlm, item);

          if (extractedFeature) {
            // 持久化原始 URL 和 OSS URL
            extractedFeature.sourceImageUrl = sourceImageUrl;
            extractedFeature.ossImageUrl = ossImageUrl;
            features.push(extractedFeature);
          }
        } catch (error) {
          log.warn({
            error: error instanceof Error ? error.message : String(error),
            platform: item.platform,
          }, `图片分析失败（${item.platform}）`);
        }
      }
    }

    return features;
  }

  /**
   * 使用 LLM 分析单张图片，提取审美特征
   * 通过 ProviderRouteKey 体系调用 LLM Vision
   */
  private async analyzeImageWithLLM(
    imageUrl: string,
    item: { platform: string; likesCount: number; fansCount: number; tags: string[] },
  ): Promise<AestheticFeature | null> {

    try {
      // 通过 RouteKey 解析 Provider（未配置时直接报错）
      const provider = await this.resolveAestheticProvider();

      // 通过 Skills 系统加载提示词
      const { system: systemPrompt, user: userPrompt } = await skillLoader.render("aesthetic_analysis", {});

      const result = await requestLlmPlainTextWithMetadata(
        provider,
        systemPrompt,
        userPrompt,
        0.3,
        {
          ctx: this.ctx,
          routeKey: ProviderRouteKeys.AESTHETIC_FEATURE_EXTRACTION,
          userId: "system",
          businessContext: "审美特征库图片分析",
          imageInputs: [{ url: imageUrl, label: "aesthetic_analysis" }],
          hasMedia: "image",
        },
      );

      // 解析 JSON 响应
      const featureData = this.parseFeatureFromLLMResponse(result.text);
      if (!featureData) return null;

      // 计算流行度评分（基于点赞数和博主粉丝数）
      const popularityScore = this.calculatePopularityFromMetrics(
        item.likesCount,
        item.fansCount
      );

      return {
        featureCategory: featureData.feature_category,
        featureName: featureData.feature_name,
        featureDescription: featureData.feature_description,
        ethnicityApplicable: featureData.ethnicity_applicable || ["Asian", "Mixed", "Caucasian"],
        ageRange: this.config.ageRange,
        popularityScore: Math.min(popularityScore, 1.0),
        trendPeriod: this.getCurrentQuarter(),
        source: `tikhub_api_${item.platform}`,
        sourceMetadata: {
          likes_count: item.likesCount,
          fans_count: item.fansCount,
          platform: item.platform,
          tags: item.tags,
        },
      };
    } catch (error) {
      log.warn({ error: error instanceof Error ? error.message : String(error) }, "LLM 图片分析失败");
      return null;
    }
  }

  /**
   * 解析审美特征提取的 Provider
   * Provider 未配置时直接报错，不允许静默跳过
   */
  private async resolveAestheticProvider(): Promise<ResolvedRouteProvider> {
    const provider = await resolveRouteProvider(this.ctx, ProviderRouteKeys.AESTHETIC_FEATURE_EXTRACTION);
    if (!provider) {
      throw new AppError(500, "AESTHETIC_PROVIDER_UNCONFIGURED", "审美特征提取 Provider 未配置，请在数据库中为 aesthetic_feature_extraction 配置 Provider");
    }
    return provider;
  }

  /**
   * 解析 LLM 响应，提取审美特征
   */
  private parseFeatureFromLLMResponse(content: string): {
    feature_category: string;
    feature_name: string;
    feature_description: string;
    ethnicity_applicable?: string[];
    popularity_score?: number;
  } | null {
    try {
      // 尝试提取 JSON（LLM 可能返回带 markdown 的 JSON）
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.feature_category || !parsed.feature_name || !parsed.feature_description) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * 根据社交媒体指标计算流行度评分
   */
  private calculatePopularityFromMetrics(likesCount: number, fansCount: number): number {
    // 点赞数权重：0.4（最高 0.4）
    const likesScore = Math.min(likesCount / 10000, 0.4);

    // 博主粉丝数权重：0.2（最高 0.2）
    const fansScore = Math.min(fansCount / 500000, 0.2);

    // 基础评分：0.3
    const baseScore = 0.3;

    return Math.min(baseScore + likesScore + fansScore, 1.0);
  }

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

  // ============================================================================
  // 运行记录查询
  // ============================================================================

  /**
   * 查询运行记录列表（分页）
   */
  async listUpdateLogs(params: {
    page: number;
    limit: number;
    triggerType?: UpdateTriggerType;
    status?: UpdateLogStatus;
  }): Promise<UpdateLogListResult> {
    const result = await this.repos.aestheticUpdateLogs.findPaginatedLogs({
      page: params.page,
      limit: params.limit,
      triggerType: params.triggerType,
      status: params.status,
    });

    return {
      items: result.items.map((row: Record<string, unknown>) => ({
        id: row.id as string,
        triggerType: row.trigger_type as UpdateTriggerType,
        status: row.status as UpdateLogStatus,
        ageRange: row.age_range as string | null,
        xiaohongshuCount: row.xiaohongshu_count as number,
        instagramCount: row.instagram_count as number,
        weiboCount: row.weibo_count as number,
        douyinCount: row.douyin_count as number,
        featuresUpdated: row.features_updated as number,
        durationMs: row.duration_ms as number,
        errorMessage: row.error_message as string | null,
        startedAt: row.started_at as string,
        finishedAt: row.finished_at as string | null,
        createdAt: row.created_at as string,
      })),
      total: result.total,
      page: params.page,
      limit: params.limit,
    };
  }
}