/**
 * Step3 库存脚本生成模块入口
 * 主入口函数：generateLibraryScriptsSnapshot
 *
 * 流程：
 * 1. 获取项目上下文（角色年龄、性别、服饰描述、穿搭方案等）
 * 2. 从 nrm_script_data 查询 type != 1 的数据（最多 200 条）
 * 3. 先打乱数据（避免重复）
 * 4. 解析脚本内容（含分镜查询）
 * 5. 按年龄、性别匹配过滤
 * 6. 取第 1 条匹配脚本
 * 7. LLM 轻度改写（只适配角色描述）
 * 8. 构建 Snapshot（只含 1 条结果）
 */

import type { AppContext } from "../../../core/app-context.js";
import type { User, Project } from "../../../contracts/types.js";
import type { Step3ScriptCandidateSnapshot } from "../../../contracts/step3-candidate-snapshot-contract.js";
import type { VideoScriptDataRecord } from "../../../service/scripts-data-db-service.js";
import type { ScoringLoopConfig } from "../../../contracts/business-config-contract.js";
import { DEFAULT_SCORING_LOOP_CONFIG } from "../../../contracts/business-config-contract.js";
import { getLogger } from "../../../core/logger/index.js";

const log = getLogger("library-script-generator");

import { shuffleArray } from "../../../utils/array-utils.js";
import { fetchLibraryScriptsFromSource } from "./library-fetcher.js";
import { filterLibraryScripts } from "./library-filter.js";
import { rewriteLibraryScriptWithLLM } from "./library-rewriter.js";
import { buildLibraryScriptSnapshot } from "./library-builder.js";
import { getLibraryScriptScores, filterByScore, getDeprecatedScriptIds } from "../../script-quality/scoring-loop.js";
import {
  parseVideoScriptsContentsWithoutShots,
  enrichWithShotBreakdown,
  parseVideoScriptContent,
} from "../step3-video-script/content-parser.js";
import type { VideoScriptData } from "../step3-video-script/types.js";

/**
 * 生成库存脚本快照
 *
 * @param ctx 应用上下文
 * @param project 项目对象
 * @param user 用户对象
 * @param excludeIds 排除的脚本ID列表（避免重复推荐）
 * @returns Step3ScriptCandidateSnapshot（只含 1 条结果或空）
 */
export async function generateLibraryScriptsSnapshot(
  ctx: AppContext,
  project: Project,
  user: User,
  excludeIds: string[] = [],
): Promise<Step3ScriptCandidateSnapshot> {

  const startTime = Date.now();

  try {
    // ===== Step 1: 获取项目上下文 =====
    const projectContext = await ctx.projectContextService.getProjectContext(project.id);

    // 校验角色性别
    const libCharGender = projectContext.character?.gender;
    if (!libCharGender) {
      throw new Error("角色性别未设置，无法生成 library 脚本。请先在定妆步骤设置角色性别。");
    }

    // 详细日志：上下文信息

    // 校验穿搭数据
    if (!projectContext.outfitDescription || projectContext.outfitDescription.trim().length === 0) {
      throw new Error("服饰描述为空，无法生成 library 脚本。请先完成服饰上传。");
    }
    if (!projectContext.matchingReference || projectContext.matchingReference.trim().length === 0) {
      throw new Error("搭配描述为空，无法生成 library 脚本。请先完成穿搭方案选择。");
    }


    // ===== Step 2: 查询库存脚本数据 =====
    let rawScripts = await fetchLibraryScriptsFromSource({
      repos: ctx.repos,
      excludeType: 1,
      limit: 200,
      orderByTimeDesc: true,
      excludeIds,
    });

    // 详细日志：查询结果

    if (rawScripts.length === 0) {
      throw new Error("库存脚本库为空，无法生成");
    }

    // ===== Step 2.5: 评分闭环过滤（排除 deprecated + 过滤低分） =====
    const scoringLoopConfig: ScoringLoopConfig = ctx.businessConfigService.get("scoring_loop", DEFAULT_SCORING_LOOP_CONFIG);
    if (scoringLoopConfig.enabled) {
      // 排除 deprecated 脚本
      const deprecatedIds = await getDeprecatedScriptIds(ctx.repos, scoringLoopConfig);
      if (deprecatedIds.size > 0) {
        rawScripts = rawScripts.filter((s) => !deprecatedIds.has(s.id));
        log.info({ deprecatedCount: deprecatedIds.size, remaining: rawScripts.length }, "评分闭环：排除 deprecated 脚本");
      }

      // 查询评分并过滤低分脚本
      if (rawScripts.length > 0) {
        const scriptIds = rawScripts.map((s) => s.id);
        const scoreMap = await getLibraryScriptScores(ctx.repos, scriptIds, scoringLoopConfig);
        const scoredCount = scriptIds.filter((id) => scoreMap.has(id)).length;
        if (scoredCount === 0) {
          log.warn({ total: scriptIds.length }, "评分闭环生效但无评分数据：所有脚本均为 unrated，闭环实际无效。请先启动 scoring daemon 或调用 batch-score-existing");
        } else if (scoredCount < scriptIds.length * 0.5) {
          log.warn({ scoredCount, total: scriptIds.length }, "评分闭环覆盖率低于 50%，部分脚本未评分将被保留而非过滤");
        }
        const passedIds = filterByScore(scriptIds, scoreMap, scoringLoopConfig.minScoreForLibrary);
        if (passedIds.length < scriptIds.length) {
          rawScripts = rawScripts.filter((s) => passedIds.includes(s.id));
          log.info({ filteredOut: scriptIds.length - passedIds.length, remaining: rawScripts.length }, "评分闭环：过滤低分脚本");
        }
      }

      if (rawScripts.length === 0) {
        throw new Error("评分闭环：所有库存脚本分数低于阈值或已淘汰");
      }
    }

    // 打印前 3 条脚本的 ID 和 title（用于调试）
    rawScripts.slice(0, 3).forEach((script, index) => {
    });

    // ===== Step 3: 先打乱数据（避免重复） =====
    const shuffledScripts = shuffleArray(rawScripts);

    // ===== Step 4: 解析脚本内容（不含 shot_breakdown，用于过滤） =====
    const parsedScriptsRaw = parseVideoScriptsContentsWithoutShots(shuffledScripts);
    const parsedScripts = parsedScriptsRaw
      .filter((r): r is VideoScriptData & { parsed: NonNullable<VideoScriptData["parsed"]> } => r.parsed !== null);

    // 详细日志：解析结果

    if (parsedScripts.length === 0) {
      throw new Error("库存脚本解析失败，无法生成");
    }


    // ===== Step 5: 按年龄、性别匹配过滤 =====
    const filteredScripts = filterLibraryScripts(parsedScripts, {
      characterAge: projectContext.character?.age,
      characterGender: projectContext.character?.gender,
    });

    // 详细日志：过滤结果

    if (filteredScripts.length === 0) {
      throw new Error("无匹配的库存脚本，年龄或性别不匹配");
    }


    // 打印匹配的脚本信息
    filteredScripts.slice(0, 3).forEach((script, index) => {
      const fashionStyles = script.parsed?.video_analysis?.fashion_placement?.recommended_styles || [];
    });

    // ===== Step 6: 取第 1 条，延迟查询 shot_breakdown =====
    const selectedScript = filteredScripts[0];

    // 只对选中的脚本查询 shot_breakdown（延迟查询优化）
    const scriptsWithShots = await enrichWithShotBreakdown(ctx.repos.shotBreakdowns, [selectedScript]);
    const scriptWithShots = scriptsWithShots[0];

    const rewriteResult = await rewriteLibraryScriptWithLLM(
      ctx,
      scriptWithShots.parsed!,
      project,
      projectContext,
    );

    // 改写失败时用原文兜底（library 定位为模板参考，原文也有价值）
    const finalContent = rewriteResult.rewrittenContent ?? scriptWithShots.parsed!;

    if (!rewriteResult.success) {
    }

    // ===== Step 8: 构建 Snapshot =====
    const snapshot = buildLibraryScriptSnapshot(
      selectedScript.id,
      finalContent,
      {
        projectId: project.id,
        promptVersion: "library-light-v1",
        generationMode: rewriteResult.success ? "real" : "degraded",
      },
    );

    const totalTime = Date.now() - startTime;

    return snapshot;
  } catch (error) {
    log.error({ err: error, projectId: project.id }, "LibraryGenerator failed");
    throw error;
  }
}
