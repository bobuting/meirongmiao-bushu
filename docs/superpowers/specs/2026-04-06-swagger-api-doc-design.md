# Swagger API 文档系统设计

## 1. 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                        app.ts                                │
│  - 仅导入并调用 setupSwagger(app) (2行代码)                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│               Swagger 注册模块 (src/swagger/)                 │
│  - setup-swagger.ts: 注册 @fastify/swagger 插件              │
│  - 定义通用错误响应 schema                                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    路由层 (src/routes/)                       │
│  - 每个路由文件包含 schema 定义                               │
│  - schema 与路由定义放在一起（同文件）                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  Swagger 导出目录 (swagger/)                  │
│  ├── auth.yaml          # 认证模块                           │
│  ├── project-flow.yaml  # 项目流程                           │
│  ├── video-step.yaml    # 视频生成步骤                       │
│  ├── library.yaml       # 素材库                             │
│  ├── admin.yaml         # 管理后台                           │
│  ├── square.yaml        # 公开广场资源                       │
│  ├── video.yaml         # 视频生成相关                       │
│  ├── user.yaml          # 用户信息管理                       │
│  ├── prompt.yaml        # 提示词和主题管理                   │
│  └── static.yaml        # 静态资源服务                       │
└─────────────────────────────────────────────────────────────┘
```

**核心决策：**
- 使用 `@fastify/swagger` + `@fastify/swagger-ui`
- Schema 定义嵌入路由代码（符合 Fastify 最佳实践）
- app.ts 最小改动（仅 2 行：导入 + 调用）
- 模块化导出：按业务模块拆分 YAML 文件，便于版本控制和团队协作

## 2. Swagger 模块划分

基于现有的路由文件结构，划分为以下模块：

| YAML 文件 | 涵盖路由文件 | 说明 |
|-----------|-------------|------|
| `auth.yaml` | auth-routes.ts | 登录、注册、密码修改 |
| `project-flow.yaml` | project-flow-routes.ts, project-flow-crud-routes.ts, project-flow-handlers.ts | 项目核心 CRUD 和流程控制 |
| `video-step.yaml` | step1-outfit/, step2-character/, step3-script/, step4-storyboard/, step5-video/ | 6步工作流的各步骤接口 |
| `library.yaml` | library-routes.ts, library-asset-*.ts | 素材库管理 |
| `admin.yaml` | admin-routes.ts, admin/**/*.ts | 管理后台接口 |
| `square.yaml` | square-routes.ts, square-template-routes.ts | 公开广场资源 |
| `video.yaml` | video-api-routes.ts, video-music-routes.ts, fission-video-routes.ts | 视频生成相关 |
| `user.yaml` | user-routes.ts | 用户信息管理 |
| `prompt.yaml` | prompt-routes.ts, theme-routes.ts | 提示词和主题管理 |
| `static.yaml` | static-routes.ts | 静态资源服务 |

**共计 10 个模块文件。**

## 3. 技术实现细节

### 3.1 依赖安装

```bash
npm install @fastify/swagger @fastify/swagger-ui
```

### 3.2 Swagger 注册模块

新建文件 `src/swagger/setup-swagger.ts`：

```typescript
import type { FastifyInstance } from 'fastify';

export function setupSwagger(app: FastifyInstance): void {
  app.register(require('@fastify/swagger'), {
    openapi: {
      info: {
        title: '内容喵 API',
        version: '1.0.0',
        description: 'AI 电商短视频生成平台 API 文档'
      },
      servers: [
        { url: 'http://localhost:3000', description: '开发环境' },
        { url: 'https://api.neirongmiao.com', description: '生产环境' }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        },
        schemas: {
          Error: {
            type: 'object',
            properties: {
              error: { type: 'string', description: '错误类型' },
              message: { type: 'string', description: '错误信息' },
              statusCode: { type: 'integer', description: 'HTTP 状态码' }
            }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    }
  });

  app.register(require('@fastify/swagger-ui'), {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list' }
  });
}
```

### 3.3 app.ts 改动

仅需 2 行：

```typescript
import { setupSwagger } from './swagger/setup-swagger.js';

// 在 app 初始化后调用
setupSwagger(app);
```

### 3.4 路由 Schema 示例

```typescript
// auth-routes.ts 中的路由定义示例
app.post('/auth/login', {
  schema: {
    tags: ['认证'],
    summary: '用户登录',
    body: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email', description: '用户邮箱' },
        password: { type: 'string', minLength: 6, description: '密码' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'JWT token' },
          user: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string' },
              role: { type: 'string', enum: ['user', 'admin'] }
            }
          }
        }
      },
      401: { $ref: 'Error#' }
    }
  }
}, async (request) => { ... });
```

### 3.5 导出脚本

新建文件 `scripts/export-swagger.ts`：

功能：
- 创建临时 Fastify 实例并注册所有路由
- 调用 `app.swagger()` 获取完整 OpenAPI JSON
- 按 `tags` 字段拆分为多个 YAML 文件
- 写入 `swagger/` 目录

### 3.6 npm 命令

```json
{
  "scripts": {
    "export-swagger": "tsx scripts/export-swagger.ts"
  }
}
```

## 4. Schema 编写策略

### 4.1 自动生成骨架

创建 `scripts/generate-schema-skeleton.ts`：

脚本功能：
- 扫描 `src/routes/` 所有路由文件
- 解析每个 `app.get/post/delete` 调用，提取 URL 和方法
- 分析 TypeScript 类型注释（如 `request.body as { email: string }`）
- 生成基础 schema 骨架（包含 tags、summary 占位符）
- 输出到临时文件供人工完善

### 4.2 人工完善内容

骨架生成后，需人工补充：
- **summary** - 接口简要描述（中文）
- **description** - 详细说明（可选）
- **body properties** - 请求体字段描述、校验规则
- **response properties** - 响应字段描述
- **parameters** - URL 参数、Query 参数描述

### 4.3 Schema 放置位置

推荐内联在路由定义中：修改路由时 schema 就在同一处，便于同步更新。

## 5. 访问控制与安全

### 5.1 Swagger UI 访问权限

| 接口类型 | 访问策略 | 说明 |
|----------|---------|------|
| `/docs` (Swagger UI) | **公开访问** | 开发阶段便于调试 |
| `/docs/json` (OpenAPI JSON) | **公开访问** | 前端团队需要获取规范文件 |

### 5.2 接口认证标记

Schema 中标记接口认证需求：

```typescript
// 需认证的接口
app.get('/projects', {
  schema: {
    security: [{ bearerAuth: [] }],
    ...
  }
}, handler);

// 公开接口
app.get('/health', {
  schema: {
    security: [],
    ...
  }
}, handler);

// 管理员接口
app.get('/admin/users', {
  schema: {
    security: [{ bearerAuth: [] }],
    'x-required-role': 'admin',
    ...
  }
}, handler);
```

## 6. 错误处理与测试

### 6.1 错误响应 Schema

统一使用 `Error` schema（已在 setup-swagger.ts 中定义）：

```typescript
response: {
  400: { $ref: 'Error#' },
  401: { $ref: 'Error#' },
  500: { $ref: 'Error#' }
}
```

### 6.2 测试策略

| 测试类型 | 说明 | 执行时机 |
|---------|------|---------|
| Schema 校验测试 | 启动服务验证所有 schema 定义有效 | 服务启动时自动校验 |
| 导出测试 | 验证 YAML 文件导出成功且内容完整 | `npm run export-swagger` |
| 冒烟测试 | 验证 Swagger UI 页面可访问 | `/docs` 页面手动检查 |

### 6.3 验证命令

```bash
# 启动服务验证 Swagger 注册成功
npm run dev
# 访问 http://localhost:3000/docs 检查 UI

# 导出并检查文件
npm run export-swagger
ls swagger/  # 应看到 10 个 YAML 文件
```

## 7. 实现优先级

建议分阶段实现：

1. **Phase 1** - 基础设施搭建
   - 安装依赖
   - 创建 setup-swagger.ts
   - app.ts 集成
   - 验证 Swagger UI 可访问

2. **Phase 2** - 核心路由 Schema
   - auth-routes.ts（认证模块）
   - project-flow 相关路由（项目流程）
   - 导出脚本实现

3. **Phase 3** - 全量路由 Schema
   - 生成骨架脚本
   - 人工完善所有路由的 schema
   - 完整导出 10 个模块 YAML 文件