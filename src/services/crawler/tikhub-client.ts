/**
 * TikHub API 客户端
 * 负责爬取小红书、Instagram、微博、抖音等多平台数据
 * 以及多平台热榜数据获取
 */

import type { AppContext } from "../../core/app-context.js";
import { getLogger } from "../../core/logger/index.js";

// ========== 类型定义 ==========

/**
 * 多平台热点数据结构（统一格式）
 */
export interface MultiPlatformHotTrend {
  title: string;            // 热点标题
  platform: string;         // 来源平台：douyin/weibo/bilibili/zhihu/kuaishou/xiaohongshu
  rank: number;             // 排名
  heatValue: number;        // 热度值
  trend: "up" | "down" | "stable";  // 趋势方向
  url?: string;             // 相关链接
  category?: string;        // 分类标签
  createdAt: number;        // 数据获取时间戳
}

/**
 * 平台热榜配置
 */
export interface PlatformHotConfig {
  platform: string;
  endpoint: string;
  method: "GET" | "POST";
  parsePath: string;  // JSON 解析路径，如 "data.data.objs"
  queryParams?: Record<string, string>;  // GET 请求的查询参数
}

/**
 * 小红书笔记数据结构
 */
export interface XiaohongshuNote {
  noteId: string;          // 笔记 ID
  title: string;           // 标题
  description: string;     // 描述内容
  imageUrls: string[];     // 图片 URL 列表
  tags: string[];          // 标签列表
  likesCount: number;      // 点赞数
  commentsCount: number;   // 评论数
  collectsCount: number;   // 收藏数
  authorId: string;        // 作者 ID
  authorName: string;      // 作者昵称
  authorFansCount: number; // 作者粉丝数
  publishTime: number;     // 发布时间戳
}

/**
 * Instagram 帖子数据结构
 */
export interface InstagramPost {
  postId: string;          // 帖子 ID
  caption: string;         // 帖子说明文字
  imageUrls: string[];     // 图片 URL 列表
  likesCount: number;      // 点赞数
  commentsCount: number;   // 评论数
  authorId: string;        // 作者 ID
  authorUsername: string;  // 作者用户名
  authorFansCount: number; // 作者粉丝数
  publishTime: number;     // 发布时间戳
}

/**
 * 微博帖子数据结构
 */
export interface WeiboPost {
  postId: string;          // 微博 ID
  text: string;           // 微博正文
  imageUrls: string[];     // 图片 URL 列表
  likesCount: number;      // 点赞数
  commentsCount: number;   // 评论数
  repostsCount: number;    // 转发数
  authorId: string;        // 作者 ID
  authorName: string;      // 作者昵称
  authorFansCount: number; // 作者粉丝数
  publishTime: number;     // 发布时间戳
}

/**
 * 抖音图文/视频数据结构
 */
export interface DouyinPost {
  awemeId: string;         // 抖音作品 ID
  description: string;     // 描述文字
  imageUrls: string[];     // 图片 URL 列表（图文类型）或视频封面
  videoUrl: string;        // 视频播放地址
  likesCount: number;      // 点赞数
  commentsCount: number;   // 评论数
  authorId: string;        // 作者数字 ID
  authorSecUid: string;    // 作者 sec_uid（base64，用于拉取用户作品）
  authorName: string;      // 作者昵称
  authorFansCount: number; // 作者粉丝数
  publishTime: number;     // 发布时间戳
}

/**
 * 小红书搜索端点配置（用于多连接点 fallback）
 */
interface XhsEndpointConfig {
  /** 端点名称（日志用） */
  name: string;
  /** URL 路径 */
  path: string;
  /** 构建查询参数 */
  buildParams: (keyword: string, limit: number) => Record<string, string>;
  /** 从原始响应中提取笔记数组 */
  extractItems: (data: unknown) => unknown[];
  /** 将原始 item 解析为标准结构 */
  parseItem: (item: unknown) => XiaohongshuNote | null;
}

/**
 * TikHub API 客户端类
 * 封装小红书、Instagram、微博、抖音数据爬取逻辑
 */
export class TikHubClient {
  private apiKey: string;
  private baseUrl: string = "https://api.tikhub.io";

  /**
   * 小红书搜索端点链（按优先级排列，V3 为主连接点）
   */
  private static XHS_SEARCH_ENDPOINTS: XhsEndpointConfig[] = [
    {
      name: "Web V3",
      path: "/api/v1/xiaohongshu/web_v3/fetch_search_notes",
      buildParams: (keyword, limit) => ({ keyword, limit: String(limit) }),
      extractItems: (data) => {
        const d = data as Record<string, unknown>;
        const inner = (d.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
        // V3 返回结构: response.data.data.data.items
        const items = inner?.items ?? inner;
        return Array.isArray(items) ? items : [];
      },
      parseItem: (item) => {
        const raw = item as Record<string, unknown>;
        const noteCard = raw.noteCard as Record<string, unknown> | undefined;
        const user = noteCard?.user as Record<string, unknown> | undefined;
        const interactInfo = noteCard?.interactInfo as Record<string, unknown> | undefined;
        const imageList = noteCard?.imageList as unknown[] | undefined;

        const imageUrls: string[] = [];
        if (Array.isArray(imageList)) {
          for (const img of imageList) {
            const imgObj = img as Record<string, unknown>;
            const infoList = imgObj.infoList as unknown[] | undefined;
            if (Array.isArray(infoList)) {
              for (const info of infoList) {
                const infoObj = info as Record<string, unknown>;
                const url = String(infoObj.url ?? "");
                if (url) imageUrls.push(url);
              }
            }
          }
        }

        return {
          noteId: String(raw.id ?? ""),
          title: "",
          description: "",
          imageUrls,
          tags: [],
          likesCount: Number(interactInfo?.likedCount ?? 0),
          commentsCount: Number(interactInfo?.commentCount ?? 0),
          collectsCount: Number(interactInfo?.collectedCount ?? 0),
          authorId: String(user?.userId ?? ""),
          authorName: String(user?.nickname ?? user?.nickName ?? ""),
          authorFansCount: 0,
          publishTime: 0,
        };
      },
    },
    {
      name: "Web V2",
      path: "/api/v1/xiaohongshu/web_v2/fetch_search_notes",
      buildParams: (keyword, limit) => ({
        keywords: keyword,
        page: "1",
        page_size: String(limit),
        sort_type: "0",
        note_type: "0",
      }),
      extractItems: (data) => {
        const d = data as Record<string, unknown>;
        const inner = (d.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
        return (inner?.items ?? inner?.notes ?? []) as unknown[];
      },
      parseItem: (item) => {
        const raw = item as Record<string, unknown>;
        // V2 结构可能是 noteCard 或直接平铺
        const noteCard = (raw.noteCard ?? raw) as Record<string, unknown>;
        const user = noteCard.user as Record<string, unknown> | undefined;
        const interactInfo = noteCard.interactInfo as Record<string, unknown> | undefined;
        const imageList = noteCard.imageList as unknown[] | undefined;

        const imageUrls: string[] = [];
        if (Array.isArray(imageList)) {
          for (const img of imageList) {
            const imgObj = img as Record<string, unknown>;
            // V2 图片可能在 infoList 或直接在 url 字段
            const infoList = imgObj.infoList as unknown[] | undefined;
            if (Array.isArray(infoList)) {
              for (const info of infoList) {
                const url = String((info as Record<string, unknown>).url ?? "");
                if (url) imageUrls.push(url);
              }
            } else {
              const url = String(imgObj.url ?? imgObj.url_default ?? "");
              if (url) imageUrls.push(url);
            }
          }
        }

        return {
          noteId: String(noteCard.id ?? raw.id ?? ""),
          title: String(noteCard.title ?? raw.title ?? ""),
          description: String(noteCard.desc ?? raw.desc ?? ""),
          imageUrls,
          tags: [],
          likesCount: Number(interactInfo?.likedCount ?? noteCard.likedCount ?? 0),
          commentsCount: Number(interactInfo?.commentCount ?? noteCard.commentCount ?? 0),
          collectsCount: Number(interactInfo?.collectedCount ?? noteCard.collectedCount ?? 0),
          authorId: String(user?.userId ?? noteCard.userId ?? ""),
          authorName: String(user?.nickname ?? user?.nickName ?? noteCard.nickname ?? ""),
          authorFansCount: Number(user?.fansCount ?? 0),
          publishTime: Number(noteCard.time ?? noteCard.timestamp ?? 0),
        };
      },
    },
    {
      name: "App V2",
      path: "/api/v1/xiaohongshu/app_v2/search_notes",
      buildParams: (keyword, limit) => ({
        keyword,
        page: "1",
        page_size: String(limit),
        sort: "0",
      }),
      extractItems: (data) => {
        const d = data as Record<string, unknown>;
        const inner = (d.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
        return (inner?.items ?? inner?.notes ?? inner?.feeds ?? []) as unknown[];
      },
      parseItem: (item) => {
        const raw = item as Record<string, unknown>;
        // App V2 可能使用 note_card 或直接在 item 上
        const noteCard = (raw.note_card ?? raw.noteCard ?? raw) as Record<string, unknown>;
        const user = noteCard.user as Record<string, unknown> | undefined;
        const interactInfo = noteCard.interact_info as Record<string, unknown> | undefined
          ?? noteCard.interactInfo as Record<string, unknown> | undefined;
        const imageList = noteCard.image_list as unknown[] | undefined
          ?? noteCard.imageList as unknown[] | undefined;

        const imageUrls: string[] = [];
        if (Array.isArray(imageList)) {
          for (const img of imageList) {
            const imgObj = img as Record<string, unknown>;
            // App 端图片可能在 url_default / url / info_list
            const url = String(imgObj.url_default ?? imgObj.url ?? "");
            if (url) {
              imageUrls.push(url);
            } else {
              const infoList = imgObj.info_list as unknown[] | undefined ?? imgObj.infoList as unknown[] | undefined;
              if (Array.isArray(infoList)) {
                for (const info of infoList) {
                  const infoUrl = String((info as Record<string, unknown>).url ?? "");
                  if (infoUrl) imageUrls.push(infoUrl);
                }
              }
            }
          }
        }

        return {
          noteId: String(noteCard.note_id ?? noteCard.id ?? raw.id ?? ""),
          title: String(noteCard.title ?? raw.title ?? ""),
          description: String(noteCard.desc ?? noteCard.description ?? raw.desc ?? ""),
          imageUrls,
          tags: [],
          likesCount: Number(interactInfo?.liked_count ?? interactInfo?.likedCount ?? 0),
          commentsCount: Number(interactInfo?.comment_count ?? interactInfo?.commentCount ?? 0),
          collectsCount: Number(interactInfo?.collected_count ?? interactInfo?.collectedCount ?? 0),
          authorId: String(user?.user_id ?? user?.userId ?? ""),
          authorName: String(user?.nickname ?? user?.nickName ?? ""),
          authorFansCount: Number(user?.fanscount ?? user?.fansCount ?? 0),
          publishTime: Number(noteCard.time ?? noteCard.last_update_time ?? 0),
        };
      },
    },
    {
      // TikHub 优先级: App V2 > App > Web V3 > Web V2 > Web
      name: "App V1",
      path: "/api/v1/xiaohongshu/app/search_notes",
      buildParams: (keyword, limit) => ({
        keyword,
        page: "1",
        page_size: String(limit),
        sort: "0",
      }),
      extractItems: (data) => {
        const d = data as Record<string, unknown>;
        const inner = (d.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
        const items = inner?.items ?? inner?.notes ?? inner?.feeds;
        return Array.isArray(items) ? items : [];
      },
      parseItem: (item) => {
        const raw = item as Record<string, unknown>;
        const noteCard = (raw.note_card ?? raw.noteCard ?? raw) as Record<string, unknown>;
        const user = noteCard.user as Record<string, unknown> | undefined;
        const interactInfo = (noteCard.interact_info ?? noteCard.interactInfo) as Record<string, unknown> | undefined;
        const imageList = (noteCard.image_list ?? noteCard.imageList) as unknown[] | undefined;

        const imageUrls: string[] = [];
        if (Array.isArray(imageList)) {
          for (const img of imageList) {
            const imgObj = img as Record<string, unknown>;
            const url = String(imgObj.url_default ?? imgObj.url ?? "");
            if (url) imageUrls.push(url);
          }
        }

        return {
          noteId: String(noteCard.note_id ?? noteCard.id ?? raw.id ?? ""),
          title: String(noteCard.title ?? raw.title ?? ""),
          description: String(noteCard.desc ?? noteCard.description ?? raw.desc ?? ""),
          imageUrls,
          tags: [],
          likesCount: Number(interactInfo?.liked_count ?? interactInfo?.likedCount ?? 0),
          commentsCount: Number(interactInfo?.comment_count ?? interactInfo?.commentCount ?? 0),
          collectsCount: Number(interactInfo?.collected_count ?? interactInfo?.collectedCount ?? 0),
          authorId: String(user?.user_id ?? user?.userId ?? ""),
          authorName: String(user?.nickname ?? user?.nickName ?? ""),
          authorFansCount: Number(user?.fanscount ?? user?.fansCount ?? 0),
          publishTime: Number(noteCard.time ?? noteCard.last_update_time ?? 0),
        };
      },
    },
    {
      name: "Web V1",
      path: "/api/v1/xiaohongshu/web/search_notes",
      buildParams: (keyword, limit) => ({
        keyword,
        page: "1",
        per_page: String(limit),
        sort: "general",
      }),
      extractItems: (data) => {
        const d = data as Record<string, unknown>;
        const inner = (d.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
        const items = inner?.items ?? inner?.notes;
        return Array.isArray(items) ? items : [];
      },
      parseItem: (item) => {
        // Web V1 结构与 V3 类似
        const raw = item as Record<string, unknown>;
        const noteCard = raw.noteCard as Record<string, unknown> | undefined;
        const user = noteCard?.user as Record<string, unknown> | undefined;
        const interactInfo = noteCard?.interactInfo as Record<string, unknown> | undefined;
        const imageList = noteCard?.imageList as unknown[] | undefined;

        const imageUrls: string[] = [];
        if (Array.isArray(imageList)) {
          for (const img of imageList) {
            const imgObj = img as Record<string, unknown>;
            const infoList = imgObj.infoList as unknown[] | undefined;
            if (Array.isArray(infoList)) {
              for (const info of infoList) {
                const url = String((info as Record<string, unknown>).url ?? "");
                if (url) imageUrls.push(url);
              }
            }
          }
        }

        return {
          noteId: String(raw.id ?? ""),
          title: String(noteCard?.displayTitle ?? ""),
          description: "",
          imageUrls,
          tags: [],
          likesCount: Number(interactInfo?.likedCount ?? 0),
          commentsCount: Number(interactInfo?.commentCount ?? 0),
          collectsCount: Number(interactInfo?.collectedCount ?? 0),
          authorId: String(user?.userId ?? ""),
          authorName: String(user?.nickname ?? user?.nickName ?? ""),
          authorFansCount: 0,
          publishTime: 0,
        };
      },
    },
  ];

  /**
   * 构造函数
   * @param apiKey - TikHub API Key
   */
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // ========== 小红书 API ==========

  /**
   * 搜索小红书笔记（单端点，兼容旧接口）
   * @param keyword - 搜索关键词
   * @param limit - 返回数量限制（默认 100）
   * @returns 小红书笔记列表
   */
  async searchXiaohongshuNotes(keyword: string, limit: number = 100): Promise<XiaohongshuNote[]> {
    return this.searchXiaohongshuNotesViaEndpoint(0, keyword, limit);
  }

  /**
   * 搜索小红书笔记（多端点 fallback）
   * 按优先级依次尝试各端点，直到成功获取结果或全部失败
   * @param keyword - 搜索关键词
   * @param limit - 返回数量限制
   * @returns 小红书笔记列表（可能为空）
   */
  async searchXiaohongshuNotesWithFallback(keyword: string, limit: number): Promise<XiaohongshuNote[]> {
    const errors: string[] = [];

    for (let i = 0; i < TikHubClient.XHS_SEARCH_ENDPOINTS.length; i++) {
      const endpoint = TikHubClient.XHS_SEARCH_ENDPOINTS[i];
      try {
        const notes = await this.searchXiaohongshuNotesViaEndpoint(i, keyword, limit);
        if (notes.length > 0) {
          return notes;
        }
        // 返回空结果也算一种失败，继续尝试下一个端点
        errors.push(`${endpoint.name}: 返回 0 条结果`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`${endpoint.name}: ${msg}`);
      }
    }

    // 所有端点都失败，记录日志并返回空数组
    return [];
  }

  /**
   * 获取最后一次 fallback 的错误详情（用于日志记录）
   */
  getLastFallbackErrors(keyword: string, errors: string[]): string {
    return `关键词 "${keyword}" 所有端点均失败: ${errors.join(" | ")}`;
  }

  /**
   * 通过指定端点索引搜索小红书笔记
   */
  private async searchXiaohongshuNotesViaEndpoint(
    endpointIndex: number,
    keyword: string,
    limit: number
  ): Promise<XiaohongshuNote[]> {
    const endpoint = TikHubClient.XHS_SEARCH_ENDPOINTS[endpointIndex];
    const url = new URL(`${this.baseUrl}${endpoint.path}`);
    const params = endpoint.buildParams(keyword, limit);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`TikHub ${endpoint.name} API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const rawItems = endpoint.extractItems(data);
    if (!Array.isArray(rawItems)) return [];

    return rawItems
      .map((item) => endpoint.parseItem(item))
      .filter((note): note is XiaohongshuNote => note !== null);
  }

  // ========== Instagram API (V1) ==========

  /**
   * 获取 Instagram 话题标签下的帖子（V1 GraphQL 风格）
   * 使用 TikHub V1 端点：/api/v1/instagram/v1/fetch_hashtag_posts
   * @param hashtag - 话题标签名称（不含#号，如 "childfashion"）
   * @param limit - 返回数量限制（默认 20，最大约 50）
   * @returns Instagram 帖子列表
   */
  async fetchInstagramHashtagPosts(hashtag: string, limit: number = 20): Promise<InstagramPost[]> {
    const url = new URL(`${this.baseUrl}/api/v1/instagram/v1/fetch_hashtag_posts`);
    url.searchParams.set("hashtag", hashtag);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`TikHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    // TikHub 响应结构：data.data.data.hashtag（三层嵌套）
    const hashtagData = data?.data?.data?.hashtag ?? data?.data?.hashtag;
    if (!hashtagData) {
      return [];
    }

    const edgeMedia = hashtagData.edge_hashtag_to_media as Record<string, unknown> | undefined;
    const edges = edgeMedia?.edges as unknown[] | undefined;
    if (!Array.isArray(edges)) {
      return [];
    }

    return this.parseInstagramV1Posts(edges, limit);
  }

  /**
   * 解析 Instagram V1 GraphQL 风格的帖子数据
   * @param edges - edge_hashtag_to_media.edges 数组
   * @param limit - 返回数量限制
   * @returns 标准化的 Instagram 帖子列表
   */
  private parseInstagramV1Posts(edges: unknown[], limit: number): InstagramPost[] {
    return edges.slice(0, limit).map((edge: unknown) => {
      const edgeObj = edge as Record<string, unknown>;
      const node = edgeObj.node as Record<string, unknown>;

      // 提取 caption（可能有多条，取第一条）
      const captionEdges = (node.edge_media_to_caption as Record<string, unknown> | undefined)?.edges as unknown[] | undefined;
      const captionText = captionEdges?.[0]
        ? String(((captionEdges[0] as Record<string, unknown>).node as Record<string, unknown>).text ?? "")
        : "";

      // 提取图片 URL（优先 display_url，其次 thumbnail_src）
      const imageUrls: string[] = [];
      const displayUrl = String(node.display_url ?? "");
      if (displayUrl) imageUrls.push(displayUrl);
      const thumbnailSrc = String(node.thumbnail_src ?? "");
      if (thumbnailSrc && thumbnailSrc !== displayUrl) imageUrls.push(thumbnailSrc);

      // 提取点赞数
      const likesCount = Number((node.edge_liked_by as Record<string, unknown> | undefined)?.count ?? node.edge_media_preview_like ?? 0);

      // 提取评论数
      const commentsCount = Number((node.edge_media_to_comment as Record<string, unknown> | undefined)?.count ?? 0);

      // 提取作者 ID
      const owner = node.owner as Record<string, unknown> | undefined;
      const ownerId = String(owner?.id ?? "");

      return {
        postId: String(node.id ?? ""),
        caption: captionText,
        imageUrls,
        likesCount,
        commentsCount,
        authorId: ownerId,
        authorUsername: "",
        authorFansCount: 0,
        publishTime: Number(node.taken_at_timestamp ?? 0),
      };
    });
  }

  // ========== 微博搜索 API ==========

  /**
   * 搜索微博内容（仅图片类型）
   * 使用 TikHub 端点：/api/v1/weibo/web/fetch_search
   * @param keyword - 搜索关键词（支持话题格式如 "#儿童穿搭#"）
   * @param page - 页码（从 1 开始）
   * @param searchType - 搜索类型：63=仅图片内容
   * @returns 微博帖子列表
   */
  async searchWeiboPosts(keyword: string, page: number = 1, searchType: number = 63): Promise<WeiboPost[]> {
    const url = new URL(`${this.baseUrl}/api/v1/weibo/web/fetch_search`);
    url.searchParams.set("keyword", keyword);
    url.searchParams.set("page", String(page));
    url.searchParams.set("search_type", String(searchType));

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`TikHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    // TikHub 响应结构：data.data.data.cards[]，每个 card 可能直接含 mblog 或 card_group[]
    const innerData = data?.data?.data;
    if (!innerData) return [];

    // 提取所有 mblog 对象（cards 可能有 card_group 子数组）
    const mblogs: unknown[] = [];
    const cards = innerData.cards ?? innerData;
    if (Array.isArray(cards)) {
      for (const card of cards) {
        const cardObj = card as Record<string, unknown>;
        if (cardObj.mblog) {
          mblogs.push(cardObj.mblog);
        }
        const cardGroup = cardObj.card_group as unknown[] | undefined;
        if (Array.isArray(cardGroup)) {
          for (const groupItem of cardGroup) {
            const gObj = groupItem as Record<string, unknown>;
            if (gObj.mblog) mblogs.push(gObj.mblog);
          }
        }
      }
    }

    return this.parseWeiboPosts(mblogs);
  }

  /**
   * 解析微博帖子数据
   */
  private parseWeiboPosts(rawPosts: unknown[]): WeiboPost[] {
    return rawPosts.map((item: unknown) => {
      const raw = item as Record<string, unknown>;
      const userInfo = raw.user as Record<string, unknown> | undefined;

      // 提取图片 URL（微博图片在 pics 字段或 pic_urls 字段）
      let imageUrls: string[] = [];
      const pics = raw.pics as unknown[] | undefined;
      if (Array.isArray(pics)) {
        imageUrls = pics.map((pic: unknown) => {
          const picObj = pic as Record<string, unknown>;
          // 优先使用大图 url，其次 largeurl
          return String(picObj.url ?? picObj.largeurl ?? "");
        }).filter(Boolean);
      }
      // 兜容：pic_urls 字段
      if (imageUrls.length === 0) {
        const picUrls = raw.pic_urls as unknown[] | undefined;
        if (Array.isArray(picUrls)) {
          imageUrls = picUrls.map((pic: unknown) => {
            const picObj = pic as Record<string, unknown>;
            return String(picObj.url ?? picObj.largeurl ?? "");
          }).filter(Boolean);
        }
      }

      return {
        postId: String(raw.id ?? raw.mid ?? ""),
        text: String(raw.text ?? "").replace(/<[^>]*>/g, "").trim().slice(0, 200),
        imageUrls,
        likesCount: Number(raw.attitudes_count ?? 0),
        commentsCount: Number(raw.comments_count ?? 0),
        repostsCount: Number(raw.reposts_count ?? 0),
        authorId: String(userInfo?.id ?? ""),
        authorName: String(userInfo?.screen_name ?? ""),
        authorFansCount: Number(userInfo?.followers_count ?? 0),
        publishTime: Number(raw.created_at ?? 0),
      };
    });
  }

  // ========== 抖音搜索 API ==========

  /**
   * 搜索抖音内容（图文/视频）
   * 使用 TikHub 端点：/api/v1/douyin/search/fetch_general_search_v1
   * @param keyword - 搜索关键词
   * @param contentType - 内容类型：0=不限，1=视频，2=图片
   * @param sortType - 排序方式：0=综合，1=最多点赞，2=最新发布
   * @returns 抖音帖子列表
   */
  async searchDouyinPosts(keyword: string, contentType: number = 2, sortType: number = 0): Promise<DouyinPost[]> {
    const response = await fetch(`${this.baseUrl}/api/v1/douyin/search/fetch_general_search_v1`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        keyword,
        content_type: String(contentType),
        sort_type: String(sortType),
        cursor: "0",
        search_id: "",
        backtrace: "",
      }),
    });

    if (!response.ok) {
      throw new Error(`TikHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    // 响应结构：data.data（数组）
    const rawList = data?.data?.data ?? data?.data ?? [];
    if (!Array.isArray(rawList)) return [];

    return this.parseDouyinPosts(rawList);
  }

  /**
   * 解析抖音帖子数据
   */
  private parseDouyinPosts(rawList: unknown[]): DouyinPost[] {
    return rawList.map((item: unknown) => {
      const raw = item as Record<string, unknown>;
      const awemeInfo = (raw.aweme_info ?? raw) as Record<string, unknown>;
      const authorInfo = awemeInfo.author as Record<string, unknown> | undefined;
      const videoObj = awemeInfo.video as Record<string, unknown> | undefined;

      // 提取图片 URL（图文类型在 images 字段，视频类型用 video.cover）
      let imageUrls: string[] = [];
      const images = awemeInfo.images as unknown[] | undefined;
      if (Array.isArray(images)) {
        imageUrls = images.map((img: unknown) => {
          const imgObj = img as Record<string, unknown>;
          const urlList = imgObj.url_list as unknown[] | undefined;
          if (Array.isArray(urlList) && urlList.length > 0) {
            return String((urlList[urlList.length - 1] as Record<string, unknown>)?.url ?? urlList[urlList.length - 1] ?? "");
          }
          return String(imgObj.url ?? "");
        }).filter(Boolean);
      }
      // 兜容：video.cover（视频类型的封面在 video.cover.url_list）
      if (imageUrls.length === 0) {
        const videoCover = videoObj?.cover as Record<string, unknown> | undefined;
        const coverUrls = videoCover?.url_list as unknown[] | undefined;
        if (Array.isArray(coverUrls) && coverUrls.length > 0) {
          imageUrls = [String(coverUrls[coverUrls.length - 1] ?? "")];
        }
      }

      // 提取视频播放地址（video.play_addr.url_list）
      let videoUrl = "";
      const playAddr = videoObj?.play_addr as Record<string, unknown> | undefined;
      const playUrls = playAddr?.url_list as unknown[] | undefined;
      if (Array.isArray(playUrls) && playUrls.length > 0) {
        videoUrl = String(playUrls[0] ?? "");
      }

      return {
        awemeId: String(awemeInfo.aweme_id ?? awemeInfo.id ?? ""),
        description: String(awemeInfo.desc ?? "").trim().slice(0, 200),
        imageUrls,
        videoUrl,
        likesCount: Number((awemeInfo as Record<string, unknown>).digg_count ?? ((awemeInfo as Record<string, unknown>).statistics as Record<string, unknown> | undefined)?.digg_count ?? 0),
        commentsCount: Number((awemeInfo as Record<string, unknown>).comment_count ?? ((awemeInfo as Record<string, unknown>).statistics as Record<string, unknown> | undefined)?.comment_count ?? 0),
        authorId: String(authorInfo?.uid ?? ""),
        authorSecUid: String(authorInfo?.sec_uid ?? ""),
        authorName: String(authorInfo?.nickname ?? ""),
        authorFansCount: Number(authorInfo?.follower_count ?? 0),
        publishTime: Number(awemeInfo.create_time ?? 0),
      };
    });
  }

  /**
   * 获取指定用户的抖音作品列表
   * 使用 TikHub 端点：/api/v1/douyin/web/fetch_user_post_videos
   * @param secUid - 用户 sec_uid（对应 DouyinPost.authorId）
   * @param count - 返回数量限制（默认 20）
   * @returns 抖音帖子列表
   */
  async fetchDouyinUserPosts(secUid: string, count: number = 20): Promise<DouyinPost[]> {
    const url = new URL(`${this.baseUrl}/api/v1/douyin/web/fetch_user_post_videos`);
    url.searchParams.set("sec_user_id", secUid);
    url.searchParams.set("max_cursor", "0");
    url.searchParams.set("count", String(count));

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      const log = getLogger("tikhub-client");
      log.error({ status: response.status, secUid, body: errorBody.slice(0, 500) }, "fetch_user_post_videos 请求失败");
      return [];
    }

    const json = await response.json();
    // fetch_user_post_videos 返回 { code, data: { aweme_list: [...] } }
    const rawList = json?.data?.aweme_list ?? [];
    if (!Array.isArray(rawList)) {
      return [];
    }

    // 复用现有的解析方法
    return this.parseDouyinPosts(rawList);
  }

  /**
   * 获取单个视频详情（封面 + 播放地址）
   * @param awemeId - 抖音作品 ID
   */
  async fetchDouyinVideoDetail(awemeId: string): Promise<{ coverUrl: string; videoUrl: string }> {
    const url = new URL(`${this.baseUrl}/api/v1/douyin/web/fetch_aweme_detail`);
    url.searchParams.set("aweme_id", awemeId);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const log = getLogger("tikhub-client");
      log.error({ status: response.status, awemeId }, "fetch_aweme_detail 请求失败");
      return { coverUrl: "", videoUrl: "" };
    }

    const json = await response.json();
    const item = json?.data?.data ?? json?.data;
    const videoObj = item?.video as Record<string, unknown> | undefined;

    // 封面：video.cover.url_list
    let coverUrl = "";
    const videoCover = videoObj?.cover as Record<string, unknown> | undefined;
    const coverUrls = videoCover?.url_list as unknown[] | undefined;
    if (Array.isArray(coverUrls) && coverUrls.length > 0) {
      coverUrl = String(coverUrls[coverUrls.length - 1]);
    }

    // 播放地址：video.play_addr.url_list
    let videoUrl = "";
    const playAddr = videoObj?.play_addr as Record<string, unknown> | undefined;
    const playUrls = playAddr?.url_list as unknown[] | undefined;
    if (Array.isArray(playUrls) && playUrls.length > 0) {
      videoUrl = String(playUrls[0]);
    }

    return { coverUrl, videoUrl };
  }

  /**
   * 获取抖音视频播放地址
   * 使用 TikHub 端点：/api/v1/douyin/web/fetch_aweme_detail
   * @param awemeId - 抖音作品 ID
   * @returns 视频播放 URL，失败时返回 null
   */
  async fetchDouyinVideoUrl(awemeId: string): Promise<string | null> {
    const url = new URL(`${this.baseUrl}/api/v1/douyin/web/fetch_aweme_detail`);
    url.searchParams.set("aweme_id", awemeId);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    // 响应结构：data.data.video.play_addr.url_list[0]
    const urlList = data?.data?.data?.video?.play_addr?.url_list;
    if (Array.isArray(urlList) && urlList.length > 0) {
      return String(urlList[0]);
    }

    return null;
  }

  // ========== 多平台热榜 API ==========

  /**
   * 平台热榜端点配置（基于 TikHub OpenAPI spec v5.3.2, 2026-04-22）
   */
  private static HOT_TREND_ENDPOINTS: PlatformHotConfig[] = [
    { platform: "douyin", endpoint: "/api/v1/douyin/billboard/fetch_hot_total_list", method: "GET", parsePath: "data.data.objs", queryParams: { page: "1", page_size: "30", type: "snapshot" } },
    { platform: "weibo", endpoint: "/api/v1/weibo/web_v2/fetch_hot_search_summary", method: "GET", parsePath: "data.data", queryParams: {} },
    { platform: "bilibili", endpoint: "/api/v1/bilibili/web/fetch_hot_search", method: "GET", parsePath: "data.data.trending.list", queryParams: { limit: "30" } },
    { platform: "zhihu", endpoint: "/api/v1/zhihu/web/fetch_hot_list", method: "GET", parsePath: "data.data", queryParams: {} },
    { platform: "kuaishou", endpoint: "/api/v1/kuaishou/web/fetch_kuaishou_hot_list_v2", method: "GET", parsePath: "data.hots", queryParams: {} },
    { platform: "xiaohongshu", endpoint: "/api/v1/xiaohongshu/web_v2/fetch_hot_list", method: "GET", parsePath: "data.data.items", queryParams: {} },
  ];

  /**
   * 获取单个平台热榜数据
   * @param platform - 平台名称
   * @param limit - 返回数量限制
   * @returns 热点列表
   */
  async fetchPlatformHotTrends(platform: string, limit: number = 50): Promise<MultiPlatformHotTrend[]> {
    const config = TikHubClient.HOT_TREND_ENDPOINTS.find(c => c.platform === platform);
    if (!config) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    const url = new URL(`${this.baseUrl}${config.endpoint}`);
    for (const [key, value] of Object.entries(config.queryParams || {})) {
      url.searchParams.set(key, value);
    }
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };

    try {
      const response = config.method === "GET"
        ? await fetch(url.toString(), { method: "GET", headers })
        : await fetch(url.toString(), { method: "POST", headers, body: JSON.stringify({ limit }) });

      if (!response.ok) {
        // 端点不可用时返回空数组（容错处理）
        return [];
      }

      const data = await response.json();
      const rawList = this.extractDataByPath(data, config.parsePath);
      // 确保 rawList 是数组类型
      if (!Array.isArray(rawList)) {
        return [];
      }
      return this.parsePlatformHotTrends(rawList, platform, limit);
    } catch (error) {
      // 网络错误或解析错误时返回空数组（容错处理）
      return [];
    }
  }

  /**
   * 获取所有平台热榜数据（聚合）
   * @param platforms - 平台列表，默认全部
   * @param limitPerPlatform - 每平台数量限制
   * @returns 所有平台热点列表
   */
  async fetchAllPlatformHotTrends(
    platforms: string[] = ["douyin", "xiaohongshu", "kuaishou", "weibo", "bilibili", "zhihu"],
    limitPerPlatform: number = 30
  ): Promise<MultiPlatformHotTrend[]> {
    const results: MultiPlatformHotTrend[] = [];

    // 并行获取各平台数据
    const fetchPromises = platforms.map(platform =>
      this.fetchPlatformHotTrends(platform, limitPerPlatform)
    );

    const platformResults = await Promise.all(fetchPromises);

    for (const trends of platformResults) {
      results.push(...trends);
    }

    return results;
  }

  /**
   * 按路径提取 JSON 数据
   * @param data - 原始数据对象
   * @param path - 路径字符串，如 "data.data"
   * @returns 提取的数据
   */
  private extractDataByPath(data: unknown, path: string): unknown {
    const keys = path.split(".");
    let current = data;
    for (const key of keys) {
      if (current && typeof current === "object" && key in current) {
        current = (current as Record<string, unknown>)[key];
      } else {
        return null;
      }
    }
    return current;
  }

  /**
   * 解析平台热点数据（统一格式）
   * @param rawList - 原始热点列表
   * @param platform - 平台名称
   * @param limit - 数量限制
   * @returns 标准化的热点列表
   */
  private parsePlatformHotTrends(rawList: unknown[], platform: string, limit: number): MultiPlatformHotTrend[] {
    const now = Date.now();

    return rawList.slice(0, limit).map((item: unknown, index: number) => {
      const raw = item as Record<string, unknown>;

      // 各平台字段名不同，统一映射
      return {
        title: this.extractTitle(raw, platform),
        platform,
        rank: this.extractRank(raw, index),
        heatValue: this.extractHeatValue(raw, platform),
        trend: this.extractTrend(raw),
        url: this.extractUrl(raw, platform),
        category: this.extractCategory(raw, platform),
        createdAt: now,
      };
    });
  }

  /**
   * 提取标题（各平台字段名不同）
   */
  private extractTitle(raw: Record<string, unknown>, platform: string): string {
    const titleFields: Record<string, string[]> = {
      douyin: ["sentence", "word", "title", "hot_title"],
      weibo: ["keyword", "note", "title", "hot_word"],
      bilibili: ["show_name", "title", "name"],
      zhihu: ["title", "question_title"],
      kuaishou: ["keyword", "title", "name"],
      xiaohongshu: ["title", "note_title"],
    };

    // 知乎标题在 target 对象内
    if (platform === "zhihu" && raw.target && typeof raw.target === "object") {
      const target = raw.target as Record<string, unknown>;
      if (typeof target.title === "string") return target.title;
    }

    const fields = titleFields[platform] || ["title"];
    for (const field of fields) {
      if (raw[field] && typeof raw[field] === "string") {
        return raw[field] as string;
      }
    }
    return "";
  }

  /**
   * 提取排名
   */
  private extractRank(raw: Record<string, unknown>, fallbackIndex: number): number {
    if (raw.rank && typeof raw.rank === "number") {
      return raw.rank as number;
    }
    if (raw.position && typeof raw.position === "number") {
      return raw.position as number;
    }
    return fallbackIndex + 1;
  }

  /**
   * 提取热度值
   */
  private extractHeatValue(raw: Record<string, unknown>, platform: string): number {
    const heatFields: Record<string, string[]> = {
      douyin: ["hot_value", "score", "hotScore"],
      weibo: ["hot_num", "realpos", "num"],
      bilibili: ["score", "hot_score"],
      zhihu: ["hot", "热度"],
      kuaishou: ["hotValue", "score"],
      xiaohongshu: ["hot_value", "score"],
    };

    const fields = heatFields[platform] || ["heat_value", "score"];
    for (const field of fields) {
      if (raw[field] !== undefined) {
        const value = raw[field];
        if (typeof value === "number") {
          return value;
        }
        if (typeof value === "string") {
          const parsed = parseFloat(value);
          return isNaN(parsed) ? 0 : parsed;
        }
      }
    }
    return 0;
  }

  /**
   * 提取趋势方向
   */
  private extractTrend(raw: Record<string, unknown>): "up" | "down" | "stable" {
    const trendValue = raw.trend || raw.label_desc || raw.icon_desc;

    if (typeof trendValue === "string") {
      if (trendValue.includes("上升") || trendValue.includes("up") || trendValue.includes("热")) {
        return "up";
      }
      if (trendValue.includes("下降") || trendValue.includes("down") || trendValue.includes("新")) {
        return "down";
      }
    }

    if (typeof trendValue === "number") {
      if (trendValue > 0) return "up";
      if (trendValue < 0) return "down";
    }

    return "stable";
  }

  /**
   * 提取 URL
   */
  private extractUrl(raw: Record<string, unknown>, platform: string): string | undefined {
    const urlFields: Record<string, string[]> = {
      douyin: ["url", "share_url", "link"],
      weibo: ["url", "link"],
      bilibili: ["url", "link"],
      zhihu: ["url", "link"],
      kuaishou: ["url", "link"],
      xiaohongshu: ["url", "link"],
    };

    const fields = urlFields[platform] || ["url"];
    for (const field of fields) {
      if (raw[field] && typeof raw[field] === "string") {
        return raw[field] as string;
      }
    }
    return undefined;
  }

  /**
   * 提取分类
   */
  private extractCategory(raw: Record<string, unknown>, platform: string): string | undefined {
    const categoryFields: Record<string, string[]> = {
      douyin: ["category", "type"],
      weibo: ["category", "label"],
      bilibili: ["category", "tid"],
      zhihu: ["category", "type"],
      kuaishou: ["category", "type"],
      xiaohongshu: ["category", "type"],
    };

    const fields = categoryFields[platform] || ["category"];
    for (const field of fields) {
      if (raw[field] && typeof raw[field] === "string") {
        return raw[field] as string;
      }
    }
    return undefined;
  }
}
