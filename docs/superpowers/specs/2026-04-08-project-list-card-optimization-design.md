# 项目列表卡片优化设计

## 需求概述

1. 项目列表按最新修改时间倒序排列
2. 卡片展示创建时间和最后修改时间（相对时间格式）
3. 已完成视频项目可点击播放视频

## 设计方案

### 第一节：后端改动

**文件**: `src/routes/user-routes.ts`

**改动点**:

1. `/me/projects` API 返回数据增加 `updatedAt` 字段

```typescript
// 第 180-194 行区域
return {
  id: p.id,
  name: p.name,
  status: p.status,
  thumbnailUrl: await resolvePreferredProjectThumbnailUrl(p),
  formatLabel: p.formatLabel,
  durationSec: p.durationSec,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,  // 新增
  views: p.views,
  lastVisitedStep: p.lastVisitedStep,
  lastReverseTaskId: p.lastReverseTaskId,
  lastReverseScriptVersionId: p.lastReverseScriptVersionId,
  lastReverseLibraryScriptId,
  projectKind: p.projectKind,
  exportUrl: p.exportUrl,
};
```

2. 删除手动 `.reverse()`，改为按 `updatedAt` 倒序排序

```typescript
// 第 196 行：删除 projects.reverse()
// 替换为：
projects.sort((a, b) => b.updatedAt - a.updatedAt);
return { projects };
```

**现状分析**:
- 数据库已有 `updated_at` 字段（`src/repositories/pg/project-pg-repository.ts` 第 30 行已映射为 `updatedAt`）
- 当前后端路由手动 `.reverse()` 翻转数组（第 196 行）
- 前端 API 类型定义缺少 `updatedAt`

---

### 第二节：前端数据层改动

**文件 1**: `apps/web/types.ts`

```typescript
export interface Project {
  id: string;
  title: string;
  thumbnail: string;
  status: 'draft' | 'processing' | 'completed';
  projectKind?: 'image' | 'video';
  resumeStatus?: string;
  lastVisitedStep?: number;
  lastReverseTaskId?: string | null;
  lastReverseScriptVersionId?: string | null;
  lastReverseLibraryScriptId?: string | null;
  type: string;
  duration?: string;
  aspectRatio?: string;
  createdAt: string;
  updatedAt: string;  // 新增
  views?: number;
  exportUrl?: string | null;
}
```

**文件 2**: `apps/web/services/realApi/projects.ts`

```typescript
myProjects(token: string): Promise<{
  projects: Array<{
    id: string;
    name: string;
    status: string;
    createdAt: number;
    updatedAt: number;  // 新增
    thumbnailUrl: string;
    formatLabel: string;
    durationSec: number;
    views: number;
    lastVisitedStep: number;
    lastReverseTaskId: string | null;
    lastReverseScriptVersionId: string | null;
    lastReverseLibraryScriptId: string | null;
    projectKind: "image" | "video";
    exportUrl: string | null;
  }>;
}>;
```

**文件 3**: `apps/web/pages/projects/MyProjects.tsx`

数据映射增加 `updatedAt`：

```typescript
// 第 119-134 行区域
return response.projects.map((project) => ({
  id: project.id,
  title: project.name,
  thumbnail: project.thumbnailUrl || 'https://placehold.co/450x800/1a1a1a/FFF?text=Project+Preview',
  status: (COMPLETED_BACKEND_STATUS.has(project.status) ? 'completed' : 'draft') as Project['status'],
  projectKind: project.projectKind,
  resumeStatus: project.status,
  lastVisitedStep: project.lastVisitedStep,
  lastReverseTaskId: project.lastReverseTaskId ?? null,
  lastReverseScriptVersionId: project.lastReverseScriptVersionId ?? null,
  lastReverseLibraryScriptId: project.lastReverseLibraryScriptId ?? null,
  type: project.formatLabel || `${project.durationSec ?? 30}秒 • 9:16`,
  createdAt: formatRelativeTime(project.createdAt),
  updatedAt: formatRelativeTime(project.updatedAt),  // 新增
  views: project.views ?? 0,
  exportUrl: project.exportUrl,
}));
```

---

### 第三节：时间显示改动

**文件**: `apps/web/pages/projects/MyProjects.tsx`

**新增时间格式化函数**:

```typescript
const formatRelativeTime = (timestamp: number | string | null | undefined): string => {
  if (timestamp === null || timestamp === undefined) return '刚刚';
  const numericTimestamp = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
  if (!Number.isFinite(numericTimestamp) || numericTimestamp <= 0) return '刚刚';

  const date = new Date(numericTimestamp);
  if (isNaN(date.getTime())) return '刚刚';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const timeStr = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

  if (diffDays === 0) return `今天 ${timeStr}`;
  if (diffDays === 1) return `昨天 ${timeStr}`;
  if (diffDays < 7) return `${diffDays}天前 ${timeStr}`;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
```

**时间显示改为双行**（第 518-525 行区域）:

```tsx
<div className="flex flex-col gap-0.5 text-sm text-gray-500">
  <span className="flex items-center gap-1">
    <span className="material-icons-round text-xs">schedule</span>
    创建：{project.createdAt}
  </span>
  <span className="flex items-center gap-1">
    <span className="material-icons-round text-xs">update</span>
    修改：{project.updatedAt}
  </span>
</div>
```

---

### 第四节：播放角标 + 视频弹窗

**文件**: `apps/web/pages/projects/MyProjects.tsx`

**新增弹窗状态管理**:

```typescript
const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);

const openVideoPreview = (url: string) => setPreviewVideoUrl(url);
const closeVideoPreview = () => setPreviewVideoUrl(null);
```

**缩略图右下角播放角标**（第 436-445 行区域）:

```tsx
<div
  className="w-full md:w-48 aspect-video bg-gray-100 rounded-lg overflow-hidden relative shrink-0"
  onClick={() => {
    if (project.status === 'completed' && project.projectKind === 'video' && project.exportUrl) {
      openVideoPreview(project.exportUrl);
    }
  }}
>
  <img src={project.thumbnail} className="w-full h-full object-cover" alt={project.title} />
  <div className="absolute inset-0 bg-black/10"></div>

  {/* 已完成视频项目：右下角播放角标 */}
  {project.status === 'completed' && project.projectKind === 'video' && project.exportUrl && (
    <div className="absolute bottom-2 right-2 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow-md">
      <span className="material-icons-round text-primary text-lg">play_arrow</span>
    </div>
  )}
</div>
```

**极简视频弹窗组件**:

```tsx
{previewVideoUrl && (
  <div
    className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
    onClick={closeVideoPreview}
  >
    {/* 关闭按钮 */}
    <button
      onClick={closeVideoPreview}
      className="absolute top-4 right-4 w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20"
    >
      <span className="material-icons-round">close</span>
    </button>

    {/* 视频播放器 */}
    <video
      src={previewVideoUrl}
      controls
      autoPlay
      onClick={(e) => e.stopPropagation()}
      className="max-w-[90vw] max-h-[90vh] rounded-lg"
    />
  </div>
)}
```

---

## 改动文件清单

| 文件 | 改动类型 |
|------|---------|
| `src/routes/user-routes.ts` | 后端 API 返回 `updatedAt` + 排序 |
| `apps/web/types.ts` | 前端类型增加 `updatedAt` |
| `apps/web/services/realApi/projects.ts` | API 类型定义增加 `updatedAt` |
| `apps/web/pages/projects/MyProjects.tsx` | 数据映射、时间格式化、播放角标、视频弹窗 |

---

## 测试验证

1. 创建新项目 → 项目应出现在列表顶部
2. 编辑旧项目 → 该项目应跳到列表顶部
3. 已完成视频项目 → 缩略图右下角显示播放角标
4. 点击播放角标 → 弹窗打开并自动播放视频
5. 点击弹窗背景或关闭按钮 → 弹窗关闭