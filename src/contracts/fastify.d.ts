import "fastify";
import type { AppContext } from "../core/app-context.js";
import type { ErrorLogService } from "../services/error-log/error-log-service.js";
import type { ErrorLogQueue } from "../services/error-log/error-log-queue.js";

declare module "fastify" {
  interface FastifyInstance {
    ctx: AppContext;
    errorLogService: ErrorLogService;
    errorLogQueue: ErrorLogQueue;
  }
}
