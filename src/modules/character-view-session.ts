/**
 * character-view-session.ts
 *
 * 从 app.ts 提取的角色多视角会话辅助模块。
 * 包含五视角定义、候选图管理、持久化存储、本地存储图片列举与会话水合。
 */

import type { FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import type {
  CharacterViewKey,
  CharacterViewSession,
  LibraryCharacter,
  Project,
  StoryboardFrame,
  User,
} from "../contracts/types.js";
import type { Step2AllInOneSlot } from "../modules/step2-dressedup-storage-prefix.js";
import { AppError } from "../core/errors.js";
import type { AppContext } from "../core/app-context.js";
import { skillLoader } from "../services/skills/index.js";
import { isDataImageUrl, isHttpUrl, buildSourceUrlDigestIdentity } from "../utils/url.js";
import { sanitizeUrlField } from "../contracts/media-url-safety.js";
import {
  buildStep2DressedupAllInOneSlotStoragePrefix,
  buildStep2DressedupWriteStoragePrefix,
  listStep2DressedupReadableStoragePrefixes,
} from "../modules/step2-dressedup-storage-prefix.js";
import { normalizeStoryboardFrameMediaUrls } from "../modules/storyboard-frame-media-normalizer.js";
import {
  guessImageExtension,
  readImageBytesFromSource,
  persistImageSourceToStorage,
} from "../services/media/storage-persist.js";
import {
  resolveBinaryContentType,
  resolveImageContentType,
} from "../services/utils/content-type.js";

// ─── 常量 ────────────────────────────────────────────────────────────────────

const OBJECT_STORAGE_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"] as const;
const OBJECT_STORAGE_IMAGE_EXTENSION_SET = new Set<string>(OBJECT_STORAGE_IMAGE_EXTENSIONS);

/** 五视角定义：正面、左侧、右侧、背面、特写 */
export const FIVE_VIEW_DEFINITIONS = [
  { key: "front", label: "正面", promptSuffix: "full body front view" },
  { key: "left", label: "左侧", promptSuffix: "full body left side view" },
  { key: "right", label: "右侧", promptSuffix: "full body right side view" },
  { key: "back", label: "背面", promptSuffix: "full body back view" },
  { key: "closeup", label: "特写", promptSuffix: "upper body close-up portrait view" },
] as const;

export type FiveViewDefinition = (typeof FIVE_VIEW_DEFINITIONS)[number];

const FIVE_VIEW_KEY_SET = new Set<CharacterViewKey>(FIVE_VIEW_DEFINITIONS.map((item) => item.key));
const FIVE_VIEW_DEFINITION_BY_KEY = new Map<CharacterViewKey, FiveViewDefinition>(
  FIVE_VIEW_DEFINITIONS.map((item) => [item.key, item]),
);

export const VIEW_REFERENCE_LIMIT = 12;
export const VIEW_GENERATION_CANDIDATE_BATCH_SIZE = 4;
export const VIEW_GENERATION_MAX_ATTEMPTS = 2;
const VIEW_UNIQUENESS_MIN_RATIO = 0.5;
export const VIEW_CANDIDATE_HARD_LIMIT = 24;

// ─── 内部辅助 ────────────────────────────────────────────────────────────────

export function withVariantSuffix(url: string, variantKey: string): string {
  const divider = url.includes("?") ? "&" : "?";
  return `${url}${divider}variant=${encodeURIComponent(variantKey)}`;
}

function normalizeStorageEntityName(rawName: string, fallback: string): string {
  const normalized = rawName
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || fallback;
}

export function buildCharacterViewStoragePrefix(
  character: Pick<LibraryCharacter, "id" | "name">,
  viewKey: CharacterViewKey,
): string {
  const characterFolder = `${normalizeStorageEntityName(character.name, "character")}-${character.id}`;
  return `characters/${characterFolder}/${viewKey}`;
}

const DRESSEDUP_PROJECT_TAG_PREFIX = "__dressedup_project:";

function resolveDressedupProjectIdFromCharacterTags(tags: string[] | undefined): string | null {
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

// ─── 图片存储持久化 ──────────────────────────────────────────────────────────

export async function persistCharacterViewImageToStorage(
  ctx: AppContext,
  character: LibraryCharacter,
  viewKey: CharacterViewKey,
  sourceUrl: string,
  options?: { dedupeByContent?: boolean },
): Promise<string> {
  return persistImageSourceToStorage(
    ctx,
    sourceUrl,
    buildCharacterViewStoragePrefix(character, viewKey),
    { persistRemote: true, dedupeByContent: options?.dedupeByContent },
  );
}

export async function persistDressedupViewImageToStorage(
  ctx: AppContext,
  project: Pick<Project, "id" | "name">,
  viewKey: CharacterViewKey,
  sourceUrl: string,
): Promise<string> {
  return persistImageSourceToStorage(
    ctx,
    sourceUrl,
    buildStep2DressedupWriteStoragePrefix(project, viewKey),
    { persistRemote: true, dedupeByContent: false },
  );
}

export async function persistDressedupAllInOneSlotImageToStorage(
  ctx: AppContext,
  project: Pick<Project, "id" | "name">,
  slot: Step2AllInOneSlot,
  sourceUrl: string,
): Promise<string> {
  const trimmed = String(sourceUrl ?? "").trim();
  if (!trimmed) {
    return sourceUrl;
  }
  if (!ctx.storage) {
    return sourceUrl;
  }
  if (!isDataImageUrl(trimmed) && !isHttpUrl(trimmed)) {
    return sourceUrl;
  }
  const { bytes, contentType } = await readImageBytesFromSource(trimmed, ctx.configService.get().imageDownloadTimeoutMs);
  if (bytes.length < 1) {
    throw new Error("EMPTY_IMAGE_BYTES");
  }
  const keyPrefix = buildStep2DressedupAllInOneSlotStoragePrefix(project, slot).replace(/^\/+|\/+$/g, "");
  const resolvedContentType = resolveImageContentType(contentType, bytes);
  const ext = guessImageExtension(resolvedContentType, trimmed);
  const key = `${keyPrefix}/latest${ext}`;
  await ctx.storage.putObject(key, bytes, resolvedContentType ?? undefined);
  const legacyKeys = new Set<string>([
    `${keyPrefix}/latest`,
    ...OBJECT_STORAGE_IMAGE_EXTENSIONS.map((candidateExt) => `${keyPrefix}/latest${candidateExt}`),
  ]);
  legacyKeys.delete(key);
  await Promise.all(
    [...legacyKeys].map(async (legacyKey) => {
      try {
        await ctx.storage?.deleteObject(legacyKey);
      } catch {
        // Best-effort cleanup only. Legacy extensionless reads stay supported below.
      }
    }),
  );
  const signedUrl = await ctx.storage.getSignedUrl(key);
  const version = ctx.clock.now();
  return signedUrl.includes("?") ? `${signedUrl}&v=${version}` : `${signedUrl}?v=${version}`;
}

export async function persistStoryboardFrameImageToStorage(
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

export async function normalizeStoryboardFrameRecordMediaUrls(
  ctx: AppContext,
  frame: StoryboardFrame,
): Promise<StoryboardFrame> {
  return normalizeStoryboardFrameMediaUrls(frame, (sourceUrl, context) =>
    persistStoryboardFrameImageToStorage(ctx, frame, sourceUrl, context),
  );
}

// ─── 五视角辅助函数 ──────────────────────────────────────────────────────────

export function ensureFiveViews(sourceViews: string[], fallback: string): string[] {
  const normalized = sourceViews
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 5);
  if (normalized.length >= 5) {
    return normalized;
  }
  const first = normalized[0] ?? fallback;
  const result = [...normalized];
  while (result.length < 5) {
    const key = FIVE_VIEW_DEFINITIONS[result.length]?.key ?? `view-${result.length + 1}`;
    result.push(withVariantSuffix(first, key));
  }
  return result;
}

export function isFiveViewKey(value: string): value is CharacterViewKey {
  return FIVE_VIEW_KEY_SET.has(value as CharacterViewKey);
}

export function findFiveViewDefinition(viewKey: CharacterViewKey): FiveViewDefinition {
  return FIVE_VIEW_DEFINITION_BY_KEY.get(viewKey) ?? FIVE_VIEW_DEFINITIONS[0];
}

export function inferFiveViewKeyFromLabel(label: string | null | undefined): CharacterViewKey | null {
  const normalized = String(label ?? "").trim();
  if (normalized.includes("特写")) return "closeup";
  if (normalized.includes("正")) return "front";
  if (normalized.includes("左")) return "left";
  if (normalized.includes("右")) return "right";
  if (normalized.includes("背")) return "back";
  return null;
}

export function resolvePreviewViewDefinition(
  preview: { viewKey?: string; label?: string | null },
  requestViewKey?: CharacterViewKey,
): FiveViewDefinition {
  if (requestViewKey) {
    return findFiveViewDefinition(requestViewKey);
  }
  if (typeof preview.viewKey === "string" && isFiveViewKey(preview.viewKey)) {
    return findFiveViewDefinition(preview.viewKey);
  }
  const inferred = inferFiveViewKeyFromLabel(preview.label);
  if (inferred) {
    return findFiveViewDefinition(inferred);
  }
  return FIVE_VIEW_DEFINITIONS[0];
}

/**
 * 从提示词模板获取所有视图的 prompt
 */
export async function fetchViewPromptsFromTemplate(): Promise<Map<string, string>> {
  const prompts = new Map<string, string>();
  for (const definition of FIVE_VIEW_DEFINITIONS) {
    const { system } = await skillLoader.render("character_single_view_generation", {
      variables: { viewLabel: definition.label, viewPromptSuffix: definition.promptSuffix },
    });
    prompts.set(definition.key, system);
  }
  return prompts;
}

// ─── 键与身份 ────────────────────────────────────────────────────────────────

export function normalizeImageIdentity(url: string): string {
  const value = String(url ?? "").trim();
  if (!value) {
    return "";
  }
  if (value.startsWith("data:")) {
    return value;
  }
  try {
    const parsed = new URL(value);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().toLowerCase();
  } catch {
    return value.replace(/[?#].*$/, "").toLowerCase();
  }
}

export function extractPersistedSourceDigestIdentity(url: string): string | null {
  const value = String(url ?? "")
    .trim()
    .replace(/[?#].*$/, "")
    .toLowerCase();
  if (!value) {
    return null;
  }
  const match = value.match(
    /\/characters\/(?:(?:views\/[^/]+\/[^/]+)|[^/]+)\/(?:front|left|right|back|closeup)\/[0-9a-f]{2}\/([0-9a-f]{64})\.[a-z0-9]+$/,
  );
  if (!match) {
    return null;
  }
  const digest = match[1]?.trim();
  if (!digest) {
    return null;
  }
  return `src:${digest}`;
}

// ─── 候选图管理 ──────────────────────────────────────────────────────────────

export function pickLatestCandidate(candidates: string[]): string | null {
  if (candidates.length < 1) {
    return null;
  }
  return candidates[candidates.length - 1] ?? null;
}

export function mergeCandidatesUnique(existing: string[], incoming: string[]): string[] {
  const queue = [...existing];
  for (const raw of incoming) {
    const candidate = String(raw ?? "").trim();
    if (!candidate) {
      continue;
    }
    const identity = normalizeImageIdentity(candidate);
    if (!identity) {
      continue;
    }
    const existingIndex = queue.findIndex((item) => normalizeImageIdentity(item) === identity);
    if (existingIndex >= 0) {
      queue.splice(existingIndex, 1);
      queue.push(candidate);
      continue;
    }
    queue.push(candidate);
  }
  return queue;
}

export function collectSessionImagePool(session: CharacterViewSession, excludeViewKey?: CharacterViewKey): Set<string> {
  const pool = new Set<string>();
  for (const view of session.views) {
    if (excludeViewKey && view.key === excludeViewKey) {
      continue;
    }
    const selected = normalizeImageIdentity(view.selectedImageUrl ?? "");
    if (selected) {
      pool.add(selected);
    }
    const selectedSourceDigest = extractPersistedSourceDigestIdentity(view.selectedImageUrl ?? "");
    if (selectedSourceDigest) {
      pool.add(selectedSourceDigest);
    }
    for (const candidate of view.candidates) {
      const identity = normalizeImageIdentity(candidate);
      if (identity) {
        pool.add(identity);
      }
      const sourceDigest = extractPersistedSourceDigestIdentity(candidate);
      if (sourceDigest) {
        pool.add(sourceDigest);
      }
    }
  }
  return pool;
}

export function sanitizeGeneratedCandidates(
  session: CharacterViewSession,
  view: CharacterViewSession["views"][number],
  candidates: string[],
  thumbnailUrl: string,
  generationReferences: string[],
): string[] {
  const blocked = collectSessionImagePool(session, view.key);
  const thumbnailIdentity = normalizeImageIdentity(thumbnailUrl);
  if (thumbnailIdentity) {
    blocked.add(thumbnailIdentity);
  }
  const thumbnailSourceDigest = extractPersistedSourceDigestIdentity(thumbnailUrl) ?? buildSourceUrlDigestIdentity(thumbnailUrl);
  if (thumbnailSourceDigest) {
    blocked.add(thumbnailSourceDigest);
  }
  for (const ref of generationReferences) {
    const identity = normalizeImageIdentity(ref);
    if (identity) {
      blocked.add(identity);
    }
    const sourceDigest = extractPersistedSourceDigestIdentity(ref) ?? buildSourceUrlDigestIdentity(ref);
    if (sourceDigest) {
      blocked.add(sourceDigest);
    }
  }

  const accepted: string[] = [];
  for (const rawCandidate of candidates) {
    const candidate = String(rawCandidate ?? "").trim();
    if (!candidate) {
      continue;
    }
    const identity = normalizeImageIdentity(candidate);
    const sourceDigest = extractPersistedSourceDigestIdentity(candidate) ?? buildSourceUrlDigestIdentity(candidate);
    if (!identity || blocked.has(identity) || (sourceDigest ? blocked.has(sourceDigest) : false)) {
      continue;
    }
    blocked.add(identity);
    if (sourceDigest) {
      blocked.add(sourceDigest);
    }
    accepted.push(candidate);
    if (accepted.length >= VIEW_GENERATION_CANDIDATE_BATCH_SIZE) {
      break;
    }
  }
  return accepted;
}

export function hasEnoughUniqueCoverage(rawCount: number, acceptedCount: number): boolean {
  if (acceptedCount < 1) {
    return false;
  }
  if (rawCount <= 1) {
    return acceptedCount >= 1;
  }
  return acceptedCount / rawCount >= VIEW_UNIQUENESS_MIN_RATIO;
}

export function hasReachedViewCandidateLimit(view: { candidates: string[] }): boolean {
  return view.candidates.length >= VIEW_CANDIDATE_HARD_LIMIT;
}

export function buildViewCandidateLimitMessage(viewLabel: string): string {
  return `当前「${viewLabel}」候选图已达到 ${VIEW_CANDIDATE_HARD_LIMIT} 张上限，请先删除部分候选图后再继续生成。`;
}

// ─── 引用与候选图持久化 ──────────────────────────────────────────────────────

export async function persistManualViewReferences(
  ctx: AppContext,
  app: FastifyInstance,
  userId: string,
  characterId: string,
  viewKey: CharacterViewKey,
  referenceImages: string[],
): Promise<string[]> {
  const picked = referenceImages
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, VIEW_REFERENCE_LIMIT);
  const persistedReferences = await Promise.all(
    picked.map(async (item, index) => {
      try {
        return await persistImageSourceToStorage(
          ctx,
          item,
          `library/characters/${userId}/references/${characterId}/${viewKey}`,
        );
      } catch (error) {
        app.log.warn(
          { err: error, characterId, viewKey, userId, index },
          "character reference image persistence skipped, fallback to original url",
        );
        return item;
      }
    }),
  );
  return [...new Set(persistedReferences)].slice(0, VIEW_REFERENCE_LIMIT);
}

export async function persistGeneratedViewCandidates(
  ctx: AppContext,
  app: FastifyInstance,
  character: LibraryCharacter,
  viewKey: CharacterViewKey,
  candidates: string[],
): Promise<string[]> {
  const persisted: string[] = [];
  let persistErrors = 0;
  for (const [index, candidate] of candidates.entries()) {
    const normalized = String(candidate ?? "").trim();
    if (!normalized) {
      continue;
    }
    try {
      const url = await persistCharacterViewImageToStorage(ctx, character, viewKey, normalized, {
        dedupeByContent: false,
      });
      persisted.push(url);
    } catch (error) {
      persistErrors += 1;
      app.log.warn(
        { err: error, characterId: character.id, viewKey, index },
        "character generated candidate persistence failed",
      );
    }
  }
  if (persisted.length < 1 && candidates.length > 0) {
    throw new AppError(
      502,
      "CHARACTER_CANDIDATE_PERSIST_FAILED",
      `character generated candidates persistence failed: characterId=${character.id}; viewKey=${viewKey}; errors=${persistErrors}`,
    );
  }
  return persisted;
}

export async function persistDressedupGeneratedViewCandidates(
  ctx: AppContext,
  app: FastifyInstance,
  project: Pick<Project, "id" | "name">,
  viewKey: CharacterViewKey,
  candidates: string[],
): Promise<string[]> {
  const persisted: string[] = [];
  let persistErrors = 0;
  for (const [index, candidate] of candidates.entries()) {
    const normalized = String(candidate ?? "").trim();
    if (!normalized) {
      continue;
    }
    try {
      const url = await persistDressedupViewImageToStorage(ctx, project, viewKey, normalized);
      persisted.push(url);
    } catch (error) {
      persistErrors += 1;
      app.log.warn(
        { err: error, projectId: project.id, viewKey, index },
        "dressedup generated candidate persistence failed",
      );
    }
  }
  if (persisted.length < 1 && candidates.length > 0) {
    throw new AppError(
      502,
      "DRESSEDUP_CANDIDATE_PERSIST_FAILED",
      `dressedup generated candidates persistence failed: projectId=${project.id}; viewKey=${viewKey}; errors=${persistErrors}`,
    );
  }
  return persisted;
}

export async function resolveDressedupPersistenceProject(
  ctx: AppContext,
  user: User,
  payload: { warehouseMode?: "character" | "dressedup"; projectId?: string },
): Promise<Pick<Project, "id" | "name"> | null> {
  if (payload.warehouseMode !== "dressedup") {
    return null;
  }
  const projectId = String(payload.projectId ?? "").trim();
  if (!projectId) {
    throw new AppError(400, "PROJECT_ID_REQUIRED", "projectId is required in dressedup warehouse mode");
  }
  const project = await ctx.projectService.requireOwnerProject(user, projectId);
  return {
    id: project.id,
    name: project.name,
  };
}

// ─── 日志与状态管理 ──────────────────────────────────────────────────────────

export function trimLogs(logs: string[], limit = 80): string[] {
  if (logs.length <= limit) {
    return logs;
  }
  return logs.slice(logs.length - limit);
}

export function appendSessionLog(session: CharacterViewSession, message: string, now: number): void {
  session.logs = trimLogs([...session.logs, `${new Date(now).toISOString()} ${message}`]);
  session.updatedAt = now;
}

export function appendViewLog(session: CharacterViewSession, viewKey: CharacterViewKey, message: string, now: number): void {
  const view = session.views.find((item) => item.key === viewKey);
  if (!view) {
    return;
  }
  view.logs = trimLogs([...view.logs, `${new Date(now).toISOString()} ${message}`], 40);
  view.updatedAt = now;
}

export function recomputeCharacterViewSession(session: CharacterViewSession): void {
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

export function syncCharacterViewsFromSession(character: LibraryCharacter): void {
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

export function createCharacterViewSession(
  character: LibraryCharacter,
  startedAt: number,
  prompts?: Map<string, string>,
): CharacterViewSession {
  const session: CharacterViewSession = {
    status: "running",
    total: FIVE_VIEW_DEFINITIONS.length,
    generated: 0,
    confirmed: 0,
    startedAt,
    updatedAt: startedAt,
    logs: [],
    views: FIVE_VIEW_DEFINITIONS.map((definition) => ({
      key: definition.key,
      label: definition.label,
      prompt: prompts?.get(definition.key) ?? `${definition.label}（${definition.promptSuffix}）`,
      referenceImages: [character.thumbnailUrl],
      ratio: "1:1",
      resolution: "2k",
      status: "pending",
      candidates: [],
      selectedImageUrl: null,
      confirmSource: "candidate",
      confirmed: false,
      errorMessage: null,
      logs: [`${new Date(startedAt).toISOString()} [server] 等待生成。`],
      updatedAt: startedAt,
    })),
  };
  appendSessionLog(session, "[server] 多视角会话已启动。", startedAt);
  recomputeCharacterViewSession(session);
  return session;
}

// ─── 权限检查 ────────────────────────────────────────────────────────────────

export async function requireOwnerLibraryCharacter(ctx: AppContext, user: User, characterId: string): Promise<LibraryCharacter> {
  const character = await ctx.repos.libraryCharacters.findById(characterId);
  if (!character) {
    throw new AppError(404, "NOT_FOUND", "Character not found");
  }
  if (character.userId !== user.id) {
    throw new AppError(403, "FORBIDDEN", "Character owner only");
  }
  return character;
}

// ─── 本地对象存储列举与会话水合 ──────────────────────────────────────────────

/**
 * 列举本地对象存储中以 prefix 为前缀的所有图片 URL。
 * 需要 objectStorageDriver / objectStorageLocalRoot 通过参数传入，
 * 因为原实现依赖闭包变量。
 */
export async function listLocalObjectStorageImageUrlsByPrefix(
  ctx: AppContext,
  app: FastifyInstance,
  objectStorageDriver: string,
  objectStorageLocalRoot: string,
  prefix: string,
): Promise<string[]> {
  if (objectStorageDriver !== "local" || !ctx.storage || ctx.storage.driver !== "local") {
    return [];
  }
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

/**
 * 从本地对象存储水合角色多视角会话的候选图。
 * 原实现依赖闭包中的 objectStorageDriver / objectStorageLocalRoot / app，
 * 此处通过参数显式传入。
 */
export async function hydrateCharacterViewSessionCandidatesFromStorage(
  ctx: AppContext,
  app: FastifyInstance,
  objectStorageDriver: string,
  objectStorageLocalRoot: string,
  character: LibraryCharacter,
): Promise<void> {
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
    dressedupProjectId && await ctx.repos.projects.findById(dressedupProjectId)
      ? await ctx.repos.projects.findById(dressedupProjectId) ?? null
      : null;
  let changed = false;
  for (const view of session.views) {
    const prefixes = dressedupProject
      ? listStep2DressedupReadableStoragePrefixes(dressedupProject, view.key)
      : [buildCharacterViewStoragePrefix(character, view.key)];
    // Local object-storage folder is the source of truth for candidate browser preview.
    const storageCandidates = (
      await Promise.all(prefixes.map((prefix) => listLocalObjectStorageImageUrlsByPrefix(ctx, app, objectStorageDriver, objectStorageLocalRoot, prefix)))
    ).reduce((merged, current) => mergeCandidatesUnique(merged, current), [] as string[]);
    if (storageCandidates.length < 1) {
      continue;
    }
    const mergedCandidates = mergeCandidatesUnique(view.candidates, storageCandidates);
    const trimmedCandidates = mergedCandidates.slice(Math.max(0, mergedCandidates.length - VIEW_CANDIDATE_HARD_LIMIT));
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
      view.candidates.some((candidate) => normalizeImageIdentity(candidate) === normalizeImageIdentity(selectedImage));
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
