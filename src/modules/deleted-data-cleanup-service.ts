/**
 * 已删除数据清理服务
 * 定期清理超过保留期限的软删除数据
 */

import type { Pool } from "pg";
import { getLogger } from "../core/logger/index.js";
import { PgSoftDeletableRepository } from "../repositories/pg/soft-deletable-repository.js";
import type { PgRepositoryCollection } from "../repositories/pg/index.js";
import type { SoftDeletable } from "../contracts/types.js";
import { nrm } from "../repositories/pg/base-pg-repository.js";

const log = getLogger("deleted-data-cleanup-service");

/** 清理结果 */
export interface CleanupResult {
  /** 各表删除数量 */
  tables: Record<string, number>;
  /** 总删除数量 */
  totalDeleted: number;
  /** 执行时间戳 */
  lastRunAt: number;
}

/** 清理状态 */
export interface CleanupStatus {
  /** 上次执行时间 */
  lastRunAt: number | null;
  /** 下次执行时间 */
  nextRunAt: number;
  /** 保留天数 */
  retentionDays: number;
  /** 是否启用 */
  enabled: boolean;
}

/** 支持清理的软删除表名 */
export type SoftDeleteTableName =
  | "projects"
  | "assets"
  | "outfit_plans"
  | "library_characters"
  | "library_scripts"
  | "users"
  | "credits"
  | "providers"
  | "provider_secrets"
  | "provider_policies"
  | "video_musics";

/** 清理仓库接口（统一继承自 PgSoftDeletableRepository） */
interface CleanupRepo extends PgSoftDeletableRepository<SoftDeletableEntity> {}

/**
 * 已删除数据清理服务
 * 管理超过保留期限的软删除数据的物理清理
 */
export class DeletedDataCleanupService {
  /** 默认保留期限：60 天 */
  private readonly DEFAULT_RETENTION_DAYS = 60;

  /** 上次执行时间 */
  private lastRunAt: number | null = null;

  /** 是否启用自动清理 */
  private enabled = true;

  /** 支持清理的仓库列表 */
  private readonly cleanupRepos: Map<string, CleanupRepo>;

  constructor(
    private readonly pool: Pool,
    repos: PgRepositoryCollection,
  ) {
    // 从仓库集合中提取支持软删除的仓库
    this.cleanupRepos = this.buildCleanupRepos(repos);
  }

  /** 构建支持清理的仓库列表 */
  private buildCleanupRepos(repos: PgRepositoryCollection): Map<string, CleanupRepo> {
    const cleanupRepos = new Map<string, CleanupRepo>();

    // 继承了 PgSoftDeletableRepository 的仓库（直接使用）
    cleanupRepos.set("projects", repos.projects);
    // assets 仓库不再支持软删除（project_garment_assoc 表无软删除字段）
    cleanupRepos.set("outfit_plans", repos.outfitPlans);
    cleanupRepos.set("library_characters", repos.libraryCharacters);
    // library_scripts 已废弃，使用 script_data 替代
    // cleanupRepos.set("library_scripts", repos.libraryScripts);
    cleanupRepos.set("users", repos.users);
    cleanupRepos.set("providers", repos.providers);
    cleanupRepos.set("provider_policies", repos.providerPolicies);
    cleanupRepos.set("video_musics", repos.videoMusics);

    // 手动实现软删除的仓库（需要适配器）
    cleanupRepos.set("provider_secrets", new ProviderSecretCleanupAdapter(this.pool));
    cleanupRepos.set("credits", new CreditCleanupAdapter(this.pool));

    return cleanupRepos;
  }

  /** 获取支持清理的仓库列表（供路由处理器使用） */
  getCleanupRepos(): Map<string, CleanupRepo> {
    return this.cleanupRepos;
  }

  /** 获取清理任务状态 */
  getStatus(): CleanupStatus {
    const now = Date.now();
    const nextRunAt = this.calculateNextRunAt(now);

    return {
      lastRunAt: this.lastRunAt,
      nextRunAt,
      retentionDays: this.DEFAULT_RETENTION_DAYS,
      enabled: this.enabled,
    };
  }

  /** 计算下次执行时间（凌晨 3 点） */
  private calculateNextRunAt(now: number): number {
    const date = new Date(now);
    // 设置为今天凌晨 3 点
    const today3AM = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 3, 0, 0, 0).getTime();

    // 如果已经过了今天 3 点，则设置为明天 3 点
    if (now >= today3AM) {
      return today3AM + 24 * 60 * 60 * 1000;
    }
    return today3AM;
  }

  /** 启用/禁用定时清理 */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** 定时清理任务（由调度器调用） */
  async runScheduledCleanup(): Promise<CleanupResult | null> {
    if (!this.enabled) {
      return null;
    }

    return this.manualCleanupAll(this.DEFAULT_RETENTION_DAYS);
  }

  /** 手动清理指定表 */
  async manualCleanup(tableName: SoftDeleteTableName, retentionDays?: number): Promise<number> {
    const days = retentionDays ?? this.DEFAULT_RETENTION_DAYS;
    const threshold = Date.now() - days * 24 * 60 * 60 * 1000;

    const repo = this.cleanupRepos.get(tableName);
    if (!repo) {
      throw new Error(`不支持的清理表: ${tableName}`);
    }

    // 获取超过保留期限的已删除记录
    const deletedRecords = await repo.listDeleted(days);

    // 物理删除每条记录
    for (const record of deletedRecords) {
      if (record.id) {
        await repo.hardDelete(record.id);
      }
    }

    return deletedRecords.length;
  }

  /** 手动清理所有表 */
  async manualCleanupAll(retentionDays?: number): Promise<CleanupResult> {
    const days = retentionDays ?? this.DEFAULT_RETENTION_DAYS;
    const tables: Record<string, number> = {};
    let totalDeleted = 0;

    // 遍历所有支持清理的表
    for (const [tableName, repo] of this.cleanupRepos) {
      try {
        const deletedRecords = await repo.listDeleted(days);

        for (const record of deletedRecords) {
          if (record.id) {
            await repo.hardDelete(record.id);
          }
        }

        tables[tableName] = deletedRecords.length;
        totalDeleted += deletedRecords.length;
      } catch (error) {
        // 记录错误但继续清理其他表
        log.error({ error, tableName }, "清理表失败");
        tables[tableName] = 0;
      }
    }

    this.lastRunAt = Date.now();

    return {
      tables,
      totalDeleted,
      lastRunAt: this.lastRunAt,
    };
  }
}

/** 软删除实体类型 */
interface SoftDeletableEntity extends SoftDeletable {
  id: string;
}

/**
 * Provider Secret 清理适配器
 * 因为 PgProviderSecretRepository 手动实现了软删除，需要适配器来支持清理接口
 */
class ProviderSecretCleanupAdapter extends PgSoftDeletableRepository<SoftDeletableEntity> {
  constructor(pool: Pool) {
    super(pool, nrm("provider_secrets"));
  }

  protected mapRow(row: Record<string, unknown>): SoftDeletableEntity {
    return {
      id: row.id as string,
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected mapEntity(entity: SoftDeletableEntity): Record<string, unknown> {
    return {
      id: entity.id,
      deleted_at: entity.deletedAt ?? null,
      deleted_by: entity.deletedBy ?? null,
    };
  }
}

/**
 * Credits 清理适配器
 * 因为 PgCreditRepository 手动实现了软删除（主键是 user_id），需要适配器来支持清理接口
 * 注意：Credits 表的 "id" 实际上是 user_id
 */
class CreditCleanupAdapter extends PgSoftDeletableRepository<SoftDeletableEntity> {
  constructor(pool: Pool) {
    super(pool, nrm("credits"));
  }

  protected mapRow(row: Record<string, unknown>): SoftDeletableEntity {
    // Credits 表的主键是 user_id，我们将其映射为 id
    return {
      id: row.user_id as string,
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  protected mapEntity(entity: SoftDeletableEntity): Record<string, unknown> {
    return {
      user_id: entity.id,
      deleted_at: entity.deletedAt ?? null,
      deleted_by: entity.deletedBy ?? null,
    };
  }

  /** 覆盖 listDeleted 以使用 user_id 作为主键 */
  override async listDeleted(retentionDays?: number): Promise<SoftDeletableEntity[]> {
    if (retentionDays) {
      const threshold = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const result = await this.queryClient.query(
        `SELECT user_id, deleted_at, deleted_by FROM ${this.tableName} WHERE deleted_at IS NOT NULL AND deleted_at < $1`,
        [threshold],
      );
      return result.rows.map((row) => this.mapRow(row));
    }
    const result = await this.queryClient.query(
      `SELECT user_id, deleted_at, deleted_by FROM ${this.tableName} WHERE deleted_at IS NOT NULL`,
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 覆盖 hardDelete 以使用 user_id 作为主键 */
  override async hardDelete(id: string): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE user_id = $1`,
      [id],
    );
  }
}