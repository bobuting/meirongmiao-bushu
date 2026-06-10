/**
 * step3-candidate-helpers.ts
 * Step3 候选快照、改写、匹配、帧预览的闭包辅助函数工厂
 *
 * 从 project-routes.ts (Step3 辅助类型、常量、函数区域) 提取
 * 提供给 step3-candidate/index.ts 和 step4-frame-preview/index.ts 共用
 */

import type { FastifyInstance } from "fastify";
import type { AtmosphereSceneCategory, EmotionToneCategory } from '../contant-config/style-atmosphere-dict.js';
import { safeParseAtmosphere, safeParseEmotionTone } from '../utils/dict-converters.js';

import type { AppContext } from "../core/app-context.js";
import type { ProjectRouteDeps, JimengImageRatio, JimengImageResolution } from "./project-route-shared.js";
import { getLogger } from "../core/logger/index.js";
const log = getLogger("step3-candidate-helpers");
import type {
  Project,
  User,
  ProviderRouteKey,
  ScriptTypeValue,
  StrategyTypeValue,
} from "../contracts/types.js";
import { scriptTypeToStrategy } from "../contracts/types.js";
import { ProviderRouteKeys, selectRouteKeyByAge } from "../contracts/provider-route-keys.js";
import type {
  Step3ScriptCandidateSnapshot,
  ScriptCandidateEntity,
  Step3ScriptCandidateSnapshotRef,
  Step3ScriptCandidateMeta,
  Step3CandidateLockState,
} from "../contracts/step3-candidate-snapshot-contract.js";

import { AppError } from "../core/errors.js";
import { createHash } from "node:crypto";
import { toPlainRecord } from "../services/utils/json-utils.js";
import { sanitizeUrlField } from "../contracts/media-url-safety.js";
import {
  createEmptyProjectBackgroundGenerationTaskState,
  normalizeProjectBackgroundGenerationTaskState,
} from "../contracts/project-background-generation-task.js";
import {
  buildProjectPageContentSnapshot,
  PROJECT_PAGE_CONTENT_SNAPSHOT_CONTRACT_VERSION,
} from "../contracts/project-page-content-snapshot.js";
import {
  normalizeStep3ScriptCandidateSnapshot,
  // isStep3CandidateLockTransitionAllowed,  // UNUSED
} from "../contracts/step3-candidate-snapshot-contract.js";
import {
  normalizeStep3StoryboardFrameGenerationInput,
  buildStep3StoryboardFrameGenerationRequest,
} from "../modules/step3-storyboard-frame-generation-contract.js";
import { persistImageSourceToStorage } from "../services/media/storage-persist.js";
import { getScriptsDataDbService, type VideoScriptDataRecord } from "../service/scripts-data-db-service.js";
import {
  getStep3FrameImagesDbService,
  type Step3FrameImageBatch,
} from "../service/step3-frame-images-db-service.js";
// import { compactTextLine } from "../utils/text.js";  // UNUSED
import {
  resolveRouteProviderWithFallback,
} from "../services/llm/provider-resolver.js";
import {
  HOT_TREND_STEP3_MAX_STORYBOARD_SEGMENTS,
  sanitizeHotTrendNarrativeText,
  stripHotTrendMetadata,
  mergeShortHotTrendNarrationBlocks,
} from "../modules/hot-trend/index.js";
import {
  mapRawReverseStoryboardReport,
  mapReverseStoryboardReportToSegments,
} from "../modules/reverse-storyboard-report-mapper.js";
// buildProjectStepState import removed - workflow state no longer persisted
import { parseVideoScriptsContentsWithShots } from "../modules/video-step/step3-video-script/content-parser.js";
import type { VideoScriptData } from "../modules/video-step/step3-video-script/types.js";
// import type { ShotBreakdownItem } from "../modules/video-step/step3-video-script/types.js";  // UNUSED

// ===========================================================================
// 导出类型（route 模块需要引用）
// ===========================================================================

export type Step3FramePreviewResult = {
  index: number;
  title: string;
  prompt: string;
  candidates: string[];
};

export type Step3RelationMode = "single" | "couple" | "friends" | "family" | "brothers" | "ensemble";

export type Step3ProjectMatchProfile = {
  protagonistDescriptor: string;
  roleTitle: string | null;
  gender: "male" | "female" | null;
  age: number | null;
  styleWords: string[];
  coreFeaturesText: string | null;
  outfitSummary: string | null;
  outfitKeywords: string[];
  referenceAnchors: string[];
  semanticKeywords: string[];
  semanticText: string;
  relationMode: Step3RelationMode | null;
  schoolYouthSignals: string[];
  mommySignals: string[];
  profileHash: string;
  hasSignals: boolean;
};

export type Step3CandidateMatchMeta = {
  matchScore: number;
  matchReasons: string[];
  matchBlocked: boolean;
  matchBlockedReason: string | null;
};

// ===========================================================================
// 工厂函数：创建所有 Step3 闭包辅助函数
// ===========================================================================

export function createStep3Helpers(
  app: FastifyInstance,
  ctx: AppContext,
  deps: ProjectRouteDeps,
) {
  const {
    requestLlmImageGenerationUrls,
    // normalizeJimengImageRatio,  // UNUSED
    // normalizeJimengImageResolution,  // UNUSED
    normalizeProviderTransportImageUrls,
    buildOutfitContextSummary,
  } = deps;

  // Step3 帧图片数据库服务
  const step3FrameImagesDb = getStep3FrameImagesDbService(ctx.repos);

  const normalizeStep3PreviewCandidatesByFrameFromProjectData = (
    projectData: Record<string, unknown>,
  ): Record<string, string[]> => {
    const raw = projectData.step3PreviewCandidatesByFrame;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {};
    }
    const output: Record<string, string[]> = {};
    for (const [rawFrameIndex, rawCandidates] of Object.entries(raw)) {
      const frameIndex = Number(rawFrameIndex);
      if (!Number.isInteger(frameIndex) || frameIndex < 1 || !Array.isArray(rawCandidates)) {
        continue;
      }
      const candidates = [
        ...new Set(
          rawCandidates
            .map((item) => sanitizeUrlField(item))
            .filter((item): item is string => typeof item === "string" && item.length > 0),
        ),
      ];
      if (candidates.length > 0) {
        output[String(frameIndex)] = candidates;
      }
    }
    return output;
  };

  const upsertProjectWorkflowStateProjectData = async (
    project: Project,
    user: User,
    updater: (projectData: Record<string, unknown>) => Record<string, unknown>,
  ): Promise<void> => {
    // Workflow state no longer persisted - no-op
    project.updatedAt = ctx.clock.now();
  };

  const readStep3CandidateSnapshotForProject = async (project: Project): Promise<Step3ScriptCandidateSnapshot | null> => {
    // Workflow state no longer persisted - snapshots managed in-memory
    return null;
  };

  const persistStep3CandidateSnapshotForProject = async (
    project: Project,
    ownerUser: User,
    snapshot: Step3ScriptCandidateSnapshot,
  ): Promise<void> => {
    // Workflow state no longer persisted - no-op
  };

  /**
   * 为旧格式快照补全/修复分镜数据：查询 nrm_script_data + nrm_shot_breakdown 表，重建 storyboardSegments
   * 复用 convertPayloadToSnapshotItem 保持分镜构建逻辑一致
   * 对于自身无 shot_breakdown 的 item，通过 source_script_id 追溯源记录的分镜
   * 同时修复已有分镜但 content == visualCue 的数据（旁白与画面重复）
   * 同时补全 sourceUrl（如果为空但有 sourceScriptId）
   */
  const enrichSnapshotWithShotBreakdown = async (
    snapshot: Step3ScriptCandidateSnapshot,
  ): Promise<Step3ScriptCandidateSnapshot> => {
    const scriptsService = getScriptsDataDbService(ctx.repos);

    // ===== 第一步：补全 sourceUrl（独立于分镜修复） =====
    const itemsNeedingSourceUrl = snapshot.items.filter(
      (item) => !item.sourceUrl && item.sourceScriptId,
    );

    let itemsWithSourceUrl = snapshot.items;
    if (itemsNeedingSourceUrl.length > 0) {
      const sourceScriptIds = itemsNeedingSourceUrl
        .map((item) => item.sourceScriptId)
        .filter((id): id is string => !!id);

      if (sourceScriptIds.length > 0) {
        const sourceRecordsMap = await scriptsService.getByIds(sourceScriptIds);

        itemsWithSourceUrl = snapshot.items.map((item) => {
          if (item.sourceUrl || !item.sourceScriptId) {
            return item;
          }
          const sourceRecord = sourceRecordsMap.get(item.sourceScriptId);
          if (sourceRecord?.sourceOssUrl) {
            return { ...item, sourceUrl: sourceRecord.sourceOssUrl };
          }
          return item;
        });
      }
    }

    // ===== 第二步：修复分镜数据 =====
    // 筛选出需要修复的 item：无分镜 或 分镜的 content == visualCue（旁白与画面重复）或 content 为占位符
    const itemsNeedingShots = itemsWithSourceUrl.filter((item) => {
      if (!item.storyboardSegments || item.storyboardSegments.length === 0) {
        return true;
      }
      // 检查是否有分镜需要修复：content == visualCue 或 content 为占位符（"分镜内容"）
      return item.storyboardSegments.some((seg) => {
        if (!seg) return false;
        const content = (seg.content || "").trim();
        const visualCue = (seg.visualCue || "").trim();
        // content 和 visualCue 相同
        if (content && content === visualCue) {
          return true;
        }
        // content 为占位符（数据库中存储的错误默认值）
        if (content === "分镜内容" || content === "画面描述") {
          return true;
        }
        return false;
      });
    });
    if (itemsNeedingShots.length === 0) {
      return { ...snapshot, items: itemsWithSourceUrl };
    }

    // 第一步：用 candidateId 查询 shot_breakdown
    const candidateIds = itemsNeedingShots.map((item) => item.candidateId);
    const payloadsMap = await scriptsService.getByIds(candidateIds);
    const records = Array.from(payloadsMap.values());
    const parsedScripts = await parseVideoScriptsContentsWithShots(ctx.repos.shotBreakdowns, records);
    const parsedMap = new Map(parsedScripts.map((s) => [s.id, s]));

    // 第二步：对于仍然没有 shot_breakdown 的 item，通过 source_script_id 追溯源记录
    const stillMissing = itemsNeedingShots.filter(
      (item) => !parsedMap.get(item.candidateId)?.parsed?.shot_breakdown,
    );
    let sourceParsedMap = new Map<string, VideoScriptData>();
    if (stillMissing.length > 0) {
      const sourceIds = stillMissing
        .map((item) => payloadsMap.get(item.candidateId)?.sourceScriptId)
        .filter((id): id is string => !!id);
      if (sourceIds.length > 0) {
        const sourcePayloadsMap = await scriptsService.getByIds(sourceIds);
        const sourceRecords = Array.from(sourcePayloadsMap.values());
        const sourceParsedScripts = await parseVideoScriptsContentsWithShots(ctx.repos.shotBreakdowns, sourceRecords);
        sourceParsedMap = new Map(sourceParsedScripts.map((s) => [s.id, s]));
      }
    }

    // 补全/修复 storyboardSegments
    const enrichedItems = snapshot.items.map((item) => {
      // 检查是否需要修复：无分镜 或 content == visualCue 或 content 为占位符
      const needsFix =
        !item.storyboardSegments ||
        item.storyboardSegments.length === 0 ||
        item.storyboardSegments.some((seg) => {
          if (!seg) return false;
          const content = (seg.content || "").trim();
          const visualCue = (seg.visualCue || "").trim();
          // content 和 visualCue 相同
          if (content && content === visualCue) {
            return true;
          }
          // content 为占位符（数据库中存储的错误默认值）
          if (content === "分镜内容" || content === "画面描述") {
            return true;
          }
          return false;
        });

      if (!needsFix) {
        return item;
      }

      // 优先用自身 candidateId 查到的 shot_breakdown
      const parsedScript = parsedMap.get(item.candidateId);
      const payload = payloadsMap.get(item.candidateId);
      let shotBreakdown = parsedScript?.parsed?.shot_breakdown;
      let record = payload;

      // 自身没有时，通过 source_script_id 追溯
      if (!shotBreakdown && payload?.sourceScriptId) {
        const sourceParsed = sourceParsedMap.get(payload.sourceScriptId);
        if (sourceParsed?.parsed?.shot_breakdown) {
          shotBreakdown = sourceParsed.parsed.shot_breakdown;
        }
      }

      if (!shotBreakdown || !record) {
        return item;
      }

      // 复用 convertPayloadToSnapshotItem 的分镜构建逻辑
      const rebuilt = convertPayloadToSnapshotItem(
        record,
        item.candidateId,
        undefined,
        shotBreakdown,
      );
      if (!rebuilt?.storyboardSegments) {
        return item;
      }
      return { ...item, storyboardSegments: rebuilt.storyboardSegments };
    });

    return { ...snapshot, items: enrichedItems };
  };

  /**
   * 从引用格式重建完整快照（从 nrm_script_data 批量查询候选内容）
   * 包含从 nrm_shot_breakdown 表查询分镜数据
   */
  const reconstructSnapshotFromRef = async (
    ref: Step3ScriptCandidateSnapshotRef,
    _project: Project,
  ): Promise<Step3ScriptCandidateSnapshot | null> => {
    if (!ref.candidateIds || ref.candidateIds.length === 0) {
      log.warn({ snapshotId: ref.snapshotId }, "Empty candidateIds for snapshot");
      return null;
    }

    // 批量查询 nrm_script_data
    const scriptsService = getScriptsDataDbService(ctx.repos);
    const payloadsMap = await scriptsService.getByIds(ref.candidateIds);

    // 批量查询 shot_breakdown（包含分镜数据）
    const records = Array.from(payloadsMap.values());
    const parsedScripts = await parseVideoScriptsContentsWithShots(ctx.repos.shotBreakdowns, records);
    const parsedMap = new Map(parsedScripts.map(script => [script.id, script]));

    // 转换为 items
    const items: ScriptCandidateEntity[] = [];
    for (const candidateId of ref.candidateIds) {
      const payload = payloadsMap.get(candidateId);
      if (!payload) {
        log.warn({ candidateId }, "Candidate not found in nrm_script_data");
        continue;
      }
      // 获取解析后的脚本（包含 shot_breakdown）
      const parsedScript = parsedMap.get(candidateId);
      // 从 payload 转换为 snapshot item（包含 storyboardSegments）
      const item = convertPayloadToSnapshotItem(payload, candidateId, ref.candidateMetas, parsedScript?.parsed?.shot_breakdown);
      if (item) {
        items.push(item);
      }
    }

    // 验证最小数量
    if (items.length < 1) {
      log.warn({ snapshotId: ref.snapshotId }, "No valid items for snapshot");
      return null;
    }

    return {
      snapshotId: ref.snapshotId,
      projectId: ref.projectId,
      promptVersion: ref.promptVersion,
      topNAtCreation: ref.topNAtCreation,
      lockState: ref.lockState,
      selectedCandidateId: ref.selectedCandidateId,
      confirmedCandidateId: ref.confirmedCandidateId,
      lockVersion: ref.lockVersion,
      generationMode: ref.generationMode,
      createdAt: ref.createdAt,
      items,
    };
  };

  /**
   * 从 VideoScriptDataRecord 转换为 ScriptCandidateEntity
   * 包含从 shot_breakdown 重建 storyboardSegments
   *
   * 【统一改造】补齐所有独立字段，与 3 个 builder 输出完全一致
   * 字段优先级：DB 平铺列 > shot_breakdown 推导 > 默认值
   */
  const convertPayloadToSnapshotItem = (
    record: VideoScriptDataRecord,
    candidateId: string,
    metas?: Step3ScriptCandidateMeta[],
    shotBreakdown?: Array<{
      shot_type?: string;
      shot_description?: string;
      audio?: {
        dialogue?: { content?: string } | null;
        narration?: { content?: string } | null;
        music?: { presence?: boolean; style?: string; mood?: string; tempo?: string };
        /** 环境音描述 */
        ambient_sound?: string;
      };
      timecode?: { duration_seconds?: number };
    }>,
  ): ScriptCandidateEntity | null => {
    // 从 metas 获取基础信息（如果有）
    const meta = metas?.find(m => m.candidateId === candidateId);

    // 从 record 提取标题和时长
    const title = record.title || meta?.title || "无标题";
    const preview = meta?.preview || "";
    const content = record.summary || "";
    const durationSec = record.durationSeconds || 30;

    // 确定 strategyType（优先从 meta 取，否则从 DB type 映射）
    const strategyType = (meta?.strategyType as StrategyTypeValue) || scriptTypeToStrategy(record.type as ScriptTypeValue);

    // 从 shot_breakdown 重建 storyboardSegments
    const storyboardSegments = shotBreakdown && shotBreakdown.length > 0
      ? shotBreakdown.map((shot, index) => {
          // 从 ambient_sound 提取环境音描述
          const ambientSound = shot.audio?.ambient_sound || "";
          return {
            title: `镜头 ${index + 1}`,
            content: ambientSound ? `环境音：${ambientSound}` : "",
            visualCue: shot.shot_description || "",
            visualPrompt: shot.shot_description || "",
            shotSize: shot.shot_type,
            durationSec: shot.timecode?.duration_seconds,
            audio: shot.audio,
          };
        })
      : undefined;

    return {
      candidateId,
      sourceScriptId: record.sourceScriptId || candidateId,
      sourceUrl: record.sourceOssUrl ?? null,
      rank: meta?.rank || 1,
      strategyType,
      title,
      preview,
      content,
      durationSec,
      suitability: "high",
      labels: [],
      storyboardSegments,
      // 选中/确认状态
      isConfirmed: record.isConfirmed ?? false,
      isSelected: record.isSelected ?? false,

      // ===== 独立字段（补齐，与 3 个 builder 输出一致） =====
      mainScene: record.mainScene ?? undefined,
      timeOfDay: record.timeOfDay ?? undefined,
      weather: record.weather ?? undefined,
      atmosphere: safeParseAtmosphere(record.atmosphere) ?? undefined,
      // 从 DB 平铺列提取（DB 写入路径已统一存储这些字段）
      scriptStyle: record.videoStyle ?? undefined,
      shotCount: shotBreakdown?.length ?? undefined,
      scriptType: record.videoType ?? undefined,
      audienceProfile: record.targetAudience ?? undefined,
      emotionTone: safeParseEmotionTone(record.primaryEmotion) ?? undefined,
      theme: record.theme ?? undefined,
      scene: record.mainScene ?? undefined,
      storyLine: undefined,
      emotionArc: (record.emotionDetail && typeof record.emotionDetail.emotion_arc === "string")
        ? record.emotionDetail.emotion_arc
        : undefined,
      summary: record.summary ?? undefined,
      subtitle: record.videoStyle ?? undefined,

      // 关键元素和服饰植入备注（新增字段）
      keyElements: record.keyElements ?? undefined,
      placementNotes: record.placementNotes ?? undefined,

      // 大模型完整结构化输出（从 DB payload 字段重建）
      video_info: {
        title: record.title,
        title_candidates: record.titleCandidates ?? undefined,
        duration_seconds: record.durationSeconds,
        source: record.source,
        time_of_day: record.timeOfDay,
        weather: record.weather,
        main_scene: record.mainScene,
      },
      video_analysis: {
        theme: record.theme ?? undefined,
        summary: record.summary ?? undefined,
        emotion: record.emotionDetail ?? undefined,
        video_type: record.videoType ?? undefined,
        video_style: record.videoStyle ?? undefined,
        target_audience: record.targetAudience ?? undefined,
        fashion_placement: {
          suitable: record.fashionSuitable ?? undefined,
          reason: record.fashionReason ?? undefined,
          recommended_styles: record.fashionStyles ?? undefined,
        },
        on_screen_presence: record.onScreenPresence ?? undefined,
      },
      editing_analysis: record.editingAnalysis ?? undefined,
      shot_breakdown: shotBreakdown as Record<string, unknown>[] | undefined,
    };
  };

  /**
   * 持久化候选快照（存完整快照）
   * 保留此函数签名以兼容旧调用点，内部委托给 persistStep3CandidateSnapshotForProject
   */
  const persistStep3CandidateSnapshotRefForProject = async (
    project: Project,
    ownerUser: User,
    snapshot: Step3ScriptCandidateSnapshot,
  ): Promise<void> => {
    // Workflow state no longer persisted - no-op
  };

  /**
   * 合并新旧 step3 脚本候选快照的 items
   * 去重策略：按 candidateId 去重，优先保留新 item
   * 数量限制：最多保留 5 个（与 snapshot contract 定义一致）
   *
   * @param oldItems - 旧快照的 items 数组
   * @param newItems - 新生成的 items 数组
   * @param maxItems - 最大保留数量，默认 5
   * @returns 合并后的 items 数组
   */
  const mergeStep3CandidateSnapshotItems = (
    oldItems: ScriptCandidateEntity[],
    newItems: ScriptCandidateEntity[],
    maxItems: number = 50
  ): ScriptCandidateEntity[] => {
    // 新的 items 优先放在前面
    const merged = [...newItems];
    const newIds = new Set(newItems.map(item => item.candidateId));

    // 添加旧的、未被新覆盖的 items
    for (const item of oldItems) {
      if (!newIds.has(item.candidateId)) {
        merged.push(item);
      }
    }

    // 限制数量，保留最新的
    return merged.slice(0, maxItems);
  };

  const splitStep3CandidateContentToSegments = (
    content: string,
  ): Array<{
    title: string;
    content: string;
    visualCue: string;
    visualPrompt: string;
  }> => {
    const normalizeSegmentLine = (line: string): string =>
      line
        .replace(/^镜头\s*\d+\s*[:：-]?\s*/u, "")
        .replace(/^(?:[-*•·]|\d+[.)、]|[（(]?\d+[）)])\s*/u, "")
        .replace(/^旁白\s*[:：]\s*/u, "")
        .trim();
    const shouldSkipSegmentLine = (line: string): boolean =>
      /^(?:视频主题|视频简介|场景设定|主场景|辅助场景|时间|天气|氛围|抖音标题|封面文案|角色设定表|服装设定表|分镜表)\b/u.test(
        line,
      );
    const expandNarrationBlocks = (line: string): string[] => {
      const normalized = line.replace(/\s+/g, " ").trim();
      if (!normalized) {
        return [];
      }
      const blocks = normalized
        .split(/(?<=[。！？!?；;])/u)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      return blocks.length > 0 ? blocks : [normalized];
    };
    const shotPlan = [
      { lens: "远景", movement: "缓推", focus: "人物出场与场景关系" },
      { lens: "中景", movement: "跟拍", focus: "动作延续与节奏变化" },
      { lens: "近景", movement: "平移", focus: "服装质感与细节反应" },
      { lens: "半身", movement: "轻摇", focus: "人物互动与情绪变化" },
      { lens: "特写", movement: "定帧后慢推", focus: "情绪落点与记忆点" },
    ] as const;
    const resolveVisualCue = (line: string, index: number): string => {
      const compact = line.replace(/\s+/g, " ").trim();
      if (!compact) {
        return "画面：补充主体动作与环境细节";
      }
      const plan = shotPlan[index % shotPlan.length]!;
      const limited = compact.slice(0, 68);
      return `画面：${plan.lens}${plan.movement}，主体完成动作并与环境产生呼应；${limited}；重点呈现${plan.focus}。`;
    };
    const rawLines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const scriptLines: string[] = [];
    let inMetaSection = false;
    for (const line of rawLines) {
      if (line.startsWith("# 热榜元数据")) {
        inMetaSection = true;
        continue;
      }
      if (inMetaSection && line.startsWith("- ")) {
        continue;
      }
      const normalized = normalizeSegmentLine(line);
      if (!normalized) {
        continue;
      }
      if (shouldSkipSegmentLine(normalized)) {
        continue;
      }
      scriptLines.push(normalized);
    }
    const expandedLines = mergeShortHotTrendNarrationBlocks(scriptLines.flatMap((line) => expandNarrationBlocks(line)));
    const lines = expandedLines.slice(0, HOT_TREND_STEP3_MAX_STORYBOARD_SEGMENTS);
    const fallbackLines = mergeShortHotTrendNarrationBlocks(expandNarrationBlocks(normalizeSegmentLine(content)));
    const normalizedLines = lines.length > 0 ? lines : fallbackLines.filter((line) => line.length > 0);
    if (normalizedLines.length < 1) {
      return [
        {
          title: "镜头 1",
          content: "（暂无脚本内容）",
          visualCue: "画面：补充主体动作与环境细节",
          visualPrompt: "画面：补充主体动作与环境细节",
        },
      ];
    }
    return normalizedLines.map((line, index) => ({
      title: `镜头 ${index + 1}`,
      content: line,
      visualCue: resolveVisualCue(line, index),
      visualPrompt: resolveVisualCue(line, index),
    }));
  };

  const composeStep3NarrationWithVisual = (narrationRaw: string, visualCueRaw: string): string => {
    const narration = sanitizeHotTrendNarrativeText(
      String(narrationRaw ?? "")
        .replace(/^旁白\s*[:：]\s*/u, "")
        .trim(),
    );
    const visual = sanitizeHotTrendNarrativeText(
      String(visualCueRaw ?? "")
        .replace(/^画面\s*[:：]\s*/u, "")
        .trim(),
    );
    if (narration.length > 0 && visual.length > 0) {
      return `旁白：${narration}\n画面：${visual}`;
    }
    if (narration.length > 0) {
      return `旁白：${narration}`;
    }
    if (visual.length > 0) {
      return `画面：${visual}`;
    }
    return "";
  };

  const resolveStep3MainVisualPromptForImport = (
    narrationRaw: string,
    visualCue: string,
    visualPromptRaw: string,
  ): string => {
    const normalizedPrompt = sanitizeHotTrendNarrativeText(String(visualPromptRaw ?? "").trim());
    const composedPrompt = composeStep3NarrationWithVisual(narrationRaw, visualCue);
    if (normalizedPrompt.length < 1) {
      return composedPrompt || visualCue;
    }
    if (
      normalizedPrompt === visualCue ||
      /^画面\s*[:：]/u.test(normalizedPrompt) ||
      (normalizedPrompt.includes("\n") && !/^旁白\s*[:：]/u.test(normalizedPrompt))
    ) {
      return composedPrompt || normalizedPrompt;
    }
    return normalizedPrompt;
  };

  const normalizeStep3StoryboardSegmentForImport = (
    segment: { title: string; content: string; visualCue: string; visualPrompt: string },
    index: number,
  ): { title: string; content: string; visualCue: string; visualPrompt: string } => {
    const rawContent = String(segment.content ?? "").trim();
    const contentLines = rawContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const narrationRaw =
      contentLines
        .find((line) => !/^画面\s*[:：]/u.test(line))
        ?.replace(/^旁白\s*[:：]\s*/u, "")
        .trim() ?? rawContent.replace(/^旁白\s*[:：]\s*/u, "").trim();
    const visualRaw =
      String(segment.visualCue ?? "").trim() ||
      contentLines.find((line) => /^画面\s*[:：]/u.test(line))?.replace(/^画面\s*[:：]\s*/u, "").trim() ||
      narrationRaw.slice(0, 56) ||
      "补充主体动作与环境细节";
    const visualNarrative = sanitizeHotTrendNarrativeText(visualRaw.replace(/^画面\s*[:：]\s*/u, "").trim());
    const visualCue = `画面：${visualNarrative || "补充主体动作与环境细节"}`;
    const content = composeStep3NarrationWithVisual(narrationRaw, visualCue);
    const visualPrompt = resolveStep3MainVisualPromptForImport(
      narrationRaw,
      visualCue,
      String(segment.visualPrompt ?? "").trim(),
    );
    return {
      title: String(segment.title ?? "").trim() || `镜头 ${index + 1}`,
      content: content.length > 0 ? content : `旁白：${narrationRaw || "（待补充）"}`,
      visualCue,
      visualPrompt: visualPrompt.length > 0 ? visualPrompt : visualCue,
    };
  };



  const STEP3_REWRITE_VERSION = "step3-rewrite-v2";
  const STEP3_OUTFIT_KEYWORD_PATTERN =
    /([A-Za-z0-9]{2,24}|[\u4e00-\u9fff]{1,24})(?:T恤|衬衫|上衣|外套|夹克|西装|风衣|卫衣|针织|背心|裙|半裙|长裙|短裙|裤|牛仔裤|工装裤|长裤|短裤|鞋|鞋履|德训鞋|乐福鞋|运动鞋|靴|项链|耳环|手链|包|帽|配饰|套装|连衣裙)/gu;
  const STEP3_SEMANTIC_ROLE_TOKENS = [
    "学姐",
    "学妹",
    "校园",
    "少女",
    "女生",
    "女孩",
    "女主",
    "男生",
    "男孩",
    "男主",
    "艺术",
    "书卷气",
    "优雅",
    "复古",
    "清冷",
    "元气",
    "甜妹",
    "辣妹",
    "女神",
    "男神",
    "型男",
    "腹肌",
    "肌肉",
    "肌肉线条",
    "硬汉",
    "健身",
    "宝妈",
    "亲子",
    "情侣",
    "闺蜜",
    "夫妻",
    "兄弟",
    "群像",
    "多人",
    "中年",
    "商务男",
    "霸总",
    "书店",
    "图书馆",
    "露台",
    "健身房",
  ] as const;
  const STEP3_SCHOOL_YOUTH_TOKENS = ["17岁", "18岁", "校园", "学姐", "学妹", "学生", "少女", "书卷气", "艺术"] as const;
  const STEP3_MOMMY_TOKENS = ["宝妈", "带娃", "亲子", "萌娃", "母女", "父子", "妈妈"] as const;
  const STEP3_STRONG_FEMALE_TOKENS = [
    "女生",
    "女孩",
    "女主",
    "少女",
    "甜妹",
    "辣妹",
    "女神",
    "学姐",
    "学妹",
    "她",
    "girl",
    "lady",
  ] as const;
  const STEP3_STRONG_MALE_TOKENS = [
    "男生",
    "男孩",
    "男主",
    "男神",
    "型男",
    "腹肌",
    "肌肉",
    "肌肉线条",
    "硬汉",
    "健身男",
    "他",
    "boy",
  ] as const;
  const STEP3_RELATION_MODE_TOKENS: ReadonlyArray<{ mode: Step3RelationMode; tokens: readonly string[] }> = [
    { mode: "couple", tokens: ["情侣", "cp", "男友", "女友", "夫妻", "老公", "老婆"] },
    { mode: "friends", tokens: ["闺蜜", "姐妹", "姐妹局"] },
    { mode: "family", tokens: ["亲子", "宝妈", "带娃", "萌娃", "母女", "父子"] },
    { mode: "brothers", tokens: ["兄弟", "哥们"] },
    { mode: "ensemble", tokens: ["群像", "多人", "多人出镜", "合拍", "众人"] },
  ];
  const STEP3_SENSITIVE_TOPIC_TOKENS = [
    "战争",
    "哀悼",
    "灾难",
    "事故",
    "领导人",
    "政治",
    "追悼",
    "国丧",
  ] as const;
  const STEP3_STRONG_MALE_PERSONA_TOKENS = [
    "男神",
    "型男",
    "腹肌",
    "肌肉",
    "肌肉线条",
    "硬汉",
    "健身",
    "健身房",
    "猛男",
  ] as const;
  const STEP3_MATURE_MALE_TOKENS = ["霸总", "商务男", "中年", "中年商务男", "成熟男"] as const;
  const STEP3_PROJECT_TEXT_NOISE_TOKENS = [
    "当前设定",
    "角色一致性",
    "人物状态",
    "整体提示词",
    "搭配参考",
    "参考锚点",
    "保持一致",
  ] as const;

  const resolveStep3SelectedRoleDirectionRecord = async (project: Project): Promise<Record<string, unknown> | null> => {
    // Workflow state no longer persisted - use project.selectedRoleDirection
    return project.selectedRoleDirection as Record<string, unknown> | null;
  };

  const collectStep3ReferenceAnchorLabels = async (project: Project): Promise<string[]> => {
    // Workflow state no longer persisted - check project characters
    const projectCharacters = await ctx.projectCharacterService.listByProjectId(project.id);
    if (projectCharacters.length > 0) {
      return ["定妆确认图"];
    }
    return [];
  };

  const sanitizeStep3RewriteText = (value: string | null | undefined, maxLength = 120): string | null => {
    const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
    if (!normalized) {
      return null;
    }
    return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3).trim()}...`;
  };

  const collectStep3TokenHits = (text: string, tokens: readonly string[]): string[] => {
    const lowered = text.toLowerCase();
    return [...new Set(tokens.filter((token) => lowered.includes(token.toLowerCase())))];
  };

  const extractStep3CoreFeaturesText = (value: string | null | undefined): string | null => {
    if (typeof value !== "string" || value.trim().length < 1) {
      return null;
    }
    const lines = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line) => !/step1搭配参考|full-body fashion styling photo|keep the same identity|body type|hairstyle|overall vibe/iu.test(line))
      .map((line) =>
        line
          .replace(/^(?:人物特征|后续定妆整体提示词|定妆整体提示词)\s*[:：]\s*/u, "")
          .trim(),
      )
      .filter((line) => line.length > 0);
    return sanitizeStep3RewriteText(lines.join("；"), 120);
  };

  const sanitizeStep3OutfitSummaryForRewrite = (value: string | null | undefined): string | null => {
    const normalized = sanitizeStep3RewriteText(value, 160);
    if (!normalized || normalized === "未指定搭配") {
      return null;
    }
    if (
      /\.(?:png|jpe?g|webp|gif|bmp|svg)\b/iu.test(normalized) ||
      /\b(?:top|bottom|dress|shoes|shoe|accessory|bag|hat)\s*:/iu.test(normalized)
    ) {
      return "延续已确认搭配";
    }
    return normalized;
  };

  const buildStep3SemanticText = (parts: Array<string | null | undefined>): string => {
    return parts
      .map((item) => sanitizeStep3RewriteText(item, 240))
      .filter((item): item is string => item !== null)
      .join("\n")
      .toLowerCase();
  };

  const extractStep3SemanticKeywords = (parts: Array<string | null | undefined>): string[] => {
    const semanticText = buildStep3SemanticText(parts);
    if (!semanticText) {
      return [];
    }
    return [...new Set(collectStep3TokenHits(semanticText, STEP3_SEMANTIC_ROLE_TOKENS).filter((token) => !STEP3_PROJECT_TEXT_NOISE_TOKENS.includes(token as never)))].slice(0, 8);
  };

  const resolveStep3RelationModeFromText = (text: string): Step3RelationMode | null => {
    for (const definition of STEP3_RELATION_MODE_TOKENS) {
      if (collectStep3TokenHits(text, definition.tokens).length > 0) {
        return definition.mode;
      }
    }
    return null;
  };

  const resolveStep3GenderAffinityFromText = (text: string): "male" | "female" | null => {
    const femaleHits = collectStep3TokenHits(text, STEP3_STRONG_FEMALE_TOKENS);
    const maleHits = collectStep3TokenHits(text, STEP3_STRONG_MALE_TOKENS);
    if (femaleHits.length > 0 && maleHits.length === 0) {
      return "female";
    }
    if (maleHits.length > 0 && femaleHits.length === 0) {
      return "male";
    }
    return null;
  };

  // UNUSED REMOVED: buildStep3CandidateSemanticText (TS6133, no callers)
  // (previously lines 1107-1131)
  const _buildStep3CandidateSemanticText_unused = (input: {
    title?: string | null;
    preview?: string | null;
    content?: string | null;
    labels?: readonly string[] | null;
    reverseSourceScriptText?: string | null;
    report?: Parameters<typeof mapReverseStoryboardReportToSegments>[0] | null;
    storyboardSegments?: Array<{ title: string; content: string; visualCue: string }> | null;
  }): string => {
    const reportSections = input.report?.sections?.map((section) => section.content) ?? [];
    const reportFrames =
      input.report?.frames?.flatMap((frame) => [frame.title, frame.narration, frame.visualCue, frame.notes ?? null]) ?? [];
    const segmentTexts =
      input.storyboardSegments?.flatMap((segment) => [segment.title, segment.content, segment.visualCue]) ?? [];
    return buildStep3SemanticText([
      input.title,
      input.preview,
      input.content ? stripHotTrendMetadata(input.content) || input.content : null,
      ...(input.labels ?? []),
      input.reverseSourceScriptText,
      ...reportSections,
      ...reportFrames,
      ...segmentTexts,
    ]);
  };

  const STEP3_SUBJECT_SIGNAL_TOKENS = [
    "主角",
    "她",
    "他",
    "女孩",
    "女生",
    "男生",
    "女主",
    "男主",
    "学姐",
    "学妹",
  ] as const;
  const STEP3_OUTFIT_RELEVANCE_TOKENS = [
    "衣",
    "服装",
    "穿搭",
    "外套",
    "风衣",
    "裙",
    "上衣",
    "裤",
    "鞋",
    "廓形",
    "垂坠",
    "质感",
    "层次",
  ] as const;

  const buildStep3CompactPersonaLabel = (profile: Step3ProjectMatchProfile): string | null => {
    const agePart = profile.age ? `${profile.age}岁` : "";
    const genderPart = profile.gender === "female" ? "女生" : profile.gender === "male" ? "男生" : "";
    const stylePart = profile.styleWords.slice(0, 2).join("");
    const rolePart = profile.roleTitle ?? "";
    return sanitizeStep3RewriteText(`${agePart}${genderPart}${stylePart}${rolePart}`.trim(), 24);
  };

  const resolveStep3NarrationSubjectLabel = (profile: Step3ProjectMatchProfile): string | null => {
    const roleTitle = String(profile.roleTitle ?? "").trim();
    if (profile.gender === "male") {
      if (/(少年|男孩)/u.test(roleTitle)) {
        return "少年";
      }
      return "男生";
    }
    if (profile.gender === "female") {
      if (/(少女|学姐|学妹|女孩)/u.test(roleTitle)) {
        return "少女";
      }
      return "女生";
    }
    return null;
  };

  const rewriteStep3NarrationForProfile = (
    narration: string,
    profile: Step3ProjectMatchProfile,
  ): string => {
    const normalizedNarration = sanitizeHotTrendNarrativeText(narration) || narration.trim();
    if (!normalizedNarration || !profile.gender) {
      return normalizedNarration;
    }
    const subjectLabel = resolveStep3NarrationSubjectLabel(profile);
    let rewritten = normalizedNarration;
    if (profile.gender === "male") {
      rewritten = rewritten
        .replace(/女主角|女主/u, "男主")
        .replace(/女生|女孩|少女|女子|女人|小姐姐/gu, subjectLabel ?? "男生")
        .replace(/博主她/gu, "博主他")
        .replace(/她(?!们)/gu, "他");
    } else if (profile.gender === "female") {
      rewritten = rewritten
        .replace(/男主角|男主/u, "女主")
        .replace(/男生|男孩|少年|男子|男人|小哥哥/gu, subjectLabel ?? "女生")
        .replace(/博主他/gu, "博主她")
        .replace(/他(?!们)/gu, "她");
    }
    return sanitizeHotTrendNarrativeText(rewritten) || rewritten;
  };

  const hasStep3SubjectSignal = (text: string): boolean => collectStep3TokenHits(text, STEP3_SUBJECT_SIGNAL_TOKENS).length > 0;

  const shouldKeepStep3OutfitPhrase = (text: string, outfitPhrase: string | null): boolean => {
    if (!outfitPhrase || outfitPhrase === "延续已确认搭配") {
      return false;
    }
    return collectStep3TokenHits(text, STEP3_OUTFIT_RELEVANCE_TOKENS).length > 0;
  };

  const compactStep3PromptParts = (parts: Array<string | null | undefined>): string[] => {
    const normalized = parts
      .map((item) => sanitizeStep3RewriteText(item, 120))
      .filter((item): item is string => item !== null)
      .map((item) => item.replace(/^画面\s*[:：]\s*/u, "").replace(/[；;。]+$/u, "").trim())
      .filter((item) => item.length > 0);
    const result: string[] = [];
    for (const part of normalized) {
      if (result.some((existing) => existing === part || existing.includes(part) || part.includes(existing))) {
        continue;
      }
      result.push(part);
    }
    return result;
  };

  const extractStep3OutfitKeywords = (outfitSummary: string | null | undefined): string[] => {
    const source = sanitizeStep3RewriteText(outfitSummary, 200) ?? "";
    if (!source) {
      return [];
    }
    const keywords = new Set<string>();
    const matches = source.matchAll(STEP3_OUTFIT_KEYWORD_PATTERN);
    for (const match of matches) {
      const keyword = String(match[0] ?? "").trim();
      if (keyword.length > 1) {
        keywords.add(keyword);
      }
    }
    return [...keywords].slice(0, 6);
  };

  const resolveStep3ProjectProtagonistDescriptor = async (project: Project): Promise<string> => {
    const selectedCardRecord = await resolveStep3SelectedRoleDirectionRecord(project);
    if (!selectedCardRecord) {
      return "主角";
    }
    const directionId = String(selectedCardRecord.directionId ?? "").trim();
    const genderRaw = String(selectedCardRecord.gender ?? "").trim().toLowerCase();
    const ageRaw = Number(selectedCardRecord.age);
    const age = Number.isFinite(ageRaw) && ageRaw > 0 ? Math.floor(ageRaw) : null;
    const styleWords = Array.isArray(selectedCardRecord.styleWords)
      ? selectedCardRecord.styleWords
          .map((item) => String(item ?? "").trim())
          .filter((item) => item.length > 0)
          .slice(0, 3)
      : [];
    const genderLabel =
      genderRaw === "female" ? "女生" : genderRaw === "male" ? "男生" : "";
    const head = `${age ? `${age}岁` : ""}${genderLabel}${directionId}`.trim() || directionId || "主角";
    return styleWords.length > 0 ? `${head}（${styleWords.join("、")}）` : head;
  };

  const resolveStep3ProjectMatchProfile = async (project: Project): Promise<Step3ProjectMatchProfile> => {
    const selectedCardRecord = await resolveStep3SelectedRoleDirectionRecord(project);
    const roleTitle = selectedCardRecord ? sanitizeStep3RewriteText(String(selectedCardRecord.directionId ?? ""), 48) : null;
    const genderRaw = selectedCardRecord ? String(selectedCardRecord.gender ?? "").trim().toLowerCase() : "";
    const gender = genderRaw === "female" ? "female" : genderRaw === "male" ? "male" : null;
    const ageRaw = selectedCardRecord ? Number(selectedCardRecord.age) : Number.NaN;
    const age = Number.isFinite(ageRaw) && ageRaw > 0 ? Math.floor(ageRaw) : null;
    const styleWords = selectedCardRecord && Array.isArray(selectedCardRecord.styleWords)
      ? selectedCardRecord.styleWords
          .map((item) => sanitizeStep3RewriteText(String(item ?? ""), 20))
          .filter((item): item is string => item !== null)
          .slice(0, 4)
      : [];
    const coreFeaturesText = extractStep3CoreFeaturesText(null);
    const outfitSummary = sanitizeStep3OutfitSummaryForRewrite(await buildOutfitContextSummary(ctx, project.id));
    const outfitKeywords = extractStep3OutfitKeywords(outfitSummary);
    const referenceAnchors = await collectStep3ReferenceAnchorLabels(project);
    const protagonistDescriptor = await resolveStep3ProjectProtagonistDescriptor(project);
    const semanticText = buildStep3SemanticText([roleTitle, protagonistDescriptor, ...styleWords, coreFeaturesText, outfitSummary]);
    const semanticKeywords = extractStep3SemanticKeywords([roleTitle, protagonistDescriptor, ...styleWords, coreFeaturesText]);
    const relationMode =
      resolveStep3RelationModeFromText(semanticText) ??
      ((roleTitle || gender || age || styleWords.length > 0) ? "single" : null);
    const schoolYouthSignals = collectStep3TokenHits(semanticText, STEP3_SCHOOL_YOUTH_TOKENS);
    const mommySignals = collectStep3TokenHits(semanticText, STEP3_MOMMY_TOKENS);
    const profileHash = createHash("sha1")
      .update(
        JSON.stringify({
          protagonistDescriptor,
          roleTitle,
          gender,
          age,
          styleWords,
          coreFeaturesText,
          outfitSummary,
          outfitKeywords,
          referenceAnchors,
          semanticKeywords,
          relationMode,
        }),
      )
      .digest("hex");
    const hasSignals = Boolean(
      roleTitle ||
        styleWords.length > 0 ||
        coreFeaturesText ||
        outfitSummary ||
        referenceAnchors.length > 0,
    );
    return {
      protagonistDescriptor,
      roleTitle,
      gender,
      age,
      styleWords,
      coreFeaturesText,
      outfitSummary,
      outfitKeywords,
      referenceAnchors,
      semanticKeywords,
      semanticText,
      relationMode,
      schoolYouthSignals,
      mommySignals,
      profileHash,
      hasSignals,
    };
  };

  const computeStep3CandidateMatchMeta = (
    profile: Step3ProjectMatchProfile,
    candidate: Pick<ScriptCandidateEntity, "title" | "preview" | "content" | "labels" | "strategyType"> & {
      semanticText?: string | null;
    },
  ): Step3CandidateMatchMeta => {
    if (!profile.hasSignals) {
      return {
        matchScore: 0,
        matchReasons: ["当前项目缺少足够的角色/定妆信号，候选按热榜优先级排序。"],
        matchBlocked: false,
        matchBlockedReason: null,
      };
    }
    const textSource = buildStep3SemanticText([
      candidate.title,
      candidate.preview,
      candidate.content,
      ...(Array.isArray(candidate.labels) ? candidate.labels : []),
      candidate.semanticText ?? null,
    ]);
    const styleHits = profile.styleWords.filter((item) => textSource.includes(item.toLowerCase()));
    const outfitHits = profile.outfitKeywords.filter((item) => textSource.includes(item.toLowerCase()));
    const semanticHits = profile.semanticKeywords.filter((item) => textSource.includes(item.toLowerCase()));
    const femaleHits = collectStep3TokenHits(textSource, STEP3_STRONG_FEMALE_TOKENS);
    const maleHits = collectStep3TokenHits(textSource, STEP3_STRONG_MALE_TOKENS);
    const candidateGenderAffinity = resolveStep3GenderAffinityFromText(textSource);
    const candidateRelationMode = resolveStep3RelationModeFromText(textSource);
    const sensitiveHits = collectStep3TokenHits(textSource, STEP3_SENSITIVE_TOPIC_TOKENS);
    const strongMalePersonaHits = collectStep3TokenHits(textSource, STEP3_STRONG_MALE_PERSONA_TOKENS);
    const matureMaleHits = collectStep3TokenHits(textSource, STEP3_MATURE_MALE_TOKENS);
    const candidateSchoolYouthHits = collectStep3TokenHits(textSource, STEP3_SCHOOL_YOUTH_TOKENS);

    if (sensitiveHits.length > 0) {
      return {
        matchScore: 0,
        matchReasons: [`候选命中敏感题材：${sensitiveHits.join("、")}。`],
        matchBlocked: true,
        matchBlockedReason: `候选命中敏感题材：${sensitiveHits.join("、")}。`,
      };
    }
    if (profile.gender === "female" && candidateGenderAffinity === "male") {
      const maleReasonTokens = maleHits.length > 0 ? maleHits : strongMalePersonaHits;
      return {
        matchScore: 0,
        matchReasons: [`候选出现男性强原型：${maleReasonTokens.join("、")}。`],
        matchBlocked: true,
        matchBlockedReason: `候选出现男性强原型：${maleReasonTokens.join("、")}，与当前女性主角冲突。`,
      };
    }
    if (profile.gender === "male" && candidateGenderAffinity === "female") {
      return {
        matchScore: 0,
        matchReasons: [`候选出现女性强原型：${femaleHits.join("、")}。`],
        matchBlocked: true,
        matchBlockedReason: `候选出现女性强原型：${femaleHits.join("、")}，与当前男性主角冲突。`,
      };
    }
    if (profile.relationMode === "single" && candidateRelationMode && candidateRelationMode !== "single") {
      return {
        matchScore: 0,
        matchReasons: [`候选为${candidateRelationMode}关系脚本，不适合当前单主角项目。`],
        matchBlocked: true,
        matchBlockedReason: `候选为${candidateRelationMode}关系脚本，不适合当前单主角项目。`,
      };
    }
    if (profile.schoolYouthSignals.length > 0 && (strongMalePersonaHits.length > 0 || matureMaleHits.length > 0)) {
      const conflictTokens = [...new Set([...strongMalePersonaHits, ...matureMaleHits])];
      return {
        matchScore: 0,
        matchReasons: [`候选人物原型冲突：${conflictTokens.join("、")}。`],
        matchBlocked: true,
        matchBlockedReason: `候选人物原型冲突：${conflictTokens.join("、")}，与当前校园少女/学姐画像不兼容。`,
      };
    }
    if (profile.mommySignals.length > 0 && candidateSchoolYouthHits.length > 0) {
      return {
        matchScore: 0,
        matchReasons: [`候选偏少女校园语义：${candidateSchoolYouthHits.join("、")}。`],
        matchBlocked: true,
        matchBlockedReason: `候选偏少女校园语义：${candidateSchoolYouthHits.join("、")}，与当前宝妈/亲子画像冲突。`,
      };
    }

    const genderCompatible =
      profile.gender === "female"
        ? candidateGenderAffinity === "female"
        : profile.gender === "male"
          ? candidateGenderAffinity === "male"
          : false;
    let score = 0.18;
    if (semanticHits.length > 0) {
      score += Math.min(0.34, semanticHits.length * 0.11);
    }
    if (styleHits.length > 0) {
      score += Math.min(0.24, styleHits.length * 0.1);
    }
    if (outfitHits.length > 0) {
      score += Math.min(0.14, outfitHits.length * 0.07);
    }
    if (genderCompatible) {
      score += 0.08;
    }
    if (profile.relationMode && candidateRelationMode && profile.relationMode === candidateRelationMode) {
      score += 0.06;
    }
    if (candidate.strategyType === "library") {
      score += 0.04;
    }
    const matchReasons: string[] = [];
    if (semanticHits.length > 0) {
      matchReasons.push(`命中人物/场景语义：${semanticHits.join("、")}。`);
    }
    if (styleHits.length > 0) {
      matchReasons.push(`命中角色风格：${styleHits.join("、")}。`);
    }
    if (outfitHits.length > 0) {
      matchReasons.push(`命中服饰锚点：${outfitHits.join("、")}。`);
    }
    if (genderCompatible) {
      matchReasons.push(`命中角色性别语义：${profile.gender === "female" ? "女性向" : "男性向"}表述。`);
    }
    if (matchReasons.length < 1) {
      matchReasons.push("个性化命中较弱，当前以热榜优先级兜底排序。");
    }
    return {
      matchScore: Math.max(0, Math.min(0.98, Math.round(score * 1000) / 1000)),
      matchReasons: matchReasons.slice(0, 3),
      matchBlocked: false,
      matchBlockedReason: null,
    };
  };

  const buildStep3AppliedCandidateSegments = async (input: {
    candidate: ScriptCandidateEntity;
  }): Promise<Array<{ title: string; content: string; visualCue: string; visualPrompt: string }>> => {
    return (
      Array.isArray(input.candidate.storyboardSegments) && input.candidate.storyboardSegments.length > 0
        ? input.candidate.storyboardSegments.filter((seg) => seg !== null).map((segment) => ({
            title: segment.title,
            content: segment.content,
            visualCue: segment.visualCue,
            visualPrompt: segment.visualPrompt || segment.visualCue,
          }))
        : []
    )
      .slice(0, HOT_TREND_STEP3_MAX_STORYBOARD_SEGMENTS)
      .map((segment, index) =>
        normalizeStep3StoryboardSegmentForImport(
          {
            title: segment.title,
            content: segment.content,
            visualCue: segment.visualCue,
            visualPrompt: segment.visualPrompt || segment.visualCue,
          },
          index,
        ),
      );
  };

  const persistStep3RewriteResultToProjectData = async (input: {
    project: Project;
    ownerUser: User;
    snapshotId: string;
    candidate: ScriptCandidateEntity;
    originalSegments: Array<{ title: string; content: string; visualCue: string; visualPrompt: string }>;
    rewrittenSegments: Array<{ title: string; content: string; visualCue: string; visualPrompt: string }>;
    rewriteVersion: string;
    profileHash: string;
    personalizationApplied: boolean;
  }): Promise<void> => {
    // Workflow state no longer persisted - no-op
  };

  const extractStep3SceneSettingMapFromContent = (
    content: string,
  ): Partial<Record<"主场景" | "辅助场景" | "时间" | "天气" | "氛围", string>> => {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const sceneMap: Partial<Record<"主场景" | "辅助场景" | "时间" | "天气" | "氛围", string>> = {};
    const validLabels = new Set(["主场景", "辅助场景", "时间", "天气", "氛围"]);
    let sceneStartIndex = -1;
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index]?.startsWith("场景设定")) {
        sceneStartIndex = index;
        break;
      }
    }
    if (sceneStartIndex < 0) {
      return sceneMap;
    }
    for (let index = sceneStartIndex + 1; index < lines.length; index += 1) {
      const line = lines[index]!;
      if (/^(?:#|分镜表|抖音标题|封面文案|角色设定表|服装设定表)/u.test(line)) {
        break;
      }
      const normalized = line.replace(/^(?:[-*•·]|\d+[.)、]|[（(]?\d+[）)])\s*/u, "").trim();
      const matched = normalized.match(/^([^：:]{1,6})[：:]\s*(.+)$/u);
      if (!matched || !matched[1] || !matched[2]) {
        continue;
      }
      const key = matched[1].trim();
      const value = matched[2].trim();
      if (!validLabels.has(key) || !value) {
        continue;
      }
      sceneMap[key as "主场景" | "辅助场景" | "时间" | "天气" | "氛围"] = value;
    }
    return sceneMap;
  };

  const enrichStep3SegmentsForSoftAd = async (
    project: Project,
    candidateContent: string,
    segments: Array<{ title: string; content: string; visualCue: string; visualPrompt: string }>,
  ): Promise<Array<{ title: string; content: string; visualCue: string; visualPrompt: string }>> => {
    const protagonist = await resolveStep3ProjectProtagonistDescriptor(project);
    const sceneMap = extractStep3SceneSettingMapFromContent(candidateContent);
    const mainScene = sceneMap["主场景"] ?? "城市日常生活主场景";
    const supportScene = sceneMap["辅助场景"] ?? "街角步行道与门店内景";
    const time = sceneMap["时间"] ?? "下午 16:00-18:00";
    const weather = sceneMap["天气"] ?? "晴到多云，自然柔光";
    const atmosphere = sceneMap["氛围"] ?? "真实、轻叙事、清新节奏";
    const sceneCandidates = Array.from(
      new Set(
        [mainScene, ...supportScene.split(/[、,，/]/u).map((item) => item.trim()).filter((item) => item.length > 0)]
          .map((item) => sanitizeHotTrendNarrativeText(item))
          .filter((item) => item.length > 0),
      ),
    );
    const shotPlan = [
      { lens: "远景", movement: "轻推", action: "进入画面并观察环境" },
      { lens: "中景", movement: "跟拍", action: "走动并调整造型细节" },
      { lens: "近景", movement: "平移", action: "完成动作衔接与表情变化" },
      { lens: "特写", movement: "缓推", action: "抬手整理衣摆与配饰" },
      { lens: "半身", movement: "环绕", action: "停步回望并完成情绪收束" },
    ] as const;
    return segments.map((segment, index) => {
      const baseContent = sanitizeHotTrendNarrativeText(segment.content.trim()) || `镜头 ${index + 1} 内容待补充`;
      const stageScene = sceneCandidates[index % Math.max(1, sceneCandidates.length)] ?? mainScene;
      const stagePlan = shotPlan[index % shotPlan.length]!;
      const leadIn =
        index === 0
          ? `${protagonist}出现在${stageScene}，${time}，${weather}。`
          : index === segments.length - 1
            ? `${protagonist}在${stageScene}收束动作与情绪。`
            : `${protagonist}转入${stageScene}继续推进动作。`;
      const content = sanitizeHotTrendNarrativeText(`${leadIn}${baseContent}`);
      const visualSeed = sanitizeHotTrendNarrativeText(segment.visualCue.trim()) || `画面：${baseContent.slice(0, 56)}`;
      const visualNarrative = sanitizeHotTrendNarrativeText(visualSeed.replace(/^画面[:：]\s*/u, ""));
      const visualContext = sanitizeHotTrendNarrativeText(
        `画面：${stageScene}；${stagePlan.lens}${stagePlan.movement}；${protagonist}${stagePlan.action}；${visualNarrative || baseContent.slice(0, 36)}；氛围${atmosphere}。`,
      );
      return {
        ...segment,
        content,
        visualCue: visualContext,
        visualPrompt: visualContext,
      };
    });
  };

  const STEP3_PROJECT_STORYBOARD_MIRROR_TAG_PREFIX = "#project_storyboard_mirror:";
  const buildStep3ProjectStoryboardMirrorTag = (projectId: string): string =>
    `${STEP3_PROJECT_STORYBOARD_MIRROR_TAG_PREFIX}${projectId}`;
  const STEP3_CONFIRMED_IMPORT_TAG = "#step3_confirmed_import";

  const buildStep3ProjectStoryboardMirrorContent = (input: {
    project: Project;
    candidate: ScriptCandidateEntity;
    scriptSegments: Array<{ title: string; content: string; visualCue: string; visualPrompt: string }>;
  }): string => {
    const lines = [
      `脚本标题：${input.candidate.title}`,
      `时长：${input.candidate.durationSec}s`,
      "",
      ...input.scriptSegments.flatMap((segment, index) => {
        const rawLines = String(segment.content ?? "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
        const narrationRaw =
          rawLines.find((line) => !/^画面\s*[:：]/u.test(line)) ?? String(segment.content ?? "").trim();
        const narration = narrationRaw.replace(/^旁白\s*[:：]\s*/u, "").trim();
        const visualRaw =
          rawLines.find((line) => /^画面\s*[:：]/u.test(line)) ??
          `画面：${String(segment.visualCue ?? "").trim() || narration.slice(0, 56)}`;
        const visual = visualRaw.replace(/^画面\s*[:：]\s*/u, "").trim();
        return [
          `镜头 ${index + 1}：${segment.title}`,
          `旁白：${narration || "（待补充）"}`,
          `画面：${visual || "（待补充）"}`,
          "",
        ];
      }),
      "# 热榜元数据",
      `- 来源类型: ${input.candidate.strategyType}`,
      `- 候选ID: ${input.candidate.candidateId}`,
      `- 项目ID: ${input.project.id}`,
    ];
    return lines.join("\n").trim();
  };

  const upsertStep3ProjectStoryboardMirror = async (input: {
    project: Project;
    ownerUser: User;
    candidate: ScriptCandidateEntity;
    scriptSegments: Array<{ title: string; content: string; visualCue: string; visualPrompt: string }>;
  }): Promise<void> => {
    if (!Array.isArray(input.scriptSegments) || input.scriptSegments.length < 1) {
      return;
    }
    const mirrorTag = buildStep3ProjectStoryboardMirrorTag(input.project.id);
    const existing = (await ctx.reverseStoryboardLibraryService
      .list(input.ownerUser))
      .find((item) => item.tags.includes(mirrorTag));
    const content = buildStep3ProjectStoryboardMirrorContent(input);
    const report = mapRawReverseStoryboardReport(content);
    const summaryCandidate = input.scriptSegments[0]?.content?.trim() || (input.candidate.preview ?? "").trim();
    const summary = summaryCandidate.length > 0 ? summaryCandidate.slice(0, 120) : `${input.project.name} 分镜已确认`;
    const labelTags = (input.candidate.labels ?? [])
      .map((item) => String(item ?? "").trim())
      .filter((item) => item.length > 0)
      .slice(0, 4)
      .map((item) => (item.startsWith("#") ? item : `#${item}`));
    const nextTags = [
      ...new Set([
        "#我的分镜库",
        "#项目分镜",
        STEP3_CONFIRMED_IMPORT_TAG,
        mirrorTag,
        `#project:${input.project.id}`,
        ...labelTags,
      ]),
    ];
    const sourceMeta = {
      videoUrl: null,
      filename: `project-${input.project.id}-step3-storyboard.md`,
      mimeType: "text/markdown",
      duration: Number.isFinite(input.candidate.durationSec) ? Number(input.candidate.durationSec) : null,
    };
    if (!existing) {
      await ctx.reverseStoryboardLibraryService.create(input.ownerUser, {
        title: `${input.project.name} · ${input.candidate.title}`.slice(0, 80),
        summary,
        tags: nextTags,
        sourceType: "upload_file",
        sourceMeta,
        report,
        content,
      });
      return;
    }
    await ctx.reverseStoryboardLibraryService.update(input.ownerUser, existing.id, {
      title: `${input.project.name} · ${input.candidate.title}`.slice(0, 80),
      summary,
      tags: nextTags,
      sourceMeta,
      report,
      content,
    });
  };

  const persistStep3CandidateSnapshotAndScript = async (
    project: Project,
    ownerUser: User,
    snapshot: Step3ScriptCandidateSnapshot,
    scriptSegments?: Array<{ title: string; content: string; visualCue: string; visualPrompt: string }>,
  ): Promise<void> => {
    // Workflow state no longer persisted - no-op
  };

  const mapStep3SnapshotResponse = (snapshot: Step3ScriptCandidateSnapshot) => ({
    snapshotId: snapshot.snapshotId,
    promptVersion: snapshot.promptVersion,
    lockState: snapshot.lockState,
    lockVersion: snapshot.lockVersion,
    generationMode: snapshot.generationMode,
    selectedCandidateId: snapshot.selectedCandidateId,
    confirmedCandidateId: snapshot.confirmedCandidateId,
    items: snapshot.items,
  });

  const generateSingleStep3FramePreview = async (
    project: Project,
    user: User,
    input: {
      frameIndex: number;
      title: string;
      prompt: string;
      /** 角色参考图（五视图） */
      characterReferenceImages: string[];
      /** 服饰参考图（平铺图） */
      garmentReferenceImages: string[];
      generationRatio: JimengImageRatio;
      generationResolution: JimengImageResolution;
      count: number;
    },
  ): Promise<{
    result: Step3FramePreviewResult;
    debugPrompts: Array<{
      index: number;
      title: string;
      prompt: string;
    }>;
  }> => {
    const index = Math.max(1, Math.floor(input.frameIndex));
    const title = input.title?.trim() || `镜头 ${index}`;
    const prompt = input.prompt?.trim() || `${title} 场景参考图`;
    if (!input.garmentReferenceImages || input.garmentReferenceImages.length < 1) {
      throw new AppError(400, "GARMENT_REFERENCE_REQUIRED", "生成分镜预览图至少需要 1 张服饰平铺图");
    }
    if (!input.characterReferenceImages || input.characterReferenceImages.length < 1) {
      throw new AppError(400, "CHARACTER_REFERENCE_REQUIRED", "生成分镜预览图至少需要 1 张角色五视图");
    }
    // 直接使用参考图 URL（已从数据库获取，无需重复持久化）
    const frameGenerationInput = normalizeStep3StoryboardFrameGenerationInput({
      visualPrompt: prompt,
      garmentReferenceImages: input.garmentReferenceImages,
      characterReferenceImages: input.characterReferenceImages,
    });
    const generationRequest = buildStep3StoryboardFrameGenerationRequest(frameGenerationInput);

    // 根据角色年龄选择对应的 RouteKey（用于积分扣除）
    const roleAge = project.selectedRoleDirection?.age;
    const storyboardImageRouteKey = selectRouteKeyByAge(
      roleAge != null ? Number(roleAge) : null,
      ProviderRouteKeys.STEP3_STORYBOARD_IMAGE_CHILD,
      ProviderRouteKeys.STEP3_STORYBOARD_IMAGE_ADULT,
    );

    const routeKeys: ProviderRouteKey[] = [storyboardImageRouteKey];
    const imageRoute = await resolveRouteProviderWithFallback(ctx, routeKeys);
    if (!imageRoute) {
      throw new AppError(
        400,
        "PROVIDER_POLICY_MISSING",
        generationRequest.mode === "image_to_image"
          ? "image_to_image provider is not configured"
          : "text_to_image provider is not configured",
      );
    }
    const candidates = await (async () => {
      try {
        const result = await requestLlmImageGenerationUrls(imageRoute.provider, generationRequest.prompt, {
          mode: generationRequest.mode,
          images: generationRequest.images ? [...generationRequest.images] : [],
          negativePrompt: generationRequest.negativePrompt,
          ratio: input.generationRatio,
          resolution: input.generationResolution,
          count: input.count,
          debugOptions: {
            ctx,
            routeKey: imageRoute.routeKey,
            businessContext: "Step3 帧预览图片生成",
            userId: user.id,
            projectId: project.id,
          },
        });
        return result.urls;
      } catch (error) {
        if (generationRequest.mode === "image_to_image") {
          app.log.warn(
            {
              err: error,
              projectId: project.id,
              routeKey: imageRoute.routeKey,
              index,
            },
            "step3 frame-preview image_to_image failed, text_to_image fallback disabled",
          );
        }
        throw error;
      }
    })();
    const persistedCandidates: string[] = [];
    for (const [candidateIndex, candidateUrl] of candidates.entries()) {
      // 火山引擎豆包返回的 TOS URL 是临时的、会过期，必须立即转存到自己的 OSS
      // 转存失败直接报错，不允许静默 fallback 到原始 URL
      const persisted = await persistImageSourceToStorage(
        ctx,
        candidateUrl,
        `projects/${project.id}/step3/frame-${index}/generated-candidates/candidate-${candidateIndex + 1}`,
        { persistRemote: true, optimize: true },
      );
      const normalized = sanitizeUrlField(persisted) ?? sanitizeUrlField(candidateUrl);
      if (!normalized) {
        throw new AppError(
          502,
          "IMAGE_OSS_PERSISTENCE_FAILED",
          `分镜预览图转存 OSS 失败：projectId=${project.id}; frameIndex=${index}; candidateIndex=${candidateIndex + 1}`,
        );
      }
      if (!persistedCandidates.includes(normalized)) {
        persistedCandidates.push(normalized);
      }
    }
    if (persistedCandidates.length < 1) {
      throw new AppError(
        502,
        "IMAGE_ASSET_PERSISTENCE_FAILED",
        `step3 frame-preview candidates are not persistable: projectId=${project.id}; frameIndex=${index}`,
      );
    }
    return {
      result: {
        index,
        title,
        prompt,
        candidates: persistedCandidates,
      },
      debugPrompts: [
        {
          index,
          title,
          prompt,
        },
      ],
    };
  };

  const resolveStep3FramePreviewResultFromWorkflowState = async (
    projectId: string,
    frameIndex: number,
  ): Promise<Step3FramePreviewResult | null> => {
    // Workflow state no longer persisted - return null
    return null;
  };

  /**
   * 更新候选快照状态（只更新状态字段，不重建完整 items）
   * 用于 select/confirm API，避免每次状态更新都需要批量查询
   */
  const updateStep3CandidateSnapshotState = async (
    project: Project,
    ownerUser: User,
    updates: {
      lockState: Step3CandidateLockState;
      selectedCandidateId?: string | null;
      confirmedCandidateId?: string | null;
      expectedLockVersion?: number;
    },
  ): Promise<Step3ScriptCandidateSnapshot | null> => {
    // Workflow state no longer persisted - return null
    return null;
  };

  // ===========================================================================
  // 返回所有辅助函数
  // ===========================================================================
  return {
    step3FrameImagesDb,
    upsertProjectWorkflowStateProjectData,
    readStep3CandidateSnapshotForProject,
    persistStep3CandidateSnapshotForProject,
    reconstructSnapshotFromRef,
    convertPayloadToSnapshotItem,
    persistStep3CandidateSnapshotRefForProject,
    mergeStep3CandidateSnapshotItems,
    splitStep3CandidateContentToSegments,
    normalizeStep3StoryboardSegmentForImport,
    buildStep3AppliedCandidateSegments,
    persistStep3RewriteResultToProjectData,
    enrichStep3SegmentsForSoftAd,
    upsertStep3ProjectStoryboardMirror,
    persistStep3CandidateSnapshotAndScript,
    mapStep3SnapshotResponse,
    generateSingleStep3FramePreview,
    resolveStep3FramePreviewResultFromWorkflowState,
    updateStep3CandidateSnapshotState,
  };
}

/** createStep3Helpers 返回值类型，供 route 模块引用 */
export type Step3Helpers = ReturnType<typeof createStep3Helpers>;
