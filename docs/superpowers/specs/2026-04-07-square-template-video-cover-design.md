# 创作广场模板新增功能改造设计

## 概述

改造创作广场管理的新增模板功能，实现用户上传视频后自动截取首帧作为封面，提交后存储到 OSS 并写入数据库。

## 业务背景

- **场景**：管理后台新增模板
- **入口**：`SquareTemplateManagement.tsx` 页面，点击"新增模板"按钮
- **改造目标**：简化操作流程，从"分别上传封面和视频"改为"只上传视频，自动截取首帧"

## 现有架构

| 层级 | 文件 | 说明 |
|-----|------|-----|
| 前端页面 | `apps/web/pages/admin/SquareTemplateManagement.tsx` | 模板管理页面，包含新增/编辑弹窗 |
| 后端路由 | `src/routes/square-template-routes.ts` | 模板 CRUD 和文件上传接口 |
| 数据服务 | `src/service/square-template-db-service.ts` | 模板数据库操作 |
| OSS 服务 | `src/service/oss/oss-service.ts` | 阿里云 OSS 上传封装 |

## 数据表

### `nrm_square_templates`（模板表）

| 字段 | 类型 | 说明 |
|-----|------|-----|
| id | string | UUID |
| title | string | 标题（必填） |
| category | string | 分类（可为空，默认"女装"） |
| author | string | 作者（可为空，默认""） |
| cover_url | string | 封面 OSS URL |
| video_url | string | 视频 OSS URL |
| sort_order | number | 排序权重 |
| is_enabled | boolean | 是否启用 |
| creator_id | string | 创建者 ID |
| created_at | number | 创建时间戳 |

### `nrm_video_script_assoc`（视频脚本关联表）

| 字段 | 类型 | 说明 |
|-----|------|-----|
| id | string | UUID |
| video_source | string | 视频来源类型 |
| video_id | string | 视频标识（模板 ID） |
| video_url | string | 视频 OSS URL |
| script_id | string | 脚本 ID（创建时为 null） |
| user_id | string | 用户 ID |
| entry_point | string | 入口点（创建时为 null） |
| created_at | number | 创建时间戳 |
| updated_at | number | 更新时间戳 |

## 改造内容

### 1. 前端改造

#### 1.1 视频上传后自动截取首帧

**触发时机**：用户选择视频文件后立即执行

**实现方式**：使用 `@webav/av-cliper` 截取首帧

```typescript
// 核心逻辑
const handleVideoUpload = async (file: File) => {
  // 1. 显示视频预览（Blob URL）
  const videoBlobUrl = URL.createObjectURL(file);
  setNewTemplate(prev => ({ ...prev, videoUrl: videoBlobUrl, videoFile: file }));

  // 2. 尝试截取首帧
  try {
    const firstFrameBlob = await extractFirstFrame(file);
    const coverBlobUrl = URL.createObjectURL(firstFrameBlob);
    setNewTemplate(prev => ({
      ...prev,
      coverUrl: coverBlobUrl,
      coverFile: firstFrameBlob, // 存储 Blob 用于后续 OSS 上传
    }));
  } catch (error) {
    // 截取失败，提示用户手动上传封面
    showExtractFailedTip();
  }
};
```

#### 1.2 首帧截取失败处理

- 显示提示信息："自动截取首帧失败，请手动上传封面"
- 保留封面上传按钮，用户可手动选择图片

#### 1.3 保留封面上传按钮

- 用户可在截取成功后手动替换封面
- 截取失败时引导用户手动上传

#### 1.4 表单验证调整

- `title` 必填（保持不变）
- `category` 可为空，默认值 `"女装"`
- `author` 可为空，默认值 `""`
- `coverUrl` 仍然必填（截取或手动上传）

#### 1.5 提交流程

```typescript
const handleAddSave = async () => {
  // 1. 校验标题
  if (!newTemplate.title) {
    alert('请填写标题');
    return;
  }

  // 2. 校验封面（必须有截取或手动上传）
  if (!newTemplate.coverUrl || !newTemplate.coverFile) {
    alert('请上传视频或手动上传封面');
    return;
  }

  // 3. 上传视频到 OSS
  const videoUrl = await uploadVideo(newTemplate.videoFile);

  // 4. 上传封面到 OSS（coverFile 可能是 File 或 Blob）
  const coverUrl = await uploadCover(newTemplate.coverFile);

  // 5. 调用后端创建模板
  await apiRequest('/admin/square-templates', {
    method: 'POST',
    body: {
      title: newTemplate.title,
      category: newTemplate.category || '女装',
      author: newTemplate.author || '',
      coverUrl,
      videoUrl,
      sortOrder: newTemplate.sortOrder,
      isEnabled: newTemplate.isEnabled,
    },
  });
};
```

### 2. 后端改造

#### 2.1 创建模板接口调整

**文件**：`src/routes/square-template-routes.ts`

**改动**：
- 移除 `category`、`author` 必填校验
- 仅校验 `title` 必填

```typescript
// 改造前
if (!body.title || !body.category || !body.author || !body.coverUrl) {
  return reply.code(400).send({
    success: false,
    message: "标题、分类、作者和封面为必填项",
  });
}

// 改造后
if (!body.title || !body.coverUrl) {
  return reply.code(400).send({
    success: false,
    message: "标题和封面为必填项",
  });
}
```

#### 2.2 写入 `nrm_video_script_assoc`

**文件**：`src/routes/square-template-routes.ts` 或新建 service

**时机**：模板创建成功后

```typescript
// 创建模板后
const template = await templateService.create({
  title: body.title,
  category: body.category || '女装',
  author: body.author || '',
  coverUrl: body.coverUrl,
  videoUrl: body.videoUrl,
  creatorId: user.id,
});

// 写入关联表
await insertVideoScriptAssoc(ctx.pool, {
  id: crypto.randomUUID(),
  videoSource: 'template',
  videoId: template.id,
  videoUrl: template.videoUrl,
  scriptId: null,
  userId: user.id,
  entryPoint: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});
```

## 数据流

```
用户选择视频文件
    ↓
webav 截取首帧 Blob（前端）
    ↓
显示预览（视频 Blob URL + 封面 Blob URL）
    ↓
用户填写标题（可选：替换封面、填写分类/作者）
    ↓
用户点击提交
    ↓
前端上传视频到 OSS → 获得 videoUrl
前端上传封面 Blob 到 OSS → 获得 coverUrl
    ↓
调用 POST /admin/square-templates
    ↓
后端写入 nrm_square_templates
后端写入 nrm_video_script_assoc（scriptId=null）
    ↓
返回成功，刷新列表
```

## 错误处理

| 错误场景 | 处理方式 |
|---------|---------|
| 首帧截取失败 | 前端提示，引导手动上传封面 |
| 视频 OSS 上传失败 | 前端提示"视频上传失败"，阻止提交 |
| 封面 OSS 上传失败 | 前端提示"封面上传失败"，阻止提交 |
| 后端创建模板失败 | 前端提示"创建模板失败"，显示后端错误消息 |
| 写入关联表失败 | 后端记录错误日志，不影响模板创建结果 |

## 测试要点

| 测试项 | 验证方法 |
|-------|---------|
| 首帧截取成功 | 上传 mp4 视频，检查封面预览是否自动显示 |
| 首帧截取失败 | 上传损坏文件，检查是否显示失败提示 |
| 手动替换封面 | 截取成功后，点击封面上传按钮替换 |
| 视频预览放大 | 点击视频预览按钮，检查全屏弹窗 |
| 图片预览放大 | 点击封面缩略图，检查全屏弹窗 |
| 提交成功 | 填写标题，提交后检查列表新增记录 |
| OSS 存储 | 检查 OSS 控制台，视频和封面存储位置 |
| 关联表写入 | 查询 `nrm_video_script_assoc` 对应记录 |
| 分类作者为空 | 不填分类和作者，检查默认值 |

## 验证 SQL

```sql
-- 查询刚创建的模板
SELECT * FROM nrm_square_templates ORDER BY created_at DESC LIMIT 1;

-- 查询关联记录
SELECT * FROM nrm_video_script_assoc WHERE video_source = 'template' ORDER BY created_at DESC LIMIT 5;
```

## 文件改动清单

| 文件 | 改动内容 |
|-----|---------|
| `apps/web/pages/admin/SquareTemplateManagement.tsx` | 新增首帧截取逻辑，调整表单验证 |
| `src/routes/square-template-routes.ts` | 调整必填校验，新增关联表写入 |
| `src/persistence/video-script-assoc-db-operations.ts` | 可能需要调整或复用现有写入函数 |

## 依赖

- `@webav/av-cliper`：已安装于项目中
- 阿里云 OSS：已配置，通过 `oss-service.ts` 封装