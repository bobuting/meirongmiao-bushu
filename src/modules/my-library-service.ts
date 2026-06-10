import type { PgScriptDataRepository } from "../repositories/pg/script-data-pg-repository.js";
import type { IReverseStoryboardLibraryRepository } from "../contracts/repository-ports/library-repository.js";
import type { PgUserScriptAssocRepository } from "../repositories/pg/user-script-assoc-pg-repository.js";
import type { PgShotBreakdownRepository } from "../repositories/pg/shot-breakdown-pg-repository.js";
import type { IMyLibraryService } from "../contracts/services.js";
import type { User } from "../contracts/types.js";
import type { ScriptData, ScriptTypeValue } from "../contracts/types.js";
import { scriptTypeToStrategy } from "../contracts/types.js";
import {
  buildMyLibraryPagedResponse,
  normalizeMyLibraryQuery,
  type MyLibraryPagedResponse,
  type MyScriptLibraryRecordDto,
  type MyStoryboardLibraryRecordDto,
  type UserScriptRecordDto,
} from "../contracts/my-library-api.js";

const STEP3_CONFIRMED_IMPORT_TAG = "#step3_confirmed_import";
const PROJECT_SCRIPT_TAG = "#项目脚本";
const PROJECT_SCRIPT_SYNC_TAG = "#项目同步";
const PROJECT_SCRIPT_MIRROR_TAG_PREFIX = "#project_script_mirror:";
const PROJECT_STORYBOARD_TAG = "#项目分镜";
const PROJECT_STORYBOARD_MIRROR_TAG_PREFIX = "#project_storyboard_mirror:";
const REVERSE_STORYBOARD_TAG = "#反推分镜";
const HOT_TREND_ASSET_TAG = "__hot_trend_asset__";

function summarizeText(input: string, maxLength = 80): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function normalizeTags(input: readonly string[]): string[] {
  return [...new Set(input.map((item) => item.trim()).filter((item) => item.length > 0))];
}

function hasKeyword(candidate: string, keyword: string | null): boolean {
  if (!keyword) {
    return true;
  }
  return candidate.toLowerCase().includes(keyword.toLowerCase());
}

function matchTags(candidateTags: readonly string[], requiredTags: readonly string[]): boolean {
  if (requiredTags.length < 1) {
    return true;
  }
  const candidate = new Set(candidateTags.map((item) => item.toLowerCase()));
  return requiredTags.every((tag) => candidate.has(tag.toLowerCase()));
}

function matchUpdatedAt(updatedAt: number, updatedAfter: number | null, updatedBefore: number | null): boolean {
  if (updatedAfter !== null && updatedAt < updatedAfter) {
    return false;
  }
  if (updatedBefore !== null && updatedAt > updatedBefore) {
    return false;
  }
  return true;
}

function resolveScriptSourceType(input: {
  tags: readonly string[];
  hasReverseContext: boolean;
}): MyScriptLibraryRecordDto["sourceType"] {
  if (input.hasReverseContext) {
    return "reverse";
  }
  if (
    input.tags.includes(PROJECT_SCRIPT_SYNC_TAG) ||
    input.tags.includes(PROJECT_SCRIPT_TAG) ||
    input.tags.includes(STEP3_CONFIRMED_IMPORT_TAG) ||
    input.tags.some((tag) => tag.startsWith(PROJECT_SCRIPT_MIRROR_TAG_PREFIX))
  ) {
    return "project";
  }
  return "manual";
}

function resolveStoryboardCategory(
  tags: readonly string[],
): MyStoryboardLibraryRecordDto["category"] {
  if (
    tags.includes(STEP3_CONFIRMED_IMPORT_TAG) ||
    tags.includes(PROJECT_STORYBOARD_TAG) ||
    tags.some((tag) => tag.startsWith(PROJECT_STORYBOARD_MIRROR_TAG_PREFIX))
  ) {
    return "project_generated";
  }
  return "manual_reverse";
}

function shouldIncludeStoryboardInMyLibrary(tags: readonly string[]): boolean {
  const category = resolveStoryboardCategory(tags);
  if (category === "project_generated") {
    return true;
  }
  if (!tags.includes(REVERSE_STORYBOARD_TAG)) {
    return false;
  }
  return tags.some((tag) => tag !== REVERSE_STORYBOARD_TAG);
}

/** 规范化 on_screen_presence 字段，确保 has_real_person 为布尔类型 */
function normalizeOnScreenPresence(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value === 'string') {
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const obj = value as Record<string, unknown>;
  const hasRealPerson = obj.has_real_person;
  return {
    ...obj,
    has_real_person: typeof hasRealPerson === 'string'
      ? hasRealPerson === 'true'
      : Boolean(hasRealPerson),
  };
}

/** 构造 payload 对象（从 ScriptData 字段组装，含分镜数据） */
function buildPayload(
  scriptData: ScriptData | null,
  shots: Array<{
    shotIndex: number;
    shotType: string | null;
    shotDescription: string | null;
    timecodeStart: string | null;
    timecodeEnd: string | null;
    visualJson: Record<string, unknown> | null;
    cameraDetailsJson: Record<string, unknown> | null;
  }> | null,
): Record<string, unknown> {
  if (!scriptData) {
    return {};
  }
  return {
    video_analysis: {
      summary: scriptData.summary ?? "",
      theme: scriptData.theme,
      video_style: scriptData.videoStyle,
      target_audience: scriptData.targetAudience,
      sourceOssUrl: scriptData.sourceOssUrl,
    },
    emotion_detail: scriptData.emotionDetail,
    on_screen_presence: normalizeOnScreenPresence(scriptData.onScreenPresence),
    fashion_styles: scriptData.fashionStyles,
    editing_analysis: scriptData.editingAnalysis,
    // 脚本正文内容
    content: scriptData.content ?? "",
    // 视频类型与情感
    video_type: scriptData.videoType,
    primary_emotion: scriptData.primaryEmotion,
    duration_seconds: scriptData.durationSeconds,
    // 分镜数据
    shots: (shots && shots.length > 0) ? shots.map((s) => ({
      index: s.shotIndex,
      shot_type: s.shotType,
      description: s.shotDescription,
      timecode_start: s.timecodeStart,
      timecode_end: s.timecodeEnd,
      visual: s.visualJson,
      camera: s.cameraDetailsJson,
    })) : undefined,
    // 顶层平铺字段（供 Step3 回访已确认脚本时前端读取）
    summary: scriptData.summary ?? undefined,
    mainScene: scriptData.mainScene ?? undefined,
    timeOfDay: scriptData.timeOfDay ?? undefined,
    weather: scriptData.weather ?? undefined,
    atmosphere: scriptData.atmosphere ?? undefined,
    theme: scriptData.theme ?? undefined,
    scriptStyle: scriptData.videoStyle ?? undefined,
    durationSec: scriptData.durationSeconds ?? undefined,
    strategyType: scriptData.type != null ? scriptTypeToStrategy(scriptData.type as ScriptTypeValue) : undefined,
    sourceUrl: scriptData.sourceOssUrl ?? undefined,
    storyboardCount: shots?.length ?? undefined,
  };
}

export class MyLibraryService implements IMyLibraryService {
  constructor(
    private readonly repos: {
      scriptData: PgScriptDataRepository;
      reverseStoryboardLibrary: IReverseStoryboardLibraryRepository;
      userScriptAssocs: PgUserScriptAssocRepository;
      shotBreakdowns: PgShotBreakdownRepository;
    },
  ) {}

  async listMyScripts(
    user: User,
    query: {
      page?: unknown;
      pageSize?: unknown;
      keyword?: unknown;
      tags?: unknown;
      sourceType?: unknown;
      updatedAfter?: unknown;
      updatedBefore?: unknown;
    },
  ): Promise<MyLibraryPagedResponse<UserScriptRecordDto>> {
    const normalized = normalizeMyLibraryQuery({
      ownerUserId: user.id,
      resourceType: "script",
      ...query,
    });

    // 从用户脚本关联表获取列表
    const userScriptAssocs = await this.repos.userScriptAssocs.listWithScriptDataByUserId(user.id);

    // 批量查询脚本详情（1 次 SQL，避免 N+1）
    const scriptDataIds = [...new Set(userScriptAssocs.map((a) => a.scriptDataId))];
    const scriptDataList = await this.repos.scriptData.findByIds(scriptDataIds);
    const scriptDataMap = new Map(scriptDataList.map((d) => [d.id, d]));

    // 组装 DTO（不含分镜数据，点击详情时按需加载）
    const items = userScriptAssocs
      .map((assoc): UserScriptRecordDto => {
        const scriptData = scriptDataMap.get(assoc.scriptDataId) ?? null;
        const title = assoc.title ?? scriptData?.title ?? "";
        const tags = normalizeTags(assoc.tags);
        const type = scriptData?.type ?? 0;
        // 列表不含分镜数据，减少查询开销
        const payload = buildPayload(scriptData, null);

        // id 返回 scriptDataId，以便前端删除接口正常工作
        return {
          id: assoc.scriptDataId,
          scriptDataId: assoc.scriptDataId,
          userId: assoc.userId,
          title,
          tags,
          source: assoc.source,
          notes: assoc.notes,
          type,
          payload,
          createdAt: assoc.createdAt,
          updatedAt: assoc.updatedAt,
        };
      })
      .filter((dto) => {
        const joined = `${dto.title}\n${JSON.stringify(dto.payload)}\n${dto.tags.join(" ")}`;
        if (!hasKeyword(joined, normalized.keyword)) {
          return false;
        }
        if (!matchTags(dto.tags, normalized.tags)) {
          return false;
        }
        if (!matchUpdatedAt(dto.updatedAt, normalized.updatedAfter, normalized.updatedBefore)) {
          return false;
        }
        return true;
      })
      .sort((left, right) => right.updatedAt - left.updatedAt);

    return buildMyLibraryPagedResponse({
      query: normalized,
      items,
    });
  }

  async getMyScriptById(
    user: User,
    scriptDataId: string,
  ): Promise<UserScriptRecordDto | null> {
    // 查询用户关联
    const assoc = await this.repos.userScriptAssocs.findByScriptDataId(scriptDataId);
    const userAssoc = assoc.find((a) => a.userId === user.id);
    if (!userAssoc) {
      return null;
    }

    // 查询脚本数据
    const scriptData = await this.repos.scriptData.findById(scriptDataId);
    if (!scriptData) {
      return null;
    }

    // 查询分镜数据
    const exact = await this.repos.shotBreakdowns.findByScriptDataId(scriptDataId);
    const byPrefix = await this.repos.shotBreakdowns.findByScriptDataIdPrefix(scriptDataId);
    const allShots = [...exact, ...byPrefix];
    const seen = new Set<string>();
    const uniqueShots = allShots.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
    const shots = uniqueShots.map((s) => ({
      shotIndex: s.shotIndex,
      shotType: s.shotType,
      shotDescription: s.shotDescription,
      timecodeStart: s.timecodeStart,
      timecodeEnd: s.timecodeEnd,
      visualJson: s.visualJson,
      cameraDetailsJson: s.cameraDetailsJson,
    }));

    const title = userAssoc.title ?? scriptData.title ?? "";
    const tags = normalizeTags(userAssoc.tags);
    const type = scriptData.type ?? 0;
    const payload = buildPayload(scriptData, shots);

    return {
      id: scriptDataId,
      scriptDataId: scriptDataId,
      userId: userAssoc.userId,
      title,
      tags,
      source: userAssoc.source,
      notes: userAssoc.notes,
      type,
      payload,
      createdAt: userAssoc.createdAt,
      updatedAt: userAssoc.updatedAt,
    };
  }

  async listMyStoryboards(
    user: User,
    query: {
      page?: unknown;
      pageSize?: unknown;
      keyword?: unknown;
      tags?: unknown;
      sourceType?: unknown;
      updatedAfter?: unknown;
      updatedBefore?: unknown;
    },
  ): Promise<MyLibraryPagedResponse<MyStoryboardLibraryRecordDto>> {
    const normalized = normalizeMyLibraryQuery({
      ownerUserId: user.id,
      resourceType: "storyboard",
      ...query,
    });
    const allReverseItems = await this.repos.reverseStoryboardLibrary.list();
    const reverseItems: MyStoryboardLibraryRecordDto[] = allReverseItems
      .filter((item) => item.userId === user.id)
      .filter((item) => shouldIncludeStoryboardInMyLibrary(normalizeTags(item.tags)))
      .map((item) => ({
        id: item.id,
        ownerUserId: item.userId,
        title: item.title,
        summary: item.summary,
        tags: normalizeTags(item.tags),
        category: resolveStoryboardCategory(item.tags),
        frameCount: item.report.frames.length,
        reverseSourceScriptText: null,
        updatedAt: item.updatedAt,
      }));
    const merged = [...reverseItems]
      .filter((dto) => {
        if (normalized.sourceType && dto.category !== normalized.sourceType) {
          return false;
        }
        const joined = `${dto.title}\n${dto.summary}\n${dto.tags.join(" ")}`;
        if (!hasKeyword(joined, normalized.keyword)) {
          return false;
        }
        if (!matchTags(dto.tags, normalized.tags)) {
          return false;
        }
        if (!matchUpdatedAt(dto.updatedAt, normalized.updatedAfter, normalized.updatedBefore)) {
          return false;
        }
        return true;
      })
      .sort((left, right) => right.updatedAt - left.updatedAt);

    return buildMyLibraryPagedResponse({
      query: normalized,
      items: merged,
    });
  }
}