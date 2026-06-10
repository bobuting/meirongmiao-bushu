/** 扩展配置路由 */

import type { FastifyInstance } from "fastify";
import crypto from "crypto";
import type { AppContext } from "../core/app-context.js";
import { requireUser } from "../services/auth/route-guards.js";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("ext-douyin-config");

interface ExtensionConfigRoutesDeps {
  ctx: AppContext;
}

export function registerExtensionConfigRoutes(
  app: FastifyInstance,
  deps: ExtensionConfigRoutesDeps
): void {
  const { ctx } = deps;

  /**
   * 生成扩展认证 Token
   * POST /ext/douyin/config/token
   */
  app.post("/ext/douyin/config/token", async (request, reply) => {
    // 验证用户登录
    const user = await requireUser(ctx, request);

    // 生成用户专属的扩展 Token (有效期 7 天)
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

    // 存储 Token 到数据库
    try {
      // 确保 Token 表存在 + 清理过期 Token + 插入新 Token
      await ctx.repos.extTokens.ensureSchema();
      await ctx.repos.extTokens.deleteExpiredByUser(user.id, Date.now());
      await ctx.repos.extTokens.insertToken({
        id: crypto.randomUUID(),
        userId: user.id,
        token,
        expiresAt,
        createdAt: Date.now(),
      });

      return reply.send({
        code: "SUCCESS",
        data: {
          token,
          expiresAt,
          apiBaseUrl: `${request.protocol}://${request.host}/neirongmiao/api`,
        },
      });
    } catch (error) {
      log.error({ err: error }, "生成扩展 Token 失败");
      return reply.status(500).send({
        code: "TOKEN_GENERATION_FAILED",
        message: "生成扩展认证 Token 失败",
      });
    }
  });
}