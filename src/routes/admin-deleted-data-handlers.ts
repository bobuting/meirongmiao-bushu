/**
 * admin-deleted-data-handlers.ts
 * 管理员伪删除数据路由处理函数
 */

import type { FastifyRequest } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { DeletedDataCleanupService, SoftDeleteTableName, CleanupStatus, CleanupResult } from "../modules/deleted-data-cleanup-service.js";
import type { DeletedDataCleanupScheduler } from "../scheduler/index.js";
import type { PgSoftDeletableRepository } from "../repositories/pg/soft-deletable-repository.js";
import type { SoftDeletable } from "../contracts/types.js";

import { AppError } from "../core/errors.js";
import { requireAdmin } from "../services/auth/route-guards.js";
import { getLogger } from "../core/logger/index.js";
const log = getLogger("admin-deleted-data-handlers");

/** 仓库映射类型 */
type RepoMap = Map<string, PgSoftDeletableRepository<SoftDeletable & { id: string }>>;

/** 创建管理员伪删除数据路由处理器 */
export function createAdminDeletedDataHandlers(
  ctx: AppContext,
  cleanupService: DeletedDataCleanupService,
  scheduler: DeletedDataCleanupScheduler,
  softDeleteRepos: RepoMap,
): {
  listDeletedData: (request: FastifyRequest) => Promise<unknown>;
  getDeletedDataDetail: (request: FastifyRequest) => Promise<unknown>;
  restoreDeletedData: (request: FastifyRequest) => Promise<unknown>;
  manualCleanup: (request: FastifyRequest) => Promise<unknown>;
  getCleanupStatus: (request: FastifyRequest) => Promise<unknown>;
  toggleCleanupScheduler: (request: FastifyRequest) => Promise<unknown>;
} {
  /**
   * 查看伪删除数据列表
   *
   * Query 参数：
   * - table: 表名（可选，不传则返回所有表的统计）
   * - retentionDays: 保留天数（可选，只返回超过保留期的数据）
   */
  async function listDeletedData(request: FastifyRequest): Promise<unknown> {
    await requireAdmin(ctx, request);
    const query = request.query as { table?: string; retentionDays?: string };

    // 如果指定了表名，返回该表的已删除数据
    if (query.table) {
      const tableName = query.table as SoftDeleteTableName;
      const repo = softDeleteRepos.get(tableName);
      if (!repo) {
        throw new AppError(400, "INVALID_TABLE", `不支持的表: ${tableName}`);
      }

      const retentionDays = query.retentionDays ? Number(query.retentionDays) : undefined;
      const deletedRecords = await repo.listDeleted(retentionDays);

      return {
        table: tableName,
        count: deletedRecords.length,
        records: deletedRecords.map((record) => ({
          id: record.id,
          deletedAt: record.deletedAt,
          deletedBy: record.deletedBy,
        })),
      };
    }

    // 如果没有指定表名，返回所有表的统计
    const tables: Record<string, { count: number }> = {};
    for (const [tableName, repo] of softDeleteRepos) {
      try {
        const count = await repo.countDeleted();
        tables[tableName] = { count };
      } catch (error) {
        // 某些表可能暂时不可访问，记录错误但继续
        log.error({ err: error, tableName }, "统计表的已删除记录失败");
        tables[tableName] = { count: 0 };
      }
    }

    return { tables };
  }

  /**
   * 查看单条伪删除数据详情
   *
   * 获取指定表中被伪删除的数据详情（包含完整数据）
   */
  async function getDeletedDataDetail(request: FastifyRequest): Promise<unknown> {
    await requireAdmin(ctx, request);
    const params = request.params as { table: string; id: string };
    const tableName = params.table as SoftDeleteTableName;

    const repo = softDeleteRepos.get(tableName);
    if (!repo) {
      throw new AppError(400, "INVALID_TABLE", `不支持的表: ${tableName}`);
    }

    // 使用 includeDeleted 选项查找已删除的记录
    const record = await repo.findById(params.id, { includeDeleted: true });
    if (!record) {
      throw new AppError(404, "NOT_FOUND", `记录不存在: ${params.id}`);
    }

    // 确认记录已被伪删除
    if (!record.deletedAt) {
      throw new AppError(400, "NOT_DELETED", `记录未被删除: ${params.id}`);
    }

    return {
      table: tableName,
      id: params.id,
      deletedAt: record.deletedAt,
      deletedBy: record.deletedBy,
      data: record,
    };
  }

  /**
   * 恢复伪删除数据
   *
   * 清除 deleted_at 和 deleted_by，恢复数据
   */
  async function restoreDeletedData(request: FastifyRequest): Promise<unknown> {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { table: string; id: string };
    const tableName = params.table as SoftDeleteTableName;

    const repo = softDeleteRepos.get(tableName);
    if (!repo) {
      throw new AppError(400, "INVALID_TABLE", `不支持的表: ${tableName}`);
    }

    // 检查记录是否存在且已删除
    const record = await repo.findById(params.id, { includeDeleted: true });
    if (!record) {
      throw new AppError(404, "NOT_FOUND", `记录不存在: ${params.id}`);
    }
    if (!record.deletedAt) {
      throw new AppError(400, "NOT_DELETED", `记录未被删除: ${params.id}`);
    }

    // 恢复记录
    await repo.restore(params.id);

    // 记录审计日志
    ctx.auditStore.insertAuditLog({
      id: ctx.clock.generateId(),
      actorUserId: admin.id,
      action: "admin_restore_deleted_data",
      targetId: params.id,
      meta: {
        table: tableName,
        originalDeletedAt: record.deletedAt,
        originalDeletedBy: record.deletedBy,
      },
      createdAt: ctx.clock.now(),
    });

    return {
      ok: true,
      table: tableName,
      id: params.id,
      restoredAt: ctx.clock.now(),
    };
  }

  /**
   * 手动清理伪删除数据
   *
   * 清理超过保留期限的伪删除数据
   *
   * Body 参数：
   * - table: 表名（可选，不传则清理所有表）
   * - retentionDays: 保留天数（可选，默认使用服务配置）
   */
  async function manualCleanup(request: FastifyRequest): Promise<unknown> {
    const admin = await requireAdmin(ctx, request);
    const body = request.body as { table?: string; retentionDays?: number };

    let result: CleanupResult;

    if (body.table) {
      // 清理指定表
      const tableName = body.table as SoftDeleteTableName;
      const deletedCount = await cleanupService.manualCleanup(tableName, body.retentionDays);

      result = {
        tables: { [tableName]: deletedCount },
        totalDeleted: deletedCount,
        lastRunAt: Date.now(),
      };
    } else {
      // 清理所有表
      result = await cleanupService.manualCleanupAll(body.retentionDays);
    }

    // 记录审计日志
    ctx.auditStore.insertAuditLog({
      id: ctx.clock.generateId(),
      actorUserId: admin.id,
      action: "admin_manual_cleanup_deleted_data",
      targetId: "cleanup",
      meta: {
        tables: result.tables,
        totalDeleted: result.totalDeleted,
        retentionDays: body.retentionDays,
      },
      createdAt: ctx.clock.now(),
    });

    return {
      ok: true,
      ...result,
    };
  }

  /**
   * 查看清理任务状态
   */
  async function getCleanupStatus(request: FastifyRequest): Promise<unknown> {
    await requireAdmin(ctx, request);
    const status = cleanupService.getStatus();
    return status;
  }

  /**
   * 启用/禁用定时清理
   *
   * Body 参数：
   * - enabled: 是否启用
   */
  async function toggleCleanupScheduler(request: FastifyRequest): Promise<unknown> {
    const admin = await requireAdmin(ctx, request);
    const body = request.body as { enabled: boolean };

    cleanupService.setEnabled(body.enabled);

    // 记录审计日志
    ctx.auditStore.insertAuditLog({
      id: ctx.clock.generateId(),
      actorUserId: admin.id,
      action: "admin_toggle_cleanup_scheduler",
      targetId: "scheduler",
      meta: {
        enabled: body.enabled,
      },
      createdAt: ctx.clock.now(),
    });

    return {
      ok: true,
      enabled: body.enabled,
      status: cleanupService.getStatus(),
    };
  }

  return {
    listDeletedData,
    getDeletedDataDetail,
    restoreDeletedData,
    manualCleanup,
    getCleanupStatus,
    toggleCleanupScheduler,
  };
}
