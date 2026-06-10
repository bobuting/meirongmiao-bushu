# 管理后台项目详情页增强 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 对 ProjectDetailModal 进行 5 项功能增强：角色分组、图片导航、分享扩展、反推源脚本、积分标题

**架构：** 后端扩展 API 返回更多字段（sourceType、fiveViewUrls、reverseScriptId），前端改造图片预览状态从单图改为多图、按类型分组展示角色、扩展分享按钮到图片项目

**技术栈：** Fastify + PostgreSQL（后端），React + TanStack Query + Tailwind（前端）

---

## 文件结构

| 文件 | 职责 | 改动类型 |
|------|------|---------|
| `src/routes/admin/projects-routes.ts` | 项目详情 API | 修改 |
| `apps/web/services/realApi/admin.ts` | 前端 API 封装 | 修改 |
| `apps/web/pages/admin/ProjectDetailModal.tsx` | 详情弹窗主组件 | 修改 |
| `apps/web/pages/admin/ProjectScriptsTab.tsx` | 脚本 Tab 组件 | 修改 |

---

## 任务 1：后端角色查询增加 sourceType 和五视图字段

**文件：**
- 修改：`src/routes/admin/projects-routes.ts:260-270, 494-500`

- [ ] **步骤 1：修改角色查询 SQL 补字段**

在 `registerAdminProjectsRoutes` 函数中找到角色查询（约 L260），修改 SQL：

```sql
SELECT pc.id, pc.library_character_id, lc.name, lc.thumbnail_url,
       lc.five_view_oss_image_url, pc.is_selected,
       pc.source_type, pc.role, lc.active_five_view_id
FROM nrm_project_characters pc
JOIN nrm_library_characters lc ON pc.library_character_id = lc.id
WHERE pc.project_id = $1 AND pc.deleted_at IS NULL
ORDER BY pc.source_type, pc.is_selected DESC, pc.created_at
```

- [ ] **步骤 2：查询每个角色的五视图 URL 列表**

在角色查询后新增五视图查询：

```typescript
// 查询所有角色的五视图（按角色分组）
const fiveViewsResult = await ctx.pool.query(
  `SELECT cfv.library_character_id, cfv.image_url, cfv.view_type, cfv.sort_order
   FROM nrm_character_five_views cfv
   JOIN nrm_project_characters pc ON cfv.library_character_id = pc.library_character_id
   WHERE pc.project_id = $1 AND pc.deleted_at IS NULL
     AND cfv.is_active = true AND cfv.status = 'ready' AND cfv.image_url IS NOT NULL
   ORDER BY cfv.library_character_id, cfv.sort_order`,
  [params.id]
);

// 按 library_character_id 分组
const fiveViewsByCharacter: Record<string, string[]> = {};
for (const row of fiveViewsResult.rows) {
  const charId = row.library_character_id;
  if (!fiveViewsByCharacter[charId]) fiveViewsByCharacter[charId] = [];
  fiveViewsByCharacter[charId].push(row.image_url);
}
```

- [ ] **步骤 3：修改 characters 返回映射**

找到 characters 返回映射（约 L494），改为：

```typescript
characters: charactersResult.rows.map((row) => ({
  id: row.id,
  libraryCharacterId: row.library_character_id,
  name: row.name,
  thumbnailUrl: row.five_view_oss_image_url || row.thumbnail_url || null,
  isSelected: row.is_selected,
  sourceType: row.source_type || 'library',
  role: row.role || 'main',
  fiveViewUrls: fiveViewsByCharacter[row.library_character_id] || [],
})),
```

- [ ] **步骤 4：编译验证**

运行：`npx tsc --noEmit --pretty`
预期：无新增编译错误

- [ ] **步骤 5：Commit**

```bash
git add src/routes/admin/projects-routes.ts
git commit -m "feat(admin): 角色 API 增加 sourceType、role、fiveViewUrls 字段"
```

---

## 任务 2：后端增加 reverseScriptId 和源脚本接口

**文件：**
- 修改：`src/routes/admin/projects-routes.ts:240, 126-`（新增路由）

- [ ] **步骤 1：basicInfo 增加 reverseScriptId**

在项目详情返回的 basicInfo 对象中增加：

```typescript
basicInfo: {
  // ... 现有字段
  reverseScriptId: project.reverse_script_id || null,
},
```

- [ ] **步骤 2：新增 GET /admin/reverse-scripts/:id 路由**

在 `registerAdminProjectsRoutes` 函数末尾添加：

```typescript
/**
 * GET /admin/reverse-scripts/:id
 * 获取反推源脚本的完整数据
 */
app.get("/admin/reverse-scripts/:id", async (request) => {
  await requireAdmin(ctx, request);
  const params = request.params as { id: string };

  // 从热榜脚本库查询（nrm_script_data 中 source='hot_trend' 的）
  const result = await ctx.pool.query(
    `SELECT id, title, summary, content, created_at, source, source_type, source_oss_url
     FROM nrm_script_data
     WHERE id = $1 AND deleted_at IS NULL`,
    [params.id]
  );

  if (result.rows.length === 0) {
    throw new AppError(404, "SCRIPT_NOT_FOUND", "脚本不存在");
  }

  const row = result.rows[0];
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    content: row.content,
    createdAt: Number(row.created_at) || 0,
    source: row.source,
    sourceType: row.source_type,
    sourceOssUrl: row.source_oss_url,
  };
});
```

- [ ] **步骤 3：编译验证**

运行：`npx tsc --noEmit --pretty`

- [ ] **步骤 4：Commit**

```bash
git add src/routes/admin/projects-routes.ts
git commit -m "feat(admin): 增加 reverseScriptId 和源脚本查询接口"
```

---

## 任务 3：前端 API 封装更新

**文件：**
- 修改：`apps/web/services/realApi/admin.ts`

- [ ] **步骤 1：更新 getAdminProjectDetail 返回类型**

找到 `getAdminProjectDetail` 的返回类型定义，在 characters 数组中增加字段：

```typescript
characters: Array<{
  id: string;
  libraryCharacterId: string;
  name: string;
  thumbnailUrl: string | null;
  isSelected: boolean;
  sourceType: 'generated' | 'library';  // 新增
  role: 'main' | 'secondary';           // 新增
  fiveViewUrls: string[];               // 新增
}>;
```

在 basicInfo 中增加：

```typescript
basicInfo: {
  // ... 现有字段
  reverseScriptId: string | null;  // 新增
};
```

- [ ] **步骤 2：新增 getAdminReverseScript 函数**

```typescript
getAdminReverseScript(
  token: string,
  scriptId: string,
): Promise<{
  id: string;
  title: string;
  summary: string;
  content: string;
  createdAt: number;
  source: string;
  sourceType: string;
  sourceOssUrl: string | null;
}>;
```

实现：

```typescript
async getAdminReverseScript(token: string, scriptId: string) {
  return this.request("GET", `/admin/reverse-scripts/${scriptId}`, { token });
}
```

- [ ] **步骤 3：编译验证**

运行：`npm --prefix apps/web run build`（仅类型检查）

- [ ] **步骤 4：Commit**

```bash
git add apps/web/services/realApi/admin.ts
git commit -m "feat(web): API 封装增加角色新字段和源脚本接口"
```

---

## 任务 4：前端图片预览状态改造为多图

**文件：**
- 修改：`apps/web/pages/admin/ProjectDetailModal.tsx:46-49, 1375-1381`

- [ ] **步骤 1：修改状态定义**

找到状态定义（约 L46-49），将 `previewImageUrl` 改为：

```typescript
// 之前
const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

// 之后
const [previewImages, setPreviewImages] = useState<{ frames: string[]; index: number } | null>(null);
```

保留 `previewVideoUrl` 不变。

- [ ] **步骤 2：修改 ImageLightbox 调用**

找到图片预览弹窗（约 L1375-1381），改为：

```tsx
{/* 图片预览弹窗 */}
{previewImages && (
  <ImageLightbox
    url={previewImages.frames[previewImages.index]}
    frames={previewImages.frames}
    currentIndex={previewImages.index}
    onNavigate={(i) => setPreviewImages({ ...previewImages, index: i })}
    open={true}
    onClose={() => setPreviewImages(null)}
  />
)}
```

- [ ] **步骤 3：编译验证**

运行：`npm --prefix apps/web run build`

- [ ] **步骤 4：Commit**

```bash
git add apps/web/pages/admin/ProjectDetailModal.tsx
git commit -m "feat(web): 图片预览状态改造为多图导航"
```

---

## 任务 5：Step2 角色按 sourceType 分组展示

**文件：**
- 修改：`apps/web/pages/admin/ProjectDetailModal.tsx:275-410`

- [ ] **步骤 1：修改 Step2 角色列表区域**

找到 Step2 tab 内容区（约 L275-410），将角色列表改为分组展示。

在角色列表 `<div>` 前，按 sourceType 分组：

```tsx
{/* 角色列表 - 按 sourceType 分组 */}
<div>
  {/* AI 生成角色 */}
  {(() => {
    const generatedChars = detail.characters.filter(c => c.sourceType === 'generated');
    if (generatedChars.length === 0) return null;
    return (
      <div className="mb-4">
        <div className="text-sm font-medium text-gray-700 mb-3">
          AI 生成角色 ({generatedChars.length})
        </div>
        <div className="grid grid-cols-6 gap-3">
          {generatedChars.map((char) => (
            <CharacterCard
              key={char.id}
              char={char}
              onClick={() => {
                const allUrls = generatedChars.map(c => c.thumbnailUrl).filter(Boolean) as string[];
                const idx = allUrls.indexOf(char.thumbnailUrl);
                setPreviewImages({ frames: allUrls, index: idx >= 0 ? idx : 0 });
              }}
            />
          ))}
        </div>
      </div>
    );
  })()}

  {/* 角色库角色 */}
  {(() => {
    const libraryChars = detail.characters.filter(c => c.sourceType === 'library');
    if (libraryChars.length === 0) return null;
    return (
      <div className="mb-4">
        <div className="text-sm font-medium text-gray-700 mb-3">
          角色库角色 ({libraryChars.length})
        </div>
        <div className="grid grid-cols-6 gap-3">
          {libraryChars.map((char) => (
            <CharacterCard
              key={char.id}
              char={char}
              onClick={() => {
                // 打开五视图
                const frames = char.fiveViewUrls.length > 0 ? char.fiveViewUrls : [char.thumbnailUrl].filter(Boolean) as string[];
                setPreviewImages({ frames, index: 0 });
              }}
            />
          ))}
        </div>
      </div>
    );
  })()}
</div>
```

- [ ] **步骤 2：提取 CharacterCard 组件（避免重复）**

在文件底部添加：

```tsx
/** 角色卡片组件 */
const CharacterCard: React.FC<{
  char: { id: string; name: string; thumbnailUrl: string | null; isSelected: boolean };
  onClick: () => void;
}> = ({ char, onClick }) => (
  <div
    onClick={onClick}
    className={`rounded-xl border-2 overflow-hidden transition-all cursor-pointer ${
      char.isSelected
        ? 'border-primary bg-primary/5 shadow-md'
        : 'border-gray-200 bg-white hover:border-gray-300'
    }`}
  >
    <div className="aspect-square bg-gray-100">
      {char.thumbnailUrl ? (
        <img
          src={getOssThumbnailUrl(char.thumbnailUrl, 200)}
          alt={char.name}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="material-icons-round text-4xl text-gray-300">person</span>
        </div>
      )}
    </div>
    <div className="p-2">
      <div className="text-xs font-medium text-gray-800 truncate" title={char.name}>
        {char.name}
      </div>
      {char.isSelected && (
        <div className="mt-1 flex items-center gap-1 text-primary">
          <span className="material-icons-round text-xs">check_circle</span>
          <span className="text-xs">已选中</span>
        </div>
      )}
    </div>
  </div>
);
```

- [ ] **步骤 3：编译验证**

运行：`npm --prefix apps/web run build`

- [ ] **步骤 4：Commit**

```bash
git add apps/web/pages/admin/ProjectDetailModal.tsx
git commit -m "feat(web): Step2 角色按 sourceType 分组展示"
```

---

## 任务 6：各区域图片点击改为多图导航

**文件：**
- 修改：`apps/web/pages/admin/ProjectDetailModal.tsx` 各 Step 区域

- [ ] **步骤 1：Step1 服饰改为多图**

找到服饰网格（约 L198-229），修改 onClick：

```tsx
onClick={() => {
  const allUrls = detail.step1Data.garments.map(g => g.imageUrl).filter(Boolean) as string[];
  const idx = allUrls.indexOf(garment.imageUrl);
  setPreviewImages({ frames: allUrls, index: idx >= 0 ? idx : 0 });
}}
```

- [ ] **步骤 2：Step2 角色预设改为单图**

角色预设是单图，传入单元素 frames：

```tsx
onClick={() => setPreviewImages({
  frames: [detail.step2Data.rolePreset!.imageUrl],
  index: 0
})}
```

- [ ] **步骤 3：Step2 五视图改为多图**

找到五视图网格（约 L381-406），修改 onClick：

```tsx
onClick={() => {
  const allUrls = detail.step2Data.characterViews.map(v => v.image_url).filter(Boolean) as string[];
  const idx = allUrls.indexOf(view.image_url);
  setPreviewImages({ frames: allUrls, index: idx >= 0 ? idx : 0 });
}}
```

- [ ] **步骤 4：Step3 模特图改为多图**

找到模特图网格（约 L426-464），修改 onClick：

```tsx
onClick={() => {
  const allUrls = detail.step3Data.modelPhotos.map(p => p.imageUrl).filter(Boolean) as string[];
  const idx = allUrls.indexOf(photo.imageUrl);
  setPreviewImages({ frames: allUrls, index: idx >= 0 ? idx : 0 });
}}
```

- [ ] **步骤 5：Step3 分镜改为多图**

找到分镜网格（约 L596-674），修改 onClick：

```tsx
onClick={() => {
  const allUrls = detail.step3Data.storyboards.map(s => s.selectedImageUrl).filter(Boolean) as string[];
  const idx = allUrls.indexOf(sb.selectedImageUrl);
  setPreviewImages({ frames: allUrls, index: idx >= 0 ? idx : 0 });
}}
```

- [ ] **步骤 6：Step4 板块改为多图**

找到板块列表（约 L699-769），修改 onClick：

```tsx
onClick={() => {
  const allUrls = detail.step4Data.pageSections.map(s => s.imageUrl).filter(Boolean) as string[];
  const idx = allUrls.indexOf(section.imageUrl);
  setPreviewImages({ frames: allUrls, index: idx >= 0 ? idx : 0 });
}}
```

- [ ] **步骤 7：Step6 分镜任务图片改为多图**

找到任务项网格（约 L1092-1116），修改 onClick：

```tsx
onClick={() => {
  const allUrls = detail.step6Data.taskItems.map(i => i.imageUrl).filter(Boolean) as string[];
  const idx = allUrls.indexOf(item.imageUrl);
  setPreviewImages({ frames: allUrls, index: idx >= 0 ? idx : 0 });
}}
```

- [ ] **步骤 8：基本信息封面/服饰图改为单图**

找到顶部封面和服饰图片（约 L111-130），修改 onClick：

```tsx
// 封面图（单图）
onClick={() => setPreviewImages({
  frames: [detail.basicInfo.coverImageUrl!],
  index: 0
})}

// 服饰主图（单图）
onClick={() => setPreviewImages({
  frames: [detail.basicInfo.garmentImageUrl!],
  index: 0
})}
```

- [ ] **步骤 9：编译验证**

运行：`npm --prefix apps/web run build`

- [ ] **步骤 10：Commit**

```bash
git add apps/web/pages/admin/ProjectDetailModal.tsx
git commit -m "feat(web): 各区域图片点击改为多图导航"
```

---

## 任务 7：图片项目 Step4 分享按钮

**文件：**
- 修改：`apps/web/pages/admin/ProjectDetailModal.tsx:684-775`

- [ ] **步骤 1：Step4 图片项目区域增加分享按钮**

找到 Step4 tab 图片项目分支（约 L684），在顶部增加分享按钮：

```tsx
{/* Step4 - 图片项目：电商详情页 */}
{activeTab === 'step4' && (
  <div className="space-y-6">
    {/* 图片项目 */}
    {detail.basicInfo.projectKind === 'image' && (
      <>
        {/* 分享按钮 */}
        <div className="flex justify-end">
          <button
            onClick={() => {
              setShareModalOpen(true);
              setShareLinkCopied(false);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-xl text-sm font-semibold shadow-md shadow-blue-500/20 transition-all"
          >
            <span className="material-icons-round text-lg">share</span>
            分享作品
          </button>
        </div>

        {/* 详情页板块（现有内容） */}
        <div>
          {/* ... */}
        </div>
      </>
    )}
    {/* 视频项目分支保持不变 */}
  </div>
)}
```

- [ ] **步骤 2：分享弹窗根据项目类型调整文案和 URL**

找到分享弹窗（约 L1394-1533），修改 URL 和文案：

```tsx
{/* 分享弹窗 */}
{shareModalOpen && (
  <div className="fixed inset-0 z-50 ...">
    <div className="relative ...">
      {/* 内容区 */}
      <div className="p-6">
        {/* 标题 */}
        <div className="flex items-center gap-3 mb-5">
          {/* ... */}
          <div>
            <h3 className="text-lg font-bold text-gray-900">分享作品</h3>
            <p className="text-sm text-gray-500">
              {detail.basicInfo.projectKind === 'image'
                ? '将电商详情页分享给好友查看'
                : '将成片视频分享给好友观看'}
            </p>
          </div>
        </div>

        {/* 提示文案 */}
        <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 mb-4">
          <div className="flex items-start gap-3">
            <span className="material-icons-round text-blue-500 text-lg">info</span>
            <div className="flex-1">
              <p className="text-sm text-blue-800 font-medium mb-1">公开分享链接</p>
              <p className="text-xs text-blue-600/80">
                {detail.basicInfo.projectKind === 'image'
                  ? '无需登录即可查看电商详情页'
                  : '无需登录即可观看，包含成片视频和裂变作品'}
              </p>
            </div>
          </div>
        </div>

        {/* 链接区域 */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-gray-700 mb-2 block">分享链接</label>
          <div className="relative">
            <input
              type="text"
              readOnly
              value={detail.basicInfo.projectKind === 'image'
                ? `${window.location.origin}/share-image/${projectId}`
                : `${window.location.origin}/share/${projectId}`}
              className="w-full px-4 py-3 ..."
            />
            {/* 复制按钮 */}
            <button
              onClick={() => {
                const shareUrl = detail.basicInfo.projectKind === 'image'
                  ? `${window.location.origin}/share-image/${projectId}`
                  : `${window.location.origin}/share/${projectId}`;
                navigator.clipboard.writeText(shareUrl);
                setShareLinkCopied(true);
                setTimeout(() => setShareLinkCopied(false), 2000);
              }}
              {/* ... */}
            >
              {/* ... */}
            </button>
          </div>
        </div>

        {/* QR 码 URL 也相应调整 */}
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
            detail.basicInfo.projectKind === 'image'
              ? `${window.location.origin}/share-image/${projectId}`
              : `${window.location.origin}/share/${projectId}`
          )}&bgcolor=ffffff&color=1e40af&margin=0`}
          alt="分享二维码"
          {/* ... */}
        />

        {/* 打开预览按钮 */}
        <button
          onClick={() => {
            const shareUrl = detail.basicInfo.projectKind === 'image'
              ? `${window.location.origin}/share-image/${projectId}`
              : `${window.location.origin}/share/${projectId}`;
            navigator.clipboard.writeText(shareUrl);
            setShareLinkCopied(true);
            window.open(shareUrl, '_blank');
          }}
          {/* ... */}
        >
          打开预览
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **步骤 3：编译验证**

运行：`npm --prefix apps/web run build`

- [ ] **步骤 4：Commit**

```bash
git add apps/web/pages/admin/ProjectDetailModal.tsx
git commit -m "feat(web): 图片项目 Step4 支持分享功能"
```

---

## 任务 8：反推项目源脚本展示

**文件：**
- 修改：`apps/web/pages/admin/ProjectScriptsTab.tsx`

- [ ] **步骤 1：增加 reverseScriptId prop**

修改组件 props：

```typescript
interface ProjectScriptsTabProps {
  token: string;
  projectId: string;
  mode: 'scripts' | 'prompts';
  reverseScriptId?: string | null;  // 新增
  projectKind?: string;             // 新增，用于判断是否为反推项目
}
```

- [ ] **步骤 2：查询源脚本数据**

组件内新增 useQuery：

```typescript
const { data: reverseScript, isLoading: reverseLoading } = useQuery({
  queryKey: ['admin', 'reverse-script', reverseScriptId],
  queryFn: () => backendApi.getAdminReverseScript(token, reverseScriptId!),
  enabled: !!token && !!reverseScriptId && projectKind === 'reverse',
});
```

- [ ] **步骤 3：在脚本列表上方展示源脚本卡片**

在左侧脚本列表前增加：

```tsx
{/* 源脚本卡片（仅反推项目显示） */}
{projectKind === 'reverse' && reverseScriptId && (
  <div className="mb-3">
    {reverseLoading ? (
      <div className="text-gray-400 text-xs text-center py-2">加载源脚本...</div>
    ) : reverseScript ? (
      <div className="rounded-lg border border-purple-200 bg-purple-50/50 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-purple-100/50 border-b border-purple-200">
          <div className="flex items-center gap-1.5">
            <span className="material-icons-round text-purple-500 text-sm">source</span>
            <span className="text-xs font-semibold text-purple-700">源脚本（反推来源）</span>
          </div>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(JSON.stringify(reverseScript, null, 2));
            }}
            className="text-xs text-purple-600 hover:text-purple-800"
          >
            复制
          </button>
        </div>
        <pre className="p-2 text-xs overflow-auto max-h-[100px] bg-white">
          {JSON.stringify(reverseScript, null, 2)}
        </pre>
      </div>
    ) : (
      <div className="text-gray-400 text-xs text-center py-2">源脚本不存在</div>
    )}
  </div>
)}
```

- [ ] **步骤 4：ProjectDetailModal 传入新 props**

在调用 `ProjectScriptsTab` 的地方（约 L1349-1356）传入：

```tsx
{/* 脚本JSON Tab */}
{activeTab === 'scripts' && (
  <ProjectScriptsTab
    token={token!}
    projectId={projectId}
    mode="scripts"
    reverseScriptId={detail.basicInfo.reverseScriptId}
    projectKind={detail.basicInfo.projectKind}
  />
)}

{/* 专业提示词 Tab */}
{activeTab === 'prompts' && (
  <ProjectScriptsTab
    token={token!}
    projectId={projectId}
    mode="prompts"
    reverseScriptId={detail.basicInfo.reverseScriptId}
    projectKind={detail.basicInfo.projectKind}
  />
)}
```

- [ ] **步骤 5：编译验证**

运行：`npm --prefix apps/web run build`

- [ ] **步骤 6：Commit**

```bash
git add apps/web/pages/admin/ProjectScriptsTab.tsx apps/web/pages/admin/ProjectDetailModal.tsx
git commit -m "feat(web): 反推项目脚本 Tab 展示源脚本"
```

---

## 任务 9：资源消耗积分列表标题

**文件：**
- 修改：`apps/web/pages/admin/ProjectDetailModal.tsx:1311-1346`

- [ ] **步骤 1：积分列表增加标题区域**

找到资源消耗 tab（约 L1311），修改：

```tsx
{/* 资源消耗 */}
{activeTab === 'resources' && (
  <div className="space-y-4">
    {/* 统计卡片 */}
    <div className="grid grid-cols-4 gap-6">
      {/* ... 现有统计卡片 */}
    </div>

    {/* 积分消耗明细标题 */}
    <div>
      <div className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
        <span className="material-icons-round text-amber-500 text-lg">payments</span>
        积分消耗明细
        {detail.resourceConsumption.creditConsumption > 0 && (
          <span className="text-xs text-amber-600 font-normal">
            ({detail.resourceConsumption.creditConsumption} 积分)
          </span>
        )}
      </div>
      <ProjectCreditList projectId={detail.basicInfo.id} />
    </div>
  </div>
)}
```

- [ ] **步骤 2：ProjectCreditList 确保显示空状态**

`ProjectCreditList` 已有空状态逻辑，无需修改。

- [ ] **步骤 3：编译验证**

运行：`npm --prefix apps/web run build`

- [ ] **步骤 4：Commit**

```bash
git add apps/web/pages/admin/ProjectDetailModal.tsx
git commit -m "feat(web): 资源消耗积分明细增加标题区域"
```

---

## 验证步骤

1. 启动服务：
   ```bash
   PERSISTENCE_REQUIRE_READY=false npm run dev
   npm --prefix apps/web run dev
   ```

2. 打开 `http://localhost:3000/admin-portal?tab=projects`

3. 登录凭据：`admin@example.com / admin123`

4. 测试项目详情各功能：
   - Step2: 角色按「AI生成」/「角色库」分组显示，点击角色可翻看图片
   - 各区域图片：点击后支持左右箭头切换，ESC 关闭
   - 图片项目 Step4: 有分享按钮，URL 为 `/share-image/`
   - 反推项目脚本 Tab: 上方显示源脚本 JSON
   - 资源消耗: 积分明细有标题「积分消耗明细」

5. TypeScript 验证：
   ```bash
   npx tsc --noEmit --pretty
   npm --prefix apps/web run build
   ```