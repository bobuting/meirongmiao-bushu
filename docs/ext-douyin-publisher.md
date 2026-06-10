# Chrome 扩展：抖音创作者自动发布

## 功能概述

通过 Chrome 扩展在用户浏览器端自动发布短视频到抖音创作者后台 (`creator.douyin.com`)。

**核心特性：**
- 多抖音账号管理，Cookie 隔离
- 用户真实 IP + 真实浏览器指纹，风控风险低
- 与服务端自动化完全隔离，独立数据库表
- 实时进度反馈

## 架构

```
┌─────────────────────────────────────────────────┐
│ neirongmiao 前端 (apps/web)                      │
│  └─ 检测扩展 → 选择账号 → 点击「扩展发布」        │
└──────────────┬──────────────────────────────────┘
               │ POST /ext/douyin/publish
               ▼
┌─────────────────────────────────────────────────┐
│ neirongmiao 后端                                 │
│  routes/ext-douyin-publish-routes.ts             │
│  modules/ext-douyin-publish-service.ts            │
│  repositories/pg/ext-douyin-account-repo.ts       │
│  表: nrm_ext_douyin_accounts                      │
│  表: nrm_ext_douyin_publish_jobs                  │
└──────────────┬──────────────────────────────────┘
               │ GET /ext/douyin/jobs/poll (轮询)
               ▼
┌─────────────────────────────────────────────────┐
│ Chrome 扩展 (apps/douyin-publisher-extension/)   │
│  Background Worker ← 轮询任务                     │
│  Content Script → 控制 creator.douyin.com        │
│  Cookie Manager → 多账号隔离                      │
└─────────────────────────────────────────────────┘
```

## 部署步骤

### 1. 创建数据库表

```bash
# 方式一：通过 node 执行
DATABASE_URL="your_database_url" node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const fs = require('fs');
const sql = fs.readFileSync('./sql/ext-douyin-publish-tables.sql', 'utf8');
pool.query(sql).then(() => { console.log('Tables created'); pool.end(); });
"

# 方式二：直接连接数据库执行
psql $DATABASE_URL -f sql/ext-douyin-publish-tables.sql
```

### 2. 构建扩展

```bash
cd apps/douyin-publisher-extension
npm install
npm run build
```

构建产物在 `apps/douyin-publisher-extension/dist/` 目录。

### 3. 加载扩展到 Chrome

1. 打开 `chrome://extensions`
2. 启用「开发者模式」（右上角开关）
3. 点击「加载已解压的扩展」
4. 选择 `apps/douyin-publisher-extension/dist` 目录
5. 扩展名称显示为「内容喵 · 抖音发布助手」

### 4. 替换图标（可选）

将 `src/assets/icon-*.png` 替换为品牌图标（16x16、48x48、128x128 三种尺寸）。

## 使用流程

### 绑定抖音账号

1. 点击扩展图标 → 点击「管理账号 & 设置」
2. 点击「添加账号」
3. 在打开的页面中扫码或密码登录抖音
4. 登录成功后 Cookie 自动保存

### 发布视频

1. 在 neirongmiao 项目页面选择视频
2. 点击「扩展发布」按钮
3. 选择目标抖音账号
4. 扩展自动打开创作者后台并执行发布
5. 前端实时显示进度

## API 端点

### 前端调用

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/ext/douyin/accounts` | 查询绑定的账号列表 |
| `POST` | `/ext/douyin/accounts` | 注册新账号 |
| `DELETE` | `/ext/douyin/accounts/:accountId` | 删除账号 |
| `POST` | `/ext/douyin/publish` | 创建发布任务 |
| `GET` | `/ext/douyin/jobs` | 查询任务列表 |

### 扩展调用

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/ext/douyin/jobs/poll` | 轮询待执行任务 |
| `POST` | `/ext/douyin/jobs/:jobId/claim` | 认领任务 |
| `POST` | `/ext/douyin/jobs/:jobId/progress` | 上报进度 |
| `POST` | `/ext/douyin/jobs/:jobId/complete` | 完成任务 |
| `POST` | `/ext/douyin/jobs/:jobId/fail` | 任务失败 |

## 反检测策略

扩展内置以下反检测机制：

- **随机延时**：操作间 2-8 秒随机等待
- **逐字输入**：标题/标签逐字输入，每字 50-150ms
- **鼠标轨迹**：贝塞尔曲线模拟真实鼠标移动
- **随机滚动**：发布页随机滚动行为
- **真实环境**：用户浏览器无 `navigator.webdriver` 标记

## 与服务端自动化的隔离

| 项目 | 服务端自动化 | 扩展发布 |
|------|------------|---------|
| 路由文件 | `douyin-route-handlers.ts` | `ext-douyin-publish-routes.ts` |
| 服务文件 | `douyin-publish-service.ts` | `ext-douyin-publish-service.ts` |
| 任务表 | `nrm_async_jobs` | `nrm_ext_douyin_publish_jobs` |
| 账号表 | Cookie 文件存储 | `nrm_ext_douyin_accounts` |
| 执行方式 | Python + Playwright（服务器） | Chrome 扩展（用户浏览器） |

两者完全独立，互不影响。

## 故障排查

### 扩展无法加载

- 确认 `dist` 目录存在且包含 `manifest.json`
- 检查 Chrome 版本是否支持 Manifest V3（Chrome 88+）

### 登录态过期

- 点击「管理账号」→ 删除过期账号 → 重新添加

### 发布失败

- 检查抖音创作者后台页面结构是否变化（DOM 选择器需更新）
- 查看 Chrome DevTools Console 中的错误日志

### 任务卡住

- 后端会自动在 2 小时后将未完成的任务标记为 `expired`
- 扩展会自动重试失败任务（最多 3 次）

## 开发

```bash
# 开发模式（监听文件变化自动重构建）
cd apps/douyin-publisher-extension
npm run dev

# 类型检查
npm run typecheck

# 构建
npm run build
```

## 文件结构

```
apps/douyin-publisher-extension/
├── manifest.json          # Manifest V3 配置
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── background/        # Service Worker
│   │   ├── index.ts
│   │   ├── cookie-manager.ts
│   │   ├── anti-detect.ts
│   │   ├── api-client.ts
│   │   └── task-runner.ts
│   ├── content/           # 内容脚本
│   │   ├── douyin-creator.ts
│   │   ├── dom-selectors.ts
│   │   └── actions/
│   ├── popup/            # 弹窗 UI
│   ├── options/          # 选项页 UI
│   ├── shared/           # 共享类型和常量
│   └── assets/           # 图标
└── dist/                 # 构建产物
```
