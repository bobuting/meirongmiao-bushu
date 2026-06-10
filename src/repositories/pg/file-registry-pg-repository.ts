/**
 * 文件注册 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import type {
  FileRegistryRecord,
  FileRegistryFilters,
  FileStorageStats,
  FileType,
  FileBusinessDomain,
  FileBusinessSubdomain,
  FileEnvironment,
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
      businessDomain: row.business_domain as FileBusinessDomain,
      businessSubdomain: row.business_subdomain as FileBusinessSubdomain,
      businessTags: PgBaseRepository.fromJsonb<Record<string, string>>(row.business_tags) ?? {},
      refCount: row.ref_count as number,
      firstRefEntity: row.first_ref_entity as string,
      firstRefEntityId: row.first_ref_entity_id as string,
      environment: (row.environment as FileEnvironment) ?? "production",
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
      business_tags: PgBaseRepository.toJsonb(entity.businessTags),
      ref_count: entity.refCount,
      first_ref_entity: entity.firstRefEntity,
      first_ref_entity_id: entity.firstRefEntityId,
      environment: entity.environment,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
    };
  }

  /** 根据存储路径查找 */
  async findByStorageKey(storageKey: string): Promise<FileRegistryRecord | null> {
    return this.findOneWhere({ storage_key: storageKey });
  }

  /** 根据 SHA256 查找 */
  async findBySha256(sha256: string, driver: string): Promise<FileRegistryRecord | null> {
    return this.findOneWhere({ content_sha256: sha256, storage_driver: driver });
  }

  /** 插入记录 */
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

  /** 更新记录 */
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

  /** Upsert（按 SHA256 + driver 唯一约束，返回记录） */
  async upsertReturning(record: FileRegistryRecord): Promise<FileRegistryRecord> {
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

  /** 增加引用计数 */
  async incrementRefCount(id: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.tableName} SET ref_count = ref_count + 1, updated_at = $1 WHERE id = $2`,
      [Date.now(), id]
    );
  }

  /** 减少引用计数 */
  async decrementRefCount(id: string): Promise<number> {
    const result = await this.queryClient.query(
      `UPDATE ${this.tableName} SET ref_count = GREATEST(ref_count - 1, 0), updated_at = $1 WHERE id = $2 RETURNING ref_count`,
      [Date.now(), id]
    );
    return result.rows[0]?.ref_count ?? 0;
  }

  /** 查询零引用文件 */
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

  /** 分页查询 */
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

  /** 删除零引用记录（仅允许删除零引用文件，返回是否删除成功） */
  async deleteIfUnreferenced(id: string): Promise<boolean> {
    const result = await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE id = $1 AND ref_count = 0`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** 获取存储统计 */
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

  /** 按 ID 批量查询 */
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