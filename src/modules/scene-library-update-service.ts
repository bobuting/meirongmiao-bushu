/**
 * 场景库定时更新服务
 * 每日运行 TikHub API 爬取小红书/Instagram/微博/抖音数据，使用 AI 分析图片提取场景特征
 */

import type { AppContext } from "../core/app-context.js";
import type { XiaohongshuNote, InstagramPost, WeiboPost, DouyinPost } from "../services/crawler/tikhub-client.js";
import type { PlatformCrawlConfig } from "./platform-crawl-utils.js";
import type { ResolvedRouteProvider } from "../services/llm/provider-resolver.js";
import type { PgRepositoryCollection } from "../repositories/pg/index.js";
import { TikHubClient } from "../services/crawler/tikhub-client.js";
import { SceneLibraryService, type SceneFeature } from "../services/scene-library-service.js";
import { resolveRouteProvider } from "../services/llm/provider-resolver.js";
import { requestLlmPlainTextWithMetadata } from "../services/llm/llm-transport.js";
import { downloadAndUploadImage } from "../service/oss/download-upload.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";
import { getLogger } from "../core/logger/index.js";
import { AppError } from "../core/errors.js";
import { skillLoader } from "../services/skills/index.js";
import { crawlAllPlatforms } from "./platform-crawl-utils.js";

const log = getLogger("SceneLibraryUpdateService");

// ============================================================================
// 场景分类关键词配置
// ============================================================================

/** 场景分类关键词映射 */
const SCENE_CATEGORY_KEYWORDS: Record<string, {
  xiaohongshu: string[];
  instagram: string[];
  weibo: string[];
  douyin: string[];
}> = {
  indoor: {
    xiaohongshu: ["室内场景", "家居布置", "室内拍摄", "ins风装修", "办公室布置", "咖啡厅"],
    instagram: ["indoorscene", "interiordesign", "indoorphotography", "homestyling", "coffeeshop"],
    weibo: ["室内场景", "家居布置", "室内拍摄", "办公室布置"],
    douyin: ["室内场景", "家居布置", "ins风室内", "办公室布置"],
  },
  outdoor: {
    xiaohongshu: ["户外拍摄", "街拍场景", "城市风景", "自然风光", "建筑摄影", "外景"],
    instagram: ["outdoorshooting", "streetscene", "cityscape", "naturephoto", "architecture"],
    weibo: ["户外拍摄", "街拍场景", "城市风景", "自然风光"],
    douyin: ["户外拍摄", "街拍场景", "城市风景", "外景拍摄"],
  },
  e_commerce: {
    xiaohongshu: ["直播间布置", "电商拍摄", "商品布景", "白底拍摄", "场景布光", "带货场景"],
    instagram: ["ecommercestudio", "productphoto", "whitestudio", "studiolight"],
    weibo: ["直播间布置", "电商拍摄", "商品布景"],
    douyin: ["直播间布置", "电商拍摄", "带货场景", "商品布景"],
  },
  studio: {
    xiaohongshu: ["影棚布光", "专业拍摄", "摄影棚", "背景布", "灯光布置", "影棚场景"],
    instagram: ["photostudio", "studiobackdrop", "studiolighting", "photographyset"],
    weibo: ["影棚布光", "摄影棚", "灯光布置"],
    douyin: ["影棚布光", "摄影棚", "专业拍摄"],
  },
  lifestyle: {
    xiaohongshu: ["生活场景", "居家拍摄", "厨房场景", "卧室布置", "阳台布置", "生活美学"],
    instagram: ["lifestylescene", "homecooking", "cozyhome", "lifestylephotography"],
    weibo: ["生活场景", "居家拍摄", "生活美学"],
    douyin: ["生活场景", "居家拍摄", "生活美学"],
  },
  commercial: {
    xiaohongshu: ["商业摄影", "广告场景", "品牌拍摄", "产品展示", "展厅布置"],
    instagram: ["commercialphoto", "adshoot", "brandshoot", "productdisplay"],
    weibo: ["商业摄影", "广告场景", "品牌拍摄"],
    douyin: ["商业摄影", "品牌拍摄", "产品展示"],
  },
};

/** 默认场景分类（定时任务依次执行） */
const DEFAULT_SCENE_CATEGORIES = ["indoor", "outdoor", "e_commerce", "studio", "lifestyle", "commercial"];

/**
 * 运行记录的触发方式
 */
export type SceneUpdateTriggerType = "scheduled" | "manual";

/**
 * 运行记录状态
 */
export type SceneUpdateLogStatus = "running" | "success" | "failed" | "skipped";

/**
 * 场景库更新结果
 */
interface SceneUpdateResult {
  success: boolean;
  xiaohongshuCount: number;
  instagramCount: number;
  weiboCount: number;
  douyinCount: number;
  scenesUpdated: number;
  durationMs: number;
  error?: string;
}

/**
 * 运行记录
 */
export interface SceneUpdateLog {
  id: string;
  triggerType: SceneUpdateTriggerType;
  status: SceneUpdateLogStatus;
  sceneCategory: string | null;
  xiaohongshuCount: number;
  instagramCount: number;
  weiboCount: number;
  douyinCount: number;
  scenesUpdated: number;
  durationMs: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}

/**
 * 运行记录列表结果（分页）
 */
export interface SceneUpdateLogListResult {
  items: SceneUpdateLog[];
  total: number;
  page: number;
  limit: number;
}

/**
 * 场景库更新配置
 */
interface SceneUpdateConfig extends PlatformCrawlConfig {
  tikhubApiKey: string;
  sceneCategory: string;
  enabled: boolean;
}

/**
 * 场景库定时更新服务
 */
export class SceneLibraryUpdateService {
  private tikhubClient: TikHubClient;
  private sceneLibraryService: SceneLibraryService;
  private config: SceneUpdateConfig;

  constructor(
    private repos: PgRepositoryCollection,
    private ctx: AppContext,
    config?: Partial<SceneUpdateConfig>,
  ) {
    const defaultCategory = "indoor";
    const defaultKeywords = SCENE_CATEGORY_KEYWORDS[defaultCategory];

    this.config = {
      tikhubApiKey: process.env.TIKHUB_API_TOKEN || "",
      sceneCategory: config?.sceneCategory || defaultCategory,
      xiaohongshuKeywords: defaultKeywords.xiaohongshu,
      instagramHashtags: defaultKeywords.instagram,
      weiboKeywords: defaultKeywords.weibo,
      douyinKeywords: defaultKeywords.douyin,
      fetchLimit: 50,
      enabled: process.env.SCENE_LIBRARY_UPDATE_ENABLED !== "false",
      ...config,
    };

    this.tikhubClient = new TikHubClient(this.config.tikhubApiKey);
    this.sceneLibraryService = new SceneLibraryService(this.repos.sceneLibrary);
  }

  /**
   * 执行场景库更新（定时任务和手动触发共用）
   */
  async runScheduledUpdate(triggerType: SceneUpdateTriggerType = "scheduled"): Promise<SceneUpdateResult> {
    const startTime = Date.now();

    if (!this.config.enabled && triggerType === "scheduled") {
      log.info("场景库更新已禁用，跳过执行");
      return { success: false, xiaohongshuCount: 0, instagramCount: 0, weiboCount: 0, douyinCount: 0, scenesUpdated: 0, durationMs: 0, error: "更新已禁用" };
    }

    if (!this.config.tikhubApiKey) {
      log.warn("TikHub API Key 未配置，跳过执行");
      return { success: false, xiaohongshuCount: 0, instagramCount: 0, weiboCount: 0, douyinCount: 0, scenesUpdated: 0, durationMs: 0, error: "TikHub API Key 未配置" };
    }

    const logId = await this.repos.sceneLibraryUpdateLogs.insertLog({
      triggerType,
      sceneCategory: this.config.sceneCategory,
    });
    log.info({ sceneCategory: this.config.sceneCategory }, "开始执行场景库更新任务");

    try {
      // 并行爬取各平台
      const { xiaohongshuNotes, instagramPosts, weiboPosts, douyinPosts } = await crawlAllPlatforms(this.tikhubClient, this.config);
      // 全部平台爬取失败时应直接报错，而非静默完成空更新
      const totalFetched = xiaohongshuNotes.length + instagramPosts.length + weiboPosts.length + douyinPosts.length;
      if (totalFetched === 0) {
        throw new Error("所有平台爬取均失败（小红书、Instagram、微博、抖音），无法执行场景库更新");
      }
      log.info(`爬取完成：小红书 ${xiaohongshuNotes.length}，Instagram ${instagramPosts.length}，微博 ${weiboPosts.length}，抖音 ${douyinPosts.length}`);

      // AI 分析图片
      const extractedScenes = await this.extractScenesFromData(xiaohongshuNotes, instagramPosts, weiboPosts, douyinPosts);
      log.info(`AI 分析完成，提取 ${extractedScenes.length} 个场景`);

      // 更新数据库
      let scenesUpdated = 0;
      for (const scene of extractedScenes) {
        await this.sceneLibraryService.upsertSceneFeature(scene);
        scenesUpdated++;
      }

      // 计算综合评分
      await this.repos.sceneLibrary.updatePopularityScores();

      const durationMs = Date.now() - startTime;
      await this.repos.sceneLibraryUpdateLogs.finishLog(logId, "success", {
        xiaohongshuCount: xiaohongshuNotes.length,
        instagramCount: instagramPosts.length,
        weiboCount: weiboPosts.length,
        douyinCount: douyinPosts.length,
        scenesUpdated,
        durationMs,
      });

      return { success: true, xiaohongshuCount: xiaohongshuNotes.length, instagramCount: instagramPosts.length, weiboCount: weiboPosts.length, douyinCount: douyinPosts.length, scenesUpdated, durationMs };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error({ error: errorMessage }, "场景库更新失败");

      await this.repos.sceneLibraryUpdateLogs.finishLog(logId, "failed", {
        xiaohongshuCount: 0, instagramCount: 0, weiboCount: 0, douyinCount: 0,
        scenesUpdated: 0, durationMs, errorMessage,
      });

      return { success: false, xiaohongshuCount: 0, instagramCount: 0, weiboCount: 0, douyinCount: 0, scenesUpdated: 0, durationMs, error: errorMessage };
    }
  }

  /**
   * 按场景分类更新场景库
   */
  async updateLibrary(params: {
    sceneCategory: string;
    triggerType?: SceneUpdateTriggerType;
  }): Promise<{ updated: number }> {
    const keywords = SCENE_CATEGORY_KEYWORDS[params.sceneCategory];
    if (!keywords) {
      throw new AppError(400, "INVALID_SCENE_CATEGORY", `不支持的场景分类: ${params.sceneCategory}`);
    }

    // 保存原始配置
    const orig = { ...this.config };

    try {
      this.config.sceneCategory = params.sceneCategory;
      this.config.xiaohongshuKeywords = [...keywords.xiaohongshu];
      this.config.instagramHashtags = [...keywords.instagram];
      this.config.weiboKeywords = [...keywords.weibo];
      this.config.douyinKeywords = [...keywords.douyin];

      const result = await this.runScheduledUpdate(params.triggerType || "manual");
      return { updated: result.scenesUpdated };
    } finally {
      this.config = orig;
    }
  }

  /**
   * 获取所有支持的场景分类
   */
  static getSceneCategories(): string[] {
    return DEFAULT_SCENE_CATEGORIES;
  }

  // ============================================================================
  // AI 分析
  // ============================================================================

  /**
   * AI 分析图片数据，提取场景特征
   */
  private async extractScenesFromData(
    xiaohongshuNotes: XiaohongshuNote[],
    instagramPosts: InstagramPost[],
    weiboPosts: WeiboPost[],
    douyinPosts: DouyinPost[],
  ): Promise<SceneFeature[]> {
    const scenes: SceneFeature[] = [];

    const allData = [
      ...xiaohongshuNotes.map((n) => ({ platform: "xiaohongshu", id: n.noteId, imageUrls: n.imageUrls, likesCount: n.likesCount, fansCount: n.authorFansCount, tags: n.tags })),
      ...instagramPosts.map((p) => ({ platform: "instagram", id: p.postId, imageUrls: p.imageUrls, likesCount: p.likesCount, fansCount: p.authorFansCount, tags: [] as string[] })),
      ...weiboPosts.map((p) => ({ platform: "weibo", id: p.postId, imageUrls: p.imageUrls, likesCount: p.likesCount, fansCount: p.authorFansCount, tags: [] as string[] })),
      ...douyinPosts.map((p) => ({ platform: "douyin", id: p.awemeId, imageUrls: p.imageUrls, likesCount: p.likesCount, fansCount: p.authorFansCount, tags: [] as string[] })),
    ];

    const batchSize = 5;
    for (let i = 0; i < Math.min(allData.length, 10); i += batchSize) {
      const batch = allData.slice(i, i + batchSize);

      for (const item of batch) {
        if (item.imageUrls.length === 0) continue;

        try {
          const sourceImageUrl = item.imageUrls[0];
          let ossImageUrl: string | undefined;

          const storage = this.ctx.storage;
          if (storage) {
            try {
              const ossKey = `scene/${this.config.sceneCategory}/${item.platform}/${item.id}_${Date.now()}.jpg`;
              const uploadResult = await downloadAndUploadImage(sourceImageUrl, storage, ossKey);
              ossImageUrl = uploadResult.url;
            } catch (ossError) {
              log.warn({ error: ossError instanceof Error ? ossError.message : String(ossError) }, "图片下载到 OSS 失败");
            }
          }

          const imageUrlForLlm = ossImageUrl || sourceImageUrl;
          const extractedScene = await this.analyzeImageWithLLM(imageUrlForLlm, item);

          if (extractedScene) {
            extractedScene.sourceImageUrl = sourceImageUrl;
            extractedScene.ossImageUrl = ossImageUrl;
            scenes.push(extractedScene);
          }
        } catch (error) {
          log.warn({ error: error instanceof Error ? error.message : String(error), platform: item.platform }, `图片分析失败（${item.platform}）`);
        }
      }
    }

    return scenes;
  }

  /**
   * 使用 LLM 分析单张图片，提取场景特征
   */
  private async analyzeImageWithLLM(
    imageUrl: string,
    item: { platform: string; likesCount: number; fansCount: number; tags: string[] },
  ): Promise<SceneFeature | null> {
    try {
      const provider = await this.resolveSceneProvider();

      // 通过 Skills 系统加载提示词
      const { system: systemPrompt, user: userPrompt } = await skillLoader.render("scene_analysis", {});

      const result = await requestLlmPlainTextWithMetadata(
        provider,
        systemPrompt,
        userPrompt,
        0.3,
        {
          ctx: this.ctx,
          routeKey: ProviderRouteKeys.SCENE_FEATURE_EXTRACTION,
          userId: "system",
          businessContext: "场景库图片分析",
          imageInputs: [{ url: imageUrl, label: "scene_analysis" }],
          hasMedia: "image",
        },
      );

      const sceneData = this.parseSceneFromLLMResponse(result.text);
      if (!sceneData) return null;

      const popularityScore = this.calculatePopularityFromMetrics(item.likesCount, item.fansCount);

      return {
        sceneCategory: sceneData.scene_category,
        sceneCategoryCn: sceneData.scene_category_cn,
        sceneName: sceneData.scene_name,
        sceneNameCn: sceneData.scene_name_cn,
        sceneDescription: sceneData.scene_description,
        sceneDescriptionCn: sceneData.scene_description_cn,
        sceneTags: sceneData.scene_tags || [],
        lightingType: sceneData.lighting_type,
        suitability: sceneData.suitability || ["clothing"],
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
      log.warn({ error: error instanceof Error ? error.message : String(error) }, "LLM 场景图片分析失败");
      return null;
    }
  }

  private async resolveSceneProvider(): Promise<ResolvedRouteProvider> {
    const provider = await resolveRouteProvider(this.ctx, ProviderRouteKeys.SCENE_FEATURE_EXTRACTION);
    if (!provider) {
      throw new AppError(500, "SCENE_PROVIDER_UNCONFIGURED", "场景特征提取 Provider 未配置");
    }
    return provider;
  }

  private parseSceneFromLLMResponse(content: string): {
    scene_category: string;
    scene_category_cn?: string;
    scene_name: string;
    scene_name_cn?: string;
    scene_description: string;
    scene_description_cn?: string;
    scene_tags?: string[];
    lighting_type?: string;
    suitability?: string[];
    popularity_score?: number;
  } | null {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.scene_category || !parsed.scene_name || !parsed.scene_description) return null;

      return parsed;
    } catch {
      return null;
    }
  }

  private calculatePopularityFromMetrics(likesCount: number, fansCount: number): number {
    const likesScore = Math.min(likesCount / 10000, 0.4);
    const fansScore = Math.min(fansCount / 500000, 0.2);
    return Math.min(0.3 + likesScore + fansScore, 1.0);
  }

  private getCurrentQuarter(): string {
    const now = new Date();
    return `${now.getFullYear()}-q${Math.ceil((now.getMonth() + 1) / 3)}`;
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
    triggerType?: SceneUpdateTriggerType;
    status?: SceneUpdateLogStatus;
  }): Promise<SceneUpdateLogListResult> {
    const result = await this.repos.sceneLibraryUpdateLogs.findPaginatedLogs({
      page: params.page,
      limit: params.limit,
      triggerType: params.triggerType,
      status: params.status,
    });

    return {
      items: result.items.map((row: Record<string, unknown>) => ({
        id: row.id as string,
        triggerType: row.trigger_type as SceneUpdateTriggerType,
        status: row.status as SceneUpdateLogStatus,
        sceneCategory: row.scene_category as string | null,
        xiaohongshuCount: row.xiaohongshu_count as number,
        instagramCount: row.instagram_count as number,
        weiboCount: row.weibo_count as number,
        douyinCount: row.douyin_count as number,
        scenesUpdated: row.scenes_updated as number,
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