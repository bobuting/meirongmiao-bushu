# 文件注册中心设计规格

> **目标：** 统一管理所有上传文件的元数据、去重和引用追踪，解决存储空间管理、重复上传、引用追踪三大痛点。

## 一、问题分析

### 当前痛点

| 痛点 | 具体表现 |
|-----|---------|
| **存储空间爆满** | 无法安全删除无用文件，不知道哪些文件可以清理 |
| **重复上传** | 多模块重复上传相同内容，浪费存储和带宽 |
| **引用追踪困难** | 文件 URL 散落各表各字段，排查问题时难以定位归属 |

### 文件散落现状

**数据库表中的文件字段（不完全统计）：**

| 表 | 文件字段 |
|---|---|
| `nrm_projects` | `thumbnail_url`, `export_url` |
| `nrm_garment_assets` | `main_image_url`, `sub_image_url_1/2/3` |
| `nrm_character_five_views` | `image_url` |
| `nrm_hot_trend_assets` | `source_oss_url`, `cover_url`, `video_url`, `audio_url` |
| `nrm_square_user_works` | `cover_url`, `video_url` |
| `nrm_script_data` storyboard JSON | `sceneImageUrl` |
| `nrm_shot_prompts` | `referenceImageUrl` |

**文件写入入口（分散）：**

| 入口 | 位置 | 去重方式 |
|---|---|---|
| 前端直传 OSS | `ossUpload.ts` | 无 |
| 媒体持久化工具 | `storage-persist.ts` | SHA256 内容去重（仅内部） |
| 热榜同步 | `hot-trend-db-operations.ts` | 无 |
| 广场反推 | `reverse-square-routes.ts` | 无 |
| 裂变视频 | `fission-video-routes.ts` | 无 |

### 设计决策

**选择方案二：集中式文件服务**

理由：
- 项目多上传入口（6+个）、多业务模块（Step1-6 + 广场 + 热榜 + 裂变）
- 长期维护视角，统一规则降低维护成本
- 企业级项目标准做法（阿里云 OSS、字节跳动内部存储均采用此模式）

**采用渐进式迁移策略**：不破坏现有接口，逐步迁移各入口。

---

## 二、数据库设计

### nrm_file_registry 表

```sql
-- 文件注册表：统一管理所有文件元数据
CREATE TABLE nrm_file_registry (
  id VARCHAR(32) PRIMARY KEY,

  -- 上传者信息
  uploader_id VARCHAR(32) NOT NULL,         -- 上传用户 ID
  uploader_type VARCHAR(16) DEFAULT 'user', -- 'user' | 'system' | 'scheduler'

  -- 存储信息
  storage_key VARCHAR(512) NOT NULL,        -- OSS/本地存储路径
  storage_driver VARCHAR(16) NOT NULL,      -- 'alioss' | 'local'
  public_url VARCHAR(1024),                 -- 公开访问 URL

  -- 内容指纹（去重关键）
  content_sha256 CHAR(64) NOT NULL,         -- SHA256 内容哈希

  -- 文件属性
  file_type VARCHAR(16) NOT NULL,           -- 'image' | 'video' | 'audio' | 'document'
  content_type VARCHAR(128),                -- MIME 类型
  file_size_bytes BIGINT,                   -- 文件大小
  file_name VARCHAR(256),                   -- 原始文件名（保留用户上传的文件名）

  -- 业务标签（便于分类查询）
  business_domain VARCHAR(32),              -- 业务域：'project' | 'library' | 'square' | 'hot_trend' | 'fission'
  business_subdomain VARCHAR(32),           -- 子域：'step1_clothing' | 'step2_character' | 'step3_script' 等
  business_tags JSONB,                      -- 扩展标签：{"project_id": "xxx", "character_id": "yyy"}

  -- 引用追踪
  ref_count INT DEFAULT 1,                  -- 引用计数
  first_ref_entity VARCHAR(64),             -- 首次引用实体类型
  first_ref_entity_id VARCHAR(32),          -- 首次引用实体 ID

  -- 时间戳
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,

  -- 索引
  UNIQUE(content_sha256, storage_driver),   -- 去重：同一驱动下相同内容只存一份
  INDEX(storage_key),                       -- 按存储路径查询
  INDEX(uploader_id),                       -- 按上传者查询
  INDEX(business_domain, business_subdomain), -- 按业务域查询
  INDEX(ref_count, updated_at)              -- 清理查询：零引用 + 长时间未更新
);

COMMENT ON TABLE nrm_file_registry IS '文件注册中心：统一管理所有上传文件的元数据、去重和引用追踪';
COMMENT ON COLUMN nrm_file_registry.content_sha256 IS '内容 SHA256 哈希，用于去重判断';
COMMENT ON COLUMN nrm_file_registry.business_domain IS '业务域：project/library/square/hot_trend/fission 等';
COMMENT ON COLUMN nrm_file_registry.business_tags IS '扩展业务标签 JSONB，存储关联实体 ID';
COMMENT ON COLUMN nrm_file_registry.ref_count IS '引用计数，零引用文件可安全删除';
```

### 字段说明

| 字段 | 用途 |
|-----|------|
| `uploader_id` | 追踪谁上传的文件，便于用户维度统计和权限校验 |
| `uploader_type` | 区分用户上传、系统自动上传、定时任务上传 |
| `file_name` | 保留原始文件名，便于用户识别和下载时使用 |
| `business_domain` | 业务域分类，便于按模块查询文件 |
| `business_subdomain` | 子域细分，如 step1_clothing、step2_character |
| `business_tags` | JSONB 扩展标签，存储关联实体 ID（project_id、character_id 等） |

---

## 三、服务接口设计

### FileService 契约

```typescript
/**
 * 文件服务接口契约
 */
interface IFileService {
  /**
   * 上传文件（自动去重）
   * - 检查 SHA256 是否已存在
   * - 已存在：返回已有记录，增加引用计数
   * - 不存在：上传到存储，创建注册记录
   */
  upload(
    uploaderId: string,
    content: Uint8Array,
    options: UploadOptions
  ): Promise<FileRegistryRecord>;

  /**
   * 注册引用关系
   * - 增加文件的引用计数
   * - 更新 business_tags 关联信息
   */
  registerReference(
    fileId: string,
    refEntity: ReferenceEntity
  ): Promise<void>;

  /**
   * 释放引用关系
   * - 减少文件的引用计数
   * - 移除 business_tags 中的关联
   */
  releaseReference(
    fileId: string,
    refEntity: ReferenceEntity
  ): Promise<void>;

  /**
   * 按存储路径查找文件记录
   */
  findByStorageKey(storageKey: string): Promise<FileRegistryRecord | null>;

  /**
   * 按 SHA256 查找文件记录
   */
  findBySha256(sha256: string, driver?: string): Promise<FileRegistryRecord | null>;

  /**
   * 查询零引用文件（清理用途）
   */
  findZeroRefFiles(options: {
    olderThanDays?: number;
    businessDomain?: string;
    limit?: number;
  }): Promise<FileRegistryRecord[]>;

  /**
   * 删除文件（仅零引用文件可删除）
   */
  deleteFile(fileId: string): Promise<void>;
}

interface UploadOptions {
  fileName?: string;
  contentType?: string;
  storageDriver?: 'alioss' | 'local';  // 默认用系统配置
  businessDomain: string;              // 必填：业务域
  businessSubdomain?: string;
  businessTags?: Record<string, string>;
  firstRefEntity?: ReferenceEntity;    // 首次引用（可选）
}

interface ReferenceEntity {
  entityType: string;    // 'project' | 'garment_asset' | 'character_preview' | 'hot_trend_asset' 等
  entityId: string;
}

interface FileRegistryRecord {
  id: string;
  uploaderId: string;
  uploaderType: string;
  storageKey: string;
  storageDriver: string;
  publicUrl: string;
  contentSha256: string;
  fileType: string;
  contentType: string;
  fileSizeBytes: number;
  fileName: string;
  businessDomain: string;
  businessSubdomain: string;
  businessTags: Record<string, string>;
  refCount: number;
  firstRefEntity: string;
  firstRefEntityId: string;
  createdAt: number;
  updatedAt: number;
}
```

### 核心上传流程

```
┌─────────────────────────────────────────────────────────────┐
│                      FileService.upload()                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 计算 SHA256                                               │
│         │                                                     │
│         ▼                                                     │
│  2. 查询 nrm_file_registry                                    │
│     WHERE content_sha256 = ? AND storage_driver = ?          │
│         │                                                     │
│         ├────── 存在 ──────► 返回已有记录                      │
│         │                     │                               │
│         │              registerReference()                    │
│         │              (增加 ref_count)                        │
│         │                                                     │
│         ▼                                                     │
│  3. 不存在                                                    │
│         │                                                     │
│         ▼                                                     │
│  4. storage.putObject()                                       │
│         │                                                     │
│         ▼                                                     │
│  5. storage.getSignedUrl()                                    │
│         │                                                     │
│         ▼                                                     │
│  6. INSERT nrm_file_registry                                  │
│         │                                                     │
│         ▼                                                     │
│  7. 返回新记录                                                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 四、文件组织结构

### 新增文件

```
src/
├── services/file/
│   ├── file-service.ts              # FileService 核心实现
│   ├── file-type-detector.ts        # 文件类型检测（image/video/audio）
│   └── file-registry-contract.ts    # 类型定义
├── repositories/pg/
│   └── file-registry-pg-repository.ts  # 文件注册表仓库
├── contracts/
│   └── file-service-contract.ts     # 服务接口契约
├── routes/
│   └── admin-file-registry-routes.ts  # 后台管理路由

apps/web/
├── pages/admin/
│   └── FileRegistryManagement.tsx   # 后台管理页面
├── services/realApi/
│   └── fileRegistry.ts              # 后台 API 封装
```

### 改造文件

| 文件 | 改动 |
|-----|------|
| `app-context.ts` | 新增 `fileService` 属性 |
| `app-setup/app-services.ts` | 初始化 FileService |
| `app.ts` | 暴露 `ctx.fileService` |
| `storage-persist.ts` | 调用 `ctx.fileService.upload()` |

---

## 五、迁移阶段规划

### 第一阶段：基础设施搭建（1-2天）

- 创建 `nrm_file_registry` 表
- 实现 `FileService` 核心类
- 实现 `FileRegistryRepository`
- 清理功能代码实现（默认关闭）
- 单元测试覆盖

### 第二阶段：高频入口改造（2-3天）

| 入口 | 当前实现 | 改造后 |
|-----|---------|-------|
| `storage-persist.ts` | 直接 `ctx.storage.putObject()` | 调用 `ctx.fileService.upload()` |
| 前端上传路由 | 无注册 | 上传后注册到 `nrm_file_registry` |
| Step1服饰上传 | `UploadService` | 集成 `FileService` |

**改造示例（storage-persist.ts）：**

```typescript
// 改造前
await ctx.storage.putObject(key, bytes, contentType);
return ctx.storage.getSignedUrl(key);

// 改造后
const record = await ctx.fileService.upload(userId, bytes, {
  contentType,
  businessDomain: 'project',
  businessSubdomain: 'media_persist',
  storageDriver: ctx.storage?.driver,
});
return record.publicUrl;
```

### 第三阶段：低频入口改造（2-3天）

| 模块 | 业务域 | 改造内容 |
|-----|--------|---------|
| 热榜同步 | `hot_trend` | 视频封面/源视频上传注册 |
| 广场反推 | `square` | 反推视频上传注册 |
| 裂变视频 | `fission` | 裂变产物上传注册 |
| Step2定妆 | `project/step2` | 五视图上传注册 |
| Step3脚本 | `project/step3` | 分镜图上传注册 |
| Step4分镜 | `project/step4` | 分镜视频上传注册 |

### 第四阶段：监控与统计（可选）

- 文件使用统计接口
- 存储空间占用报表
- 按业务域/用户维度统计

---

## 六、清理机制设计

**默认关闭，环境变量控制启用：**

```typescript
// 环境变量配置
FILE_CLEANUP_ENABLED=false              // 是否启用清理任务（默认关闭）
FILE_CLEANUP_THRESHOLD_DAYS=30          // 零引用保留天数
FILE_CLEANUP_BATCH_SIZE=100             // 每次清理数量上限
```

**清理任务实现：**

```typescript
// 定时任务：每天凌晨清理零引用文件
async function cleanupZeroRefFiles() {
  if (process.env.FILE_CLEANUP_ENABLED !== 'true') {
    return; // 未启用，跳过
  }

  const files = await fileService.findZeroRefFiles({
    olderThanDays: parseInt(process.env.FILE_CLEANUP_THRESHOLD_DAYS || '30'),
    limit: parseInt(process.env.FILE_CLEANUP_BATCH_SIZE || '100'),
  });

  for (const file of files) {
    await fileService.deleteFile(file.id);
    await auditLog('file_cleanup', { fileId: file.id, storageKey: file.storageKey });
  }
}
```

**安全约束：**

- 仅删除 `ref_count = 0` 的文件
- 保留时间窗口（30天）防止误删刚上传的文件
- 删除前写入审计日志
- 管理后台可手动暂停清理

---

## 七、后台管理设计

### 后台路由

```typescript
// src/routes/admin-file-registry-routes.ts

export interface AdminFileRegistryRouteHandlers {
  readonly listFiles: RouteHandlerMethod;          // GET /admin/files
  readonly getFileDetail: RouteHandlerMethod;      // GET /admin/files/:id
  readonly getFileReferences: RouteHandlerMethod;  // GET /admin/files/:id/references
  readonly getStorageStats: RouteHandlerMethod;    // GET /admin/files/stats
  readonly deleteFile: RouteHandlerMethod;         // DELETE /admin/files/:id
  readonly getCleanupStatus: RouteHandlerMethod;   // GET /admin/files/cleanup/status
  readonly toggleCleanup: RouteHandlerMethod;      // POST /admin/files/cleanup/toggle
  readonly getCleanupHistory: RouteHandlerMethod;  // GET /admin/files/cleanup/history
}
```

### 后台页面功能

| 功能 | 说明 |
|-----|------|
| **文件列表** | 按业务域/上传者/时间筛选，显示文件类型、大小、引用计数 |
| **文件详情** | 显示存储路径、SHA256、引用实体列表、上传者信息 |
| **引用追踪** | 查看哪些业务实体引用了该文件 |
| **存储统计** | 按业务域/用户统计存储空间占用 |
| **清理任务管理** | 启用/禁用清理、查看清理历史（默认禁用） |

### 后台页面布局

```
┌─────────────────────────────────────────────────────────────────────┐
│  文件管理中心                                    [清理任务] [统计]    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  筛选：[业务域 ▼] [文件类型 ▼] [上传者 ▼] [时间范围 ▼]    [搜索]     │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ 存储统计卡片                                                      ││
│  │ 总文件: 12,345    总大小: 45.6 GB    零引用: 234    待清理: 56   ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ 文件列表                                                          ││
│  │ ─────────────────────────────────────────────────────────────   ││
│  │ 📷 dress.jpg     project/step1    2.3MB    引用:3    [详情][删除]││
│  │ 🎬 output.mp4    fission          15MB     引用:1    [详情]      ││
│  │ 📷 cover.png     hot_trend        0.8MB    引用:0    [详情][删除]││
│  │ ...                                                              ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 八、业务域定义

| 业务域 | 子域 | 说明 |
|-------|------|------|
| `project` | `step1_clothing` | Step1 服饰上传 |
| `project` | `step2_character` | Step2 定妆/五视图 |
| `project` | `step3_script` | Step3 脚本生成 |
| `project` | `step4_storyboard` | Step4 分镜视频 |
| `project` | `step5_delivery` | Step5 成片 |
| `project` | `media_persist` | 媒体持久化工具 |
| `library` | `garment_asset` | 用户服装库 |
| `library` | `character` | 角色库 |
| `square` | `publish` | 广场发布 |
| `square` | `reverse` | 广场反推 |
| `hot_trend` | `sync` | 热榜同步 |
| `hot_trend` | `video_cover` | 热榜视频封面 |
| `fission` | `storyboard_video` | 裂变分镜视频 |
| `fission` | `new_story` | 新故事裂变 |

---

## 九、验收标准

### 功能验收

- [ ] 文件上传自动注册到 `nrm_file_registry`
- [ ] SHA256 去重生效，相同内容返回已有 URL
- [ ] 引用计数正确增减
- [ ] 后台管理页面可查看文件列表和详情
- [ ] 存储统计按业务域正确汇总

### 性能验收

- [ ] 上传去重查询响应时间 < 50ms
- [ ] 文件列表查询支持分页（默认 50 条）
- [ ] 后台统计接口响应时间 < 200ms

### 安全验收

- [ ] 仅管理员可访问后台管理接口
- [ ] 仅零引用文件可被删除
- [ ] 清理任务默认关闭，需手动启用

---

## 十、风险与应对

| 风险 | 影响 | 应对措施 |
|-----|------|---------|
| 迁移期间重复数据 | 短期内新旧数据并存 | 迁移完成后手动清理旧数据 |
| 引用计数不准 | 零引用误删或有用文件保留 | 定期扫描校验 + 审计日志 |
| 存储驱动切换 | 本地到 OSS 切换时数据迁移 | 提供迁移工具脚本 |

---

## 十一、后续扩展方向

1. **版本控制** — 同一文件多版本管理
2. **分层存储** — 热数据 OSS，冷数据低成本存储
3. **CDN 加速** — 自动生成 CDN URL
4. **跨区域复制** — 异地容灾备份
5. **图片处理** — 集成图片压缩、裁剪、水印