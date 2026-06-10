/**
 * 启动阶段媒体 URL 归一化
 *
 * 从 app.ts 提取的启动时 data-URL / 远程 URL 归一化逻辑，
 * 负责将内联 data-url 持久化到对象存储，并修正历史遗留的媒体引用。
 */

import type { FastifyInstance } from "fastify";
import type {
  // CharacterViewKey,  // UNUSED
  CharacterViewSession,
  LibraryCharacter,
  StoryboardFrame,
} from "../contracts/types.js";
import type { AppContext } from "../core/app-context.js";
import { AppError } from "../core/errors.js";
import { persistImageSourceToStorage } from "../services/media/storage-persist.js";
import { isDataImageUrl } from "../utils/url.js";
import { sanitizeUrlField } from "../contracts/media-url-safety.js";
import {
  normalizeStep3StoryboardFrameGenerationInput,
} from "./step3-storyboard-frame-generation-contract.js";
import {
  normalizeStoryboardFrameMediaUrls,
  storyboardFrameContainsInlineMediaUrls,
} from "./storyboard-frame-media-normalizer.js";

// ---------- 内部辅助函数（从 app.ts 复制的最小依赖集） ----------

// UNUSED REMOVED: FIVE_VIEW_DEFINITIONS, withVariantSuffix, pickLatestCandidate (TS6133)

function recomputeCharacterViewSession(session: CharacterViewSession): void {
  session.generated = session.views.filter((item) => item.status === "ready").length;
  session.confirmed = session.views.filter((item) => item.confirmed && item.selectedImageUrl).length;
  session.total = session.views.length;
  if (session.confirmed >= session.total) {
    session.status = "completed";
    return;
  }
  const hasGenerating = session.views.some((item) => item.status === "generating");
  session.status = hasGenerating ? "running" : "idle";
}

function syncCharacterViewsFromSession(character: LibraryCharacter): void {
  const session = character.viewSession;
  if (!session) {
    return;
  }
  recomputeCharacterViewSession(session);
  const hasConfirmedView = session.views.some((item) => item.confirmed && Boolean(item.selectedImageUrl));
  // views 字段已弃用，不再写入，保留空数组兼容前端过渡期
  character.views = [];
  if (character.kind !== "video") {
    character.kind = hasConfirmedView ? "image" : "basic";
  }
  character.status = session.status === "running" ? "processing" : "ready";
  character.updatedAt = session.updatedAt;
}

// ---------- 分镜帧图片持久化 ----------

/** 将分镜帧图片持久化到对象存储 */
async function persistStoryboardFrameImageToStorage(
  ctx: AppContext,
  frame: Pick<StoryboardFrame, "projectId" | "index">,
  sourceUrl: string,
  options: { slot: "primary" | "variant"; variantIndex?: number },
): Promise<string> {
  const trimmed = String(sourceUrl ?? "").trim();
  if (!trimmed) {
    throw new AppError(
      502,
      "IMAGE_ASSET_PERSISTENCE_FAILED",
      `step4 storyboard image is empty: projectId=${frame.projectId}; frameIndex=${frame.index}; slot=${options.slot}`,
    );
  }
  const normalizedPrefix = `projects/${frame.projectId}/step4/storyboard-frames/frame-${Math.max(1, Number(frame.index) || 1)}/${options.slot === "primary" ? "primary" : `variant-${(options.variantIndex ?? 0) + 1}`}`;
  try {
    const persisted = await persistImageSourceToStorage(ctx, trimmed, normalizedPrefix, {
      persistRemote: true,
      dedupeByContent: true,
    });
    const safePersisted = sanitizeUrlField(persisted);
    if (safePersisted) {
      return safePersisted;
    }
  } catch (error) {
    const safeFallback = sanitizeUrlField(trimmed);
    if (safeFallback) {
      return safeFallback;
    }
    throw error;
  }
  const safeSource = sanitizeUrlField(trimmed);
  if (safeSource) {
    return safeSource;
  }
  throw new AppError(
    502,
    "IMAGE_ASSET_PERSISTENCE_FAILED",
    `step4 storyboard image is not persistable: projectId=${frame.projectId}; frameIndex=${frame.index}; slot=${options.slot}`,
  );
}

/** 归一化单条分镜帧记录中的内联媒体 URL */
async function normalizeStoryboardFrameRecordMediaUrls(
  ctx: AppContext,
  frame: StoryboardFrame,
): Promise<StoryboardFrame> {
  return normalizeStoryboardFrameMediaUrls(frame, (sourceUrl, context) =>
    persistStoryboardFrameImageToStorage(ctx, frame, sourceUrl, context),
  );
}

// ---------- 对外导出的核心函数 ----------

/**
 * 浅拷贝一个值并确保它是普通 Record 对象，用于启动归一化安全读取
 */
export function clonePlainRecordForStartupNormalization(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  try {
    const normalized = JSON.parse(JSON.stringify(value)) as unknown;
    if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
      return null;
    }
    return normalized as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 读取普通 Record 字段，用于启动归一化安全读取
 */
export function readPlainRecordFieldForStartupNormalization(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

// normalizeProjectWorkflowStateMediaUrls removed - workflow state no longer persisted

/**
 * 遍历 store 中所有实体，归一化内联 data-url 媒体到对象存储
 *
 * 涵盖：素材库资产、角色缩略图/视角/候选图/参考图、分镜帧、项目工作流状态
 */
export async function normalizeInlineMediaUrlsInStore(
  ctx: AppContext,
  log: Pick<FastifyInstance["log"], "info" | "warn">,
): Promise<number> {
  if (!ctx.storage) {
    return 0;
  }
  let changed = 0;

  // 归一化服饰资产中的 data-url
  for (const asset of await ctx.repos.garmentAssets.findByUserId("system")) {
    const assetsToCheck = [
      { field: "mainImageUrl", url: asset.mainImageUrl },
      { field: "subImageUrl1", url: asset.subImageUrl1 },
      { field: "subImageUrl2", url: asset.subImageUrl2 },
      { field: "subImageUrl3", url: asset.subImageUrl3 },
    ];
    let assetChanged = false;
    for (const { field, url } of assetsToCheck) {
      if (!url || !isDataImageUrl(url)) {
        continue;
      }
      try {
        const nextUrl = await persistImageSourceToStorage(
          ctx,
          url,
          `garment-assets/${asset.userId}`,
        );
        if (nextUrl !== url) {
          if (field === "mainImageUrl") asset.mainImageUrl = nextUrl;
          else if (field === "subImageUrl1") asset.subImageUrl1 = nextUrl;
          else if (field === "subImageUrl2") asset.subImageUrl2 = nextUrl;
          else if (field === "subImageUrl3") asset.subImageUrl3 = nextUrl;
          assetChanged = true;
        }
      } catch (error) {
        log.warn({ err: error, assetId: asset.id, field }, "normalize garment asset data-url failed");
      }
    }
    if (assetChanged) {
      asset.updatedAt = ctx.clock.now();
      changed += 1;
    }
  }

  // 归一化角色缩略图、视角、候选图、参考图中的 data-url
  for (const character of await ctx.repos.libraryCharacters.list()) {
    try {
      if (isDataImageUrl(character.thumbnailUrl)) {
        const nextThumb = await persistImageSourceToStorage(
          ctx,
          character.thumbnailUrl,
          `library/characters/${character.userId}/thumbnails`,
        );
        if (nextThumb !== character.thumbnailUrl) {
          character.thumbnailUrl = nextThumb;
          changed += 1;
        }
      }

      // views 已弃用，跳过 views 持久化

      // fiveViewOssImageUrl data-URL 持久化
      if (character.fiveViewOssImageUrl && isDataImageUrl(character.fiveViewOssImageUrl)) {
        const persisted = await persistImageSourceToStorage(
          ctx,
          character.fiveViewOssImageUrl,
          `library/characters/${character.userId}/five-view-oss`,
        );
        if (persisted !== character.fiveViewOssImageUrl) {
          character.fiveViewOssImageUrl = persisted;
          changed += 1;
        }
      }

      if (character.viewSession?.views?.length) {
        for (const view of character.viewSession.views) {
          if (view.confirmSource !== "candidate" && view.confirmSource !== "drag" && view.confirmSource !== "upload") {
            view.confirmSource = "candidate";
            changed += 1;
          }

          if (view.selectedImageUrl && isDataImageUrl(view.selectedImageUrl)) {
            const persisted = await persistImageSourceToStorage(
              ctx,
              view.selectedImageUrl,
              `library/characters/${character.userId}/views`,
            );
            if (persisted !== view.selectedImageUrl) {
              view.selectedImageUrl = persisted;
              changed += 1;
            }
          }

          if (view.candidates.length > 0) {
            const nextCandidates: string[] = [];
            let candidatesChanged = false;
            for (const candidate of view.candidates) {
              if (!isDataImageUrl(candidate)) {
                nextCandidates.push(candidate);
                continue;
              }
              const persisted = await persistImageSourceToStorage(
                ctx,
                candidate,
                `library/characters/${character.userId}/views`,
              );
              nextCandidates.push(persisted);
              candidatesChanged = candidatesChanged || persisted !== candidate;
            }
            if (candidatesChanged) {
              view.candidates = [...new Set(nextCandidates)];
              changed += 1;
            }
          }

          if (Array.isArray(view.referenceImages) && view.referenceImages.length > 0) {
            const nextReferences: string[] = [];
            let referencesChanged = false;
            for (const referenceUrl of view.referenceImages) {
              if (!isDataImageUrl(referenceUrl)) {
                nextReferences.push(referenceUrl);
                continue;
              }
              const persisted = await persistImageSourceToStorage(
                ctx,
                referenceUrl,
                `library/characters/${character.userId}/references/${character.id}/${view.key}`,
              );
              nextReferences.push(persisted);
              referencesChanged = referencesChanged || persisted !== referenceUrl;
            }
            if (referencesChanged) {
              view.referenceImages = [...new Set(nextReferences)].slice(0, 4);
              changed += 1;
            }
          }
        }
        syncCharacterViewsFromSession(character);
      }

      character.updatedAt = ctx.clock.now();
    } catch (error) {
      log.warn({ err: error, characterId: character.id }, "normalize character data-url failed");
    }
  }

  // （nrm_storyboard_frames 表已废弃删除，跳过）

  // Workflow state normalization removed - no longer persisted

  if (changed > 0) {
    log.info(`[media-normalize] normalized ${changed} data-url fields into object storage urls`);
  }
  return changed;
}
