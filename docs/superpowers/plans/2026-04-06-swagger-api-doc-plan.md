# Swagger API 文档系统实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为 Fastify 后端项目创建完整的 Swagger API 文档系统，支持 Swagger UI 访问和模块化 YAML 导出。

**架构：** 使用 @fastify/swagger + @fastify/swagger-ui，Schema 定义内联在路由代码中，app.ts 仅需 2 行改动，导出脚本按业务模块拆分 YAML 文件。

**技术栈：** @fastify/swagger, @fastify/swagger-ui, yaml (npm 包)

---

## 文件结构

### 新建文件

| 文件 | 职责 |
|------|------|
| `src/swagger/setup-swagger.ts` | Swagger 插件注册配置，包含 OpenAPI 基础信息和通用错误 Schema |
| `scripts/export-swagger.ts` | 导出 OpenAPI 规范并按 tags 拆分为多个 YAML 文件 |
| `swagger/*.yaml` | 导出的 API 文档文件（10个模块） |

### 修改文件

| 文件 | 职责 |
|------|------|
| `package.json` | 添加依赖和 npm 命令 |
| `src/app.ts` | 导入并调用 setupSwagger（仅2行） |
| `src/routes/auth-routes.ts` | 添加 Schema 定义（作为示例模块） |

---

## 任务列表

---

### 任务 1：安装依赖并更新 package.json

**文件：**
- 修改：`package.json`

- [ ] **步骤 1：安装 Swagger 相关依赖**

```bash
npm install @fastify/swagger @fastify/swagger-ui yaml --cache /tmp/npm-cache
```

预期：安装成功，package.json 中出现新依赖

- [ ] **步骤 2：添加 npm 命令**

在 `package.json` 的 `scripts` 字段中添加：

```json
{
  "scripts": {
    "export-swagger": "tsx scripts/export-swagger.ts"
  }
}
```

- [ ] **步骤 3：验证依赖安装**

```bash
cat package.json | grep -E "@fastify/swagger|yaml"
```

预期：输出包含 `@fastify/swagger`、`@fastify/swagger-ui`、`yaml`

- [ ] **步骤 4：Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(swagger): 添加 swagger 相关依赖"
```

---

### 任务 2：创建 Swagger 注册模块

**文件：**
- 创建：`src/swagger/setup-swagger.ts`

- [ ] **步骤 1：创建 swagger 目录**

```bash
mkdir -p src/swagger
```

- [ ] **步骤 2：编写 setup-swagger.ts**

```typescript
import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';

/**
 * Swagger API 文档配置
 * - 注册 @fastify/swagger 插件，定义 OpenAPI 规范
 * - 注册 @fastify/swagger-ui 插件，提供交互式文档界面
 * - 定义通用错误响应 Schema
 */
export function setupSwagger(app: FastifyInstance): void {
  // 注册 Swagger OpenAPI 规范
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
        schemas: {
          // 通用错误响应 Schema
          Error: {
            type: 'object',
            required: ['error', 'message', 'statusCode'],
            properties: {
              error: {
                type: 'string',
                description: '错误类型标识',
                example: 'UnauthorizedError',
              },
              message: {
                type: 'string',
                description: '错误详细信息',
                example: '无效的认证令牌',
              },
              statusCode: {
                type: 'integer',
                description: 'HTTP 状态码',
                example: 401,
              },
            },
          },
          // 通用用户信息 Schema
          UserInfo: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: '用户唯一标识',
              },
              email: {
                type: 'string',
                format: 'email',
                description: '用户邮箱',
              },
              role: {
                type: 'string',
                enum: ['user', 'admin'],
                description: '用户角色',
              },
            },
          },
        },
      },
      // 全局安全配置（所有接口默认需要认证）
      security: [{ bearerAuth: [] }],
    },
  });

  // 注册 Swagger UI 界面
  app.register(swaggerUI, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
    uiHooks: {
      onRequest: (request, reply, next) => {
        next();
      },
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });
}
```

- [ ] **步骤 3：验证文件创建**

```bash
ls -la src/swagger/
cat src/swagger/setup-swagger.ts | head -5
```

预期：文件存在且内容正确

- [ ] **步骤 4：Commit**

```bash
git add src/swagger/setup-swagger.ts
git commit -m "feat(swagger): 创建 Swagger 注册模块"
```

---

### 任务 3：在 app.ts 中集成 Swagger

**文件：**
- 修改：`src/app.ts:100` (导入位置)
- 修改：`src/app.ts:1158` (路由注册前调用)

- [ ] **步骤 1：添加导入语句**

在 `src/app.ts` 第 100 行附近（其他导入之后）添加：

```typescript
import { setupSwagger } from './swagger/setup-swagger.js';
```

- [ ] **步骤 2：调用 setupSwagger**

在 `src/app.ts` 第 1158 行（`app.register(async (apiApp) => {` 之前）添加：

```typescript
  // --- Swagger API 文档 ---
  setupSwagger(app);
```

- [ ] **步骤 3：验证改动**

```bash
grep -n "setupSwagger" src/app.ts
```

预期：输出显示导入行和调用行

- [ ] **步骤 4：Commit**

```bash
git add src/app.ts
git commit -m "feat(swagger): 在 app.ts 中集成 Swagger"
```

---

### 任务 4：验证 Swagger UI 可访问

**文件：**
- 无文件修改，仅验证

- [ ] **步骤 1：启动后端服务**

```bash
PERSISTENCE_REQUIRE_READY=false npm run dev &
sleep 5
```

- [ ] **步骤 2：访问 Swagger UI 验证**

```bash
curl -s http://localhost:3000/docs | head -20
```

预期：返回 HTML 内容，包含 Swagger UI 页面

- [ ] **步骤 3：验证 OpenAPI JSON**

```bash
curl -s http://localhost:3000/docs/json | head -50
```

预期：返回 JSON，包含 `openapi`、`info`、`title` 等字段

- [ ] **步骤 4：停止服务**

```bash
pkill -f "tsx src/server.ts" || true
```

---

### 任务 5：为 auth-routes.ts 添加 Schema 定义

**文件：**
- 修改：`src/routes/auth-routes.ts`

- [ ] **步骤 1：修改 registerAuthRoutes 函数**

将 `src/routes/auth-routes.ts` 完整替换为：

```typescript
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
            format: "email",
            description: "用户邮箱地址",
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
            format: "email",
            description: "用户邮箱地址",
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
```

- [ ] **步骤 2：验证文件修改**

```bash
cat src/routes/auth-routes.ts | grep -A2 "schema:"
```

预期：输出显示 schema 定义内容

- [ ] **步骤 3：验证 Swagger UI 显示认证模块**

启动服务后访问 http://localhost:3000/docs，预期看到"认证"分组下的 5 个接口。

- [ ] **步骤 4：Commit**

```bash
git add src/routes/auth-routes.ts
git commit -m "feat(swagger): 为 auth-routes 添加 Schema 定义"
```

---

### 任务 6：创建 Swagger 导出脚本

**文件：**
- 创建：`scripts/export-swagger.ts`

- [ ] **步骤 1：创建 scripts 目录（如不存在）**

```bash
mkdir -p scripts swagger
```

- [ ] **步骤 2：编写导出脚本**

```typescript
/**
 * Swagger API 文档导出脚本
 * 
 * 功能：
 * 1. 创建临时 Fastify 实例并注册所有路由
 * 2. 获取完整 OpenAPI JSON 规范
 * 3. 按 tags 字段拆分为多个 YAML 文件
 * 4. 写入 swagger/ 目录
 * 
 * 运行：npm run export-swagger
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'yaml';

// OpenAPI 模块与 tags 的映射关系
const MODULE_TAGS_MAP: Record<string, string[]> = {
  'auth.yaml': ['认证'],
  'project-flow.yaml': ['项目流程'],
  'video-step.yaml': ['视频步骤', 'Step1', 'Step2', 'Step3', 'Step4', 'Step5'],
  'library.yaml': ['素材库', '素材'],
  'admin.yaml': ['管理后台', '管理员', 'admin'],
  'square.yaml': ['广场', '公开资源'],
  'video.yaml': ['视频', '视频生成', '音乐'],
  'user.yaml': ['用户'],
  'prompt.yaml': ['提示词', '主题'],
  'static.yaml': ['静态资源'],
};

/**
 * 从完整 OpenAPI 文档中提取指定 tags 的路径
 */
function extractPathsByTags(
  openapiDoc: any,
  tags: string[]
): Record<string, any> {
  const filteredPaths: Record<string, any> = {};
  
  for (const [path, methods] of Object.entries(openapiDoc.paths || {})) {
    for (const [method, spec] of Object.entries(methods as Record<string, any>)) {
      // 检查该接口的 tags 是否匹配目标 tags
      const pathTags = spec.tags || [];
      const hasMatchingTag = pathTags.some(tag => tags.includes(tag));
      
      if (hasMatchingTag) {
        if (!filteredPaths[path]) {
          filteredPaths[path] = {};
        }
        filteredPaths[path][method] = spec;
      }
    }
  }
  
  return filteredPaths;
}

/**
 * 创建模块化的 OpenAPI 文档
 */
function createModuleDoc(
  fullDoc: any,
  paths: Record<string, any>,
  moduleTitle: string
): any {
  return {
    openapi: fullDoc.openapi,
    info: {
      title: `内容喵 API - ${moduleTitle}`,
      version: fullDoc.info.version,
      description: `${moduleTitle}模块接口文档`,
    },
    servers: fullDoc.servers,
    components: {
      securitySchemes: fullDoc.components?.securitySchemes,
      schemas: fullDoc.components?.schemas,
    },
    security: fullDoc.security,
    paths,
  };
}

/**
 * 主函数：导出 Swagger 文档
 */
async function exportSwagger(): Promise<void> {
  console.log('开始导出 Swagger API 文档...\n');
  
  // 读取已有的 OpenAPI JSON（需要服务已启动并访问 /docs/json）
  // 这里简化处理：从文件读取或直接使用 swagger() 方法
  
  // 由于需要完整的服务实例，这里采用替代方案：
  // 直接调用服务的 /docs/json 接口获取规范
  
  const docsJsonUrl = process.env.SWAGGER_JSON_URL || 'http://localhost:3000/docs/json';
  
  console.log(`从 ${docsJsonUrl} 获取 OpenAPI 规范...`);
  
  try {
    const response = await fetch(docsJsonUrl);
    if (!response.ok) {
      throw new Error(`获取 OpenAPI JSON 失败: ${response.status} ${response.statusText}`);
    }
    
    const openapiDoc = await response.json();
    console.log(`获取成功，包含 ${Object.keys(openapiDoc.paths || {}).length} 个接口\n`);
    
    // 确保 swagger 目录存在
    const swaggerDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'swagger');
    if (!existsSync(swaggerDir)) {
      mkdirSync(swaggerDir, { recursive: true });
    }
    
    // 导出完整文档
    const fullYaml = yaml.stringify(openapiDoc);
    writeFileSync(join(swaggerDir, 'openapi.yaml'), fullYaml, 'utf-8');
    console.log('✓ 已导出完整文档: swagger/openapi.yaml');
    
    // 按模块拆分导出
    for (const [filename, tags] of Object.entries(MODULE_TAGS_MAP)) {
      const modulePaths = extractPathsByTags(openapiDoc, tags);
      
      if (Object.keys(modulePaths).length === 0) {
        console.log(`⊗ ${filename}: 无匹配接口（跳过）`);
        continue;
      }
      
      // 从文件名提取模块标题
      const moduleTitle = filename.replace('.yaml', '').replace('-', ' ');
      const moduleDoc = createModuleDoc(openapiDoc, modulePaths, moduleTitle);
      
      const moduleYaml = yaml.stringify(moduleDoc);
      writeFileSync(join(swaggerDir, filename), moduleYaml, 'utf-8');
      console.log(`✓ 已导出模块文档: swagger/${filename} (${Object.keys(modulePaths).length} 个接口)`);
    }
    
    console.log('\n导出完成！');
    console.log('提示: 请确保服务已启动 (npm run dev)，否则无法获取 OpenAPI 规范');
    
  } catch (error) {
    console.error('导出失败:', error);
    console.log('\n请先启动服务:');
    console.log('  PERSISTENCE_REQUIRE_READY=false npm run dev');
    console.log('然后运行:');
    console.log('  npm run export-swagger');
    process.exit(1);
  }
}

// 执行导出
exportSwagger();
```

- [ ] **步骤 3：验证脚本创建**

```bash
ls -la scripts/export-swagger.ts
```

预期：文件存在

- [ ] **步骤 4：Commit**

```bash
git add scripts/export-swagger.ts
git commit -m "feat(swagger): 创建 Swagger 导出脚本"
```

---

### 任务 7：测试 Swagger 导出功能

**文件：**
- 无文件修改，仅验证

- [ ] **步骤 1：启动后端服务**

```bash
PERSISTENCE_REQUIRE_READY=false npm run dev &
sleep 5
```

- [ ] **步骤 2：运行导出脚本**

```bash
npm run export-swagger
```

预期：输出显示导出成功，`swagger/` 目录下有 YAML 文件

- [ ] **步骤 3：检查导出文件**

```bash
ls -la swagger/
cat swagger/auth.yaml | head -30
```

预期：显示 auth.yaml 内容，包含认证模块接口

- [ ] **步骤 4：停止服务并清理**

```bash
pkill -f "tsx src/server.ts" || true
```

---

### 任务 8：创建 swagger 目录的 .gitignore（可选）

**文件：**
- 创建或修改：`.gitignore` 或 `swagger/.gitignore`

- [ ] **步骤 1：决定是否提交 swagger 文件到 git**

**方案 A：提交到 git（推荐）** - 便于版本控制和团队协作
```bash
# 不添加 gitignore，直接 commit swagger 文件
```

**方案 B：不提交到 git** - 仅作为临时输出
```bash
echo "swagger/*.yaml" >> .gitignore
```

用户选择：根据实际需求决定（建议选择方案 A）

- [ ] **步骤 2：Commit（如果选择方案 A）**

```bash
git add swagger/
git commit -m "docs: 添加 Swagger API 文档导出文件"
```

---

## 总结

完成以上任务后，项目将具备：

1. ✅ Swagger UI 可访问（`/docs`）
2. ✅ 认证模块（auth-routes）已有完整 Schema 定义
3. ✅ 导出脚本可按模块拆分 YAML 文件
4. ✅ app.ts 改动最小（仅 2 行）

**后续扩展建议：**

Phase 3（全量路由 Schema）建议按以下顺序逐步添加：
- project-flow 路由（项目核心流程）
- library 路由（素材库）
- user 路由（用户管理）
- 其他路由模块...

每个模块添加 Schema 后，运行 `npm run export-swagger` 更新文档。