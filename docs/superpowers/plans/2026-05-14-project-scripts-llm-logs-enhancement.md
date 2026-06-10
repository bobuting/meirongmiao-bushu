# Plan: 项目管理详情页增强 - 脚本JSON、专业提示词、LLM日志

## Context

用户希望在 `/admin-portal?tab=projects` → 项目详情弹窗（`ProjectDetailModal`）中新增三个功能：
1. 查看当前项目的所有脚本，以 step3 大模型生成的 JSON 格式展示
2. 查看专业提示词（shot_prompt_engineer 输出格式）
3. 查看选中脚本的原始脚本 JSON
4. 查看项目关联的所有 LLM 日志并支持打开详情

当前 `ProjectDetailModal` 已有 8 个 Tab（Step1-6 + 任务列表 + 资源消耗），但缺少脚本原始数据、提示词数据和 LLM 日志的展示。

## 实现概述

### 后端改动（2 处）

1. **新增 API：`GET /admin/projects/:projectId/scripts/raw`** — 返回项目所有脚本的原始数据
2. **修改 API：`GET /admin/call-audits`** — 新增 `projectId` 筛选参数

### 前端改动（3 处）

1. **`ProjectDetailModal.tsx`** — 新增 3 个 Tab
2. **`admin.ts`（前端 API 层）** — 新增接口类型和调用函数
3. 新建 **`ProjectScriptsTab.tsx`** — 脚本 JSON 和提示词展示组件

---

## 详细设计

### 后端 1: 新增脚本原始数据端点

**文件**: `src/routes/admin/projects-routes.ts`

新增路由 `GET /admin/projects/:projectId/scripts/raw`：

```typescript
// 返回格式
interface ProjectScriptsRawResponse {
  scripts: Array<{
    scriptId: string;
    title: string;
    isSelected: boolean;
    isConfirmed: boolean;
    strategyType: string;
    createdAt: number;
    // 原始 LLM 输出格式 (VideoScriptPayload)
    payload: {
      video_info: Record<string, unknown>;
      video_analysis: Record<string, unknown>;
      shot_breakdown: ShotBreakdownItem[];
      editing_analysis: Record<string, unknown>;
    };
    // 专业提示词 (shot_prompt_engineer 输出)
    shotPrompts: Record<string, unknown> | null;
  }>;
}
```

**实现逻辑**：
1. 查询 `nrm_script_data` 获取所有脚本（复用已有查询逻辑）
2. 对每个脚本查询 `nrm_shot_breakdown` 表获取分镜数据
3. 使用重建函数将扁平列 + 分镜数据组装为 `VideoScriptPayload` 格式
4. `shot_prompts` 字段直接从 `nrm_script_data.shot_prompts` JSONB 列读取

**重建 VideoScriptPayload 参考**: `src/modules/fission-video/fission-new-story-executor.ts:87-100`

---

### 后端 2: LLM 日志增加 projectId 筛选

**文件**: `src/routes/admin/logs-routes.ts`

在 `LogsQueryParams` 接口新增 `projectId?: string`，在 WHERE 子句中增加条件：

```typescript
// 新增参数
if (projectId) {
  conditions.push(`project_id = $${paramIndex++}`);
  params.push(projectId);
}
```

---

### 前端 1: API 层新增接口

**文件**: `apps/web/services/realApi/admin.ts`

1. 新增 `getAdminProjectScriptsRaw()` 接口函数，调用 `GET /admin/projects/:id/scripts/raw`
2. 在 `callAuditsList` 的 filters 参数中新增 `projectId?: string`

---

### 前端 2: 新增 ProjectScriptsTab 组件

**新建文件**: `apps/web/pages/admin/ProjectScriptsTab.tsx`

包含两个子视图：

**A. 脚本 JSON 视图**
- 列表展示所有脚本（标题、策略类型、选中/确认状态）
- 点击脚本卡片展开，显示完整 `payload` JSON（语法高亮/格式化）
- JSON 包含 `video_info`、`video_analysis`、`shot_breakdown`、`editing_analysis`
- 复制 JSON 按钮

**B. 专业提示词视图**
- 仅展示有 `shotPrompts` 数据的脚本
- 点击展开显示 `shot_prompts` 完整 JSON
- JSON 包含 `project_info`、`character_anchors`、`shots[]`（含 `keyframe_prompt` + `video_prompt`）、`emotional_arc`、`consistency_notes`

---

### 前端 3: 修改 ProjectDetailModal

**文件**: `apps/web/pages/admin/ProjectDetailModal.tsx`

1. `TabId` 类型新增: `'scripts' | 'prompts' | 'llm-logs'`
2. Tab 定义数组新增 3 个 Tab（仅 video/reverse/outfit_change 显示）:
   ```ts
   { id: 'scripts', label: '脚本JSON' },
   { id: 'prompts', label: '专业提示词' },
   { id: 'llm-logs', label: 'LLM日志' },
   ```
3. Tab 内容区新增 3 个 case:
   - `'scripts'` → `<ProjectScriptsTab projectId={projectId} mode="scripts" />`
   - `'prompts'` → `<ProjectScriptsTab projectId={projectId} mode="prompts" />`
   - `'llm-logs'` → LLM 日志表格（内联实现，复用 CallAuditTab 的数据结构，但自动传入 projectId 筛选）

---

## 依赖关系

```
后端 scripts/raw API ──→ 前端 ProjectScriptsTab
后端 call-audits +projectId ──→ 前端 LLM 日志 Tab
```

## 关键文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/routes/admin/projects-routes.ts` | 修改 | 新增 scripts/raw 端点 |
| `src/routes/admin/logs-routes.ts` | 修改 | call-audits 增加 projectId 筛选 |
| `apps/web/services/realApi/admin.ts` | 修改 | 新增前端 API 函数 |
| `apps/web/pages/admin/ProjectScriptsTab.tsx` | **新建** | 脚本JSON + 提示词展示组件 |
| `apps/web/pages/admin/ProjectDetailModal.tsx` | 修改 | 新增 3 个 Tab |

## 验证方式

1. 启动后端 `npm run dev` + 前端 `npm --prefix apps/web run dev`
2. 打开 `http://localhost:3000/admin-portal?tab=projects`
3. 点击任意项目的 "more_vert" 按钮打开详情弹窗
4. 验证：
   - **脚本JSON Tab**: 显示所有脚本列表，点击展开查看完整 JSON（video_info/video_analysis/shot_breakdown/editing_analysis）
   - **专业提示词 Tab**: 显示有 shot_prompts 的脚本，展开查看 character_anchors + shots[keyframe_prompt+video_prompt]
   - **LLM日志 Tab**: 显示该项目关联的所有 LLM 调用记录，点击详情查看 messages_json
   - JSON 均可复制
