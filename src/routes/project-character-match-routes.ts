/**
 * 项目角色服饰匹配路由
 *
 * 根据性别和年龄匹配角色库角色（精确匹配），结果持久化到项目角色关系表。
 * 每个项目只匹配一次，重复请求直接返回已保存的结果。
 * 匹配时自动从项目的 selectedRoleDirection 中提取性别和年龄用于过滤。
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { AppError } from "../core/errors.js";
import { requireUser } from "../services/auth/route-guards.js";

interface ProjectIdParams {
  projectId: string;
}

interface MatchByOutfitBody {
  /** 服饰风格概述 */
  outfitSummary?: string;
  /** 角色方向提示词 */
  roleDirectionPrompt?: string;
  /** 已选中角色名（用于排除） */
  selectedCharacterName?: string;
}

/** 从项目的 selectedRoleDirection 提取性别和年龄 */
function extractRoleDirectionFields(project: {
  selectedRoleDirection: Record<string, unknown> | null;
}): { gender: string | undefined; age: number | undefined } {
  const rd = project.selectedRoleDirection;
  if (!rd) return { gender: undefined, age: undefined };
  const gender = typeof rd.gender === "string" ? rd.gender : undefined;
  const age = typeof rd.age === "number" ? rd.age : undefined;
  return { gender, age };
}

export function registerProjectCharacterMatchRoutes(app: FastifyInstance, ctx: AppContext): void {
  /**
   * GET /projects/:projectId/characters/match-candidates
   * 获取所有符合性别/年龄的角色（用于弹窗选择，不持久化）
   */
  const getMatchCandidates = async (request: FastifyRequest<{
    Params: ProjectIdParams;
  }>) => {
    const user = await requireUser(ctx, request);
    const { projectId } = request.params;

    const project = await ctx.projectService.requireOwnerProject(user, projectId);
    const { gender, age } = extractRoleDirectionFields(project);

    // 获取用户的全部角色库
    const libraryCharacters = await ctx.repos.libraryCharacters.findByUserId(user.id);

    // 按性别和年龄过滤（使用匹配逻辑）
    const { matchLibraryCharactersByOutfit } = await import("../modules/library-character-outfit-match.js");
    const matchResult = matchLibraryCharactersByOutfit({
      libraryCharacters,
      gender,
      age,
    });

    // 加载完整角色数据
    const characters = await Promise.all(
      matchResult.characterIds.map((id) => ctx.repos.libraryCharacters.findById(id))
    );

    return {
      characters: characters.filter((c) => c !== null),
    };
  };

  /**
   * POST /projects/:projectId/characters/match-by-outfit
   * 根据性别和年龄匹配角色库角色（视频项目），持久化 top 4
   */
  const matchByOutfit = async (request: FastifyRequest<{
    Params: ProjectIdParams;
    Body: MatchByOutfitBody;
  }>) => {
    const user = await requireUser(ctx, request);
    const { projectId } = request.params;
    const body = request.body ?? {};

    const project = await ctx.projectService.requireOwnerProject(user, projectId);
    const { gender, age } = extractRoleDirectionFields(project);

    // 1. 先查是否已有匹配结果
    const existingMatches = await ctx.projectCharacterService.listByProjectId(projectId);
    const libraryMatches = existingMatches.filter((m) => m.sourceType === "library");
    if (libraryMatches.length > 0) {
      // 加载完整角色数据
      const characters = await Promise.all(
        libraryMatches.map((m) => ctx.repos.libraryCharacters.findById(m.libraryCharacterId))
      );
      return {
        characters: characters.filter((c) => c !== null),
        alreadyMatched: true,
      };
    }

    // 2. 无已有结果，执行匹配并保存
    const characters = await ctx.projectCharacterService.matchByOutfit({
      projectId,
      userId: user.id,
      outfitSummary: typeof body.outfitSummary === "string" ? body.outfitSummary.trim() : undefined,
      roleDirectionPrompt: typeof body.roleDirectionPrompt === "string" ? body.roleDirectionPrompt.trim() : undefined,
      selectedCharacterName: typeof body.selectedCharacterName === "string" ? body.selectedCharacterName.trim() : undefined,
      gender,
      age,
      topN: 4,
    });

    return {
      characters,
      alreadyMatched: false,
    };
  };

  /**
   * POST /image-projects/:projectId/characters/match-by-outfit
   * 根据性别和年龄匹配角色库角色（图片项目）
   */
  const matchByOutfitImage = async (request: FastifyRequest<{
    Params: ProjectIdParams;
    Body: MatchByOutfitBody;
  }>) => {
    const user = await requireUser(ctx, request);
    const { projectId } = request.params;
    const body = request.body ?? {};

    const project = await ctx.projectService.requireOwnerProject(user, projectId);
    if (project.projectKind !== "image") {
      throw new AppError(400, "INVALID_PROJECT_KIND", "仅支持图片项目");
    }
    const { gender, age } = extractRoleDirectionFields(project);

    // 1. 先查是否已有匹配结果
    const existingMatches = await ctx.projectCharacterService.listByProjectId(projectId);
    const libraryMatches = existingMatches.filter((m) => m.sourceType === "library");
    if (libraryMatches.length > 0) {
      // 加载完整角色数据
      const characters = await Promise.all(
        libraryMatches.map((m) => ctx.repos.libraryCharacters.findById(m.libraryCharacterId))
      );
      return {
        characters: characters.filter((c) => c !== null),
        alreadyMatched: true,
      };
    }

    // 2. 无已有结果，执行匹配并保存
    const characters = await ctx.projectCharacterService.matchByOutfit({
      projectId,
      userId: user.id,
      outfitSummary: typeof body.outfitSummary === "string" ? body.outfitSummary.trim() : undefined,
      roleDirectionPrompt: typeof body.roleDirectionPrompt === "string" ? body.roleDirectionPrompt.trim() : undefined,
      selectedCharacterName: typeof body.selectedCharacterName === "string" ? body.selectedCharacterName.trim() : undefined,
      gender,
      age,
      topN: 4,
    });

    return {
      characters,
      alreadyMatched: false,
    };
  };

  /**
   * POST /reverse-projects/:projectId/characters/match-by-outfit
   * 根据性别和年龄匹配角色库角色（反推项目）
   */
  const matchByOutfitReverse = async (request: FastifyRequest<{
    Params: ProjectIdParams;
    Body: MatchByOutfitBody;
  }>) => {
    const user = await requireUser(ctx, request);
    const { projectId } = request.params;
    const body = request.body ?? {};

    const project = await ctx.projectService.requireOwnerProject(user, projectId);
    if (project.projectKind !== "reverse") {
      throw new AppError(400, "INVALID_PROJECT_KIND", "仅支持反推项目");
    }
    const { gender, age } = extractRoleDirectionFields(project);

    // 1. 先查是否已有匹配结果
    const existingMatches = await ctx.projectCharacterService.listByProjectId(projectId);
    const libraryMatches = existingMatches.filter((m) => m.sourceType === "library");
    if (libraryMatches.length > 0) {
      // 加载完整角色数据
      const characters = await Promise.all(
        libraryMatches.map((m) => ctx.repos.libraryCharacters.findById(m.libraryCharacterId))
      );
      return {
        characters: characters.filter((c) => c !== null),
        alreadyMatched: true,
      };
    }

    // 2. 无已有结果，执行匹配并保存
    const characters = await ctx.projectCharacterService.matchByOutfit({
      projectId,
      userId: user.id,
      outfitSummary: typeof body.outfitSummary === "string" ? body.outfitSummary.trim() : undefined,
      roleDirectionPrompt: typeof body.roleDirectionPrompt === "string" ? body.roleDirectionPrompt.trim() : undefined,
      selectedCharacterName: typeof body.selectedCharacterName === "string" ? body.selectedCharacterName.trim() : undefined,
      gender,
      age,
      topN: 4,
    });

    return {
      characters,
      alreadyMatched: false,
    };
  };

  app.get("/projects/:projectId/characters/match-candidates", getMatchCandidates);
  app.get("/image-projects/:projectId/characters/match-candidates", getMatchCandidates);
  app.get("/reverse-projects/:projectId/characters/match-candidates", getMatchCandidates);
  app.post("/projects/:projectId/characters/match-by-outfit", matchByOutfit);
  app.post("/image-projects/:projectId/characters/match-by-outfit", matchByOutfitImage);
  app.post("/reverse-projects/:projectId/characters/match-by-outfit", matchByOutfitReverse);
}
