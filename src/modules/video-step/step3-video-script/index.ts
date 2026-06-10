/**
 * Step3 视频脚本生成模块入口
 * 主入口函数：generateVideoScriptsSnapshot
 *
 * 流程：
 * 1. 获取项目上下文（角色风格、服饰描述、穿搭方案等）
 * 2. 查询视频脚本数据
 * 3. 先打乱数据（避免重复）
 * 4. 解析脚本内容
 * 5. 过滤符合条件的脚本
 * 6. 取前 2 条进行 LLM 改写
 * 7. 构建 Snapshot
 */

import type { AppContext } from "../../../core/app-context.js";
import type { User, Project } from "../../../contracts/types.js";
import type { Step3ScriptCandidateSnapshot } from "../../../contracts/step3-candidate-snapshot-contract.js";
import { getLogger } from "../../../core/logger/index.js";

const log = getLogger("video-script-generator");

import { shuffleArray } from "../../../utils/array-utils.js";
import { fetchVideoScriptsFromSource } from "./source-fetcher.js";
import {
  parseVideoScriptsContentsWithoutShots,
  enrichWithShotBreakdown,
} from "./content-parser.js";
import { filterVideoScripts } from "./script-filter.js";
import {
  rewriteScriptsWithLLM,
} from "./script-rewriter.js";
import {
  buildVideoScriptSnapshot,
} from "./snapshot-builder.js";

/**
 * 生成视频热榜脚本快照
 *
 * @param ctx 应用上下文
 * @param project 项目对象
 * @param user 用户对象
 * @param excludeIds 排除的脚本ID列表（避免重复推荐）
 * @returns Step3ScriptCandidateSnapshot
 */
export async function generateVideoScriptsSnapshot(
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
    const videoCharGender = projectContext.character?.gender;
    if (!videoCharGender) {
      throw new Error("角色性别未设置，无法生成 video 脚本。请先在定妆步骤设置角色性别。");
    }

    // 校验穿搭数据
    if (!projectContext.outfitDescription || projectContext.outfitDescription.trim().length === 0) {
      throw new Error("服饰描述为空，无法生成 video 脚本。请先完成服饰上传。");
    }
    if (!projectContext.matchingReference || projectContext.matchingReference.trim().length === 0) {
      throw new Error("搭配描述为空，无法生成 video 脚本。请先完成穿搭方案选择。");
    }
    if (!projectContext.clothingStyles || projectContext.clothingStyles.length === 0) {
      throw new Error("服饰风格为空，无法生成 video 脚本。请先完成穿搭方案选择。");
    }

    if (!projectContext.characterDescription) {
      log.warn({ projectId: project.id }, "VideoScriptGenerator no character description found");
    }


    // ===== Step 2: 查询视频脚本数据 =====
    const rawScripts = await fetchVideoScriptsFromSource({
      repos: ctx.repos,
      limit: 200,  // 查询 200 条，严格过滤后取前 2 条进行 LLM 改写
      orderByTimeDesc: true,
      excludeIds,
    });

    if (rawScripts.length === 0) {
      throw new Error("视频脚本库为空，无法生成");
    }

    // ===== Step 3: 先打乱数据（避免重复） =====
    const shuffledScripts = shuffleArray(rawScripts);

    // ===== Step 4: 解析脚本内容（不含 shot_breakdown，用于过滤） =====
    const parsedScripts = parseVideoScriptsContentsWithoutShots(shuffledScripts);

    if (parsedScripts.length === 0) {
      throw new Error("视频脚本解析失败，无法生成");
    }

    // ===== Step 5: 过滤符合条件的脚本 =====
    const filteredScripts = filterVideoScripts(parsedScripts, {
      characterStyles: projectContext.clothingStyles,
      characterAge: projectContext.character?.age,
      characterGender: projectContext.character?.gender,
      minScreenTimeRatio: 0.5,
      allowedExposureLevels: ["高", "中"],
    });

    if (filteredScripts.length === 0) {
      throw new Error("无符合条件的视频脚本，无法生成");
    }


    // ===== Step 6: 取前 1 条，延迟查询 shot_breakdown =====
    const scriptsToRewrite = filteredScripts.slice(0, 1);

    // 只对需要改写的脚本查询 shot_breakdown（延迟查询优化）
    const scriptsWithShots = await enrichWithShotBreakdown(ctx.repos.shotBreakdowns, scriptsToRewrite);

    const rewrittenScripts = await rewriteScriptsWithLLM(
      ctx,
      scriptsWithShots,
      project,
      projectContext,
    );

    const successCount = rewrittenScripts.filter((r) => r.success).length;

    // 如果全部失败，返回错误
    if (successCount === 0) {
      throw new Error("所有脚本改写失败，无法生成");
    }

    // ===== Step 8: 构建 Snapshot =====
    const snapshot = buildVideoScriptSnapshot(rewrittenScripts, {
      projectId: project.id,
      promptVersion: "video-rewrite-v1",
      generationMode: "real",
    });

    const totalTime = Date.now() - startTime;

    return snapshot;
  } catch (error) {
    log.error({ err: error, projectId: project.id }, "VideoScriptGenerator failed");
    throw error;
  }
}

// 导出子模块（供测试或单独使用）
export * from "./types.js";
export { fetchVideoScriptsFromSource } from "./source-fetcher.js";
export {
  parseVideoScriptsContents,
  parseVideoScriptContent,
  parseVideoScriptsContentsWithoutShots,
  enrichWithShotBreakdown,
} from "./content-parser.js";
export { filterVideoScripts } from "./script-filter.js";
export { rewriteScriptsWithLLM, extractStylesFromDescription } from "./script-rewriter.js";
export { buildVideoScriptSnapshot } from "./snapshot-builder.js";
