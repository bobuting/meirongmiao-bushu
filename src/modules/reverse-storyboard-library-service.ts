import type {
  IReverseStoryboardLibraryRepository,
  IReverseStoryboardLibraryVersionRepository,
  IRepositoryClock,
} from "../contracts/repository-ports/index.js";
import type { IReverseStoryboardLibraryService } from "../contracts/services.js";
import type { User } from "../contracts/types.js";
import type { ReverseStoryboardLibraryItem } from "../contracts/reverse-storyboard-report.js";
import {
  createReverseStoryboardLibraryVersionRecord,
  type ReverseStoryboardLibraryVersionRecord,
} from "../contracts/reverse-storyboard-library-api.js";
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

function cloneLibraryItem(
  input: ReverseStoryboardLibraryItem,
): ReverseStoryboardLibraryItem {
  return {
    ...input,
    tags: [...input.tags],
    sourceMeta: {
      videoUrl: normalizeOptionalText(input.sourceMeta.videoUrl),
      filename: normalizeOptionalText(input.sourceMeta.filename),
      mimeType: normalizeOptionalText(input.sourceMeta.mimeType),
      duration: typeof input.sourceMeta.duration === "number" && Number.isFinite(input.sourceMeta.duration)
        ? input.sourceMeta.duration
        : null,
    },
    report: cloneReverseStoryboardReport(input.report)!,
  };
}

function cloneLibraryVersion(
  input: ReverseStoryboardLibraryVersionRecord,
): ReverseStoryboardLibraryVersionRecord {
  return {
    ...input,
    tags: [...input.tags],
    sourceMeta: {
      videoUrl: normalizeOptionalText(input.sourceMeta.videoUrl),
      filename: normalizeOptionalText(input.sourceMeta.filename),
      mimeType: normalizeOptionalText(input.sourceMeta.mimeType),
      duration: typeof input.sourceMeta.duration === "number" && Number.isFinite(input.sourceMeta.duration)
        ? input.sourceMeta.duration
        : null,
    },
    report: cloneReverseStoryboardReport(input.report)!,
  };
}

export class ReverseStoryboardLibraryService implements IReverseStoryboardLibraryService {
  constructor(
    private readonly repos: {
      reverseStoryboardLibrary: IReverseStoryboardLibraryRepository;
      reverseStoryboardLibraryVersions: IReverseStoryboardLibraryVersionRepository;
      clock: IRepositoryClock;
    },
  ) {}

  async list(user: User): Promise<ReverseStoryboardLibraryItem[]> {
    return (await this.repos.reverseStoryboardLibrary.list())
      .filter((item) => item.userId === user.id)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((item) => cloneLibraryItem(item));
  }

  async get(user: User, itemId: string): Promise<ReverseStoryboardLibraryItem> {
    return cloneLibraryItem(await this.requireOwnerItem(user, itemId));
  }

  async create(
    user: User,
    input: {
      id?: string;
      title: string;
      summary: string;
      tags?: readonly string[];
      sourceType: ReverseStoryboardLibraryItem["sourceType"];
      sourceMeta: ReverseStoryboardLibraryItem["sourceMeta"];
      report: ReverseStoryboardLibraryItem["report"];
      content: string;
    },
  ): Promise<ReverseStoryboardLibraryItem> {
    const title = input.title.trim();
    const summary = input.summary.trim();
    const content = input.content.trim();
    assertCondition(title.length > 0, 400, "TITLE_REQUIRED", "Storyboard title required");
    assertCondition(summary.length > 0, 400, "SUMMARY_REQUIRED", "Storyboard summary required");
    assertCondition(content.length > 0, 400, "CONTENT_REQUIRED", "Storyboard content required");
    const clonedReport = cloneReverseStoryboardReport(input.report);
    assertCondition(Boolean(clonedReport), 400, "REPORT_REQUIRED", "Storyboard report required");
    const itemId = typeof input.id === "string" && input.id.trim().length > 0 ? input.id.trim() : this.repos.clock.generateId();
    assertCondition(!(await this.repos.reverseStoryboardLibrary.exists(itemId)), 409, "STORYBOARD_ALREADY_EXISTS", "Storyboard already exists");
    const now = this.repos.clock.now();
    const item: ReverseStoryboardLibraryItem = {
      id: itemId,
      userId: user.id,
      title,
      summary,
      tags: normalizeTags(input.tags),
      sourceType: input.sourceType,
      sourceMeta: {
        videoUrl: normalizeOptionalText(input.sourceMeta.videoUrl),
        filename: normalizeOptionalText(input.sourceMeta.filename),
        mimeType: normalizeOptionalText(input.sourceMeta.mimeType),
        duration: typeof input.sourceMeta.duration === "number" && Number.isFinite(input.sourceMeta.duration)
          ? input.sourceMeta.duration
          : null,
      },
      report: clonedReport as ReverseStoryboardLibraryItem["report"],
      content,
      createdAt: now,
      updatedAt: now,
    };
    await this.repos.reverseStoryboardLibrary.upsert(item);
    await this.createVersion(item, 1);
    return cloneLibraryItem(item);
  }

  async update(
    user: User,
    itemId: string,
    patch: Partial<Pick<ReverseStoryboardLibraryItem, "title" | "summary" | "tags" | "report" | "content">> & {
      sourceMeta?: ReverseStoryboardLibraryItem["sourceMeta"];
    },
  ): Promise<ReverseStoryboardLibraryItem> {
    const current = await this.requireOwnerItem(user, itemId);
    const nextTitle =
      patch.title !== undefined
        ? (() => {
            const title = patch.title.trim();
            assertCondition(title.length > 0, 400, "TITLE_REQUIRED", "Storyboard title required");
            return title;
          })()
        : current.title;
    const nextSummary =
      patch.summary !== undefined
        ? (() => {
            const summary = patch.summary.trim();
            assertCondition(summary.length > 0, 400, "SUMMARY_REQUIRED", "Storyboard summary required");
            return summary;
          })()
        : current.summary;
    const nextTags = patch.tags !== undefined ? normalizeTags(patch.tags) : [...current.tags];
    const nextContent =
      patch.content !== undefined
        ? (() => {
            const content = patch.content.trim();
            assertCondition(content.length > 0, 400, "CONTENT_REQUIRED", "Storyboard content required");
            return content;
          })()
        : current.content;
    const nextSourceMeta =
      patch.sourceMeta !== undefined
        ? {
            videoUrl: normalizeOptionalText(patch.sourceMeta.videoUrl),
            filename: normalizeOptionalText(patch.sourceMeta.filename),
            mimeType: normalizeOptionalText(patch.sourceMeta.mimeType),
            duration: typeof patch.sourceMeta.duration === "number" && Number.isFinite(patch.sourceMeta.duration)
              ? patch.sourceMeta.duration
              : null,
          }
        : {
            videoUrl: normalizeOptionalText(current.sourceMeta.videoUrl),
            filename: normalizeOptionalText(current.sourceMeta.filename),
            mimeType: normalizeOptionalText(current.sourceMeta.mimeType),
            duration: typeof current.sourceMeta.duration === "number" && Number.isFinite(current.sourceMeta.duration)
              ? current.sourceMeta.duration
              : null,
          };
    let nextReport = cloneReverseStoryboardReport(current.report) as ReverseStoryboardLibraryItem["report"];
    if (patch.report !== undefined) {
      const clonedReport = cloneReverseStoryboardReport(patch.report);
      assertCondition(Boolean(clonedReport), 400, "REPORT_REQUIRED", "Storyboard report required");
      nextReport = clonedReport as ReverseStoryboardLibraryItem["report"];
    }
    const next: ReverseStoryboardLibraryItem = {
      ...current,
      title: nextTitle,
      summary: nextSummary,
      tags: nextTags,
      content: nextContent,
      sourceMeta: nextSourceMeta,
      report: nextReport,
      updatedAt: this.repos.clock.now(),
    };
    await this.repos.reverseStoryboardLibrary.upsert(next);
    await this.createVersion(next, await this.getCurrentVersion(user, itemId) + 1);
    return cloneLibraryItem(next);
  }

  async remove(user: User, itemId: string): Promise<void> {
    await this.requireOwnerItem(user, itemId);
    await this.repos.reverseStoryboardLibrary.delete(itemId);
    await this.repos.reverseStoryboardLibraryVersions.deleteByItemId(itemId);
  }

  async listVersions(user: User, itemId: string): Promise<ReverseStoryboardLibraryVersionRecord[]> {
    await this.requireOwnerItem(user, itemId);
    return (await this.repos.reverseStoryboardLibraryVersions.findByItemId(itemId))
      .filter((item) => item.userId === user.id)
      .sort((left, right) => right.version - left.version)
      .map((item) => cloneLibraryVersion(item));
  }

  async rollback(user: User, itemId: string, version: number): Promise<ReverseStoryboardLibraryItem> {
    const current = await this.requireOwnerItem(user, itemId);
    assertCondition(Number.isInteger(version) && version > 0, 400, "VERSION_INVALID", "Version invalid");
    const allVersions = await this.repos.reverseStoryboardLibraryVersions.findByItemId(itemId);
    const target = allVersions.find(
      (item) => item.userId === user.id && item.version === version,
    );
    assertCondition(Boolean(target), 404, "VERSION_NOT_FOUND", "Storyboard version not found");
    const found = target as ReverseStoryboardLibraryVersionRecord;
    const next: ReverseStoryboardLibraryItem = {
      ...current,
      title: found.title,
      summary: found.summary,
      tags: [...found.tags],
      sourceType: found.sourceType,
      sourceMeta: {
        videoUrl: normalizeOptionalText(found.sourceMeta.videoUrl),
        filename: normalizeOptionalText(found.sourceMeta.filename),
        mimeType: normalizeOptionalText(found.sourceMeta.mimeType),
        duration: typeof found.sourceMeta.duration === "number" && Number.isFinite(found.sourceMeta.duration)
          ? found.sourceMeta.duration
          : null,
      },
      report: cloneReverseStoryboardReport(found.report)!,
      content: found.content,
      updatedAt: this.repos.clock.now(),
    };
    await this.repos.reverseStoryboardLibrary.upsert(next);
    await this.createVersion(next, await this.getCurrentVersion(user, itemId) + 1);
    return cloneLibraryItem(next);
  }

  async getCurrentVersion(user: User, itemId: string): Promise<number> {
    await this.requireOwnerItem(user, itemId);
    return (await this.listVersions(user, itemId))[0]?.version ?? 0;
  }

  private async requireOwnerItem(user: User, itemId: string): Promise<ReverseStoryboardLibraryItem> {
    const item = await this.repos.reverseStoryboardLibrary.findById(itemId);
    assertCondition(Boolean(item), 404, "NOT_FOUND", "Storyboard not found");
    const existing = item as ReverseStoryboardLibraryItem;
    assertCondition(existing.userId === user.id, 403, "FORBIDDEN", "Storyboard owner only");
    return existing;
  }

  private async createVersion(item: ReverseStoryboardLibraryItem, version: number): Promise<void> {
    const entry: ReverseStoryboardLibraryVersionRecord = createReverseStoryboardLibraryVersionRecord({
      id: this.repos.clock.generateId(),
      item: {
        ...item,
        tags: [...item.tags],
        sourceMeta: {
          videoUrl: normalizeOptionalText(item.sourceMeta.videoUrl),
          filename: normalizeOptionalText(item.sourceMeta.filename),
          mimeType: normalizeOptionalText(item.sourceMeta.mimeType),
          duration: typeof item.sourceMeta.duration === "number" && Number.isFinite(item.sourceMeta.duration)
            ? item.sourceMeta.duration
            : null,
        },
        report: cloneReverseStoryboardReport(item.report)!,
      },
      version,
      createdAt: this.repos.clock.now(),
    });
    await this.repos.reverseStoryboardLibraryVersions.upsert(entry);
  }
}
