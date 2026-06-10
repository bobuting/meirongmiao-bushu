import type { FastifyInstance, RouteHandlerMethod } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { User } from "../contracts/types.js";
import type { ThemeConfig } from "../contracts/types.js";
import { AppError } from "../core/errors.js";
import { ThemeService, ThemeAdminService } from "../modules/theme-service.js";

/**
 * 主题路由处理器接口 - 用户端
 */
export interface ThemeRouteHandlers {
  readonly listEnabledThemes: RouteHandlerMethod;
  readonly getCurrentUserTheme: RouteHandlerMethod;
  readonly setCurrentUserTheme: RouteHandlerMethod;
  readonly uploadUserLogo: RouteHandlerMethod;
  readonly getUserCreatedTheme: RouteHandlerMethod;
}

/**
 * 主题路由处理器接口 - 管理端
 */
export interface ThemeAdminRouteHandlers {
  readonly listAllThemes: RouteHandlerMethod;
  readonly listThemesPaginated: RouteHandlerMethod;
  readonly createTheme: RouteHandlerMethod;
  readonly updateTheme: RouteHandlerMethod;
  readonly deleteTheme: RouteHandlerMethod;
  readonly toggleTheme: RouteHandlerMethod;
}

/**
 * 注册用户端主题路由
 */
export function registerThemeRoutes(
  app: FastifyInstance,
  handlers: ThemeRouteHandlers,
): void {
  // 获取所有可用主题列表
  app.get("/themes", handlers.listEnabledThemes);

  // 获取当前用户的主题配置
  app.get("/themes/current", handlers.getCurrentUserTheme);

  // 设置当前用户主题
  app.put("/themes/current", handlers.setCurrentUserTheme);

  // 上传用户自定义Logo
  app.post("/themes/current/logo", handlers.uploadUserLogo);

  // 获取用户创建的主题
  app.get("/themes/my-theme", handlers.getUserCreatedTheme);
}

/**
 * 注册管理端主题路由
 */
export function registerThemeAdminRoutes(
  app: FastifyInstance,
  handlers: ThemeAdminRouteHandlers,
): void {
  // 获取所有主题（含禁用的）
  app.get("/admin/themes", handlers.listAllThemes);

  // 分页查询主题
  app.get("/admin/themes/paginated", handlers.listThemesPaginated);

  // 创建新主题
  app.post("/admin/themes", handlers.createTheme);

  // 更新主题
  app.put("/admin/themes/:themeId", handlers.updateTheme);

  // 删除主题
  app.delete("/admin/themes/:themeId", handlers.deleteTheme);

  // 启用/禁用主题
  app.put("/admin/themes/:themeId/toggle", handlers.toggleTheme);
}

/**
 * 创建用户端主题路由处理器
 * 全局单一主题模式
 */
export function createThemeRouteHandlersWithContext(
  ctx: AppContext,
  requireUser: (ctx: AppContext, request: Parameters<RouteHandlerMethod>[0]) => Promise<User>,
): ThemeRouteHandlers {
  const themeService = new ThemeService(ctx.repos.themes, ctx.clock);

  return {
    listEnabledThemes: async () => {
      return themeService.listEnabledThemes();
    },
    getCurrentUserTheme: async (request) => {
      const user = await requireUser(ctx, request);
      const payload = await themeService.getUserTheme(user.id);
      // 全局单一主题，使用全局配置的 logo 和系统名称
      return {
        userId: user.id,
        themeId: payload.theme.id,
        systemName: payload.systemName,
        customConfig: undefined, // 不再支持用户自定义配置
        customLogoUrl: payload.logoUrl,
        updatedAt: payload.theme.updatedAt,
        theme: payload.theme,
      };
    },
    setCurrentUserTheme: async (request) => {
      const user = await requireUser(ctx, request);
      const body = (request.body as {
        themeId?: string;
        systemName?: string;
        customConfig?: Record<string, unknown>;
      } | undefined) ?? {};

      // 全局单一主题模式下，更新全局配置
      const preference = await themeService.setUserTheme(
        user.id,
        body.themeId || "", // themeId 不再重要
        typeof body.systemName === "string" ? body.systemName : undefined,
        typeof body.customConfig === "object" && body.customConfig !== null
          ? (body.customConfig as unknown as ThemeConfig)
          : undefined,
      );
      const themePayload = await themeService.getUserTheme(user.id);
      return {
        ...preference,
        customLogoUrl: themePayload.logoUrl,
        theme: themePayload.theme,
      };
    },
    uploadUserLogo: async (request) => {
      const user = await requireUser(ctx, request);
      const body = (request.body as { logoUrl?: string | null } | undefined) ?? {};
      const logoUrl = typeof body.logoUrl === "string" ? body.logoUrl.trim() : null;
      await themeService.setUserLogo(user.id, logoUrl && logoUrl.length > 0 ? logoUrl : null);
      return { ok: true };
    },
    getUserCreatedTheme: async (request) => {
      const user = await requireUser(ctx, request);
      const themeAdminService = new ThemeAdminService(ctx.repos.themes, ctx.clock);
      // 返回全局单一主题
      return themeAdminService.getUserCreatedTheme(user.id);
    },
  };
}

/**
 * 创建管理端主题路由处理器
 * 全局单一主题模式
 */
export function createThemeAdminRouteHandlersWithContext(
  ctx: AppContext,
  requireAdmin: (ctx: AppContext, request: Parameters<RouteHandlerMethod>[0]) => Promise<User>,
): ThemeAdminRouteHandlers {
  const themeAdminService = new ThemeAdminService(ctx.repos.themes, ctx.clock);

  return {
    listAllThemes: async (request) => {
      await requireAdmin(ctx, request);
      return themeAdminService.listAllThemes();
    },
    listThemesPaginated: async (request) => {
      await requireAdmin(ctx, request);
      const query = (request.query as { page?: string; pageSize?: string; query?: string } | undefined) ?? {};
      const page = Math.max(1, Math.floor(Number(query.page ?? "1") || 1));
      const pageSize = Math.max(1, Math.min(100, Math.floor(Number(query.pageSize ?? "15") || 15)));
      const searchQuery = typeof query.query === "string" ? query.query.trim() : "";
      return themeAdminService.listThemesPaginated(
        page,
        pageSize,
        searchQuery.length > 0 ? searchQuery : undefined,
        undefined, // 不再需要 userId 过滤
      );
    },
    createTheme: async (request) => {
      await requireAdmin(ctx, request);
      const body = (request.body as {
        name?: string;
        displayName?: string;
        category?: "tech" | "ecommerce" | "fashion" | "kids" | "custom";
        config?: ThemeConfig;
        logoUrl?: string;
      } | undefined) ?? {};
      const name = String(body.name ?? "").trim();
      const displayName = String(body.displayName ?? "").trim();
      if (!name || !displayName || !body.category || !body.config) {
        throw new AppError(400, "THEME_PAYLOAD_INVALID", "name/displayName/category/config are required");
      }
      // 单一主题模式：创建时会自动更新已有主题
      return themeAdminService.createTheme({
        name,
        displayName,
        category: body.category,
        config: body.config,
        logoUrl: typeof body.logoUrl === "string" ? body.logoUrl.trim() || undefined : undefined,
        createdBy: undefined, // 不再记录创建者
      });
    },
    updateTheme: async (request) => {
      await requireAdmin(ctx, request);
      const params = request.params as { themeId: string };
      const body = (request.body as {
        name?: string;
        displayName?: string;
        category?: "tech" | "ecommerce" | "fashion" | "kids" | "custom";
        config?: ThemeConfig;
        logoUrl?: string;
        isEnabled?: boolean;
      } | undefined) ?? {};
      const patch: Partial<{
        name: string;
        displayName: string;
        category: "tech" | "ecommerce" | "fashion" | "kids" | "custom";
        config: ThemeConfig;
        logoUrl: string;
        isEnabled: boolean;
      }> = {};
      if (typeof body.name === "string") patch.name = body.name.trim();
      if (typeof body.displayName === "string") patch.displayName = body.displayName.trim();
      if (body.category) patch.category = body.category;
      if (body.config) patch.config = body.config;
      if (typeof body.logoUrl === "string") patch.logoUrl = body.logoUrl.trim();
      if (typeof body.isEnabled === "boolean") patch.isEnabled = body.isEnabled;
      return themeAdminService.updateTheme(params.themeId, patch);
    },
    deleteTheme: async (request) => {
      await requireAdmin(ctx, request);
      // 单一主题模式下不允许删除
      throw new AppError(400, "CANNOT_DELETE_SINGLE_THEME", "系统必须保留一个主题");
    },
    toggleTheme: async (request) => {
      await requireAdmin(ctx, request);
      const params = request.params as { themeId: string };
      const body = (request.body as { enabled?: boolean } | undefined) ?? {};
      if (typeof body.enabled !== "boolean") {
        throw new AppError(400, "THEME_ENABLED_REQUIRED", "enabled is required");
      }
      return themeAdminService.toggleTheme(params.themeId, body.enabled);
    },
  };
}