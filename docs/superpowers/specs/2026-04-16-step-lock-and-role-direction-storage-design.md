# 步骤锁定与角色预设存储重构设计

> **面向 AI 代理的工作者：** 本规格描述了两个独立但相关的改动：(1) 用 `project.status` 控制步骤只读锁定；(2) 角色预设列表迁移到独立表。

**目标：** 实现步骤不可逆锁定（到 Step2 后 Step1 只读），并将角色预设列表从 workflow state 快照迁移到独立表。

**架构：** 复用 `nrm_projects.status` 作为锁定依据，前端通过 step 数据接口获取 `projectStatus` 计算最大可编辑步骤；新建 `nrm_role_direction_cards` 表（一行存一个项目的所有角色卡片 JSONB），替代从 workflow state 快照读取角色预设列表。

**技术栈：** PostgreSQL, Fastify, React/Zustand

---

## 需求分解

### 需求 1：步骤锁定（不可逆）

用户进入后续步骤后，前面的步骤变为只读。

| project.status | Step1 | Step2 | Step3 | Step4 | Step5 |
|---|---|---|---|---|---|
| `DRAFT` | ✏️ | ✏️ | ✏️ | ✏️ | ✏️ |
| `OUTFIT_CONFIRMED` | 👁️ | ✏️ | ✏️ | ✏️ | ✏️ |
| `CHARACTER_CONFIRMED` | 👁️ | 👁️ | ✏️ | ✏️ | ✏️ |
| `SCRIPT_CONFIRMED` | 👁️ | 👁️ | 👁️ | ✏️ | ✏️ |
| `STORYBOARDING`+ | 👁️ | 👁️ | 👁️ | 👁️ | 👁️ |

- 👁️ = 只读（前端禁用编辑控件）
- ✏️ = 可编辑

**前端行为：** 各 Step 数据接口统一返回 `projectStatus`，前端根据上表计算 `maxEditableStep`，禁用已锁定步骤的编辑操作。后端暂不拦截。

### 需求 2：角色预设列表独立存储

当前角色预设列表存在 `nrm_project_workflow_states` 快照中，读取不稳定且容易丢失。

**改为：** 新建 `nrm_role_direction_cards` 表，每项目一行，`cards_json` 存角色卡片数组。`project.selectedRoleDirection`（用户选中的那个）仍留在 projects 表。

---

## 数据库变更

### 新建表：`nrm_role_direction_cards`

```sql
-- 角色预设卡片表（每项目一行，cards_json 存数组）
CREATE TABLE nrm_role_direction_cards (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL UNIQUE REFERENCES nrm_projects(id) ON DELETE CASCADE,
  cards_json   JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 创建索引方便按项目查询（虽然 UNIQUE 已隐含索引）
CREATE INDEX idx_role_direction_cards_project ON nrm_role_direction_cards(project_id);

COMMENT ON TABLE nrm_role_direction_cards IS '角色预设卡片表 - 每个项目一行，cards_json 存储角色方向卡片数组';
COMMENT ON COLUMN nrm_role_direction_cards.project_id IS '关联项目ID';
COMMENT ON COLUMN nrm_role_direction_cards.cards_json IS '角色方向卡片数组 (Step1RoleDirectionCard[])';
```

### `cards_json` 结构

`Step1RoleDirectionCard[]` 数组，每个元素结构：
```json
{
  "directionId": "uuid",
  "title": "商务精英风",
  "styleSummary": "干练都市男性形象...",
  "portraitUrl": "https://...",
  "confidence": 0.95,
  "overallImpression": "...",
  "ethnicityOrRegion": "东亚",
  "gender": "male",
  "age": 30,
  "styleWords": ["商务", "都市", "干练"]
}
```

---

## 后端变更

### 1. 各 Step 数据接口统一返回 `projectStatus`

现有接口及返回值变更：

**`GET /projects/:projectId/step1-state`**（已存在）
```typescript
// 新增字段
return {
  projectStatus: project.status,  // ← 新增
  projectId: project.id,
  selectedOutfitPlanId: ...,
  step1Step2Ready: ...,
  // ... 其他字段不变
};
```

**`GET /projects/:projectId/garments`**（已存在）
```typescript
return {
  projectStatus: project.status,  // ← 新增
  modules: ...,
};
```

**`GET /projects/:projectId/outfit-plans`**（已存在）
```typescript
return {
  projectStatus: project.status,  // ← 新增
  outfitPlans: ...,
};
```

**后续 Step2-Step5 数据接口**（新增或修改时）统一添加 `projectStatus` 字段。

### 2. 角色预设列表改为从新表读取

**`getStep1StateRoute` 修改：**
```typescript
// 旧：从 step1Snapshot 快照读取
// const step1RoleDirectionCards = step1Snapshot?.step1RoleDirectionCards ?? [];

// 新：从 nrm_role_direction_cards 表读取
const roleDirectionRecord = await ctx.repos.roleDirectionCards.findByProjectId(project.id);
const step1RoleDirectionCards = roleDirectionRecord?.cardsJson ?? [];
```

**生成角色预设后保存到新表：**
```typescript
// 旧：保存到 workflow state 快照
// 新：写入/更新 nrm_role_direction_cards
await ctx.repos.roleDirectionCards.upsert(project.id, cardsArray);
```

### 3. 新增 Repository：`PgRoleDirectionCardsRepository`

```typescript
interface PgRoleDirectionCardsRepository {
  findByProjectId(projectId: string): Promise<{ projectId: string; cardsJson: Step1RoleDirectionCard[] } | null>;
  upsert(projectId: string, cards: Step1RoleDirectionCard[]): Promise<void>;
  deleteByProjectId(projectId: string): Promise<void>;
}
```

注册到 `AppContext` 的 `repos` 中。

---

## 前端变更

### 1. Step 数据接口类型增加 `projectStatus`

所有 step 相关 API 响应类型增加：
```typescript
projectStatus: string;  // ProjectStatus 枚举值
```

### 2. 前端锁定计算逻辑

在 store 中新增计算属性：
```typescript
const maxEditableStep = computed(() => {
  switch (projectStatus) {
    case 'DRAFT': return 5;
    case 'OUTFIT_CONFIRMED': return 2;
    case 'CHARACTER_CONFIRMED': return 3;
    case 'SCRIPT_CONFIRMED': return 4;
    default: return 0;  // STORYBOARDING+ 全部只读
  }
});
```

各 Step 页面根据 `currentStep <= maxEditableStep` 判断是否禁用编辑控件。

**Step1 现有逻辑迁移：**
- 当前 `disabled={step1Step2Ready || card.status === "pending"}` 改为
- `disabled={currentStep > maxEditableStep || card.status === "pending"}`
- `step1Step2Ready` 后续可废弃（保留向后兼容）

### 3. 角色预设列表加载改为独立接口

Step1 页面加载时调用新接口获取角色预设列表，不再依赖 workflow state 快照。

---

## 数据迁移

从现有 workflow state 快照中提取角色预设卡片，写入新表：

```sql
-- 从 nrm_project_workflow_states 的 project_data / page_content_snapshot 中提取
-- 写入 nrm_role_direction_cards
INSERT INTO nrm_role_direction_cards (project_id, cards_json)
SELECT
  project_id,
  COALESCE(
    extracted_cards,
    '[]'::jsonb
  )
FROM (
  SELECT
    project_id,
    -- 从 snapshot 中提取 step1RoleDirectionCards
    workflow->'step1'->'step1RoleDirectionCards' as extracted_cards
  FROM nrm_project_workflow_states
  WHERE workflow IS NOT NULL
) sub
ON CONFLICT (project_id) DO NOTHING;
```

---

## 受影响的文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/contracts/types.ts` | 修改 | Project 类型已有 status 字段 |
| `src/routes/project-flow-route-handlers.ts` | 修改 | 3 个接口加 projectStatus，角色预设改为读新表 |
| `src/repositories/pg/` | 新增 | `role-direction-cards-pg-repository.ts` |
| `src/core/app-context.ts` | 修改 | 注册 roleDirectionCards repo |
| `apps/web/services/realApi/projects.ts` | 修改 | API 类型增加 projectStatus |
| `apps/web/store/useAppStore.ts` | 修改 | 新增 maxEditableStep 计算 |
| `apps/web/pages/project-flow/Assets.tsx` | 修改 | 锁定逻辑改用 maxEditableStep |
| `docs/buss/table/project-relation.md` | 修改 | 补充新表文档 |
