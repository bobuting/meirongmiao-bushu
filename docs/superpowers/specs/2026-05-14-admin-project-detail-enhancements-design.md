# 管理后台项目详情页增强设计

## 概述

对 `/admin-portal?tab=projects` 项目详情弹窗（ProjectDetailModal）进行 5 项功能增强。

## 1. Step2 角色按 source_type 分组 + 五视图预览

### 后端改动

**文件**: `src/routes/admin/projects-routes.ts`

角色查询 SQL（约 260 行）补齐字段：
```sql
SELECT pc.id, pc.library_character_id, lc.name, lc.thumbnail_url,
       lc.five_view_oss_image_url, pc.is_selected,
       pc.source_type, pc.role, lc.active_five_view_id
FROM nrm_project_characters pc
JOIN nrm_library_characters lc ON pc.library_character_id = lc.id
WHERE pc.project_id = $1 AND pc.deleted_at IS NULL
ORDER BY pc.source_type, pc.is_selected DESC, pc.created_at
```

返回映射增加 `sourceType`, `role`, `activeFiveViewId` 字段。

新增五视图查询，按 character 分组返回：
```sql
SELECT cfv.library_character_id, cfv.image_url, cfv.view_type
FROM nrm_character_five_views cfv
JOIN nrm_project_characters pc ON cfv.library_character_id = pc.library_character_id
WHERE pc.project_id = $1 AND pc.deleted_at IS NULL
ORDER BY cfv.library_character_id, cfv.sort_order
```
每个 character 对象增加 `fiveViewUrls: string[]` 字段（该角色的五视图图片列表）。

### 前端改动

**文件**: `apps/web/pages/admin/ProjectDetailModal.tsx`

Step2 角色区域改为分组展示：
```
AI 生成角色 (2)
  [角色卡片 grid]
角色库角色 (3)
  [角色卡片 grid]
```

- 按 `sourceType` 分为 `generated` 和 `library` 两组
- 每组有 section 标题 + 数量
- 点击角色 → ImageLightbox 打开该角色的五视图（用 `frames` 传入五视图图片数组）

---

## 2. 图片预览支持上下张

### 核心改动

**文件**: `apps/web/pages/admin/ProjectDetailModal.tsx`

状态从单图改为多图：
```typescript
// 之前
const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

// 之后
const [previewImages, setPreviewImages] = useState<{ frames: string[]; index: number } | null>(null);
```

ImageLightbox 调用改为：
```tsx
{previewImages && (
  <ImageLightbox
    url={previewImages.frames[previewImages.index]}
    frames={previewImages.frames}
    currentIndex={previewImages.index}
    onNavigate={(i) => setPreviewImages({ frames: previewImages.frames, index: i })}
    open={true}
    onClose={() => setPreviewImages(null)}
  />
)}
```

### 各区域需收集的图片列表

| 区域 | 图片来源 | 收集方式 |
|------|---------|---------|
| Step1 服饰 | `garment.imageUrl` | `garments.map(g => g.imageUrl).filter(Boolean)` |
| Step2 角色 | `char.thumbnailUrl` | 同组 characters 的所有 thumbnailUrl |
| Step2 五视图 | `view.image_url` | `characterViews.map(v => v.image_url).filter(Boolean)` |
| Step2 角色预设 | 单图 | 无导航（或传单元素 frames） |
| Step3 模特图 | `photo.imageUrl` | `modelPhotos.map(p => p.imageUrl).filter(Boolean)` |
| Step3 分镜 | `sb.selectedImageUrl` | `storyboards.map(s => s.selectedImageUrl).filter(Boolean)` |
| Step4 板块 | `section.imageUrl` | `pageSections.map(s => s.imageUrl).filter(Boolean)` |
| Step6 分镜任务 | `item.imageUrl` | `taskItems.map(i => i.imageUrl).filter(Boolean)` |
| 基本信息封面 | 单图 | 无导航 |

---

## 3. 分享功能扩展

### 图片项目 Step4 分享

**文件**: `apps/web/pages/admin/ProjectDetailModal.tsx`

Step4 tab 内容区（图片项目分支，约 686 行）顶部增加分享按钮：
```tsx
{detail.basicInfo.projectKind === 'image' && (
  <div className="flex justify-end mb-4">
    <button onClick={() => setShareModalOpen(true)} ...>
      分享作品
    </button>
  </div>
)}
```

分享弹窗中原有的「成片视频」文案对图片项目改为「电商详情页」：
- URL 格式：`/share-image/${projectId}`
- 提示文案：「公开分享链接，无需登录即可查看电商详情页」

---

## 4. 反推项目源脚本

### 后端

**文件**: `src/routes/admin/projects-routes.ts`

项目详情接口 `basicInfo` 增加 `reverseScriptId`。

新增路由 `GET /admin/reverse-scripts/:id`：
- 查询反推脚本库中对应脚本的完整数据（含 payload JSON）

### 前端

**文件**: `apps/web/services/realApi/admin.ts`

新增 `getAdminReverseScript(token, scriptId)` 接口函数。

**文件**: `apps/web/pages/admin/ProjectScriptsTab.tsx`

增加可选 prop `reverseScriptId`。当 project 为 reverse 类型时，在脚本列表上方展示「源脚本」卡片：
```
┌─ 源脚本（反推来源） ─────────────────────────────┐
│ 标题: xxx  │  复制 JSON                       │
│ { ... reverse script JSON ... }               │
└────────────────────────────────────────────────┘
```

---

## 5. 资源消耗积分列表标题

### 改动

**文件**: `apps/web/pages/admin/ProjectDetailModal.tsx`

资源消耗 tab 中（约 1311 行），`ProjectCreditList` 前面增加 section 标题：

```tsx
<div>
  <div className="text-sm font-medium text-gray-700 mb-3">
    积分消耗明细 ({detail.resourceConsumption.creditConsumption ?? 0} 积分)
  </div>
  <ProjectCreditList projectId={detail.basicInfo.id} />
</div>
```

`ProjectCreditList` 内部保持现有逻辑：加载中 → 暂无积分记录 → 表格。

---

## 涉及文件清单

| 文件 | 改动类型 |
|------|---------|
| `src/routes/admin/projects-routes.ts` | 角色查询加字段、五视图查询、reverseScriptId、新增源脚本接口 |
| `apps/web/services/realApi/admin.ts` | 新增 getAdminReverseScript、角色类型字段 |
| `apps/web/pages/admin/ProjectDetailModal.tsx` | 角色分组、图片导航、分享扩展、积分标题 |
| `apps/web/pages/admin/ProjectScriptsTab.tsx` | 反推源脚本展示 |

## 验证方式

1. 启动前后端服务
2. 打开 `/admin-portal?tab=projects`
3. 点击项目进入详情：
   - Step2: 角色按 AI/库分组显示，点击可翻看五视图
   - 各区域图片点击后支持左右箭头切换
   - 图片项目 Step4 有分享按钮，点击生成分享链接
   - 反推项目脚本JSON tab 显示源脚本
   - 资源消耗积分明细有标题
