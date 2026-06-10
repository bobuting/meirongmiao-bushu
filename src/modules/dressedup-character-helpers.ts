/**
 * dressedup-character-helpers.ts
 *
 * 从 app.ts 提取的 Dressedup 角色相关辅助函数：
 * 角色标签解析、仓库角色查找、角色视图引用收集、本地存储图片列表。
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { LibraryCharacter, CharacterViewKey, Project } from "../contracts/types.js";
import {
  FIVE_VIEW_DEFINITIONS,
  VIEW_CANDIDATE_HARD_LIMIT,
  buildCharacterViewStoragePrefix,
  createCharacterViewSession,
  syncCharacterViewsFromSession,
  mergeCandidatesUnique,
  pickLatestCandidate,
  normalizeImageIdentity,
  fetchViewPromptsFromTemplate,
} from "./character-view-session.js";
import { listStep2DressedupReadableStoragePrefixes } from "./step2-dressedup-storage-prefix.js";

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** Dressedup 项目标签前缀 */
const DRESSEDUP_PROJECT_TAG_PREFIX = "__dressedup_project:";

/** 对象存储图片扩展名集合 */
const OBJECT_STORAGE_IMAGE_EXTENSION_SET = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".svg",
]);

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 角色引用信息 */
export interface CharacterReference {
  id: string;
  label: string;
  imageUrl: string;
  viewKey: CharacterViewKey;
}

/** Dressedup 辅助函数依赖 */
export interface DressedupHelpersDeps {
  app: FastifyInstance;
  ctx: AppContext;
  objectStorageDriver: string;
  objectStorageLocalRoot: string;
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/** 从角色标签中解析 Dressedup 项目 ID */
export function resolveDressedupProjectIdFromCharacterTags(
  tags: string[] | undefined,
): string | null {
  if (!Array.isArray(tags) || tags.length < 1) {
    return null;
  }
  for (const rawTag of tags) {
    const tag = String(rawTag ?? "").trim();
    if (!tag.startsWith(DRESSEDUP_PROJECT_TAG_PREFIX)) {
      continue;
    }
    const projectId = tag.slice(DRESSEDUP_PROJECT_TAG_PREFIX.length).trim();
    if (projectId) {
      return projectId;
    }
  }
  return null;
}

/** 查找项目最新的 Dressedup 仓库角色 */
export async function resolveLatestDressedupWarehouseCharacterForProject(
  ctx: AppContext,
  userId: string,
  projectId: string,
): Promise<LibraryCharacter | null> {
  const matches = [...(await ctx.repos.libraryCharacters.list())]
    .filter(
      (character) =>
        character.userId === userId &&
        resolveDressedupProjectIdFromCharacterTags(character.tags) === projectId,
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return matches[0] ?? null;
}

/** 从仓库角色中收集已确认的角色引用 */
export function collectConfirmedCharacterReferencesFromWarehouse(
  character: LibraryCharacter | null,
): CharacterReference[] {
  if (!character?.viewSession?.views?.length) {
    return [];
  }
  return FIVE_VIEW_DEFINITIONS.map((definition) => {
    const matched = character.viewSession?.views.find((view) => view.key === definition.key) ?? null;
    const imageUrl = typeof matched?.selectedImageUrl === "string" ? matched.selectedImageUrl.trim() : "";
    if (!matched?.confirmed || !imageUrl) {
      return null;
    }
    return {
      id: `${character.id}:${definition.key}`,
      label: matched.label || definition.label,
      imageUrl,
      viewKey: definition.key,
    };
  }).filter(
    (item): item is CharacterReference => Boolean(item),
  );
}

// ---------------------------------------------------------------------------
// 本地存储图片列表
// ---------------------------------------------------------------------------

/** 列出本地对象存储中以指定前缀开头的图片 URL */
export async function listLocalObjectStorageImageUrlsByPrefix(
  deps: DressedupHelpersDeps,
  prefix: string,
): Promise<string[]> {
  const { app, ctx, objectStorageDriver, objectStorageLocalRoot } = deps;

  if (objectStorageDriver !== "local" || !ctx.storage || ctx.storage.driver !== "local") {
    return [];
  }

  const { readdir, stat, readFile } = await import("node:fs/promises");
  const { resolve, join, extname } = await import("node:path");
  const { existsSync } = await import("node:fs");
  const { resolveBinaryContentType } = await import("../services/utils/content-type.js");

  const normalizedPrefix = prefix
    .replace(/^\/+|\/+$/g, "")
    .replace(/\\/g, "/");
  if (!normalizedPrefix) {
    return [];
  }

  const directoryPath = resolve(join(objectStorageLocalRoot, normalizedPrefix));
  if (!directoryPath.startsWith(objectStorageLocalRoot) || !existsSync(directoryPath)) {
    return [];
  }

  type CandidateFile = { key: string; mtimeMs: number };
  const collected: CandidateFile[] = [];
  const stack: string[] = [directoryPath];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) {
      continue;
    }

    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    try {
      entries = (await readdir(currentDir, {
        withFileTypes: true,
      })) as Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    } catch (error) {
      app.log.warn({ err: error, currentDir, normalizedPrefix }, "list local object storage entries failed");
      continue;
    }

    for (const entry of entries) {
      const entryName = String(entry.name ?? "").trim();
      if (!entryName) {
        continue;
      }

      const absolutePath = resolve(join(currentDir, entryName));
      if (!absolutePath.startsWith(objectStorageLocalRoot)) {
        continue;
      }

      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = extname(entryName).toLowerCase();
      if (!OBJECT_STORAGE_IMAGE_EXTENSION_SET.has(extension)) {
        if (extension) {
          continue;
        }
        // 无扩展名文件，尝试检测内容类型
        let legacyBinary: Uint8Array;
        try {
          legacyBinary = await readFile(absolutePath);
        } catch {
          continue;
        }
        if (!resolveBinaryContentType(absolutePath, legacyBinary).startsWith("image/")) {
          continue;
        }
      }

      let mtimeMs = 0;
      try {
        const metadata = await stat(absolutePath);
        mtimeMs = Number.isFinite(metadata.mtimeMs) ? metadata.mtimeMs : 0;
      } catch {
        mtimeMs = 0;
      }

      const relativeKey = absolutePath
        .slice(objectStorageLocalRoot.length)
        .replace(/^[/\\]+/, "")
        .replace(/\\/g, "/");
      if (!relativeKey) {
        continue;
      }
      collected.push({ key: relativeKey, mtimeMs });
    }
  }

  if (collected.length < 1) {
    return [];
  }

  collected.sort((a, b) => {
    if (a.mtimeMs !== b.mtimeMs) {
      return a.mtimeMs - b.mtimeMs;
    }
    return a.key.localeCompare(b.key);
  });

  const latestWindow = collected.slice(Math.max(0, collected.length - VIEW_CANDIDATE_HARD_LIMIT));
  const urls = await Promise.all(latestWindow.map((item) => ctx.storage!.getSignedUrl(item.key)));
  return [...new Set(urls)];
}

// ---------------------------------------------------------------------------
// 角色视图会话水合
// ---------------------------------------------------------------------------

/** 从存储中水合角色视图会话候选 */
export async function hydrateCharacterViewSessionCandidatesFromStorage(
  deps: DressedupHelpersDeps,
  character: LibraryCharacter,
): Promise<void> {
  const { ctx, objectStorageDriver } = deps;

  if (objectStorageDriver !== "local" || !ctx.storage || ctx.storage.driver !== "local") {
    return;
  }

  const shouldPrepareSession =
    character.kind === "image" ||
    character.kind === "video" ||
    Boolean(resolveDressedupProjectIdFromCharacterTags(character.tags));

  if (!character.viewSession?.views?.length) {
    if (!shouldPrepareSession) {
      return;
    }
    const prompts = await fetchViewPromptsFromTemplate();
    character.viewSession = createCharacterViewSession(character, ctx.clock.now(), prompts);
  }

  const session = character.viewSession;
  if (!session) {
    return;
  }

  const dressedupProjectId = resolveDressedupProjectIdFromCharacterTags(character.tags);
  const dressedupProject =
    dressedupProjectId && (await ctx.repos.projects.findById(dressedupProjectId)) !== null
      ? (await ctx.repos.projects.findById(dressedupProjectId)) ?? null
      : null;

  let changed = false;

  for (const view of session.views) {
    const prefixes = dressedupProject
      ? listStep2DressedupReadableStoragePrefixes(dressedupProject, view.key)
      : [buildCharacterViewStoragePrefix(character, view.key)];

    const storageCandidates = (
      await Promise.all(prefixes.map((prefix) => listLocalObjectStorageImageUrlsByPrefix(deps, prefix)))
    ).reduce((merged, current) => mergeCandidatesUnique(merged, current), [] as string[]);

    if (storageCandidates.length < 1) {
      continue;
    }

    const mergedCandidates = mergeCandidatesUnique(view.candidates, storageCandidates);
    const trimmedCandidates = mergedCandidates.slice(
      Math.max(0, mergedCandidates.length - VIEW_CANDIDATE_HARD_LIMIT),
    );

    const candidatesChanged =
      trimmedCandidates.length !== view.candidates.length ||
      trimmedCandidates.some((item, index) => item !== view.candidates[index]);

    if (candidatesChanged) {
      view.candidates = trimmedCandidates;
      changed = true;
    }

    const selectedImage = String(view.selectedImageUrl ?? "").trim();
    const hasSelectedInPool =
      selectedImage.length > 0 &&
      view.candidates.some(
        (candidate) => normalizeImageIdentity(candidate) === normalizeImageIdentity(selectedImage),
      );

    if (!selectedImage || !hasSelectedInPool) {
      const fallbackSelected = pickLatestCandidate(view.candidates);
      if (fallbackSelected !== (view.selectedImageUrl ?? null)) {
        view.selectedImageUrl = fallbackSelected;
        changed = true;
      }
    }

    if (view.candidates.length > 0 && view.status !== "generating") {
      if (view.status !== "ready") {
        view.status = "ready";
        changed = true;
      }
      if (view.errorMessage) {
        view.errorMessage = null;
        changed = true;
      }
    }
  }

  if (changed) {
    session.updatedAt = ctx.clock.now();
    syncCharacterViewsFromSession(character);
  }
}