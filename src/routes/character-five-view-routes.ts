/**
 * 角色五视图 API 路由
 * 三种场景：
 * 1. 服饰搭配五视图（项目内）— generateFiveView / generateFiveViewPreview
 * 2. 服饰+真人结合五视图（项目内 + 角色头像）— generateOutfitPortraitFiveViewPreview
 * 3. 真人五视图（角色管理页）— generateRealPortraitFiveViewRoute / generateRealPortraitFiveViewPreview
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import type { AppContext } from "../core/app-context.js";
import type { User, LibraryCharacter } from "../contracts/types.js";
import { AppError } from "../core/errors.js";
import { requireUser } from "../services/auth/route-guards.js";
import {
  generateCharacterFiveView,
  generateRealPortraitFiveView,
  generateOutfitPortraitFiveView,
  type FiveViewGenerationOptions,
  type RealPortraitFiveViewOptions,
  type OutfitPortraitFiveViewOptions,
} from "../modules/character-five-view-generation-service.js";

interface CharacterIdParams {
  characterId: string;
}

interface ViewIdParams {
  characterId: string;
  viewId: string;
}

/** 检查角色所有权 */
async function requireOwnerLibraryCharacter(
  ctx: AppContext,
  user: User,
  characterId: string,
): Promise<LibraryCharacter> {
  const character = await ctx.repos.libraryCharacters.findById(characterId);
  if (!character || character.userId !== user.id) {
    throw new AppError(404, "NOT_FOUND", "角色不存在");
  }
  return character;
}

/** 检查角色是否被项目使用 */
async function checkCharacterInUse(
  ctx: AppContext,
  characterId: string,
): Promise<{ inUse: boolean; projectCount: number }> {
  // 通过 nrm_projects.selected_character_id 查询使用了该角色的项目
  const projects = await ctx.repos.projects.findBySelectedCharacterId(characterId);
  const activeProjects = projects.filter(p => p.deletedAt === null);
  return {
    inUse: activeProjects.length > 0,
    projectCount: activeProjects.length,
  };
}

export function createCharacterFiveViewHandlers(ctx: AppContext) {
  /** 获取角色的所有五视图 */
  const listFiveViews = async (request: FastifyRequest<{ Params: CharacterIdParams }>) => {
    const user = await requireUser(ctx, request);
    const { characterId } = request.params;
    await requireOwnerLibraryCharacter(ctx, user, characterId);
    const views = await ctx.repos.characterFiveViews.findByCharacterId(characterId);
    return { items: views };
  };

  /** 创建新的五视图记录 */
  const createFiveView = async (request: FastifyRequest<{ Params: CharacterIdParams }>) => {
    const user = await requireUser(ctx, request);
    const { characterId } = request.params;
    await requireOwnerLibraryCharacter(ctx, user, characterId);
    const now = ctx.clock.now();
    const view = {
      id: randomUUID(),
      characterId,
      imageUrl: null,
      status: "pending" as const,
      isActive: false,
      prompt: null,
      model: null,
      generationParams: null,
      errorMessage: null,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await ctx.repos.characterFiveViews.create(view);
    return view;
  };

  /** 激活指定的五视图 */
  const activateFiveView = async (request: FastifyRequest<{ Params: ViewIdParams }>) => {
    const user = await requireUser(ctx, request);
    const { characterId, viewId } = request.params;
    await requireOwnerLibraryCharacter(ctx, user, characterId);

    // 允许在项目中直接切换五视图版本，无需检查使用状态

    const view = await ctx.repos.characterFiveViews.findById(viewId);
    if (!view || view.characterId !== characterId) {
      throw new AppError(404, "NOT_FOUND", "五视图不存在");
    }
    if (view.status !== "ready") {
      throw new AppError(400, "BAD_REQUEST", "五视图尚未生成完成");
    }
    await ctx.repos.characterFiveViews.setActive(characterId, viewId);
    return { success: true };
  };

  /** 删除五视图 */
  const deleteFiveView = async (request: FastifyRequest<{ Params: ViewIdParams }>) => {
    const user = await requireUser(ctx, request);
    const { characterId, viewId } = request.params;
    await requireOwnerLibraryCharacter(ctx, user, characterId);
    const view = await ctx.repos.characterFiveViews.findById(viewId);
    if (!view || view.characterId !== characterId) {
      throw new AppError(404, "NOT_FOUND", "五视图不存在");
    }
    await ctx.repos.characterFiveViews.delete(viewId);
    return { success: true };
  };

  /**
   * 生成五视图图板（预览模式 — 项目内，服饰搭配）
   * 根据 projectId 查询关联的服饰平铺图
   */
  const generateFiveViewPreview = async (request: FastifyRequest<{
    Body: {
      projectId?: string;
      flatLayImageUrls?: string[];
      promptCode?: string;
      characterPreset?: string;
      outfitInfo?: string;
      outfitMatching?: string;
    };
  }>) => {
    const user = await requireUser(ctx, request);
    const body = request.body ?? {};

    const options: FiveViewGenerationOptions = {
      projectId: body.projectId?.trim(),
      flatLayImageUrls: body.flatLayImageUrls?.map((u) => u.trim()).filter(Boolean),
      promptCode: body.promptCode?.trim(),
      characterPreset: body.characterPreset?.trim(),
      outfitInfo: body.outfitInfo?.trim(),
      outfitMatching: body.outfitMatching?.trim(),
    };

    const dummyCharacter = { id: "", userId: user.id } as LibraryCharacter;
    const view = await generateCharacterFiveView(ctx, dummyCharacter, options);
    return view;
  };

  /**
   * 生成真人五视图（预览模式 — 角色管理页）
   * 不需要服饰平铺图，仅使用角色分析字段
   */
  const generateRealPortraitFiveViewPreview = async (request: FastifyRequest<{
    Body: {
      portraitImageUrl?: string;
    };
  }>) => {
    const user = await requireUser(ctx, request);
    const body = request.body ?? {};

    const options: RealPortraitFiveViewOptions = {
      portraitImageUrl: body.portraitImageUrl?.trim(),
    };

    const dummyCharacter = { id: "", userId: user.id } as LibraryCharacter;
    const view = await generateRealPortraitFiveView(ctx, dummyCharacter, options);
    return view;
  };

  /**
   * 生成真人五视图（角色管理页，持久化到指定角色）
   */
  const generateRealPortraitFiveViewRoute = async (request: FastifyRequest<{
    Params: CharacterIdParams;
    Body: {
      force?: boolean;
    };
  }>) => {
    const user = await requireUser(ctx, request);
    const { characterId } = request.params;
    const character = await requireOwnerLibraryCharacter(ctx, user, characterId);
    const body = request.body ?? {};

    const force = body.force === true;

    // 检查角色是否被项目使用（仅在 force=true 时检查）
    if (force) {
      const usageCheck = await checkCharacterInUse(ctx, characterId);
      if (usageCheck.inUse) {
        throw new AppError(
          400,
          "CHARACTER_IN_USE",
          `该角色正在被 ${usageCheck.projectCount} 个项目使用，无法重新生成五视图。请先在项目中移除该角色。`
        );
      }
    }

    if (!force) {
      const existingViews = await ctx.repos.characterFiveViews.findByCharacterId(characterId);
      const readyViews = existingViews.filter((v) => v.status === "ready");
      if (readyViews.length > 0) {
        const activeView = readyViews.find((v) => v.isActive) ?? readyViews[0];
        return activeView;
      }
    }

    const view = await generateRealPortraitFiveView(ctx, character, {
      characterId,
      portraitImageUrl: character.thumbnailUrl,
    });
    return view;
  };

  /**
   * 生成服饰+真人结合五视图（预览模式 — 项目内 + 角色头像同时传入）
   */
  const generateOutfitPortraitFiveViewPreview = async (request: FastifyRequest<{
    Body: {
      projectId?: string;
      portraitImageUrl: string;
      outfitInfo?: string;
      outfitMatching?: string;
    };
  }>) => {
    const user = await requireUser(ctx, request);
    const body = request.body ?? {};

    if (!body.portraitImageUrl) {
      throw new AppError(400, "BAD_REQUEST", "缺少角色头像 URL");
    }

    const options: OutfitPortraitFiveViewOptions = {
      projectId: body.projectId?.trim(),
      portraitImageUrl: body.portraitImageUrl.trim(),
      outfitInfo: body.outfitInfo?.trim(),
      outfitMatching: body.outfitMatching?.trim(),
    };

    const dummyCharacter = { id: "", userId: user.id } as LibraryCharacter;
    const view = await generateOutfitPortraitFiveView(ctx, dummyCharacter, options);
    return view;
  };

  /** 生成五视图图板（服饰搭配） */
  const generateFiveView = async (request: FastifyRequest<{
    Params: CharacterIdParams;
    Body: {
      projectId?: string;
      flatLayImageUrls?: string[];
      characterPreset?: string;
      outfitInfo?: string;
      outfitMatching?: string;
      force?: boolean;
    };
  }>) => {
    const user = await requireUser(ctx, request);
    const { characterId } = request.params;
    const character = await requireOwnerLibraryCharacter(ctx, user, characterId);

    const body = request.body ?? {};

    // 检查角色是否被项目使用（仅在 force=true 时检查，因为不强制时可能返回已有五视图）
    const force = body.force === true;
    if (force) {
      const usageCheck = await checkCharacterInUse(ctx, characterId);
      if (usageCheck.inUse) {
        throw new AppError(
          400,
          "CHARACTER_IN_USE",
          `该角色正在被 ${usageCheck.projectCount} 个项目使用，无法重新生成五视图。请先在项目中移除该角色。`
        );
      }
    }

    const options: FiveViewGenerationOptions = {
      characterId,
      projectId: body.projectId?.trim(),
      flatLayImageUrls: body.flatLayImageUrls?.map((u) => u.trim()).filter(Boolean),
      characterPreset: typeof body.characterPreset === "string" ? body.characterPreset.trim() : undefined,
      outfitInfo: typeof body.outfitInfo === "string" ? body.outfitInfo.trim() : undefined,
      outfitMatching: typeof body.outfitMatching === "string" ? body.outfitMatching.trim() : undefined,
    };

    if (!force) {
      const existingViews = await ctx.repos.characterFiveViews.findByCharacterId(characterId);
      const readyViews = existingViews.filter((v) => v.status === "ready");
      if (readyViews.length > 0) {
        const activeView = readyViews.find((v) => v.isActive) ?? readyViews[0];
        return activeView;
      }
    }

    const view = await generateCharacterFiveView(ctx, character, options);
    return view;
  };

  return { listFiveViews, createFiveView, activateFiveView, deleteFiveView, generateFiveView, generateRealPortraitFiveViewRoute, generateFiveViewPreview, generateRealPortraitFiveViewPreview, generateOutfitPortraitFiveViewPreview };
}

export function registerCharacterFiveViewRoutes(app: FastifyInstance, ctx: AppContext) {
  const handlers = createCharacterFiveViewHandlers(ctx);
  app.get("/library/characters/:characterId/five-views", handlers.listFiveViews);
  app.post("/library/characters/:characterId/five-views", handlers.createFiveView);
  app.post("/library/characters/:characterId/five-views/generate", handlers.generateFiveView);
  // 角色管理页真人五视图（持久化到指定角色）
  app.post("/library/characters/:characterId/five-views/generate-real-portrait", handlers.generateRealPortraitFiveViewRoute);
  app.put("/library/characters/:characterId/five-views/:viewId/activate", handlers.activateFiveView);
  app.delete("/library/characters/:characterId/five-views/:viewId", handlers.deleteFiveView);
  // 预览模式：项目内服饰搭配五视图
  app.post("/library/five-views/preview", handlers.generateFiveViewPreview);
  // 预览模式：角色管理页真人五视图
  app.post("/library/five-views/preview-real-portrait", handlers.generateRealPortraitFiveViewPreview);
  // 预览模式：服饰+真人结合五视图（项目内 + 角色头像）
  app.post("/library/five-views/preview-outfit-portrait", handlers.generateOutfitPortraitFiveViewPreview);
}
