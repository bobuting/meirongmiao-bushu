# 项目安全分析报告：neirongmiao（AI 电商短视频平台）

> 分析日期：2026-04-29
> 分析范围：代码层面、数据库层面、业务层面

---

## 一、代码层面

### 1.1 [HIGH] 密码使用无盐 SHA256 哈希

**文件：** `src/core/security.ts:3-8`

```ts
export function hashPassword(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
```

SHA256 是快速通用哈希，无盐意味着相同密码产生相同哈希，彩虹表可秒破。现代 GPU 每秒可计算数十亿次 SHA256。

**修复：** 替换为 bcrypt（cost≥12）或 argon2id。

---

### 1.2 [HIGH] 任何人可注册为管理员

**文件：** `src/routes/auth-routes.ts:62`

```ts
const role = (body.role === "admin" ? "admin" : "user") as "user" | "admin";
```

Swagger 描述写"仅管理员可创建 admin 角色"，但代码中无任何权限校验。未认证用户直接 POST `/auth/register` 带 `role: "admin"` 即可获得管理员权限，进而访问 `/admin/*` 下所有管理接口。

**修复：** 注册接口强制 role 为 `"user"`，admin 创建走独立的管理员接口并验证调用者身份。

---

### 1.3 [HIGH] 频率限制器已实现但从未接入应用

**文件：** `src/core/rate-limiter.ts`（完整实现，但从未在 app.ts 中引用）

`InMemoryRateLimiter` 已实现合理规则（登录 5次/分钟、注册 3次/小时），但是**死代码**。grep 整个 src/ 找不到任何引用。登录、注册等敏感接口无任何频率限制，可被暴力破解。

**修复：** 在 setup-core 中实例化，通过 Fastify `onRequest` hook 或路由级中间件接入。

---

### 1.4 [HIGH] 裂变视频 7+ 接口缺少项目归属校验（IDOR）

**文件：** `src/routes/fission-video-routes.ts`

| 行号 | 接口 | 状态 |
|------|------|------|
| 1194-1209 | `getAtmosphere` | 归属校验**被注释掉** |
| 583-590 | `uploadFissionVideo` | 归属校验**被注释掉**（标注"暂时注释"） |
| 1142-1186 | `getStoryboardCombinations` | 无归属校验 |
| 963-995 | `createFissionVideoStatus` | 无归属校验 |
| 893-920 | `listFissionVideoStatus` | 只按 creatorId 后过滤 |
| 846-886 | `getMirrorVideoStatus` | 无归属校验 |

用户 A 可传入用户 B 的 projectId 读写其项目数据。

**修复：** 所有接收 projectId 的 handler 必须调用 `requireOwnerProject(user, projectId)`。

---

### 1.5 [HIGH] 管理员 token 存储在 localStorage（XSS 风险）

**文件：** `apps/web/store/useAppStore.ts:252,311,730`

```ts
const ADMIN_TOKEN_KEY = "vogue_ai_admin_token";
// 写入 localStorage，同源所有标签页共享，永久持久化
```

localStorage 中的数据在同源所有标签页共享且永不过期。一旦发生 XSS，攻击者可静默窃取管理员 token。

**修复：** 最佳方案是后端使用 httpOnly Cookie 存储 token。短期方案至少改为 sessionStorage。

---

### 1.6 [MEDIUM] 存储代理缺少文件级权限校验

**文件：** `src/routes/storage-proxy-routes.ts:62-96`

`/storage/proxy/*` 只校验了用户已登录 + 路径不含 `..`，但**不验证**请求的文件是否属于该用户。任何已登录用户可枚举路径下载其他用户的图片、视频。

**修复：** 解析路径中的 userId 段，与 `user.id` 比对。

---

### 1.7 [MEDIUM] 积分消费存在 TOCTOU 竞态条件

**文件：** `src/routes/user-routes.ts:68-72`

```ts
// 第68行：检查过期
if (ctx.clock.now() >= account.expiresAt) { throw ... }
// 第72行：单独原子扣减
const deducted = await ctx.repos.credits.atomicDeduct(user.id, amount);
```

过期检查与扣减之间有时间窗口，两个并发请求可能同时通过检查。此外该路由绕过了 `CreditService.spend()`，手动重复实现了已被服务层正确封装的逻辑。

**修复：** 删除手动逻辑，改为调用 `ctx.creditService.spend()`。

---

### 1.8 [MEDIUM] 多处使用 Math.random() 生成 ID

**涉及文件：**
- `src/modules/step2-five-view-job-executor.ts:415`
- `src/modules/global-task-concurrency-service.ts:110,153`
- `src/contracts/step1-outfit-module-contract.ts:236`

`Math.random()` 非密码学安全，ID 可被预测，存在 ID 枚举攻击风险。

**修复：** 替换为 `crypto.randomUUID()`。

---

### 1.9 [MEDIUM] 加密密钥派生使用无盐 SHA256

**文件：** `src/core/security.ts:11-24`

`APP_SECRET_KEY` 通过单次 SHA256 派生 AES-256-GCM 密钥。若环境变量值本身较弱（短字符串），整个加密方案安全性随之崩溃。

**修复：** 使用 PBKDF2 或 scrypt 派生密钥，或直接用 `crypto.randomBytes(32)` 生成密钥。

---

### 1.10 [MEDIUM] CSP 及安全响应头缺失

**文件：** `.deploy/nginx/www.neirongmiao.com.conf`

nginx 未设置 `Content-Security-Policy`、`X-Content-Type-Options`、`X-Frame-Options`、`Strict-Transport-Security`。甚至在 `.deploy/question.md:23` 中已记录为已知问题但未修复。

**修复：** 添加最小安全头：
```
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'";
add_header X-Content-Type-Options "nosniff";
add_header X-Frame-Options "DENY";
add_header Strict-Transport-Security "max-age=31536000";
```

---

### 1.11 [LOW] 其他代码层问题

| 问题 | 文件 | 说明 |
|------|------|------|
| 会话 token 明文存库 | `src/modules/auth-service.ts:91` | 无签名 JWT，数据库泄露可重放所有会话 |
| emotion-archetype 用 `?` 占位符 | `src/services/emotion-archetype-library-service.ts:74` | node-pg 不支持 `?`，这些查询实际会报错 |
| 绕过 repository 直接访问 pool | `src/services/script/unified-script-service.ts:79` | 用 `["pool"]` 绕过 TS 访问控制 |
| MD5 用于去重哈希 | `src/routes/step3-candidate/index.ts:100` | MD5 已破解，应换 SHA256 |
| SHA1 用于语义哈希 | `src/modules/outfit-analysis-helpers.ts:689` 等 | SHA1 已破解，应换 SHA256 |
| 测试环境硬编码回退密钥 | `src/core/security.ts:17-18` | NODE_ENV=test 时可用已知密钥解密 |

---

## 二、数据库层面

### 2.1 [HIGH] .env 中的生产凭证已提交 Git

**文件：** `.env`（被 git 追踪）

| 行 | 内容 | 风险 |
|----|------|------|
| 8 | `postgres://gitlab:password@101.37.80.207:5432/neirongmiao` | 数据库完全暴露 |
| 20 | 阿里云 OSS AccessKey ID | OSS 存储被盗用 |
| 21 | 阿里云 OSS Secret Access Key | OSS 存储被盗用 |
| 42 | TikHub API Token | 第三方 API 被盗用 |

任何人获取 Git 仓库即可拿到生产数据库和 OSS 的完整权限。

**修复：**
1. 立即轮换所有已暴露凭证
2. `git rm --cached .env` 从 Git 中移除
3. 确认 `.gitignore` 包含 `.env`

---

### 2.2 [HIGH] 数据库使用超级用户 + 弱密码

`.env` 中显示数据库账号为 `gitlab`（通常是 PostgreSQL 超级用户），密码为 `password`。一旦存在 SQL 注入，攻击者可直接执行 `DROP TABLE`、`COPY ... FROM PROGRAM` 等系统级操作。

**修复：**
1. 创建专用应用账号，仅授予 `SELECT/INSERT/UPDATE/DELETE` 权限
2. 使用强随机密码

---

### 2.3 [MEDIUM] 密码哈希在应用内部流通

**涉及文件：** `src/modules/user-admin-service.ts:35`, `src/modules/hot-trend-sync.ts:472`, `src/modules/hot-trend-sync-config.ts:385`

`users.list()` 返回完整 User 实体（含 `passwordHash`），虽然 API 响应层做了过滤，但如果内部错误触发日志输出，密码哈希可能被写入 `logs/app-error-*.json`。

**修复：** `users.list()` 的 SELECT 明确排除 `password_hash` 列。

---

### 2.4 [LOW] 软删除可能不一致

部分表有 `deleted_at` 列但对应的 Repository 继承 `PgBaseRepository` 而非 `PgSoftDeletableRepository`，导致 `list()` 查询不自动过滤已删除记录。

**修复：** 全量审计所有 Repository，有 `deleted_at` 列的表统一使用 `PgSoftDeletableRepository`。

---

### 2.5 [正面] SQL 注入防护良好

所有 `src/repositories/pg/` 下的查询均使用 `$1, $2, ...` 参数化占位符，表名通过 `nrm()` 函数硬编码，ORDER BY 仅允许固定 ASC/DESC，**未发现 SQL 注入风险**。

---

## 三、业务层面

### 3.1 [HIGH] 注册无需邮箱验证

**文件：** `src/routes/auth-routes.ts:60-65`

注册即创建账户并返回登录成功，无验证邮件、无激活步骤。配合无频率限制（1.3），攻击者可批量创建无限账户。

**修复：** 发送含有时限 token 的验证邮件，验证通过后方可登录。

---

### 3.2 [MEDIUM] 分享接口无鉴权暴露所有项目

**文件：** `src/routes/share-routes.ts:61-131`

`/share/projects/:projectId` 无需登录即可访问，且无项目级别的公开开关。任何 `exportUrl` 不为空的项目都会自动对外暴露。攻击者可枚举 UUID 抓取所有项目数据及视频 URL 进行盗链。

**修复：** 增加项目级 `isPublic` / `shareEnabled` 开关，默认关闭，仅由项目所有者主动开启。

---

### 3.3 [MEDIUM] 文件上传无 Content-Type 白名单

**文件：** `src/routes/library-asset-upload-routes.ts:60-106`

签名上传接口的 `contentType` 参数只校验了非空字符串，允许任意 MIME 类型（如 `text/html`）。上传的 HTML 文件若被 CDN 以声明 Content-Type 直接服务，可被用于钓鱼或 XSS。

**修复：** 维护允许的 MIME 类型白名单（`image/png`, `image/jpeg`, `image/webp`, `video/mp4` 等）。

---

### 3.4 [MEDIUM] 密码找回是空壳占位

**文件：** `src/modules/auth-service.ts:133-135`

```ts
forgotPasswordPlaceholder(): { message: string } {
  return { message: "请联系管理员处理密码找回" };
}
```

用户丢失密码后无自助恢复机制。

**修复：** 实现基于邮箱的密码重置流程。

---

### 3.5 [LOW] 账号锁定机制无 IP 维度

**文件：** `src/modules/auth-service.ts:50-86`

账号锁定仅按 failedAttempts 计数，不区分 IP。攻击者从多个 IP 分散请求可绕过限流；同时攻击者可故意输错密码把他人账号锁住。

**配合 1.3（频率限制未接入）修复后，此问题严重度会降低。**

---

## 统计总结

| 级别 | HIGH | MEDIUM | LOW |
|------|------|--------|-----|
| 代码层面 | 5 | 5 | 5 |
| 数据库层面 | 2 | 1 | 1 |
| 业务层面 | 1 | 3 | 1 |
| **合计** | **8** | **9** | **7** |

---

## 优先修复清单（按紧急程度排序）

1. **轮换 .env 中所有已暴露凭证**（数据库、OSS、API Token） — 数据库层面
2. **密码哈希改为 bcrypt/argon2** — 代码层面
3. **注册接口移除 admin 角色选择** — 代码层面
4. **接入频率限制器到登录/注册路由** — 代码层面
5. **裂变视频接口恢复项目归属校验** — 代码层面
6. **管理员 token 改为 httpOnly Cookie** — 代码层面
7. **注册增加邮箱验证** — 业务层面
8. **存储代理增加文件级权限校验** — 代码层面

---

## 正面发现（已做好的安全措施）

- SQL 查询全部使用参数化占位符，无 SQL 注入风险
- 路径遍历防护在存储层和代理层均有实现
- API 响应层显式过滤了 passwordHash 字段
- 软删除模式（PgSoftDeletableRepository）设计合理
- 审计日志覆盖了敏感管理操作
- 事务使用正确的 BEGIN/COMMIT/ROLLBACK 模式
- 前端无 dangerouslySetInnerHTML 使用，无 eval/new Function