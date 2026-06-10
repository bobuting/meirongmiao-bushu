import { AdminConfigService } from "../modules/admin-config-service.js";
import { BusinessConfigService } from "../modules/business-config-service.js";
import { ExecutorRegistry } from "./executor-registry.js";
import { GlobalTaskConcurrencyService } from "../modules/global-task-concurrency-service.js";
import { QueueDispatcher } from "../modules/queue-dispatcher.js";
import { SSEManager } from "../modules/sse-manager.js";
import { AppError } from "./errors.js";
import { getLogger } from "./logger/index.js";
import { AuthService } from "../modules/auth-service.js";
import { CharacterService } from "../modules/character-service.js";
import { CharacterLibraryService } from "../modules/character-library-service.js";
import { ProjectCharacterService } from "../modules/project-character-service.js";
import { CreditService } from "../modules/credit-service.js";
import { getFinalVideosDbService } from "../service/final-videos-db-service.js";
import { ModelPresetService } from "../modules/model-preset-service.js";
import { MyLibraryService } from "../modules/my-library-service.js";
import { OutfitService } from "../modules/outfit-service.js";
import { ProjectService } from "../modules/project-service.js";
import { ProjectPromptDataService } from "../modules/project-prompt-data-service.js";
import { ProviderAdminService } from "../modules/provider-admin-service.js";
import { ReverseService } from "../modules/reverse-service.js";
import { ReverseStoryboardLibraryService } from "../modules/reverse-storyboard-library-service.js";
import { ReviewService } from "../modules/review-service.js";
import { UnifiedScriptService } from "../services/script/index.js";
import { SmartStoryboardLibraryService } from "../modules/smart-storyboard-library-service.js";
import { ScriptService } from "../modules/script-service.js";
import { SquareService } from "../modules/square-service.js";
import { StoryboardService } from "../modules/storyboard-service.js";
import { UserAdminService } from "../modules/user-admin-service.js";
import { AssetLibraryService } from "../modules/asset-library-service.js";
import { UploadService } from "../modules/upload-service.js";
import { VideoJobService } from "../modules/video-job-service.js";
import { DouyinPublishService } from "../modules/douyin-publish-service.js";
import { DouyinAuthService } from "../modules/douyin-auth-service.js";
import { DouyinRemoteLoginService } from "../modules/douyin-remote-login-service.js";
import { FunctionalRouteService } from "../modules/functional-route-service.js";
import { FileService } from "../services/file/file-service.js";
import { ProjectContextService, createProjectContextService } from "../modules/project-context/index.js";
import { CreditPricingService, type ICreditPricingService } from "../services/credit-pricing-service.js";
import type { AppConfig } from "../contracts/types.js";
import { DEFAULT_CONFIG } from "./config.js";
import type { IRepositoryClock } from "../contracts/repository-ports/common.js";
import type { RepositoryCollection } from "../repositories/index.js";
import { AppConfigService } from "../services/config/app-config-service.js";
import type {
  IAdminConfigService,
  IAuthService,
  ICharacterService,
  ICharacterLibraryService,
  IProjectCharacterService,
  ICreditService,
  IOutfitService,
  IProjectService,
  IProviderAdminService,
  IReverseService,
  IReverseStoryboardLibraryService,
  IReviewService,
  IScriptLibraryService,
  IScriptService,
  ISquareService,
  IStoryboardService,
  IUploadService,
  IUserAdminService,
  IVideoJobService,
  IAssetLibraryService,
  IMyLibraryService,
  ISmartStoryboardLibraryService,
} from "../contracts/services.js";
import type { FileEnvironment } from "../contracts/file-registry-contract.js";
import { createObjectStorageAdapter } from "../storage/runtime.js";
import type { IObjectStorageAdapter } from "../contracts/object-storage.js";
import type { IAuditStore } from "../persistence/audit-store.js";
import { MemoryAuditStore, UpgradableAuditStore } from "../persistence/audit-store.js";
import { createPgRepositories } from "../repositories/index.js";
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";

export interface AppContext {
  /** PG 连接池（用于需要直接数据库访问的 Service） */
  pool: Pool;
  repos: RepositoryCollection;
  clock: IRepositoryClock;
  configService: AppConfigService;
  /** 兼容层：提供旧的 store 接口 */
  store: {
    generateId: () => string;
    now: () => number;
    config: AppConfig;
    assets: Map<string, import("../contracts/types.js").UploadAsset>;
    garmentAssets: Map<string, import("../contracts/types.js").GarmentAsset>;
    libraryCharacters: Map<string, import("../contracts/types.js").LibraryCharacter>;
    scripts: Map<string, import("../contracts/types.js").ScriptVersion>;
    outfitPlans: Map<string, import("../contracts/types.js").OutfitPlan>;
    projects: Map<string, import("../contracts/types.js").Project>;
    users: Map<string, import("../contracts/types.js").User>;
    videoJobs: Map<string, never>;
  };
  authService: IAuthService;
  adminConfigService: IAdminConfigService;
  projectService: IProjectService;
  uploadService: IUploadService;
  outfitService: IOutfitService;
  characterService: ICharacterService;
  scriptService: IScriptService;
  storyboardService: IStoryboardService;
  videoJobService: IVideoJobService;
  creditService: ICreditService;
  reverseService: IReverseService;
  reviewService: IReviewService;
  squareService: ISquareService;
  providerAdminService: IProviderAdminService;
  modelPresetService: ModelPresetService;
  userAdminService: IUserAdminService;
  assetLibraryService: IAssetLibraryService;
  characterLibraryService: ICharacterLibraryService;
  projectCharacterService: IProjectCharacterService;
  scriptLibraryService: IScriptLibraryService;
  reverseStoryboardLibraryService: IReverseStoryboardLibraryService;
  smartStoryboardLibraryService: ISmartStoryboardLibraryService;
  myLibraryService: IMyLibraryService;
  douyinPublishService: DouyinPublishService;
  douyinAuthService: DouyinAuthService;
  douyinRemoteLoginService: DouyinRemoteLoginService;
  functionalRouteService: FunctionalRouteService;
  /** 文件服务：统一管理文件上传、去重、引用追踪 */
  fileService: FileService;
  /** 项目提示词数据服务：从数据库获取角色和服饰数据 */
  projectPromptDataService: ProjectPromptDataService;
  /** 项目上下文服务：统一获取项目的角色、服饰、穿搭等上下文信息 */
  projectContextService: ProjectContextService;
  /** 业务模块配置服务：按模块管理业务配置 */
  businessConfigService: BusinessConfigService;
  /** 全局任务并发控制服务：原子并发检查 */
  globalTaskConcurrencyService: GlobalTaskConcurrencyService;
  /** 队列调度器：pending → running 提升 */
  queueDispatcher: QueueDispatcher;
  /** Executor 注册表：集中管理所有任务类型的执行器 */
  executorRegistry: ExecutorRegistry;
  /** SSE 管理器：实时推送任务状态更新 */
  sseManager: SSEManager;
  /** 积分定价服务：管理各 RouteKey 的积分成本 */
  creditPricingService: ICreditPricingService;
  storage: IObjectStorageAdapter | null;
  auditStore: IAuditStore;
}

export interface CreateAppContextOptions {
  initialConfig?: AppConfig;
  providerAuditLogDir?: string | null;
  objectStorageLocalDir?: string | null;
  bootstrapAdminEmail?: string;
  bootstrapAdminPassword?: string;
  douyinPublishEnabled?: boolean;
  socialAutoUploadDir?: string;
  douyinCookieDir?: string;
  douyinPublishHistoryStorePath?: string;
  douyinQrHeadless?: boolean;
  douyinRemoteLoginEnabled?: boolean;
  douyinRemoteLoginXpraBin?: string;
  douyinRemoteLoginChromeBin?: string;
  douyinRemoteLoginBindHost?: string;
  douyinRemoteLoginPublicUrlTemplate?: string;
  douyinRemoteLoginPortStart?: number;
  douyinRemoteLoginPortEnd?: number;
  douyinRemoteLoginDisplayStart?: number;
  douyinRemoteLoginDisplayEnd?: number;
  douyinRemoteLoginSessionTimeoutMs?: number;
  /** PG 连接池（必需） */
  pool: Pool;
}

/**
 * 创建应用上下文
 * 强制使用 PG repos，不再支持 InMemory 回退
 */
export async function createAppContext(options: CreateAppContextOptions): Promise<AppContext> {
  if (!options.pool) {
    throw new Error("createAppContext: pool is required (PG repos mode only)");
  }

  // 时钟服务：独立实现，不依赖 InMemoryStore
  const clock: IRepositoryClock = {
    generateId: () => randomUUID(),
    now: () => Date.now(),
  };

  // 配置服务：使用初始配置或默认配置
  const configService = new AppConfigService(options.initialConfig ?? DEFAULT_CONFIG);

  // Repository 层：使用 PG repos
  const repos = createPgRepositories(options.pool) as unknown as RepositoryCollection;

  // 注入配置仓库以支持持久化，并从数据库加载已保存的配置
  await configService.setRepository(repos.config);

  const storage = createObjectStorageAdapter();
  const auditStore: IAuditStore = new UpgradableAuditStore(new MemoryAuditStore());

  // 业务模块配置服务：按模块管理业务配置（需要在 videoJobService 之前初始化）
  const businessConfigService = new BusinessConfigService(options.pool);
  await businessConfigService.initialize();

  // 全局任务并发控制服务：原子并发检查
  const globalTaskConcurrencyService = new GlobalTaskConcurrencyService(options.pool, businessConfigService);

  // Executor 注册表：集中管理所有任务类型的执行器（稍后在 setup-executors.ts 中注册）
  const executorRegistry = new ExecutorRegistry();

  // 队列调度器：pending → running 提升（周期扫描 + 任务完成即时触发）
  // 注意：executorRegistry 先创建，ctx 在构建完成后通过 setContext 注入
  const queueDispatcher = new QueueDispatcher(options.pool, businessConfigService, executorRegistry);

  // 任务创建回调：直接获得执行槽位时触发提升检查，或直接触发执行
  globalTaskConcurrencyService.onJobCreated((jobId, running) => {
    if (running) {
      // 任务直接创建为 running，QueueDispatcher.invokeExecutors 会自动调用 executor
    } else {
      // 排队任务创建后，尝试提升（如果有槽位可能立即被提升）
      void queueDispatcher.tryPromote();
    }
  });

  const authService: IAuthService = new AuthService(repos.users, repos.sessions, clock, configService, auditStore);
  const adminConfigService: IAdminConfigService = new AdminConfigService({ users: repos.users }, clock, configService, auditStore);
  const projectService: IProjectService = new ProjectService(
    repos.projects,
    repos.assets,
    repos.outfitPlans,
    repos.scripts,
    repos.reverseTasks,
    repos.reviewRequests,
    repos.publicResources,
    clock,
  );
  const uploadService: IUploadService = new UploadService({ assets: repos.assets, garmentAssets: repos.garmentAssets }, clock, configService, projectService);
  const outfitService: IOutfitService = new OutfitService({ assets: repos.assets, garmentAssets: repos.garmentAssets, outfitPlans: repos.outfitPlans, projectOutfitPlanAssocs: repos.projectOutfitPlanAssocs }, clock, projectService);
  const characterService: ICharacterService = new CharacterService({ libraryCharacters: repos.libraryCharacters });
  const scriptService: IScriptService = new ScriptService({ scripts: repos.scripts }, clock, configService, projectService);
  const storyboardService: IStoryboardService = new StoryboardService(repos, clock, projectService);
  // 项目上下文服务：统一获取项目的角色、服饰、穿搭等上下文信息（需在 videoJobService 之前创建）
  const projectContextService = createProjectContextService(repos.projects);
  const videoJobService: IVideoJobService = new VideoJobService(repos, clock, businessConfigService, projectService, repos.step3FrameImages, globalTaskConcurrencyService, queueDispatcher);
  const creditService: ICreditService = new CreditService({ credits: repos.credits, creditFreezes: repos.creditFreezes }, clock, configService, auditStore, options.pool);

  // 积分定价服务：管理各 RouteKey 的积分成本
  const creditPricingService: ICreditPricingService = new CreditPricingService(options.pool);

  const finalVideosDbService = getFinalVideosDbService(repos);
  const reverseService: IReverseService = new ReverseService({ projects: repos.projects, reverseTasks: repos.reverseTasks, scriptData: repos.scriptData }, clock);
  const reviewService: IReviewService = new ReviewService({ scripts: repos.scripts, reviewRequests: repos.reviewRequests, publicResources: repos.publicResources, projects: repos.projects }, clock, auditStore);
  const squareService: ISquareService = new SquareService({ publicResources: repos.publicResources, scripts: repos.scripts });
  const providerAdminService: IProviderAdminService = new ProviderAdminService({ providers: repos.providers, providerSecrets: repos.providerSecrets, providerPolicies: repos.providerPolicies }, clock, configService, auditStore, {
    providerAuditLogDir: options.providerAuditLogDir,
    objectStorageLocalDir: options.objectStorageLocalDir,
  });
// 模型预设：使用内存 TrackedMap（暂不持久化到数据库）
  const { TrackedMap } = await import("./tracked-map.js");
  const modelPresets = new TrackedMap<string, import("../contracts/model-preset-contract.js").ModelPreset>();
  const modelPresetService = new ModelPresetService(modelPresets, auditStore, clock.generateId, clock.now);
  // 初始化内置预设数据
  modelPresetService.initializeBuiltinPresets();

  const userAdminService: IUserAdminService = new UserAdminService({ users: repos.users, credits: repos.credits }, clock, configService, creditService, auditStore);
  const assetLibraryService: IAssetLibraryService = new AssetLibraryService({ garmentAssets: repos.garmentAssets }, clock);
  const characterLibraryService: ICharacterLibraryService = new CharacterLibraryService({ libraryCharacters: repos.libraryCharacters, clock, characterFiveViews: repos.characterFiveViews, projectCharacters: repos.projectCharacters });
  const projectCharacterService: IProjectCharacterService = new ProjectCharacterService({ projectCharacters: repos.projectCharacters, libraryCharacters: repos.libraryCharacters, clock });
  const scriptLibraryService: IScriptLibraryService = new UnifiedScriptService(repos);
  const reverseStoryboardLibraryService: IReverseStoryboardLibraryService = new ReverseStoryboardLibraryService({ reverseStoryboardLibrary: repos.reverseStoryboardLibrary, reverseStoryboardLibraryVersions: repos.reverseStoryboardLibraryVersions, clock });
  const smartStoryboardLibraryService: ISmartStoryboardLibraryService = new SmartStoryboardLibraryService({ smartStoryboardLibrary: repos.smartStoryboardLibrary, smartStoryboardLibraryVersions: repos.smartStoryboardLibraryVersions, clock });
  const myLibraryService: IMyLibraryService = new MyLibraryService({ scriptData: repos.scriptData, reverseStoryboardLibrary: repos.reverseStoryboardLibrary, userScriptAssocs: repos.userScriptAssocs, shotBreakdowns: repos.shotBreakdowns });
  const douyinPublishService = new DouyinPublishService({
    enabled: options.douyinPublishEnabled ?? false,
    socialAutoUploadDir: options.socialAutoUploadDir,
    cookieDir: options.douyinCookieDir,
    historyStorePath: options.douyinPublishHistoryStorePath,
    downloadTimeoutMs: configService.get().videoDownloadTimeoutMs,
  });
  const douyinAuthService = new DouyinAuthService({
    enabled: options.douyinPublishEnabled ?? false,
    cookieDir: options.douyinCookieDir,
    qrHeadless: options.douyinQrHeadless,
  });
  const douyinRemoteLoginService = new DouyinRemoteLoginService({
    enabled: options.douyinRemoteLoginEnabled ?? false,
    cookieDir: options.douyinCookieDir,
    xpraBin: options.douyinRemoteLoginXpraBin,
    chromeBin: options.douyinRemoteLoginChromeBin,
    bindHost: options.douyinRemoteLoginBindHost,
    publicUrlTemplate: options.douyinRemoteLoginPublicUrlTemplate,
    portStart: options.douyinRemoteLoginPortStart,
    portEnd: options.douyinRemoteLoginPortEnd,
    displayStart: options.douyinRemoteLoginDisplayStart,
    displayEnd: options.douyinRemoteLoginDisplayEnd,
    sessionTimeoutMs: options.douyinRemoteLoginSessionTimeoutMs,
  });
  if (options.douyinPublishEnabled) {
    douyinAuthService.startPeriodicCleanup();
  }

  // 功能路由服务
  const functionalRouteService = new FunctionalRouteService({
    functionalRoutes: repos.functionalRoutes,
    providers: repos.providers,
    auditStore,
    clock,
  });

  // 文件服务：统一管理文件上传、去重、引用追踪
  // 根据 NODE_ENV 判断环境：development/test -> test，production -> production
  const fileEnvironment: FileEnvironment = process.env.NODE_ENV === "production" ? "production" : "test";
  const fileService = new FileService({
    repos: { fileRegistry: repos.fileRegistry },
    clock,
    storage,
    defaultStorageDriver: storage?.driver === "alioss" ? "alioss" : "local",
    environment: fileEnvironment,
  });

  // SSE 管理器：实时推送任务状态更新
  const sseManager = new SSEManager();

  // 项目提示词数据服务：从数据库获取角色和服饰数据
  const projectPromptDataService = new ProjectPromptDataService({
    projects: repos.projects,
    projectGarmentAssocs: repos.projectGarmentAssocs,
    garmentAssets: repos.garmentAssets,
  });

  const log = getLogger("app-context");

  // Bootstrap admin: 忽略已存在错误（admin 已存在是正常情况）
  if (options.bootstrapAdminEmail && options.bootstrapAdminPassword) {
    authService.register(options.bootstrapAdminEmail, options.bootstrapAdminPassword, "admin").catch((error) => {
      // 忽略 admin 已存在的错误，其他错误记录日志
      if (error instanceof AppError && (error.code === "ADMIN_EXISTS" || error.code === "USERNAME_EXISTS")) {
        return; // 正常情况，admin 已存在
      }
      log.error({ error }, "[AppContext] Bootstrap admin failed");
    });
  }

  // 构建 AppContext 对象
  const ctx: AppContext = {
    pool: options.pool,
    repos,
    clock,
    configService,
    /** 兼容层：提供旧的 store 接口，委托给 repos/clock/configService */
    store: {
      generateId: () => clock.generateId(),
      now: () => clock.now(),
      config: configService.get(),
      assets: new Map<string, import("../contracts/types.js").UploadAsset>(),
      garmentAssets: new Map<string, import("../contracts/types.js").GarmentAsset>(),
      libraryCharacters: new Map<string, import("../contracts/types.js").LibraryCharacter>(),
      scripts: new Map<string, import("../contracts/types.js").ScriptVersion>(),
      outfitPlans: new Map<string, import("../contracts/types.js").OutfitPlan>(),
      projects: new Map<string, import("../contracts/types.js").Project>(),
      users: new Map<string, import("../contracts/types.js").User>(),
      videoJobs: new Map<string, never>(),
    },
    authService,
    adminConfigService,
    projectService,
    uploadService,
    outfitService,
    characterService,
    scriptService,
    storyboardService,
    videoJobService,
    creditService,
    reverseService,
    reviewService,
    squareService,
    providerAdminService,
    modelPresetService,
    userAdminService,
    assetLibraryService,
    characterLibraryService,
    projectCharacterService,
    scriptLibraryService,
    reverseStoryboardLibraryService,
    smartStoryboardLibraryService,
    myLibraryService,
    douyinPublishService,
    douyinAuthService,
    douyinRemoteLoginService,
    functionalRouteService,
    fileService,
    projectPromptDataService,
    projectContextService,
    businessConfigService,
    globalTaskConcurrencyService,
    queueDispatcher,
    executorRegistry,
    sseManager,
    creditPricingService,
    storage,
    auditStore,
  };

  // 解决循环依赖：ctx 构建完成后，注入到 QueueDispatcher
  queueDispatcher.setContext(ctx);

  return ctx;
}