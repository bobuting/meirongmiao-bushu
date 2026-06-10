# 文件注册中心改造笔记

> 记录改造过程中的分析和决策，方便后续优化参考。

---

## 一、改造背景

**目标：** 让文件注册中心真正用起来，统一管理所有上传文件的元数据、去重和引用追踪。

**现状：**
- `nrm_file_registry` 表已创建，但记录数为 0
- 业务入口未集成 FileService，文件上传后不注册

---

## 二、已完成改造

### 2.1 增加 environment 字段

区分测试库和正式库：

```typescript
type FileEnvironment = 'test' | 'production';
```

- 根据 `NODE_ENV` 自动判断：`production` → production，其他 → test
- 所有文件记录都会标记所属环境

### 2.2 签名 URL 接口预注册

**改造方案 B：** 生成签名 URL 时预注册文件记录

```
POST /library/assets/sign-upload-url
  → 生成签名 URL
  → 预注册文件记录（ref_count = 0）
  → 返回签名 URL + fileRegistryId
```

**优点：**
- 前端零改动（13 处调用无需修改）
- 孤儿记录影响小（ref_count = 0 不影响业务）

### 2.3 storage-persist.ts 集成 FileService

新增参数支持文件注册：
- `businessDomain`
- `businessSubdomain`
- `uploaderId`

---

## 三、核心问题：双重上传机制

### 3.1 问题根源

当前存在两套并行的上传机制：

| 模块 | 文件路径 | 核心功能 |
|------|---------|---------|
| `storage-persist.ts` | `src/services/media/` | SHA256 去重 + 上传 + 图片优化 + 注册 |
| `FileService` | `src/services/file/` | SHA256 去重 + 上传 + 文件注册 + 引用追踪 |

**代码证据：**

1. **双重去重逻辑**
   - `storage-persist.ts:239` - 自己计算 SHA256
   - `FileService.ts:54` - 也计算 SHA256

2. **存储路径不一致**
   ```typescript
   // storage-persist.ts:243
   const key = `media/sha256/${sha256.slice(0, 2)}/${sha256}${finalExt}`;

   // FileService.ts:244
   const storageKey = `${prefix}/${sha256.slice(0, 2)}/${sha256}.${ext}`;
   // prefix = "media/images" | "media/videos" | ...
   ```

3. **注册失败静默处理**
   ```typescript
   // storage-persist.ts:263-265
   } catch {
     // 注册失败不影响主流程
   }
   ```
   **违反项目规范：禁止降级处理！**

### 3.2 造成的问题

1. **去重逻辑分散** - 两处代码都要维护
2. **存储路径不一致** - 同一文件可能存两份
3. **注册不可靠** - 静默失败导致数据不完整
4. **维护成本高** - 改一处要考虑另一处
5. **功能重复** - 浪费计算资源（两次 SHA256）

---

## 四、统一方案：FileService 为唯一入口

### 4.1 设计原则

**FileService 是唯一的文件上传入口，所有模块通过它上传文件。**

职责分工：

| 模块 | 职责 | 不负责 |
|------|------|--------|
| `FileService` | SHA256 去重 + 上传 OSS + 文件注册 + 引用追踪 | 图片优化、读取字节 |
| `storage-persist.ts` | 图片优化 + 读取字节 + 调用 FileService | 去重、上传、注册 |
| 业务代码 | 准备数据 + 调用 storage-persist 或 FileService | 直接操作 storage |

### 4.2 改造方案

#### 方案 A：storage-persist 内部调用 FileService（推荐）

**改造前：**
```typescript
// storage-persist.ts
export async function persistImageSourceToStorage() {
  // 1. 读取字节
  // 2. 图片优化
  // 3. 计算 SHA256（重复！）
  // 4. 生成存储路径（不一致！）
  // 5. storage.putObject()（重复！）
  // 6. 注册到 FileService（静默失败！）
}
```

**改造后：**
```typescript
// storage-persist.ts
export async function persistImageSourceToStorage(
  ctx: AppContext,
  sourceUrl: string,
  keyPrefix: string,
  options?: PersistImageOptions
): Promise<string> {
  // 1. 读取字节
  const { bytes, contentType } = await readImageBytesFromSource(sourceUrl, timeout);

  // 2. 图片优化（保留）
  const optimized = await optimizeImageBuffer(bytes, options);

  // 3. 调用 FileService（统一去重+上传+注册）
  const record = await ctx.fileService.upload(options.uploaderId, optimized.buffer, {
    fileName: extractFileName(sourceUrl),
    contentType: optimized.contentType,
    businessDomain: options.businessDomain ?? "project",
    businessSubdomain: options.businessSubdomain ?? "media_persist",
    storageDriver: "oss",
  });

  // 4. 返回公开 URL
  return record.publicUrl;
}
```

**改造要点：**
1. 移除 SHA256 计算逻辑（第 239 行）
2. 移除存储路径生成逻辑（第 240-249 行）
3. 移除 `storage.putObject()` 调用（第 250 行）
4. 直接调用 `FileService.upload()` 并返回结果
5. **移除静默失败处理**（第 263-265 行）

#### 方案 B：废弃 storage-persist，全部迁移到 FileService

**适用场景：** 新代码直接使用 FileService

```typescript
// 业务代码示例
const record = await ctx.fileService.upload(userId, imageBytes, {
  fileName: "product.jpg",
  contentType: "image/jpeg",
  businessDomain: "project",
  businessSubdomain: "product_image",
});

// 如果需要图片优化
const optimized = await optimizeImageBuffer(imageBytes);
const record = await ctx.fileService.upload(userId, optimized.buffer, {...});
```

### 4.3 统一后的好处

1. **单一入口** - 所有文件上传都走 FileService
2. **去重统一** - SHA256 去重逻辑只在 FileService 一处
3. **路径统一** - 存储路径格式统一为 `media/{type}/{sha256前2位}/{sha256}.{ext}`
4. **注册可靠** - 失败直接抛错，不再静默降级
5. **引用追踪** - 所有文件都有引用追踪
6. **维护简单** - 改一处即可

---

## 五、其他 storage.putObject 调用改造

### 5.1 调用统计（20 处）

| 分类 | 数量 | 改造策略 |
|------|------|---------|
| 底层服务 | 2 | 保留（oss-service、file-service 本身） |
| 已改造 | 2 | 完成（storage-persist 已集成 FileService） |
| 图片上传 | 7 | 改用 storage-persist（方案 A） |
| 视频上传 | 6 | 改用 FileService（方案 B） |
| 特殊场景 | 3 | 保留（裂变占位图、远程下载等） |

### 5.2 图片上传改造（7 处）

**改造策略：** 改用 `persistImageSourceToStorage()`，内部已集成 FileService

| 文件 | 行号 | 场景 | 改造方式 |
|------|------|------|---------|
| `step3-handlers.ts` | 383 | 模特图上传 | 添加 `uploaderId` 参数 |
| `step3-handlers.ts` | 504 | Logo 上传 | 添加 `uploaderId` 参数 |
| `character-view-session.ts` | 169 | 角色五视图 | 添加 `uploaderId` 参数 |
| `fission-item-image-executor.ts` | 191 | 裂变图片 | 添加 `uploaderId` 参数 |
| `fission-storyboard-image-service.ts` | 558 | 分镜 JPEG 图 | 添加 `uploaderId` 参数 |
| `reverse-square-routes.ts` | 337 | 广场反推封面 | 添加 `uploaderId` 参数 |
| `setup-executors.ts` | 1657 | 执行器上传 | 添加 `uploaderId` 参数 |

**改造示例：**
```typescript
// 改造前
const url = await persistImageSourceToStorage(ctx, imageUrl, "media/generated");

// 改造后
const url = await persistImageSourceToStorage(ctx, imageUrl, "media/generated", {
  uploaderId: userId,
  businessDomain: "project",
  businessSubdomain: "model_image",
});
```

### 5.3 视频上传改造（6 处）

**改造策略：** 直接使用 `FileService.upload()`

| 文件 | 行号 | 场景 | 改造方式 |
|------|------|------|---------|
| `fission-core-service.ts` | 488, 536 | 裂变视频合并/镜像 | 改用 FileService |
| `reverse-parse-routes.ts` | 877 | 反推视频上传 | 改用 FileService |
| `hot-trend-db-operations.ts` | 417 | 热榜视频同步 | 改用 FileService |
| `video-hot-trend-sync-deps.ts` | 839 | 热榜视频同步 | 改用 FileService |
| `reverse-square-routes.ts` | 323 | 广场反推视频 | 改用 FileService |

**改造示例：**
```typescript
// 改造前
const videoBytes = await fetchVideoBytes(videoUrl);
await ctx.storage.putObject(key, videoBytes, "video/mp4");
const publicUrl = ctx.storage.getSignedUrl(key);

// 改造后
const videoBytes = await fetchVideoBytes(videoUrl);
const record = await ctx.fileService.upload(userId, videoBytes, {
  fileName: "video.mp4",
  contentType: "video/mp4",
  businessDomain: "project",
  businessSubdomain: "fission_video",
});
const publicUrl = record.publicUrl;
```

### 5.4 特殊场景（3 处）

保留原有逻辑，暂不改造：
- 裂变占位图生成
- 远程文件下载缓存
- 临时文件处理

---

## 六、改造优先级与计划

### 6.1 优先级排序

| 优先级 | 任务 | 预计工时 | 风险 |
|--------|------|---------|------|
| **P0** | 修复 storage-persist 静默失败问题 | 0.5h | 低 |
| **P1** | 统一 storage-persist 和 FileService | 2h | 中 |
| **P2** | 改造图片上传（7 处） | 3h | 低 |
| **P3** | 改造视频上传（6 处） | 2h | 低 |
| **P4** | 历史文件注册脚本 | 4h | 中 |

### 6.2 P0：修复静默失败（紧急）

**问题：** `storage-persist.ts:263-265` 静默处理注册失败

**修复方案：**
```typescript
// 修复前
} catch {
  // 注册失败不影响主流程
}

// 修复后
} catch (error) {
  log.error({ error, uploaderId: options.uploaderId }, "FileService registration failed");
  throw new Error("FILE_REGISTRATION_FAILED: 文件注册失败");
}
```

**理由：** 违反项目规范"禁止降级处理"

### 6.3 P1：统一上传入口（核心）

**改造步骤：**

1. **修改 `persistImageSourceToStorage()`**
   - 移除 SHA256 计算（第 239 行）
   - 移除存储路径生成（第 240-249 行）
   - 移除 `storage.putObject()`（第 250 行）
   - 改为调用 `FileService.upload()`
   - 移除静默失败处理（第 263-265 行）

2. **修改 `persistVideoSourceToStorage()`**
   - 同样改为调用 `FileService.upload()`

3. **测试验证**
   - 确保图片上传正常
   - 确保视频上传正常
   - 确保文件注册成功
   - 确保去重逻辑正确

### 6.4 P2-P3：业务代码改造

按照 5.2 和 5.3 的改造方式逐个修改。

### 6.5 P4：历史文件注册

编写脚本扫描 OSS 已有文件，批量注册到 `nrm_file_registry`。

---

## 七、改造验证清单

### 7.1 功能验证

- [ ] 图片上传后能正确注册
- [ ] 视频上传后能正确注册
- [ ] SHA256 去重生效（相同文件只存一份）
- [ ] 存储路径格式统一
- [ ] 引用计数正确
- [ ] 注册失败能正确报错（不静默降级）

### 7.2 性能验证

- [ ] 上传速度无明显下降
- [ ] SHA256 计算只执行一次
- [ ] 数据库查询次数合理

### 7.3 兼容性验证

- [ ] 已有文件 URL 仍可访问
- [ ] 前端上传流程不受影响
- [ ] 签名 URL 上传仍正常

---

## 八、当前上传方式总结

| 方式 | 入口 | 去重 | 优化 | 注册 | 改造后 |
|------|------|------|------|------|--------|
| **前端签名 URL** | `ossUpload.ts` | ❌ 无 | 前端压缩 | ✅ 预注册 | 保持不变 |
| **FileService** | 后端 | ✅ SHA256 | ❌ 无 | ✅ 注册 | **唯一入口** |
| **storage-persist** | 后端 | ✅ SHA256 | ✅ Sharp | ✅ 注册 | 内部调用 FileService |
| **直接 putObject** | 后端 | ❌ 部分 | ❌ 部分 | ❌ 无 | 改用上述方式 |

---

## 九、相关文档

- 文件注册中心实施计划：`docs/superpowers/specs/2026-05-15-file-registry-plan.md`
- 数据库表结构：`docs/buss/table/database-schema-full.md`
- FileService 源码：`src/services/file/file-service.ts`
- storage-persist 源码：`src/services/media/storage-persist.ts`