export const MY_LIBRARY_API_CONTRACT_VERSION = "AT50-03.v1";
export const MY_LIBRARY_ROUTE_PREFIX = "/my-library";

export const MY_LIBRARY_RESOURCE_TYPES = ["script", "storyboard"] as const;
export type MyLibraryResourceType = (typeof MY_LIBRARY_RESOURCE_TYPES)[number];

/** 关联表 source 类型 */
export const USER_SCRIPT_SOURCE_TYPES = ["reverse", "manual", "hot_trend", "project_sync"] as const;
export type UserScriptSourceType = (typeof USER_SCRIPT_SOURCE_TYPES)[number];

export interface MyLibraryPagination {
  readonly page: number;
  readonly pageSize: number;
}

export interface MyLibraryQuery {
  readonly ownerUserId: string;
  readonly resourceType: MyLibraryResourceType;
  readonly pagination: MyLibraryPagination;
  readonly keyword: string | null;
  readonly tags: readonly string[];
  readonly sourceType: string | null;
  readonly updatedAfter: number | null;
  readonly updatedBefore: number | null;
}

/** 用户脚本关联记录 — 关联表 JOIN nrm_script_data */
export interface UserScriptRecordDto {
  readonly id: string;
  readonly scriptDataId: string;
  readonly userId: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly source: UserScriptSourceType;
  readonly notes: string | null;
  readonly type: number;
  readonly payload: Record<string, unknown>;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** @deprecated 使用 UserScriptRecordDto 替代 */
export interface MyScriptLibraryRecordDto {
  readonly id: string;
  readonly ownerUserId: string;
  readonly title: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly sourceType: "manual" | "project" | "reverse";
  readonly currentVersion: number;
  readonly updatedAt: number;
}

export interface MyStoryboardLibraryRecordDto {
  readonly id: string;
  readonly ownerUserId: string;
  readonly title: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly category: "project_generated" | "smart_realtime" | "smart_video" | "manual_reverse";
  readonly frameCount: number;
  readonly reverseSourceScriptText: string | null;
  readonly updatedAt: number;
}

export type MyLibraryRecordDto = UserScriptRecordDto | MyScriptLibraryRecordDto | MyStoryboardLibraryRecordDto;

export interface MyLibraryPagedResponse<T extends MyLibraryRecordDto> {
  readonly ownerUserId: string;
  readonly resourceType: MyLibraryResourceType;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly items: readonly T[];
}

export const MY_LIBRARY_DTO_INVARIANTS = [
  "My-library endpoints are user-isolated and must reject cross-user access.",
  "Pagination is deterministic: default page=1 pageSize=20, max pageSize=100.",
  "Filters are explicit and normalized before querying storage (keyword/tags/sourceType/time range).",
  "Script and storyboard DTOs expose compact list data only; detail payloads belong to dedicated detail routes.",
] as const;

function normalizePositiveInteger(input: unknown, fallback: number, max: number): number {
  const asNumber = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(asNumber) || asNumber < 1) {
    return fallback;
  }
  return Math.min(max, Math.floor(asNumber));
}

function normalizeNullableText(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return [...new Set(input
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0))];
}

function normalizeResourceType(input: unknown): MyLibraryResourceType {
  return input === "storyboard" ? "storyboard" : "script";
}

function normalizeUnixMs(input: unknown): number | null {
  const asNumber = typeof input === "number" ? input : Number(input);
  return Number.isFinite(asNumber) && asNumber > 0 ? Math.floor(asNumber) : null;
}

export function assertMyLibraryOwnerAccess(input: {
  actorUserId: string;
  ownerUserId: string;
}): void {
  if (input.actorUserId.trim().length === 0 || input.ownerUserId.trim().length === 0) {
    throw new Error("MY_LIBRARY_OWNER_REQUIRED");
  }
  if (input.actorUserId !== input.ownerUserId) {
    throw new Error("MY_LIBRARY_FORBIDDEN");
  }
}

export function normalizeMyLibraryQuery(input: {
  ownerUserId: string;
  resourceType?: unknown;
  page?: unknown;
  pageSize?: unknown;
  keyword?: unknown;
  tags?: unknown;
  sourceType?: unknown;
  updatedAfter?: unknown;
  updatedBefore?: unknown;
}): MyLibraryQuery {
  const ownerUserId = input.ownerUserId.trim();
  if (ownerUserId.length === 0) {
    throw new Error("MY_LIBRARY_OWNER_REQUIRED");
  }
  return {
    ownerUserId,
    resourceType: normalizeResourceType(input.resourceType),
    pagination: {
      page: normalizePositiveInteger(input.page, 1, 10_000),
      pageSize: normalizePositiveInteger(input.pageSize, 20, 100),
    },
    keyword: normalizeNullableText(input.keyword),
    tags: normalizeTags(input.tags),
    sourceType: normalizeNullableText(input.sourceType),
    updatedAfter: normalizeUnixMs(input.updatedAfter),
    updatedBefore: normalizeUnixMs(input.updatedBefore),
  };
}

export function buildMyLibraryPagedResponse<T extends MyLibraryRecordDto>(input: {
  query: MyLibraryQuery;
  items: readonly T[];
}): MyLibraryPagedResponse<T> {
  const offset = (input.query.pagination.page - 1) * input.query.pagination.pageSize;
  const pageItems = input.items.slice(offset, offset + input.query.pagination.pageSize);
  return {
    ownerUserId: input.query.ownerUserId,
    resourceType: input.query.resourceType,
    page: input.query.pagination.page,
    pageSize: input.query.pagination.pageSize,
    total: input.items.length,
    items: pageItems,
  };
}
