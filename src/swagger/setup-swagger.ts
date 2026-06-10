import type { FastifyInstance, FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';

// 共享 Schema 定义（用于 OpenAPI 文档和 Fastify 序列化）
const SHARED_SCHEMAS = {
  // 通用错误响应 Schema
  Error: {
    type: 'object' as const,
    required: ['error', 'message', 'statusCode'],
    properties: {
      error: {
        type: 'string' as const,
        description: '错误类型标识',
        example: 'UnauthorizedError',
      },
      message: {
        type: 'string' as const,
        description: '错误详细信息',
        example: '无效的认证令牌',
      },
      statusCode: {
        type: 'integer' as const,
        description: 'HTTP 状态码',
        example: 401,
      },
    },
  },
  // 通用用户信息 Schema
  UserInfo: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string' as const,
        description: '用户唯一标识',
      },
      email: {
        type: 'string' as const,
        format: 'email',
        description: '用户邮箱',
      },
      role: {
        type: 'string' as const,
        enum: ['user', 'admin'] as const,
        description: '用户角色',
      },
    },
  },
};

/**
 * Swagger API 文档配置
 * - 注册 @fastify/swagger 插件，定义 OpenAPI 规范
 * - 注册 @fastify/swagger-ui 插件，提供交互式文档界面
 * - 注册共享 Schema 到 Fastify（用于 $ref 引用）
 */
export function setupSwagger(app: FastifyInstance): void {
  // 注册共享 Schema 到 Fastify（用于序列化 $ref 引用）
  for (const [id, schema] of Object.entries(SHARED_SCHEMAS)) {
    app.addSchema({ $id: id, ...schema });
  }

  // 注册 Swagger OpenAPI 规范
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.register(swagger, {
    openapi: {
      info: {
        title: '内容喵 API',
        version: '1.0.0',
        description: 'AI 电商短视频生成平台 API 文档',
      },
      servers: [
        { url: 'http://localhost:3000', description: '开发环境' },
        { url: 'https://api.neirongmiao.com', description: '生产环境' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT Bearer Token 认证',
          },
        },
        schemas: SHARED_SCHEMAS as any,
      },
      // 全局安全配置（所有接口默认需要认证）
      security: [{ bearerAuth: [] }],
    },
  } as any);

  // 注册 Swagger UI 界面
  app.register(swaggerUI, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
    uiHooks: {
      onRequest: (
        _request: FastifyRequest,
        _reply: FastifyReply,
        next: HookHandlerDoneFunction,
      ) => {
        next();
      },
    },
    staticCSP: true,
    transformStaticCSP: (header: string) => header,
  });
}