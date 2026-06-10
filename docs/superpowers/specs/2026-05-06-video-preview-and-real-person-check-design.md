# 视频预览与真人判断功能设计

**日期**：2026-05-06
**状态**：设计中
**涉及模块**：脚本中心（/reverse）、反推卡片详情

---

## 需求概述

为脚本中心 `/reverse` 页面的反推脚本卡片添加两个核心功能：

1. **视频预览**：在详情弹窗顶部显示原始视频，用户可直观查看反推来源
2. **真人判断**：投入创作时判断视频是否包含真人，无真人则阻止并弹窗提示

---

## 技术方案

### 方案选择

**采用方案 A：列表页预加载 + 详情页展示**

- 列表查询时返回 `videoUrl` 和 `hasRealPerson` 字段
- 详情弹窗直接使用已有数据，无需额外请求
- 优势：用户体验好，打开速度快，实现简单

---

## 数据结构变更

### 1. 扩展 `SquareReverseDeckSnapshot` 类型

**文件**：`apps/web/pages/square/squareReverseDeckSnapshot.ts`

```typescript
export interface SquareReverseDeckSnapshot {
  // ... 现有字段

  // 🆕 新增字段
  videoUrl?: string | null;       // OSS 视频链接
  coverUrl?: string | null;       // 视频封面图
  hasRealPerson?: boolean | null; // 是否有真人
}
```

**数据来源**：
- `videoUrl` ← `payload.video_analysis.sourceOssUrl`
- `coverUrl` ← `payload.video_analysis.coverUrl`
- `hasRealPerson` ← `payload.video_analysis.on_screen_presence.has_real_person`

### 2. 数据提取逻辑

**文件**：`apps/web/pages/reverse-script/ReverseScript.tsx`

在 `buildDeckSnapshotFromScriptRecord` 函数中提取：

```typescript
const videoAnalysis = payload?.video_analysis as Record<string, unknown> | undefined;
const videoUrl = videoAnalysis?.sourceOssUrl ?? null;
const coverUrl = videoAnalysis?.coverUrl ?? null;
const onScreenPresence = videoAnalysis?.on_screen_presence as Record<string, unknown> | undefined;
const hasRealPerson = onScreenPresence?.has_real_person ?? null;
```

---

## UI 实现

### 1. 视频预览区域

**文件**：`apps/web/pages/square/squareReverseDeckCard.tsx`

**位置**：摘要卡片和 Tab 切换之间

**样式**：
- 深色背景（`bg-gray-900`）
- 固定高度 192px（`h-48`）
- 对象包含模式（`object-contain`）
- 预加载元数据（`preload="metadata"`）
- 显示封面图（`poster={coverUrl}`）

**代码示例**：
```tsx
{snapshot.videoUrl && (
  <div className="mx-3 mt-3 rounded-xl overflow-hidden bg-gray-900 border border-gray-100">
    <video
      src={snapshot.videoUrl}
      controls
      poster={snapshot.coverUrl}
      className="w-full h-48 object-contain"
      preload="metadata"
    />
  </div>
)}
```

### 2. 真人标签

**位置**：关键词标签区域（头部渐变背景）

**样式**：
- 有真人：翡翠绿色（`bg-emerald-500/20 text-emerald-300`）+ `person` 图标
- 无真人：玫瑰红色（`bg-rose-500/20 text-rose-300`）+ `person_off` 图标

**代码示例**：
```tsx
{snapshot.hasRealPerson !== null && (
  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold ${
    snapshot.hasRealPerson
      ? 'bg-emerald-500/20 text-emerald-300'
      : 'bg-rose-500/20 text-rose-300'
  }`}>
    <span className="material-icons-round text-xs mr-1">
      {snapshot.hasRealPerson ? 'person' : 'person_off'}
    </span>
    {snapshot.hasRealPerson ? '检测到真人' : '未检测到真人'}
  </span>
)}
```

---

## 业务逻辑

### 投入创作阻断逻辑

**触发条件**：用户点击"投入创作"按钮

**判断逻辑**：
1. 检查 `deckSnapshot.hasRealPerson` 值
2. 如果为 `false`，调用 `confirm` 弹窗提示错误信息
3. 如果为 `true` 或 `null`，正常执行投入创作流程

**错误提示文案**：
```
标题：无法投入创作
内容：该视频未检测到真人，无法投入创作。

服装搭配功能需要真人模特展示，建议选择包含真人模特的视频进行反推。
```

**代码位置**：`apps/web/pages/reverse-script/ReverseScript.tsx` → `handleSendToStep1` 函数

---

## 涉及文件

| 文件 | 改动内容 |
|------|---------|
| `apps/web/pages/square/squareReverseDeckSnapshot.ts` | 扩展类型定义，新增 3 个字段 |
| `apps/web/pages/reverse-script/ReverseScript.tsx` | 提取视频和真人数据，修改投入创作逻辑 |
| `apps/web/pages/square/squareReverseDeckCard.tsx` | 添加视频预览和真人标签 UI |

---

## 后端数据验证

**已确认字段存在**：
- ✅ `source_oss_url` 存储在 `nrm_script_data.source_oss_url`
- ✅ `has_real_person` 存储在 `nrm_script_data.on_screen_presence` JSONB 字段中
- ✅ 后端已在 `reverse-square-routes.ts` 第 327 行写入 `sourceOssUrl`

**无需修改后端**，数据已就绪。

---

## 测试要点

1. **视频显示测试**：
   - 有 `videoUrl` 的脚本应显示视频播放器
   - 无 `videoUrl` 的脚本不显示播放器
   - 视频封面图是否正确加载

2. **真人判断测试**：
   - `hasRealPerson === true` 显示绿色标签，可投入创作
   - `hasRealPerson === false` 显示红色标签，点击投入创作弹出错误提示
   - `hasRealPerson === null` 不显示标签，可投入创作

3. **边界情况**：
   - 视频加载失败的处理
   - `on_screen_presence` 字段不存在的情况
   - `coverUrl` 不存在时的默认行为

---

## 预估工作量

- 类型定义 + 数据提取：15 分钟
- 视频预览 UI：20 分钟
- 真人判断逻辑：10 分钟
- 测试验证：15 分钟

**总计**：约 1 小时
