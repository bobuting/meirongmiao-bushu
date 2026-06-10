import type { IThemeRepository } from "../contracts/repository-ports/theme-repository.js";
import type { IRepositoryClock } from "../contracts/repository-ports/common.js";
import type { IThemeAdminService, IThemeService } from "../contracts/services.js";
import type { Theme, ThemeCategory, ThemeConfig, UserThemePreference } from "../contracts/types.js";
import { AppError, assertCondition } from "../core/errors.js";

// function requireAdmin(actor: User): void {
//   assertCondition(actor.role === "admin", 403, "FORBIDDEN", "Admin only");
// }

/**
 * 默认系统名称
 */
const DEFAULT_SYSTEM_NAME = "内容喵";

/**
 * 默认主题ID（内容喵主题）
 */
const DEFAULT_THEME_NAME = "neirongmiao";

/**
 * 默认 Logo URL
 */
const DEFAULT_LOGO_URL = "/logo.png";

/**
 * 主题服务 - 全局单一主题模式
 * 系统只有一个主题，所有用户共享
 * 公司名称（systemName）和 Logo 都存储在 themes 表中
 */
export class ThemeService implements IThemeService {
  constructor(
    private readonly themes: IThemeRepository,
    private readonly clock: IRepositoryClock,
  ) {}

  /**
   * 获取所有启用的主题列表（现在只返回单一主题）
   */
  async listEnabledThemes(): Promise<Theme[]> {
    const singleTheme = await this.getOrCreateSingleTheme();
    return [singleTheme];
  }

  /**
   * 获取全局主题配置（不再区分用户）
   */
  async getUserTheme(_userId: string): Promise<{
    theme: Theme;
    preference: UserThemePreference | null;
    systemName: string;
    logoUrl: string | null;
  }> {
    const theme = await this.getOrCreateSingleTheme();

    // 直接从主题获取系统名称和 logo
    const systemName = theme.displayName || DEFAULT_SYSTEM_NAME;
    const logoUrl = theme.logoUrl || DEFAULT_LOGO_URL;

    return {
      theme,
      preference: null, // 不再使用用户偏好
      systemName,
      logoUrl,
    };
  }

  /**
   * 设置全局主题（更新单一主题）
   */
  async setUserTheme(
    _userId: string,
    _themeId: string,
    systemName?: string,
    customConfig?: Partial<ThemeConfig>,
  ): Promise<UserThemePreference> {
    const theme = await this.getOrCreateSingleTheme();

    // 更新主题显示名称（公司名称）
    if (systemName) {
      theme.displayName = systemName;
    }

    // 更新主题配置
    if (customConfig) {
      const mergedConfig = { ...theme.config, ...customConfig };
      theme.config = mergedConfig;
      theme.updatedAt = this.clock.now();
      await this.themes.upsert(theme);
    }

    // 返回一个虚拟的 preference（不再实际存储）
    return {
      userId: _userId,
      themeId: theme.id,
      systemName: theme.displayName,
      customConfig,
      customLogoUrl: theme.logoUrl || undefined,
      updatedAt: this.clock.now(),
    };
  }

  /**
   * 设置全局自定义Logo
   */
  async setUserLogo(userId: string, logoUrl: string | null): Promise<UserThemePreference> {
    const theme = await this.getOrCreateSingleTheme();

    // 更新主题 logo
    theme.logoUrl = logoUrl || DEFAULT_LOGO_URL;
    theme.updatedAt = this.clock.now();
    await this.themes.upsert(theme);

    return {
      userId,
      themeId: theme.id,
      systemName: theme.displayName,
      customLogoUrl: theme.logoUrl || undefined,
      updatedAt: this.clock.now(),
    };
  }

  /**
   * 获取或创建单一主题
   * 如果不存在则创建默认主题
   */
  private async getOrCreateSingleTheme(): Promise<Theme> {
    // 获取第一个（也是唯一的）主题
    const themes = await this.themes.list();

    if (themes.length > 0) {
      // 返回现有主题（应该只有一个）
      return themes[0];
    }

    // 创建默认主题
    const now = this.clock.now();
    const defaultTheme: Theme = {
      id: this.clock.generateId(),
      name: DEFAULT_THEME_NAME,
      displayName: DEFAULT_SYSTEM_NAME,
      category: "custom",
      isSystem: true,
      isEnabled: true,
      config: {
        colors: {
          primary: "#e68c19",
          primaryHover: "#d07d0f",
          primaryActive: "#b86e00",
          primaryLight: "#fff4e6",
          accent: "#00a8ff",
          accentHover: "#0090e0",
          accentActive: "#0078c2",
          secondary: "#6c757d",
          background: "#ffffff",
          backgroundWarm: "#faf8f5",
          surface: "#f5f5f5",
          text: {
            primary: "#333333",
            secondary: "#666666",
            muted: "#999999",
          },
          border: "#e0e0e0",
          borderFocus: "#e68c19",
        },
        gradients: {
          primary: "linear-gradient(135deg, #e68c19 0%, #d07d0f 100%)",
          primaryHover: "linear-gradient(135deg, #d07d0f 0%, #b86e00 100%)",
          primaryActive: "linear-gradient(135deg, #b86e00 0%, #9a5c00 100%)",
        },
        fonts: {
          main: "system-ui, -apple-system, sans-serif",
          display: "system-ui, -apple-system, sans-serif",
        },
        animations: {
          transitionSpeed: "0.2s",
          hoverTransform: "translateY(-2px)",
        },
      },
      logoUrl: DEFAULT_LOGO_URL,
      createdAt: now,
      updatedAt: now,
    };

    await this.themes.upsert(defaultTheme);
    return defaultTheme;
  }
}

/**
 * 分页查询结果
 */
export interface PaginatedThemes {
  items: Theme[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 主题管理服务 - 全局单一主题模式
 * 公司名称和 Logo 都存储在 themes 表中
 */
export class ThemeAdminService implements IThemeAdminService {
  constructor(
    private readonly themes: IThemeRepository,
    private readonly clock: IRepositoryClock,
  ) {}

  /**
   * 获取所有主题（现在只返回单一主题）
   */
  async listAllThemes(): Promise<Theme[]> {
    const themes = await this.themes.list();
    return themes.sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * 获取单一系统主题（不再按用户区分）
   */
  async getUserCreatedTheme(_userId: string): Promise<Theme | null> {
    // 返回第一个（也是唯一的）主题
    const themes = await this.themes.list();
    return themes.length > 0 ? themes[0] : null;
  }

  /**
   * 分页查询主题（现在只返回单一主题）
   */
  async listThemesPaginated(_page: number = 1, _pageSize: number = 15, query?: string, _userId?: string): Promise<PaginatedThemes> {
    const themes = await this.listAllThemes();

    // 单一主题模式下，搜索和过滤简化
    let filtered = themes;
    if (query && query.trim()) {
      const lowerQuery = query.toLowerCase().trim();
      filtered = themes.filter(
        (theme) =>
          theme.displayName.toLowerCase().includes(lowerQuery) ||
          theme.name.toLowerCase().includes(lowerQuery)
      );
    }

    const total = filtered.length;
    return {
      items: filtered,
      total,
      page: 1,
      pageSize: total,
      totalPages: 1,
    };
  }

  /**
   * 创建或更新主题（单一主题模式）
   * 如果主题已存在，则更新；否则创建
   */
  async createTheme(input: {
    name: string;
    displayName: string;
    category: ThemeCategory;
    config: ThemeConfig;
    logoUrl?: string;
    createdBy?: string;
  }): Promise<Theme> {
    const existingThemes = await this.themes.list();

    if (existingThemes.length > 0) {
      // 已有主题，执行更新
      const existing = existingThemes[0];
      return this.updateTheme(existing.id, {
        name: input.name,
        displayName: input.displayName,
        category: input.category,
        config: input.config,
        logoUrl: input.logoUrl,
      });
    }

    // 没有主题，创建新的
    const now = this.clock.now();
    const theme: Theme = {
      id: this.clock.generateId(),
      name: input.name,
      displayName: input.displayName,
      category: input.category,
      isSystem: true, // 单一主题标记为系统主题
      isEnabled: true,
      config: input.config,
      logoUrl: input.logoUrl,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    await this.themes.upsert(theme);
    return theme;
  }

  /**
   * 更新主题
   */
  async updateTheme(
    themeId: string,
    patch: Partial<Pick<Theme, "name" | "displayName" | "category" | "config" | "logoUrl" | "isEnabled">>,
  ): Promise<Theme> {
    const theme = await this.themes.findById(themeId);
    assertCondition(Boolean(theme), 404, "THEME_NOT_FOUND", "Theme not found");

    const target = theme as Theme;

    // 应用更新
    if (patch.name !== undefined) target.name = patch.name;
    if (patch.displayName !== undefined) target.displayName = patch.displayName;
    if (patch.category !== undefined) target.category = patch.category;
    if (patch.config !== undefined) target.config = patch.config;
    if (patch.logoUrl !== undefined) target.logoUrl = patch.logoUrl;
    if (patch.isEnabled !== undefined) target.isEnabled = patch.isEnabled;

    target.updatedAt = this.clock.now();
    await this.themes.upsert(target);

    return target;
  }

  /**
   * 启用/禁用主题（单一主题始终启用）
   */
  async toggleTheme(themeId: string, enabled: boolean): Promise<Theme> {
    const theme = await this.themes.findById(themeId);
    assertCondition(Boolean(theme), 404, "THEME_NOT_FOUND", "Theme not found");

    const target = theme as Theme;
    target.isEnabled = enabled;
    target.updatedAt = this.clock.now();
    await this.themes.upsert(target);

    return target;
  }

  /**
   * 删除主题（单一主题模式下不允许删除）
   */
  async deleteTheme(_themeId: string): Promise<void> {
    throw new AppError(400, "CANNOT_DELETE_SINGLE_THEME", "系统必须保留一个主题");
  }
}
