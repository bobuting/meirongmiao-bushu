# 项目目录结构重构实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将"后端包着前端"的结构重构为"平行结构 + 全面共享"，frontend 与 backend 同级，shared 存放前后端共享代码。

**架构：** 采用 npm workspaces 管理三个包（frontend、backend、shared），通过 path alias（@shared/*）实现共享模块引用，保持现有代码逻辑不变，只调整目录位置和导入路径。

**技术栈：** npm workspaces、TypeScript path aliases、Vite alias、ES modules

---

## 文件结构

### 将要创建的目录

| 目录 | 职责 |
|------|------|
| `frontend/` | 前端代码（从 apps/web 迁移） |
| `backend/` | 后端代码（从 src + 根目录配置迁移） |
| `shared/` | 前后端共享代码 |
| `shared/constants/` | 常量枚举（17个模块文件） |
| `shared/types/` | 共享类型定义 |
| `shared/contracts/` | 数据契约（~60个文件） |
| `shared/utils/` | 纯函数工具 |

### 将要创建的配置文件

| 文件 | 职责 |
|------|------|
| `package.json`（根目录） | workspace 协调器 |
| `tsconfig.base.json` | 共享 TS 配置基础 |
| `shared/package.json` | 共享模块配置 |
| `frontend/tsconfig.json` | 前端 TS 配置（更新 path alias） |
| `backend/tsconfig.json` | 后端 TS 配置（更新 path alias） |

### 将要修改的文件

| 文件 | 修改内容 |
|------|---------|
| 所有前端 `.ts/.tsx` 文件 | 更新导入路径（~100+ 文件） |
| 所有后端 `.ts` 文件 | 更新导入路径（~200+ 文件） |
| `frontend/vite.config.ts` | 添加 @shared alias |
| `.gitignore` | 更新路径规则 |
| `CLAUDE.md` | 更新项目结构描述 |

---

## 阶段一：创建目录结构

### 任务 1.1：创建基础目录

**文件：**
- 创建目录：`frontend/`、`backend/`、`shared/`

- [ ] **步骤 1：创建目录结构**

```bash
mkdir -p frontend backend shared
mkdir -p shared/constants shared/types shared/contracts shared/utils
mkdir -p backend/src backend/public backend/scripts backend/test backend/config backend/data
```

- [ ] **步骤 2：验证目录创建成功**

```bash
ls -la frontend backend shared
```

预期输出：三个目录都存在

- [ ] **步骤 3：Commit**

```bash
git add frontend backend shared
git commit -m "chore: 创建 frontend、backend、shared 目录结构"
```

---

## 阶段二：迁移前端代码

### 任务 2.1：迁移 apps/web 到 frontend

**文件：**
- 移动：`apps/web/*` → `frontend/`

- [ ] **步骤 1：移动前端代码**

```bash
# 移动所有文件（保留 apps/web 的隐藏文件）
cp -r apps/web/* frontend/
cp -r apps/web/.gitignore frontend/ 2>/dev/null || true
cp -r apps/web/.mcp.json frontend/ 2>/dev/null || true
```

- [ ] **步骤 2：验证文件移动成功**

```bash
ls -la frontend/
```

预期输出：包含 package.json、pages/、components/、services/ 等目录

- [ ] **步骤 3：暂不删除 apps/web，等验证通过后再清理**

- [ ] **步骤 4：Commit**

```bash
git add frontend/
git commit -m "chore: 迁移前端代码到 frontend 目录"
```

---

## 阶段三：迁移后端代码

### 任务 3.1：迁移 src 目录

**文件：**
- 移动：`src/*` → `backend/src/`

- [ ] **步骤 1：移动后端源码**

```bash
cp -r src/* backend/src/
```

- [ ] **步骤 2：验证文件移动成功**

```bash
ls -la backend/src/
```

预期输出：包含 app.ts、routes/、modules/、contracts/ 等目录

- [ ] **步骤 3：Commit**

```bash
git add backend/src/
git commit -m "chore: 迁移后端源码到 backend/src 目录"
```

### 任务 3.2：迁移后端配置和资源

**文件：**
- 移动：`package.json` → `backend/package.json`
- 移动：`tsconfig.json` → `backend/tsconfig.json`
- 移动：`public/*` → `backend/public/`
- 移动：`scripts/*` → `backend/scripts/`
- 移动：`test/*` → `backend/test/`
- 移动：`config/*` → `backend/config/`
- 移动：`data/*` → `backend/data/`

- [ ] **步骤 1：移动配置文件**

```bash
cp package.json backend/
cp tsconfig.json backend/
```

- [ ] **步骤 2：移动资源目录**

```bash
cp -r public/* backend/public/ 2>/dev/null || mkdir -p backend/public
cp -r scripts/* backend/scripts/ 2>/dev/null || mkdir -p backend/scripts
cp -r test/* backend/test/ 2>/dev/null || mkdir -p backend/test
cp -r config/* backend/config/ 2>/dev/null || mkdir -p backend/config
cp -r data/* backend/data/ 2>/dev/null || mkdir -p backend/data
```

- [ ] **步骤 3：验证文件移动成功**

```bash
ls -la backend/
```

预期输出：包含 package.json、tsconfig.json、public/、scripts/、test/ 等

- [ ] **步骤 4：Commit**

```bash
git add backend/
git commit -m "chore: 迁移后端配置和资源到 backend 目录"
```

---

## 阶段四：创建 shared/constants/

### 任务 4.1：拆分 shared_dict.ts 为独立模块

**文件：**
- 创建：`shared/constants/index.ts`
- 创建：`shared/constants/role.ts`
- 创建：`shared/constants/upload-slot.ts`
- 创建：`shared/constants/asset-category.ts`
- 创建：`shared/constants/character.ts`
- 创建：`shared/constants/provider.ts`
- 创建：`shared/constants/project-status.ts`
- 创建：`shared/constants/script-source.ts`
- 创建：`shared/constants/review.ts`
- 创建：`shared/constants/video-job.ts`
- 创建：`shared/constants/resolution.ts`
- 创建：`shared/constants/theme.ts`
- 创建：`shared/constants/fission.ts`
- 创建：`shared/constants/trend.ts`
- 创建：`shared/constants/square.ts`
- 创建：`shared/constants/step-prompt.ts`
- 创建：`shared/constants/prompt-mode.ts`
- 创建：`shared/constants/pipeline.ts`

- [ ] **步骤 1：创建 role.ts**

```typescript
// shared/constants/role.ts
/**
 * 用户角色常量
 */

export const ROLE = {
  USER: 'user',
  ADMIN: 'admin',
} as const;

export type Role = typeof ROLE[keyof typeof ROLE];

export const ROLE_LABELS: Record<Role, string> = {
  [ROLE.USER]: '普通用户',
  [ROLE.ADMIN]: '管理员',
};
```

- [ ] **步骤 2：创建 upload-slot.ts**

```typescript
// shared/constants/upload-slot.ts
/**
 * 上传槽位常量
 */

export const UPLOAD_SLOT = {
  TOP: 'top',
  BOTTOM: 'bottom',
  SHOES: 'shoes',
  ACCESSORY: 'accessory',
} as const;

export type UploadSlot = typeof UPLOAD_SLOT[keyof typeof UPLOAD_SLOT];

export const UPLOAD_SLOT_LABELS: Record<UploadSlot, string> = {
  [UPLOAD_SLOT.TOP]: '上装',
  [UPLOAD_SLOT.BOTTOM]: '下装',
  [UPLOAD_SLOT.SHOES]: '鞋子',
  [UPLOAD_SLOT.ACCESSORY]: '配饰',
};
```

- [ ] **步骤 3：创建 asset-category.ts**

```typescript
// shared/constants/asset-category.ts
/**
 * 资产分类常量
 */

import { UPLOAD_SLOT } from './upload-slot.js';

export const ASSET_CATEGORY = {
  ...UPLOAD_SLOT,
  VIDEO: 'video',
} as const;

export type AssetCategory = typeof ASSET_CATEGORY[keyof typeof ASSET_CATEGORY];
```

- [ ] **步骤 4：创建 character.ts**

```typescript
// shared/constants/character.ts
/**
 * 角色相关常量
 */

// 角色类型
export const CHARACTER_KIND = {
  BASIC: 'basic',
  IMAGE: 'image',
  VIDEO: 'video',
} as const;

export type CharacterKind = typeof CHARACTER_KIND[keyof typeof CHARACTER_KIND];

export const CHARACTER_KIND_LABELS: Record<CharacterKind, string> = {
  [CHARACTER_KIND.BASIC]: '基础角色',
  [CHARACTER_KIND.IMAGE]: '图片角色',
  [CHARACTER_KIND.VIDEO]: '视频角色',
};

// 角色视角
export const CHARACTER_VIEW_KEY = {
  FRONT: 'front',
  LEFT: 'left',
  RIGHT: 'right',
  BACK: 'back',
  CLOSEUP: 'closeup',
} as const;

export type CharacterViewKey = typeof CHARACTER_VIEW_KEY[keyof typeof CHARACTER_VIEW_KEY];

export const CHARACTER_VIEW_KEY_LABELS: Record<CharacterViewKey, string> = {
  [CHARACTER_VIEW_KEY.FRONT]: '正面',
  [CHARACTER_VIEW_KEY.LEFT]: '左侧',
  [CHARACTER_VIEW_KEY.RIGHT]: '右侧',
  [CHARACTER_VIEW_KEY.BACK]: '背面',
  [CHARACTER_VIEW_KEY.CLOSEUP]: '特写',
};

// 角色视角状态
export const CHARACTER_VIEW_STATE = {
  PENDING: 'pending',
  GENERATING: 'generating',
  READY: 'ready',
  FAILED: 'failed',
} as const;

export type CharacterViewState = typeof CHARACTER_VIEW_STATE[keyof typeof CHARACTER_VIEW_STATE];

export const CHARACTER_VIEW_STATE_LABELS: Record<CharacterViewState, string> = {
  [CHARACTER_VIEW_STATE.PENDING]: '待处理',
  [CHARACTER_VIEW_STATE.GENERATING]: '生成中',
  [CHARACTER_VIEW_STATE.READY]: '已完成',
  [CHARACTER_VIEW_STATE.FAILED]: '失败',
};

export const CHARACTER_VIEW_STATE_COLORS: Record<CharacterViewState, string> = {
  [CHARACTER_VIEW_STATE.PENDING]: 'gray',
  [CHARACTER_VIEW_STATE.GENERATING]: 'blue',
  [CHARACTER_VIEW_STATE.READY]: 'green',
  [CHARACTER_VIEW_STATE.FAILED]: 'red',
};
```

- [ ] **步骤 5：创建 provider.ts**

```typescript
// shared/constants/provider.ts
/**
 * 供应商类型常量
 */

export const PROVIDER_TYPE = {
  LLM: 'llm',
  IMAGE: 'image',
  VIDEO: 'video',
  THIRD_PARTY: 'third_party',
} as const;

export type ProviderType = typeof PROVIDER_TYPE[keyof typeof PROVIDER_TYPE];

export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  [PROVIDER_TYPE.LLM]: 'LLM',
  [PROVIDER_TYPE.IMAGE]: '图片生成',
  [PROVIDER_TYPE.VIDEO]: '视频生成',
  [PROVIDER_TYPE.THIRD_PARTY]: '第三方服务',
};
```

- [ ] **步骤 6：创建 project-status.ts**

```typescript
// shared/constants/project-status.ts
/**
 * 项目状态常量
 */

export const PROJECT_STATUS = {
  DRAFT: 'DRAFT',
  OUTFIT_CONFIRMED: 'OUTFIT_CONFIRMED',
  CHARACTER_CONFIRMED: 'CHARACTER_CONFIRMED',
  SCRIPT_CONFIRMED: 'SCRIPT_CONFIRMED',
  STORYBOARDING: 'STORYBOARDING',
  FILMING: 'FILMING',
  VIDEO_COMPLETED: 'VIDEO_COMPLETED',
  FISSIONING: 'FISSIONING',
  READY_TO_PUBLISH: 'READY_TO_PUBLISH',
  PUBLISHED: 'PUBLISHED',
} as const;

export type ProjectStatus = typeof PROJECT_STATUS[keyof typeof PROJECT_STATUS];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  [PROJECT_STATUS.DRAFT]: '草稿',
  [PROJECT_STATUS.OUTFIT_CONFIRMED]: '穿搭已确认',
  [PROJECT_STATUS.CHARACTER_CONFIRMED]: '角色已确认',
  [PROJECT_STATUS.SCRIPT_CONFIRMED]: '脚本已确认',
  [PROJECT_STATUS.STORYBOARDING]: '分镜生成中',
  [PROJECT_STATUS.FILMING]: '视频生成中',
  [PROJECT_STATUS.VIDEO_COMPLETED]: '视频已完成',
  [PROJECT_STATUS.FISSIONING]: '裂变中',
  [PROJECT_STATUS.READY_TO_PUBLISH]: '待发布',
  [PROJECT_STATUS.PUBLISHED]: '已发布',
};
```

- [ ] **步骤 7：创建 script-source.ts**

```typescript
// shared/constants/script-source.ts
/**
 * 脚本来源类型常量
 */

export const SCRIPT_SOURCE_TYPE = {
  TEMPLATE: 'template',
  ORIGINAL: 'original',
  REVERSE: 'reverse',
} as const;

export type ScriptSourceType = typeof SCRIPT_SOURCE_TYPE[keyof typeof SCRIPT_SOURCE_TYPE];

export const SCRIPT_SOURCE_TYPE_LABELS: Record<ScriptSourceType, string> = {
  [SCRIPT_SOURCE_TYPE.TEMPLATE]: '模板',
  [SCRIPT_SOURCE_TYPE.ORIGINAL]: '原创',
  [SCRIPT_SOURCE_TYPE.REVERSE]: '逆向解析',
};
```

- [ ] **步骤 8：创建 review.ts**

```typescript
// shared/constants/review.ts
/**
 * 审核状态常量
 */

export const REVIEW_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  NEEDS_CHANGES: 'needs_changes',
} as const;

export type ReviewStatus = typeof REVIEW_STATUS[keyof typeof REVIEW_STATUS];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  [REVIEW_STATUS.PENDING]: '待审核',
  [REVIEW_STATUS.APPROVED]: '已通过',
  [REVIEW_STATUS.REJECTED]: '已拒绝',
  [REVIEW_STATUS.NEEDS_CHANGES]: '需修改',
};

export const REVIEW_STATUS_COLORS: Record<ReviewStatus, string> = {
  [REVIEW_STATUS.PENDING]: 'orange',
  [REVIEW_STATUS.APPROVED]: 'green',
  [REVIEW_STATUS.REJECTED]: 'red',
  [REVIEW_STATUS.NEEDS_CHANGES]: 'blue',
};
```

- [ ] **步骤 9：创建 video-job.ts**

```typescript
// shared/constants/video-job.ts
/**
 * 视频任务状态常量
 */

export const VIDEO_JOB_STATUS = {
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  TIMEOUT: 'timeout',
} as const;

export type VideoJobStatus = typeof VIDEO_JOB_STATUS[keyof typeof VIDEO_JOB_STATUS];

export const VIDEO_JOB_STATUS_LABELS: Record<VideoJobStatus, string> = {
  [VIDEO_JOB_STATUS.RUNNING]: '运行中',
  [VIDEO_JOB_STATUS.SUCCEEDED]: '成功',
  [VIDEO_JOB_STATUS.FAILED]: '失败',
  [VIDEO_JOB_STATUS.TIMEOUT]: '超时',
};
```

- [ ] **步骤 10：创建 resolution.ts**

```typescript
// shared/constants/resolution.ts
/**
 * 分辨率常量
 */

export const RESOLUTION = {
  P720: '720p',
  P1080: '1080p',
} as const;

export type Resolution = typeof RESOLUTION[keyof typeof RESOLUTION];

export const RESOLUTION_LABELS: Record<Resolution, string> = {
  [RESOLUTION.P720]: '720p',
  [RESOLUTION.P1080]: '1080p',
};
```

- [ ] **步骤 11：创建 theme.ts**

```typescript
// shared/constants/theme.ts
/**
 * 主题分类常量
 */

export const THEME_CATEGORY = {
  TECH: 'tech',
  ECOMMERCE: 'ecommerce',
  FASHION: 'fashion',
  KIDS: 'kids',
  CUSTOM: 'custom',
} as const;

export type ThemeCategory = typeof THEME_CATEGORY[keyof typeof THEME_CATEGORY];

export const THEME_CATEGORY_LABELS: Record<ThemeCategory, string> = {
  [THEME_CATEGORY.TECH]: '科技',
  [THEME_CATEGORY.ECOMMERCE]: '电商',
  [THEME_CATEGORY.FASHION]: '时尚',
  [THEME_CATEGORY.KIDS]: '儿童',
  [THEME_CATEGORY.CUSTOM]: '自定义',
};
```

- [ ] **步骤 12：创建 fission.ts**

```typescript
// shared/constants/fission.ts
/**
 * 裂变相关常量
 */

// 裂变类型
export const FISSION_TYPE = {
  STORYBOARD_RECOMBINE: 'storyboard_recombine',
  HOMOGENIZE_OPTIMIZE: 'homogenize_optimize',
  AI_NEW_STORY: 'ai_new_story',
} as const;

export type FissionType = typeof FISSION_TYPE[keyof typeof FISSION_TYPE];

export const FISSION_TYPE_LABELS: Record<FissionType, string> = {
  [FISSION_TYPE.STORYBOARD_RECOMBINE]: '分镜重组',
  [FISSION_TYPE.HOMOGENIZE_OPTIMIZE]: '同质化优化',
  [FISSION_TYPE.AI_NEW_STORY]: 'AI新故事',
};

// 裂变视频状态
export const FISSION_VIDEO_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type FissionVideoStatus = typeof FISSION_VIDEO_STATUS[keyof typeof FISSION_VIDEO_STATUS];

export const FISSION_VIDEO_STATUS_LABELS: Record<FissionVideoStatus, string> = {
  [FISSION_VIDEO_STATUS.PENDING]: '待处理',
  [FISSION_VIDEO_STATUS.PROCESSING]: '处理中',
  [FISSION_VIDEO_STATUS.COMPLETED]: '已完成',
  [FISSION_VIDEO_STATUS.FAILED]: '失败',
};
```

- [ ] **步骤 13：创建 trend.ts**

```typescript
// shared/constants/trend.ts
/**
 * 热榜相关常量
 */

// 热榜话题类型
export const TREND_TOPIC_TYPE = {
  REALTIME: 'realtime',
  VIDEO: 'video',
} as const;

export type TrendTopicType = typeof TREND_TOPIC_TYPE[keyof typeof TREND_TOPIC_TYPE];

export const TREND_TOPIC_TYPE_LABELS: Record<TrendTopicType, string> = {
  [TREND_TOPIC_TYPE.REALTIME]: '实时热榜',
  [TREND_TOPIC_TYPE.VIDEO]: '视频热榜',
};

// 热榜时间窗口
export const TREND_WINDOW = {
  H24: '24h',
  D7: '7d',
  D30: '30d',
} as const;

export type TrendWindow = typeof TREND_WINDOW[keyof typeof TREND_WINDOW];

export const TREND_WINDOW_LABELS: Record<TrendWindow, string> = {
  [TREND_WINDOW.H24]: '24小时',
  [TREND_WINDOW.D7]: '7天',
  [TREND_WINDOW.D30]: '30天',
};
```

- [ ] **步骤 14：创建 square.ts**

```typescript
// shared/constants/square.ts
/**
 * 广场发布分类常量
 */

export const SQUARE_PUBLISH_CATEGORY = {
  MEN: '男装',
  WOMEN: '女装',
  BOYS: '男童装',
  GIRLS: '女童装',
} as const;

export type SquarePublishCategory = typeof SQUARE_PUBLISH_CATEGORY[keyof typeof SQUARE_PUBLISH_CATEGORY];

export const SQUARE_PUBLISH_CATEGORY_LABELS: Record<SquarePublishCategory, string> = {
  [SQUARE_PUBLISH_CATEGORY.MEN]: '男装',
  [SQUARE_PUBLISH_CATEGORY.WOMEN]: '女装',
  [SQUARE_PUBLISH_CATEGORY.BOYS]: '男童装',
  [SQUARE_PUBLISH_CATEGORY.GIRLS]: '女童装',
};
```

- [ ] **步骤 15：创建 step-prompt.ts**

```typescript
// shared/constants/step-prompt.ts
/**
 * 步骤提示词类型常量
 */

export const STEP_PROMPT_TYPE = {
  HOTSPOT_EXTRACT: 'hotspot_extract',
  HOTSPOT_ANALYSIS: 'hotspot_analysis',
  CHARACTER_ANALYSIS: 'character_analysis',
  SCRIPT_CREATION: 'script_creation',
} as const;

export type StepPromptType = typeof STEP_PROMPT_TYPE[keyof typeof STEP_PROMPT_TYPE];

export const STEP_PROMPT_TYPE_LABELS: Record<StepPromptType, string> = {
  [STEP_PROMPT_TYPE.HOTSPOT_EXTRACT]: '提取热点信息',
  [STEP_PROMPT_TYPE.HOTSPOT_ANALYSIS]: '热点深度分析',
  [STEP_PROMPT_TYPE.CHARACTER_ANALYSIS]: '角色形象分析',
  [STEP_PROMPT_TYPE.SCRIPT_CREATION]: '脚本创作',
};
```

- [ ] **步骤 16：创建 prompt-mode.ts**

```typescript
// shared/constants/prompt-mode.ts
/**
 * Prompt 模式常量
 */

export const PROMPT_MODE = {
  CODE: 'code',
  LLM: 'llm',
} as const;

export type PromptMode = typeof PROMPT_MODE[keyof typeof PROMPT_MODE];

export const PROMPT_MODE_LABELS: Record<PromptMode, string> = {
  [PROMPT_MODE.CODE]: '代码模式',
  [PROMPT_MODE.LLM]: 'LLM模式',
};
```

- [ ] **步骤 17：创建 pipeline.ts**

```typescript
// shared/constants/pipeline.ts
/**
 * 流水线相关常量
 */

// 流水线阶段
export const PIPELINE_STAGE = {
  STAGE1_INPUT_PARSER: 'stage1_input_parser',
  STAGE2_HOTSPOT_ANALYZER: 'stage2_hotspot_analyzer',
  STAGE3_CHARACTER_ANALYZER: 'stage3_character_analyzer',
  STAGE4_SCRIPT_CREATOR: 'stage4_script_creator',
  STAGE5_QUALITY_CHECKER: 'stage5_quality_checker',
  STAGE6_OUTPUT_FORMATTER: 'stage6_output_formatter',
} as const;

export type PipelineStage = typeof PIPELINE_STAGE[keyof typeof PIPELINE_STAGE];

// 流水线状态
export const PIPELINE_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type PipelineStatus = typeof PIPELINE_STATUS[keyof typeof PIPELINE_STATUS];

// 流水线执行报告接口
export interface PIPELINE_EXECUTION_REPORT {
  pipelineId: string;
  projectId: string;
  status: PipelineStatus;
  stageTimings: {
    stage1: number;
    stage2: number;
    stage3: number;
    stage4: number;
    stage5: number;
    stage6: number;
  };
  error?: string;
  createdAt: number;
}
```

- [ ] **步骤 18：创建 index.ts 导出所有模块**

```typescript
// shared/constants/index.ts
/**
 * 共享常量 - 统一导出入口
 */

export * from './role.js';
export * from './upload-slot.js';
export * from './asset-category.js';
export * from './character.js';
export * from './provider.js';
export * from './project-status.js';
export * from './script-source.js';
export * from './review.js';
export * from './video-job.js';
export * from './resolution.js';
export * from './theme.js';
export * from './fission.js';
export * from './trend.js';
export * from './square.js';
export * from './step-prompt.js';
export * from './prompt-mode.js';
export * from './pipeline.js';
```

- [ ] **步骤 19：验证文件创建成功**

```bash
ls -la shared/constants/
```

预期输出：包含 18 个 .ts 文件

- [ ] **步骤 20：Commit**

```bash
git add shared/constants/
git commit -m "feat: 创建 shared/constants 目录，拆分 shared_dict.ts 为 17 个模块"
```

---

## 阶段五：迁移 contracts 到 shared

### 任务 5.1：迁移 src/contracts 到 shared/contracts

**文件：**
- 移动：`backend/src/contracts/*` → `shared/contracts/`

- [ ] **步骤 1：移动 contracts 目录**

```bash
cp -r backend/src/contracts/* shared/contracts/
```

- [ ] **步骤 2：验证文件移动成功**

```bash
ls shared/contracts/ | wc -l
```

预期输出：~60 个文件

- [ ] **步骤 3：Commit**

```bash
git add shared/contracts/
git commit -m "chore: 迁移 contracts 到 shared/contracts 目录"
```

---

## 阶段六：迁移纯函数工具到 shared/utils/

### 任务 6.1：创建 shared/utils 目录结构

**文件：**
- 创建目录：`shared/utils/step1/`、`shared/utils/step2/`、`shared/utils/step3/`、`shared/utils/reverse/`、`shared/utils/storyboard/`、`shared/utils/runtime/`、`shared/utils/media/`

- [ ] **步骤 1：创建子目录**

```bash
mkdir -p shared/utils/step1 shared/utils/step2 shared/utils/step3 shared/utils/reverse shared/utils/storyboard shared/utils/runtime shared/utils/media
```

- [ ] **步骤 2：Commit**

```bash
git add shared/utils/
git commit -m "chore: 创建 shared/utils 子目录结构"
```

### 任务 6.2：迁移 Step1 工具函数

**文件：**
- 移动：`backend/src/modules/step1-role-preset-adapter.ts` → `shared/utils/step1/role-preset-adapter.ts`
- 移动：`backend/src/modules/step1-role-preset-panel-compact-render.ts` → `shared/utils/step1/role-preset-panel-compact-render.ts`
- 移动：`backend/src/modules/step1-role-preset-entry-guard.ts` → `shared/utils/step1/role-preset-entry-guard.ts`
- 移动：`backend/src/modules/step1-optimized-prompt-builder.ts` → `shared/utils/step1/optimized-prompt-builder.ts`

- [ ] **步骤 1：移动文件**

```bash
cp backend/src/modules/step1-role-preset-adapter.ts shared/utils/step1/role-preset-adapter.ts
cp backend/src/modules/step1-role-preset-panel-compact-render.ts shared/utils/step1/role-preset-panel-compact-render.ts
cp backend/src/modules/step1-role-preset-entry-guard.ts shared/utils/step1/role-preset-entry-guard.ts
cp backend/src/modules/step1-optimized-prompt-builder.ts shared/utils/step1/optimized-prompt-builder.ts
```

- [ ] **步骤 2：验证文件移动成功**

```bash
ls -la shared/utils/step1/
```

预期输出：4 个 .ts 文件

- [ ] **步骤 3：Commit**

```bash
git add shared/utils/step1/
git commit -m "chore: 迁移 Step1 工具函数到 shared/utils/step1"
```

### 任务 6.3：迁移 Step2 工具函数

**文件：**
- 移动：`backend/src/modules/step2-fixed-template-prompt-assembler.ts` → `shared/utils/step2/fixed-template-prompt-assembler.ts`
- 移动：`backend/src/modules/step2-left-panel-master-prompt-editor.ts` → `shared/utils/step2/left-panel-master-prompt-editor.ts`
- 移动：`backend/src/modules/step2-legacy-preset-grid-removal.ts` → `shared/utils/step2/legacy-preset-grid-removal.ts`
- 移动：`backend/src/modules/step2-generation-dependency-bridge.ts` → `shared/utils/step2/generation-dependency-bridge.ts`
- 移动：`backend/src/modules/step2-runtime-progress-bridge.ts` → `shared/utils/step2/runtime-progress-bridge.ts`

- [ ] **步骤 1：移动文件**

```bash
cp backend/src/modules/step2-fixed-template-prompt-assembler.ts shared/utils/step2/fixed-template-prompt-assembler.ts
cp backend/src/modules/step2-left-panel-master-prompt-editor.ts shared/utils/step2/left-panel-master-prompt-editor.ts
cp backend/src/modules/step2-legacy-preset-grid-removal.ts shared/utils/step2/legacy-preset-grid-removal.ts
cp backend/src/modules/step2-generation-dependency-bridge.ts shared/utils/step2/generation-dependency-bridge.ts
cp backend/src/modules/step2-runtime-progress-bridge.ts shared/utils/step2/runtime-progress-bridge.ts
```

- [ ] **步骤 2：验证文件移动成功**

```bash
ls -la shared/utils/step2/
```

预期输出：5 个 .ts 文件

- [ ] **步骤 3：Commit**

```bash
git add shared/utils/step2/
git commit -m "chore: 迁移 Step2 工具函数到 shared/utils/step2"
```

### 任务 6.4：迁移 Step3、Reverse、Storyboard、Runtime 工具函数

**文件：**
- 移动：`backend/src/modules/video-step/step3/types.ts` → `shared/utils/step3/types.ts`
- 移动：`backend/src/modules/reverse-storyboard-primary-topic.ts` → `shared/utils/reverse/storyboard-primary-topic.ts`
- 移动：`backend/src/modules/reverse-storyboard-report-mapper.ts` → `shared/utils/reverse/storyboard-report-mapper.ts`
- 移动：`backend/src/modules/reverse-storyboard-legacy-compat.ts` → `shared/utils/reverse/storyboard-legacy-compat.ts`
- 移动：`backend/src/storyboard-scene-ref-sanitizer.ts` → `shared/utils/storyboard/scene-ref-sanitizer.ts`
- 移动：`backend/src/storyboard-scene-prompt-policy.ts` → `shared/utils/storyboard/scene-prompt-policy.ts`
- 移动：`backend/src/modules/runtime-data-public-assets.ts` → `shared/utils/runtime/runtime-data-public-assets.ts`

- [ ] **步骤 1：移动 Step3 文件**

```bash
mkdir -p shared/utils/step3
cp backend/src/modules/video-step/step3/types.ts shared/utils/step3/types.ts 2>/dev/null || echo "Step3 types not found, skipping"
```

- [ ] **步骤 2：移动 Reverse 文件**

```bash
cp backend/src/modules/reverse-storyboard-primary-topic.ts shared/utils/reverse/storyboard-primary-topic.ts 2>/dev/null || echo "reverse-storyboard-primary-topic not found"
cp backend/src/modules/reverse-storyboard-report-mapper.ts shared/utils/reverse/storyboard-report-mapper.ts 2>/dev/null || echo "reverse-storyboard-report-mapper not found"
cp backend/src/modules/reverse-storyboard-legacy-compat.ts shared/utils/reverse/storyboard-legacy-compat.ts 2>/dev/null || echo "reverse-storyboard-legacy-compat not found"
```

- [ ] **步骤 3：移动 Storyboard 文件**

```bash
cp backend/src/storyboard-scene-ref-sanitizer.ts shared/utils/storyboard/scene-ref-sanitizer.ts
cp backend/src/storyboard-scene-prompt-policy.ts shared/utils/storyboard/scene-prompt-policy.ts
```

- [ ] **步骤 4：移动 Runtime 文件**

```bash
cp backend/src/modules/runtime-data-public-assets.ts shared/utils/runtime/runtime-data-public-assets.ts 2>/dev/null || echo "runtime-data-public-assets not found"
```

- [ ] **步骤 5：验证文件移动成功**

```bash
ls -la shared/utils/step3/ shared/utils/reverse/ shared/utils/storyboard/ shared/utils/runtime/
```

- [ ] **步骤 6：Commit**

```bash
git add shared/utils/
git commit -m "chore: 迁移 Step3、Reverse、Storyboard、Runtime 工具函数到 shared/utils"
```

### 任务 6.5：创建 shared/utils/index.ts

**文件：**
- 创建：`shared/utils/index.ts`

- [ ] **步骤 1：创建 index.ts**

```typescript
// shared/utils/index.ts
/**
 * 共享工具函数 - 统一导出入口
 */

// Step1 工具
export * from './step1/role-preset-adapter.js';
export * from './step1/role-preset-panel-compact-render.js';
export * from './step1/role-preset-entry-guard.js';
export * from './step1/optimized-prompt-builder.js';

// Step2 工具
export * from './step2/fixed-template-prompt-assembler.js';
export * from './step2/left-panel-master-prompt-editor.js';
export * from './step2/legacy-preset-grid-removal.js';
export * from './step2/generation-dependency-bridge.js';
export * from './step2/runtime-progress-bridge.js';

// Step3 工具
export * from './step3/types.js';

// Reverse 工具
export * from './reverse/storyboard-primary-topic.js';
export * from './reverse/storyboard-report-mapper.js';
export * from './reverse/storyboard-legacy-compat.js';

// Storyboard 工具
export * from './storyboard/scene-ref-sanitizer.js';
export * from './storyboard/scene-prompt-policy.js';

// Runtime 工具
export * from './runtime/runtime-data-public-assets.js';
```

- [ ] **步骤 2：Commit**

```bash
git add shared/utils/index.ts
git commit -m "feat: 创建 shared/utils/index.ts 统一导出入口"
```

---

## 阶段七：创建配置文件

### 任务 7.1：创建根目录 package.json

**文件：**
- 创建：`package.json`（根目录，workspace 协调器）

- [ ] **步骤 1：创建 package.json**

```json
{
  "name": "neirongmiao",
  "private": true,
  "workspaces": ["frontend", "backend", "shared"],
  "scripts": {
    "dev": "npm run dev --workspace=backend",
    "build": "npm run build --workspace=backend",
    "build:ui": "npm run build --workspace=frontend",
    "build:all": "npm run build --workspace=backend && npm run build --workspace=frontend",
    "typecheck:web": "npm run typecheck --workspace=frontend",
    "test": "npm run test --workspace=backend",
    "ops:db:check": "npm run ops:db:check --workspace=backend"
  }
}
```

- [ ] **步骤 2：Commit**

```bash
git add package.json
git commit -m "feat: 创建根目录 package.json workspace 协调器"
```

### 任务 7.2：创建 tsconfig.base.json

**文件：**
- 创建：`tsconfig.base.json`

- [ ] **步骤 1：创建 tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true
  }
}
```

- [ ] **步骤 2：Commit**

```bash
git add tsconfig.base.json
git commit -m "feat: 创建 tsconfig.base.json 共享 TS 配置"
```

### 任务 7.3：创建 shared/package.json

**文件：**
- 创建：`shared/package.json`

- [ ] **步骤 1：创建 shared/package.json**

```json
{
  "name": "@neirongmiao/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./index.ts",
  "types": "./index.ts",
  "exports": {
    ".": "./index.ts",
    "./constants": "./constants/index.ts",
    "./constants/*": "./constants/*.ts",
    "./types": "./types/index.ts",
    "./contracts": "./contracts/index.ts",
    "./contracts/*": "./contracts/*.ts",
    "./utils": "./utils/index.ts",
    "./utils/*": "./utils/*.ts"
  }
}
```

- [ ] **步骤 2：Commit**

```bash
git add shared/package.json
git commit -m "feat: 创建 shared/package.json 共享模块配置"
```

### 任务 7.4：更新 frontend/tsconfig.json

**文件：**
- 修改：`frontend/tsconfig.json`

- [ ] **步骤 1：备份原文件**

```bash
cp frontend/tsconfig.json frontend/tsconfig.json.bak
```

- [ ] **步骤 2：更新 tsconfig.json**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["../shared/*"],
      "@shared/constants": ["../shared/constants/index.ts"],
      "@shared/constants/*": ["../shared/constants/*.ts"],
      "@shared/types": ["../shared/types/index.ts"],
      "@shared/contracts": ["../shared/contracts/index.ts"],
      "@shared/contracts/*": ["../shared/contracts/*.ts"],
      "@shared/utils": ["../shared/utils/index.ts"],
      "@shared/utils/*": ["../shared/utils/*.ts"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **步骤 3：Commit**

```bash
git add frontend/tsconfig.json
git commit -m "feat: 更新 frontend/tsconfig.json 添加 @shared path alias"
```

### 任务 7.5：更新 backend/tsconfig.json

**文件：**
- 修改：`backend/tsconfig.json`

- [ ] **步骤 1：备份原文件**

```bash
cp backend/tsconfig.json backend/tsconfig.json.bak
```

- [ ] **步骤 2：更新 tsconfig.json**

读取原 tsconfig.json 内容，在 compilerOptions 中添加 baseUrl 和 paths 配置。保持原有配置不变，只添加 path alias。

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["../shared/*"],
      "@shared/constants": ["../shared/constants/index.ts"],
      "@shared/constants/*": ["../shared/constants/*.ts"],
      "@shared/types": ["../shared/types/index.ts"],
      "@shared/contracts": ["../shared/contracts/index.ts"],
      "@shared/contracts/*": ["../shared/contracts/*.ts"],
      "@shared/utils": ["../shared/utils/index.ts"],
      "@shared/utils/*": ["../shared/utils/*.ts"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **步骤 3：Commit**

```bash
git add backend/tsconfig.json
git commit -m "feat: 更新 backend/tsconfig.json 添加 @shared path alias"
```

### 任务 7.6：更新 frontend/vite.config.ts

**文件：**
- 修改：`frontend/vite.config.ts`

- [ ] **步骤 1：读取原文件**

```bash
cat frontend/vite.config.ts
```

- [ ] **步骤 2：添加 @shared alias**

在 vite.config.ts 的 resolve.alias 中添加：

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  // 保留原有其他配置
});
```

- [ ] **步骤 3：Commit**

```bash
git add frontend/vite.config.ts
git commit -m "feat: 更新 frontend/vite.config.ts 添加 @shared alias"
```

---

## 阶段八：批量更新导入路径

### 任务 8.1：更新前端导入路径

**文件：**
- 修改：所有 `frontend/**/*.ts` 和 `frontend/**/*.tsx` 文件

- [ ] **步骤 1：创建路径替换脚本**

创建临时脚本 `scripts/update-imports-frontend.sh`：

```bash
#!/bin/bash

# 更新前端导入路径
# 将相对路径的 src/contracts 替换为 @shared/contracts
# 将相对路径的 src/modules 替换为 @shared/utils
# 将相对路径的 src/contant-config/shared_dict 替换为 @shared/constants

cd frontend

# 替换 contracts 导入
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i \
  -e 's|from ["'"'"']\.\./\.\./\.\./\.\./src/contracts/|from "@shared/contracts/|g' \
  -e 's|from ["'"'"']\.\./\.\./\.\./src/contracts/|from "@shared/contracts/|g' \
  -e 's|from ["'"'"']\.\./\.\./src/contracts/|from "@shared/contracts/|g' \
  -e 's|from ["'"'"']\.\./src/contracts/|from "@shared/contracts/|g'

# 替换 modules 导入
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i \
  -e 's|from ["'"'"']\.\./\.\./\.\./\.\./src/modules/|from "@shared/utils/|g' \
  -e 's|from ["'"'"']\.\./\.\./\.\./src/modules/|from "@shared/utils/|g' \
  -e 's|from ["'"'"']\.\./\.\./src/modules/|from "@shared/utils/|g' \
  -e 's|from ["'"'"']\.\./src/modules/|from "@shared/utils/|g'

# 替换 constants 导入
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i \
  -e 's|from ["'"'"']\.\./\.\./\.\./\.\./src/contant-config/shared_dict|from "@shared/constants|g' \
  -e 's|from ["'"'"']\.\./\.\./\.\./src/contant-config/shared_dict|from "@shared/constants|g' \
  -e 's|from ["'"'"']\.\./\.\./src/contant-config/shared_dict|from "@shared/constants|g' \
  -e 's|from ["'"'"']\.\./src/contant-config/shared_dict|from "@shared/constants|g'

# 替换根目录文件导入（storyboard-scene-ref-sanitizer 等）
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i \
  -e 's|from ["'"'"']\.\./\.\./\.\./\.\./src/storyboard-|from "@shared/utils/storyboard/storyboard-|g' \
  -e 's|from ["'"'"']\.\./\.\./\.\./src/storyboard-|from "@shared/utils/storyboard/storyboard-|g' \
  -e 's|from ["'"'"']\.\./\.\./src/storyboard-|from "@shared/utils/storyboard/storyboard-|g' \
  -e 's|from ["'"'"']\.\./src/storyboard-|from "@shared/utils/storyboard/storyboard-|g'

echo "Frontend imports updated"
```

- [ ] **步骤 2：执行脚本**

```bash
chmod +x scripts/update-imports-frontend.sh
./scripts/update-imports-frontend.sh
```

- [ ] **步骤 3：验证部分文件**

```bash
grep -r "from.*@shared" frontend/ | head -20
```

预期输出：显示使用 @shared 路径的导入语句

- [ ] **步骤 4：Commit**

```bash
git add frontend/
git commit -m "refactor: 更新前端导入路径使用 @shared alias"
```

### 任务 8.2：更新后端导入路径

**文件：**
- 修改：所有 `backend/src/**/*.ts` 文件

- [ ] **步骤 1：创建路径替换脚本**

创建临时脚本 `scripts/update-imports-backend.sh`：

```bash
#!/bin/bash

# 更新后端导入路径
cd backend/src

# 替换 contracts 导入
find . -name "*.ts" | xargs sed -i \
  -e 's|from ["'"'"']\./contracts/|from "@shared/contracts/|g' \
  -e 's|from ["'"'"']\.\./contracts/|from "@shared/contracts/|g' \
  -e 's|from ["'"'"']\.\./\.\./contracts/|from "@shared/contracts/|g'

# 替换 constants 导入
find . -name "*.ts" | xargs sed -i \
  -e 's|from ["'"'"']\./contant-config/shared_dict|from "@shared/constants|g' \
  -e 's|from ["'"'"']\.\./contant-config/shared_dict|from "@shared/constants|g'

# 替换已迁移到 shared/utils 的模块导入
# Step1
find . -name "*.ts" | xargs sed -i \
  -e 's|from ["'"'"']\./modules/step1-role-preset-adapter|from "@shared/utils/step1/role-preset-adapter|g' \
  -e 's|from ["'"'"']\./modules/step1-role-preset-panel-compact-render|from "@shared/utils/step1/role-preset-panel-compact-render|g' \
  -e 's|from ["'"'"']\./modules/step1-role-preset-entry-guard|from "@shared/utils/step1/role-preset-entry-guard|g' \
  -e 's|from ["'"'"']\./modules/step1-optimized-prompt-builder|from "@shared/utils/step1/optimized-prompt-builder|g'

# Step2
find . -name "*.ts" | xargs sed -i \
  -e 's|from ["'"'"']\./modules/step2-fixed-template-prompt-assembler|from "@shared/utils/step2/fixed-template-prompt-assembler|g' \
  -e 's|from ["'"'"']\./modules/step2-left-panel-master-prompt-editor|from "@shared/utils/step2/left-panel-master-prompt-editor|g' \
  -e 's|from ["'"'"']\./modules/step2-legacy-preset-grid-removal|from "@shared/utils/step2/legacy-preset-grid-removal|g' \
  -e 's|from ["'"'"']\./modules/step2-generation-dependency-bridge|from "@shared/utils/step2/generation-dependency-bridge|g' \
  -e 's|from ["'"'"']\./modules/step2-runtime-progress-bridge|from "@shared/utils/step2/runtime-progress-bridge|g'

# Storyboard
find . -name "*.ts" | xargs sed -i \
  -e 's|from ["'"'"']\./storyboard-scene-ref-sanitizer|from "@shared/utils/storyboard/scene-ref-sanitizer|g' \
  -e 's|from ["'"'"']\./storyboard-scene-prompt-policy|from "@shared/utils/storyboard/scene-prompt-policy|g'

# Reverse
find . -name "*.ts" | xargs sed -i \
  -e 's|from ["'"'"']\./modules/reverse-storyboard-primary-topic|from "@shared/utils/reverse/storyboard-primary-topic|g' \
  -e 's|from ["'"'"']\./modules/reverse-storyboard-report-mapper|from "@shared/utils/reverse/storyboard-report-mapper|g' \
  -e 's|from ["'"'"']\./modules/reverse-storyboard-legacy-compat|from "@shared/utils/reverse/storyboard-legacy-compat|g'

# Runtime
find . -name "*.ts" | xargs sed -i \
  -e 's|from ["'"'"']\./modules/runtime-data-public-assets|from "@shared/utils/runtime/runtime-data-public-assets|g'

echo "Backend imports updated"
```

- [ ] **步骤 2：执行脚本**

```bash
chmod +x scripts/update-imports-backend.sh
./scripts/update-imports-backend.sh
```

- [ ] **步骤 3：验证部分文件**

```bash
grep -r "from.*@shared" backend/src/ | head -20
```

预期输出：显示使用 @shared 路径的导入语句

- [ ] **步骤 4：Commit**

```bash
git add backend/src/
git commit -m "refactor: 更新后端导入路径使用 @shared alias"
```

---

## 阶段九：更新文档和配置

### 任务 9.1：更新 CLAUDE.md

**文件：**
- 修改：`CLAUDE.md`

- [ ] **步骤 1：更新项目结构描述**

将 CLAUDE.md 中的项目结构部分更新为：

```markdown
## 1. 项目结构
- **前端**: `frontend/` — React 18 + TypeScript + Vite + Tailwind CSS
- **后端**: `backend/` — Node.js + Fastify 5 + TypeScript + PostgreSQL
- **共享**: `shared/` — 前后端共享的类型、契约、常量、工具函数
- **访问方式**: 通过后端端口访问项目，后端同时托管前端静态资源

### 核心业务
AI 电商短视频生成平台，核心为 **6 步工作流**：
`DRAFT → Step1(服装上传/搭配推荐) → Step2(定妆) → Step3(脚本生成) → Step4(分镜) → Step5(成片) → 发布`

### 关键目录
| 目录 | 说明 |
|------|------|
| `backend/src/app.ts` | 后端主应用（超大文件，**只减不增**） |
| `backend/src/modules/` | 业务模块（hot-trend、video-step 等） |
| `shared/contracts/` | 类型定义与接口契约 |
| `shared/constants/` | 常量枚举定义 |
| `shared/utils/` | 纯函数工具 |
| `backend/src/persistence/` | 数据持久层（PostgreSQL 适配器） |
| `backend/src/routes/` | 路由模块（`...otherHandlers` 扩展点） |
| `backend/src/storage/` | 对象存储（S3/本地/内存） |
| `frontend/pages/` | 前端页面组件 |
| `frontend/services/` | 前端 API 封装 |
```

- [ ] **步骤 2：Commit**

```bash
git add CLAUDE.md
git commit -m "docs: 更新 CLAUDE.md 项目结构描述"
```

### 任务 9.2：更新 .gitignore

**文件：**
- 修改：`.gitignore`

- [ ] **步骤 1：更新路径规则**

在 .gitignore 中添加或更新：

```gitignore
# 依赖目录
node_modules/
frontend/node_modules/
backend/node_modules/
shared/node_modules/

# 构建输出
dist/
backend/dist/
frontend/dist/

# 数据目录
backend/data/

# 日志
*.log
logs/

# 环境变量
.env
.env.local
.env.*.local

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# 临时文件
*.tmp
*.temp
```

- [ ] **步骤 2：Commit**

```bash
git add .gitignore
git commit -m "chore: 更新 .gitignore 路径规则"
```

---

## 阶段十：清理旧目录

### 任务 10.1：删除已迁移的旧目录

**注意：** 仅在验证构建成功后执行

- [ ] **步骤 1：验证构建成功**

```bash
npm install
npm run build:all
```

预期输出：构建成功，无错误

- [ ] **步骤 2：删除旧目录**

```bash
rm -rf apps/web
rm -rf src
rm -f package-lock.json  # 根目录的，会在 npm install 时重新生成
```

- [ ] **步骤 3：Commit**

```bash
git add -A
git commit -m "chore: 清理已迁移的旧目录"
```

---

## 阶段十一：验证

### 任务 11.1：安装依赖

- [ ] **步骤 1：清理旧依赖**

```bash
rm -rf node_modules frontend/node_modules backend/node_modules
rm -f package-lock.json frontend/package-lock.json backend/package-lock.json
```

- [ ] **步骤 2：安装依赖**

```bash
npm install
```

预期输出：所有依赖安装成功

### 任务 11.2：验证后端构建

- [ ] **步骤 1：构建后端**

```bash
npm run build
```

预期输出：编译成功，无错误

### 任务 11.3：验证前端构建

- [ ] **步骤 1：构建前端**

```bash
npm run build:ui
```

预期输出：编译成功，无错误

### 任务 11.4：验证开发服务器

- [ ] **步骤 1：启动开发服务器**

```bash
PERSISTENCE_REQUIRE_READY=false npm run dev
```

预期输出：服务器启动成功，监听 3020 端口

- [ ] **步骤 2：验证前端页面**

访问 http://localhost:3020，确认页面正常加载

- [ ] **步骤 3：停止服务器**

按 Ctrl+C 停止服务器

### 任务 11.5：最终 Commit

- [ ] **步骤 1：最终提交**

```bash
git add -A
git commit -m "feat: 完成项目目录结构重构

- 将 apps/web 迁移到 frontend/
- 将 src 迁移到 backend/src/
- 创建 shared/ 目录存放共享代码
- 拆分 shared_dict.ts 为 17 个常量模块
- 迁移 contracts 到 shared/contracts/
- 迁移纯函数工具到 shared/utils/
- 配置 npm workspaces 和 TypeScript path aliases
- 更新所有导入路径使用 @shared alias
"
```

---

## 风险应对

| 风险 | 应对措施 |
|------|---------|
| 导入路径替换遗漏 | 手动检查关键文件，使用 TypeScript 编译器定位错误 |
| 构建失败 | 分阶段验证，定位具体文件错误 |
| 运行时错误 | 启动服务后测试关键功能 |
| 文件遗漏 | 对比迁移前后的文件数量 |