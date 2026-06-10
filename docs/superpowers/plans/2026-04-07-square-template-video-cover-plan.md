# 创作广场模板新增功能改造实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 改造创作广场新增模板功能，实现用户上传视频后自动截取首帧作为封面，提交后存储到 OSS 并写入数据库。

**架构：** 前端使用 `@webav/av-cliper` 截取首帧 Blob，上传视频和封面到 OSS；后端接收 OSS URL 写入 `nrm_square_templates` 和 `nrm_video_script_assoc` 表。

**技术栈：** React 18, TypeScript, @webav/av-cliper, Fastify 5, PostgreSQL, 阿里云 OSS

---

## 文件结构

| 文件 | 职责 |
|-----|------|
| `apps/web/libs/video-frame-extract.ts` | **新建** - 首帧截取核心函数 |
| `apps/web/pages/admin/SquareTemplateManagement.tsx` | **修改** - 改造新增模板弹窗，集成首帧截取 |
| `src/routes/square-template-routes.ts` | **修改** - 调整必填校验，新增关联表写入 |
| `src/persistence/video-script-assoc-db-operations.ts` | **修改** - 新增支持 scriptId 为 null 的写入函数 |

---

## 任务 1：新建首帧截取工具函数

**文件：**
- 创建：`apps/web/libs/video-frame-extract.ts`

- [ ] **步骤 1：编写首帧截取函数**

```typescript
/**
 * 视频首帧截取工具
 * 使用 @webav/av-cliper 从视频中截取首帧作为封面图片
 */

import { MP4Clip } from '@webav/av-cliper';

/**
 * 首帧截取结果
 */
export interface FirstFrameResult {
  /** 首帧 Blob（用于预览和上传） */
  blob: Blob;
  /** Blob URL（用于前端预览） */
  url: string;
}

/**
 * 首帧截取选项
 */
export interface ExtractFirstFrameOptions {
  /** 视频文件 */
  videoFile: File;
  /** 输出图片格式，默认 'image/jpeg' */
  outputFormat?: 'image/jpeg' | 'image/png' | 'image/webp';
  /** 图片质量（0-1），仅对 jpeg/webp 有效，默认 0.9 */
  quality?: number;
}

/**
 * 从视频中截取首帧
 * 使用 MP4Clip 的 tick 方法获取第一帧
 *
 * @param options 截取选项
 * @returns 首帧 Blob 和 URL
 */
export async function extractFirstFrame(
  options: ExtractFirstFrameOptions
): Promise<FirstFrameResult> {
  const { videoFile, outputFormat = 'image/jpeg', quality = 0.9 } = options;

  // 创建 MP4Clip
  const clip = new MP4Clip(videoFile.stream());

  try {
    // 等待 clip 准备就绪
    await clip.ready;

    // 使用 tick(0) 获取第一帧（时间戳为 0）
    const result = await clip.tick(0);
    const videoFrame = result.video;

    if (!videoFrame) {
      throw new Error('无法获取视频首帧');
    }

    // 将 VideoFrame 或 ImageBitmap 转换为 Blob
    let bitmap: ImageBitmap;
    if (videoFrame instanceof ImageBitmap) {
      bitmap = videoFrame;
    } else {
      // VideoFrame 转 ImageBitmap
      bitmap = await createImageBitmap(videoFrame);
      videoFrame.close();
    }

    // 使用 Canvas 将 ImageBitmap 转换为 Blob
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      bitmap.close();
      throw new Error('无法创建 Canvas 上下文');
    }

    // 绘制图片
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    // 转换为 Blob
    const blob = await canvas.convertToBlob({
      type: outputFormat,
      quality,
    });

    // 创建 Blob URL
    const url = URL.createObjectURL(blob);

    return { blob, url };
  } finally {
    // 清理资源
    clip.destroy();
  }
}

/**
 * 检查浏览器是否支持首帧截取功能
 */
export async function checkFirstFrameExtractSupport(): Promise<{
  supported: boolean;
  reason?: string;
}> {
  // 检查 WebCodecodes 支持
  if (typeof VideoEncoder === 'undefined') {
    return {
      supported: false,
      reason: '您的浏览器不支持 WebCodecs API，请使用最新版本的 Chrome、Edge 或 Firefox 浏览器',
    };
  }

  // 检查 OffscreenCanvas 支持
  if (typeof OffscreenCanvas === 'undefined') {
    return {
      supported: false,
      reason: '您的浏览器不支持 OffscreenCanvas，请使用最新版本的浏览器',
    };
  }

  return { supported: true };
}
```

- [ ] **步骤 2：Commit 首帧截取函数**

```bash
git add apps/web/libs/video-frame-extract.ts
git commit -m "feat: 新增视频首帧截取工具函数"
```

---

## 任务 2：改造后端 - 调整必填校验

**文件：**
- 修改：`src/routes/square-template-routes.ts:287-327`

- [ ] **步骤 1：修改 createTemplate handler 的必填校验**

定位到 `createTemplate` handler 中的验证逻辑（约第 301-307 行），修改为：

```typescript
// 改造前（第 301-307 行）
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

- [ ] **步骤 2：修改 createTemplate handler 的默认值处理**

定位到 `templateService.create` 调用（约第 310-321 行），修改为：

```typescript
// 改造前
const template = await templateService.create({
  title: body.title,
  category: body.category,
  author: body.author,
  coverUrl: body.coverUrl,
  videoUrl: body.videoUrl,
  views: body.views,
  likes: body.likes,
  sortOrder: body.sortOrder,
  isEnabled: body.isEnabled,
  creatorId: user.id,
});

// 改造后
const template = await templateService.create({
  title: body.title,
  category: body.category || '女装',
  author: body.author || '',
  coverUrl: body.coverUrl,
  videoUrl: body.videoUrl,
  views: body.views,
  likes: body.likes,
  sortOrder: body.sortOrder,
  isEnabled: body.isEnabled,
  creatorId: user.id,
});
```

- [ ] **步骤 3：Commit 后端校验改造**

```bash
git add src/routes/square-template-routes.ts
git commit -m "feat: 调整创建模板接口必填校验，分类和作者可为空"
```

---

## 任务 3：改造后端 - 新增关联表写入函数

**文件：**
- 修改：`src/persistence/video-script-assoc-db-operations.ts`

- [ ] **步骤 1：新增支持 scriptId 为 null 的插入函数**

在文件末尾（约第 163 行后）添加新函数：

```typescript
/**
 * 创建模板视频关联记录（scriptId 为 null）
 * 用于模板创建时记录视频来源，后续用户复刻时再关联脚本
 *
 * 注意：此函数不使用 upsert，因为 scriptId 为 null 时可能存在多条记录
 */
export async function insertTemplateVideoAssoc(
  pool: Pool,
  input: {
    videoId: string;
    videoUrl: string | null;
    userId: string;
  }
): Promise<VideoScriptAssocRecord> {
  const id = crypto.randomUUID();
  const now = Date.now();

  const result = await pool.query<VideoScriptAssocRecord>(
    `INSERT INTO nrm_video_script_assoc (
      id, video_source, video_id, video_url, script_id, user_id, entry_point, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      id,
      'template',           // videoSource 固定为 'template'
      input.videoId,
      input.videoUrl,
      null,                 // scriptId 为 null
      input.userId,
      null,                 // entryPoint 为 null
      now,
      now,
    ]
  );
  return result.rows[0]!;
}
```

- [ ] **步骤 2：Commit 关联表写入函数**

```bash
git add src/persistence/video-script-assoc-db-operations.ts
git commit -m "feat: 新增 insertTemplateVideoAssoc 函数支持 scriptId 为 null"
```

---

## 任务 4：改造后端 - 创建模板时写入关联表

**文件：**
- 修改：`src/routes/square-template-routes.ts:287-327`

- [ ] **步骤 1：导入关联表写入函数**

在文件顶部导入区域（约第 15-17 行后）添加导入：

```typescript
import { insertTemplateVideoAssoc } from "../persistence/video-script-assoc-db-operations.js";
```

- [ ] **步骤 2：在 createTemplate handler 中写入关联表**

定位到模板创建成功后（约第 321-323 行），在返回响应前添加关联表写入：

```typescript
// 创建模板
const template = await templateService.create({
  title: body.title,
  category: body.category || '女装',
  author: body.author || '',
  coverUrl: body.coverUrl,
  videoUrl: body.videoUrl,
  views: body.views,
  likes: body.likes,
  sortOrder: body.sortOrder,
  isEnabled: body.isEnabled,
  creatorId: user.id,
});

// ===== 新增：写入视频脚本关联表 =====
try {
  await insertTemplateVideoAssoc(ctx.pool, {
    videoId: template.id,
    videoUrl: template.videoUrl,
    userId: user.id,
  });
} catch (assocError) {
  // 关联表写入失败不影响模板创建，只记录日志
  console.error('[createTemplate] 写入关联表失败:', assocError);
}

return reply.send({ success: true, data: template });
```

- [ ] **步骤 3：Commit 关联表写入逻辑**

```bash
git add src/routes/square-template-routes.ts
git commit -m "feat: 创建模板时同步写入视频脚本关联表"
```

---

## 任务 5：改造前端 - 集成首帧截取功能

**文件：**
- 修改：`apps/web/pages/admin/SquareTemplateManagement.tsx`

- [ ] **步骤 1：导入首帧截取函数**

在文件顶部导入区域（约第 9 行后）添加：

```typescript
import { extractFirstFrame } from '../../libs/video-frame-extract';
```

- [ ] **步骤 2：新增首帧截取失败提示状态**

在组件状态定义区域（约第 108 行后，`previewMedia` 状态后）添加：

```typescript
// 首帧截取失败提示
const [firstFrameExtractFailed, setFirstFrameExtractFailed] = useState(false);
```

- [ ] **步骤 3：修改 handleAddVideoChange 函数**

定位到 `handleAddVideoChange` 函数（约第 395-403 行），修改为：

```typescript
/**
 * 处理新增视频文件选择
 * 上传视频后自动截取首帧作为封面预览
 */
const handleAddVideoChange = useCallback(async (file: File | null) => {
  if (!file) return;

  // 显示视频预览
  const videoUrl = URL.createObjectURL(file);
  setNewTemplate(prev => ({
    ...prev,
    videoUrl: videoUrl,
    videoFile: file,
  }));

  // 尝试截取首帧
  setFirstFrameExtractFailed(false);
  try {
    const result = await extractFirstFrame({ videoFile: file });
    // 截取成功，自动填充封面
    setNewTemplate(prev => ({
      ...prev,
      coverUrl: result.url,
      coverFile: result.blob as File, // 存储 Blob 用于后续上传
    }));
  } catch (error) {
    console.error('[handleAddVideoChange] 首帧截取失败:', error);
    setFirstFrameExtractFailed(true);
  }
}, []);
```

- [ ] **步骤 4：修改 handleAddSave 函数的 coverFile 类型处理**

定位到 `handleAddSave` 函数（约第 276-344 行），修改 `uploadCover` 调用部分以支持 Blob 类型：

```typescript
/**
 * 上传封面图片
 * 支持 File 和 Blob 类型
 */
const uploadCover = useCallback(async (file: File | Blob): Promise<string | null> => {
  try {
    const formData = new FormData();
    // Blob 需要转换为 File 格式才能上传
    if (file instanceof Blob && !(file instanceof File)) {
      const fileFromBlob = new File([file], `cover_${Date.now()}.jpg`, { type: 'image/jpeg' });
      formData.append('file', fileFromBlob);
    } else {
      formData.append('file', file);
    }
    const data = await apiRequest('/admin/square-templates/upload-cover', {
      method: 'POST',
      body: formData,
    });
    if (data.success) {
      return data.data.coverUrl;
    }
    return null;
  } catch (error) {
    console.error('上传封面失败:', error);
    return null;
  }
}, [apiRequest]);
```

注意：需要修改原有的 `uploadCover` 函数（约第 176-192 行）以支持 Blob。

- [ ] **步骤 5：修改 handleAddSave 中的封面校验**

定位到封面校验部分（约第 303-307 行），修改为：

```typescript
// 检查封面是否存在（截取或手动上传）
if (!coverUrl) {
  alert('请上传视频以自动生成封面，或手动上传封面图片');
  return;
}
```

- [ ] **步骤 6：Commit 前端首帧截取集成**

```bash
git add apps/web/pages/admin/SquareTemplateManagement.tsx
git commit -m "feat: 新增模板弹窗集成视频首帧自动截取功能"
```

---

## 任务 6：改造前端 - 显示首帧截取失败提示

**文件：**
- 修改：`apps/web/pages/admin/SquareTemplateManagement.tsx`

- [ ] **步骤 1：在视频上传区域添加失败提示**

定位到新增模板弹窗的视频上传区域（约第 811-845 行），在视频预览后添加提示：

```typescript
{/* 视频 */}
<div>
  <label className="block text-sm font-medium text-text-secondary mb-2">视频</label>
  <div className="flex items-start gap-4">
    <label className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-gray-300 text-sm cursor-pointer transition-colors hover:border-primary hover:text-primary">
      <input
        ref={addVideoInputRef}
        type="file"
        accept="video/*"
        onChange={(e) => handleAddVideoChange(e.target.files?.[0] || null)}
        className="hidden"
      />
      <span className="material-icons-round text-lg">video_file</span>
      选择视频文件
    </label>
    {newTemplate.videoUrl && (
      <div className="flex items-center gap-2">
        <video
          ref={addVideoRef}
          src={newTemplate.videoUrl}
          className="w-24 h-32 object-cover rounded-lg border border-gray-200 bg-black"
        />
        <button
          type="button"
          onClick={() => setPreviewMedia({ type: 'video', url: newTemplate.videoUrl })}
          className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
          title="全屏预览"
        >
          <span className="material-icons-round text-primary">fullscreen</span>
        </button>
      </div>
    )}
  </div>
  {/* ===== 新增：首帧截取失败提示 ===== */}
  {firstFrameExtractFailed && (
    <p className="mt-2 text-sm text-orange-500">
      自动截取首帧失败，请手动上传封面图片
    </p>
  )}
  {newTemplate.videoFile && !firstFrameExtractFailed && (
    <p className="mt-2 text-sm text-text-muted">已选择: {newTemplate.videoFile.name}</p>
  )}
</div>
```

- [ ] **步骤 2：修改封面区域提示文案**

定位到封面上传区域（约第 779-808 行），修改 label 文案：

```typescript
{/* 封面 */}
<div>
  <label className="block text-sm font-medium text-text-secondary mb-2">封面（上传视频后自动截取，也可手动上传）</label>
  {/* ... 保持原有代码不变 ... */}
</div>
```

- [ ] **步骤 3：修改封面区域的必填标记**

定位到封面 label（约第 780 行），移除必填标记 `*`，改为说明文案：

```typescript
<label className="block text-sm font-medium text-text-secondary mb-2">封面</label>
<p className="text-xs text-text-muted mb-2">上传视频后自动截取首帧，如不满意可手动上传替换</p>
```

- [ ] **步骤 4：修改表单验证按钮禁用条件**

定位到保存按钮（约第 913-918 行），修改禁用条件：

```typescript
// 改造前
disabled={!newTemplate.title || !newTemplate.author}

// 改造后（仅校验标题必填）
disabled={!newTemplate.title}
```

- [ ] **步骤 5：修改保存按钮上方的表单校验**

定位到 handleAddSave 函数开头的校验（约第 278-281 行），修改为：

```typescript
// 验证必填字段
if (!newTemplate.title) {
  alert('请填写标题');
  return;
}
```

- [ ] **步骤 6：重置表单时清理截取失败状态**

定位到取消按钮和保存成功后的表单重置（约第 893-906 行和第 326-339 行），添加状态重置：

```typescript
setFirstFrameExtractFailed(false);
```

- [ ] **步骤 7：Commit 前端提示和校验改造**

```bash
git add apps/web/pages/admin/SquareTemplateManagement.tsx
git commit -m "feat: 新增模板弹窗显示首帧截取失败提示，调整表单校验"
```

---

## 任务 7：改造前端 - 调整分类和作者为可选

**文件：**
- 修改：`apps/web/pages/admin/SquareTemplateManagement.tsx`

- [ ] **步骤 1：移除分类和作者的必填标记**

定位到分类和作者的 label（约第 756 行和第 767 行），移除 `*`：

```typescript
// 改造前
<label className="block text-sm font-medium text-text-secondary mb-1">分类 *</label>
<label className="block text-sm font-medium text-text-secondary mb-1">作者 *</label>

// 改造后
<label className="block text-sm font-medium text-text-secondary mb-1">分类</label>
<label className="block text-sm font-medium text-text-secondary mb-1">作者</label>
```

- [ ] **步骤 2：Commit 分类作者可选改造**

```bash
git add apps/web/pages/admin/SquareTemplateManagement.tsx
git commit -m "feat: 新增模板弹窗分类和作者改为可选字段"
```

---

## 任务 8：编译验证

- [ ] **步骤 1：编译后端**

```bash
npm run build
```

预期：编译成功，无 TypeScript 错误

- [ ] **步骤 2：编译前端**

```bash
npm --prefix apps/web run build
```

预期：编译成功，无 TypeScript 错误

- [ ] **步骤 3：Commit 编译验证**

```bash
git add -A
git commit -m "chore: 编译验证通过"
```

---

## 任务 9：集成测试验证

- [ ] **步骤 1：启动后端服务**

```bash
PERSISTENCE_REQUIRE_READY=false npm run dev
```

- [ ] **步骤 2：启动前端服务**

```bash
npm --prefix apps/web run dev
```

- [ ] **步骤 3：手动测试流程**

1. 打开浏览器访问 http://localhost:3000
2. 登录管理后台
3. 进入创作广场管理页面
4. 点击"新增模板"按钮
5. 上传一个 mp4 视频文件
6. 验证封面预览自动显示（首帧截取成功）
7. 填写标题（不填分类和作者）
8. 点击保存
9. 验证列表中出现新模板
10. 验证视频和封面都能点击放大预览

- [ ] **步骤 4：验证数据库写入**

```sql
-- 查询刚创建的模板
SELECT * FROM nrm_square_templates ORDER BY created_at DESC LIMIT 1;

-- 查询关联记录
SELECT * FROM nrm_video_script_assoc WHERE video_source = 'template' ORDER BY created_at DESC LIMIT 5;
```

预期：模板表中新增记录，关联表中新增一条 `script_id` 为 null 的记录

---

## 验证清单

| 验证项 | 预期结果 |
|-------|---------|
| 首帧截取成功 | 封面预览自动显示 |
| 首帧截取失败 | 显示橙色提示文案 |
| 手动上传封面 | 可替换截取的封面 |
| 视频预览放大 | 全屏弹窗正常播放 |
| 图片预览放大 | 全屏弹窗正常显示 |
| 标题必填校验 | 不填标题时保存按钮禁用 |
| 分类作者可选 | 不填时使用默认值 |
| OSS 上传成功 | 视频和封面 URL 正确 |
| 关联表写入 | script_id 为 null |