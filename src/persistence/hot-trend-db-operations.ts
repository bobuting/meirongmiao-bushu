/**
 * hot-trend-db-operations.ts
 *
 * 热榜数据库操作的统一入口。
 * SQL 已全部下沉到 Repository 层，本模块仅做参数映射和委托调用。
 * 非数据库操作（视频下载、OSS 上传）保留在此处。
 */

import type { PgRepositoryCollection } from "../repositories/pg/index.js";
import type { ShotBreakdownItem } from "../contracts/shot-breakdown-contract.js";
import { AppError } from "../core/errors.js";
import { getLogger } from "../core/logger/index.js";
import { hashJsonString } from "./hash-util.js";
import type { IObjectStorageAdapter } from "../contracts/object-storage.js";
import { compressVideoForLlm, hasVideoTrack } from "../utils/video-compression.js";
import { isSupportedVideoReverseMultipartMimeType } from "../contracts/video-reverse-multipart-entry.js";

const log = getLogger("hot-trend-db-operations");

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 热榜数据库操作依赖 */
export interface HotTrendDbOperationsDeps {
  repos: PgRepositoryCollection;
  storage?: IObjectStorageAdapter;
  videoDownloadTimeoutMs?: number;
}

/** 热榜资产插入参数 */
export interface InsertHotTrendAssetInput {
  id: string;
  topic: string;
  url: string | null;
  rank: number | null;
  hotValue: string | null;
  section: string | null;
  source: string;
  trendType: "video" | "realtime";
  sourceOssUrl?: string | null;
  /** 封面图 URL */
  coverUrl?: string | null;
  // 视频元数据（从 libraryScripts.reverseContext.sourceMeta 迁移）
  videoTitle?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  createTime?: number | null;
  playCount?: number | null;
  commentCount?: number | null;
  diggCount?: number | null;
  shareCount?: number | null;
  collectCount?: number | null;
  recommendCount?: number | null;
  nickname?: string | null;
  duration?: number | null;
  scriptText?: string | null;
}

/** 热榜资产查询结果 */
export interface HotTrendAssetResult {
  id: string;
  topic: string;
  scriptId: string | null;
  sourceOssUrl: string | null;
  /** 封面图 URL */
  coverUrl: string | null;
  // 视频元数据
  videoTitle: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  createTime: number | null;
  playCount: number | null;
  commentCount: number | null;
  diggCount: number | null;
  shareCount: number | null;
  collectCount: number | null;
  recommendCount: number | null;
  nickname: string | null;
  duration: number | null;
  scriptText: string | null;
}

/** 脚本数据插入参数 */
export interface InsertScriptDataInput {
  id: string;
  type: number;
  title: string;
  durationSeconds?: number;
  source?: string;
  theme?: string;
  summary?: string;
  primaryEmotion?: string;
  videoType?: string;
  videoStyle?: string;
  fashionSuitable?: boolean;
  fashionReason?: string;
  emotionDetail?: Record<string, unknown>;
  onScreenPresence?: Record<string, unknown>;
  fashionStyles?: Record<string, unknown>[];
  editingAnalysis?: Record<string, unknown>;
  sourceOssUrl?: string | null;
  timeOfDay?: string;
  weather?: string;
}

/** 情感原型插入参数 */
export interface InsertEmotionArchetypeInput {
  category: string;
  emotionCore: string;
  moment: string;
  conflict: string;
  clothingRole: string;
  source: string;
  sourceMetadata?: Record<string, unknown>;
}

/** 热榜数据库操作接口 */
export interface HotTrendDbOperations {
  insertHotTrendAsset: (input: InsertHotTrendAssetInput) => Promise<void>;
  findHotTrendAssetByTopic: (topic: string, trendType: "video" | "realtime") => Promise<HotTrendAssetResult | null>;
  updateHotTrendAssetScriptId: (assetId: string, scriptId: string) => Promise<void>;
  updateHotTrendAssetSourceOssUrl: (assetId: string, sourceOssUrl: string) => Promise<void>;
  insertScriptData: (input: InsertScriptDataInput) => Promise<string>;
  insertShotBreakdown: (scriptId: string, shots: Record<string, unknown>[]) => Promise<number>;
  insertEmotionArchetype: (input: InsertEmotionArchetypeInput) => Promise<string | null>;
  closeSharedDbPool: () => Promise<void>;
  downloadVideoForLlm: (sourceUrl: string) => Promise<{ base64: string; mimeType: string }>;
  uploadVideoToOss: (videoBase64: string, mimeType: string, keyPrefix: string) => Promise<string>;
}

// ---------------------------------------------------------------------------
// 实现
// ---------------------------------------------------------------------------

/** 创建热榜数据库操作实例 */
export function createHotTrendDbOperations(deps: HotTrendDbOperationsDeps): HotTrendDbOperations {
  const { repos, storage } = deps;

  /** 插入或更新热榜资产 → 委托 PgHotTrendAssetRepository */
  const insertHotTrendAsset = async (input: InsertHotTrendAssetInput): Promise<void> => {
    await repos.hotTrendAssets.upsertWithVideoMetadata({
      ...input,
      now: Date.now(),
    });
  };

  /** 根据主题查询热榜资产 → 委托 PgHotTrendAssetRepository */
  const findHotTrendAssetByTopic = async (topic: string, trendType: "video" | "realtime"): Promise<HotTrendAssetResult | null> => {
    const record = await repos.hotTrendAssets.findDetailByTopicAndType(topic, trendType);
    if (!record) return null;
    return {
      id: record.id,
      topic: record.topic,
      scriptId: record.scriptId,
      sourceOssUrl: record.sourceOssUrl,
      coverUrl: record.coverUrl,
      videoTitle: record.videoTitle,
      videoUrl: record.videoUrl,
      audioUrl: record.audioUrl,
      createTime: record.createTime,
      playCount: record.playCount,
      commentCount: record.commentCount,
      diggCount: record.diggCount,
      shareCount: record.shareCount,
      collectCount: record.collectCount,
      recommendCount: record.recommendCount,
      nickname: record.nickname,
      duration: record.duration,
      scriptText: record.scriptText,
    };
  };

  /** 更新热榜资产的脚本 ID → 委托 PgHotTrendAssetRepository */
  const updateHotTrendAssetScriptId = async (assetId: string, scriptId: string): Promise<void> => {
    await repos.hotTrendAssets.updateScriptId(assetId, scriptId);
  };

  /** 更新热榜资产的 OSS URL → 委托 PgHotTrendAssetRepository */
  const updateHotTrendAssetSourceOssUrl = async (assetId: string, sourceOssUrl: string): Promise<void> => {
    await repos.hotTrendAssets.updateSourceOssUrl(assetId, sourceOssUrl, Date.now());
  };

  /** 插入或更新脚本数据 → 委托 PgScriptDataRepository */
  const insertScriptData = async (input: InsertScriptDataInput): Promise<string> => {
    return await repos.scriptData.upsertFromHotTrend({
      ...input,
      now: Date.now(),
    });
  };

  /** 关闭数据库连接池（Pool 由外部管理，此方法为空操作） */
  const closeSharedDbPool = async (): Promise<void> => {
    // Pool 由外部管理，无需关闭
  };

  /** 下载视频用于 LLM 分析 */
  const downloadVideoForLlm = async (sourceUrl: string): Promise<{ base64: string; mimeType: string }> => {
    log.info({ sourceUrl }, "video hot trend: downloading video for llm base64");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.videoDownloadTimeoutMs ?? 300_000);
    try {
      // 添加浏览器请求头，避免抖音 CDN 反爬断开连接
      const browserHeaders: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Accept-Encoding": "identity",
        "Connection": "keep-alive",
      };
      // 如果是抖音 CDN URL，添加 Referer
      if (sourceUrl.includes("zjcdn.com") || sourceUrl.includes("douyin.com")) {
        browserHeaders["Referer"] = "https://www.douyin.com/";
      }
      const response = await fetch(sourceUrl, { signal: controller.signal, headers: browserHeaders });
      clearTimeout(timer);
      if (!response.ok) {
        throw new AppError(
          502,
          "VIDEO_DOWNLOAD_FAILED",
          `下载视频失败: HTTP ${response.status}, URL: ${sourceUrl}`,
        );
      }
      const rawMimeType = response.headers.get("content-type") || "";
      // 验证 mime type：必须是 video/* 或 audio/* 格式
      // 避免下载 HTML 页面或其他非视频内容被当作视频传给 LLM
      if (!isSupportedVideoReverseMultipartMimeType(rawMimeType)) {
        log.warn({ sourceUrl, rawMimeType }, "downloadVideoForLlm: invalid mime type, rejecting download");
        throw new AppError(
          502,
          "INVALID_VIDEO_MIME_TYPE",
          `下载的内容不是有效的视频格式 (${rawMimeType}), URL: ${sourceUrl}`,
        );
      }
      const mimeType = rawMimeType;
      const arrayBuffer = await response.arrayBuffer();
      const bytes = Buffer.from(arrayBuffer);
      if (bytes.length < 1024) {
        throw new AppError(
          502,
          "VIDEO_DOWNLOAD_TOO_SMALL",
          `下载的视频文件太小 (${bytes.length} bytes), URL: ${sourceUrl}`,
        );
      }

      // 验证下载的文件是否包含视频轨道
      // 抖音 CDN 可能分离音频和视频流，导致下载到纯音频文件
      if (!hasVideoTrack(bytes)) {
        throw new AppError(
          502,
          "VIDEO_NO_VIDEO_TRACK",
          `下载的文件不包含视频轨道（可能为纯音频流）。文件大小: ${bytes.length} bytes, MIME: ${rawMimeType}, URL: ${sourceUrl}`,
        );
      }

      // 压缩视频以符合 Gemini inline_data 限制
      const compressed = await compressVideoForLlm(bytes, mimeType, {
        info: (obj, msg) => log.info(obj as Record<string, unknown>, msg),
        warn: (obj, msg) => log.warn(obj as Record<string, unknown>, msg),
      });

      const base64 = compressed.compressedBytes.toString("base64");
      log.info(
        {
          sourceUrl,
          originalByteLength: bytes.length,
          compressedByteLength: compressed.compressedBytes.byteLength,
          mimeType: compressed.mimeType
        },
        "video hot trend: video downloaded and compressed to base64"
      );
      return { base64, mimeType: compressed.mimeType };
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        502,
        "VIDEO_DOWNLOAD_ERROR",
        `下载视频失败: ${error instanceof Error ? error.message : String(error)}, URL: ${sourceUrl}`,
      );
    }
  };

  /** 上传视频到 OSS */
  const uploadVideoToOss = async (videoBase64: string, mimeType: string, keyPrefix: string): Promise<string> => {
    if (!storage) {
      throw new AppError(500, "OSS_NOT_CONFIGURED", "OSS 存储未配置，无法上传视频");
    }
    const ext = mimeType.includes("mp4") ? "mp4" : "mp4";
    const timestamp = Date.now();
    const key = `${keyPrefix}/${timestamp}/video.${ext}`;
    const bytes = Buffer.from(videoBase64, "base64");
    try {
      await storage.putObject(key, new Uint8Array(bytes), mimeType);
      const publicUrl = await storage.getSignedUrl(key);
      log.info({ key, byteLength: bytes.length, publicUrl }, "video hot trend: video uploaded to oss");
      return publicUrl;
    } catch (error) {
      throw new AppError(
        502,
        "OSS_UPLOAD_FAILED",
        `上传视频到 OSS 失败: ${error instanceof Error ? error.message : String(error)}, key: ${key}`,
      );
    }
  };

  /** 批量插入分镜数据 → 委托 PgShotBreakdownRepository */
  const insertShotBreakdown = async (scriptId: string, shots: Record<string, unknown>[]): Promise<number> => {
    const now = Date.now();
    return await repos.shotBreakdowns.batchInsert({
      scriptDataId: scriptId,
      shots: shots.map((shot, i) => {
        const shotId = typeof shot.shot_id === "number" ? Math.round(shot.shot_id) : (i + 1);
        const timecode = (shot.timecode ?? {}) as Record<string, unknown>;
        return {
          shot_id: shotId,
          shot_type: (shot.shot_type as string) ?? undefined,
          camera_movement: (shot.camera_movement as string) ?? undefined,
          shot_description: (shot.shot_description as string) ?? undefined,
          timecode: {
            start: (timecode.start as string) ?? undefined,
            end: (timecode.end as string) ?? undefined,
            duration_seconds: (timecode.duration_seconds as number) ?? undefined,
          },
          transition_in: (shot.transition_in as Record<string, unknown> | string) ?? undefined,
          transition_out: (shot.transition_out as Record<string, unknown> | string) ?? undefined,
          camera_details: (shot.camera_details as Record<string, unknown>) ?? undefined,
          visual: (shot.visual as Record<string, unknown>) ?? undefined,
          subjects: (shot.subjects as ShotBreakdownItem["subjects"]) ?? undefined,
          audio: shot.audio as ShotBreakdownItem["audio"],
          text_elements: (shot.text_elements as ShotBreakdownItem["text_elements"]) ?? undefined,
          speed_effects: (shot.speed_effects as Record<string, unknown>) ?? undefined,
        };
      }),
      createdAt: now,
      updatedAt: now,
    });
  };

  /** 插入 LLM 提取的情感原型 → 委托 PgEmotionArchetypeLibraryRepository */
  const insertEmotionArchetype = async (input: InsertEmotionArchetypeInput): Promise<string | null> => {
    // 验证必填字段
    if (!input.category || !input.emotionCore || !input.moment || !input.conflict || !input.clothingRole) {
      log.warn({ input }, "insertEmotionArchetype: missing required fields, skipping");
      return null;
    }

    const now = Date.now();

    // 生成唯一 ID：基于 emotion_core 的哈希 + 时间戳
    const emotionCoreHash = hashJsonString(input.emotionCore);
    const archetypeId = `EA-LLM-${emotionCoreHash.slice(0, 8)}-${now}`;

    await repos.emotionArchetypes.upsertArchetypeByEmotionCore({
      archetypeId,
      name: input.moment.slice(0, 50),
      category: input.category,
      emotionCore: input.emotionCore,
      moment: input.moment,
      conflict: input.conflict,
      clothingRole: input.clothingRole,
      source: input.source,
      sourceMetadata: input.sourceMetadata ?? {},
      now,
    });

    log.info({ archetypeId, category: input.category, emotionCore: input.emotionCore }, "insertEmotionArchetype: archetype inserted");
    return archetypeId;
  };

  return {
    insertHotTrendAsset,
    findHotTrendAssetByTopic,
    updateHotTrendAssetScriptId,
    updateHotTrendAssetSourceOssUrl,
    insertScriptData,
    insertShotBreakdown,
    insertEmotionArchetype,
    closeSharedDbPool,
    downloadVideoForLlm,
    uploadVideoToOss,
  };
}
