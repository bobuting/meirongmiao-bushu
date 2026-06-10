# 企业级项目优化设计

## 概述

对项目进行全面的企业级优化，涵盖代码质量、数据库规范、架构重构三个维度，以及前后端布局规划。

## 背景

### 当前项目状态

| 维度 | 状态 | 主要问题 |
|------|------|----------|
| **代码质量** | 部分改进 | 文件大小门禁脚本缺失、静默降级存在、类型定义不完整 |
| **数据库规范** | 有设计文档 | `globalThis.__postgresPool` 仍存在（6个文件）、独立 Pool 创建（12个文件）、静默降级（3处） |
| **架构重构** | 已有进度 | app.ts 已拆分到 app-setup（264行）、但 routes/modules 边界仍不清晰 |
| **前后端布局** | 现有结构 | 后端 `src/`、前端 `apps/web/pages/`（70+组件）、前端直接依赖后端包 |

### 已完成的改进

- app.ts 拆分为多个 setup 模块（`src/app-setup/`）
- Repository 模式部分落地（`src/repositories/`）
- Swagger API 文档集成
- 测试覆盖率门禁脚本（部分缺失）
- 多个设计文档已编写

### 驱动因素

- 团队扩张：代码需要更易理解和维护
- 技术债务积累：维护成本上升
- 性能/稳定性问题：N+1 查询等问题
- 合规/规范要求：满足企业级标准

## 目标与优先级

### 优化优先级（用户确认）

1. **代码质量**（最高）
2. **数据库规范**
3. **架构重构**

### 各维度目标

| 维度 | 目标 |
|------|------|
| **代码质量** | 文件大小门禁可用、无静默降级、类型安全 |
| **数据库规范** | 无 globalThis 访问、无独立 Pool 创建、Repository 模式完整 |
| **架构重构** | 分层清晰、模块边界明确、依赖注入规范 |
| **前后端布局** | 共享层分离、前端按业务模块组织 |

## 分阶段方案

### 总体策略：渐进式改进

延续现有进度，按优先级逐步推进，每个阶段独立验收。

---

### Phase 1：代码质量（最高优先级）

#### 任务清单

| 任务 | 说明 | 改动范围 |
|------|------|---------|
| 修复文件大小门禁脚本 | `scripts/enforce_file_size_gate.mjs` 缺失，需恢复或重建 | 1 个文件 |
| 补充类型定义 | 移除 `any` 类型，补充缺失的接口定义 | 5-10 个文件 |
| 清理静默降级 | 移除 `if (!pool) return []` 等静默降级逻辑 | 3 处 |
| 错误处理规范化 | 所有 DB 操作失败抛出 AppError，不静默返回 | 5-8 个文件 |

#### 验收标准

```bash
# 文件大小门禁可运行
npm run audit:file-size:gate

# 无静默降级（grep 无结果）
grep -r "if (!pool) return" src/
grep -r "if (!pool) return \[\]" src/

# 类型检查通过
npm run build
```

---

### Phase 2：数据库规范

#### 任务清单（基于已有设计文档）

详见 `docs/superpowers/specs/2026-04-06-database-call-normalization-design.md`

| 任务 | 说明 | 改动范围 |
|------|------|---------|
| 新建 Repository | PgUserScriptAssocRepository、PgScriptDataRepository、PgTrendRepository | 3 个新建 |
| 注册到 repos | 在 `src/repositories/pg/index.ts` 注册 | 1 个修改 |
| 改造 library-routes.ts | 7处 `globalThis.__postgresPool` → `ctx.repos` | 1 个修改 |
| 改造其他路由 | 移除独立 Pool 创建 | 6 个修改 |
| 改造 video-step 模块 | pool → ctx.repos | 3 个修改 |
| 清理 globalThis | 移除 `globalThis.__postgresPool` 赋值 | 2 个修改 + 1 个删除 |

#### 验收标准

```bash
# 无 globalThis 访问
grep -r "globalThis.__postgresPool" src/

# 无独立 Pool 创建（仅 startup-pg-pool.ts 和测试）
grep -r "new Pool" src/ | grep -v "startup-pg-pool" | grep -v "test"

# 集成测试通过
npm run test:integration
```

---

### Phase 3：架构重构

#### 任务清单

| 任务 | 说明 | 改动范围 |
|------|------|---------|
| 继续拆分 app-setup | 将 setup 模块进一步细化，职责单一化 | 10-15 个文件 |
| 完善 routes 模块边界 | routes 按业务域分组，减少跨模块依赖 | 20+ 个文件 |
| domain 层分离 | 抽取纯业务逻辑到 `src/domain/`，无 DB 依赖 | 新建目录 |
| 依赖注入规范化 | 所有服务通过 AppContext 获取，无直接创建 | 15-20 个文件 |

#### 目标架构

```
src/
├── core/           # 核心基础设施（AppContext、错误处理、安全）
├── domain/         # 业务领域（纯业务逻辑，无 DB 依赖）
├── repositories/   # 数据访问层（Repository 模式，单一表职责）
├── services/       # 服务层（协调 domain + repositories）
├── routes/         # HTTP 路由（按业务域分组）
│   ├── project/    # 项目相关路由
│   ├── admin/      # 管理后台路由
│   ├── library/    # 资产库路由
│   └── ...
├── contracts/      # 类型契约（精简合并）
└── app-setup/      # 应用启动配置
```

---

### Phase 4：前后端布局（可选，后续执行）

#### 方案 B：保持现有结构 + 内部优化

```
project-root/
├── src/                        # 后端（保持现状）
│   ├── contracts/              # 类型契约（精简合并）
│   ├── routes/
│   ├── modules/
│   ├── repositories/
│   └── ...
│
├── apps/web/                   # 前端（保持现状）
│   ├── pages/                  # 按业务模块重新组织
│   │   ├── project-flow/       # 项目流程（step1-6）
│   │   ├── admin/              # 管理后台
│   │   ├── assets/             # 资产管理
│   │   └── auth/               # 认证
│   │   └── square/             # 广场/发布
│   │   └── review/             # 审核
│   ├── components/             # 提取共享组件
│   ├── hooks/                  # React Hooks 集中管理
│   ├── stores/                 # Zustand 状态集中管理
│   └── services/               # API 封装
│
├── shared/                     # 新增：前后端共享
│   ├── types/                  # 共享类型（从 contracts 精简）
│   └── constants/              # 共享常量
│
└── ...
```

#### 前端重组任务

| 任务 | 说明 |
|------|------|
| 创建 `shared/` 目录 | 抽取前后端共享类型和常量 |
| 前端 pages 按模块分组 | 整理 70+ 页面组件到业务模块目录 |
| 提取共享组件 | 从各页面抽取通用组件到 `components/` |
| API 封装规范化 | `services/` 按业务域组织 API 调用 |

---

## 参考文档

### 已有设计文档

- `docs/superpowers/specs/2026-04-06-database-call-normalization-design.md` - 数据库调用规范化
- `docs/superpowers/specs/2026-04-06-database-soft-delete-design.md` - 数据库软删除
- `docs/superpowers/specs/2026-04-06-app-ts-refactor-design.md` - app.ts 重构
- `docs/superpowers/specs/2026-04-06-backendApi-split-design.md` - 后端 API 分离
- `docs/superpowers/specs/2026-04-04-dependency-injection-refactor-design.md` - 依赖注入重构

### 项目规范

- `CLAUDE.md` - 项目开发规范（错误处理、文件约束、禁止事项）

---

## 成功标准

### Phase 1 完成标志

- 文件大小门禁脚本可用
- TypeScript 编译无 `any` 类型警告
- 无静默降级代码

### Phase 2 完成标志

- `grep globalThis.__postgresPool` 返回空
- Repository 模式覆盖所有数据访问
- 集成测试全部通过

### Phase 3 完成标志

- 分层架构清晰（core/domain/repositories/services/routes）
- 模块边界明确，无跨层直接依赖
- 依赖注入规范，无直接创建服务

---

## 执行建议

1. **Phase 1 可立即开始**：改动小，风险低
2. **Phase 2 需参考已有设计文档**：执行 `2026-04-06-database-call-normalization-design.md`
3. **Phase 3 需要更多设计**：架构重构涉及面广，建议先补充设计文档
4. **Phase 4 作为后续规划**：前后端布局优化可在 Phase 1-3 完成后执行