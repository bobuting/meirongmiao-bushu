import type {
  ISmartStoryboardLibraryRepository,
  ISmartStoryboardLibraryVersionRepository,
  IRepositoryClock,
} from "../contracts/repository-ports/index.js";
import type { ISmartStoryboardLibraryService } from "../contracts/services.js";
import type { User } from "../contracts/types.js";
import {
  createSmartStoryboardLibraryVersionRecord,
  type SmartStoryboardLibraryCategory,
  type SmartStoryboardLibraryItem,
  type SmartStoryboardLibraryVersionRecord,
} from "../contracts/smart-storyboard-library-api.js";
import { cloneReverseStoryboardReport } from "./reverse-storyboard-report-mapper.js";
import { assertCondition } from "../core/errors.js";

function normalizeOptionalText(input: string | null | undefined): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTags(input: readonly string[] | undefined): string[] {
  const normalized = (input ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => (item.startsWith("#") ? item : `#${item}`));
  return [...new Set(normalized)];
}

function cloneSourceRef(input: SmartStoryboardLibraryItem["sourceRef"]): SmartStoryboardLibraryItem["sourceRef"] {
  return {
    trendType: input.trendType,
    trendEntryId: normalizeOptionalText(input.trendEntryId),
    trendSyncJobId: normalizeOptionalText(input.trendSyncJobId),
    trendRank: Number.isInteger(input.trendRank) ? input.trendRank : null,
    sourceUrl: normalizeOptionalText(input.sourceUrl),
    sourceTitle: normalizeOptionalText(input.sourceTitle),
    sourceHash: normalizeOptionalText(input.sourceHash),
    recommended: Boolean(input.recommended),
    recommendationReason: normalizeOptionalText(input.recommendationReason),
  };
}

function cloneRelationRef(
  input: SmartStoryboardLibraryItem["relationRef"] | null | undefined,
): SmartStoryboardLibraryItem["relationRef"] {
  return {
    sourceAssetScriptId: normalizeOptionalText(input?.sourceAssetScriptId),
    reverseStoryboardLibraryId: normalizeOptionalText(input?.reverseStoryboardLibraryId),
    reverseBatchId: normalizeOptionalText(input?.reverseBatchId),
  };
}

function cloneItem(input: SmartStoryboardLibraryItem): SmartStoryboardLibraryItem {
  return {
    ...input,
    tags: [...input.tags],
    sourceRef: cloneSourceRef(input.sourceRef),
    relationRef: cloneRelationRef(input.relationRef),
    reverseSourceScriptText: normalizeOptionalText(input.reverseSourceScriptText),
    report: cloneReverseStoryboardReport(input.report)!,
  };
}

function cloneVersion(input: SmartStoryboardLibraryVersionRecord): SmartStoryboardLibraryVersionRecord {
  return {
    ...input,
    tags: [...input.tags],
    sourceRef: cloneSourceRef(input.sourceRef),
    relationRef: cloneRelationRef(input.relationRef),
    reverseSourceScriptText: normalizeOptionalText(input.reverseSourceScriptText),
    report: cloneReverseStoryboardReport(input.report)!,
  };
}

function assertAdmin(actor: User): void {
  assertCondition(actor.role === "admin", 403, "FORBIDDEN", "Admin only");
}

export class SmartStoryboardLibraryService implements ISmartStoryboardLibraryService {
  constructor(
    private readonly repos: {
      smartStoryboardLibrary: ISmartStoryboardLibraryRepository;
      smartStoryboardLibraryVersions: ISmartStoryboardLibraryVersionRepository;
      clock: IRepositoryClock;
    },
  ) {}

  async listForAdmin(
    actor: User,
    query?: {
      ownerUserId?: string;
      category?: SmartStoryboardLibraryCategory;
      trendType?: "realtime" | "video";
    },
  ): Promise<SmartStoryboardLibraryItem[]> {
    assertAdmin(actor);
    return (await this.repos.smartStoryboardLibrary.list())
      .filter((item) => {
        if (query?.ownerUserId && item.ownerUserId !== query.ownerUserId) {
          return false;
        }
        if (query?.category && item.category !== query.category) {
          return false;
        }
        if (query?.trendType && item.sourceRef.trendType !== query.trendType) {
          return false;
        }
        return true;
      })
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((item) => cloneItem(item));
  }

  async listForOwner(user: User): Promise<SmartStoryboardLibraryItem[]> {
    return (await this.repos.smartStoryboardLibrary.list())
      .filter((item) => item.ownerUserId === user.id)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((item) => cloneItem(item));
  }

  async get(actor: User, itemId: string): Promise<SmartStoryboardLibraryItem> {
    const item = await this.requireItem(itemId);
    if (actor.role !== "admin") {
      assertCondition(item.ownerUserId === actor.id, 403, "FORBIDDEN", "Owner only");
    }
    return cloneItem(item);
  }

  async create(
    actor: User,
    input: {
      id?: string;
      ownerUserId: string;
      title: string;
      summary: string;
      tags?: readonly string[];
      category: SmartStoryboardLibraryCategory;
      sourceRef: SmartStoryboardLibraryItem["sourceRef"];
      relationRef?: SmartStoryboardLibraryItem["relationRef"];
      reverseSourceScriptText?: string | null;
      report: SmartStoryboardLibraryItem["report"];
      content: string;
    },
  ): Promise<SmartStoryboardLibraryItem> {
    assertAdmin(actor);
    const ownerUserId = input.ownerUserId.trim();
    const title = input.title.trim();
    const summary = input.summary.trim();
    const content = input.content.trim();
    assertCondition(ownerUserId.length > 0, 400, "OWNER_REQUIRED", "Owner user required");
    assertCondition(title.length > 0, 400, "TITLE_REQUIRED", "Title required");
    assertCondition(summary.length > 0, 400, "SUMMARY_REQUIRED", "Summary required");
    assertCondition(content.length > 0, 400, "CONTENT_REQUIRED", "Content required");
    const report = cloneReverseStoryboardReport(input.report);
    assertCondition(Boolean(report), 400, "REPORT_REQUIRED", "Report required");
    const itemId = typeof input.id === "string" && input.id.trim().length > 0 ? input.id.trim() : this.repos.clock.generateId();
    assertCondition(!(await this.repos.smartStoryboardLibrary.exists(itemId)), 409, "ALREADY_EXISTS", "Smart storyboard already exists");
    const now = this.repos.clock.now();
    const item: SmartStoryboardLibraryItem = {
      id: itemId,
      ownerUserId,
      title,
      summary,
      tags: normalizeTags(input.tags),
      category: input.category,
      sourceRef: cloneSourceRef(input.sourceRef),
      relationRef: cloneRelationRef(input.relationRef),
      reverseSourceScriptText: normalizeOptionalText(input.reverseSourceScriptText),
      report: report!,
      content,
      createdAt: now,
      updatedAt: now,
    };
    await this.repos.smartStoryboardLibrary.upsert(item);
    await this.createVersion(item, 1);
    return cloneItem(item);
  }

  async update(
    actor: User,
    itemId: string,
    patch: Partial<
      Pick<
        SmartStoryboardLibraryItem,
        "title" | "summary" | "tags" | "category" | "sourceRef" | "relationRef" | "reverseSourceScriptText" | "report" | "content"
      >
    >,
  ): Promise<SmartStoryboardLibraryItem> {
    assertAdmin(actor);
    const current = await this.requireItem(itemId);
    const nextTitle =
      patch.title !== undefined
        ? (() => {
            const value = patch.title.trim();
            assertCondition(value.length > 0, 400, "TITLE_REQUIRED", "Title required");
            return value;
          })()
        : current.title;
    const nextSummary =
      patch.summary !== undefined
        ? (() => {
            const value = patch.summary.trim();
            assertCondition(value.length > 0, 400, "SUMMARY_REQUIRED", "Summary required");
            return value;
          })()
        : current.summary;
    const nextContent =
      patch.content !== undefined
        ? (() => {
            const value = patch.content.trim();
            assertCondition(value.length > 0, 400, "CONTENT_REQUIRED", "Content required");
            return value;
          })()
        : current.content;
    let nextReport = cloneReverseStoryboardReport(current.report)!;
    if (patch.report !== undefined) {
      const report = cloneReverseStoryboardReport(patch.report);
      assertCondition(Boolean(report), 400, "REPORT_REQUIRED", "Report required");
      nextReport = report!;
    }
    const next: SmartStoryboardLibraryItem = {
      ...current,
      title: nextTitle,
      summary: nextSummary,
      tags: patch.tags !== undefined ? normalizeTags(patch.tags) : [...current.tags],
      category: patch.category ?? current.category,
      sourceRef: patch.sourceRef ? cloneSourceRef(patch.sourceRef) : cloneSourceRef(current.sourceRef),
      relationRef: patch.relationRef ? cloneRelationRef(patch.relationRef) : cloneRelationRef(current.relationRef),
      reverseSourceScriptText:
        patch.reverseSourceScriptText !== undefined
          ? normalizeOptionalText(patch.reverseSourceScriptText)
          : normalizeOptionalText(current.reverseSourceScriptText),
      report: nextReport,
      content: nextContent,
      updatedAt: this.repos.clock.now(),
    };
    await this.repos.smartStoryboardLibrary.upsert(next);
    await this.createVersion(next, await this.getCurrentVersion(actor, itemId) + 1);
    return cloneItem(next);
  }

  async remove(actor: User, itemId: string): Promise<void> {
    assertAdmin(actor);
    await this.requireItem(itemId);
    await this.repos.smartStoryboardLibrary.delete(itemId);
    await this.repos.smartStoryboardLibraryVersions.deleteByItemId(itemId);
  }

  async listVersions(actor: User, itemId: string): Promise<SmartStoryboardLibraryVersionRecord[]> {
    assertAdmin(actor);
    await this.requireItem(itemId);
    return (await this.repos.smartStoryboardLibraryVersions.findByItemId(itemId))
      .sort((left, right) => right.version - left.version)
      .map((item) => cloneVersion(item));
  }

  async rollback(actor: User, itemId: string, version: number): Promise<SmartStoryboardLibraryItem> {
    assertAdmin(actor);
    const current = await this.requireItem(itemId);
    assertCondition(Number.isInteger(version) && version > 0, 400, "VERSION_INVALID", "Version invalid");
    const allVersions = await this.repos.smartStoryboardLibraryVersions.findByItemId(itemId);
    const target = allVersions.find(
      (item) => item.version === version,
    );
    assertCondition(Boolean(target), 404, "VERSION_NOT_FOUND", "Version not found");
    const found = target as SmartStoryboardLibraryVersionRecord;
    const next: SmartStoryboardLibraryItem = {
      ...current,
      title: found.title,
      summary: found.summary,
      tags: [...found.tags],
      category: found.category,
      sourceRef: cloneSourceRef(found.sourceRef),
      relationRef: cloneRelationRef(found.relationRef),
      reverseSourceScriptText: normalizeOptionalText(found.reverseSourceScriptText),
      report: cloneReverseStoryboardReport(found.report)!,
      content: found.content,
      updatedAt: this.repos.clock.now(),
    };
    await this.repos.smartStoryboardLibrary.upsert(next);
    await this.createVersion(next, await this.getCurrentVersion(actor, itemId) + 1);
    return cloneItem(next);
  }

  async getCurrentVersion(actor: User, itemId: string): Promise<number> {
    assertAdmin(actor);
    await this.requireItem(itemId);
    return (await this.listVersions(actor, itemId))[0]?.version ?? 0;
  }

  private async requireItem(itemId: string): Promise<SmartStoryboardLibraryItem> {
    const item = await this.repos.smartStoryboardLibrary.findById(itemId);
    assertCondition(Boolean(item), 404, "NOT_FOUND", "Smart storyboard not found");
    return item as SmartStoryboardLibraryItem;
  }

  private async createVersion(item: SmartStoryboardLibraryItem, version: number): Promise<void> {
    const entry = createSmartStoryboardLibraryVersionRecord({
      id: this.repos.clock.generateId(),
      item: cloneItem(item),
      version,
      createdAt: this.repos.clock.now(),
    });
    await this.repos.smartStoryboardLibraryVersions.upsert(entry);
  }
}
