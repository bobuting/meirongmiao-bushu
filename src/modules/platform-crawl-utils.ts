/**
 * 多平台爬取公共工具
 * 抽取自 scene-library-update-service 和 aesthetic-library-update-service 的重复爬取逻辑
 */

import type { XiaohongshuNote, InstagramPost, WeiboPost, DouyinPost } from "../services/crawler/tikhub-client.js";
import { TikHubClient } from "../services/crawler/tikhub-client.js";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("PlatformCrawlUtils");

/** 多平台爬取配置 */
export interface PlatformCrawlConfig {
  xiaohongshuKeywords: string[];
  instagramHashtags: string[];
  weiboKeywords: string[];
  douyinKeywords: string[];
  fetchLimit: number;
}

/** 多平台爬取结果 */
export interface PlatformCrawlResult {
  xiaohongshuNotes: XiaohongshuNote[];
  instagramPosts: InstagramPost[];
  weiboPosts: WeiboPost[];
  douyinPosts: DouyinPost[];
}

/**
 * 并行爬取四大平台数据
 * 单平台失败时记录警告并返回空数组，不影响其他平台
 */
export async function crawlAllPlatforms(
  tikhubClient: TikHubClient,
  config: PlatformCrawlConfig,
): Promise<PlatformCrawlResult> {
  const [xiaohongshuNotes, instagramPosts, weiboPosts, douyinPosts] = await Promise.all([
    fetchXiaohongshuNotes(tikhubClient, config).catch((e) => {
      log.warn({ error: e instanceof Error ? e.message : String(e) }, "小红书爬取失败");
      return [] as XiaohongshuNote[];
    }),
    fetchInstagramPosts(tikhubClient, config).catch((e) => {
      log.warn({ error: e instanceof Error ? e.message : String(e) }, "Instagram 爬取失败");
      return [] as InstagramPost[];
    }),
    fetchWeiboPosts(tikhubClient, config).catch((e) => {
      log.warn({ error: e instanceof Error ? e.message : String(e) }, "微博爬取失败");
      return [] as WeiboPost[];
    }),
    fetchDouyinPosts(tikhubClient, config).catch((e) => {
      log.warn({ error: e instanceof Error ? e.message : String(e) }, "抖音爬取失败");
      return [] as DouyinPost[];
    }),
  ]);

  return { xiaohongshuNotes, instagramPosts, weiboPosts, douyinPosts };
}

async function fetchXiaohongshuNotes(client: TikHubClient, config: PlatformCrawlConfig): Promise<XiaohongshuNote[]> {
  const allNotes: XiaohongshuNote[] = [];
  const perKeywordLimit = Math.ceil(config.fetchLimit / config.xiaohongshuKeywords.length);

  for (const keyword of config.xiaohongshuKeywords) {
    try {
      const notes = await client.searchXiaohongshuNotesWithFallback(keyword, perKeywordLimit);
      allNotes.push(...notes);
      if (notes.length === 0) {
        log.warn({ keyword }, `小红书关键词 "${keyword}" 所有端点均返回 0 条结果`);
      }
    } catch (error) {
      log.warn({ error: error instanceof Error ? error.message : String(error) }, `小红书关键词 "${keyword}" 爬取失败（已尝试所有端点）`);
    }
  }
  const unique = allNotes.filter((n, i, s) => i === s.findIndex((x) => x.noteId === n.noteId));
  return unique.slice(0, config.fetchLimit);
}

async function fetchInstagramPosts(client: TikHubClient, config: PlatformCrawlConfig): Promise<InstagramPost[]> {
  const allPosts: InstagramPost[] = [];
  for (const hashtag of config.instagramHashtags) {
    try {
      const cleanHashtag = hashtag.replace(/^#/, "");
      const posts = await client.fetchInstagramHashtagPosts(cleanHashtag, Math.ceil(config.fetchLimit / config.instagramHashtags.length));
      allPosts.push(...posts);
    } catch (error) {
      log.warn({ error: error instanceof Error ? error.message : String(error) }, `Instagram 标签 "${hashtag}" 爬取失败`);
    }
  }
  const unique = allPosts.filter((p, i, s) => i === s.findIndex((x) => x.postId === p.postId));
  return unique.slice(0, config.fetchLimit);
}

async function fetchWeiboPosts(client: TikHubClient, config: PlatformCrawlConfig): Promise<WeiboPost[]> {
  const allPosts: WeiboPost[] = [];
  for (const keyword of config.weiboKeywords) {
    try {
      const posts = await client.searchWeiboPosts(keyword, 1, 63);
      allPosts.push(...posts);
    } catch (error) {
      log.warn({ error: error instanceof Error ? error.message : String(error) }, `微博关键词 "${keyword}" 爬取失败`);
    }
  }
  const unique = allPosts.filter((p, i, s) => i === s.findIndex((x) => x.postId === p.postId));
  return unique.slice(0, config.fetchLimit);
}

async function fetchDouyinPosts(client: TikHubClient, config: PlatformCrawlConfig): Promise<DouyinPost[]> {
  const allPosts: DouyinPost[] = [];
  for (const keyword of config.douyinKeywords) {
    try {
      const posts = await client.searchDouyinPosts(keyword, 2, 0);
      allPosts.push(...posts);
    } catch (error) {
      log.warn({ error: error instanceof Error ? error.message : String(error) }, `抖音关键词 "${keyword}" 爬取失败`);
    }
  }
  const unique = allPosts.filter((p, i, s) => i === s.findIndex((x) => x.awemeId === p.awemeId));
  return unique.slice(0, config.fetchLimit);
}
