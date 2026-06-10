/**
 * 静态文件服务、健康检查、运维路由
 * 从 app.ts buildApp() 中提取，闭包变量通过 StaticRouteDeps 传入
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AppError } from "../core/errors.js";
import { contentTypeByExtension, resolveBinaryContentType } from "../services/utils/content-type.js";
import { resolveFrontendShellStaticRequest, sendFrontendShellHtml } from "./frontend-shell-routes.js";
import { resolveRuntimeDataPublicAssetFilePath } from "../modules/runtime-data-public-asset-route.js";
import { buildOpsHealthResponse } from "../modules/ops-api-governance.js";

/** 持久化运行时状态（替代 IM5PersistenceRuntime） */
export interface PersistenceStatus {
  readonly driver: string;
  readonly enabled: boolean;
  readonly status: "idle" | "ready" | "error";
}

/** 静态路由所需的 buildApp 闭包依赖 */
export interface StaticRouteDeps {
  readonly activeWebRoot: string;
  readonly publicRoot: string;
  readonly projectRoot: string;
  readonly objectStoragePublicBase: string;
  readonly objectStorageDriver: string;
  readonly objectStorageLocalRoot: string;
  readonly persistenceStatus: PersistenceStatus;
  readonly persistenceReadyRequired: boolean;
  readonly runtimeConfigNodeEnv: string;
  /** 可选：S3/OSS storage adapter，用于代理远程存储对象 */
  readonly storageAdapter?: import("../contracts/object-storage.js").IObjectStorageAdapter | null;
}

export function registerStaticRoutes(app: FastifyInstance, deps: StaticRouteDeps): void {
  const activeWebRoot = deps.activeWebRoot;
  const publicRoot = deps.publicRoot;
  const projectRoot = deps.projectRoot;
  const objectStoragePublicBase = deps.objectStoragePublicBase;
  const objectStorageDriver = deps.objectStorageDriver;
  const objectStorageLocalRoot = deps.objectStorageLocalRoot;
  const persistenceStatus = deps.persistenceStatus;
  const persistenceReadyRequired = deps.persistenceReadyRequired;
  const runtimeConfigNodeEnv = deps.runtimeConfigNodeEnv;
  const storageAdapter = deps.storageAdapter;

  app.get("/", async (_request, reply) => {
    return sendFrontendShellHtml(reply, activeWebRoot);
  });
  app.get("/styles.css", async (_request, reply) => {
    const cssPath = join(publicRoot, "styles.css");
    if (!existsSync(cssPath)) {
      throw new AppError(404, "NOT_FOUND", "styles.css not found");
    }
    const css = await readFile(cssPath, "utf8");
    return reply.type("text/css; charset=utf-8").send(css);
  });
  app.get("/app.js", async (_request, reply) => {
    const jsPath = join(publicRoot, "app.js");
    if (!existsSync(jsPath)) {
      throw new AppError(404, "NOT_FOUND", "app.js not found");
    }
    const js = await readFile(jsPath, "utf8");
    return reply.type("text/javascript; charset=utf-8").send(js);
  });

  /**
   * 通用静态目录文件服务
   * @param baseDir 基础目录（如 activeWebRoot 或 publicRoot）
   * @param subDir 子目录名（如 "assets" 或 "images")
   * @param errorLabel 错误提示标签（如 "Asset" 或 "Image"）
   */
  const serveStaticFromDir = async (
    request: FastifyRequest,
    reply: FastifyReply,
    baseDir: string,
    subDir: string,
    errorLabel: string
  ) => {
    const params = request.params as { "*": string };
    const rootDir = resolve(join(baseDir, subDir));
    const filePath = resolve(join(rootDir, params["*"]));
    if (!filePath.startsWith(rootDir)) {
      throw new AppError(400, "BAD_REQUEST", `Invalid ${errorLabel} path`);
    }
    if (!existsSync(filePath)) {
      throw new AppError(404, "NOT_FOUND", `${errorLabel} not found`);
    }
    const binary = await readFile(filePath);
    return reply.type(contentTypeByExtension(filePath)).send(binary);
  };

  app.get("/assets/*", async (request, reply) => {
    return serveStaticFromDir(request, reply, activeWebRoot, "assets", "Asset");
  });
  app.get("/images/*", async (request, reply) => {
    return serveStaticFromDir(request, reply, publicRoot, "images", "Image");
  });
  app.get("/data/*", async (request, reply) => {
    const params = request.params as { "*": string };
    const filePath = resolveRuntimeDataPublicAssetFilePath(projectRoot, params["*"] ?? "");
    if (!filePath || !existsSync(filePath)) {
      throw new AppError(404, "NOT_FOUND", "Data asset not found");
    }
    const binary = await readFile(filePath);
    return reply.type(contentTypeByExtension(filePath)).send(binary);
  });
  app.get("/:staticFile", async (request, reply) => {
    const params = request.params as { staticFile: string };
    const resolvedRequest = resolveFrontendShellStaticRequest({
      activeWebRoot,
      publicRoot,
      staticFile: params.staticFile,
    });
    if (resolvedRequest.serveSpaShell) {
      return sendFrontendShellHtml(reply, activeWebRoot);
    }
    if (!resolvedRequest.filePath) {
      throw new AppError(404, "NOT_FOUND", "Static file not found");
    }
    const binary = await readFile(resolvedRequest.filePath);
    return reply.type(contentTypeByExtension(resolvedRequest.filePath)).send(binary);
  });
  app.get(`${objectStoragePublicBase}/*`, async (request, reply) => {
    const params = request.params as { "*": string };
    const objectKey = params["*"] ?? "";
    if (!objectKey) {
      throw new AppError(400, "BAD_REQUEST", "Missing object key");
    }

    // 本地存储：直接读取本地文件
    if (objectStorageDriver === "local") {
      const filePath = resolve(join(objectStorageLocalRoot, objectKey));
      if (!filePath.startsWith(objectStorageLocalRoot)) {
        throw new AppError(400, "BAD_REQUEST", "Invalid object storage path");
      }
      if (!existsSync(filePath)) {
        throw new AppError(404, "NOT_FOUND", "Object not found");
      }
      const binary = await readFile(filePath);
      return reply.type(resolveBinaryContentType(filePath, binary)).send(binary);
    }

    // S3/OSS 存储：通过 adapter 代理获取
    if (storageAdapter && objectStorageDriver !== "local") {
      try {
        const binary = await storageAdapter.getObject(objectKey);
        return reply.type(resolveBinaryContentType(objectKey, binary)).send(binary);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch object";
        throw new AppError(404, "NOT_FOUND", `Object not found: ${message}`);
      }
    }

    throw new AppError(404, "NOT_FOUND", "Object storage route is not available");
  });

  const readOpsHealthResponse = () =>
    buildOpsHealthResponse({
      driver: persistenceStatus.driver,
      enabled: persistenceStatus.enabled,
      status: persistenceStatus.status,
      requestedDriver: "postgres",
      readyRequired: persistenceReadyRequired,
      ready: persistenceStatus.enabled && persistenceStatus.status === "ready",
    });

  const isLoopbackDevOpsRequest = (request: FastifyRequest) => {
    if (runtimeConfigNodeEnv === "production") {
      return false;
    }
    const remoteAddress = String(
      request.ip ??
      request.raw.socket.remoteAddress ??
      request.socket?.remoteAddress ??
      "",
    )
      .trim()
      .toLowerCase();
    return (
      remoteAddress === "127.0.0.1" ||
      remoteAddress === "::1" ||
      remoteAddress === "::ffff:127.0.0.1"
    );
  };

  app.get("/health", async () => readOpsHealthResponse());
  // M5 flush 端点已废弃 — PG repos 直接持久化，无需手动 flush
  // 保留端点用于向后兼容（返回健康状态即可）
  app.post("/ops/persistence/flush", async (request) => {
    if (!isLoopbackDevOpsRequest(request)) {
      throw new AppError(403, "FORBIDDEN", "Loopback access required");
    }
    return readOpsHealthResponse();
  });
}
