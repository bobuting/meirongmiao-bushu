import type { FastifyRequest, RouteHandlerMethod } from "fastify";
import { createReadStream, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AppContext } from "../core/app-context.js";
import type { User } from "../contracts/types.js";
import { AppError } from "../core/errors.js";

interface DouyinRouteHandlers {
  readonly getDouyinPublishStatus: RouteHandlerMethod;
  readonly getDouyinAuthStatus: RouteHandlerMethod;
  readonly getDouyinRemoteLoginStatus: RouteHandlerMethod;
  readonly generateDouyinQRCode: RouteHandlerMethod;
  readonly checkDouyinScanStatus: RouteHandlerMethod;
  readonly clearDouyinCookie: RouteHandlerMethod;
  readonly createDouyinRemoteSession: RouteHandlerMethod;
  readonly getDouyinRemoteSession: RouteHandlerMethod;
  readonly closeDouyinRemoteSession: RouteHandlerMethod;
  readonly publishToDouyin: RouteHandlerMethod;
  readonly getPublishJob: RouteHandlerMethod;
  readonly getPublishJobs: RouteHandlerMethod;
  readonly getPublishStagingScreenshot: RouteHandlerMethod;
}

async function requireDouyinUser(ctx: AppContext, request: FastifyRequest): Promise<User> {
  const authHeader = String(request.headers.authorization ?? "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
  }
  return await ctx.authService.requireUser(token);
}

export function createDouyinRouteHandlers(ctx: AppContext): DouyinRouteHandlers {
  return {
    getDouyinPublishStatus: async () => ({
      enabled: ctx.douyinPublishService.isEnabled,
    }),
    getDouyinAuthStatus: async (request, reply) => {
      if (!ctx.douyinAuthService.isEnabled) {
        return reply.status(501).send({ error: "Douyin auth is not enabled" });
      }
      const user = await requireDouyinUser(ctx, request);
      return ctx.douyinAuthService.getAuthStatus(user.id);
    },
    getDouyinRemoteLoginStatus: async (request, reply) => {
      if (!ctx.douyinAuthService.isEnabled) {
        return reply.status(501).send({ error: "Douyin auth is not enabled" });
      }
      await requireDouyinUser(ctx, request);
      return { enabled: ctx.douyinRemoteLoginService.isEnabled };
    },
    generateDouyinQRCode: async (request, reply) => {
      if (!ctx.douyinAuthService.isEnabled) {
        return reply.status(501).send({ error: "Douyin auth is not enabled" });
      }
      const user = await requireDouyinUser(ctx, request);
      try {
        const session = await ctx.douyinAuthService.generateQRCode(user.id);
        return {
          sessionId: session.id,
          qrCodeUrl: session.qrCodeUrl,
          qrUpdatedAt: session.qrUpdatedAt,
          expiresAt: session.expiresAt,
        };
      } catch (error) {
        return reply.status(500).send({ error: error instanceof Error ? error.message : "二维码生成失败" });
      }
    },
    checkDouyinScanStatus: async (request, reply) => {
      if (!ctx.douyinAuthService.isEnabled) {
        return reply.status(501).send({ error: "Douyin auth is not enabled" });
      }
      await requireDouyinUser(ctx, request);
      const params = request.params as { sessionId: string };
      const session = ctx.douyinAuthService.getSession(params.sessionId);
      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }
      return {
        qrCodeUrl: session.qrCodeUrl,
        qrUpdatedAt: session.qrUpdatedAt,
        status: session.status,
        errorMessage: session.errorMessage,
        expiresAt: session.expiresAt,
      };
    },
    clearDouyinCookie: async (request, reply) => {
      if (!ctx.douyinAuthService.isEnabled) {
        return reply.status(501).send({ error: "Douyin auth is not enabled" });
      }
      const user = await requireDouyinUser(ctx, request);
      await ctx.douyinRemoteLoginService.clearUserSessions(user.id);
      await ctx.douyinAuthService.clearUserCookie(user.id);
      return { success: true };
    },
    createDouyinRemoteSession: async (request, reply) => {
      if (!ctx.douyinAuthService.isEnabled) {
        return reply.status(501).send({ error: "Douyin auth is not enabled" });
      }
      if (!ctx.douyinRemoteLoginService.isEnabled) {
        return reply.status(501).send({ error: "Douyin remote login is not enabled" });
      }
      const user = await requireDouyinUser(ctx, request);
      try {
        return await ctx.douyinRemoteLoginService.createSession(user.id);
      } catch (error) {
        return reply.status(500).send({ error: error instanceof Error ? error.message : "远程登录会话创建失败" });
      }
    },
    getDouyinRemoteSession: async (request, reply) => {
      if (!ctx.douyinAuthService.isEnabled) {
        return reply.status(501).send({ error: "Douyin auth is not enabled" });
      }
      if (!ctx.douyinRemoteLoginService.isEnabled) {
        return reply.status(501).send({ error: "Douyin remote login is not enabled" });
      }
      await requireDouyinUser(ctx, request);
      const params = request.params as { sessionId: string };
      const session = ctx.douyinRemoteLoginService.getSession(params.sessionId);
      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }
      return session;
    },
    closeDouyinRemoteSession: async (request, reply) => {
      if (!ctx.douyinAuthService.isEnabled) {
        return reply.status(501).send({ error: "Douyin auth is not enabled" });
      }
      if (!ctx.douyinRemoteLoginService.isEnabled) {
        return reply.status(501).send({ error: "Douyin remote login is not enabled" });
      }
      await requireDouyinUser(ctx, request);
      const params = request.params as { sessionId: string };
      await ctx.douyinRemoteLoginService.closeSession(params.sessionId);
      return { success: true };
    },
    publishToDouyin: async (request, reply) => {
      if (!ctx.douyinPublishService.isEnabled) {
        return reply.status(501).send({ error: "Douyin publish is not enabled" });
      }
      const user = await requireDouyinUser(ctx, request);
      const params = request.params as { projectId: string };
      const project = await ctx.repos.projects.findById(params.projectId);
      if (!project || project.userId !== user.id) {
        return reply.status(404).send({ error: "Project not found" });
      }
      const body = request.body as {
        title: string;
        tags?: string[];
        coverImagePath?: string | null;
        linkUrl?: string | null;
        productLink?: string | null;
        productTitle?: string | null;
        aiGeneratedDeclaration?: boolean;
        publishDate?: number;
        videoFilePath: string;
      };
      const job = await ctx.douyinPublishService.publish({
        projectId: params.projectId,
        userId: user.id,
        videoFilePath: body.videoFilePath,
        title: String(body.title ?? "").slice(0, 30),
        tags: Array.isArray(body.tags) ? body.tags : [],
        coverImagePath: body.coverImagePath ?? null,
        linkUrl: body.linkUrl ?? null,
        productLink: body.productLink ?? null,
        productTitle: body.productTitle ?? null,
        aiGeneratedDeclaration: body.aiGeneratedDeclaration ?? true,
        publishDate: body.publishDate ?? 0,
      });
      return { jobId: job.id, status: job.status };
    },
    getPublishJob: async (request, reply) => {
      if (!ctx.douyinPublishService.isEnabled) {
        return reply.status(501).send({ error: "Douyin publish is not enabled" });
      }
      const user = await requireDouyinUser(ctx, request);
      const params = request.params as { projectId: string; jobId: string };
      const job = ctx.douyinPublishService.getJob(params.jobId);
      if (!job || job.projectId !== params.projectId || job.userId !== user.id) {
        return reply.status(404).send({ error: "Publish job not found" });
      }
      return job;
    },
    getPublishJobs: async (request, reply) => {
      if (!ctx.douyinPublishService.isEnabled) {
        return reply.status(501).send({ error: "Douyin publish is not enabled" });
      }
      const user = await requireDouyinUser(ctx, request);
      const params = request.params as { projectId: string };
      return ctx.douyinPublishService.listJobs(params.projectId, user.id);
    },
    getPublishStagingScreenshot: async (request, reply) => {
      const params = request.params as { filename: string };
      const filename = String(params.filename ?? "").replace(/[^a-zA-Z0-9._-]/g, "");
      if (!filename.endsWith(".png")) {
        return reply.status(400).send({ error: "Only PNG files allowed" });
      }
      const stagingDir = resolve("data/publish-staging");
      const filePath = join(stagingDir, filename);
      if (!filePath.startsWith(stagingDir) || !existsSync(filePath)) {
        return reply.status(404).send({ error: "File not found" });
      }
      const stream = createReadStream(filePath);
      stream.on("error", (err) => {
        reply.status(500).send({ error: `读取文件失败: ${err.message}` });
      });
      return reply.type("image/png").send(stream);
    },
  };
}
