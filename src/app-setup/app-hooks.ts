/**
 * 应用运行时 hooks 模块
 *
 * 负责 Fastify 的运行时 hooks：
 * - setErrorHandler：统一错误处理
 * - onRequest：CORS 处理
 */

import type { FastifyInstance } from "fastify";
import { AppError } from "../core/errors.js";

// ---------------------------------------------------------------------------
// 常量配置
// ---------------------------------------------------------------------------

/** 参数截断上限（字符） */
const INPUT_PARAMS_MAX_LENGTH = 2000;

/** 需要加密处理的敏感字段 */
const SENSITIVE_FIELDS = [
  "password",
  "newPassword",
  "oldPassword",
  "confirmPassword",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "secret",
  "apiKey",
  "credential",
];

/** 需要忽略的静态资源路径前缀 */
const STATIC_PATH_PREFIXES = [
  "/storage/objects/",
  "/static/",
  "/assets/",
  "/public/",
];

/** 不记录的错误码（业务预期行为，非系统错误） */
const SKIP_LOG_ERROR_CODES = ["UNAUTHORIZED", "FORBIDDEN"];

/** 不记录的 API 路径模式（客户端自动请求或静态资源） */
const SKIP_LOG_API_PATHS: RegExp[] = [
  /^GET \/\.well-known/, // Chrome DevTools 自动请求
  /^GET \/images\//, // 前端静态图片
  /^GET \/assets\//, // 前端编译资源（CSS/JS/字体）
  /^GET \/storage\/objects\//, // 存储资源请求
];

/** 提取纯净 URL path（去除 query string） */
function extractPurePath(url: string): string {
  return url.split("?")[0];
}

/** 判断是否应该记录错误日志 */
function shouldLogError(errorCode: string, apiPath: string): boolean {
  // 过滤噪音错误码
  if (SKIP_LOG_ERROR_CODES.includes(errorCode)) {
    return false;
  }
  // 提取纯净路径再匹配（去除 query string）
  const purePath = extractPurePath(apiPath);
  if (SKIP_LOG_API_PATHS.some((pattern) => pattern.test(purePath))) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/**
 * 将 ajv 验证错误消息翻译为中文
 */
function translateAjvError(message: string, dataPath?: string): string {
  if (!message) return "请求参数校验失败";

  // 提取字段名（从 dataPath 或 message 中）
  const field = dataPath?.replace(/^\./, "") || "参数";

  // minLength 校验
  if (message.includes("must NOT have fewer than")) {
    const match = message.match(/fewer than (\d+)/);
    const min = match ? match[1] : "";
    if (field.includes("password")) {
      return `密码长度不足，至少需要 ${min} 个字符`;
    }
    return `${field} 长度不足，至少需要 ${min} 个字符`;
  }

  // maxLength 校验
  if (message.includes("must NOT have more than")) {
    const match = message.match(/more than (\d+)/);
    const max = match ? match[1] : "";
    return `${field} 长度超出限制，最多 ${max} 个字符`;
  }

  // required 校验
  if (message.includes("must have required property")) {
    const match = message.match(/property '(.+?)'/);
    const requiredField = match ? match[1] : field;
    return `缺少必填字段：${requiredField}`;
  }

  // type 校验
  if (message.includes("must be")) {
    if (message.includes("string")) return `${field} 必须是字符串类型`;
    if (message.includes("number")) return `${field} 必须是数字类型`;
    if (message.includes("boolean")) return `${field} 必须是布尔类型`;
    if (message.includes("array")) return `${field} 必须是数组类型`;
    if (message.includes("object")) return `${field} 必须是对象类型`;
    if (message.includes("integer")) return `${field} 必须是整数类型`;
  }

  // enum 校验
  if (message.includes("must be equal to one of")) {
    return `${field} 必须是可选值之一`;
  }

  // pattern 校验
  if (message.includes("must match pattern")) {
    return `${field} 格式不正确`;
  }

  // format 校验
  if (message.includes("must match format")) {
    if (message.includes("email") || message.includes("用户名")) return "用户名格式不正确";
    if (message.includes("uri") || message.includes("url")) return "URL 格式不正确";
    if (message.includes("date")) return "日期格式不正确";
    return `${field} 格式不正确`;
  }

  // const 校验
  if (message.includes("must be equal to constant")) {
    return `${field} 必须是指定的固定值`;
  }

  // 兜底：保留原始消息（大部分情况下 ajv 消息可读性尚可）
  return message;
}

/** 判断是否为静态资源请求 */
function isStaticResourceRequest(url: string): boolean {
  return STATIC_PATH_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/** 加密敏感字段 */
function sanitizeInputParams(params: unknown): Record<string, unknown> | null {
  if (!params || typeof params !== "object") return null;

  const result: Record<string, unknown> = {};
  const obj = params as Record<string, unknown>;

  for (const [key, value] of Object.entries(obj)) {
    // 敏感字段加密
    if (SENSITIVE_FIELDS.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
      result[key] = "***";
    } else if (value !== null && value !== undefined) {
      // 保留有效值
      result[key] = value;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/** 截断参数字符串 */
function truncateParams(paramsJson: string, maxLength: number): string {
  if (paramsJson.length <= maxLength) return paramsJson;
  return paramsJson.slice(0, maxLength) + "...[截断]";
}

/** 构建输入参数记录 */
function buildInputParams(request: { body?: unknown; query?: unknown; url: string }): Record<string, unknown> | undefined {
  // 静态资源请求不记录参数
  if (isStaticResourceRequest(request.url)) return undefined;

  const sanitizedBody = sanitizeInputParams(request.body);
  const sanitizedQuery = sanitizeInputParams(request.query);

  // 合并 body 和 query
  const merged: Record<string, unknown> = {};
  if (sanitizedQuery) {
    merged.query = sanitizedQuery;
  }
  if (sanitizedBody) {
    merged.body = sanitizedBody;
  }

  // 无参数则返回 undefined
  if (Object.keys(merged).length === 0) return undefined;

  // 截断处理
  const jsonStr = JSON.stringify(merged);
  const truncated = truncateParams(jsonStr, INPUT_PARAMS_MAX_LENGTH);

  // 如果截断后还是 JSON 格式，直接返回对象；否则返回截断字符串
  try {
    return JSON.parse(truncated);
  } catch {
    return { _raw: truncated };
  }
}

// ---------------------------------------------------------------------------
// 主函数
// ---------------------------------------------------------------------------

/**
 * 注册应用错误处理器
 *
 * 统一处理 AppError 和 Fastify 内置错误，返回标准化的错误响应。
 * 同时集成错误日志服务，记录所有未处理的错误。
 */
export function registerAppErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(async (error, request, reply) => {
    // 记录错误到日志系统（仅记录 Error 实例，且过滤噪音错误）
    if (app.errorLogService && error instanceof Error) {
      const errorCode = error instanceof AppError ? error.code : "INTERNAL_ERROR";
      const apiPath = `${request.method} ${request.url}`;

      // 过滤噪音错误：UNAUTHORIZED/FORBIDDEN/静态资源请求等
      if (shouldLogError(errorCode, apiPath)) {
        // 构建输入参数（自动截断、加密敏感字段、忽略静态资源）
        const inputParams = buildInputParams({
          body: request.body,
          query: request.query,
          url: request.url,
        });

        app.errorLogService.log(error, {
          userId: (request as { user?: { id?: string } }).user?.id,
          requestId: request.id,
          apiPath,
          sourceModule: "fastify-error-handler",
          inputParams,
        });
      }
    }

    // 处理 AppError
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
      });
    }

    // 处理 Fastify Schema 验证错误（ajv 生成的英文消息翻译为中文）
    const validationError = error as { validation?: Array<{ dataPath?: string; message?: string }>; validationContext?: string };
    if (validationError.validation && Array.isArray(validationError.validation)) {
      const firstError = validationError.validation[0];
      const rawMessage = firstError?.message ?? "";
      const translatedMessage = translateAjvError(rawMessage, firstError?.dataPath);
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: translatedMessage,
      });
    }

    // 处理 Fastify 内置错误
    const fastifyStatusCode = (error as { statusCode?: unknown }).statusCode;
    const fastifyCode = (error as { code?: unknown }).code;
    if (typeof fastifyStatusCode === "number" && fastifyStatusCode >= 400 && fastifyStatusCode < 600) {
      const normalizedCode =
        typeof fastifyCode === "string" && fastifyCode.trim().length > 0 ? fastifyCode : "REQUEST_ERROR";
      const rawMessage = (error as { message?: unknown }).message;
      const normalizedMessage =
        normalizedCode === "FST_ERR_CTP_BODY_TOO_LARGE"
          ? "请求体过大：请压缩图片后重试（建议单张不超过 8MB）。"
          : (typeof rawMessage === "string" && rawMessage.trim().length > 0 ? rawMessage : "Request failed");
      return reply.status(fastifyStatusCode).send({
        code: normalizedCode,
        message: normalizedMessage,
      });
    }

    // 处理未知错误
    app.log.error(error);
    return reply.status(500).send({
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    });
  });
}

/**
 * 注册 CORS onRequest hook
 *
 * 为开发环境（localhost、局域网 IP）自动添加 CORS headers。
 */
export function registerCorsHook(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    const requestOrigin = String(request.headers.origin ?? "");
    // 开发环境 origin 匹配：localhost、127.x、局域网 IP、Chrome 扩展
    const isDevOrigin =
      /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/i.test(
        requestOrigin,
      ) || /^chrome-extension:\/\/[a-z]+$/i.test(requestOrigin);
    if (isDevOrigin) {
      reply.header("Access-Control-Allow-Origin", requestOrigin);
      reply.header("Vary", "Origin");
      reply.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
      reply.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    }
    // 处理 OPTIONS 预检请求
    if (request.method === "OPTIONS") {
      return reply.status(204).send();
    }
    return undefined;
  });
}

/**
 * 注册所有运行时 hooks
 *
 * 统一入口，一次性注册错误处理器和 CORS hook。
 */
export function registerAppRuntimeHooks(app: FastifyInstance): void {
  registerAppErrorHandler(app);
  registerCorsHook(app);
}