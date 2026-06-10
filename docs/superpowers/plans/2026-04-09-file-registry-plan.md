# 文件注册中心实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现统一的文件注册中心，管理所有上传文件的元数据、去重和引用追踪。

**架构：** 新增 `nrm_file_registry` 数据库表存储文件元数据，`FileService` 提供统一上传入口，自动 SHA256 去重和引用计数管理。渐进式迁移现有上传入口。

**技术栈：** TypeScript 5 + PostgreSQL + Fastify 5 + 阿里云 OSS

---

## 文件组织结构

### 新增文件

| 文件 | 职责 |
|-----|------|
| `src/contracts/file-registry-contract.ts` | 类型定义：FileRegistryRecord、UploadOptions、IFileService 等 |
| `src/contracts/repository-ports/file-registry-repository.ts` | 仓库接口：IFileRegistryRepository |
| `src/repositories/pg/file-registry-pg-repository.ts` | PostgreSQL 仓库实现 |
| `src/services/file/file-service.ts` | FileService 核心实现 |
| `src/services/file/file-type-detector.ts` | 文件类型检测工具 |
| `src/routes/admin-file-registry-routes.ts` | 后台管理路由 |
| `apps/web/services/realApi/fileRegistry.ts` | 前端 API 封装 |
| `apps/web/pages/admin/FileRegistryManagement.tsx` | 后台管理页面 |

### 改造文件

| 文件 | 改动 |
|-----|------|
| `src/repositories/pg/index.ts` | 添加 fileRegistry 仓库到集合 |
| `src/core/app-context.ts` | 添加 fileService 属性 |
| `src/app-setup/app-services.ts` | 初始化 FileService |
| `src/services/media/storage-persist.ts` | 集成 FileService（可选调用） |

---

## 任务分解

---

### 任务 1：创建类型契约文件

**文件：**
- 创建：`src/contracts/file-registry-contract.ts`

**业务域定义：**

```typescript
/** 业务域 */
export type FileBusinessDomain =
  | 'project'
  | 'library'
  | 'square'
  | 'hot_trend'
  | 'fission';

/** 业务子域 */
export type FileBusinessSubdomain =
  | 'step1_clothing'
  | 'step2_character'
  | 'step3_script'
  | 'step4_storyboard'
  | 'step5_delivery'
  | 'media_persist'
  | 'garment_asset'
  | 'character'
  | 'publish'
  | 'reverse'
  | 'sync'
  | 'video_cover'
  | 'storyboard_video'
  | 'new_story';

/** 上传者类型 */
export type FileUploaderType = 'user' | 'system' | 'scheduler';

/** 文件类型 */
export type FileType = 'image' | 'video' | 'audio' | 'document';

/** 存储驱动类型 */
export type FileStorageDriver = 'alioss' | 'local';
```

**实体类型定义：**

```typescript
/** 文件注册记录 */
export interface FileRegistryRecord {
  id: string;
  uploaderId: string;
  uploaderType: FileUploaderType;
  storageKey: string;
  storageDriver: FileStorageDriver;
  publicUrl: string;
  contentSha256: string;
  fileType: FileType;
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

/** 上传选项 */
export interface FileUploadOptions {
  fileName?: string;
  contentType?: string;
  storageDriver?: FileStorageDriver;
  businessDomain: string;
  businessSubdomain?: string;
  businessTags?: Record<string, string>;
  firstRefEntity?: ReferenceEntity;
}

/** 引用实体 */
export interface ReferenceEntity {
  entityType: string;
  entityId: string;
}

/** 文件查询过滤器 */
export interface FileRegistryFilters {
  page?: number;
  pageSize?: number;
  businessDomain?: string;
  businessSubdomain?: string;
  fileType?: FileType;
  uploaderId?: string;
  refCountZero?: boolean;
  createdAfter?: number;
  createdBefore?: number;
}

/** 存储统计 */
export interface FileStorageStats {
  totalFiles: number;
  totalSizeBytes: number;
  byDomain: Record<string, { count: number; sizeBytes: number }>;
  byFileType: Record<FileType, { count: number; sizeBytes: number }>;
  zeroRefFiles: number;
  zeroRefSizeBytes: number;
}

/** 清理状态 */
export interface FileCleanupStatus {
  enabled: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  retentionDays: number;
  totalCleaned: number;
}
```

- [ ] **步骤 1：创建契约文件**

创建文件 `src/contracts/file-registry-contract.ts`，写入上述完整类型定义。

- [ ] **步骤 2：验证 TypeScript 编译**

运行：`npm run build`
预期：编译成功，无类型错误

- [ ] **步骤 3：Commit**

```bash
git add src/contracts/file-registry-contract.ts
git commit -m "feat: add file registry contract types"
```

---

### 任务 2：创建仓库接口契约

**文件：**
- 创建：`src/contracts/repository-ports/file-registry-repository.ts`

- [ ] **步骤 1：创建仓库接口文件**

```typescript
/**
 * 文件注册仓库端口
 */

import type { FileRegistryRecord, FileRegistryFilters, FileStorageStats } from "../file-registry-contract.js";

/** 文件注册仓库接口 */
export interface IFileRegistryRepository {
  /** 根据 ID 查找 */
  findById(id: string): Promise<FileRegistryRecord | null>;

  /** 根据存储路径查找 */
  findByStorageKey(storageKey: string): Promise<FileRegistryRecord | null>;

  /** 根据 SHA256 查找 */
  findBySha256(sha256: string, driver: string): Promise<FileRegistryRecord | null>;

  /** 插入记录 */
  insert(record: FileRegistryRecord): Promise<void>;

  /** 更新记录 */
  update(record: FileRegistryRecord): Promise<void>;

  /** Upsert（按 SHA256 + driver 唯一约束） */
  upsert(record: FileRegistryRecord): Promise<FileRegistryRecord>;

  /** 增加引用计数 */
  incrementRefCount(id: string): Promise<void>;

  /** 减少引用计数 */
  decrementRefCount(id: string): Promise<number>;

  /** 查询零引用文件 */
  findZeroRefFiles(options: {
    olderThanDays?: number;
    businessDomain?: string;
    limit?: number;
  }): Promise<FileRegistryRecord[]>;

  /** 分页查询 */
  findByFilters(filters: FileRegistryFilters): Promise<{ items: FileRegistryRecord[]; total: number }>;

  /** 删除记录 */
  delete(id: string): Promise<void>;

  /** 获取存储统计 */
  getStorageStats(): Promise<FileStorageStats>;

  /** 按 ID 批量查询 */
  findByIds(ids: string[]): Promise<FileRegistryRecord[]>;
}
```

- [ ] **步骤 2：验证 TypeScript 编译**

运行：`npm run build`
预期：编译成功

- [ ] **步骤 3：Commit**

```bash
git add src/contracts/repository-ports/file-registry-repository.ts
git commit -m "feat: add file registry repository interface"
```

---

### 任务 3：实现 PostgreSQL 仓库

**文件：**
- 创建：`src/repositories/pg/file-registry-pg-repository.ts`
- 修改：`src/repositories/pg/index.ts`

- [ ] **步骤 1：创建仓库实现文件**

```typescript
/**
 * 文件注册 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import type {
  FileRegistryRecord,
  FileRegistryFilters,
  FileStorageStats,
  FileType,
} from "../../contracts/file-registry-contract.js";
import type { IFileRegistryRepository } from "../../contracts/repository-ports/file-registry-repository.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

export class PgFileRegistryRepository
  extends PgBaseRepository<FileRegistryRecord>
  implements IFileRegistryRepository {

  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("file_registry"), client);
  }

  protected mapRow(row: Record<string, unknown>): FileRegistryRecord {
    return {
      id: row.id as string,
      uploaderId: row.uploader_id as string,
      uploaderType: row.uploader_type as FileRegistryRecord["uploaderType"],
      storageKey: row.storage_key as string,
      storageDriver: row.storage_driver as FileRegistryRecord["storageDriver"],
      publicUrl: row.public_url as string,
      contentSha256: row.content_sha256 as string,
      fileType: row.file_type as FileType,
      contentType: row.content_type as string,
      fileSizeBytes: row.file_size_bytes as number,
      fileName: row.file_name as string,
      businessDomain: row.business_domain as string,
      businessSubdomain: row.business_subdomain as string,
      businessTags: (row.business_tags as Record<string, string>) ?? {},
      refCount: row.ref_count as number,
      firstRefEntity: row.first_ref_entity as string,
      firstRefEntityId: row.first_ref_entity_id as string,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  protected mapEntity(entity: FileRegistryRecord): Record<string, unknown> {
    return {
      id: entity.id,
      uploader_id: entity.uploaderId,
      uploader_type: entity.uploaderType,
      storage_key: entity.storageKey,
      storage_driver: entity.storageDriver,
      public_url: entity.publicUrl,
      content_sha256: entity.contentSha256,
      file_type: entity.fileType,
      content_type: entity.contentType,
      file_size_bytes: entity.fileSizeBytes,
      file_name: entity.fileName,
      business_domain: entity.businessDomain,
      business_subdomain: entity.businessSubdomain,
      business_tags: entity.businessTags,
      ref_count: entity.refCount,
      first_ref_entity: entity.firstRefEntity,
      first_ref_entity_id: entity.firstRefEntityId,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
    };
  }

  async findByStorageKey(storageKey: string): Promise<FileRegistryRecord | null> {
    return this.findOneWhere({ storage_key: storageKey });
  }

  async findBySha256(sha256: string, driver: string): Promise<FileRegistryRecord | null> {
    return this.findOneWhere({ content_sha256: sha256, storage_driver: driver });
  }

  async insert(record: FileRegistryRecord): Promise<void> {
    const data = this.mapEntity(record);
    const keys = Object.keys(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const values = Object.values(data);

    await this.queryClient.query(
      `INSERT INTO ${this.tableName} (${keys.join(", ")}) VALUES (${placeholders})`,
      values
    );
  }

  async update(record: FileRegistryRecord): Promise<void> {
    const data = this.mapEntity(record);
    const keys = Object.keys(data).filter((k) => k !== "id");
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    const values = [...keys.map((k) => data[k]), record.id];

    await this.queryClient.query(
      `UPDATE ${this.tableName} SET ${setClause} WHERE id = $${keys.length + 1}`,
      values
    );
  }

  async upsert(record: FileRegistryRecord): Promise<FileRegistryRecord> {
    const data = this.mapEntity(record);
    const keys = Object.keys(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const updates = keys
      .filter((k) => k !== "content_sha256" && k !== "storage_driver")
      .map((k) => `${k} = EXCLUDED.${k}`)
      .join(", ");
    const values = Object.values(data);

    const result = await this.queryClient.query(
      `INSERT INTO ${this.tableName} (${keys.join(", ")})
       VALUES (${placeholders})
       ON CONFLICT (content_sha256, storage_driver) DO UPDATE SET ${updates}
       RETURNING *`,
      values
    );

    return this.mapRow(result.rows[0]);
  }

  async incrementRefCount(id: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET ref_count = ref_count + 1, updated_at = $1 WHERE id = $2`,
      [Date.now(), id]
    );
  }

  async decrementRefCount(id: string): Promise<number> {
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName} SET ref_count = GREATEST(ref_count - 1, 0), updated_at = $1 WHERE id = $2 RETURNING ref_count`,
      [Date.now(), id]
    );
    return result.rows[0]?.ref_count ?? 0;
  }

  async findZeroRefFiles(options: {
    olderThanDays?: number;
    businessDomain?: string;
    limit?: number;
  }): Promise<FileRegistryRecord[]> {
    const conditions: string[] = ["ref_count = 0"];
    const values: (string | number)[] = [];
    let paramIndex = 1;

    if (options.olderThanDays) {
      const threshold = Date.now() - options.olderThanDays * 24 * 60 * 60 * 1000;
      conditions.push(`updated_at < $${paramIndex}`);
      values.push(threshold);
      paramIndex++;
    }

    if (options.businessDomain) {
      conditions.push(`business_domain = $${paramIndex}`);
      values.push(options.businessDomain);
      paramIndex++;
    }

    const limit = options.limit ?? 100;
    const query = `SELECT * FROM ${this.tableName} WHERE ${conditions.join(" AND ")} ORDER BY updated_at ASC LIMIT ${limit}`;

    const result = await this.queryClient.query(query, values);
    return result.rows.map((row) => this.mapRow(row));
  }

  async findByFilters(filters: FileRegistryFilters): Promise<{ items: FileRegistryRecord[]; total: number }> {
    const conditions: string[] = [];
    const values: (string | number)[] = [];
    let paramIndex = 1;

    if (filters.businessDomain) {
      conditions.push(`business_domain = $${paramIndex}`);
      values.push(filters.businessDomain);
      paramIndex++;
    }

    if (filters.businessSubdomain) {
      conditions.push(`business_subdomain = $${paramIndex}`);
      values.push(filters.businessSubdomain);
      paramIndex++;
    }

    if (filters.fileType) {
      conditions.push(`file_type = $${paramIndex}`);
      values.push(filters.fileType);
      paramIndex++;
    }

    if (filters.uploaderId) {
      conditions.push(`uploader_id = $${paramIndex}`);
      values.push(filters.uploaderId);
      paramIndex++;
    }

    if (filters.refCountZero !== undefined) {
      conditions.push(`ref_count = ${filters.refCountZero ? 0 : 1}`);
    }

    if (filters.createdAfter) {
      conditions.push(`created_at >= $${paramIndex}`);
      values.push(filters.createdAfter);
      paramIndex++;
    }

    if (filters.createdBefore) {
      conditions.push(`created_at <= $${paramIndex}`);
      values.push(filters.createdBefore);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const offset = (page - 1) * pageSize;

    const countResult = await this.queryClient.query(
      `SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, pageSize, offset]
    );

    return {
      items: result.rows.map((row) => this.mapRow(row)),
      total,
    };
  }

  async delete(id: string): Promise<void> {
    await this.queryClient.query(`DELETE FROM ${this.tableName} WHERE id = $1 AND ref_count = 0`, [id]);
  }

  async getStorageStats(): Promise<FileStorageStats> {
    const result = await this.queryClient.query(`
      SELECT
        COUNT(*) as total_files,
        COALESCE(SUM(file_size_bytes), 0) as total_size_bytes,
        COUNT(*) FILTER (WHERE ref_count = 0) as zero_ref_files,
        COALESCE(SUM(file_size_bytes) FILTER (WHERE ref_count = 0), 0) as zero_ref_size_bytes
      FROM ${this.tableName}
    `);

    const byDomainResult = await this.queryClient.query(`
      SELECT business_domain, COUNT(*) as count, COALESCE(SUM(file_size_bytes), 0) as size_bytes
      FROM ${this.tableName}
      GROUP BY business_domain
    `);

    const byFileTypeResult = await this.queryClient.query(`
      SELECT file_type, COUNT(*) as count, COALESCE(SUM(file_size_bytes), 0) as size_bytes
      FROM ${this.tableName}
      GROUP BY file_type
    `);

    const byDomain: Record<string, { count: number; sizeBytes: number }> = {};
    for (const row of byDomainResult.rows) {
      byDomain[row.business_domain] = {
        count: parseInt(row.count, 10),
        sizeBytes: parseInt(row.size_bytes, 10),
      };
    }

    const byFileType: Record<FileType, { count: number; sizeBytes: number }> = {
      image: { count: 0, sizeBytes: 0 },
      video: { count: 0, sizeBytes: 0 },
      audio: { count: 0, sizeBytes: 0 },
      document: { count: 0, sizeBytes: 0 },
    };
    for (const row of byFileTypeResult.rows) {
      byFileType[row.file_type as FileType] = {
        count: parseInt(row.count, 10),
        sizeBytes: parseInt(row.size_bytes, 10),
      };
    }

    return {
      totalFiles: parseInt(result.rows[0].total_files, 10),
      totalSizeBytes: parseInt(result.rows[0].total_size_bytes, 10),
      byDomain,
      byFileType,
      zeroRefFiles: parseInt(result.rows[0].zero_ref_files, 10),
      zeroRefSizeBytes: parseInt(result.rows[0].zero_ref_size_bytes, 10),
    };
  }

  async findByIds(ids: string[]): Promise<FileRegistryRecord[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE id IN (${placeholders})`,
      ids
    );
    return result.rows.map((row) => this.mapRow(row));
  }
}
```

- [ ] **步骤 2：修改仓库索引文件**

在 `src/repositories/pg/index.ts` 中添加：

```typescript
// 在文件顶部导入区域添加
import { PgFileRegistryRepository } from "./file-registry-pg-repository.js";

// 在 PgRepositoryCollection 接口中添加
export interface PgRepositoryCollection {
  // ... 现有属性
  fileRegistry: PgFileRegistryRepository;
  // ...
}

// 在 createPgRepositories 函数中添加
export function createPgRepositories(pool: Pool): PgRepositoryCollection {
  const repos = {
    // ... 现有仓库
    fileRegistry: new PgFileRegistryRepository(pool),
    // ...
  };
  // ...
}
```

- [ ] **步骤 3：验证 TypeScript 编译**

运行：`npm run build`
预期：编译成功

- [ ] **步骤 4：Commit**

```bash
git add src/repositories/pg/file-registry-pg-repository.ts src/repositories/pg/index.ts
git commit -m "feat: implement file registry pg repository"
```

---

### 任务 4：实现文件类型检测工具

**文件：**
- 创建：`src/services/file/file-type-detector.ts`

- [ ] **步骤 1：创建文件类型检测工具**

```typescript
/**
 * 文件类型检测工具
 * 根据 MIME 类型或文件扩展名判断文件类型
 */

import type { FileType } from "../../contracts/file-registry-contract.js";

/** MIME 类型到文件类型的映射 */
const MIME_TYPE_MAP: Record<string, FileType> = {
  // 图片
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/png": "image",
  "image/gif": "image",
  "image/webp": "image",
  "image/svg+xml": "image",
  "image/bmp": "image",

  // 视频
  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",
  "video/x-m4v": "video",

  // 音频
  "audio/mpeg": "audio",
  "audio/mp3": "audio",
  "audio/wav": "audio",
  "audio/ogg": "audio",
  "audio/aac": "audio",

  // 文档
  "application/pdf": "document",
  "application/msword": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "text/plain": "document",
  "text/csv": "document",
};

/** 扩展名到文件类型的映射 */
const EXTENSION_MAP: Record<string, FileType> = {
  // 图片
  ".jpg": "image",
  ".jpeg": "image",
  ".png": "image",
  ".gif": "image",
  ".webp": "image",
  ".svg": "image",
  ".bmp": "image",

  // 视频
  ".mp4": "video",
  ".webm": "video",
  ".mov": "video",
  ".m4v": "video",

  // 音频
  ".mp3": "audio",
  ".wav": "audio",
  ".ogg": "audio",
  ".aac": "audio",

  // 文档
  ".pdf": "document",
  ".doc": "document",
  ".docx": "document",
  ".txt": "document",
  ".csv": "document",
};

/**
 * 根据 MIME 类型检测文件类型
 */
export function detectFileTypeByMimeType(mimeType: string | null | undefined): FileType {
  if (!mimeType) return "document";

  const normalized = mimeType.toLowerCase().split(";")[0].trim();
  return MIME_TYPE_MAP[normalized] ?? "document";
}

/**
 * 根据文件名扩展名检测文件类型
 */
export function detectFileTypeByFileName(fileName: string | null | undefined): FileType {
  if (!fileName) return "document";

  const ext = fileName.toLowerCase().split(".").pop();
  if (!ext) return "document";

  return EXTENSION_MAP[`.${ext}`] ?? "document";
}

/**
 * 综合检测文件类型
 * 优先使用 MIME 类型，其次使用文件名
 */
export function detectFileType(
  mimeType: string | null | undefined,
  fileName: string | null | undefined
): FileType {
  const typeByMime = detectFileTypeByMimeType(mimeType);
  if (typeByMime !== "document") {
    return typeByMime;
  }

  return detectFileTypeByFileName(fileName);
}

/**
 * 根据文件类型推断 MIME 类型
 */
export function inferMimeType(fileType: FileType, fileName?: string): string {
  if (fileName) {
    const ext = fileName.toLowerCase().split(".").pop();
    for (const [mime, type] of Object.entries(MIME_TYPE_MAP)) {
      if (type === fileType && mime.includes(ext ?? "")) {
        return mime;
      }
    }
  }

  // 默认 MIME 类型
  const defaults: Record<FileType, string> = {
    image: "image/jpeg",
    video: "video/mp4",
    audio: "audio/mpeg",
    document: "application/octet-stream",
  };

  return defaults[fileType];
}
```

- [ ] **步骤 2：验证 TypeScript 编译**

运行：`npm run build`
预期：编译成功

- [ ] **步骤 3：Commit**

```bash
git add src/services/file/file-type-detector.ts
git commit -m "feat: add file type detector utility"
```

---

### 任务 5：实现 FileService 核心服务

**文件：**
- 创建：`src/services/file/file-service.ts`

- [ ] **步骤 1：创建 FileService 实现**

```typescript
/**
 * 文件服务
 * 统一管理文件上传、去重、引用追踪
 */

import { createHash } from "node:crypto";
import type { IObjectStorageAdapter } from "../../contracts/object-storage.js";
import type {
  FileRegistryRecord,
  FileUploadOptions,
  ReferenceEntity,
  FileType,
  FileUploaderType,
} from "../../contracts/file-registry-contract.js";
import type { IFileRegistryRepository } from "../../contracts/repository-ports/file-registry-repository.js";
import type { IRepositoryClock } from "../../contracts/repository-ports/common.js";
import { detectFileType, inferMimeType } from "./file-type-detector.js";

export interface FileServiceDeps {
  repos: { fileRegistry: IFileRegistryRepository };
  clock: IRepositoryClock;
  storage: IObjectStorageAdapter | null;
  defaultStorageDriver: "alioss" | "local";
}

export class FileService {
  constructor(private readonly deps: FileServiceDeps) {}

  /**
   * 上传文件（自动去重）
   * - 检查 SHA256 是否已存在
   * - 已存在：返回已有记录，增加引用计数
   * - 不存在：上传到存储，创建注册记录
   */
  async upload(
    uploaderId: string,
    content: Uint8Array,
    options: FileUploadOptions
  ): Promise<FileRegistryRecord> {
    const { repos, clock, storage, defaultStorageDriver } = this.deps;

    if (!storage) {
      throw new Error("Storage not configured");
    }

    // 1. 计算 SHA256
    const sha256 = createHash("sha256").update(content).digest("hex");

    // 2. 确定存储驱动
    const storageDriver = options.storageDriver ?? defaultStorageDriver;

    // 3. 检查是否已存在
    const existing = await repos.fileRegistry.findBySha256(sha256, storageDriver);
    if (existing) {
      // 已存在，增加引用计数
      await repos.fileRegistry.incrementRefCount(existing.id);

      // 如果有首次引用实体，更新 business_tags
      if (options.firstRefEntity) {
        const updatedTags = {
          ...existing.businessTags,
          [options.firstRefEntity.entityType]: options.firstRefEntity.entityId,
        };
        existing.businessTags = updatedTags;
        await repos.fileRegistry.update(existing);
      }

      return existing;
    }

    // 4. 不存在，上传到存储
    const contentType = options.contentType ?? inferMimeType(
      detectFileType(options.contentType ?? null, options.fileName ?? null),
      options.fileName
    );
    const fileType: FileType = detectFileType(contentType, options.fileName ?? null);
    const fileName = options.fileName ?? `file_${Date.now()}`;

    // 生成存储路径
    const storageKey = this.generateStorageKey(sha256, fileName, fileType);

    // 上传到对象存储
    await storage.putObject(storageKey, content, contentType);

    // 获取公开 URL
    const publicUrl = await storage.getSignedUrl(storageKey);

    // 5. 创建注册记录
    const now = clock.now();
    const uploaderType: FileUploaderType = "user";

    const record: FileRegistryRecord = {
      id: clock.generateId(),
      uploaderId,
      uploaderType,
      storageKey,
      storageDriver,
      publicUrl,
      contentSha256: sha256,
      fileType,
      contentType,
      fileSizeBytes: content.length,
      fileName,
      businessDomain: options.businessDomain,
      businessSubdomain: options.businessSubdomain ?? "",
      businessTags: options.businessTags ?? {},
      refCount: 1,
      firstRefEntity: options.firstRefEntity?.entityType ?? "",
      firstRefEntityId: options.firstRefEntity?.entityId ?? "",
      createdAt: now,
      updatedAt: now,
    };

    // 插入数据库（使用 upsert 处理并发情况）
    const saved = await repos.fileRegistry.upsert(record);

    return saved;
  }

  /**
   * 注册引用关系
   */
  async registerReference(fileId: string, refEntity: ReferenceEntity): Promise<void> {
    const { repos, clock } = this.deps;

    const record = await repos.fileRegistry.findById(fileId);
    if (!record) {
      throw new Error(`File not found: ${fileId}`);
    }

    // 增加引用计数
    await repos.fileRegistry.incrementRefCount(fileId);

    // 更新 business_tags
    const updatedTags = {
      ...record.businessTags,
      [refEntity.entityType]: refEntity.entityId,
    };

    await repos.fileRegistry.update({
      ...record,
      businessTags: updatedTags,
      updatedAt: clock.now(),
    });
  }

  /**
   * 释放引用关系
   */
  async releaseReference(fileId: string, refEntity: ReferenceEntity): Promise<void> {
    const { repos, clock } = this.deps;

    const record = await repos.fileRegistry.findById(fileId);
    if (!record) {
      return; // 文件不存在，忽略
    }

    // 减少引用计数
    const newCount = await repos.fileRegistry.decrementRefCount(fileId);

    // 从 business_tags 中移除关联
    const updatedTags = { ...record.businessTags };
    delete updatedTags[refEntity.entityType];

    await repos.fileRegistry.update({
      ...record,
      businessTags: updatedTags,
      updatedAt: clock.now(),
    });
  }

  /**
   * 按存储路径查找
   */
  async findByStorageKey(storageKey: string): Promise<FileRegistryRecord | null> {
    return this.deps.repos.fileRegistry.findByStorageKey(storageKey);
  }

  /**
   * 按 SHA256 查找
   */
  async findBySha256(sha256: string, driver?: string): Promise<FileRegistryRecord | null> {
    return this.deps.repos.fileRegistry.findBySha256(
      sha256,
      driver ?? this.deps.defaultStorageDriver
    );
  }

  /**
   * 查询零引用文件
   */
  async findZeroRefFiles(options: {
    olderThanDays?: number;
    businessDomain?: string;
    limit?: number;
  }): Promise<FileRegistryRecord[]> {
    return this.deps.repos.fileRegistry.findZeroRefFiles(options);
  }

  /**
   * 删除文件（仅零引用文件可删除）
   */
  async deleteFile(fileId: string): Promise<void> {
    const { repos, storage } = this.deps;

    const record = await repos.fileRegistry.findById(fileId);
    if (!record) {
      return;
    }

    if (record.refCount > 0) {
      throw new Error(`Cannot delete file with ref_count > 0: ${fileId}`);
    }

    // 从对象存储删除
    if (storage) {
      try {
        await storage.deleteObject(record.storageKey);
      } catch (error) {
        console.error(`Failed to delete object from storage: ${record.storageKey}`, error);
      }
    }

    // 从数据库删除
    await repos.fileRegistry.delete(fileId);
  }

  /**
   * 生成存储路径
   */
  private generateStorageKey(sha256: string, fileName: string, fileType: FileType): string {
    const ext = fileName.split(".").pop() ?? "";
    const prefix = this.getStoragePrefix(fileType);
    return `${prefix}/${sha256.slice(0, 2)}/${sha256}.${ext}`;
  }

  /**
   * 获取存储路径前缀
   */
  private getStoragePrefix(fileType: FileType): string {
    const prefixes: Record<FileType, string> = {
      image: "media/images",
      video: "media/videos",
      audio: "media/audios",
      document: "media/documents",
    };
    return prefixes[fileType];
  }
}
```

- [ ] **步骤 2：验证 TypeScript 编译**

运行：`npm run build`
预期：编译成功

- [ ] **步骤 3：Commit**

```bash
git add src/services/file/file-service.ts
git commit -m "feat: implement FileService core service"
```

---

### 任务 6：集成 FileService 到 AppContext

**文件：**
- 修改：`src/core/app-context.ts`
- 修改：`src/app-setup/app-services.ts`

- [ ] **步骤 1：修改 AppContext 接口**

在 `src/core/app-context.ts` 中添加 fileService 属性：

```typescript
// 在导入区域添加
import type { FileService } from "../services/file/file-service.js";

// 在 AppContext 接口中添加
export interface AppContext {
  // ... 现有属性
  fileService: FileService;
  // ...
}
```

- [ ] **步骤 2：在 app-services.ts 中初始化 FileService**

在 `src/app-setup/app-services.ts` 中添加 FileService 初始化：

```typescript
// 在导入区域添加
import { FileService } from "../services/file/file-service.js";

// 在 setupAppServices 或相应的初始化函数中添加
// （具体位置取决于现有初始化流程）

const fileService = new FileService({
  repos: { fileRegistry: repos.fileRegistry },
  clock,
  storage,
  defaultStorageDriver: storage?.driver === "alioss" ? "alioss" : "local",
});
```

- [ ] **步骤 3：验证 TypeScript 编译**

运行：`npm run build`
预期：编译成功

- [ ] **步骤 4：Commit**

```bash
git add src/core/app-context.ts src/app-setup/app-services.ts
git commit -m "feat: integrate FileService into AppContext"
```

---

### 任务 7：创建数据库表

**文件：**
- 无需创建文件，直接执行 SQL

- [ ] **步骤 1：创建数据库表**

使用数据库客户端执行以下 SQL：

```sql
-- 文件注册表：统一管理所有文件元数据
CREATE TABLE IF NOT EXISTS nrm_file_registry (
  id VARCHAR(32) PRIMARY KEY,

  -- 上传者信息
  uploader_id VARCHAR(32) NOT NULL,
  uploader_type VARCHAR(16) DEFAULT 'user',

  -- 存储信息
  storage_key VARCHAR(512) NOT NULL,
  storage_driver VARCHAR(16) NOT NULL,
  public_url VARCHAR(1024),

  -- 内容指纹
  content_sha256 CHAR(64) NOT NULL,

  -- 文件属性
  file_type VARCHAR(16) NOT NULL,
  content_type VARCHAR(128),
  file_size_bytes BIGINT,
  file_name VARCHAR(256),

  -- 业务标签
  business_domain VARCHAR(32),
  business_subdomain VARCHAR(32),
  business_tags JSONB DEFAULT '{}',

  -- 引用追踪
  ref_count INT DEFAULT 1,
  first_ref_entity VARCHAR(64),
  first_ref_entity_id VARCHAR(32),

  -- 时间戳
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,

  -- 约束和索引
  CONSTRAINT uq_file_registry_sha256_driver UNIQUE (content_sha256, storage_driver)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_file_registry_storage_key ON nrm_file_registry(storage_key);
CREATE INDEX IF NOT EXISTS idx_file_registry_uploader_id ON nrm_file_registry(uploader_id);
CREATE INDEX IF NOT EXISTS idx_file_registry_business_domain ON nrm_file_registry(business_domain, business_subdomain);
CREATE INDEX IF NOT EXISTS idx_file_registry_ref_count ON nrm_file_registry(ref_count, updated_at);

-- 添加表注释
COMMENT ON TABLE nrm_file_registry IS '文件注册中心：统一管理所有上传文件的元数据、去重和引用追踪';
COMMENT ON COLUMN nrm_file_registry.content_sha256 IS '内容 SHA256 哈希，用于去重判断';
COMMENT ON COLUMN nrm_file_registry.business_domain IS '业务域：project/library/square/hot_trend/fission 等';
COMMENT ON COLUMN nrm_file_registry.business_tags IS '扩展业务标签 JSONB，存储关联实体 ID';
COMMENT ON COLUMN nrm_file_registry.ref_count IS '引用计数，零引用文件可安全删除';
```

- [ ] **步骤 2：验证表创建成功**

使用数据库客户端查询：

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'nrm_file_registry'
ORDER BY ordinal_position;
```

预期：返回所有列定义

- [ ] **步骤 3：验证索引创建成功**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'nrm_file_registry';
```

预期：返回所有索引定义

---

### 任务 8：创建后台管理路由

**文件：**
- 创建：`src/routes/admin-file-registry-routes.ts`

- [ ] **步骤 1：创建后台管理路由文件**

```typescript
/**
 * 文件注册管理后台路由
 * 仅管理员可访问
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { FileRegistryFilters } from "../contracts/file-registry-contract.js";
import { requireAdmin } from "../services/auth/route-guards.js";

/** 注册文件注册管理路由 */
export async function registerAdminFileRegistryRoutes(
  app: FastifyInstance,
  ctx: AppContext
): Promise<void> {
  const { repos, fileService } = ctx;

  // 查询文件列表（分页）
  app.get("/admin/files", async (request: FastifyRequest<{ Querystring: FileRegistryFilters }>, reply) => {
    await requireAdmin(ctx, request);
    const filters = request.query;
    const result = await repos.fileRegistry.findByFilters(filters);

    reply.send({
      items: result.items,
      total: result.total,
      page: filters.page ?? 1,
      pageSize: filters.pageSize ?? 50,
    });
  });

  // 获取文件详情
  app.get("/admin/files/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    await requireAdmin(ctx, request);
    const { id } = request.params;
    const record = await repos.fileRegistry.findById(id);

    if (!record) {
      reply.code(404).send({ error: "File not found" });
      return;
    }

    reply.send(record);
  });

  // 获取存储统计
  app.get("/admin/files/stats", async (request, reply) => {
    await requireAdmin(ctx, request);
    const stats = await repos.fileRegistry.getStorageStats();
    reply.send(stats);
  });

  // 删除零引用文件
  app.delete("/admin/files/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    await requireAdmin(ctx, request);
    const { id } = request.params;

    try {
      await fileService.deleteFile(id);
      reply.send({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      reply.code(400).send({ error: message });
    }
  });

  // 查询零引用文件列表
  app.get("/admin/files/zero-ref", async (request: FastifyRequest<{ Querystring: { olderThanDays?: number; businessDomain?: string; limit?: number } }>, reply) => {
    await requireAdmin(ctx, request);
    const { olderThanDays, businessDomain, limit } = request.query;

    const files = await fileService.findZeroRefFiles({
      olderThanDays,
      businessDomain,
      limit,
    });

    reply.send({ items: files });
  });

  // 获取清理状态
  app.get("/admin/files/cleanup/status", async (request, reply) => {
    await requireAdmin(ctx, request);

    const status = {
      enabled: process.env.FILE_CLEANUP_ENABLED === "true",
      lastRunAt: null,
      nextRunAt: null,
      retentionDays: parseInt(process.env.FILE_CLEANUP_THRESHOLD_DAYS ?? "30", 10),
      totalCleaned: 0,
    };

    reply.send(status);
  });
}
```

- [ ] **步骤 2：注册路由到应用**

在 `src/routes/index.ts` 或相应的路由注册位置添加：

```typescript
import { registerAdminFileRegistryRoutes } from "./admin-file-registry-routes.js";

// 在路由注册函数中添加
await registerAdminFileRegistryRoutes(app, ctx);
```

- [ ] **步骤 3：验证 TypeScript 编译**

运行：`npm run build`
预期：编译成功

- [ ] **步骤 4：Commit**

```bash
git add src/routes/admin-file-registry-routes.ts src/routes/index.ts
git commit -m "feat: add admin file registry routes"
```

---

### 任务 9：创建前端 API 封装

**文件：**
- 创建：`apps/web/services/realApi/fileRegistry.ts`

- [ ] **步骤 1：创建前端 API 封装**

```typescript
/**
 * 文件注册管理 API 封装
 */

import { request } from "../backendApi.request";
import type { FileRegistryFilters, FileRegistryRecord, FileStorageStats } from "../../../src/contracts/file-registry-contract";

interface FileListResponse {
  items: FileRegistryRecord[];
  total: number;
  page: number;
  pageSize: number;
}

interface ZeroRefFilesResponse {
  items: FileRegistryRecord[];
}

interface CleanupStatus {
  enabled: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  retentionDays: number;
  totalCleaned: number;
}

/** 获取文件列表 */
export async function getFileList(token: string, filters?: FileRegistryFilters): Promise<FileListResponse> {
  const params = new URLSearchParams();
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.pageSize) params.set("pageSize", String(filters.pageSize));
  if (filters?.businessDomain) params.set("businessDomain", filters.businessDomain);
  if (filters?.businessSubdomain) params.set("businessSubdomain", filters.businessSubdomain);
  if (filters?.fileType) params.set("fileType", filters.fileType);
  if (filters?.uploaderId) params.set("uploaderId", filters.uploaderId);

  const query = params.toString();
  const url = query ? `/admin/files?${query}` : "/admin/files";

  return request(token, "GET", url);
}

/** 获取文件详情 */
export async function getFileDetail(token: string, fileId: string): Promise<FileRegistryRecord> {
  return request(token, "GET", `/admin/files/${fileId}`);
}

/** 获取存储统计 */
export async function getStorageStats(token: string): Promise<FileStorageStats> {
  return request(token, "GET", "/admin/files/stats");
}

/** 删除零引用文件 */
export async function deleteFile(token: string, fileId: string): Promise<{ success: boolean }> {
  return request(token, "DELETE", `/admin/files/${fileId}`);
}

/** 获取零引用文件列表 */
export async function getZeroRefFiles(
  token: string,
  options?: { olderThanDays?: number; businessDomain?: string; limit?: number }
): Promise<ZeroRefFilesResponse> {
  const params = new URLSearchParams();
  if (options?.olderThanDays) params.set("olderThanDays", String(options.olderThanDays));
  if (options?.businessDomain) params.set("businessDomain", options.businessDomain);
  if (options?.limit) params.set("limit", String(options.limit));

  const query = params.toString();
  const url = query ? `/admin/files/zero-ref?${query}` : "/admin/files/zero-ref";

  return request(token, "GET", url);
}

/** 获取清理状态 */
export async function getCleanupStatus(token: string): Promise<CleanupStatus> {
  return request(token, "GET", "/admin/files/cleanup/status");
}
```

- [ ] **步骤 2：验证 TypeScript 编译**

运行：`npm run build:ui`
预期：编译成功

- [ ] **步骤 3：Commit**

```bash
git add apps/web/services/realApi/fileRegistry.ts
git commit -m "feat: add frontend file registry API wrapper"
```

---

### 任务 10：创建后台管理页面

**文件：**
- 创建：`apps/web/pages/admin/FileRegistryManagement.tsx`

- [ ] **步骤 1：创建后台管理页面组件**

```typescript
/**
 * 文件注册管理页面
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layout } from '../../components/Layout';
import { Button } from '../../components/ui/Button';
import { useAppStore } from '../../store/useAppStore';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import {
  getFileList,
  getStorageStats,
  deleteFile,
  getZeroRefFiles,
  getCleanupStatus,
} from '../../services/realApi/fileRegistry';
import type { FileRegistryRecord, FileStorageStats, FileType, FileBusinessDomain } from '../../../src/contracts/file-registry-contract';

/** 文件类型图标 */
const FILE_TYPE_ICONS: Record<FileType, string> = {
  image: '📷',
  video: '🎬',
  audio: '🎵',
  document: '📄',
};

/** 格式化文件大小 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** 格式化时间 */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN');
}

export function FileRegistryManagement(): JSX.Element {
  const token = useAppStore((s) => s.token);
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  // 筛选状态
  const [filters, setFilters] = useState<{
    page: number;
    pageSize: number;
    businessDomain?: string;
    fileType?: string;
  }>({
    page: 1,
    pageSize: 50,
  });

  // 查询文件列表
  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['adminFiles', filters],
    queryFn: () => getFileList(token!, filters),
    enabled: !!token,
  });

  // 查询存储统计
  const { data: stats } = useQuery({
    queryKey: ['adminFileStats'],
    queryFn: () => getStorageStats(token!),
    enabled: !!token,
  });

  // 查询清理状态
  const { data: cleanupStatus } = useQuery({
    queryKey: ['adminFileCleanupStatus'],
    queryFn: () => getCleanupStatus(token!),
    enabled: !!token,
  });

  // 删除文件
  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => deleteFile(token!, fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminFiles'] });
      queryClient.invalidateQueries({ queryKey: ['adminFileStats'] });
    },
  });

  // 处理删除
  const handleDelete = async (file: FileRegistryRecord) => {
    if (file.refCount > 0) {
      alert('无法删除：该文件仍有引用');
      return;
    }

    const confirmed = await confirm({
      title: '确认删除',
      message: `确定要删除文件 "${file.fileName}" 吗？此操作不可恢复。`,
    });

    if (confirmed) {
      await deleteMutation.mutateAsync(file.id);
    }
  };

  // 业务域选项
  const domainOptions: FileBusinessDomain[] = ['project', 'library', 'square', 'hot_trend', 'fission'];
  const fileTypeOptions: FileType[] = ['image', 'video', 'audio', 'document'];

  return (
    <Layout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">文件管理中心</h1>
          <div className="text-sm text-gray-500">
            清理任务: {cleanupStatus?.enabled ? '已启用' : '已禁用'}
            {cleanupStatus?.enabled && ` (保留 ${cleanupStatus.retentionDays} 天)`}
          </div>
        </div>

        {/* 存储统计卡片 */}
        {stats && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-gray-500 text-sm">总文件数</div>
              <div className="text-2xl font-bold">{stats.totalFiles.toLocaleString()}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-gray-500 text-sm">总大小</div>
              <div className="text-2xl font-bold">{formatFileSize(stats.totalSizeBytes)}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-gray-500 text-sm">零引用文件</div>
              <div className="text-2xl font-bold text-orange-500">{stats.zeroRefFiles}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-gray-500 text-sm">可清理空间</div>
              <div className="text-2xl font-bold text-orange-500">{formatFileSize(stats.zeroRefSizeBytes)}</div>
            </div>
          </div>
        )}

        {/* 筛选栏 */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center gap-4">
            <select
              className="border rounded px-3 py-2"
              value={filters.businessDomain ?? ''}
              onChange={(e) => setFilters({ ...filters, page: 1, businessDomain: e.target.value || undefined })}
            >
              <option value="">全部业务域</option>
              {domainOptions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select
              className="border rounded px-3 py-2"
              value={filters.fileType ?? ''}
              onChange={(e) => setFilters({ ...filters, page: 1, fileType: e.target.value || undefined })}
            >
              <option value="">全部类型</option>
              {fileTypeOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <Button
              variant="outline"
              onClick={() => setFilters({ page: 1, pageSize: 50 })}
            >
              重置
            </Button>
          </div>
        </div>

        {/* 文件列表 */}
        <div className="bg-white rounded-lg shadow">
          {listLoading ? (
            <div className="p-8 text-center text-gray-500">加载中...</div>
          ) : (
            <>
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">文件</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">业务域</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">大小</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">引用</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">上传时间</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {listData?.items.map((file) => (
                    <tr key={file.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span>{FILE_TYPE_ICONS[file.fileType]}</span>
                          <span className="font-medium truncate max-w-xs">{file.fileName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {file.businessDomain}
                        {file.businessSubdomain && ` / ${file.businessSubdomain}`}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatFileSize(file.fileSizeBytes)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-medium ${file.refCount === 0 ? 'text-orange-500' : 'text-gray-700'}`}>
                          {file.refCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatTime(file.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(file.publicUrl, '_blank')}
                        >
                          查看
                        </Button>
                        {file.refCount === 0 && (
                          <Button
                            variant="danger"
                            size="sm"
                            className="ml-2"
                            onClick={() => handleDelete(file)}
                            loading={deleteMutation.isPending}
                          >
                            删除
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* 分页 */}
              {listData && listData.total > filters.pageSize && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <div className="text-sm text-gray-500">
                    共 {listData.total} 条记录
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={filters.page <= 1}
                      onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                    >
                      上一页
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={filters.page * filters.pageSize >= listData.total}
                      onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default FileRegistryManagement;
```

- [ ] **步骤 2：添加路由配置**

在 `apps/web/App.tsx` 或相应的路由配置中添加路由：

```typescript
import FileRegistryManagement from './pages/admin/FileRegistryManagement';

// 在路由配置中添加
<Route path="/admin/files" element={<FileRegistryManagement />} />
```

- [ ] **步骤 3：验证前端编译**

运行：`npm run build:ui`
预期：编译成功

- [ ] **步骤 4：Commit**

```bash
git add apps/web/pages/admin/FileRegistryManagement.tsx apps/web/App.tsx
git commit -m "feat: add file registry management admin page"
```

---

### 任务 11：集成测试与验证

- [ ] **步骤 1：启动开发服务器**

```bash
PERSISTENCE_REQUIRE_READY=false npm run dev
```

- [ ] **步骤 2：验证后台接口**

使用 curl 或 Postman 测试：

```bash
# 获取存储统计（需要管理员 token）
curl -H "Authorization: Bearer <token>" http://localhost:3020/admin/files/stats

# 获取文件列表
curl -H "Authorization: Bearer <token>" http://localhost:3020/admin/files
```

预期：返回正确的 JSON 响应

- [ ] **步骤 3：验证前端页面**

1. 启动前端：`npm --prefix apps/web run dev`
2. 访问 `http://localhost:3000/admin/files`
3. 验证页面正常显示

- [ ] **步骤 4：验证上传去重**

通过 FileService 上传相同内容的文件，验证：
- 第一次上传：创建新记录
- 第二次上传：返回已有记录，ref_count 增加

---

## 验收清单

### 功能验收

- [ ] 文件上传自动注册到 `nrm_file_registry`
- [ ] SHA256 去重生效，相同内容返回已有 URL
- [ ] 引用计数正确增减
- [ ] 后台管理页面可查看文件列表和详情
- [ ] 存储统计按业务域正确汇总
- [ ] 仅管理员可访问后台管理接口
- [ ] 仅零引用文件可被删除
- [ ] 清理任务默认关闭

### 性能验收

- [ ] 上传去重查询响应时间 < 50ms
- [ ] 文件列表查询支持分页（默认 50 条）
- [ ] 后台统计接口响应时间 < 200ms

---

## 风险与应对

| 风险 | 影响 | 应对措施 |
|-----|------|---------|
| 迁移期间重复数据 | 短期内新旧数据并存 | 迁移完成后手动清理旧数据 |
| 引用计数不准 | 零引用误删或有用文件保留 | 定期扫描校验 + 审计日志 |
| 存储驱动切换 | 本地到 OSS 切换时数据迁移 | 提供迁移工具脚本 |