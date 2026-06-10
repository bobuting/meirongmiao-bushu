# 换装项目状态丢失问题设计方案

## 问题概述

**现象：** 用户在换装项目中，仅通过「上一步」「下一步」按钮在 Step 1-4 之间切换，到达 Step 4 后发现已选角色和视频数据丢失。

**严重后果：** 项目 `1003275e-1e30-4cea-bcc3-c68500b04d55` 被系统误删（用户刚恢复）。原因：原视频 URL 丢失导致系统误判为空项目，触发自动删除。

**影响范围：** `/outfit-create/{projectId}/step1` 至 `step4` 的所有页面跳转场景。

---

## 问题根源分析

### 一、原视频 URL 丢失的根本原因（核心问题）

**视频上传成功后的数据流：**

```
上传成功 → updateWorkflow({ outfitChangeSourceVideoUrl: result.fileUrl })
      ↓ (立即写入 workflow ✅)
      
      saveDraft(token, { projectId, sourceVideoUrl: result.fileUrl })
      ↓ (异步调用，未完成 ⚠️)
      
用户点击下一步 → navigate 到 Step 2
      ↓ (立即跳转，不等 saveDraft)
      
Step 2 加载 → useProjectState useEffect 触发
      ↓
缓存清空机制判断：
      - projectStateMap[projectId] 为空（刚跳转，store 可能已清空）
      - loadedCategoriesMap[projectId] 有缓存（全局缓存还在）
      → 清空缓存 → 重新加载 draft API ⚠️
      
调用 getDraft API → 获取 draft 数据
      ↓
关键问题：draft API 可能还没更新完成（saveDraft 是异步的）
      ↓
      outfitChangeDraft.sourceVideoUrl = null 或旧数据 ⚠️
      
loadedWorkflow.outfitChangeSourceVideoUrl = null ← 原视频 URL 丢失！
      ↓
updateWorkflowForProject(projectId, loadedWorkflow) ← 覆盖了 workflow
      ↓
用户原来的视频 URL 被覆盖为 null ❌
```

---

**根本原因链条：**

| 环节 | 代码位置 | 问题 |
|------|---------|------|
| 1. 异步写入 | OutfitChangeStep1.tsx:262 | `saveDraft` 异步调用，未等待 |
| 2. 立即跳转 | handleNext | `navigate` 不等 saveDraft 完成 |
| 3. 缓存清空 | useProjectState.ts:153-157 | 检测到 store 丢失 → 清空缓存 → 重新加载 |
| 4. draft API 未同步 | useProjectState.ts:211-217 | `getDraft` API 返回空数据或旧数据 |
| 5. workflow 覆盖 | useProjectState.ts:355-357 | draft 数据覆盖原 workflow → 原视频 URL 丢失 |

---

### 二、项目误删的触发机制

**删除判断逻辑：**

([OutfitChangeLayout.tsx:51](apps/web/pages/outfit-change/OutfitChangeLayout.tsx#L51))

```tsx
// 源视频为空就是空项目
const hasSubstantialContent = !!workflow.outfitChangeSourceVideoUrl;

if (!hasSubstantialContent) {
  // 空项目：静默删除
  await backendApi.deleteProject(token, projectData.projectId);
}
```

---

**项目误删流程：**

```
原视频 URL 丢失 → workflow.outfitChangeSourceVideoUrl = null
      ↓
用户返回项目列表或关闭项目
      ↓
OutfitChangeLayout handleCloseProject 触发
      ↓
判断：hasSubstantialContent = false
      ↓
系统误判为空项目 → 触发静默删除
      ↓
项目被删除 ❌
```

---

**误删案例分析：**

| 项目 ID | 用户实际操作 | 原视频状态 | 系统判断 | 结果 |
|---------|-------------|-----------|---------|------|
| `1003275e...` | 已上传视频 | URL 丢失 → null | 空项目 | **被误删** |
| 其他项目 | 已上传视频 | URL 丢失 → null | 空项目 | **被误删** |

---

### 三、问题严重性评估

| 影响维度 | 严重程度 | 说明 |
|---------|---------|------|
| **数据丢失** | 🔴 极严重 | 用户已上传的视频、已选择的数据全部丢失 |
| **误删项目** | 🔴 极严重 | 用户的工作成果被系统自动删除 |
| **无法恢复** | 🔴 极严重 | draft API 没有保存中间状态，项目删除后只能人工恢复数据库 |
| **用户信任** | 🔴 极严重 | 用户数据安全问题，严重影响产品可信度 |

---

## 设计方案对比

### 方案 1：移除 saveDraft，完全依赖 workflow 本地状态（推荐）

**核心思路：** 参考 video 项目，完全依赖 workflow 本地状态 + session 缓存，移除所有 saveDraft 调用和 draft API 加载逻辑。

**数据流：**

```
用户上传视频 → updateWorkflow (立即写入 store)
      ↓
      navigate (状态已在 store，无需等待)
      ↓
下一个 Step 加载 → useProjectState
      ↓
从 store.workflow 读取 → 原视频 URL 保持 ✅
```

---

**实现步骤：**

| 步骤 | 文件 | 修改内容 | 状态 |
|------|------|---------|------|
| 1 | OutfitChangeStep1.tsx | 移除上传成功后的 `saveDraft` (第 262 行) | ❌ 待实施 |
| 2 | OutfitChangeStep1.tsx | 移除确认视频时的 `saveDraft` (第 298 行) | ❌ 待实施 |
| 3 | OutfitChangeStep2.tsx | 移除选择服装时的 `saveDraft` (第 249 行) | ❌ 待实施 |
| 4 | OutfitChangeStep3.tsx | 移除选择角色时的 `saveDraft` (第 253 行) | ❌ 待实施 |
| 5 | useProjectState.ts | 移除 draft API 获取逻辑 (第 211-217 行) | ❌ 待实施 |
| 6 | useProjectState.ts | 移除 draft 数据写入 workflow (第 355-357 行) | ❌ 待实施 |
| 7 | OutfitChangeStep4.tsx | 移除 draft API 回退逻辑 | ❌ 待实施 |
| 8 | **OutfitChangeLayout.tsx** | **补充 session 恢复逻辑** | ❌ 待实施 |

---

**优势：**

- ✅ 移除异步写入的复杂性，状态立即生效
- ✅ 避免 navigate 和 saveDraft 的时序冲突
- ✅ 避免 draft API 数据覆盖原 workflow
- ✅ 与 video 项目保持一致的架构
- ✅ 不会再误判为空项目导致删除

---

**劣势：**

- ⚠️ 页面刷新后依赖 session 缓存恢复（video 项目也是如此）
- ⚠️ 后端 draft API 不再用于中间状态持久化

---

### 方案 2：保留 saveDraft，修复异步等待

**核心思路：** 在每个 Step 的 `handleNext` 中等待 `saveDraft` 完成。

**实现示例：**

```tsx
const handleNext = async () => {
  updateWorkflow({ outfitChangeSelectedGarmentId: selectedGarmentId });
  
  // 等待 saveDraft 完成
  try {
    await realOutfitChangeApi.saveDraft(token, { 
      projectId, 
      targetOutfitId: selectedGarmentId 
    });
  } catch (e) {
    console.error("保存失败:", e);
  }
  
  navigate(`/outfit-create/${projectId}/step3`);
};
```

---

**优势：**

- ✅ 保留后端 draft 持久化
- ✅ 页面刷新后可从 draft API 恢复

---

**劣势：**

- ❌ 增加等待时间，用户体验变慢
- ❌ 需要修改 4 个文件的 `handleNext`
- ❌ 可能存在并发写入问题（多 Step 同时调用 `saveDraft`）
- ❌ **关键问题：无法解决 useProjectState 的 draft API 覆盖问题**
  - 即使等待 saveDraft 完成，useProjectState 加载时仍会调用 getDraft API
  - draft API 数据会覆盖 workflow 本地状态
  - 如果 draft API 返回的数据不完整，仍会覆盖用户已选择的数据

---

### 方案对比总结

| 维度 | 方案 1（移除 saveDraft） | 方案 2（等待 saveDraft） |
|------|------------------------|------------------------|
| **是否解决根本问题** | ✅ 完全解决 | ❌ 无法解决 draft API 覆盖问题 |
| **用户体验** | ✅ 状态立即生效 | ❌ 增加等待时间 |
| **实现复杂度** | ✅ 简单，移除代码 | ❌ 复杂，需要修改多处 |
| **架构一致性** | ✅ 与 video 项目一致 | ❌ 与 video 项目不一致 |
| **推荐度** | ⭐⭐⭐⭐⭐ 强烈推荐 | ⭐⭐ 不推荐 |

---

## 方案正确性分析

### 方案 1 的关键验证

**核心疑问：** 移除 saveDraft 后，页面刷新能否恢复状态？

---

#### 1. video 项目验证

video 项目不调用 `saveDraft`，仅依赖 workflow 本地状态：

- ✅ 页面刷新后从 session 缓存恢复项目 ID
- ✅ `useProjectState` 从后端 API 加载完整状态（项目数据、角色、脚本等）
- ✅ 状态恢复成功

**结论：** workflow 本地状态 + session 缓存方案已在 video 项目验证可行。

---

#### 2. session 缓存现状

OutfitChangeLayout 已有 session 写入逻辑：

```tsx
// 写入活跃会话
useEffect(() => {
  writeProjectFlowActiveSession({ projectId, step });
}, [location.pathname, projectId]);
```

**缺失部分：** 页面刷新时从 session 恢复项目 ID（需补充）。

---

#### 3. useProjectState 加载机制（修改后）

**移除 draft API 后的加载逻辑：**

- 加载 `outfitChange` 分类时，**不再调用** `getDraft` API
- workflow 完全依赖本地状态（store）
- 页面刷新后，从 session 恢复项目 ID → 后端 API 加载完整项目数据

---

#### 4. 页面刷新场景处理

**刷新页面后的恢复流程：**

```
刷新页面 → store 清空 → workflow 为空
      ↓
OutfitChangeLayout session 恢复逻辑（需补充）
      ↓
从 session 获取 projectId + step → navigate 到正确页面
      ↓
useProjectState 加载 → 从后端 API 获取项目完整数据
      ↓
workflow 恢复成功 ✅
```

---

### 关键缺失：session 恢复机制

**参考 ProjectLayout 实现：**

```tsx
// 页面刷新时从 session 恢复项目 ID
useEffect(() => {
  const session = readProjectFlowActiveSession();
  if (session?.projectId && !urlProjectId) {
    navigate(`/create/${session.projectId}/step${session.step}`);
  }
}, []);
```

---

**换装项目需要补充：**

OutfitChangeLayout.tsx 需要添加：

```tsx
// 页面刷新时从 session 恢复项目 ID 和步骤
useEffect(() => {
  if (isClosingProjectRef.current) return;
  
  const session = readProjectFlowActiveSession();
  if (session?.projectId && session.projectKind === "outfit_change" && !urlProjectId) {
    navigate(`/outfit-create/${session.projectId}/step${session.step || 1}`);
  }
}, []);
```

---

## 数据持久化机制对比

### video 项目（参考基准）

| 机制 | 说明 | 何时使用 |
|------|------|---------|
| workflow 本地状态 | 立即生效，跨页面保持 | 用户操作时立即写入 |
| session 缓存 | 页面刷新恢复项目 ID | 写入时机：页面跳转时 |
| 后端 API | 项目数据持久化 | 最终提交时写入数据库 |
| **draft API** | **不使用** | **video 项目不依赖 draft API** |

---

### outfit 项目（修改后）

| 机制 | 说明 | 何时使用 |
|------|------|---------|
| workflow 本地状态 | 立即生效，跨页面保持 | 用户操作时立即写入 |
| session 缓存 | 页面刷新恢复项目 ID | 写入时机：页面跳转时（需补充恢复逻辑） |
| 后端 API | 项目数据持久化 | 最终提交时写入数据库 |
| **draft API** | **移除** | **不再使用 draft API** |

---

## 详细实施步骤与代码修改示例

### 步骤 1：移除 OutfitChangeStep1.tsx 上传成功后的 saveDraft

**修改位置：** 第 258-267 行

**修改前：**

```tsx
setVideoUrl(result.fileUrl);
updateWorkflow({ outfitChangeSourceVideoUrl: result.fileUrl });
// 持久化到后端 draft
if (projectId) {
  try {
    await realOutfitChangeApi.saveDraft(token, { projectId, sourceVideoUrl: result.fileUrl });
  } catch (e) {
    console.error("[OutfitChangeStep1] 保存 draft 失败:", e);
    setFeedback("视频已上传，但保存失败，请刷新页面重试");
  }
}
setFeedback("视频上传成功");
```

**修改后：**

```tsx
setVideoUrl(result.fileUrl);
updateWorkflow({ outfitChangeSourceVideoUrl: result.fileUrl });
setFeedback("视频上传成功");
```

**理由：** workflow 状态已立即生效，无需异步保存 draft。

---

### 步骤 2：移除 OutfitChangeStep1.tsx 确认视频时的 saveDraft

**修改位置：** 第 290-306 行

**修改前：**

```tsx
const handleConfirmVideo = useCallback(() => {
  if (!videoUrl.trim()) {
    setFeedback("请先选择或上传视频");
    return;
  }
  updateWorkflow({ outfitChangeSourceVideoUrl: videoUrl });
  // 持久化到后端 draft
  if (projectId) {
    realOutfitChangeApi.saveDraft(token!, { projectId, sourceVideoUrl: videoUrl }).catch((e) => {
      console.error("[OutfitChangeStep1] 保存 draft 失败:", e);
      setFeedback("保存失败，请重试");
    });
  }
}, [videoUrl, updateWorkflow, token, projectId]);
```

**修改后：**

```tsx
const handleConfirmVideo = useCallback(() => {
  if (!videoUrl.trim()) {
    setFeedback("请先选择或上传视频");
    return;
  }
  updateWorkflow({ outfitChangeSourceVideoUrl: videoUrl });
}, [videoUrl, updateWorkflow]);
```

---

### 步骤 3：移除 OutfitChangeStep2.tsx 选择服装时的 saveDraft

**修改位置：** 第 243-253 行

**修改前：**

```tsx
const handleSelect = useCallback((garmentId: string) => {
  const newId = selectedGarmentId === garmentId ? null : garmentId;
  setSelectedGarmentId(newId);
  updateWorkflow({ outfitChangeSelectedGarmentId: newId });
  if (token && projectId) {
    realOutfitChangeApi.saveDraft(token, { projectId, targetOutfitId: newId }).catch((e) => {
      console.error("[OutfitChangeStep2] 保存 draft 失败:", e);
    });
  }
}, [selectedGarmentId, token, projectId, updateWorkflow]);
```

**修改后：**

```tsx
const handleSelect = useCallback((garmentId: string) => {
  const newId = selectedGarmentId === garmentId ? null : garmentId;
  setSelectedGarmentId(newId);
  updateWorkflow({ outfitChangeSelectedGarmentId: newId });
}, [selectedGarmentId, updateWorkflow]);
```

---

### 步骤 4：移除 OutfitChangeStep3.tsx 选择角色时的 saveDraft

**修改位置：** 第 244-254 行

**修改前：**

```tsx
const handleSelect = useCallback((characterId: string) => {
  const newId = selectedCharacterId === characterId ? null : characterId;
  setSelectedCharacterId(newId);
  updateWorkflow({ outfitChangeSelectedCharacterId: newId });
  if (token && projectId) {
    realOutfitChangeApi.saveDraft(token, { projectId, characterId: newId }).catch((e) => {
      console.error("[OutfitChangeStep3] 保存 draft 失败:", e);
    });
  }
}, [selectedCharacterId, token, projectId, updateWorkflow]);
```

**修改后：**

```tsx
const handleSelect = useCallback((characterId: string) => {
  const newId = selectedCharacterId === characterId ? null : characterId;
  setSelectedCharacterId(newId);
  updateWorkflow({ outfitChangeSelectedCharacterId: newId });
}, [selectedCharacterId, updateWorkflow]);
```

---

### 步骤 5：移除 useProjectState.ts 的 draft API 获取逻辑

**修改位置：** 第 211-217 行

**修改前：**

```tsx
let outfitChangeDraft: { sourceVideoUrl?: string | null; targetOutfitId?: string | null; characterId?: string | null } | null = null;
if (needOutfitChange && projectRes?.projectKind === "outfit_change") {
  try {
    const draftRes = await realOutfitChangeApi.getDraft(token, projectId);
    outfitChangeDraft = draftRes.data;
  } catch { /* 无 draft 不影响流程 */ }
}
```

**修改后：**

```tsx
// 换装项目不再从 draft API 加载，完全依赖 workflow 本地状态
```

---

### 步骤 6：移除 useProjectState.ts 的 draft 数据写入逻辑

**修改位置：** 第 354-357 行

**修改前：**

```tsx
if (needOutfitChange && outfitChangeDraft) {
  loadedWorkflow.outfitChangeSourceVideoUrl = outfitChangeDraft.sourceVideoUrl ?? null;
  loadedWorkflow.outfitChangeSelectedGarmentId = outfitChangeDraft.targetOutfitId ?? null;
  loadedWorkflow.outfitChangeSelectedCharacterId = outfitChangeDraft.characterId ?? null;
}
```

**修改后：**

```tsx
// 换装项目状态不再从 draft API 加载，完全依赖 workflow 本地状态
```

---

### 步骤 7：移除 OutfitChangeStep4.tsx 的 draft API 回退逻辑

**修改位置：** 第 266-324 行

**修改前：**

```tsx
// 加载已选择的数据（优先 workflow，回退到后端 draft）
useEffect(() => {
  const loadData = async () => {
    if (!token || !projectId) return;

    let videoUrl: string | null = ...;
    let garmentId: string | null = ...;
    let characterId: string | null = ...;

    // workflow 数据不全时，从后端 draft 恢复
    if (!videoUrl && !garmentId && !characterId) {
      try {
        const draftRes = await realOutfitChangeApi.getDraft(token, projectId);
        const draft = draftRes.data;
        if (draft) {
          videoUrl = draft.sourceVideoUrl ?? null;
          garmentId = draft.targetOutfitId ?? null;
          characterId = draft.characterId ?? null;
        }
      } catch {
        // 无 draft 不影响流程
      }
    }
    ...
  };
  void loadData();
}, [token, projectId, workflow]);
```

**修改后：**

```tsx
// 加载已选择的数据（完全依赖 workflow 本地状态）
useEffect(() => {
  const loadData = async () => {
    if (!token || !projectId) return;

    // 数据源：完全依赖 workflow 本地状态
    const videoUrl: string | null = typeof workflow.outfitChangeSourceVideoUrl === "string"
      ? (workflow.outfitChangeSourceVideoUrl as string) : null;
    const garmentId: string | null = typeof workflow.outfitChangeSelectedGarmentId === "string"
      ? (workflow.outfitChangeSelectedGarmentId as string) : null;
    const characterId: string | null = typeof workflow.outfitChangeSelectedCharacterId === "string"
      ? (workflow.outfitChangeSelectedCharacterId as string) : null;

    // 源视频
    if (videoUrl) {
      setSourceVideo(videoUrl);
    }

    // 服装
    if (garmentId) {
      try {
        const g = await realGarmentAssetsApi.getGarmentAsset(token, garmentId);
        setGarment({ id: g.id, name: g.name, mainImageUrl: g.mainImageUrl });
      } catch (e) {
        console.error("[Step4] 加载服装失败:", e);
      }
    }

    // 角色
    if (characterId) {
      try {
        const chars = await backendApi.listLibraryCharacters(token);
        const char = chars.items?.find(c => c.id === characterId);
        if (char) {
          setCharacter({ id: char.id, name: char.name, thumbnailUrl: char.thumbnailUrl });
        }
      } catch (e) {
        console.error("[Step4] 加载角色失败:", e);
      }
    }
  };

  void loadData();
}, [token, projectId, workflow]);
```

---

### 步骤 8：补充 OutfitChangeLayout.tsx 的 session 恢复逻辑

**新增代码：** 在文件顶部添加 import，并在 useEffect 中添加恢复逻辑

**新增 import：**

```tsx
import {
  readProjectFlowActiveSession,
  writeProjectFlowActiveSession,
} from "../project-flow/projectFlowActiveSession";
```

**新增 useEffect（页面刷新恢复）：**

```tsx
// 页面刷新时从 session 恢复项目 ID
useEffect(() => {
  // 如果正在关闭项目，跳过恢复
  if (isClosingProjectRef.current) return;
  
  // URL 中已有项目 ID，无需恢复
  if (urlProjectId) return;
  
  // 从 session 缓存恢复
  const session = readProjectFlowActiveSession();
  if (session?.projectId && session.projectKind === "outfit_change") {
    // 恢复项目 ID 和步骤
    navigate(`/outfit-create/${session.projectId}/step${session.step || 1}`, { replace: true });
  }
}, [urlProjectId, navigate]);
```

---

## 边缘情况处理

### 1. 浏览器标签页关闭/意外退出

**场景：** 用户关闭标签页，未触发 handleCloseProject

**处理方式：**

- workflow 状态保存在内存（store），标签页关闭后丢失
- session 缓存保存在 localStorage，标签页关闭后仍存在
- 用户重新打开页面 → session 恢复逻辑触发 → navigate 到正确页面

**恢复流程：**

```
关闭标签页 → store 丢失 → session 保留
      ↓
重新打开页面 → OutfitChangeLayout 加载
      ↓
session 恢复逻辑 → navigate 到 `/outfit-create/{projectId}/step{N}`
      ↓
useProjectState 加载 → 从后端 API 获取项目数据
      ↓
workflow 恢复成功 ✅
```

---

### 2. 断网/网络异常

**场景：** 用户操作时网络断开

**影响：**

- updateWorkflow 本地状态立即生效（不受影响）
- navigate 页面跳转（不受影响）
- 但页面刷新后无法从后端 API 加载数据（受影响）

**处理方式：**

- 页面刷新后，session 恢复逻辑仍可触发
- useProjectState 从后端 API 加载失败 → 显示错误提示
- 用户恢复网络后重新刷新 → 数据恢复

---

### 3. Session 缓存过期/损坏

**场景：** localStorage 中的 session 数据过期或损坏

**处理方式：**

```tsx
const session = readProjectFlowActiveSession();
if (session?.projectId && session.projectKind === "outfit_change") {
  // 验证 session 有效性
  if (session.projectId && typeof session.step === 'number') {
    navigate(`/outfit-create/${session.projectId}/step${session.step}`);
  }
}
```

**失效后处理：**

- session 无效 → 无法恢复 → 用户需要从项目列表重新进入
- 项目列表显示用户所有项目（从后端 API 加载）
- 用户点击项目 → navigate 到正确页面

---

### 4. 并发操作（多标签页编辑同一项目）

**场景：** 用户在多个标签页编辑同一项目

**影响：**

- 每个标签页有独立的 store（内存隔离）
- session 缓存共享（localStorage 共享）
- 一个标签页更新 workflow → 另一个标签页看不到

**处理方式：**

- 这是设计限制，不处理多标签页并发
- 建议用户单标签页编辑
- 如需并发编辑，需要引入跨标签页同步机制（复杂，不建议）

---

## 实施注意事项

### 1. 修改顺序建议

**按依赖关系实施：**

```
阶段 1：移除 saveDraft（Step 1-4）
      ↓ (可并行修改)
      
阶段 2：移除 draft API 加载（useProjectState）
      ↓ (等待阶段 1 完成)
      
阶段 3：移除 draft API 回退（Step 4）
      ↓ (等待阶段 2 完成)
      
阶段 4：补充 session 恢复（Layout）
      ↓ (等待阶段 2 完成)
      
阶段 5：测试验证
```

---

### 2. 编译验证

**每个阶段完成后验证编译：**

```bash
# 前端编译验证
npm --prefix apps/web run build

# 检查是否有 import 未使用（移除 saveDraft 后）
# realOutfitChangeApi 是否还在其他地方使用
```

---

### 3. 功能验证清单

**阶段 1-4 完成后，逐项验证：**

| 功能 | 验证方法 | 预期结果 |
|------|---------|---------|
| 上传视频 | 上传后跳转 Step 2 | workflow 有视频 URL |
| 选择服装 | 选择后跳转 Step 3 | workflow 有服装 ID |
| 选择角色 | 选择后跳转 Step 4 | workflow 有角色 ID |
| 上一步回退 | Step 4 回退到 Step 1 | 所有数据保持 |
| 页面刷新 | 任意 Step 刷新 | session 恢复项目 ID |
| 关闭项目 | 有内容的项目关闭 | 项目保留，不删除 |
| 空项目关闭 | 未上传视频的项目关闭 | 项目删除 |

---

### 4. 后端 draft API 处理

**draft API 是否需要保留？**

| 用途 | 保留建议 | 说明 |
|------|---------|------|
| 换装项目中间状态持久化 | ❌ 不需要 | 前端不再调用 saveDraft 和 getDraft |
| 其他项目类型使用 draft API | ✅ 可能需要 | 检查其他项目是否依赖 draft API |
| 后端清理建议 | ⚠️ 暂不删除 | 先前端移除，观察是否有其他依赖 |

**后续清理建议：**

1. 前端完全移除 draft API 调用
2. 运行一段时间观察是否有其他依赖
3. 确认无依赖后，后端可考虑删除 draft API 端点

---

### 5. 历史项目迁移

**已使用 draft API 的历史项目如何处理？**

**情况分析：**

| 项目状态 | draft API 数据 | 处理方式 |
|---------|---------------|---------|
| 进行中（有 draft 数据） | sourceVideoUrl / targetOutfitId / characterId | 页面刷新后从后端 API 加载项目完整数据，draft 数据无用 |
| 已完成（无 draft 数据） | 无 | 无影响 |

**结论：** 历史项目无需迁移，修改后仍可正常使用。

---

## 风险评估与应对

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|---------|
| session 缓存丢失 | 低 | 中 | 用户从项目列表重新进入 |
| 页面刷新无法恢复 | 低 | 高 | 检查 session 恢复逻辑是否正确 |
| 空项目误删逻辑未修复 | 无 | 高 | 本次修改已解决根本问题 |
| 断网无法加载 | 低 | 中 | 提示用户检查网络，重新刷新 |
| 多标签页并发冲突 | 低 | 低 | 不处理，建议单标签页编辑 |

---

## 测试验证清单

完成修改后，需验证以下场景：

| 场景 | 验证内容 | 预期结果 |
|------|---------|---------|
| **正常流程** | Step 1 → 2 → 3 → 4 | 所有选择数据保持（视频、服装、角色） |
| **上一步回退** | Step 4 → 3 → 2 → 1 | 所有选择数据保持 |
| **页面刷新** | 任意 Step 刷新页面 | 从 session 恢复项目 ID，数据保持 |
| **关闭项目** | 有内容的项目关闭 | 项目保留在列表，不被删除 |
| **空项目关闭** | 未上传视频的项目关闭 | 正确删除空项目 |
| **跳过步骤** | 不选服装/角色进入下一步 | 提示必选，无法跳过 |

---

## 结论与建议

### 问题根源总结

**原视频 URL 丢失的根本原因：**

1. `saveDraft` 异步调用未完成
2. `navigate` 立即跳转，不等 saveDraft
3. useProjectState 缓存清空机制触发，重新加载 draft API
4. draft API 数据覆盖原 workflow → 原视频 URL 丢失
5. 系统误判为空项目 → 项目被删除

---

### 最终建议

**强烈推荐方案 1：移除 saveDraft，完全依赖 workflow 本地状态**

**理由：**
1. ✅ 完全解决根本问题（draft API 覆盖）
2. ✅ 状态立即生效，无延迟
3. ✅ 与 video 项目架构一致
4. ✅ 简化实现，移除复杂性
5. ✅ 防止项目误删

---

### 完整实施方案

| 阶段 | 步骤 | 状态 |
|------|------|------|
| **阶段 1：移除 saveDraft** | 1-4 步移除所有 saveDraft 调用 | ❌ 待实施 |
| **阶段 2：移除 draft API 加载** | 5-6 步移除 useProjectState 的 draft 逻辑 | ❌ 待实施 |
| **阶段 3：移除 draft API 回退** | 第 7 步移除 OutfitChangeStep4 的 draft 回退 | ❌ 待实施 |
| **阶段 4：补充 session 恢复** | 第 8 步补充 OutfitChangeLayout 的 session 恢复 | ❌ 待实施 |
| **阶段 5：测试验证** | 验证 6 个场景 | ❌ 待实施 |

---

### 下一步行动

**立即开始实施方案 1，按照 8 个步骤逐一完成：**

1. 移除 OutfitChangeStep1.tsx 的 saveDraft（上传成功）
2. 移除 OutfitChangeStep1.tsx 的 saveDraft（确认视频）
3. 移除 OutfitChangeStep2.tsx 的 saveDraft
4. 移除 OutfitChangeStep3.tsx 的 saveDraft
5. 移除 useProjectState.ts 的 draft API 获取逻辑
6. 移除 useProjectState.ts 的 draft 数据写入逻辑
7. 移除 OutfitChangeStep4.tsx 的 draft API 回退逻辑
8. 补充 OutfitChangeLayout.tsx 的 session 恢复逻辑

**完成后进行全面测试验证。**