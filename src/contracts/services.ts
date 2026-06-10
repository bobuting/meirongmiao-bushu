import type {
  AppConfig,
  AssetClassificationResult,
  CharacterPreset,
  CharacterKind,
  CreditAccount,
  GarmentAsset,
  LibraryCharacter,
  ScriptData,
  ScriptTypeValue,
  OutfitPlan,
  Project,
  ProjectCharacter,
  ProviderCallAudit,
  ProviderConfig,
  ProviderRouteKey,
  ProviderType,
  ProviderRoutingPolicy,
  PublicResource,
  Resolution,
  ReviewDecisionStatus,
  ReviewRequest,
  ReverseTask,
  ScriptSourceType,
  ScriptVersion,
  StoryboardFrame,
  Theme,
  ThemeCategory,
  ThemeConfig,
  UploadAsset,
  User,
  UserThemePreference,
  FissionVideo,
  VideoJob,
  VideoJobStatus,
} from "./types.js";
import type { VideoExportMusicOptions } from "./video-export-contract.js";
import type { ReverseStoryboardLibraryItem } from "./reverse-storyboard-report.js";
import type { ReverseStoryboardLibraryVersionRecord } from "./reverse-storyboard-library-api.js";
import type {
  MyLibraryPagedResponse,
  MyScriptLibraryRecordDto,
  MyStoryboardLibraryRecordDto,
  UserScriptRecordDto,
} from "./my-library-api.js";
import type {
  SmartStoryboardLibraryCategory,
  SmartStoryboardLibraryItem,
  SmartStoryboardLibraryVersionRecord,
} from "./smart-storyboard-library-api.js";

export interface IAuthService {
  register(email: string, password: string, role?: "user" | "admin"): Promise<User>;
  login(email: string, password: string): Promise<{ token: string; user: User }>;
  requireUser(token: string): Promise<User>;
  requireUserById(userId: string): Promise<User>;
  logout(token: string): Promise<void>;
  forgotPasswordPlaceholder(): { message: string };
  changePassword(user: User, currentPassword: string, nextPassword: string): Promise<{ updatedAt: number }>;
}

export interface IAdminConfigService {
  get(): AppConfig;
  update(actor: User, partial: Partial<AppConfig>): Promise<AppConfig>;
  unlockUser(actor: User, userId: string): Promise<void>;
}

export interface IProviderAdminService {
  listProviders(actor: User): Promise<Array<ProviderConfig & { hasSecret: boolean; maskedSecret: string | null }>>;
  createProvider(
    actor: User,
    input: Pick<ProviderConfig, "name" | "type" | "vendor" | "baseUrl" | "model" | "callMode" | "accessKey" | "remark" | "options"> & { enabled?: boolean; secret?: string },
  ): Promise<ProviderConfig & { maskedSecret?: string }>;
  updateProvider(
    actor: User,
    providerId: string,
    patch: Partial<Pick<ProviderConfig, "name" | "vendor" | "baseUrl" | "model" | "callMode" | "accessKey" | "remark" | "options" | "enabled">> & { secret?: string },
  ): Promise<ProviderConfig & { maskedSecret?: string }>;
  deleteProvider(actor: User, providerId: string): Promise<void>;
  upsertSecret(actor: User, providerId: string, secret: string): Promise<{ providerId: string; maskedSecret: string }>;
  listPolicies(actor: User): Promise<ProviderRoutingPolicy[]>;
  createPolicy(
    actor: User,
    input: {
      routeKey: ProviderRouteKey;
      type: ProviderType;
      primaryProviderId: string;
      fallbackProviderIds?: string[];
      timeoutMs?: number;
      retryCount?: number;
      enabled?: boolean;
      description?: string;
    },
  ): Promise<ProviderRoutingPolicy>;
  updatePolicy(
    actor: User,
    policyId: string,
    patch: Partial<
      Pick<ProviderRoutingPolicy, "primaryProviderId" | "fallbackProviderIds" | "timeoutMs" | "retryCount" | "enabled" | "description" | "sortOrder">
    >,
  ): Promise<ProviderRoutingPolicy>;
  deletePolicy(actor: User, policyId: string): Promise<void>;
  recordCallAudit(
    input: Omit<ProviderCallAudit, "id" | "createdAt"> & { createdAt?: number; slowRequestThresholdMs?: number },
  ): ProviderCallAudit;
  updateCallAudit(
    input: Partial<Omit<ProviderCallAudit, "createdAt">> & {
      auditId: string;
      slowRequestThresholdMs?: number;
    },
  ): ProviderCallAudit;
  appendCallAuditAttempt(
    input: {
      auditId: string;
      attempt: {
        sequence: number;
        providerId: string;
        model: string;
        paramsSummary: string;
        status: "success" | "error" | "timeout";
        latencyMs: number;
        errorCode: string | null;
        errorMessage: string | null;
        fallbackReason: string | null;
      };
    },
  ): void;
  listCallAudits(actor: User, limit?: number): Promise<ProviderCallAudit[]>;
  listCallAuditsSummary(actor: User, limit?: number): Promise<ProviderCallAudit[]>;
  getCallAuditById(actor: User, id: string): Promise<ProviderCallAudit | null>;
  clearCallAudits(actor: User): Promise<{ removed: number }>;
}

export interface IUserAdminService {
  listUsers(actor: User): Promise<Array<{
    id: string;
    email: string;
    role: "admin" | "user";
    createdAt: number;
    failedAttempts: number;
    lockUntil: number | null;
    creditBalance: number;
    creditExpiresAt: number;
    companyName?: string;
  }>>;
  setUserLock(
    actor: User,
    userId: string,
    locked: boolean,
  ): Promise<{ id: string; lockUntil: number | null; failedAttempts: number }>;
  adjustCredits(
    actor: User,
    userId: string,
    delta: number,
    reason: string,
  ): Promise<CreditAccount>;
}

export interface IProjectService {
  createProject(user: User, name: string, projectKind?: "image" | "video" | "reverse" | "outfit_change", reverseScriptId?: string | null): Promise<Project>;
  requireOwnerProject(user: { id: string }, projectId: string): Promise<Project>;
  renameProject(user: { id: string }, projectId: string, name: string): Promise<Project>;
  deleteProject(user: { id: string }, projectId: string): Promise<void>;
  updateLastVisitedStep(user: { id: string }, projectId: string, step: number): Promise<Project>;
  setStatus(project: Project, status: Project["status"]): Promise<Project>;
  saveProject(project: Project): Promise<Project>;
  updateExportUrl(projectId: string, exportUrl: string | null, options?: { durationSec?: number | null }): Promise<void>;
  completeProjectVideo(projectId: string, payload: {
    exportUrl: string;
    durationSec?: number;
    lastVisitedStep?: number;
    videoCoverImageUrl?: string | null;
    backgroundMusicUrl?: string | null;
    backgroundMusicTitle?: string | null;
  }): Promise<void>;
}

export interface IUploadService {
  upload(
    user: User,
    projectId: string,
    files: Array<{ garmentAssetId: string; fileName: string; sizeMb: number }>,
  ): Promise<UploadAsset[]>;
}

export interface IOutfitService {
  recommend(user: User, projectId: string, ctx: import("../core/app-context.js").AppContext, options?: { bypassCache?: boolean }): Promise<OutfitPlan[]>;
  select(user: User, projectId: string, planId: string): Promise<OutfitPlan>;
}

export interface ICharacterService {
  listPresets(user: User): Promise<CharacterPreset[]>;
}

export interface IScriptService {
  generate(
    user: User,
    projectId: string,
    sourceType: ScriptSourceType,
    durationSec: number,
    prompt: string,
  ): Promise<ScriptVersion>;
  edit(
    user: User,
    projectId: string,
    scriptId: string,
    patch: Partial<ScriptVersion["payload"]>,
  ): Promise<ScriptVersion>;
  latestVersion(projectId: string): Promise<ScriptVersion | null>;
}

export interface IStoryboardService {
  generate(user: User, projectId: string, frameCount?: number): Promise<StoryboardFrame[]>;
  selectVariant(
    user: User,
    projectId: string,
    frameId: string,
    variantIndex: number,
  ): Promise<StoryboardFrame>;
}

export interface IVideoJobService {
  create(
    user: User,
    projectId: string,
    input?: {
      source?: "auto" | "manual";
      targetSceneIndex?: number;
    },
  ): Promise<VideoJob>;
  complete(
    user: User,
    projectId: string,
    jobId: string,
    input: {
      status: Extract<VideoJobStatus, "succeeded" | "failed" | "timeout">;
      durationMinutes: number;
      /** 可选的错误信息，用于 failed/timeout 状态 */
      error?: {
        code: string;
        message: string;
      };
    },
  ): Promise<VideoJob>;
}

export interface ICreditService {
  ensureAccount(userId: string, initialBalance?: number): Promise<CreditAccount>;
  spend(userId: string, baseCost: number, resolution: Resolution, meta?: { operation?: string; reason?: string; routeKey?: string; projectId?: string }): Promise<number>;
  updatePolicy(validityDays: number, mockDefault: number): Promise<void>;
  freeze(userId: string, amount: number, meta?: { routeKey?: string; operation?: string; projectId?: string }): Promise<string>;
  unfreeze(userId: string, freezeId: string): Promise<void>;
  deductFrozen(userId: string, freezeId: string, actualCost: number): Promise<number>;
  cleanupExpiredFreezes(): Promise<number>;
}

export interface IFissionVideoService {
  listAll(): Promise<FissionVideo[]>;
  getById(id: string): Promise<FissionVideo | null>;
  listByCreator(creatorId: string): Promise<FissionVideo[]>;
  listByProject(projectId: string, includeDeprecated?: boolean): Promise<FissionVideo[]>;
  create(video: FissionVideo): Promise<FissionVideo>;
  update(video: FissionVideo): Promise<FissionVideo>;
  /** 弃用视频（软删除） */
  deprecate(id: string, userId: string): Promise<boolean>;
}

export interface IThemeService {
  listEnabledThemes(): Promise<Theme[]>;
  getUserTheme(userId: string): Promise<{
    theme: Theme;
    preference: UserThemePreference | null;
    systemName: string;
    logoUrl: string | null;
  }>;
  setUserTheme(
    userId: string,
    themeId: string,
    systemName?: string,
    customConfig?: Partial<ThemeConfig>,
  ): Promise<UserThemePreference>;
  setUserLogo(userId: string, logoUrl: string | null): Promise<UserThemePreference>;
}

export interface ThemeListPage {
  items: Theme[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface IThemeAdminService {
  listAllThemes(): Promise<Theme[]>;
  getUserCreatedTheme(userId: string): Promise<Theme | null>;
  listThemesPaginated(page?: number, pageSize?: number, query?: string, userId?: string): Promise<ThemeListPage>;
  createTheme(input: {
    name: string;
    displayName: string;
    category: ThemeCategory;
    config: ThemeConfig;
    logoUrl?: string;
    createdBy?: string;
  }): Promise<Theme>;
  updateTheme(
    themeId: string,
    patch: Partial<Pick<Theme, "name" | "displayName" | "category" | "config" | "logoUrl" | "isEnabled">>,
  ): Promise<Theme>;
  toggleTheme(themeId: string, enabled: boolean): Promise<Theme>;
  deleteTheme(themeId: string): Promise<void>;
}

export interface IReverseService {
  parseFromUrl(user: User, projectId: string, url: string): Promise<ReverseTask>;
  parseFromLocalFile(user: User, projectId: string, fileName: string): Promise<ReverseTask>;
}

export interface IReviewService {
  applyPublish(
    user: User,
    resourceType: "reverse_script",
    resourceId: string,
    squareCategory: "男装" | "女装" | "男童装" | "女童装" | null,
  ): Promise<ReviewRequest>;
  review(actor: User, reviewId: string, status: ReviewDecisionStatus): Promise<ReviewRequest>;
  confirmPublish(actor: User, reviewId: string): Promise<PublicResource>;
}

export interface ISquareService {
  listPublic(): Promise<PublicResource[]>;
  listMyPrivate(user: User): Promise<string[]>;
}

export interface IAssetLibraryService {
  list(user: User): Promise<GarmentAsset[]>;
  listPaged(
    user: User,
    options?: {
      page?: number;
      pageSize?: number;
      category?: string;
      keyword?: string;
    },
  ): Promise<{
    items: GarmentAsset[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasMore: boolean;
  }>;
  create(
    user: User,
    input: {
      name: string;
      type: "image" | "video";
      category: "top" | "bottom" | "shoes" | "accessory" | "suit" | "dress" | "outer" | "video";
      mainImageUrl: string;
      subImageUrl1?: string | null;
      subImageUrl2?: string | null;
      subImageUrl3?: string | null;
      flatLayImageUrl?: string | null;
      maskedImageUrl?: string | null;  // 遮罩预处理后的图片URL
      sizeMb: number;
      source?: string;
      // 服饰扩展属性
      description?: string | null;
      mainColor?: string | null;
      material?: string | null;
      pattern?: string | null;
      fit?: string | null;
      length?: string | null;
      neckline?: string | null;
      sleeve?: string | null;
      style?: string | null;
      occasion?: string | null;
      classification?: AssetClassificationResult;
      // 电商卖点（从图片分析提取）
      sellingPoints?: Array<{ point: string; category: string; priority: number }>;
    },
  ): Promise<GarmentAsset>;
  update(
    user: User,
    assetId: string,
    patch: Partial<
      Pick<
        GarmentAsset,
        | "name"
        | "category"
        | "mainImageUrl"
        | "subImageUrl1"
        | "subImageUrl2"
        | "subImageUrl3"
        | "flatLayImageUrl"
        | "maskedImageUrl"
        | "sizeMb"
        | "description"
        | "mainColor"
        | "material"
        | "pattern"
        | "fit"
        | "length"
        | "neckline"
        | "sleeve"
        | "style"
        | "occasion"
        | "sellingPoints"
      >
    >,
  ): Promise<GarmentAsset>;
  remove(user: User, assetId: string): Promise<void>;
}

export interface ICharacterLibraryService {
  list(user: User): Promise<LibraryCharacter[]>;
  listPaged(
    user: User,
    options?: {
      page?: number;
      pageSize?: number;
      gender?: string;
      tags?: string[];
      keyword?: string;
      hasFiveView?: boolean;
    },
  ): Promise<{
    items: LibraryCharacter[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasMore: boolean;
  }>;
  getById(characterId: string): Promise<LibraryCharacter | null>;
  create(
    user: User,
    input: {
      name: string;
      kind: CharacterKind;
      thumbnailUrl?: string;
      tags?: string[];
      /** @deprecated 不再使用 */
      views?: string[];
      fiveViewOssImageUrl?: string | null;
      videoPreview?: string | null;
      /** 五视图场景一：有 projectId 时不需要 thumbnailUrl */
      projectId?: string;
      /** 角色状态：processing（生成中）或 ready（就绪） */
      status?: "processing" | "ready";
      // 角色预设信息（统一归一化后的格式）
      ethnicity?: string | null;
      gender?: "male" | "female" | null;
      age?: number | null;
      style?: string | null;
    },
  ): Promise<LibraryCharacter & { fiveViewId?: string }>;
  update(
    user: User,
    characterId: string,
    patch: Partial<
      Pick<LibraryCharacter, "name" | "tags" | "thumbnailUrl" | "videoPreview" | "status" | "kind" | "views" | "fiveViewOssImageUrl" | "viewSession">
    >,
  ): Promise<LibraryCharacter>;
  generateViews(user: User, characterId: string): Promise<LibraryCharacter>;
  remove(user: User, characterId: string): Promise<void>;
}

export interface IProjectCharacterService {
  /** 获取项目的所有关联角色 */
  listByProjectId(projectId: string): Promise<ProjectCharacter[]>;
  /** 获取项目当前选中的角色 */
  getSelected(projectId: string): Promise<ProjectCharacter | null>;
  /** 为项目添加角色关联 */
  add(params: { projectId: string; libraryCharacterId: string; role?: "main" | "secondary"; sourceType?: "generated" | "library"; generationSlot?: number }): Promise<ProjectCharacter>;
  /** 为项目选中指定角色 */
  select(projectId: string, libraryCharacterId: string): Promise<void>;
  /** 移除项目的角色关联 */
  remove(projectId: string, libraryCharacterId: string): Promise<void>;
  /** @deprecated 使用 getOrMatchLibraryRecommendations 替代 */
  matchByOutfit(params: {
    projectId: string;
    userId: string;
    outfitSummary?: string;
    roleDirectionPrompt?: string;
    selectedCharacterName?: string;
    gender?: string;
    age?: number;
    topN?: number;
  }): Promise<LibraryCharacter[]>;
  /**
   * 获取角色库推荐角色（懒匹配）
   * 已有结果直接返回，否则触发匹配后返回
   */
  getOrMatchLibraryRecommendations(params: {
    projectId: string;
    userId: string;
    /** 角色预设性别 */
    gender?: string;
    /** 角色预设年龄 */
    age?: number;
    topN?: number;
  }): Promise<{
    records: import("./types.js").ProjectCharacter[];
    characters: import("./types.js").LibraryCharacter[];
    matched: boolean;
  }>;
}

export interface IScriptLibraryService {
  /** 创建脚本 */
  create(
    userId: string,
    params: {
      projectId?: string;
      title: string;
      content: string;
      type: ScriptTypeValue;
      tags?: string[];
      sourceScriptId?: string;
      previousScriptId?: string;
      /** LLM 反推结构化分析数据（用于填充 nrm_script_data 的分析字段） */
      analysis?: {
        theme?: string;
        summary?: string;
        primaryEmotion?: string;
        videoType?: string;
        videoStyle?: string;
        fashionSuitable?: boolean;
        fashionReason?: string;
        emotionDetail?: Record<string, unknown>;
        onScreenPresence?: Record<string, unknown>;
        fashionStyles?: Record<string, unknown>[];
        editingAnalysis?: Record<string, unknown>;
        durationSeconds?: number;
        sourceOssUrl?: string;
        source?: string;
      };
    },
  ): Promise<ScriptData>;

  /** 按ID查询脚本 */
  findById(scriptId: string): Promise<ScriptData | null>;

  /** 按项目ID查询脚本列表 */
  listByProjectId(projectId: string): Promise<ScriptData[]>;

  /** 按用户ID查询脚本列表 */
  listByUserId(userId: string): Promise<ScriptData[]>;

  /** 列出所有脚本（管理后台用） */
  list(): Promise<ScriptData[]>;

  /** 更新脚本 */
  update(
    userId: string,
    scriptId: string,
    params: {
      title?: string;
      content?: string;
      tags?: string[];
    },
  ): Promise<ScriptData>;

  /** 删除脚本（检查是否为项目选中脚本） */
  remove(userId: string, scriptId: string): Promise<void>;

  /** 批量删除脚本 */
  batchRemove(userId: string, scriptIds: string[]): Promise<{ deleted: number }>;
}

export interface IReverseStoryboardLibraryService {
  list(user: User): Promise<ReverseStoryboardLibraryItem[]>;
  get(user: User, itemId: string): Promise<ReverseStoryboardLibraryItem>;
  create(
    user: User,
    input: {
      id?: string;
      title: string;
      summary: string;
      tags?: readonly string[];
      sourceType: ReverseStoryboardLibraryItem["sourceType"];
      sourceMeta: ReverseStoryboardLibraryItem["sourceMeta"];
      report: ReverseStoryboardLibraryItem["report"];
      content: string;
    },
  ): Promise<ReverseStoryboardLibraryItem>;
  update(
    user: User,
    itemId: string,
    patch: Partial<Pick<ReverseStoryboardLibraryItem, "title" | "summary" | "tags" | "report" | "content">> & {
      sourceMeta?: ReverseStoryboardLibraryItem["sourceMeta"];
    },
  ): Promise<ReverseStoryboardLibraryItem>;
  remove(user: User, itemId: string): Promise<void>;
  listVersions(user: User, itemId: string): Promise<ReverseStoryboardLibraryVersionRecord[]>;
  rollback(user: User, itemId: string, version: number): Promise<ReverseStoryboardLibraryItem>;
  getCurrentVersion(user: User, itemId: string): Promise<number>;
}

export interface ISmartStoryboardLibraryService {
  listForAdmin(
    actor: User,
    query?: {
      ownerUserId?: string;
      category?: SmartStoryboardLibraryCategory;
      trendType?: "realtime" | "video";
    },
  ): Promise<SmartStoryboardLibraryItem[]>;
  listForOwner(user: User): Promise<SmartStoryboardLibraryItem[]>;
  get(actor: User, itemId: string): Promise<SmartStoryboardLibraryItem>;
  create(
    actor: User,
    input: {
      id?: string;
      ownerUserId: string;
      title: string;
      summary: string;
      tags?: readonly string[];
      category: SmartStoryboardLibraryCategory;
      sourceRef: SmartStoryboardLibraryItem["sourceRef"];
      relationRef?: SmartStoryboardLibraryItem["relationRef"];
      reverseSourceScriptText?: string | null;
      report: SmartStoryboardLibraryItem["report"];
      content: string;
    },
  ): Promise<SmartStoryboardLibraryItem>;
  update(
    actor: User,
    itemId: string,
    patch: Partial<
      Pick<
        SmartStoryboardLibraryItem,
        "title" | "summary" | "tags" | "category" | "sourceRef" | "relationRef" | "reverseSourceScriptText" | "report" | "content"
      >
    >,
  ): Promise<SmartStoryboardLibraryItem>;
  remove(actor: User, itemId: string): Promise<void>;
  listVersions(actor: User, itemId: string): Promise<SmartStoryboardLibraryVersionRecord[]>;
  rollback(actor: User, itemId: string, version: number): Promise<SmartStoryboardLibraryItem>;
  getCurrentVersion(actor: User, itemId: string): Promise<number>;
}

export interface IMyLibraryService {
  listMyScripts(
    user: User,
    query: {
      page?: unknown;
      pageSize?: unknown;
      keyword?: unknown;
      tags?: unknown;
      sourceType?: unknown;
      updatedAfter?: unknown;
      updatedBefore?: unknown;
    },
  ): Promise<MyLibraryPagedResponse<UserScriptRecordDto>>;
  getMyScriptById(user: User, scriptDataId: string): Promise<UserScriptRecordDto | null>;
  listMyStoryboards(
    user: User,
    query: {
      page?: unknown;
      pageSize?: unknown;
      keyword?: unknown;
      tags?: unknown;
      sourceType?: unknown;
      updatedAfter?: unknown;
      updatedBefore?: unknown;
    },
  ): Promise<MyLibraryPagedResponse<MyStoryboardLibraryRecordDto>>;
}
