/**
 * 脚本生成器
 *
 * 借鉴 BettaFish 的核心逻辑：
 * 1. 热点匹配：从热点资产中提取最佳匹配
 * 2. LLM 内容生成：让 LLM 基于服饰资产、角色信息和热点创作完整脚本
 * 3. 反思迭代：评估质量，优化脚本
 */

import type { Pool } from "pg";
import type {
  OutfitAssetInput,
  CharacterInfoInput,
  HotTrendAssetSnapshot,
  VideoScriptPayload,
  ScriptDataRecord,
  ScriptGenerationInput,
  RoleDirectionInput,
} from "./types.js";
import type { ShotSubject } from "../../contracts/shot-breakdown-contract.js";
import { ScriptType } from "../../contracts/types.js";
import { skillLoader } from "../../services/skills/index.js";
import { selectNarrativeIdentity } from "../video-step/shared/narrative-identity.js";
import { getLogger } from "../../core/logger/index.js";
import { ProviderRouteKeys } from "../../contracts/provider-route-keys.js";
import { extractJsonObject } from "../../services/utils/json-utils.js";

const logger = getLogger("script-effectiveness");

/** 提示词模板 code */
const PROMPT_CODE_EFFECTIVENESS = "script_effectiveness_generation";

/** 脚本生成器依赖 */
export interface ScriptGeneratorDeps {
  pool: Pool | null;
  repos?: { scriptData: import("../../repositories/pg/script-data-pg-repository.js").PgScriptDataRepository };
  /** 调用 LLM，systemPrompt 为规则，userPrompt 为数据+格式 */
  requestLlmPlainText: (systemPrompt: string, userPrompt: string) => Promise<string>;
  generateId: () => string;
}

/** 分类展示名映射 */
const CATEGORY_DISPLAY: Record<string, string> = {
  top: "上装",
  bottom: "下装",
  shoes: "鞋履",
  accessory: "配饰",
  outfit: "穿搭",
  video: "视频",
};

/** 单视角评估结果 */
interface PerspectiveResult {
  score: number;
  perspective: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}

/** effectiveness 策略不再使用迭代评分循环，一次性生成后由异步评分守护进程评分 */

// =====================================================
// LLM 脚本生成 prompt 构建
// =====================================================

/**
 * 构建服饰资产描述文本
 */
function buildAssetDescription(assets: OutfitAssetInput[]): string {
  return assets
    .map((a) => {
      const category = CATEGORY_DISPLAY[a.category] ?? a.category;
      const parts: string[] = [category];
      if (a.style) parts.push(a.style);
      if (a.description) parts.push(a.description);
      if (a.occasion) parts.push(`适用场景：${a.occasion}`);
      if (a.classification?.reason) parts.push(a.classification.reason);
      return `- ${a.name}（${parts.join("，")}）`;
    })
    .join("\n");
}

/**
 * 构建角色信息描述文本
 */
function buildCharacterDescription(characters: CharacterInfoInput[]): string {
  return characters
    .map((c) => {
      const parts: string[] = [c.name];
      if (c.gender) parts.push(`性别：${c.gender}`);
      if (c.age) parts.push(`年龄段：${c.age}`);
      if (c.style) parts.push(`风格：${c.style}`);
      if (c.bodyType) parts.push(`体型：${c.bodyType}`);
      if (c.hairStyle) parts.push(`发型：${c.hairStyle}`);
      if (c.skinTone) parts.push(`肤色：${c.skinTone}`);
      if (c.uniqueFeatures) parts.push(`独特特征：${c.uniqueFeatures}`);
      if (c.tags.length > 0) parts.push(`标签：${c.tags.join("、")}`);
      return parts.join("，");
    })
    .join("\n");
}

/**
 * 构建热点信息描述文本
 */
function buildTrendDescription(trend: HotTrendAssetSnapshot | null): string {
  if (!trend) return "无特定热点话题，请自由创作。";
  const parts: string[] = [
    `热点话题：「${trend.title}」`,
    `关键词：${trend.keywords.join("、")}`,
    `标签：${trend.labels.join("、")}`,
  ];
  if (trend.scriptTitle) {
    parts.push(`参考脚本标题：${trend.scriptTitle}`);
  }
  if (trend.scriptContent) {
    parts.push(`参考脚本摘要：${trend.scriptContent.slice(0, 200)}`);
  }
  return parts.join("\n");
}

/**
 * 构建反思建议文本
 */
function buildReflectionNotes(notes: string[]): string {
  if (notes.length === 0) return "";
  return `\n【上一轮改进建议】\n${notes.map((n, i) => `${i + 1}. ${n}`).join("\n")}\n请在本次生成中落实以上改进建议。`;
}

/**
 * 构建热点描述文本
 */

// =====================================================
// LLM 响应解析
// =====================================================

/**
 * 解析 LLM 返回的脚本生成结果，使用 extractJsonObject 提供更好的容错能力
 */
function parseGenerationResponse(text: string): VideoScriptPayload | null {
  const parsed = extractJsonObject(text);
  if (!parsed) {
    const snippet = text.trim().slice(0, 500);
    logger.warn(
      { routeKey: ProviderRouteKeys.SCRIPT_EFFECTIVENESS_GENERATION },
      `Failed to parse LLM response as JSON. Raw snippet: ${snippet}`
    );
    return null;
  }

  // 基础结构校验
  if (!parsed.video_info && !parsed.video_analysis) {
    logger.warn({ routeKey: ProviderRouteKeys.SCRIPT_EFFECTIVENESS_GENERATION }, "ScriptGenerator LLM response missing video_info and video_analysis");
    return null;
  }

  // 规范化分镜数据
  const rawShotBreakdown = parsed.shot_breakdown as unknown as Array<Record<string, unknown>> | undefined;
  const shotBreakdown = (rawShotBreakdown || []).map(
    (shot: Record<string, unknown>, index: number) => ({
      shot_id: typeof shot.shot_id === "number" ? shot.shot_id : index + 1,
      timecode: shot.timecode as Record<string, unknown>,
      shot_type: shot.shot_type as string,
      camera_movement: shot.camera_movement as string,
      transition_in: shot.transition_in as Record<string, unknown>,
      transition_out: shot.transition_out as Record<string, unknown>,
      visual: shot.visual as Record<string, unknown>,
      subjects: shot.subjects as ShotSubject[] | undefined,
      audio: shot.audio as Record<string, unknown>,
      shot_description: shot.shot_description as string,
    }),
  );

  return {
    video_info: parsed.video_info as VideoScriptPayload["video_info"],
    video_analysis: parsed.video_analysis as VideoScriptPayload["video_analysis"],
    shot_breakdown: shotBreakdown,
    editing_analysis: parsed.editing_analysis as VideoScriptPayload["editing_analysis"],
  };
}

export class ScriptGenerator {
  constructor(private readonly deps: ScriptGeneratorDeps) {}

  /**
   * 生成脚本（一次性生成，评分由异步守护进程处理）
   *
   * 原设计：同步 LLM 评分循环（最多 3 轮），阻塞用户等待
   * 新设计：匹配最佳热点 → LLM 一次性生成 → 立即返回
   *         评分由 ScriptQualityScoringDaemon 异步完成
   */
  async generate(input: ScriptGenerationInput): Promise<ScriptDataRecord> {
    // 获取热点资产并按匹配度排序
    const hotTrends = await this.fetchHotTrends();
    const allKeywords = [
      ...this.extractAssetKeywords(input.assets),
      ...this.extractCharacterKeywords(input.characters),
    ];
    const rankedTrends = this.rankHotTrends(allKeywords, hotTrends);

    // 尝试用匹配度最高的热点生成
    const bestTrend = this.selectTrendForIteration(rankedTrends, 0);
    // 从角色方向中提取性别（优先使用 selectedRoleDirection，回退到 characters）
    const directionGender = input.selectedRoleDirection?.gender;
    const characterGender = directionGender === "male" ? "male" as const
      : directionGender === "female" ? "female" as const
      : input.characters[0]?.gender === "male" ? "male" as const
      : input.characters[0]?.gender === "female" ? "female" as const
      : "uncertain" as const;
    if (bestTrend) {
      const payload = await this.generateScriptWithLLM(
        input.assets,
        input.characters,
        bestTrend,
        [],
        {
          characterDescription: input.characterDescription,
          outfitDescription: input.outfitDescription,
          matchingReference: input.matchingReference,
          selectedRoleDirection: input.selectedRoleDirection,
          clothingStyles: input.clothingStyles,
          characterGender,
        },
      );
      if (payload) {
        return {
          id: this.deps.generateId(),
          type: ScriptType.EFFECTIVENESS,
          payloadJson: payload,
          sourceScriptId: null,
          projectId: null,
        };
      }
    }

    // 兜底：无热点或 LLM 失败时用规则生成
    const fallbackTrend = rankedTrends[0]?.trend ?? null;
    return this.buildMinimalFallback(input.assets, input.characters, fallbackTrend);
  }

  /**
   * 调用 LLM 生成完整脚本内容
   */
  private async generateScriptWithLLM(
    assets: OutfitAssetInput[],
    characters: CharacterInfoInput[],
    trend: HotTrendAssetSnapshot | null,
    reflectionNotes: string[],
    context?: {
      characterDescription?: string;
      outfitDescription?: string;
      matchingReference?: string;
      selectedRoleDirection?: RoleDirectionInput | null;
      clothingStyles?: string[];
      characterGender?: "male" | "female" | "uncertain";
    },
  ): Promise<VideoScriptPayload | null> {
    // 构建变量数据
    const assetDesc = buildAssetDescription(assets);
    const charDesc = buildCharacterDescription(characters);
    const trendDesc = buildTrendDescription(trend);

    // 角色综合描述（优先使用角色详细信息）
    const characterSection = charDesc || context?.characterDescription || "";

    // 服饰资产格式化
    const formattedAssets = assets.map(a => ({
      id: a.assetId,
      type: a.category,
      description: a.name,
    }));

    try {
      const narrativeIdentity = selectNarrativeIdentity("effectiveness");

      const { system: systemPrompt, user: renderedUserPrompt } = await skillLoader.render(
        PROMPT_CODE_EFFECTIVENESS,
        {
          variables: {
            characterGender: context?.characterGender,
            characterDescription: characterSection,
            assets: formattedAssets,
            outfitDescription: context?.outfitDescription,
            matchingReference: context?.matchingReference,
            clothingStyles: context?.clothingStyles,
            selectedRoleDirection: context?.selectedRoleDirection,
            trendDescription: trendDesc,
            reflectionNotes: reflectionNotes.length > 0 ? reflectionNotes : undefined,
            narrativeIdentity,
          },
        },
      );
      const response = await this.deps.requestLlmPlainText(systemPrompt, renderedUserPrompt);
      return parseGenerationResponse(response);
    } catch (e) {
      logger.error(
        { err: e instanceof Error ? e : new Error(String(e)), routeKey: ProviderRouteKeys.SCRIPT_EFFECTIVENESS_GENERATION },
        "LLM 调用失败"
      );
      return null;
    }
  }

  /**
   * 最简兜底脚本（LLM 完全不可用时使用）
   */
  private buildMinimalFallback(
    assets: OutfitAssetInput[],
    characters: CharacterInfoInput[],
    trend: HotTrendAssetSnapshot | null,
  ): ScriptDataRecord {
    // 防御：空资产/空角色时仍生成最简脚本
    const safeAssets = assets.length > 0 ? assets : [{ assetId: "", name: "服饰", category: "top", url: "", classification: { reason: "百搭单品" } }];
    const safeCharacters = characters.length > 0 ? characters : [{ characterId: "", name: "模特", kind: "basic" as const, thumbnailUrl: "", tags: [] }];

    const mainChar = safeCharacters[0];
    const mainAsset = safeAssets[0];
    const title = trend
      ? `「${trend.title}」穿搭分享`
      : mainAsset
        ? `${mainAsset.name}穿搭分享`
        : "推荐穿搭视频";
    const summary = `${mainChar ? `以${mainChar.name}为主角` : "展示穿搭"}，使用 ${safeAssets.length} 件服饰单品${trend ? `，结合热点「${trend.title}」` : ""}。`;

    const shots: VideoScriptPayload["shot_breakdown"] = [];
    const startTime = 0;
    const totalDuration = 30;
    const shotCount = Math.max(4, Math.min(safeAssets.length + 2, 6));
    const avgDuration = Math.floor(totalDuration / shotCount);

    for (let i = 0; i < shotCount; i++) {
      const s = startTime + i * avgDuration;
      const e = Math.min(s + avgDuration, totalDuration);
      const isLast = i === shotCount - 1;
      const asset = safeAssets[i % safeAssets.length];
      shots.push({
        shot_id: i + 1,
        timecode: {
          start: `00:${String(Math.min(s, 59)).padStart(2, "0")}`,
          end: `00:${String(Math.min(e, 59)).padStart(2, "0")}`,
          duration_seconds: e - s,
        },
        shot_type: i === 0 ? "特写" : i === 1 ? "全景" : isLast ? "中景" : "中景",
        camera_movement: i === 0 ? "推镜头" : "固定",
        transition_in: { type: i === 0 ? "淡入" : "硬切", duration_seconds: i === 0 ? 0.5 : undefined },
        transition_out: { type: isLast ? "淡出" : "硬切" },
        visual: {
          scene: { location: "室内", setting: "简约背景" },
          lighting: { type: "自然光", direction: "正面" },
        },
        subjects: mainChar
          ? i === 0 || !asset || isLast
            // 人物镜头：person_id、eye_line、clothing 必填
            ? [{
                type: "人物" as const,
                subject_id: 1,
                person_id: 1,
                description: mainChar.name,
                eye_line: "看向镜头",
                action: i === 0 ? "看镜头微笑" : "微笑挥手",
                expression: i === 0 ? "自信" : isLast ? "满意" : "自然",
                clothing: {
                  ref: "搭配1",
                  overall_style: mainChar.style,
                },
              }]
            // 物品镜头：无 person_id、无 clothing
            : [{
                type: "物体" as const,
                subject_id: 2,
                description: asset.name,
                action: "静止展示",
              }]
          : undefined,
        audio: {
          narration: {
            text: i === 0
              ? `欢迎${trend ? `关注「${trend.title}」` : ""}`
              : asset
                ? `${asset.name}，百搭单品`
                : isLast
                  ? "关注获取更多穿搭灵感"
                  : "继续欣赏细节",
          },
        },
        shot_description: i === 0
          ? "开场特写，吸引注意力"
          : isLast
            ? "结尾强化，引导互动"
            : `展示${asset?.name ?? "服饰"}细节`,
      });
    }

    const durations = shots.map((s) => s.timecode?.duration_seconds ?? 0);
    const totalDur = durations.reduce((a, b) => a + b, 0);

    const payload: VideoScriptPayload = {
      video_info: {
        title,
        duration_seconds: 30,
        source: "script_effectiveness_generator",
        time_of_day: "白天",
        weather: "晴天",
        analysis_date: new Date().toISOString().split("T")[0],
      },
      video_analysis: {
        title,
        theme: trend?.title ?? "日常穿搭",
        summary,
        emotion: {
          primary: trend?.sentiment === "positive" ? "开心" : trend?.sentiment === "negative" ? "共鸣" : "平静",
          secondary: trend?.sentiment === "positive" ? ["期待", "好奇"] : ["好奇", "关注"],
          emotion_arc: "开场吸引 → 展示细节 → 结尾强化",
        },
        video_type: "产品展示",
        video_style: "都市现代",
        target_audience: "年轻群体",
        key_elements: [...new Set(safeAssets.map((a) => a.category))].slice(0, 3),
        on_screen_presence: mainChar
          ? {
              has_real_person: true,
              person_count: 1,
              person_details: [{
                person_id: 1,
                description: mainChar.name,
                screen_time_ratio: 1,
                appearance_notes: mainChar.style ?? undefined,
              }],
              exposure_level: "中",
              exposure_description: "1位角色出镜",
            }
          : {
              has_real_person: false,
              person_count: 0,
              exposure_level: "none",
              exposure_description: "无真人出镜",
            },
        fashion_placement: {
          suitable: true,
          reason: trend ? `与热点「${trend.title}」契合` : "服饰搭配完整",
          recommended_styles: safeAssets.slice(0, 3).map((a) => ({
            style: a.name,
            fit_score: 80,
            reason: a.classification?.reason ?? "百搭单品",
            recommended_items: [a.name],
          })),
          placement_notes: `${safeAssets.length}件服饰单品`,
        },
      },
      shot_breakdown: shots,
      editing_analysis: {
        total_shots: shots.length,
        average_shot_duration: durations.length > 0 ? totalDur / durations.length : 5,
        longest_shot_seconds: Math.max(...durations, 5),
        shortest_shot_seconds: Math.min(...durations.filter((d) => d > 0), 3),
        editing_rhythm: "快慢结合",
        pacing: "紧凑有力",
        cut_style: "硬切为主",
      },
    };

    return {
      id: this.deps.generateId(),
      type: ScriptType.EFFECTIVENESS,
      payloadJson: payload,
      sourceScriptId: null,
      projectId: null,
    };
  }

  // =====================================================
  // 质量评估
  // =====================================================

  /**
   * 多视角质量评估（借鉴 BettaFish 主持人讨论机制）
   * 同时调用 3 个评估视角，然后合成最终评分
   */
  private async evaluateQuality(
    record: ScriptDataRecord,
    input: ScriptGenerationInput,
    previousReflections: string[],
  ): Promise<{
    score: number;
    strengths: string[];
    weaknesses: string[];
    improvementSuggestions: string[];
  }> {
    // 并行获取 3 个视角的评估
    const [viewerResult, directorResult, strategistResult] = await Promise.allSettled([
      this.evaluateAsViewer(record, input),
      this.evaluateAsDirector(record, input),
      this.evaluateAsStrategist(record, input),
    ]);

    const results: PerspectiveResult[] = [viewerResult, directorResult, strategistResult]
      .map((r) => {
        if (r.status !== "fulfilled" || !r.value) return null;
        return {
          score: r.value.score,
          perspective: r.value.perspective ?? "未知",
          strengths: r.value.strengths,
          weaknesses: r.value.weaknesses,
          suggestions: r.value.improvementSuggestions,
        } as PerspectiveResult;
      })
      .filter(Boolean) as PerspectiveResult[];

    // 主持人综合各视角
    return this.synthesizePerspectives(results, record, input, previousReflections);
  }

  /**
   * 观众视角评估：吸引力、互动意愿、情感共鸣
   */
  private async evaluateAsViewer(
    record: ScriptDataRecord,
    input: ScriptGenerationInput,
  ) {
    const p = record.payloadJson;
    const characterInfo = input.characters.map((c) => `${c.name}: ${c.tags.join(", ")}`).join("\n");
    try {
      const { system, user } = await skillLoader.render("script_quality_scoring", {
        perspective: "viewer",
        scriptTitle: p.video_info?.title ?? "",
        scriptSummary: p.video_analysis?.summary ?? "",
        videoStyle: p.video_analysis?.video_style ?? "",
        scriptContent: `【角色信息】\n${characterInfo}\n\n【主题】${p.video_analysis?.theme ?? ""}`,
      });
      const resp = await this.deps.requestLlmPlainText(system, user);
      const parsed = this.parseQualityResponse(resp);
      if (parsed) {
        return { ...parsed, perspective: "观众" };
      }
    } catch (e) {
      logger.warn({ err: e, routeKey: ProviderRouteKeys.SCRIPT_EFFECTIVENESS_GENERATION }, "ScriptGenerator viewer perspective evaluation failed");
    }
    return null;
  }

  /**
   * 编导视角评估：拍摄可执行性、场景合理性、成本
   */
  private async evaluateAsDirector(
    record: ScriptDataRecord,
    input: ScriptGenerationInput,
  ) {
    const p = record.payloadJson;
    const shotCount = p.shot_breakdown?.length ?? 0;
    const shots = p.shot_breakdown
      ?.slice(0, 3)
      .map(
        (s) =>
          `镜头${s.shot_id}: ${s.shot_type}, ${(s.visual?.scene as Record<string, unknown>)?.location ?? "未指定场景"}, ${s.shot_description ?? ""}`,
      )
      .join("\n") ?? "无分镜信息";
    const assetInfo = input.assets.map((a) => `${a.name}(${a.category})`).join(", ");

    try {
      const { system, user } = await skillLoader.render("script_quality_scoring", {
        perspective: "director",
        scriptTitle: p.video_info?.title ?? "",
        scriptContent: `【分镜数量】${shotCount}\n【前3个分镜】\n${shots}\n\n【服饰资产】\n${assetInfo}`,
      });
      const resp = await this.deps.requestLlmPlainText(system, user);
      const parsed = this.parseQualityResponse(resp);
      if (parsed) {
        return { ...parsed, perspective: "编导" };
      }
    } catch (e) {
      logger.warn({ err: e, routeKey: ProviderRouteKeys.SCRIPT_EFFECTIVENESS_GENERATION }, "ScriptGenerator director perspective evaluation failed");
    }
    return null;
  }

  /**
   * 策略师视角评估：热点契合、品牌调性、传播潜力
   */
  private async evaluateAsStrategist(
    record: ScriptDataRecord,
    input: ScriptGenerationInput,
  ) {
    const p = record.payloadJson;
    const keyElements = (p.video_analysis?.key_elements ?? []).join(", ");
    const assetInfo = input.assets.map((a) => `${a.name}: ${a.classification?.reason ?? "无描述"}`).join("\n");

    try {
      const { system, user } = await skillLoader.render("script_quality_scoring", {
        perspective: "strategist",
        scriptTitle: p.video_info?.title ?? "",
        videoStyle: p.video_analysis?.theme ?? "",
        videoType: p.video_analysis?.target_audience ?? "未指定",
        scriptContent: `【关键元素】${keyElements}\n\n【服饰资产】\n${assetInfo}`,
      });
      const resp = await this.deps.requestLlmPlainText(system, user);
      const parsed = this.parseQualityResponse(resp);
      if (parsed) {
        return { ...parsed, perspective: "策略师" };
      }
    } catch (e) {
      logger.warn({ err: e, routeKey: ProviderRouteKeys.SCRIPT_EFFECTIVENESS_GENERATION }, "ScriptGenerator strategist perspective evaluation failed");
    }
    return null;
  }

  /**
   * 主持人综合各视角评分（借鉴 BettaFish ForumEngine）
   * 将多个独立视角的评估合并，发现共识与分歧
   */
  private synthesizePerspectives(
    results: PerspectiveResult[],
    record: ScriptDataRecord,
    input: ScriptGenerationInput,
    previousReflections: string[],
  ): { score: number; strengths: string[]; weaknesses: string[]; improvementSuggestions: string[] } {
    if (results.length === 0) {
      // 全部失败，降级到规则评估
      return this.ruleBasedQualityEval(record.payloadJson, input);
    }

    // 计算综合分数（加权平均：策略师权重略高）
    const weights = { "观众": 0.3, "编导": 0.3, "策略师": 0.4 };
    let totalWeight = 0;
    let weightedSum = 0;
    for (const r of results) {
      const w = weights[r.perspective as keyof typeof weights] ?? 0.33;
      weightedSum += r.score * w;
      totalWeight += w;
    }
    const avgScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;

    // 收集各视角的优缺点和建议，去重
    const allStrengths = [...new Set(results.flatMap((r) => r.strengths))];
    const allWeaknesses = [...new Set(results.flatMap((r) => r.weaknesses))];
    const allSuggestions = [...new Set(results.flatMap((r) => r.suggestions))];

    // 如果有分歧（某视角高分某视角低分），记录为弱点
    const scores = results.map((r) => r.score);
    const scoreSpread = Math.max(...scores) - Math.min(...scores);
    if (scoreSpread > 25 && results.length >= 2) {
      allWeaknesses.push(
        `各视角分歧较大（最高${Math.max(...scores)}分 vs 最低${Math.min(...scores)}分），说明脚本存在明显短板`,
      );
    }

    // 附加上轮改进建议
    const finalSuggestions =
      previousReflections.length > 0
        ? [...previousReflections, ...allSuggestions]
        : allSuggestions;


    return {
      score: avgScore,
      strengths: allStrengths,
      weaknesses: allWeaknesses,
      improvementSuggestions: finalSuggestions,
    };
  }

  /**
   * 解析 LLM 返回的质量评估结果
   */
  private parseQualityResponse(text: string): {
    score: number;
    strengths: string[];
    weaknesses: string[];
    improvementSuggestions: string[];
  } | null {
    let jsonText = text.trim();
    if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
    if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
    if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);
    jsonText = jsonText.trim();

    try {
      const parsed = JSON.parse(jsonText);
      const score = Number(parsed.score) || 50;
      return {
        score: Math.max(0, Math.min(100, score)),
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
        improvementSuggestions: Array.isArray(parsed.improvementSuggestions)
          ? parsed.improvementSuggestions
          : [],
      };
    } catch {
      return null;
    }
  }

  /**
   * 基于规则的质量评估（LLM 不可用时的降级方案）
   */
  private ruleBasedQualityEval(
    p: VideoScriptPayload,
    input: ScriptGenerationInput,
  ): {
    score: number;
    strengths: string[];
    weaknesses: string[];
    improvementSuggestions: string[];
  } {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    let score = 50; // 基础分

    // 有标题 + 主题
    if (p.video_info?.title && p.video_analysis?.theme) {
      score += 10;
      strengths.push("脚本结构完整（有标题和主题）");
    }

    // 有摘要
    if (p.video_analysis?.summary && p.video_analysis.summary.length > 20) {
      score += 10;
      strengths.push("脚本摘要内容充实");
    } else {
      weaknesses.push("脚本摘要过于简短");
    }

    // 有视频风格和类型
    if (p.video_analysis?.video_style && p.video_analysis?.video_type) {
      score += 5;
      strengths.push("已定义视频风格和类型");
    }

    // 有分镜
    if (p.shot_breakdown && p.shot_breakdown.length >= 4) {
      score += 10;
      strengths.push(`分镜数量充足（${p.shot_breakdown.length} 个镜头）`);
    } else {
      weaknesses.push("分镜数量不足（建议至少 4 个）");
    }

    // 服饰资产数量匹配
    const mentionedAssetCount = this.countMentionedAssets(p, input.assets);
    if (mentionedAssetCount >= Math.min(2, input.assets.length)) {
      score += 10;
      strengths.push("已融入服饰单品描述");
    } else if (input.assets.length > 0) {
      weaknesses.push("未充分融入服饰单品描述");
    }

    // 有情感弧线
    if (p.video_analysis?.emotion?.emotion_arc) {
      score += 5;
      strengths.push("有情感弧线设计");
    }

    score = Math.max(0, Math.min(100, score));

    // 根据薄弱项生成改进建议
    const suggestions: string[] = [];
    if (weaknesses.some((w) => w.includes("摘要"))) {
      suggestions.push("增加脚本摘要的内容丰富度，包含更多场景和角色描述");
    }
    if (weaknesses.some((w) => w.includes("分镜"))) {
      suggestions.push("增加分镜数量，确保每个服饰单品都有展示镜头");
    }
    if (weaknesses.some((w) => w.includes("服饰"))) {
      suggestions.push("在脚本中更明确地融入输入的服饰单品名称和特色");
    }

    return { score, strengths, weaknesses, improvementSuggestions: suggestions };
  }

  /**
   * 计算脚本中提到的服饰资产数量
   */
  private countMentionedAssets(payload: VideoScriptPayload, assets: OutfitAssetInput[]): number {
    const allText = JSON.stringify(payload).toLowerCase();
    return assets.filter((a) => allText.includes(a.name.toLowerCase())).length;
  }

  // ==================== 热点获取与匹配 ====================

  /**
   * 获取热点资产
   * 从 nrm_hot_trend_assets 表查询，JOIN nrm_script_data 获取脚本内容
   */
  private async fetchHotTrends(): Promise<HotTrendAssetSnapshot[]> {
    if (!this.deps.repos?.scriptData) {
      logger.warn("ScriptGenerator repos.scriptData not available, returning empty hot trends");
      return [];
    }

    try {
      const rows = await this.deps.repos.scriptData.findHotTrendInsights(50);
      return rows.map((row: Record<string, unknown>) => {
        const emotionDetail = row.emotion_detail as Record<string, unknown> | null;

        // 构建标签列表
        const labels: string[] = [];
        if (row.video_type) labels.push(row.video_type as string);
        if (row.video_style) labels.push(row.video_style as string);
        if (row.primary_emotion) labels.push(row.primary_emotion as string);
        if (emotionDetail?.secondary) {
          const secondary = emotionDetail.secondary as string[];
          labels.push(...secondary.slice(0, 2));
        }

        // 推断适用性
        const suitability: "high" | "medium" | "low" =
          row.fashion_suitable === true ? "high" : row.fashion_suitable === false ? "low" : "medium";

        return {
          insightId: row.id as string,
          title: (row.topic as string) ?? (row.script_title as string) ?? "",
          labels,
          suitability,
          scriptTitle: (row.script_title as string) ?? "",
          scriptContent: (row.summary as string) ?? "",
          keywords: this.extractKeywords((row.topic as string) ?? "", labels),
          sentiment: this.inferSentimentFromEmotion(row.primary_emotion as string | null),
        };
      });
    } catch (error) {
      logger.error(
        { err: error, routeKey: ProviderRouteKeys.SCRIPT_EFFECTIVENESS_GENERATION },
        "获取热点资产失败"
      );
      return [];
    }
  }

  /**
   * 从主要情绪推断情感倾向
   */
  private inferSentimentFromEmotion(primaryEmotion: string | null): "positive" | "negative" | "neutral" {
    if (!primaryEmotion) return "neutral";

    const positiveEmotions = ["开心", "治愈", "温暖", "感动", "兴奋", "期待", "满足", "希望"];
    const negativeEmotions = ["悲伤", "愤怒", "恐惧", "焦虑", "孤独", "失落", "沮丧", "烦躁"];

    if (positiveEmotions.some((e) => primaryEmotion.includes(e))) return "positive";
    if (negativeEmotions.some((e) => primaryEmotion.includes(e))) return "negative";
    return "neutral";
  }

  /**
   * 对热点按匹配分数降序排序
   * 返回带分数的排序结果，供反思循环逐轮选取
   */
  private rankHotTrends(
    keywords: string[],
    hotTrends: HotTrendAssetSnapshot[],
  ): Array<{ trend: HotTrendAssetSnapshot; score: number }> {
    const ranked = hotTrends.map((trend) => ({
      trend,
      score: this.calculateMatchScore(keywords, trend.keywords),
    }));
    ranked.sort((a, b) => b.score - a.score);
    return ranked;
  }

  /**
   * 选取当前迭代的热点
   * 首轮选最高分，后续轮次依次选取下一个，避免重复使用同一热点
   */
  private selectTrendForIteration(
    rankedTrends: Array<{ trend: HotTrendAssetSnapshot; score: number }>,
    index: number,
  ): HotTrendAssetSnapshot | null {
    if (rankedTrends.length === 0) return null;
    if (index >= rankedTrends.length) return null;
    return rankedTrends[index].trend;
  }

  // ==================== 关键词提取与匹配 ====================

  /**
   * 提取资产关键词
   * 从服饰资产中提取所有关键词用于热点匹配
   */
  private extractAssetKeywords(assets: OutfitAssetInput[]): string[] {
    const keywords: string[] = [];

    for (const asset of assets) {
      // 资产名称（小写化）
      keywords.push(asset.name.toLowerCase());
      // 分类信息
      keywords.push(asset.category);
      // 分类详细信息（如果有）
      if (asset.classification?.category) keywords.push(asset.classification.category);
      if (asset.classification?.viewLabel) keywords.push(asset.classification.viewLabel);
      if (asset.classification?.reason) keywords.push(...this.tokenize(asset.classification.reason));
    }

    return [...new Set(keywords.map((k) => k.toLowerCase()))];
  }

  /**
   * 提取角色关键词
   */
  private extractCharacterKeywords(characters: CharacterInfoInput[]): string[] {
    const keywords: string[] = [];

    for (const char of characters) {
      keywords.push(...char.tags);
      if (char.style) keywords.push(char.style);
    }

    return [...new Set(keywords.map((k) => k.toLowerCase()))];
  }

  /**
   * 计算匹配分数
   */
  private calculateMatchScore(sourceKeywords: string[], targetKeywords: string[]): number {
    const source = new Set(sourceKeywords);
    const target = new Set(targetKeywords);

    let matches = 0;
    for (const sk of source) {
      for (const tk of target) {
        if (sk.includes(tk) || tk.includes(sk)) {
          matches++;
          break;
        }
      }
    }

    return target.size > 0 ? (matches / target.size) * 100 : 0;
  }

  /**
   * 从文本提取关键词
   */
  private extractKeywords(title: string, labels: string[]): string[] {
    const keywords: string[] = [...labels];
    keywords.push(...this.tokenize(title));
    return [...new Set(keywords)];
  }

  /**
   * 分词
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[\s,，、]+/)
      .filter((w) => w.length >= 2);
  }

}
