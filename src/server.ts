// 必须在所有 import 之前加载环境变量
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// 然后才 import 其他模块
import { buildApp } from "./app.js";
import { resolveRuntimeConfig } from "./core/runtime-config.js";
import { registerGracefulShutdownHandlers } from "./server-graceful-shutdown.js";
import { AppError } from "./core/errors.js";
import { getLogger } from "./core/logger/index.js";

const log = getLogger("server");

// 全局捕获未处理的错误，防止 pg 连接中断导致进程崩溃
process.on("uncaughtException", async (err) => {
  // 仅处理 pg 连接相关错误，其他错误仍需正常退出
  if (err.message.includes("Connection terminated") || err.message.includes("ECONNRESET")) {
    log.error({ err }, "[Server] Database connection error (已捕获，进程继续运行)");
    return;
  }
  // AppError 是业务错误（如 401/403），不应崩溃进程
  if (err instanceof AppError) {
    log.error({ err }, "[Server] Uncaught AppError (已降级为日志)");
    return;
  }
  // 其他未处理错误仍需退出
  log.error({ err }, "[Server] Uncaught exception (进程将退出)");
  process.exit(1);
});

// 全局捕获未处理的 Promise 拒绝
process.on("unhandledRejection", async (reason, promise) => {
  // AppError 是业务错误（如 401/403），不应崩溃进程
  if (reason instanceof AppError) {
    log.error({ reason }, "[Server] Unhandled AppError rejection (已降级为日志)");
    return;
  }
  // 打印完整的错误信息，包括堆栈
  const errorInfo = reason instanceof Error
    ? { message: reason.message, stack: reason.stack, name: reason.name }
    : { reason };
  log.error(errorInfo, "[Server] Unhandled rejection");
  process.exit(1);
});

async function main() {
  const app = await buildApp();
  const runtimeConfig = resolveRuntimeConfig(process.env);
  const port = runtimeConfig.server.port;
  const host = runtimeConfig.server.host;

  // 注册优雅关闭处理器，包含 flush 逻辑
  registerGracefulShutdownHandlers({
    close: async () => {
      // 先 flush 错误日志队列
      if (app.errorLogService) {
        try {
          await app.errorLogService.flush();
        } catch (flushError) {
          log.error({ flushError }, "[Server] Error log flush failed");
        }
      }
      await app.close();
    },
    log: app.log,
  });

  app
    .listen({ port, host })
    .then(() => {
      app.log.info(`Server started at http://localhost:${port}`);
      app.log.info(`Bound host: ${host}`);
      app.log.info("Health check: /health");
    })
    .catch((error) => {
      app.log.error(error);
      process.exit(1);
    });
}

main();
