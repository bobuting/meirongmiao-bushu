/**
 * 项目角色路由
 *
 * GET    /projects/:projectId/characters          获取项目的所有关联角色
 * POST   /projects/:projectId/characters          为项目添加角色关联
 * DELETE /projects/:projectId/characters/:characterId  移除项目的角色关联
 * PUT    /projects/:projectId/characters/:characterId/select  选中指定角色
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { IProjectCharacterService } from "../contracts/services.js";
import type { LibraryCharacter, ProjectCharacter, User } from "../contracts/types.js";
import { requireUser } from "../services/auth/route-guards.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectCharactersParams {
  projectId: string;
}

interface ProjectCharacterSelectParams {
  projectId: string;
  characterId: string;
}

interface AddProjectCharacterBody {
  libraryCharacterId: string;
  role?: "main" | "secondary";
  sourceType?: "generated" | "library";
  generationSlot?: number;
}

/** 项目角色 DTO：关联记录 + 角色详情 */
interface ProjectCharacterDto {
  id: string;
  projectId: string;
  libraryCharacterId: string;
  role: "main" | "secondary";
  sourceType: "generated" | "library"; // 角色来源：generated=生成角色，library=角色库推荐
  isSelected: boolean;
  generationSlot: number | null;
  character: {
    id: string;
    name: string;
    thumbnailUrl: string;
    tags: string[];
    views: string[];
    fiveViewOssImageUrl: string | null;
    status: string;
    kind: string;
    /** 激活五视图的状态（来自 nrm_character_five_views 表） */
    activeFiveViewStatus: "pending" | "processing" | "ready" | "failed" | null;
  } | null;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerProjectCharacterRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  const { projectCharacterService } = ctx;

  app.get(
    "/projects/:projectId/characters",
    async (request: FastifyRequest<{ Params: ProjectCharactersParams }>, reply: FastifyReply) => {
      const user = await requireUser(ctx, request);
      const project = await ctx.projectService.requireOwnerProject(user, request.params.projectId);
      const records = await projectCharacterService.listByProjectId(request.params.projectId);
      const items = await buildCharacterDtos(records, user, ctx);
      request.log.info({ count: records.length, dtoCount: items.length }, "[listProjectCharacters]");
      return { items, selectedCharacterId: project.selectedCharacterId ?? null };
    },
  );

  /**
   * GET /projects/:projectId/characters/library-recommendations
   * 获取角色库推荐角色（懒匹配：无结果时自动触发匹配）
   * 适用于所有项目类型（视频/图片/反推）
   */
  app.get(
    "/projects/:projectId/characters/library-recommendations",
    async (request: FastifyRequest<{ Params: ProjectCharactersParams }>) => {
      const user = await requireUser(ctx, request);
      const project = await ctx.projectService.requireOwnerProject(user, request.params.projectId);

      // 从项目的 selectedRoleDirection 提取性别和年龄
      const rd = project.selectedRoleDirection as Record<string, unknown> | null;
      const gender = typeof rd?.gender === "string" ? rd.gender : undefined;
      const age = typeof rd?.age === "number" ? rd.age : undefined;

      const { records, characters, matched } = await projectCharacterService.getOrMatchLibraryRecommendations({
        projectId: request.params.projectId,
        userId: user.id,
        gender,
        age,
        topN: 4,
      });

      // 构建 DTO（复用 buildCharacterDtos 的逻辑）
      const characterMap = new Map<string, LibraryCharacter>(
        characters.map((c) => [c.id, c]),
      );

      // 查询激活五视图的状态（复用 buildCharacterDtos 的逻辑）
      const activeFiveViewStatusMap = new Map<string, "pending" | "processing" | "ready" | "failed" | null>();
      for (const char of characters) {
        if (char.activeFiveViewId) {
          const fiveView = await ctx.repos.characterFiveViews.findById(char.activeFiveViewId);
          activeFiveViewStatusMap.set(char.id, fiveView?.status ?? null);
        } else {
          activeFiveViewStatusMap.set(char.id, null);
        }
      }

      const items = records.map((record) => {
        const libChar = characterMap.get(record.libraryCharacterId) ?? null;
        return {
          id: record.id,
          projectId: record.projectId,
          libraryCharacterId: record.libraryCharacterId,
          role: record.role,
          sourceType: record.sourceType,
          isSelected: record.isSelected,
          generationSlot: record.generationSlot,
          character: libChar
            ? {
                id: libChar.id,
                name: libChar.name,
                thumbnailUrl: libChar.thumbnailUrl,
                tags: libChar.tags,
                views: libChar.views,
                fiveViewOssImageUrl: libChar.fiveViewOssImageUrl,
                status: libChar.status,
                kind: libChar.kind,
                activeFiveViewStatus: activeFiveViewStatusMap.get(libChar.id) ?? null,
              }
            : null,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        };
      });

      request.log.info({ count: items.length, matched }, "[libraryRecommendations]");
      return { items };
    },
  );

  app.post(
    "/projects/:projectId/characters",
    async (request: FastifyRequest<{ Params: ProjectCharactersParams; Body: AddProjectCharacterBody }>) => {
      const user = await requireUser(ctx, request);
      await ctx.projectService.requireOwnerProject(user, request.params.projectId);
      const { libraryCharacterId, role, sourceType, generationSlot } = request.body;
      request.log.info({ projectId: request.params.projectId, libraryCharacterId, role, sourceType, generationSlot }, "[addProjectCharacter]");
      const record = await projectCharacterService.add({
        projectId: request.params.projectId,
        libraryCharacterId,
        role,
        sourceType,
        generationSlot,
      });
      request.log.info({ recordId: record.id }, "[addProjectCharacter] added");
      const [dto] = await buildCharacterDtos([record], user, ctx);
      request.log.info({ dtoLibraryCharId: dto?.character?.id ?? null }, "[addProjectCharacter] dto");
      return { item: dto };
    },
  );

  app.delete(
    "/projects/:projectId/characters/:characterId",
    async (request: FastifyRequest<{ Params: ProjectCharacterSelectParams }>) => {
      const user = await requireUser(ctx, request);
      await ctx.projectService.requireOwnerProject(user, request.params.projectId);
      await projectCharacterService.remove(request.params.projectId, request.params.characterId);
      return { success: true };
    },
  );

  app.put(
    "/projects/:projectId/characters/:characterId/select",
    async (request: FastifyRequest<{ Params: ProjectCharacterSelectParams }>) => {
      const user = await requireUser(ctx, request);
      await ctx.projectService.requireOwnerProject(user, request.params.projectId);
      await projectCharacterService.select(request.params.projectId, request.params.characterId);
      return { success: true };
    },
  );

  app.put(
    "/projects/:projectId/select-character/:characterId",
    async (request: FastifyRequest<{ Params: ProjectCharacterSelectParams }>) => {
      const user = await requireUser(ctx, request);
      await ctx.projectService.requireOwnerProject(user, request.params.projectId);
      const { projectId, characterId } = request.params;

      // 解析 characterId 格式：generated-{实际ID} 或 library-{实际ID}
      const actualCharacterId = characterId.startsWith("generated-") || characterId.startsWith("library-")
        ? characterId.split("-").slice(1).join("-")
        : characterId;

      // 1. 更新项目角色表的 is_selected
      await projectCharacterService.select(projectId, actualCharacterId);

      // 2. 更新项目表的 selected_character_id
      await ctx.repos.projects.updateSelectedCharacterId(projectId, actualCharacterId);

      // 2.5 更新项目封面为角色缩略图（生成角色 thumbnailUrl 为空时，fallback 到 fiveViewOssImageUrl）
      const selectedChar = await ctx.repos.libraryCharacters.findById(actualCharacterId, { includeDeleted: true });
      const coverUrl = selectedChar?.thumbnailUrl || selectedChar?.fiveViewOssImageUrl || null;
      if (coverUrl) {
        await ctx.repos.projects.updateCoverImage(projectId, coverUrl);
      }

      // 3. 更新项目状态（根据项目类型选择正确的状态）
      const project = await ctx.repos.projects.findById(projectId);
      const targetStatus = project?.projectKind === "image" ? "IMAGE_CHARACTER_SELECTED" : "CHARACTER_SELECTED";
      await ctx.repos.projects.updateStatus(projectId, targetStatus);

      return { success: true };
    },
  );
}

async function buildCharacterDtos(
  records: ProjectCharacter[],
  user: User,
  ctx: AppContext,
): Promise<ProjectCharacterDto[]> {
  if (records.length === 0) return [];

  // 按 ID 直接查询（含已删除角色），避免 list(user) 过滤掉项目仍引用的角色
  const characterIds = [...new Set(records.map((r) => r.libraryCharacterId))];
  const libraryChars: LibraryCharacter[] = [];
  for (const id of characterIds) {
    const char = await ctx.repos.libraryCharacters.findById(id, { includeDeleted: true });
    if (char) libraryChars.push(char);
  }
  const characterMap = new Map<string, LibraryCharacter>(
    libraryChars.map((c: LibraryCharacter) => [c.id, c]),
  );

  // 查询激活五视图的状态
  const activeFiveViewStatusMap = new Map<string, "pending" | "processing" | "ready" | "failed" | null>();
  for (const char of libraryChars) {
    if (char.activeFiveViewId) {
      const fiveView = await ctx.repos.characterFiveViews.findById(char.activeFiveViewId);
      activeFiveViewStatusMap.set(char.id, fiveView?.status ?? null);
    } else {
      activeFiveViewStatusMap.set(char.id, null);
    }
  }

  return records.map((record: ProjectCharacter) => {
    const libChar = characterMap.get(record.libraryCharacterId) ?? null;
    return {
      id: record.id,
      projectId: record.projectId,
      libraryCharacterId: record.libraryCharacterId,
      role: record.role,
      sourceType: record.sourceType,
      isSelected: record.isSelected,
      generationSlot: record.generationSlot,
      character: libChar
        ? {
            id: libChar.id,
            name: libChar.name,
            thumbnailUrl: libChar.thumbnailUrl,
            tags: libChar.tags,
            views: libChar.views,
            fiveViewOssImageUrl: libChar.fiveViewOssImageUrl,
            status: libChar.status,
            kind: libChar.kind,
            activeFiveViewStatus: activeFiveViewStatusMap.get(libChar.id) ?? null,
          }
        : null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  });
}
