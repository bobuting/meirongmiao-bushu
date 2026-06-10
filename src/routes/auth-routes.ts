import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { requireUser } from "../services/auth/route-guards.js";

/**
 * 认证相关路由
 * - 用户注册、登录、密码修改
 * - 抖音登录状态检查
 */
export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext): void {
  // 用户注册接口
  app.post("/auth/register", {
    schema: {
      tags: ["认证"],
      summary: "用户注册",
      description: "创建新用户账号，默认角色为 user，仅管理员可创建 admin 角色",
      security: [], // 公开接口，无需认证
      body: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: {
            type: "string",
            minLength: 1,
            description: "用户邮箱或用户名",
            example: "user@example.com",
          },
          password: {
            type: "string",
            minLength: 6,
            description: "用户密码，最少6位",
            example: "password123",
          },
          role: {
            type: "string",
            enum: ["user", "admin"],
            description: "用户角色（可选，默认为 user，admin 需特殊权限）",
          },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            user: { $ref: "UserInfo#" },
          },
        },
        400: { $ref: "Error#" },
        409: {
          type: "object",
          description: "邮箱已存在",
          properties: {
            error: { type: "string", example: "ConflictError" },
            message: { type: "string", example: "该邮箱已被注册" },
            statusCode: { type: "integer", example: 409 },
          },
        },
      },
    },
  }, async (request) => {
    const body = request.body as { email: string; password: string; role?: string };
    const role = (body.role === "admin" ? "admin" : "user") as "user" | "admin";
    const user = await ctx.authService.register(body.email, body.password, role);
    return { user: { id: user.id, email: user.email, role: user.role } };
  });

  // 用户登录接口
  app.post("/auth/login", {
    schema: {
      tags: ["认证"],
      summary: "用户登录",
      description: "使用邮箱和密码登录，返回 JWT token 和用户信息",
      security: [], // 公开接口，无需认证
      body: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: {
            type: "string",
            minLength: 1,
            description: "用户邮箱或用户名",
            example: "user@example.com",
          },
          password: {
            type: "string",
            minLength: 6,
            description: "用户密码",
            example: "password123",
          },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            token: {
              type: "string",
              description: "JWT 认证令牌",
              example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            },
            user: { $ref: "UserInfo#" },
          },
        },
        401: {
          type: "object",
          description: "认证失败",
          properties: {
            error: { type: "string", example: "UnauthorizedError" },
            message: { type: "string", example: "邮箱或密码错误" },
            statusCode: { type: "integer", example: 401 },
          },
        },
      },
    },
  }, async (request) => {
    const body = request.body as { email: string; password: string };
    const { token, user } = await ctx.authService.login(body.email, body.password);
    return { token, user: { id: user.id, email: user.email, role: user.role } };
  });

  // 忘记密码占位接口
  app.get("/auth/forgot-password", {
    schema: {
      tags: ["认证"],
      summary: "忘记密码",
      description: "忘记密码功能占位接口（暂未实现）",
      security: [],
      response: {
        200: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "提示信息",
              example: "请联系管理员重置密码",
            },
          },
        },
      },
    },
  }, async () => ctx.authService.forgotPasswordPlaceholder());

  // 抖音登录状态检查
  app.get("/auth/douyin/status", {
    schema: {
      tags: ["认证"],
      summary: "抖音登录状态",
      description: "检查抖音 OAuth 登录配置是否完整",
      security: [], // 公开接口
      response: {
        200: {
          type: "object",
          properties: {
            ready: {
              type: "boolean",
              description: "抖音登录是否已配置完成",
              example: true,
            },
            missing: {
              type: "array",
              items: { type: "string" },
              description: "缺失的配置项",
              example: [],
            },
            configured: {
              type: "object",
              properties: {
                appId: { type: "boolean" },
                appSecret: { type: "boolean" },
                redirectUri: { type: "boolean" },
              },
              description: "各配置项是否已设置",
            },
          },
        },
      },
    },
  }, async () => {
    const requiredKeys = ["DOUYIN_APP_ID", "DOUYIN_APP_SECRET", "DOUYIN_REDIRECT_URI"] as const;
    const missing = requiredKeys.filter((key) => !(process.env[key]?.trim()));
    return {
      ready: missing.length === 0,
      missing,
      configured: {
        appId: Boolean(process.env.DOUYIN_APP_ID?.trim()),
        appSecret: Boolean(process.env.DOUYIN_APP_SECRET?.trim()),
        redirectUri: Boolean(process.env.DOUYIN_REDIRECT_URI?.trim()),
      },
    };
  });

  // 用户登出接口
  app.post("/auth/logout", {
    schema: {
      tags: ["认证"],
      summary: "用户登出",
      description: "销毁当前用户的会话 token，使其失效",
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "成功信息",
              example: "已退出登录",
            },
          },
        },
        401: { $ref: "Error#" },
      },
    },
  }, async (request) => {
    const user = await requireUser(ctx, request);
    const token = (request.headers.authorization ?? "").replace("Bearer ", "");
    await ctx.authService.logout(token);
    return { message: "已退出登录" };
  });

  // 修改密码接口
  app.post("/me/password", {
    schema: {
      tags: ["认证"],
      summary: "修改密码",
      description: "用户修改自己的密码，需要提供当前密码和新密码",
      security: [{ bearerAuth: [] }], // 需认证
      body: {
        type: "object",
        required: ["currentPassword", "nextPassword"],
        properties: {
          currentPassword: {
            type: "string",
            minLength: 6,
            description: "当前密码",
          },
          nextPassword: {
            type: "string",
            minLength: 6,
            description: "新密码",
          },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "成功信息",
              example: "密码已更新",
            },
          },
        },
        401: { $ref: "Error#" },
        400: {
          type: "object",
          description: "密码验证失败",
          properties: {
            error: { type: "string", example: "ValidationError" },
            message: { type: "string", example: "当前密码不正确" },
            statusCode: { type: "integer", example: 400 },
          },
        },
      },
    },
  }, async (request) => {
    const user = await requireUser(ctx, request);
    const body = request.body as { currentPassword: string; nextPassword: string };
    return await ctx.authService.changePassword(user, body.currentPassword, body.nextPassword);
  });
}