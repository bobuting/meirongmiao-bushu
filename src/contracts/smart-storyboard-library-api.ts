import type { ReverseStoryboardReport } from "./reverse-storyboard-report.js";

export const SMART_STORYBOARD_LIBRARY_API_VERSION = "AT50-01.v1";
export const SMART_STORYBOARD_LIBRARY_ROUTE_PREFIX = "/smart-storyboard-library";

export const SMART_STORYBOARD_LIBRARY_CATEGORIES = ["realtime_hot_trend", "video_hot_trend_copy"] as const;
export type SmartStoryboardLibraryCategory = (typeof SMART_STORYBOARD_LIBRARY_CATEGORIES)[number];

export const SMART_STORYBOARD_LIBRARY_PERMISSION_PROFILE = {
  read: ["admin"],
  write: ["admin"],
  delete: ["admin"],
} as const;

export const SMART_STORYBOARD_LIBRARY_DTO_INVARIANTS = [
  "Smart storyboard library is admin-managed and supports source-level traceability for realtime/video trend entries.",
  "Category is explicit and stable (realtime_hot_trend | video_hot_trend_copy).",
  "DTO always returns currentVersion and role-based permissions to avoid frontend-side inference drift.",
  "Video-category records can carry reverse source script text for audit and replay.",
] as const;

export interface SmartStoryboardLibrarySourceRef {
  readonly trendType: "realtime" | "video";
  readonly trendEntryId: string | null;
  readonly trendSyncJobId: string | null;
  readonly trendRank: number | null;
  readonly sourceUrl: string | null;
  readonly sourceTitle: string | null;
  readonly sourceHash: string | null;
  readonly recommended: boolean;
  readonly recommendationReason: string | null;
}

export interface SmartStoryboardLibraryRelationRef {
  readonly sourceAssetScriptId: string | null;
  readonly reverseStoryboardLibraryId: string | null;
  readonly reverseBatchId: string | null;
}

export interface SmartStoryboardLibraryItem {
  readonly id: string;
  readonly ownerUserId: string;
  readonly title: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly category: SmartStoryboardLibraryCategory;
  readonly sourceRef: SmartStoryboardLibrarySourceRef;
  readonly relationRef: SmartStoryboardLibraryRelationRef;
  readonly reverseSourceScriptText: string | null;
  readonly report: ReverseStoryboardReport;
  readonly content: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface SmartStoryboardLibraryVersionRecord {
  readonly id: string;
  readonly itemId: string;
  readonly ownerUserId: string;
  readonly version: number;
  readonly title: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly category: SmartStoryboardLibraryCategory;
  readonly sourceRef: SmartStoryboardLibrarySourceRef;
  readonly relationRef: SmartStoryboardLibraryRelationRef;
  readonly reverseSourceScriptText: string | null;
  readonly report: ReverseStoryboardReport;
  readonly content: string;
  readonly createdAt: number;
}

export interface SmartStoryboardLibraryRecordDto extends SmartStoryboardLibraryItem {
  readonly currentVersion: number;
  readonly permissions: {
    readonly canRead: boolean;
    readonly canWrite: boolean;
    readonly canDelete: boolean;
  };
}

export function resolveSmartStoryboardLibraryPermissions(role: "admin" | "user"): SmartStoryboardLibraryRecordDto["permissions"] {
  const canRead = role === "admin";
  const canWrite = role === "admin";
  const canDelete = role === "admin";
  return {
    canRead,
    canWrite,
    canDelete,
  };
}

export function createSmartStoryboardLibraryVersionRecord(input: {
  id: string;
  item: SmartStoryboardLibraryItem;
  version: number;
  createdAt: number;
}): SmartStoryboardLibraryVersionRecord {
  return {
    id: input.id,
    itemId: input.item.id,
    ownerUserId: input.item.ownerUserId,
    version: input.version,
    title: input.item.title,
    summary: input.item.summary,
    tags: [...input.item.tags],
    category: input.item.category,
    sourceRef: { ...input.item.sourceRef },
    relationRef: { ...input.item.relationRef },
    reverseSourceScriptText: input.item.reverseSourceScriptText,
    report: input.item.report,
    content: input.item.content,
    createdAt: input.createdAt,
  };
}
