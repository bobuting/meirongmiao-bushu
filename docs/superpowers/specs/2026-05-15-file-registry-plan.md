# 文件注册中心实施计划

> **目标：** 让文件注册中心真正用起来，统一管理所有上传文件的元数据、去重和引用追踪。

---

## 一、当前状态

### 已完成 ✅

| 组件 | 状态 | 文件 |
|-----|------|------|
| 数据库表 | ✅ 已创建 | `nrm_file_registry` |
| FileService 核心类 | ✅ 已实现 | `src/services/file/file-service.ts` |
| Repository | ✅ 已实现 | `src/repositories/pg/file-registry-pg-repository.ts` |
| 后台路由 | ✅ 已实现 | `src/routes/admin/file-registry-routes.ts` |
| 后台管理页面 | ✅ 已实现 | `apps/web/pages/admin/FileRegistryManagement.tsx` |

### 未启用 ❌

- `nrm_file_registry` 当前记录数为 **0**
- 业务入口未集成 FileService，文件上传后不注册

---

## 二、架构决策

### 2.1 清理策略

| 决策 | 结论 |
|-----|------|
| 自动清理 | **关闭**（`FILE_CLEANUP_ENABLED=false`） |
| 清理方式 | 管理员手动审核删除 |
| 原因 | 正式库和测试库共用 OSS，自动清理有误删风险 |

### 2.2 数据流向

```
┌─────────────────────────────────────────────────────────────────┐
│                        OSS Bucket（共用）                        │
└─────────────────────────────────────────────────────────────────┘
         ↑              ↑              ↑              ↑
         │              │              │              │
    ┌────┴────┐    ┌────┴────┐    ┌────┴────┐    ┌────┴────┐
    │ 前端上传 │    │ 热榜同步 │    │ 媒体持久 │    │ AI生成  │
    │         │    │         │    │         │    │         │
    │ ossUpload│    │ hot-trend│    │ storage- │    │ fission │
    │ .ts     │    │ -sync   │    │ persist  │    │         │
    └────┬────┘    └────┬────┘    └────┬────┘    └────┬────┘
         │              │              │              │
         └──────────────┴──────────────┴──────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  FileService    │
                    │  .upload()      │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ nrm_file_       │
                    │ registry        │
                    └─────────────────┘
```

---

## 三、待改造入口清单

### 3.1 高频入口（P1 - 优先改造）

| 入口 | 业务域 | 当前实现 | 改造方式 |
|-----|--------|---------|---------|
| `storage-persist.ts` | `media_persist` | SHA256 内容去重 | 调用 `FileService.upload()` |
| 前端直传 OSS | 各业务域 | 无注册 | 新增注册接口，上传后调用 |
| Step1 服饰上传 | `project/step1_clothing` | `UploadService` | 集成 `FileService` |

### 3.2 中低频入口（P2）

| 入口 | 业务域 | 改造方式 |
|-----|--------|---------|
| Step2 定妆/五视图 | `project/step2_character` | 集成 `FileService` |
| Step3 分镜图 | `project/step3_script` | 集成 `FileService` |
| Step4 分镜视频 | `project/step4_storyboard` | 集成 `FileService` |
| 热榜同步 | `hot_trend` | 集成 `FileService` |
| 广场反推 | `square` | 集成 `FileService` |
| 裂变视频 | `fission` | 集成 `FileService` |
| 换装项目 | `outfit_change` | 集成 `FileService` |

---

## 四、改造步骤

### 4.1 第一阶段：基础设施完善

1. **确认 FileService 已注入 AppContext**
   - 检查 `src/app-setup/app-services.ts`
   - 确保 `ctx.fileService` 可用

2. **新增文件注册接口（前端直传后调用）**
   ```typescript
   // POST /files/register
   interface RegisterFileRequest {
     storageKey: string;        // OSS 存储路径
     fileName?: string;
     contentType?: string;
     businessDomain: string;
     businessSubdomain?: string;
     businessTags?: Record<string, string>;
     owningProjectId?: string;
   }
   ```

### 4.2 第二阶段：历史文件注册

由于已有大量文件在 OSS 中，需要扫描并注册：

**扫描策略：**
- 扫描各业务表中的 URL 字段
- 提取 OSS 路径
- 计算 SHA256（需下载文件）
- 批量插入 `nrm_file_registry`

**历史文件来源表：**

| 表 | 字段 | 预估数量 |
|---|------|---------|
| `nrm_projects` | `thumbnail_url`, `cover_image_url` | 562 |
| `nrm_garment_assets` | `main_image_url`, `sub_image_url_1/2/3` | 355 |
| `nrm_character_five_views` | `image_url` | 762 |
| `nrm_hot_trend_assets` | `source_oss_url`, `cover_url`, `video_url` | 3361 |
| `nrm_library_characters` | `thumbnail_url`, `five_view_oss_image_url` | 847 |
| `nrm_final_videos` | `video_url`, `cover_image_url` | 293 |
| `nrm_fission_videos` | `thumbnail_url` | 124 |
| `nrm_fission_task_items` | `image_url`, `video_url` | 118 |
| `nrm_model_photos` | `image_url` | 428 |
| `nrm_step3_frame_images` | `selected_image_url` | 235 |
| `nrm_step4_video_scenes` | `clip_url` | 149 |
| `nrm_video_musics` | `music_url`, `cover_url` | 108 |
| 其他 | ... | ... |

**总计：约 7000+ 文件**

### 4.3 第三阶段：业务入口改造

改造各上传入口，确保新上传文件自动注册：

**改造模式：**
```typescript
// 改造前
await ctx.storage.putObject(key, bytes, contentType);
return ctx.storage.getSignedUrl(key);

// 改造后
const record = await ctx.fileService.upload(userId, bytes, {
  contentType,
  businessDomain: 'project',
  businessSubdomain: 'step1_clothing',
  owningProjectId: projectId,
});
return record.publicUrl;
```

### 4.4 第四阶段：引用追踪功能

**后台路由补充：**
```typescript
// GET /admin/files/:id/references
interface FileReferencesResponse {
  fileId: string;
  references: Array<{
    entityType: string;    // 'project', 'garment_asset', 'character', ...
    entityId: string;
    fieldName: string;     // 'thumbnail_url', 'main_image_url', ...
    entityName?: string;   // 项目名称/文件名，便于识别
  }>;
}
```

---

## 五、工作量估算

| 阶段 | 任务 | 预估工时 |
|-----|------|---------|
| P1 | 基础设施完善 | 0.5 天 |
| P1 | 历史文件注册脚本 | 1 天 |
| P1 | 高频入口改造（3个） | 1 天 |
| P2 | 中低频入口改造（7个） | 2 天 |
| P2 | 引用追踪功能 | 1 天 |

**总计：5.5 天**

---

## 六、注意事项

### 6.1 去重机制

`FileService.upload()` 内部已实现 SHA256 去重：
- 相同内容的文件只存储一份
- 返回已有记录，增加引用计数

### 6.2 历史文件去重

历史注册时需注意：
- 多表可能引用同一 OSS 文件
- 需按 `storage_key` 去重，避免重复注册
- 引用计数取各表引用次数之和

### 6.3 共享素材处理

以下文件为共享素材，特殊处理：

| 路径前缀 | 说明 | business_domain |
|---------|------|-----------------|
| `hot-trend-video/` | 热榜视频 | `hot_trend` |
| `library-characters/` | 公共角色库 | `library` |
| `scene-library/` | 场景库 | `library` |

共享素材的 `ref_count` 初始值设为 1，永不自动清理。

---

## 七、验收标准

### 功能验收

- [ ] 所有上传入口集成 FileService
- [ ] 新上传文件自动注册到 `nrm_file_registry`
- [ ] 历史文件全部注册完成
- [ ] SHA256 去重生效
- [ ] 后台可查看文件列表、详情、引用追踪
- [ ] 存储统计准确反映各业务域数据

### 数据验收

- [ ] `nrm_file_registry` 记录数 ≈ OSS 文件数（去重后）
- [ ] 零引用文件列表合理（有引用的文件不应出现在此列表）
- [ ] 存储统计与 OSS 实际存储量基本一致

---

## 八、后续维护

### 定期检查

- 每月检查存储统计报告
- 人工审核零引用文件，决定是否清理

### 新入口接入

新增上传功能时，必须：
1. 调用 `FileService.upload()` 或 `registerReference()`
2. 指定正确的 `business_domain` 和 `business_subdomain`
3. 如有项目归属，传入 `owningProjectId`
