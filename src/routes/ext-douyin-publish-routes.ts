/** 扩展发布专用路由（与服务端自动化完全隔离） */

import type { FastifyInstance } from "fastify";
import { ExtDouyinPublishService } from "../modules/ext-douyin-publish-service.js";
import {
  createExtAccount,
  listExtAccounts,
  removeExtAccount,
  checkExtAccountCookieStatus,
  syncExtAccountInfo,
} from "../repositories/pg/ext-douyin-account-repo.js";
import { requireUser, requireExtUser, requireAnyUser } from "../services/auth/route-guards.js";
import type { AppContext } from "../core/app-context.js";

interface ExtPublishRoutesDeps {
  ctx: AppContext;
}

export function registerExtDouyinPublishRoutes(
  app: FastifyInstance,
  deps: ExtPublishRoutesDeps
): void {
  const { ctx } = deps;
  const { pool, repos } = ctx;
  const publishService = new ExtDouyinPublishService(repos);

  // ── 账号管理 ──

  /** 临时调试接口：查询所有扩展账号（含重复检测） */
  app.get("/ext/douyin/accounts/debug/all", async (request, reply) => {
    const allAccounts = await pool.query(
      `SELECT id, user_id, label, douyin_uid, status, last_verified_at, created_at, updated_at
       FROM nrm_ext_douyin_accounts
       ORDER BY user_id, created_at DESC`
    );

    // 检测重复（相同的 user_id + label）
    const byKey = new Map<string, typeof allAccounts.rows>();
    for (const row of allAccounts.rows) {
      const key = `${row.user_id}|${row.label}`;
      if (!byKey.has(key)) {
        byKey.set(key, []);
      }
      byKey.get(key)!.push(row);
    }

    const duplicates = Array.from(byKey.entries())
      .filter(([_, rows]) => rows.length > 1)
      .map(([key, rows]) => ({ key, count: rows.length, rows }));

    return reply.send({
      code: "SUCCESS",
      data: {
        total: allAccounts.rows.length,
        duplicates: duplicates.length,
        duplicateGroups: duplicates,
      },
    });
  });

  /** 清理重复账号（保留最新的） */
  app.post("/ext/douyin/accounts/debug/cleanup-duplicates", async (request, reply) => {
    const allAccounts = await pool.query(
      `SELECT id, user_id, label, douyin_uid, status, last_verified_at, created_at, updated_at
       FROM nrm_ext_douyin_accounts
       ORDER BY user_id, created_at DESC`
    );

    // 按用户+label 分组
    const byKey = new Map<string, typeof allAccounts.rows>();
    for (const row of allAccounts.rows) {
      const key = `${row.user_id}|${row.label}`;
      if (!byKey.has(key)) {
        byKey.set(key, []);
      }
      byKey.get(key)!.push(row);
    }

    const toDelete: string[] = [];
    for (const [key, rows] of byKey.entries()) {
      if (rows.length > 1) {
        // 保留最新的一条，删除其余的
        const toKeep = rows[0]!;
        for (let i = 1; i < rows.length; i++) {
          toDelete.push(rows[i]!.id);
        }
      }
    }

    if (toDelete.length === 0) {
      return reply.send({
        code: "SUCCESS",
        data: { message: "没有发现重复账号", deleted: 0 },
      });
    }

    // 执行删除
    await pool.query(
      `DELETE FROM nrm_ext_douyin_accounts WHERE id = ANY($1)`,
      [toDelete]
    );

    return reply.send({
      code: "SUCCESS",
      data: {
        message: `已清理 ${toDelete.length} 个重复账号`,
        deleted: toDelete.length,
        deletedIds: toDelete,
      },
    });
  });

  /** 查询当前用户绑定的抖音账号列表 */
  app.get("/ext/douyin/accounts", async (request, reply) => {
    const user = await requireAnyUser(ctx, request);
    const accounts = await listExtAccounts(pool, user.id);
    return reply.send({
      code: "SUCCESS",
      data: accounts.map((a) => ({
        id: a.id,
        label: a.label,
        douyinUid: a.douyinUid,
        status: a.status,
        lastVerifiedAt: a.lastVerifiedAt,
        createdAt: a.createdAt,
      })),
    });
  });

  /** 注册新账号（扩展端调用） */
  app.post("/ext/douyin/accounts", async (request, reply) => {
    const user = await requireAnyUser(ctx, request);
    const body = request.body as { id?: string; label: string };
    const account = await createExtAccount(pool, {
      id: body.id, // 支持扩展传入本地生成的 ID，确保两端一致
      userId: user.id,
      label: body.label ?? "",
    });
    return reply.send({ code: "SUCCESS", data: account });
  });

  /** 删除账号 */
  app.delete("/ext/douyin/accounts/:accountId", async (request, reply) => {
    const user = await requireAnyUser(ctx, request);
    const { accountId } = request.params as { accountId: string };
    await removeExtAccount(pool, user.id, accountId);
    return reply.send({ code: "SUCCESS" });
  });

  /** 同步账号信息（扩展端获取昵称/UID/状态后调用） */
  app.patch("/ext/douyin/accounts/:accountId", async (request, reply) => {
    const user = await requireAnyUser(ctx, request);
    const { accountId } = request.params as { accountId: string };
    const body = request.body as {
      label?: string;
      douyinUid?: string | null;
      status?: "active" | "expired" | "pending" | "revoked";
    };

    // 确认账号属于当前用户
    const accounts = await listExtAccounts(pool, user.id);
    if (!accounts.some((a) => a.id === accountId)) {
      return reply.status(404).send({ code: "NOT_FOUND", message: "账号不存在" });
    }

    await syncExtAccountInfo(pool, user.id, accountId, {
      label: body.label,
      douyinUid: body.douyinUid ?? null,
      status: body.status,
    });

    return reply.send({ code: "SUCCESS" });
  });

  /** 检查账号 Cookie 状态 */
  app.get(
    "/ext/douyin/accounts/:accountId/cookie-status",
    async (request, reply) => {
      const user = await requireAnyUser(ctx, request);
      const { accountId } = request.params as { accountId: string };
      const status = await checkExtAccountCookieStatus(pool, user.id, accountId);
      return reply.send({ code: "SUCCESS", data: status });
    }
  );

  // ── 发布任务管理 ──

  /** 前端调用：创建发布任务 */
  app.post("/ext/douyin/publish", async (request, reply) => {
    const user = await requireUser(ctx, request);
    const body = request.body as {
      projectId: string;
      accountId: string;
      videoUrl: string;
      title: string;
      tags?: string[];
      coverImageUrl?: string;
      publishDate?: number;
      aiGeneratedDeclaration?: boolean;
    };

    if (!body.projectId || !body.accountId || !body.videoUrl || !body.title) {
      return reply.status(400).send({
        code: "INVALID_INPUT",
        message: "缺少必填字段：projectId, accountId, videoUrl, title",
      });
    }

    const job = await publishService.createJob({
      userId: user.id,
      projectId: body.projectId,
      accountId: body.accountId,
      input: {
        videoUrl: body.videoUrl,
        title: body.title,
        tags: body.tags ?? [],
        coverImageUrl: body.coverImageUrl ?? null,
        publishDate: body.publishDate ?? 0,
        aiGeneratedDeclaration: body.aiGeneratedDeclaration ?? true,
      },
    });

    return reply.send({ code: "SUCCESS", data: { jobId: job.id } });
  });

  /** 查询任务列表 */
  app.get("/ext/douyin/jobs", async (request, reply) => {
    const user = await requireUser(ctx, request);
    const jobs = await publishService.listJobs(user.id);
    return reply.send({ code: "SUCCESS", data: jobs });
  });

  /** 查询单条任务（前端轮询用） */
  app.get("/ext/douyin/jobs/:jobId", async (request, reply) => {
    const user = await requireUser(ctx, request);
    const { jobId } = request.params as { jobId: string };
    const job = await publishService.getJobById(user.id, jobId);
    if (!job) {
      return reply.status(404).send({ code: "NOT_FOUND", message: "任务不存在" });
    }
    return reply.send({
      code: "SUCCESS",
      data: {
        id: job.id,
        status: job.status,
        stage: job.stage,
        result: job.resultJson,
        error: job.errorJson,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
    });
  });

  // ── 扩展端调用（使用 ext token 认证） ──

  /** 扩展轮询：获取下一个待执行任务（顺便清理超时任务） */
  app.get("/ext/douyin/jobs/poll", async (request, reply) => {
    const user = await requireExtUser(ctx, request);

    // 顺便清理该用户的超时任务
    try {
      await publishService.expireStaleJobs(user.id);
    } catch {
      // 清理失败不影响主流程
    }

    const job = await publishService.pollNextJob(user.id);
    if (!job) {
      return reply.send({ code: "SUCCESS", data: null });
    }
    // 映射字段名：数据库 inputJson/resultJson → 插件期望 input/result
    return reply.send({
      code: "SUCCESS",
      data: {
        id: job.id,
        userId: job.userId,
        projectId: job.projectId,
        accountId: job.accountId,
        status: job.status,
        stage: job.stage,
        input: job.inputJson,
        result: job.resultJson,
        error: job.errorJson,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
    });
  });

  /** 扩展认领任务 */
  app.post("/ext/douyin/jobs/:jobId/claim", async (request, reply) => {
    const user = await requireExtUser(ctx, request);
    const { jobId } = request.params as { jobId: string };
    const claimed = await publishService.claimJob(user.id, jobId);
    return reply.send({ code: "SUCCESS", data: { claimed } });
  });

  /** 扩展上报进度 */
  app.post("/ext/douyin/jobs/:jobId/progress", async (request, reply) => {
    const user = await requireExtUser(ctx, request);
    const { jobId } = request.params as { jobId: string };
    const body = request.body as { stage: string; message: string; progress?: number };
    await publishService.reportProgress(user.id, jobId, body);
    return reply.send({ code: "SUCCESS" });
  });

  /** 扩展完成任务 */
  app.post("/ext/douyin/jobs/:jobId/complete", async (request, reply) => {
    const user = await requireExtUser(ctx, request);
    const { jobId } = request.params as { jobId: string };
    const body = request.body as { ok: boolean; message: string; douyinItemId?: string };
    await publishService.completeJob(user.id, jobId, {
      ok: body.ok,
      message: body.message,
      douyinItemId: body.douyinItemId ?? null,
    });
    return reply.send({ code: "SUCCESS" });
  });

  /** 扩展失败 */
  app.post("/ext/douyin/jobs/:jobId/fail", async (request, reply) => {
    const user = await requireExtUser(ctx, request);
    const { jobId } = request.params as { jobId: string };
    const body = request.body as { code: string; message: string };
    await publishService.failJob(user.id, jobId, body);
    return reply.send({ code: "SUCCESS" });
  });
}