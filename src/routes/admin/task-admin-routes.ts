/**
 * 任务管理路由（管理后台）
 *
 * 提供：
 * 1. 系统任务查询
 * 2. 用户任务查询
 * 3. 调度配置查询与更新
 */

import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { requireAdmin } from "../../services/auth/route-guards.js";
import type { AppContext } from "../../core/app-context.js";

/** 系统任务查询参数 */
interface SystemJobQuery {
  jobType?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

/** 用户任务查询参数 */
interface UserJobQuery {
  jobType?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

/** 调度配置结构 */
interface SchedulerConfig {
  scoringDaemonEnabled: boolean;
  evolutionEnabled: boolean;
}

const SYSTEM_CONFIG_MODULE = 'skills_system';

/**
 * 注册任务管理路由
 */
export async function registerTaskAdminRoutes(
  app: FastifyInstance,
  deps: { pool: Pool; ctx: AppContext },
) {
  const { ctx } = deps;
  const repos = ctx.repos;

  /**
   * 查询系统任务列表
   */
  app.get("/system-jobs", async (request, reply) => {
    await requireAdmin(ctx, request);

    const query = request.query as SystemJobQuery;
    const page = query.page || 1;
    const pageSize = Math.min(query.pageSize || 20, 100);
    const offset = (page - 1) * pageSize;

    const { rows, total, stats } = await repos.systemJobs.findWithFilters({
      jobType: query.jobType,
      status: query.status,
      limit: pageSize,
      offset,
    });

    return reply.send({
      success: true,
      data: {
        items: rows.map((row) => ({
          id: row.id,
          jobType: row.job_type,
          input: row.input,
          status: row.status,
          priority: row.priority,
          retryCount: row.retry_count,
          maxRetries: row.max_retries,
          result: row.result,
          errorMessage: row.error_message,
          scheduledAt: row.scheduled_at,
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at),
          startedAt: row.started_at ? Number(row.started_at) : null,
          completedAt: row.completed_at ? Number(row.completed_at) : null,
        })),
        total,
        stats,
      },
    });
  });

  /**
   * 查询用户任务列表
   */
  app.get("/user-jobs", async (request, reply) => {
    await requireAdmin(ctx, request);

    const query = request.query as UserJobQuery;
    const page = query.page || 1;
    const pageSize = Math.min(query.pageSize || 20, 100);
    const offset = (page - 1) * pageSize;

    const { rows, total, stats } = await repos.asyncJobs.findVisibleToUserWithFilters({
      jobType: query.jobType,
      status: query.status,
      limit: pageSize,
      offset,
    });

    return reply.send({
      success: true,
      data: {
        items: rows.map((row) => ({
          id: row.id,
          userId: row.user_id,
          projectId: row.project_id,
          jobType: row.job_type,
          status: row.status,
          stage: row.stage,
          input: row.input,
          result: row.result,
          error: row.error,
          visibleToUser: row.visible_to_user,
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at),
        })),
        total,
        stats,
      },
    });
  });

  /**
   * 获取调度配置
   */
  app.get("/scheduler-config", async (request, reply) => {
    await requireAdmin(ctx, request);

    const result = await repos.businessConfigs.get(SYSTEM_CONFIG_MODULE);

    if (!result) {
      return reply.send({
        success: true,
        data: { scoringDaemonEnabled: false, evolutionEnabled: false },
      });
    }

    return reply.send({ success: true, data: result });
  });

  /**
   * 更新调度配置
   */
  app.patch("/scheduler-config", async (request, reply) => {
    await requireAdmin(ctx, request);

    const body = request.body as Partial<SchedulerConfig>;

    const current = await repos.businessConfigs.get(SYSTEM_CONFIG_MODULE);
    const currentConfig: SchedulerConfig = current
      ? (current as unknown as SchedulerConfig)
      : { scoringDaemonEnabled: false, evolutionEnabled: false };

    const newConfig: SchedulerConfig = {
      scoringDaemonEnabled: body.scoringDaemonEnabled ?? currentConfig.scoringDaemonEnabled,
      evolutionEnabled: body.evolutionEnabled ?? currentConfig.evolutionEnabled,
    };

    await repos.businessConfigs.upsert(SYSTEM_CONFIG_MODULE, newConfig as unknown as Record<string, unknown>, '系统调度配置（守护进程开关）');

    return reply.send({ success: true, data: newConfig });
  });
}
