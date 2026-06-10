/**
 * 存储代理下载路由
 * 前端通过同源后端代理下载 OSS 文件，避免跨域问题
 * 通用路由，服务于 Step4、Fission 等所有需要代理下载的场景
 */

import type { FastifyInstance, RouteHandlerMethod } from "fastify";
import type { User } from "../contracts/types.js";
import type { AppContext } from "../core/app-context.js";
import { getStorageAdapter } from "../modules/fission-video/fission-storage-service.js";
import { getLogger } from "../core/logger/index.js";
const log = getLogger("storage-proxy-routes");

/**
 * 路由处理器接口
 */
export interface StorageProxyRouteHandlers {
  readonly storageProxy: RouteHandlerMethod;
}

/**
 * 注册存储代理路由
 */
export function registerStorageProxyRoutes(
  app: FastifyInstance,
  handlers: StorageProxyRouteHandlers,
): void {
  // 存储代理下载（需登录）
  app.get("/storage/proxy/*", handlers.storageProxy);
}

/**
 * 根据文件扩展名推测 Content-Type
 */
function guessContentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const contentTypeMap: Record<string, string> = {
    mp4: "video/mp4",
    webm: "video/webm",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
  };
  return contentTypeMap[ext] || "application/octet-stream";
}

/**
 * 创建存储代理路由处理器
 */
export function createStorageProxyRouteHandlersWithContext(
  ctx: AppContext,
  requireUser: (ctx: AppContext, request: Parameters<RouteHandlerMethod>[0]) => Promise<User>,
): StorageProxyRouteHandlers {
  return {
    /**
     * 存储代理下载
     * 路径格式: GET /storage/proxy/storage/projects/xxx/...
     * 安全校验：禁止路径穿越（..）
     */
    storageProxy: async (request, reply) => {
      const user = await requireUser(ctx, request);
      if (!user) {
        return reply.code(401).send({ success: false, message: "未登录" });
      }

      // 提取通配符路径
      const wildcardPath = (request.params as Record<string, string>)["*"];
      if (!wildcardPath || typeof wildcardPath !== "string") {
        return reply.code(400).send({ success: false, message: "缺少文件路径" });
      }

      // 安全校验：禁止路径穿越
      if (wildcardPath.includes("..")) {
        return reply.code(403).send({ success: false, message: "路径不合法" });
      }

      try {
        const storage = getStorageAdapter(ctx.adminConfigService.get(), ctx.storage);
        if (!storage) {
          return reply.code(500).send({ success: false, message: "存储服务未配置" });
        }

        const data = await storage.getObject(wildcardPath);

        return reply
          .header("Content-Type", guessContentType(wildcardPath))
          .header("Cache-Control", "public, max-age=3600")
          .send(Buffer.from(data));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error({ err: error, path: wildcardPath }, "StorageProxy 下载失败");
        return reply.code(404).send({ success: false, message: `文件下载失败: ${errorMessage}` });
      }
    },
  };
}
