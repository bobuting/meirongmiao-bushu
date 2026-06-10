# 依赖注入重构设计文档

**日期**: 2026-04-04
**作者**: Claude
**状态**: 待审查

---

## 一、问题分析

### 1.1 当前架构问题

**文件**: `src/core/app-context.ts`

当前 `createAppContext` 函数存在以下严重问题：

#### 问题 1：硬编码依赖实例化

```typescript
// 第 117-141 行：直接实例化 25+ 个服务
const authService: IAuthService = new AuthService(store);
const adminConfigService: IAdminConfigService = new AdminConfigService(store);
const projectService: IProjectService = new ProjectService(store);
const uploadService: IUploadService = new UploadService(store, projectService);
// ... 共 25+ 个服务
```

**影响**：
- 无法在测试中替换服务实现（Mock 困难）
- 服务之间耦合度高，构造函数依赖链复杂
- 无法根据环境动态切换实现（如开发用内存存储，生产用数据库）

#### 问题 2：依赖关系隐式传递

服务之间的依赖通过构造函数传递，但依赖关系分散在各服务实现中：

| 服务 | 依赖项 | 构造函数位置 |
|------|--------|-------------|
| `UploadService` | `store, projectService` | 第 120 行 |
| `StoryboardService` | `store, projectService, scriptService` | 第 124 行 |
| `FissionExportService` | `store, projectService, creditService, storage` | 第 127 行 |
| `ReverseService` | `store, scriptService` | 第 128 行 |
| `UserAdminService` | `store, creditService` | 第 135 行 |

**影响**：
- 依赖顺序敏感，实例化顺序错误会导致运行时错误
- 新增服务需要手动维护正确的实例化顺序
- 依赖关系不可视，难以理解系统架构

#### 问题 3：配置与实例化混合

```typescript
// 第 131-134 行：服务配置与实例化混合
const providerAdminService: IProviderAdminService = new ProviderAdminService(store, {
  providerAuditLogDir: options.providerAuditLogDir,
  objectStorageLocalDir: options.objectStorageLocalDir,
});

// 第 142-165 行：抖音服务大量配置参数
const douyinPublishService = new DouyinPublishService({
  enabled: options.douyinPublishEnabled ?? false,
  socialAutoUploadDir: options.socialAutoUploadDir,
  // ... 10+ 个配置项
});
```

**影响**：
- `CreateAppContextOptions` 接口膨胀（30+ 配置项）
- 配置项与具体服务强绑定，难以复用
- 新增配置需要在多处修改

### 1.2 AppContext 接口膨胀

```typescript
// 第 56-84 行：28 个服务字段
export interface AppContext {
  store: IAppRepository;
  authService: IAuthService;
  adminConfigService: IAdminConfigService;
  projectService: IProjectService;
  // ... 共 28 个字段
}
```

**影响**：
- 接口过于庞大，难以理解核心依赖
- 服务消费者需要导入整个 AppContext 类型
- 违反接口隔离原则（ISP）

### 1.3 测试困难示例

**当前测试困难**：

```typescript
// 无法轻松 Mock 服务
function setupTestContext() {
  // 问题：必须使用真实的 InMemoryStore
  const ctx = createAppContext();

  // 问题：无法替换 AuthService 进行单元测试
  // authService 已被硬编码为 AuthService 实例

  // 问题：要测试 ProjectService，必须同时实例化其所有依赖
}
```

---

## 二、改进目标

1. **可测试性**: 支持服务 Mock，简化单元测试
2. **灵活性**: 支持运行时切换服务实现
3. **可视化**: 依赖关系清晰可见
4. **配置分离**: 配置与服务实例化解耦
5. **渐进式**: 可逐步迁移，无需一次性重构

---

## 三、设计方案

### 3.1 引入简易服务容器

**新增文件**: `src/core/service-container.ts`

```typescript
/**
 * 简易依赖注入容器
 * 支持服务注册、解析、Mock 替换
 */

export interface ServiceFactory<T> {
  (container: ServiceContainer): T;
}

export interface ServiceRegistration<T> {
  factory: ServiceFactory<T>;
  singleton?: boolean;
}

export class ServiceContainer {
  private readonly registrations = new Map<string, ServiceRegistration<unknown>>();
  private readonly instances = new Map<string, unknown>();
  private readonly mocks = new Map<string, unknown>();

  /**
   * 注册服务工厂
   * @param key 服务标识（通常使用接口名）
   * @param factory 服务创建工厂
   * @param singleton 是否单例（默认 true）
   */
  register<T>(key: string, factory: ServiceFactory<T>, singleton = true): void {
    this.registrations.set(key, { factory, singleton });
  }

  /**
   * 注册 Mock 实现（用于测试）
   */
  registerMock<T>(key: string, mock: T): void {
    this.mocks.set(key, mock);
  }

  /**
   * 解析服务
   */
  resolve<T>(key: string): T {
    // 优先返回 Mock
    if (this.mocks.has(key)) {
      return this.mocks.get(key) as T;
    }

    // 检查是否已注册
    const registration = this.registrations.get(key);
    if (!registration) {
      throw new Error(`Service '${key}' not registered`);
    }

    // 单例缓存
    if (registration.singleton && this.instances.has(key)) {
      return this.instances.get(key) as T;
    }

    // 创建实例
    const instance = registration.factory(this) as T;
    if (registration.singleton) {
      this.instances.set(key, instance);
    }
    return instance;
  }

  /**
   * 清除所有 Mock（测试后清理）
   */
  clearMocks(): void {
    this.mocks.clear();
  }

  /**
   * 清除所有缓存实例
   */
  clearInstances(): void {
    this.instances.clear();
  }

  /**
   * 检查服务是否已注册
   */
  has(key: string): boolean {
    return this.registrations.has(key) || this.mocks.has(key);
  }
}
```

### 3.2 服务注册表

**新增文件**: `src/core/service-registry.ts`

```typescript
import { ServiceContainer } from "./service-container.js";
import { InMemoryStore } from "./store.js";
import { createObjectStorageAdapter } from "../storage/runtime.js";

// 服务实现导入
import { AuthService } from "../modules/auth-service.js";
import { AdminConfigService } from "../modules/admin-config-service.js";
import { ProjectService } from "../modules/project-service.js";
// ... 其他服务导入

// 服务标识常量（避免字符串硬编码）
export const SERVICE_KEYS = {
  STORE: "IAppRepository",
  STORAGE: "IObjectStorageAdapter",
  AUTH: "IAuthService",
  ADMIN_CONFIG: "IAdminConfigService",
  PROJECT: "IProjectService",
  UPLOAD: "IUploadService",
  OUTFIT: "IOutfitService",
  CHARACTER: "ICharacterService",
  SCRIPT: "IScriptService",
  STORYBOARD: "IStoryboardService",
  VIDEO_JOB: "IVideoJobService",
  CREDIT: "ICreditService",
  FISSION_EXPORT: "IFissionExportService",
  REVERSE: "IReverseService",
  REVIEW: "IReviewService",
  SQUARE: "ISquareService",
  PROVIDER_ADMIN: "IProviderAdminService",
  USER_ADMIN: "IUserAdminService",
  ASSET_LIBRARY: "IAssetLibraryService",
  CHARACTER_LIBRARY: "ICharacterLibraryService",
  SCRIPT_LIBRARY: "IScriptLibraryService",
  REVERSE_STORYBOARD_LIBRARY: "IReverseStoryboardLibraryService",
  SMART_STORYBOARD_LIBRARY: "ISmartStoryboardLibraryService",
  MY_LIBRARY: "IMyLibraryService",
  DOUYIN_PUBLISH: "DouyinPublishService",
  DOUYIN_AUTH: "DouyinAuthService",
  DOUYIN_REMOTE_LOGIN: "DouyinRemoteLoginService",
} as const;

/**
 * 注册所有服务到容器
 */
export function registerServices(
  container: ServiceContainer,
  options: ServiceRegistrationOptions = {}
): void {
  // 基础设施服务
  container.register(SERVICE_KEYS.STORE, () => {
    const store = new InMemoryStore();
    if (options.initialConfig) {
      store.config = { ...options.initialConfig };
    }
    return store;
  });

  container.register(SERVICE_KEYS.STORAGE, () => {
    return createObjectStorageAdapter({
      localDir: options.objectStorageLocalDir,
    });
  });

  // 核心业务服务（无依赖）
  container.register(SERVICE_KEYS.AUTH, (c) => {
    return new AuthService(c.resolve(SERVICE_KEYS.STORE));
  });

  container.register(SERVICE_KEYS.ADMIN_CONFIG, (c) => {
    return new AdminConfigService(c.resolve(SERVICE_KEYS.STORE));
  });

  container.register(SERVICE_KEYS.PROJECT, (c) => {
    return new ProjectService(c.resolve(SERVICE_KEYS.STORE));
  });

  container.register(SERVICE_KEYS.CREDIT, (c) => {
    return new CreditService(c.resolve(SERVICE_KEYS.STORE));
  });

  // 依赖其他服务的业务服务
  container.register(SERVICE_KEYS.UPLOAD, (c) => {
    return new UploadService(
      c.resolve(SERVICE_KEYS.STORE),
      c.resolve(SERVICE_KEYS.PROJECT)
    );
  });

  container.register(SERVICE_KEYS.OUTFIT, (c) => {
    return new OutfitService(
      c.resolve(SERVICE_KEYS.STORE),
      c.resolve(SERVICE_KEYS.PROJECT)
    );
  });

  container.register(SERVICE_KEYS.CHARACTER, (c) => {
    return new CharacterService(
      c.resolve(SERVICE_KEYS.STORE),
      c.resolve(SERVICE_KEYS.PROJECT)
    );
  });

  container.register(SERVICE_KEYS.SCRIPT, (c) => {
    return new ScriptService(
      c.resolve(SERVICE_KEYS.STORE),
      c.resolve(SERVICE_KEYS.PROJECT)
    );
  });

  container.register(SERVICE_KEYS.STORYBOARD, (c) => {
    return new StoryboardService(
      c.resolve(SERVICE_KEYS.STORE),
      c.resolve(SERVICE_KEYS.PROJECT),
      c.resolve(SERVICE_KEYS.SCRIPT)
    );
  });

  container.register(SERVICE_KEYS.VIDEO_JOB, (c) => {
    return new VideoJobService(
      c.resolve(SERVICE_KEYS.STORE),
      c.resolve(SERVICE_KEYS.PROJECT)
    );
  });

  container.register(SERVICE_KEYS.FISSION_EXPORT, (c) => {
    return new FissionExportService(
      c.resolve(SERVICE_KEYS.STORE),
      c.resolve(SERVICE_KEYS.PROJECT),
      c.resolve(SERVICE_KEYS.CREDIT),
      c.resolve(SERVICE_KEYS.STORAGE)
    );
  });

  container.register(SERVICE_KEYS.REVERSE, (c) => {
    return new ReverseService(
      c.resolve(SERVICE_KEYS.STORE),
      c.resolve(SERVICE_KEYS.SCRIPT)
    );
  });

  container.register(SERVICE_KEYS.REVIEW, (c) => {
    return new ReviewService(c.resolve(SERVICE_KEYS.STORE));
  });

  container.register(SERVICE_KEYS.SQUARE, (c) => {
    return new SquareService(c.resolve(SERVICE_KEYS.STORE));
  });

  container.register(SERVICE_KEYS.PROVIDER_ADMIN, (c) => {
    return new ProviderAdminService(c.resolve(SERVICE_KEYS.STORE), {
      providerAuditLogDir: options.providerAuditLogDir,
      objectStorageLocalDir: options.objectStorageLocalDir,
    });
  });

  container.register(SERVICE_KEYS.USER_ADMIN, (c) => {
    return new UserAdminService(
      c.resolve(SERVICE_KEYS.STORE),
      c.resolve(SERVICE_KEYS.CREDIT)
    );
  });

  // Library 服务
  container.register(SERVICE_KEYS.ASSET_LIBRARY, (c) => {
    return new AssetLibraryService(c.resolve(SERVICE_KEYS.STORE));
  });

  container.register(SERVICE_KEYS.CHARACTER_LIBRARY, (c) => {
    return new CharacterLibraryService(c.resolve(SERVICE_KEYS.STORE));
  });

  container.register(SERVICE_KEYS.SCRIPT_LIBRARY, (c) => {
    return new ScriptLibraryService(c.resolve(SERVICE_KEYS.STORE));
  });

  container.register(SERVICE_KEYS.REVERSE_STORYBOARD_LIBRARY, (c) => {
    return new ReverseStoryboardLibraryService(c.resolve(SERVICE_KEYS.STORE));
  });

  container.register(SERVICE_KEYS.SMART_STORYBOARD_LIBRARY, (c) => {
    return new SmartStoryboardLibraryService(c.resolve(SERVICE_KEYS.STORE));
  });

  container.register(SERVICE_KEYS.MY_LIBRARY, (c) => {
    return new MyLibraryService(c.resolve(SERVICE_KEYS.STORE));
  });

  // Douyin 服务
  container.register(SERVICE_KEYS.DOUYIN_PUBLISH, () => {
    return new DouyinPublishService({
      enabled: options.douyinPublishEnabled ?? false,
      socialAutoUploadDir: options.socialAutoUploadDir,
      cookieDir: options.douyinCookieDir,
      historyStorePath: options.douyinPublishHistoryStorePath,
    });
  });

  container.register(SERVICE_KEYS.DOUYIN_AUTH, () => {
    return new DouyinAuthService({
      enabled: options.douyinPublishEnabled ?? false,
      cookieDir: options.douyinCookieDir,
      qrHeadless: options.douyinQrHeadless,
    });
  });

  container.register(SERVICE_KEYS.DOUYIN_REMOTE_LOGIN, () => {
    return new DouyinRemoteLoginService({
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
  });
}

export interface ServiceRegistrationOptions {
  initialConfig?: AppConfig;
  providerAuditLogDir?: string | null;
  objectStorageLocalDir?: string | null;
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
}
```

### 3.3 重构后的 AppContext

**修改文件**: `src/core/app-context.ts`

```typescript
import { ServiceContainer, registerServices, SERVICE_KEYS } from "./service-registry.js";

/**
 * 精简后的 AppContext
 * 只保留容器引用，服务通过容器解析
 */
export interface AppContext {
  container: ServiceContainer;
}

export interface CreateAppContextOptions extends ServiceRegistrationOptions {
  bootstrapAdminEmail?: string;
  bootstrapAdminPassword?: string;
}

/**
 * 创建应用上下文
 */
export function createAppContext(options: CreateAppContextOptions = {}): AppContext {
  const container = new ServiceContainer();

  // 注册所有服务
  registerServices(container, options);

  // 启动抖音服务的定时清理
  if (options.douyinPublishEnabled) {
    container.resolve(SERVICE_KEYS.DOUYIN_AUTH).startPeriodicCleanup();
  }

  // 创建引导管理员
  if (options.bootstrapAdminEmail && options.bootstrapAdminPassword) {
    const authService = container.resolve(SERVICE_KEYS.AUTH);
    authService.register(options.bootstrapAdminEmail, options.bootstrapAdminPassword, "admin");
  }

  return { container };
}

// ========== 兼容性层（渐进式迁移） ==========

/**
 * 类型辅助：从容器解析服务时获得正确类型
 */
export type ServiceMap = {
  [K in keyof typeof SERVICE_KEYS]: ReturnType<ServiceContainer["resolve"]>;
};

/**
 * 扩展 AppContext 以支持旧代码的属性访问（过渡期）
 * @deprecated 请使用 ctx.container.resolve(SERVICE_KEYS.xxx)
 */
export interface LegacyAppContext extends AppContext {
  store: IAppRepository;
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
  fissionExportService: IFissionExportService;
  reverseService: IReverseService;
  reviewService: IReviewService;
  squareService: ISquareService;
  providerAdminService: IProviderAdminService;
  userAdminService: IUserAdminService;
  assetLibraryService: IAssetLibraryService;
  characterLibraryService: ICharacterLibraryService;
  scriptLibraryService: IScriptLibraryService;
  reverseStoryboardLibraryService: IReverseStoryboardLibraryService;
  smartStoryboardLibraryService: ISmartStoryboardLibraryService;
  myLibraryService: IMyLibraryService;
  douyinPublishService: DouyinPublishService;
  douyinAuthService: DouyinAuthService;
  douyinRemoteLoginService: DouyinRemoteLoginService;
  storage: IObjectStorageAdapter | null;
}

/**
 * 创建兼容旧代码的 AppContext（过渡期使用）
 * @deprecated 仅用于过渡期，新代码请使用 createAppContext
 */
export function createLegacyAppContext(options: CreateAppContextOptions = {}): LegacyAppContext {
  const ctx = createAppContext(options);

  // 通过容器解析所有服务，暴露为属性
  return {
    container: ctx.container,
    store: ctx.container.resolve(SERVICE_KEYS.STORE),
    authService: ctx.container.resolve(SERVICE_KEYS.AUTH),
    adminConfigService: ctx.container.resolve(SERVICE_KEYS.ADMIN_CONFIG),
    projectService: ctx.container.resolve(SERVICE_KEYS.PROJECT),
    uploadService: ctx.container.resolve(SERVICE_KEYS.UPLOAD),
    outfitService: ctx.container.resolve(SERVICE_KEYS.OUTFIT),
    characterService: ctx.container.resolve(SERVICE_KEYS.CHARACTER),
    scriptService: ctx.container.resolve(SERVICE_KEYS.SCRIPT),
    storyboardService: ctx.container.resolve(SERVICE_KEYS.STORYBOARD),
    videoJobService: ctx.container.resolve(SERVICE_KEYS.VIDEO_JOB),
    creditService: ctx.container.resolve(SERVICE_KEYS.CREDIT),
    fissionExportService: ctx.container.resolve(SERVICE_KEYS.FISSION_EXPORT),
    reverseService: ctx.container.resolve(SERVICE_KEYS.REVERSE),
    reviewService: ctx.container.resolve(SERVICE_KEYS.REVIEW),
    squareService: ctx.container.resolve(SERVICE_KEYS.SQUARE),
    providerAdminService: ctx.container.resolve(SERVICE_KEYS.PROVIDER_ADMIN),
    userAdminService: ctx.container.resolve(SERVICE_KEYS.USER_ADMIN),
    assetLibraryService: ctx.container.resolve(SERVICE_KEYS.ASSET_LIBRARY),
    characterLibraryService: ctx.container.resolve(SERVICE_KEYS.CHARACTER_LIBRARY),
    scriptLibraryService: ctx.container.resolve(SERVICE_KEYS.SCRIPT_LIBRARY),
    reverseStoryboardLibraryService: ctx.container.resolve(SERVICE_KEYS.REVERSE_STORYBOARD_LIBRARY),
    smartStoryboardLibraryService: ctx.container.resolve(SERVICE_KEYS.SMART_STORYBOARD_LIBRARY),
    myLibraryService: ctx.container.resolve(SERVICE_KEYS.MY_LIBRARY),
    douyinPublishService: ctx.container.resolve(SERVICE_KEYS.DOUYIN_PUBLISH),
    douyinAuthService: ctx.container.resolve(SERVICE_KEYS.DOUYIN_AUTH),
    douyinRemoteLoginService: ctx.container.resolve(SERVICE_KEYS.DOUYIN_REMOTE_LOGIN),
    storage: ctx.container.resolve(SERVICE_KEYS.STORAGE),
  };
}
```

### 3.4 测试支持

**新增文件**: `src/core/test-context.ts`

```typescript
import { ServiceContainer, SERVICE_KEYS } from "./service-registry.js";

/**
 * 测试上下文构建器
 * 支持轻松 Mock 服务
 */
export class TestContextBuilder {
  private container = new ServiceContainer();
  private options: ServiceRegistrationOptions = {};

  /**
   * 使用 Mock 存储初始化
   */
  withMockStore(store: IAppRepository): this {
    this.container.registerMock(SERVICE_KEYS.STORE, store);
    return this;
  }

  /**
   * 使用 Mock 认证服务
   */
  withMockAuthService(auth: IAuthService): this {
    this.container.registerMock(SERVICE_KEYS.AUTH, auth);
    return this;
  }

  /**
   * 使用 Mock 项目服务
   */
  withMockProjectService(project: IProjectService): this {
    this.container.registerMock(SERVICE_KEYS.PROJECT, project);
    return this;
  }

  /**
   * 使用 Mock 存储（简化版）
   */
  withInMemoryStore(initialConfig?: AppConfig): this {
    const store = new InMemoryStore();
    if (initialConfig) {
      store.config = { ...initialConfig };
    }
    this.container.registerMock(SERVICE_KEYS.STORE, store);
    return this;
  }

  /**
   * 设置配置选项
   */
  withOptions(options: Partial<ServiceRegistrationOptions>): this {
    this.options = { ...this.options, ...options };
    return this;
  }

  /**
   * 构建测试上下文
   */
  build(): AppContext {
    // 注册未被 Mock 的服务
    registerServices(this.container, this.options);
    return { container: this.container };
  }

  /**
   * 快速创建最小测试上下文
   */
  static minimal(): AppContext {
    return new TestContextBuilder()
      .withInMemoryStore()
      .build();
  }

  /**
   * 创建用于测试特定服务的上下文
   */
  static forService<T>(
    serviceKey: string,
    mockDeps: Record<string, unknown>
  ): AppContext {
    const builder = new TestContextBuilder();

    // 注册所有 Mock 依赖
    for (const [key, mock] of Object.entries(mockDeps)) {
      builder.container.registerMock(key, mock);
    }

    return builder.build();
  }
}
```

---

## 四、使用示例

### 4.1 生产环境使用

```typescript
// app.ts 中的使用
import { createLegacyAppContext } from "./core/app-context.js";

const ctx = createLegacyAppContext({
  initialConfig: defaultConfig,
  bootstrapAdminEmail: process.env.ADMIN_EMAIL,
  bootstrapAdminPassword: process.env.ADMIN_PASSWORD,
  douyinPublishEnabled: process.env.DOUYIN_ENABLED === "true",
});

// 旧代码仍然可以使用 ctx.authService
ctx.authService.login(email, password);
```

### 4.2 新代码推荐用法

```typescript
// 推荐的新用法
import { createAppContext, SERVICE_KEYS } from "./core/app-context.js";

const ctx = createAppContext(options);

// 通过容器解析服务
const authService = ctx.container.resolve(SERVICE_KEYS.AUTH);
authService.login(email, password);

// 类型安全（TypeScript 自动推断）
const projectService = ctx.container.resolve<IProjectService>(SERVICE_KEYS.PROJECT);
```

### 4.3 单元测试示例

```typescript
import { TestContextBuilder, SERVICE_KEYS } from "./core/test-context.js";
import { ProjectService } from "./modules/project-service.js";

describe("ProjectService", () => {
  it("should create project", () => {
    // 创建 Mock 依赖
    const mockStore = {
      projects: new Map(),
      saveProject: vi.fn(),
    };

    const mockAuthService = {
      requireUser: vi.fn().ReturnValue({ id: "user-1" }),
    };

    // 构建测试上下文
    const ctx = TestContextBuilder.forService(
      SERVICE_KEYS.PROJECT,
      {
        [SERVICE_KEYS.STORE]: mockStore,
        [SERVICE_KEYS.AUTH]: mockAuthService,
      }
    );

    // 解析被测试的服务
    const projectService = ctx.container.resolve<ProjectService>(SERVICE_KEYS.PROJECT);

    // 测试
    const result = projectService.createProject({ id: "user-1" }, "Test Project");
    expect(result.name).toBe("Test Project");
    expect(mockStore.saveProject).toHaveBeenCalled();
  });
});
```

---

## 五、迁移策略

### 5.1 渐进式迁移步骤

| 阶段 | 任务 | 预估时间 | 风险 |
|------|------|---------|------|
| 1 | 创建 ServiceContainer 和 ServiceRegistry | 1天 | 低 |
| 2 | 创建 createLegacyAppContext（兼容层） | 0.5天 | 低 |
| 3 | 修改 app.ts 使用 createLegacyAppContext | 0.5天 | 低 |
| 4 | 修改测试使用 TestContextBuilder | 2天 | 中 |
| 5 | 新代码使用新 API | 持续 | 低 |
| 6 | 逐步将旧代码迁移到新 API | 2-3周 | 中 |
| 7 | 移除 LegacyAppContext（可选） | 1天 | 中 |

### 5.2 兼容性保证

- `LegacyAppContext` 确保现有代码无需修改即可运行
- `SERVICE_KEYS` 常量避免字符串硬编码错误
- 类型辅助确保类型安全

### 5.3 回滚方案

如果新架构出现问题，可以：
1. 恢复 `createAppContext` 的原始实现
2. 删除 `ServiceContainer` 相关文件
3. 所有代码仍使用原始 API

---

## 六、文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `src/core/service-container.ts` | DI 容器实现 |
| 新增 | `src/core/service-registry.ts` | 服务注册表 |
| 新增 | `src/core/test-context.ts` | 测试支持工具 |
| 修改 | `src/core/app-context.ts` | 重构 createAppContext |
| 修改 | `src/app.ts` | 使用新 API |
| 可选 | 全项目测试文件 | 使用 TestContextBuilder |

---

## 七、收益评估

| 收益 | 当前状态 | 改进后 |
|------|---------|--------|
| 单元测试 Mock | 困难，需重构构造函数 | 简单，一行代码 |
| 服务依赖可视性 | 分散在构造函数 |集中在注册表 |
| 配置管理 | 混合在实例化中 | 分离到 ServiceRegistrationOptions |
| 新增服务 | 需修改多处 | 只需在注册表添加 |
| 运行时切换实现 | 不可能 | 通过 registerMock 实现 |

---

## 八、待讨论事项

1. **是否需要完全移除 LegacyAppContext？**
   - 选项 A：保留，降低迁移成本
   - 选项 B：移除，强制使用新 API

2. **ServiceContainer 是否需要更复杂的功能？**
   - 当前设计为简易容器
   - 可考虑：生命周期管理、异步初始化、装饰器支持

3. **是否引入第三方 DI 库？**
   - 选项 A：自研简易容器（当前方案）
   - 选项 B：使用 inversify、tsyringe 等

4. **配置结构是否需要进一步分离？**
   - 当前 `ServiceRegistrationOptions` 包含所有配置
   - 可考虑按服务分组配置

---

## 九、结论

推荐采用渐进式迁移策略：

1. **立即实施**：创建 ServiceContainer 和兼容层
2. **短期目标**：所有新代码使用新 API
3. **长期目标**：完全迁移旧代码，可选移除兼容层

此方案在不影响现有功能的前提下，显著提升可测试性和灵活性。