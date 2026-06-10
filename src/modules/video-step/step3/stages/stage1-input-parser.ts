/**
 * 阶段1：输入解析
 * 验证项目存在、提取热点数据、提取角色信息
 * 核心职责：确保输入数据完整性，角色信息不被遗漏
 */

import type { AppContext } from "../../../../core/app-context.js";
import type { TrendEntry, CharacterViewKey } from "../../../../contracts/types.js";
import type { STAGE1_RESULT, OutfitModuleSummary } from "../../../../contant-config/shared_dict.js";
import { buildCharacterPromptFromProject, type CharacterDirectionInfo } from "../../shared/character-prompt-builder.js";
import { getLogger } from "../../../../core/logger/index.js";

const log = getLogger("stage1-input-parser");

/**
 * 默认热点数量
 */
const DEFAULT_HOTSPOT_LIMIT = 50;

/**
 * 阶段1：输入解析
 * @param ctx 应用上下文
 * @param projectId 项目ID
 * @param hotspotLimit 热点数量限制
 * @param llmDeps LLM依赖
 * @returns 阶段1结果
 */
export async function stage1_parseInput(
  ctx: AppContext,
  projectId: string,
  hotspotLimit: number = DEFAULT_HOTSPOT_LIMIT,
  llmDeps: STAGE1_RESULT["llmDeps"],
): Promise<STAGE1_RESULT> {

  // Step 1.1: 获取项目上下文（使用新的 ProjectContextService）
  const projectContext = await ctx.projectContextService.getProjectContext(projectId, {
    includeCharacterFiveView: true,
  });


  // Step 1.2: 构建角色引用
  const characterReference = buildCharacterReference(projectContext, projectId);
  if (!characterReference) {
    throw new Error("未找到角色信息，请先完成角色选择");
  }

  // Step 1.3: 构建服饰模块信息
  const outfitModules = buildOutfitModules(projectContext);
  if (outfitModules && outfitModules.length > 0) {
    outfitModules.forEach((module, index) => {
    });
  } else {
  }

  // Step 1.4: 提取热点数据
  const hotspots = await extractHotspots(ctx, hotspotLimit);

  // Step 1.5: 提取服饰风格（从项目上下文获取）
  const clothingStyles = projectContext.clothingStyles;

  // Step 1.6: 完整性校验
  validateInputCompleteness(characterReference, hotspots, projectContext.outfitDescription || undefined, projectContext.matchingReference || undefined, clothingStyles);

  // Step 1.7: 获取角色方向（使用统一函数 buildCharacterPromptFromProject）
  let selectedRoleDirection: CharacterDirectionInfo | null = null;
  try {
    const project = await ctx.repos.projects.findById(projectId);
    if (project) {
      const { characterDirection } = buildCharacterPromptFromProject(project);
      selectedRoleDirection = characterDirection;
      if (characterDirection) {
      }
    }
  } catch {
    // 角色方向获取失败不影响主流程
  }

  return {
    projectId,
    characterReference,
    characterDescription: projectContext.characterDescription || undefined,
    outfitModules: outfitModules && outfitModules.length > 0 ? outfitModules : undefined,
    clothingStyles,
    outfitDescription: projectContext.outfitDescription || undefined,
    matchingReference: projectContext.matchingReference || undefined,
    selectedRoleDirection,
    hotspots,
    llmDeps,
  };
}

/**
 * 从项目上下文构建角色引用
 */
function buildCharacterReference(
  projectContext: Awaited<ReturnType<AppContext["projectContextService"]["getProjectContext"]>>,
  projectId: string,
): STAGE1_RESULT["characterReference"] | null {
  const character = projectContext.character;
  if (!character) {
    return null;
  }

  // 优先使用五视图，其次使用缩略图
  const imageUrl = character.fiveViewOssImageUrl || character.thumbnailUrl;
  if (!imageUrl) {
    return null;
  }

  return {
    id: character.libraryCharacterId,
    projectId,
    userId: "", // 从项目上下文中不需要 userId
    imageUrl,
    label: character.name,
    gender: character.gender === null ? undefined : character.gender,
    viewKey: undefined,
  };
}

/**
 * 从项目上下文构建服饰模块信息
 */
function buildOutfitModules(
  projectContext: Awaited<ReturnType<AppContext["projectContextService"]["getProjectContext"]>>,
): OutfitModuleSummary[] | undefined {
  const modules: OutfitModuleSummary[] = [];

  // 从服饰列表构建
  for (const garment of projectContext.garments) {
    modules.push({
      subjectName: garment.name,
      subjectDescription: garment.description || "",
      matchingReference: projectContext.matchingReference,
    });
  }

  // 如果没有服饰数据，但有搭配参考，也创建一个模块
  if (modules.length === 0 && projectContext.matchingReference) {
    modules.push({
      subjectName: "",
      subjectDescription: "",
      matchingReference: projectContext.matchingReference,
    });
  }

  return modules.length > 0 ? modules : undefined;
}

/**
 * 获取热点数据
 */
async function extractHotspots(ctx: AppContext, limit: number): Promise<TrendEntry[]> {
  const allHotspots = [...await ctx.repos.trendEntries.list()];

  // 按同步时间降序排序
  allHotspots.sort((a, b) => b.syncedAt - a.syncedAt);

  // 取前limit条
  return allHotspots.slice(0, limit);
}

/**
 * 完整性校验
 */
function validateInputCompleteness(
  character: STAGE1_RESULT["characterReference"],
  hotspots: TrendEntry[],
  outfitDescription?: string,
  matchingReference?: string,
  clothingStyles?: string[],
): void {
  // 角色必须有图片URL
  if (!character.imageUrl) {
    throw new Error("角色信息缺少图片URL");
  }

  // 服饰描述不能为空
  if (!outfitDescription || outfitDescription.trim().length === 0) {
    throw new Error("服饰描述为空，无法生成脚本。请先完成服饰上传。");
  }

  // 搭配描述不能为空
  if (!matchingReference || matchingReference.trim().length === 0) {
    throw new Error("搭配描述为空，无法生成脚本。请先完成穿搭方案选择。");
  }

  // 服饰风格不能为空
  if (!clothingStyles || clothingStyles.length === 0) {
    throw new Error("服饰风格为空，无法生成脚本。请先完成穿搭方案选择。");
  }

  // 热点数据可以为空（将使用降级逻辑）
  if (hotspots.length === 0) {
    log.warn("Stage1 no hotspots available, will use fallback logic");
  }
}
