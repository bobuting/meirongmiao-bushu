# 数据访问层架构文档

> 最后更新：2026-05-24

## 1. 架构总览

三层严格分层，SQL 唯一归属于 Repository 层：

```
Route (HTTP) → Module/Service (业务逻辑) → Repository (SQL 唯一归属) → Pool
```

### 各层职责与硬性约束

| 层 | 目录 | 职责 | 硬性约束 |
|---|------|------|---------|
| **Route** | `src/routes/` | HTTP 解析、鉴权、调用 Repo/Module、响应格式化 | **禁止 `pool.query`**，handler ≤ 15 行 |
| **Module/Service** | `src/modules/`, `src/service/` | 业务逻辑编排、跨实体协调 | 仅事务协调器可持有 Pool |
| **Repository** | `src/repositories/pg/` | SQL 唯一归属（含 JOIN/聚合）、camelCase ↔ snake_case | 每张 `nrm_*` 表对应一个 Repository |

### 数据流向图

```
Route handler
  ├── ctx.repos.xxx.method()      ← 标准调用
  ├── ctx.xxxService.method()     ← Module 调用
  └── 绝对禁止 ctx.pool.query()

Module/Service
  ├── this.repos.xxx.method()     ← 标准调用
  ├── repos.withTransaction()     ← 事务场景
  └── 仅事务协调器可持有 Pool

Repository
  ├── this.queryClient.query()    ← 类式 Repo（自动选 pool/client）
  └── pool: Pool | PoolClient     ← 函数式 Repo（显式传入）
```

---

## 2. 两种 Repository 风格

### 2.1 类式 Repository（主流，80+ 个）

继承 `PgBaseRepository<T>`，自动获得 CRUD 基础方法：

```typescript
// src/repositories/pg/hot-trend-asset-pg-repository.ts
export class PgHotTrendAssetRepository extends PgBaseRepository<HotTrendAssetRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("hot_trend_assets"), client);
  }

  // 必须实现
  protected mapRow(row: Record<string, unknown>): HotTrendAssetRecord { ... }
  protected mapEntity(entity: HotTrendAssetRecord): Record<string, unknown> { ... }

  // 自定义查询
  async findByTopicAndType(topic: string, trendType: string) {
    const result = await this.queryClient.query(
      `SELECT id FROM ${this.tableName} WHERE topic = $1 AND trend_type = $2 LIMIT 1`,
      [topic, trendType],
    );
    return result.rows[0] ?? null;
  }
}
```

**关键点：**
- `this.queryClient` — 事务时自动用 `client`，非事务用 `pool`
- `this.tableName` — 表名，通过 `nrm("entity_name")` 得到 `nrm_entity_name`
- `mapRow` — 数据库 snake_case → 业务 camelCase
- `mapEntity` — 业务 camelCase → 数据库 snake_case

### 2.2 函数式 Repository（4 个遗留文件）

独立函数，`pool` 作为第一个参数，`client?` 作为最后一个可选参数：

```typescript
// src/repositories/pg/action-templates-pg-repository.ts
export async function findActionTemplateById(
  pool: Pool | PoolClient,
  id: string,
  client?: PoolClient,
): Promise<ActionTemplate | null> {
  const result = await (client ?? pool).query(...);
  ...
}
```

**4 个函数式文件：**
- `action-templates-pg-repository.ts`
- `action-transfer-tasks-pg-repository.ts`
- `ext-douyin-account-repo.ts`
- `shot-prompts-pg-repository.ts`

**调用方式：**
```typescript
// 直接传 pool（非事务）
const template = await findActionTemplateById(ctx.pool, id);

// 事务中传 client
const template = await findActionTemplateById(ctx.pool, id, txClient);
```

---

## 3. PgBaseRepository 基类 API

```typescript
abstract class PgBaseRepository<T> {
  // ─── 继承即可用的方法 ───
  findById(id: string): Promise<T | null>
  findByIds(ids: string[]): Promise<T[]>
  list(): Promise<T[]>
  upsert(entity: T): Promise<void>
  delete(id: string): Promise<void>
  updateFields(id: string, fields: Partial<T>): Promise<void>

  // ─── 子类必须实现 ───
  protected abstract mapRow(row: Record<string, unknown>): T
  protected abstract mapEntity(entity: T): Record<string, unknown>

  // ─── 子类可选实现 ───
  protected async findWhere(conditions: Record<string, unknown>): Promise<T[]>
  protected async findOneWhere(conditions: Record<string, unknown>): Promise<T | null>

  // ─── 工具方法 ───
  protected get queryClient(): Pool | PoolClient  // 自动选 pool/client
  static toJsonb(value: unknown): string
  static fromJsonb<T>(value: unknown): T | null
  static ensureStringArray(value: unknown): string[]
}
```

**注意：** `updateFields` 自动处理 camelCase → snake_case 转换和 JSON 序列化。

---

## 4. PgRepositoryCollection（全部 95 个 Repo）

通过 `ctx.repos` 访问。按领域分类：

### 用户/认证（3）
| 键名 | 类名 | 表名 |
|------|------|------|
| `users` | `PgUserRepository` | `nrm_users` |
| `sessions` | `PgSessionRepository` | `nrm_sessions` |
| `sourceCredentials` | `PgSourceCredentialRepository` | `nrm_source_credentials` |

### 项目核心（9）
| 键名 | 类名 | 表名 |
|------|------|------|
| `projects` | `PgProjectRepository` | `nrm_projects` |
| `assets` | `PgAssetRepository` | `nrm_assets` |
| `garmentAssets` | `PgGarmentAssetRepository` | `nrm_garment_assets` |
| `projectCharacters` | `PgProjectCharacterRepository` | `nrm_project_characters` |
| `projectGarmentAssocs` | `PgProjectGarmentAssocRepository` | `nrm_project_garment_assocs` |
| `projectVideoMusics` | `PgProjectVideoMusicRepository` | `nrm_project_video_musics` |
| `characterFiveViews` | `PgCharacterFiveViewRepository` | `nrm_character_five_views` |
| `outfitPlans` | `PgOutfitPlanRepository` | `nrm_outfit_plans` |
| `projectOutfitPlanAssocs` | `PgProjectOutfitPlanAssocRepository` | `nrm_project_outfit_plan_assocs` |

### 脚本/分镜（8）
| 键名 | 类名 | 表名 |
|------|------|------|
| `scripts` | `PgScriptVersionRepository` | `nrm_scripts` |
| `scriptData` | `PgScriptDataRepository` | `nrm_script_data` |
| `libraryScripts` | `PgLibraryScriptRepository` | `nrm_library_scripts` |
| `libraryScriptVersions` | `PgLibraryScriptVersionRepository` | `nrm_library_script_versions` |
| `shotBreakdowns` | `PgShotBreakdownRepository` | `nrm_shot_breakdown` |
| `stepPrompts` | `PgStepPromptRepository` | `nrm_step_prompts` |
| `userScriptAssocs` | `PgUserScriptAssocRepository` | `nrm_user_script_assocs` |
| `videoScriptAssocs` | `PgVideoScriptAssocRepository` | `nrm_video_script_assocs` |

### 逆向工程（5）
| 键名 | 类名 | 表名 |
|------|------|------|
| `reverseTasks` | `PgReverseTaskRepository` | `nrm_reverse_tasks` |
| `reverseAttempts` | `PgReverseAttemptRepository` | `nrm_reverse_attempts` |
| `reverseTraces` | `PgReverseTraceRepository` | `nrm_reverse_traces` |
| `reverseStoryboardLibrary` | `PgReverseStoryboardLibraryRepository` | `nrm_reverse_storyboard_library` |
| `reverseStoryboardLibraryVersions` | `PgReverseStoryboardLibraryVersionRepository` | `nrm_reverse_storyboard_library_versions` |

### 智能分镜（2）
| 键名 | 类名 | 表名 |
|------|------|------|
| `smartStoryboardLibrary` | `PgSmartStoryboardLibraryRepository` | `nrm_smart_storyboard_library` |
| `smartStoryboardLibraryVersions` | `PgSmartStoryboardLibraryVersionRepository` | `nrm_smart_storyboard_library_versions` |

### 视频/成片（7）
| 键名 | 类名 | 表名 |
|------|------|------|
| `finalVideos` | `PgFinalVideoRepository` | `nrm_final_videos` |
| `step4VideoScenes` | `PgStep4VideoSceneRepository` | `nrm_step4_video_scenes` |
| `segmentVideos` | `PgSegmentVideoRepository` | `nrm_segment_videos` |
| `mirrorVideos` | `PgMirrorVideoRepository` | `nrm_mirror_videos` |
| `videoProjectBusinessData` | `PgVideoProjectBusinessDataRepository` | `nrm_video_project_business_data` |
| `videoMusics` | `PgVideoMusicRepository` | `nrm_video_musics` |
| `step3FrameImages` | `PgStep3FrameImageRepository` | `nrm_step3_frame_images` |

### 图片项目（3）
| 键名 | 类名 | 表名 |
|------|------|------|
| `imageProjectExt` | `PgImageProjectExtRepository` | `nrm_image_project_ext` |
| `longImageGeneration` | `PgLongImageGenerationRepository` | `nrm_long_image_generation` |
| `modelPhotos` | `PgModelPhotoRepository` | `nrm_model_photos` |

### 换装（1）
| 键名 | 类名 | 表名 |
|------|------|------|
| `outfitChangeProjects` | `PgOutfitChangeProjectRepository` | `nrm_outfit_change_projects` |

### 裂变（5）
| 键名 | 类名 | 表名 |
|------|------|------|
| `fissionVideos` | `PgFissionVideoRepository` | `nrm_fission_videos` |
| `fissionVideoStatus` | `PgFissionVideoStatusRepository` | `nrm_fission_video_status` |
| `fissionTaskItems` | `PgFissionTaskItemRepository` | `nrm_fission_task_items` |
| `fissionStoryboards` | `PgFissionStoryboardRepository` | `nrm_fission_storyboards` |
| `fissionVideosMirror` | `PgFissionVideosMirrorRepository` | `nrm_fission_videos_mirror` |

### 积分/定价（3）
| 键名 | 类名 | 表名 |
|------|------|------|
| `credits` | `PgCreditRepository` | `nrm_credits` |
| `creditFreezes` | `PgCreditFreezeRepository` | `nrm_credit_freezes` |
| `creditPricing` | `PgCreditPricingRepository` | `nrm_credit_pricing` |

### Provider/LLM（7）
| 键名 | 类名 | 表名 |
|------|------|------|
| `providers` | `PgProviderRepository` | `nrm_providers` |
| `providerSecrets` | `PgProviderSecretRepository` | `nrm_provider_secrets` |
| `providerPolicies` | `PgProviderPolicyRepository` | `nrm_provider_policies` |
| `providerCallAudits` | `PgProviderCallAuditRepository` | `nrm_provider_call_audits` |
| `promptCallLogs` | `PgPromptCallLogRepository` | `nrm_prompt_call_logs` |
| `promptEvolutionProposals` | `PgPromptEvolutionProposalRepository` | `nrm_prompt_evolution_proposals` |
| `promptVersionMetrics` | `PgPromptVersionMetricsRepository` | `nrm_prompt_version_metrics` |

### 热榜/趋势（6）
| 键名 | 类名 | 表名 |
|------|------|------|
| `hotTrendAssets` | `PgHotTrendAssetRepository` | `nrm_hot_trend_assets` |
| `hotTrendDailyReports` | `PgHotTrendDailyReportRepository` | `nrm_hot_trend_daily_reports` |
| `hotTrendSyncLogs` | `PgHotTrendSyncLogRepository` | `nrm_hot_trend_sync_logs` |
| `hotTrendEffectTracking` | `PgHotTrendEffectTrackingRepository` | `nrm_hot_trend_effect_tracking` |
| `trendEntries` | `PgTrendEntryRepository` | `nrm_trend_entries` |
| `trendSyncJobs` | `PgTrendSyncJobRepository` | `nrm_trend_sync_jobs` |

### 广场（8）
| 键名 | 类名 | 表名 |
|------|------|------|
| `squareUserWorks` | `PgSquareUserWorkRepository` | `nrm_square_user_works` |
| `squarePublishRequests` | `PgSquarePublishRequestRepository` | `nrm_square_publish_requests` |
| `squareTemplates` | `PgSquareTemplateRepository` | `nrm_square_templates` |
| `squareBehaviorLogs` | `PgSquareBehaviorLogRepository` | `nrm_square_behavior_logs` |
| `squareCreatorTargets` | `PgSquareCreatorTargetRepository` | `nrm_square_creator_targets` |
| `squareDiscoveredVideos` | `PgSquareDiscoveredVideoRepository` | `nrm_square_discovered_videos` |
| `squareExecutionLogs` | `PgSquareExecutionLogRepository` | `nrm_square_execution_logs` |
| `userSquarePreferences` | `PgUserSquarePreferenceRepository` | `nrm_user_square_preferences` |

### 情感/审美（6）
| 键名 | 类名 | 表名 |
|------|------|------|
| `emotionArchetypes` | `PgEmotionArchetypeLibraryRepository` | `nrm_emotion_archetype_library` |
| `emotionArchetypeRunLogs` | `PgEmotionArchetypeRunLogRepository` | `nrm_emotion_archetype_run_logs` |
| `aestheticLibrary` | `PgAestheticLibraryRepository` | `nrm_aesthetic_library` |
| `aestheticUpdateLogs` | `PgAestheticUpdateLogRepository` | `nrm_aesthetic_update_logs` |
| `sceneLibrary` | `PgSceneLibraryRepository` | `nrm_scene_library` |
| `sceneLibraryUpdateLogs` | `PgSceneLibraryUpdateLogRepository` | `nrm_scene_library_update_logs` |

### 页面/配置（10）
| 键名 | 类名 | 表名 |
|------|------|------|
| `themes` | `PgThemeRepository` | `nrm_themes` |
| `userThemePreferences` | `PgUserThemePreferenceRepository` | `nrm_user_theme_preferences` |
| `config` | `PgConfigRepository` | `nrm_config` |
| `businessConfigs` | `PgBusinessConfigRepository` | `nrm_business_configs` |
| `functionalRoutes` | `PgFunctionalRouteRepository` | `nrm_functional_routes` |
| `announcements` | `PgAnnouncementRepository` | `nrm_announcements` |
| `pageSections` | `PgPageSectionRepository` | `nrm_page_sections` |
| `sectionVersions` | `PgSectionVersionRepository` | `nrm_section_versions` |
| `roleDirectionCards` | `PgRoleDirectionCardsRepository` | `nrm_role_direction_cards` |
| `libraryCharacters` | `PgLibraryCharacterRepository` | `nrm_library_characters` |

### 审计/日志（6）
| 键名 | 类名 | 表名 |
|------|------|------|
| `adminOperationLogs` | `PgAdminOperationLogRepository` | `nrm_admin_operation_logs` |
| `auditLogs` | `PgAuditLogRepository` | `nrm_audit_logs` |
| `errorLogs` | `PgErrorLogRepository` | `nrm_error_logs` |
| `reviewRequests` | `PgReviewRequestRepository` | `nrm_review_requests` |
| `publicResources` | `PgPublicResourceRepository` | `nrm_public_resources` |
| `deadLetters` | `PgDeadLetterRepository` | `nrm_dead_letters` |

### 任务队列（3）
| 键名 | 类名 | 表名 |
|------|------|------|
| `asyncJobs` | `PgAsyncJobRepository` | `nrm_async_jobs` |
| `systemJobs` | `PgSystemJobRepository` | `nrm_system_jobs` |
| `fileRegistry` | `PgFileRegistryRepository` | `nrm_file_registry` |

### 外部集成（2）
| 键名 | 类名 | 表名 |
|------|------|------|
| `extTokens` | `PgExtTokenRepository` | `nrm_ext_tokens` |
| `extDouyinPublishJobs` | `PgExtDouyinPublishJobRepository` | `nrm_ext_douyin_publish_jobs` |

### 脚本质量（1）
| 键名 | 类名 | 表名 |
|------|------|------|
| `scriptQualityScores` | `PgScriptQualityScoreRepository` | `nrm_script_quality_scores` |

---

## 5. 事务模式

### 标准事务（推荐）

通过 `ctx.repos.withTransaction()` 自动获取事务内的 Repo 集合：

```typescript
await ctx.repos.withTransaction(async (txRepos) => {
  // txRepos 是独立的 PgRepositoryCollection
  // 内部所有 Repo 使用同一个 PoolClient
  await txRepos.credits.deduct(userId, amount);
  await txRepos.projects.updateStatus(projectId, "PROCESSING");
});
```

**原理：** `withTransaction` 内部调用 `pool.connect()` 获取 `PoolClient`，执行 `BEGIN`，创建新 `PgRepositoryCollection`（所有 Repo 绑定同一 client），执行回调，成功则 `COMMIT`，失败则 `ROLLBACK`。

### Module 内事务

```typescript
// src/modules/credit-service.ts 示例
class CreditService {
  constructor(private repos: PgRepositoryCollection) {}

  async transfer(from: string, to: string, amount: number) {
    await this.repos.withTransaction(async (txRepos) => {
      await txRepos.credits.deduct(from, amount);
      await txRepos.credits.add(to, amount);
    });
  }
}
```

---

## 6. 新增表的完整流程

当新增 `nrm_*` 表时，按以下步骤创建 Repository：

### 步骤 1：定义 Record 类型

```typescript
// src/repositories/pg/my-entity-pg-repository.ts

/** 实体记录类型（camelCase） */
export interface MyEntityRecord {
  id: string;
  fieldName: string | null;
  createdAt: number;
  updatedAt: number;
}
```

### 步骤 2：创建 Repository 类

```typescript
export class PgMyEntityRepository extends PgBaseRepository<MyEntityRecord> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("my_entity"), client);
  }

  protected mapRow(row: Record<string, unknown>): MyEntityRecord {
    return {
      id: row.id as string,
      fieldName: row.field_name as string | null,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  protected mapEntity(entity: MyEntityRecord): Record<string, unknown> {
    return {
      id: entity.id,
      field_name: entity.fieldName,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
    };
  }

  // 自定义查询方法
  async findByName(name: string): Promise<MyEntityRecord | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE field_name = $1 LIMIT 1`,
      [name],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }
}
```

### 步骤 3：注册到 PgRepositoryCollection

编辑 `src/repositories/pg/index.ts`：

```typescript
// 1. 添加 import
import { PgMyEntityRepository } from "./my-entity-pg-repository.js";

// 2. 在 interface 中添加属性
export interface PgRepositoryCollection {
  // ...existing repos...
  myEntities: PgMyEntityRepository;
}

// 3. 在 createPgRepositories 工厂中添加
myEntities: new PgMyEntityRepository(pool),

// 4. 在 createPgRepositoriesFromClient 工厂中添加
myEntities: new PgMyEntityRepository(pool, client),
```

### 步骤 4：使用

```typescript
// Route 中
const entity = await ctx.repos.myEntities.findByName("test");

// Module 中
const entity = await this.repos.myEntities.findById(id);
```

---

## 7. SQL 归属规则

### 单表操作 → 该表的 Repository

```typescript
// ✅ 正确：在 PgProjectRepository 中
async findByUserId(userId: string) {
  return this.queryClient.query(
    `SELECT * FROM ${this.tableName} WHERE user_id = $1`,
    [userId],
  );
}
```

### 多表 JOIN → 驱动表的 Repository

```typescript
// ✅ 正确：project 是驱动表，JOIN 放在 PgProjectRepository
async listWithUserAndGarmentFilter(params: ListParams) {
  return this.queryClient.query(
    `SELECT p.*, u.name as user_name
     FROM ${this.tableName} p
     LEFT JOIN nrm_users u ON p.user_id = u.id
     WHERE ...`,
    [...],
  );
}
```

### 无明确驱动表的统计/报表 → 函数式

无对应表的复杂统计查询，放 `src/repositories/pg/` 下的独立文件（函数式）。

---

## 8. 允许持有 Pool 的例外

以下场景允许直接持有 `Pool` 引用：

| 场景 | 文件 | 原因 |
|------|------|------|
| Advisory Lock | `src/modules/global-task-concurrency-service.ts` | PostgreSQL advisory lock 需要 `Pool` |
| DDL/Schema | `src/repositories/pg/async-job-pg-repository.ts` | `ensureSchema` 静态方法 |
| 基类 | `src/repositories/pg/base-pg-repository.ts` | 事务自动切换 pool/client |
| 函数式 Repo | 4 个函数式 repo 文件 | `pool` 作为首参数传入 |
| 非数据库操作 | `src/persistence/hot-trend-db-operations.ts` | 视频下载/OSS 上传（已无 SQL） |

---

## 9. 常见模式速查

### Route 标准写法

```typescript
app.get("/admin/projects", async (req) => {
  const { page, limit } = req.query as { page?: number; limit?: number };
  const result = await ctx.repos.projects.listWithUserAndGarmentFilter({
    page: page ?? 1,
    limit: limit ?? 50,
  });
  return { success: true, data: result };
});
```

### 跨实体协调（Module）

```typescript
export async function createProjectWithCredit(
  ctx: AppContext,
  userId: string,
  params: CreateProjectParams,
) {
  return ctx.repos.withTransaction(async (txRepos) => {
    const project = await txRepos.projects.create(params);
    await txRepos.credits.deduct(userId, CREDIT_COST);
    return project;
  });
}
```

### 批量操作

```typescript
// 批量查询（避免 N+1）
const scripts = await ctx.repos.scriptData.findByIds(scriptIds);

// 批量插入
const count = await ctx.repos.shotBreakdowns.batchInsert({
  scriptDataId,
  shots: [...],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});
```

### Upsert 模式

```typescript
// 使用基类 upsert（按 id 冲突）
await ctx.repos.hotTrendAssets.upsert(asset);

// 自定义冲突键的 upsert
await ctx.repos.hotTrendAssets.upsertWithVideoMetadata({ ... });
```

---

## 10. 验证清单

每次修改数据访问层后，运行以下检查：

```bash
# 1. Route 层无 pool.query
grep -rn "pool\.query" src/routes/ --include="*.ts"
# 预期：0 结果

# 2. Persistence 层无 pool.query
grep -rn "pool\.query" src/persistence/ --include="*.ts"
# 预期：0 结果

# 3. TypeScript 编译通过
npx tsc --noEmit
# 预期：0 错误

# 4. Module 层 pool.query（仅事务协调器）
grep -rln "pool\.query" src/modules/ --include="*.ts"
# 预期：仅 global-task-concurrency-service.ts
```

---

## 11. 关键文件索引

| 文件 | 作用 |
|------|------|
| `src/repositories/pg/base-pg-repository.ts` | 基类，CRUD 通用实现 |
| `src/repositories/pg/soft-deletable-repository.ts` | 软删除基类 |
| `src/repositories/pg/index.ts` | 工厂 + Collection 接口 + 事务 |
| `src/core/app-context.ts` | `ctx.repos` 注册中心 |
| `src/contracts/repository-ports/` | 接口定义 |
| `src/persistence/hot-trend-db-operations.ts` | 热榜操作（已无 SQL，委托 Repo） |
