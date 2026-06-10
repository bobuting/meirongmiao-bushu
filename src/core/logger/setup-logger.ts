/**
 * Fastify 日志集成
 *
 * 提供 Fastify 框架的日志集成：
 * - Fastify 专用 Pino 日志器（复用 app logger 的文件流，避免重复写入）
 * - TraceId 中间件
 */

import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from "fastify";
import pino from "pino";
import type { Writable } from "stream";
import type { LoggerConfig } from "./types.js";
import { initLoggerSystem, resetLoggerSystem, getLogger, getGlobalStream } from "./modules.js";
import { resolveLoggerConfig } from "./config.js";
import type { AppLogger } from "./logger.js";

/** TraceId 请求头 */
const TRACE_ID_HEADER = "x-trace-id";

/**
 * 创建 Fastify 日志配置
 *
 * 复用 app logger 的输出流，避免两组 DailyRotatingStream 写同一组文件。
 * 仅追加 Fastify 专用的 req/res/err 序列化器。
 *
 * @param config - 日志配置
 * @param sharedStream - app logger 使用的输出流（可选）
 * @returns Fastify logger 配置对象
 */
export function createFastifyLoggerConfig(
  config: LoggerConfig,
  sharedStream?: Writable,
): pino.LoggerOptions & { stream?: Writable } {
  const pinoOption: pino.LoggerOptions = {
    level: config.level,
    serializers: {
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
      err: pino.stdSerializers.err,
    },
  };

  if (sharedStream) {
    return { ...pinoOption, stream: sharedStream };
  }

  return pinoOption;
}

/**
 * 初始化日志系统
 *
 * 创建 Fastify 日志器和应用日志器
 *
 * @param config - 可选的自定义配置
 * @returns fastifyLogger 和 appLogger
 */
export function setupLoggerSystem(config?: LoggerConfig): {
  fastifyLoggerConfig: pino.LoggerOptions & { stream?: Writable };
  appLogger: AppLogger;
} {
  // 重置之前的系统（如果有）
  resetLoggerSystem();

  // 初始化应用日志系统（使用传入配置或环境变量配置）
  const resolvedConfig = config ?? resolveLoggerConfig();
  const appLogger = initLoggerSystem(resolvedConfig);

  // Fastify 日志器复用 app logger 的输出流，避免重复创建文件流
  const sharedStream = getGlobalStream();
  const fastifyLoggerConfig = createFastifyLoggerConfig(resolvedConfig, sharedStream);

  return {
    fastifyLoggerConfig,
    appLogger,
  };
}

/**
 * 创建 TraceId 中间件
 *
 * 功能：
 * - 从请求头获取已存在的 traceId
 * - 无 traceId 时生成新的
 * - 生成 requestId（使用 Fastify 的 request.id）
 * - 注入到 request.log
 * - 响应头返回 x-trace-id
 *
 * @returns Fastify 预处理钩子
 */
export function createTraceIdHook(): (
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
) => void {
  return (request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => {
    // 从请求头获取或生成 traceId
    const traceId = (request.headers[TRACE_ID_HEADER] as string) || generateTraceId();

    // requestId 使用 Fastify 内置的 request.id
    const requestId = request.id;

    // 创建子日志器，注入 traceId 和 requestId
    request.log = request.log.child({
      traceId,
      requestId,
    });

    // 响应头返回 traceId
    reply.header(TRACE_ID_HEADER, traceId);

    done();
  };
}

/**
 * 生成 TraceId
 *
 * 格式：trace-{timestamp}-{random}
 */
function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `trace-${timestamp}-${random}`;
}
