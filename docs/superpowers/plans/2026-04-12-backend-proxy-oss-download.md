# 后端代理下载 OSS 文件方案

> 日期: 2026-04-12

## Context

前端合并视频时（Step4 + Fission），需要下载 OSS 上的视频/音频文件。当前直接 `fetch()` OSS 公开 URL，因跨域和网络问题偶发失败。

**根因**：前端跨域访问 `bbt-neirongmiao-v1.oss-cn-hangzhou.aliyuncs.com`，OSS CORS 配置不稳定导致下载失败。

**方案**：后端新增代理下载路由，前端通过同源后端下载，彻底消除跨域问题。

---

## 改动清单

### 1. 后端：IObjectStorageAdapter 接口新增 `getObject` 方法

**文件**: `src/contracts/object-storage.ts`

- 在 `IObjectStorageAdapter` 接口新增 `getObject(key: string): Promise<Uint8Array>` 方法
- 返回文件内容 Uint8Array，供代理路由读取后转发

### 2. 后端：各存储适配器实现 `getObject`

**文件**: `src/storage/adapters.ts`

| 适配器 | 实现方式 |
|--------|---------|
| `LocalObjectStorageAdapter` (L15-51) | `readFile(resolve(join(this.rootDir, k)))` 读本地文件 |
| `SupabaseObjectStorageAdapter` (L53-75) | throw "未实现" |
| `S3ObjectStorageAdapter` (L77-) | `this.client.send(new GetObjectCommand({...}))` 读取（`GetObjectCommand` 已 import 未使用） |

**S3 实现要点**：
- 使用已 import 的 `GetObjectCommand`
- 需调用 `this.resolveStorageKey(key)` 处理 `S3_BASE_PREFIX` 前缀
- Body 是 `ReadableStream`，需用 `new Response(body).arrayBuffer()` 转为 `Uint8Array`

### 3. 后端：新增代理下载路由

**文件**: `src/routes/fission-video-routes.ts`

- 在 `FissionVideoRouteHandlers` 接口新增 `storageProxy: RouteHandlerMethod`
- 在 `registerFissionVideoRoutes` 注册 `app.get("/fission/storage/proxy/*", handlers.storageProxy)`
- 在 `createFissionVideoRouteHandlersWithContext` 中实现：
  - 鉴权: `requireUser`
  - 路径提取: `request.params['*']` 获取通配符路径
  - 路径校验: 去掉 `storage/` 前缀后，必须以 `projects/` 开头
  - 调用 `ctx.storage.getObject(key)` 获取文件内容
  - 响应: 设置 `Content-Type`（根据扩展名推测）、`Cache-Control: public, max-age=3600`
  - 返回 `Uint8Array` 作为 buffer

**路径映射说明**：
- 前端请求: `GET /neirongmiao/api/fission/storage/proxy/storage/projects/xxx/merged_xxx.mp4`
- 提取路径: `storage/projects/xxx/merged_xxx.mp4`
- OSS key 即为: `storage/projects/xxx/merged_xxx.mp4`（包含 `S3_BASE_PREFIX=storage/`）

### 4. 前端：下载工具增加 URL 重写

**文件**: `apps/web/utils/fetch-video-file.ts`

- 新增 `rewriteToProxyUrl(url: string): string` 函数：
  - 匹配 OSS 域名 `https://bbt-neirongmiao-v1.oss-cn-hangzhou.aliyuncs.com/`
  - 将其替换为 `/neirongmiao/api/fission/storage/proxy/`
  - 非 OSS URL 保持不变（data URL、blob URL、其他域名）
- 新增 `getAuthHeaders(): Record<string, string>` 函数：
  - 从 `useAppStore.getState().token` 获取 token
  - 返回 `{ Authorization: 'Bearer xxx' }`
- 修改 `downloadSingleVideo()` (L47-85)：对 URL 调用 `rewriteToProxyUrl()`，fetch 时传入 auth headers
- 修改 `downloadAudioFile()` (L163-178)：同样处理

### 5. 前端：video-mirror.ts 的 fetchVideoStream 也走代理

**文件**: `apps/web/libs/video-mirror.ts`

- `fetchVideoStream()` (L528-546) 中对 URL 调用 `rewriteToProxyUrl()`
- fetch 时传入 auth headers

---

## 不改动的文件

- `apps/web/libs/video-merge.ts` — 不改，它通过 `fetch-video-file.ts` 下载，URL 重写已覆盖
- `apps/web/pages/fission/useFissionVideo.ts` — 不改，它通过 `video-merge.ts` 间接下载
- `apps/web/pages/project-flow/step4-video-workspace/Step4VideoWorkspaceScreen.tsx` — 不改，它通过 `video-merge.ts` 间接下载
- 数据库 — 不改

---

## 关键设计决策

1. **URL 重写位置**：统一在 `fetch-video-file.ts` 中重写，而不是在每个调用方重写，改动最小
2. **鉴权方式**：代理路由走 `requireUser`，前端 fetch 时带 `Authorization` header
3. **路径映射**：OSS URL `https://bucket.oss-xxx.aliyuncs.com/storage/projects/xxx/...` → 代理 URL `/neirongmiao/api/fission/storage/proxy/storage/projects/xxx/...`
4. **安全性**：只允许 `projects/` 开头的路径，防止目录遍历
5. **token 来源**：从 `useAppStore.getState().token` 获取，不需要额外传参

---

## 验证方式

1. `npx tsc --noEmit` 编译通过
2. 启动后端，确认 `GET /fission/storage/proxy/storage/projects/xxx` 返回文件
3. 前端合并视频流程测试：fission 合并 + Step4 合并
