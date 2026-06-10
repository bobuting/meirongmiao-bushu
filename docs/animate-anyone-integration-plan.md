# 阿里云 AnimateAnyone 动作迁移集成方案

> 将阿里云 AnimateAnyone API 集成到 neirongmiao 的换装项目（outfit_change）中

## 一、方案概述

### 1.1 核心目标

将阿里云 AnimateAnyone 动作迁移能力作为 **新的换装模式** 集成到现有 `outfit_change` 项目中：

| 现有换装模式 | 新增模式 |
|-------------|---------|
| 服饰换装（基于 VTON） | **动作迁移**（基于 AnimateAnyone） |

### 1.2 用户流程设计（关键改进）

**Step 1 改进：内置模板 + 上传视频双模式**

```
┌─────────────────────────────────────────────────────────────┐
│  Step 1: 选择动作来源                                        │
│  ┌─────────────┬─────────────┐                              │
│  │ 🎬 上传视频 │ 📋 内置模板 │ ← 用户选择                    │
│  └─────────────┴─────────────┘                              │
│                                                              │
│  【上传视频模式】                                             │
│  ├── 用户上传参考视频（提取动作）                             │
│  ├── 适用场景：自定义动作、特定舞蹈                           │
│  └── 费用：需生成动作模板（0.08元/秒）                        │
│                                                              │
│  【内置模板模式】                                             │
│  ├── 用户从预置模板库选择                                     │
│  ├── 分类：舞蹈、运动、表情、日常                             │
│  ├── 适用场景：快速换人换装、降低门槛                         │
│  └── 费用：跳过模板生成，节省费用和时间                       │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 技术架构对比

| 维度 | 现有换装 | 动作迁移（上传视频） | 动作迁移（内置模板） |
|------|---------|-------------------|-------------------|
| **输入** | 源视频 + 服饰 + 角色 | 参考视频 + 目标图片 | 内置模板ID + 目标图片 |
| **输出** | 换装后视频 | 目标执行动作的视频 | 目标执行动作的视频 |
| **流程** | 4 步 | 图片检测 → 模板生成 → 视频生成 | 图片检测 → 视频生成（跳过模板） |
| **费用** | 换装积分 | 检测 + 模板 + 生成 | 检测 + 生成（节省模板费用） |
| **耗时** | 较长 | 较长（需生成模板） | 较短（模板已预置） |

---

## 二、内置动作模板库设计（核心功能）

### 2.1 模板库架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      内置动作模板库                               │
├─────────────────────────────────────────────────────────────────┤
│  数据来源：                                                       │
│  ├── 方案 A：阿里云预置模板（查询官方模板列表）                     │
│  ├── 方案 B：自建模板库（从热门舞蹈/运动视频预生成）                 │
│  └── 方案 C：用户上传视频后保存为可复用模板（UGC 模板库）            │
├─────────────────────────────────────────────────────────────────┤
│  分类体系：                                                       │
│  ├── 💃 舞蹈类：街舞、爵士、民族舞、流行舞...                       │
│  ├── 🏃 运动类：跑步、健身、瑜伽、篮球...                           │
│  ├── 😊 表情类：点头、微笑、挥手、转身...                           │
│  ├── 🚶 日常类：走路、站立、坐下、喝水...                           │
│  └── 🎭 特殊类：影视角色动作、网红挑战动作...                        │
├─────────────────────────────────────────────────────────────────┤
│  模板元数据：                                                     │
│  ├── templateId: 阿里云模板 ID 或自建 ID                          │
│  ├── name: 模板名称（如"流行舞-科目三"）                           │
│  ├── category: 分类标签                                          │
│  ├── duration: 模板时长（秒）                                     │
│  ├── thumbnailUrl: 预览缩略图/GIF                                 │
│  ├── previewVideoUrl: 预览视频                                   │
│  ├── popularity: 热度/使用次数                                    │
│  ├── tags: 标签（如["热门", "简单", "适合新手"]）                   │
│  └── creditCost: 积分费用（不含图片检测和视频生成）                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 数据库表设计

```sql
-- 内置动作模板库表
CREATE TABLE nrm_action_templates (
    id VARCHAR(64) PRIMARY KEY,                  -- 模板 ID
    name VARCHAR(128) NOT NULL,                  -- 模板名称
    category VARCHAR(32) NOT NULL,               -- 分类：dance/sport/expression/daily/special
    ali_template_id VARCHAR(128),                -- 阿里云模板 ID（预置模板）
    duration_sec INTEGER NOT NULL,               -- 时长（秒）
    
    -- 预览素材
    thumbnail_url TEXT,                          -- 缩略图 URL
    preview_video_url TEXT,                      -- 预览视频 URL
    preview_gif_url TEXT,                        -- 预览 GIF URL
    
    -- 元数据
    description TEXT,                            -- 描述
    tags JSONB,                                  -- 标签数组 ["热门", "简单"]
    popularity INTEGER DEFAULT 0,                -- 热度/使用次数
    is_active BOOLEAN DEFAULT TRUE,              -- 是否启用
    
    -- 来源
    source VARCHAR(32) NOT NULL,                 -- 来源：official/user_created/system
    
    -- 时间戳
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

CREATE INDEX idx_action_templates_category ON nrm_action_templates(category);
CREATE INDEX idx_action_templates_popularity ON nrm_action_templates(popularity DESC);
CREATE INDEX idx_action_templates_active ON nrm_action_templates(is_active);

COMMENT ON TABLE nrm_action_templates IS '内置动作模板库';
COMMENT ON COLUMN nrm_action_templates.ali_template_id IS '阿里云预置模板 ID，可直接调用无需生成';
COMMENT ON COLUMN nrm_action_templates.source IS 'official=阿里云官方模板，user_created=用户上传生成，system=系统预生成';

-- 初始化数据示例（阿里云官方模板，需要查询实际可用模板）
INSERT INTO nrm_action_templates (id, name, category, ali_template_id, duration_sec, thumbnail_url, source, created_at, updated_at) VALUES
('tpl_dance_001', '科目三', 'dance', 'ali_tpl_001', 15, 'https://xxx/preview1.jpg', 'official', EXTRACT(EPOCH FROM NOW()) * 1000, EXTRACT(EPOCH FROM NOW()) * 1000),
('tpl_dance_002', '街舞基础', 'dance', 'ali_tpl_002', 20, 'https://xxx/preview2.jpg', 'official', EXTRACT(EPOCH FROM NOW()) * 1000, EXTRACT(EPOCH FROM NOW()) * 1000),
('tpl_sport_001', '健身操', 'sport', 'ali_tpl_003', 30, 'https://xxx/preview3.jpg', 'official', EXTRACT(EPOCH FROM NOW()) * 1000, EXTRACT(EPOCH FROM NOW()) * 1000),
('tpl_expr_001', '挥手微笑', 'expression', 'ali_tpl_004', 5, 'https://xxx/preview4.jpg', 'official', EXTRACT(EPOCH FROM NOW()) * 1000, EXTRACT(EPOCH FROM NOW()) * 1000);
```

### 2.3 类型定义

```typescript
// src/contracts/action-template-contract.ts

/** 动作模板分类 */
export type ActionTemplateCategory = 'dance' | 'sport' | 'expression' | 'daily' | 'special';

/** 模板来源 */
export type ActionTemplateSource = 'official' | 'user_created' | 'system';

/** 内置动作模板 */
export interface ActionTemplate {
  id: string;
  name: string;
  category: ActionTemplateCategory;
  aliTemplateId?: string;          // 阿里云模板 ID
  durationSec: number;
  thumbnailUrl?: string;
  previewVideoUrl?: string;
  previewGifUrl?: string;
  description?: string;
  tags?: string[];
  popularity: number;
  isActive: boolean;
  source: ActionTemplateSource;
}

/** 动作来源类型（关键区分） */
export type ActionSourceType = 'upload_video' | 'builtin_template';

/** 扩展后的输入参数 */
export interface ActionTransferInputV2 {
  projectId: string;
  userId: string;
  
  // 动作来源（两种模式）
  actionSourceType: ActionSourceType;     // 'upload_video' 或 'builtin_template'
  sourceVideoUrl?: string;                // 上传视频模式：参考视频 URL
  builtinTemplateId?: string;             // 内置模板模式：模板 ID
  
  // 目标图片
  targetImageUrl: string;
  
  // 可选参数
  prompt?: string;
  durationLimit?: number;
}
```

---

## 三、阿里云 AnimateAnyone API 接口规范

### 2.1 三步调用流程

```
┌───────────────────────────────────────────────────────────────┐
│  Step 1: animate-anyone-detect-gen2 (图像合规检测)              │
│  ├── 输入: 人物图片 URL                                         │
│  ├── 输出: { valid: true/false, reason?: string }              │
│  └── 费用: 0.004 元/张                                          │
├───────────────────────────────────────────────────────────────┤
│  Step 2: animate-anyone-template-gen2 (动作模板生成)            │
│  ├── 输入: 参考视频 URL                                         │
│  ├── 输出: { templateId: string }                              │
│  └── 费用: 0.08 元/秒                                           │
├───────────────────────────────────────────────────────────────┤
│  Step 3: animate-anyone-gen2 (视频生成)                         │
│  ├── 输入: 图片 URL + 模板 ID + Prompt                          │
│  ├── 输出: { videoUrl: string }                                │
│  └── 费用: 0.08 元/秒                                           │
└───────────────────────────────────────────────────────────────┘
```

### 2.2 API 端点

**基础信息**：
- **平台**: 阿里云百炼 (ModelStudio)
- **地域**: 仅支持 `中国内地（北京）`
- **API Key**: 需在百炼控制台获取

**API 地址**（已确认，2026-05-18 更新）：
```
Step 1: POST https://dashscope.aliyuncs.com/api/v1/services/aigc/image2video/aa-detect
Step 2: POST https://dashscope.aliyuncs.com/api/v1/services/aigc/image2video/aa-template-generation
Step 3: POST https://dashscope.aliyuncs.com/api/v1/services/aigc/image2video/aa-video-generation
```

**Model Names**：
| 模型 | 用途 | 名称 |
|------|------|------|
| 图像检测 | Step 1 | `animate-anyone-detect-gen2` |
| 动作模板 | Step 2 | `animate-anyone-template-gen2` |
| 视频生成 | Step 3 | `animate-anyone-gen2` |

---

## 三、集成架构设计

### 3.1 后端架构

```
src/
├── services/
│   └── animate-anyone/              # 新增：阿里云 AnimateAnyone 服务
│       ├── index.ts                 # 服务入口
│       ├── api-client.ts            # 阿里云 API 客户端封装
│       ├── types.ts                 # 类型定义
│       └── config.ts                # 配置（API Key、地域等）
│
├── routes/
│   └── action-transfer-routes.ts    # 新增：动作迁移 API 路由
│
├── modules/
│   └── action-transfer/             # 新增：动作迁移流水线
│       ├── orchestrator.ts          # 流程编排
│       ├── step1-detect.ts          # 图片检测
│       ├── step2-template.ts        # 动作模板生成
│       └── step3-generate.ts        # 视频生成
│
├── contracts/
│   └── action-transfer-contract.ts  # 新增：数据契约
│
└── repositories/pg/
    └── action-transfer-pg-repository.ts  # 新增：数据库持久层
```

### 3.2 数据库表设计

```sql
-- 动作迁移任务表（参考现有 outfit_change 结构）
CREATE TABLE nrm_action_transfer_tasks (
    task_id VARCHAR(64) PRIMARY KEY,              -- 任务 ID (at_xxxx)
    project_id VARCHAR(64) NOT NULL,              -- 项目 ID
    user_id VARCHAR(64) NOT NULL,                 -- 用户 ID
    status VARCHAR(32) NOT NULL,                  -- 状态
    
    -- 输入参数
    source_video_url TEXT,                        -- 参考视频 URL（动作来源）
    target_image_url TEXT,                        -- 目标图片 URL
    prompt TEXT,                                  -- 描述文本
    duration_sec INTEGER DEFAULT 0,               -- 视频时长
    
    -- 中间结果
    image_valid BOOLEAN,                          -- 图片检测结果
    image_check_result JSONB,                     -- 图片检测详情
    template_id VARCHAR(128),                     -- 动作模板 ID
    
    -- 输出结果
    result_video_url TEXT,                        -- 生成的视频 URL
    
    -- 错误信息
    error_message TEXT,
    error_stage VARCHAR(32),                      -- 失败阶段
    
    -- 时间戳
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    
    -- 关联
    async_job_id VARCHAR(64),                     -- 异步任务 ID
    
    UNIQUE(project_id)
);

-- 状态枚举
-- pending → detecting → detected → template_generating → template_generated → 
-- generating → succeeded / failed / cancelled

CREATE INDEX idx_action_transfer_user ON nrm_action_transfer_tasks(user_id);
CREATE INDEX idx_action_transfer_status ON nrm_action_transfer_tasks(status);
CREATE INDEX idx_action_transfer_project ON nrm_action_transfer_tasks(project_id);

COMMENT ON TABLE nrm_action_transfer_tasks IS '动作迁移任务表';
COMMENT ON COLUMN nrm_action_transfer_tasks.task_id IS '任务 ID，格式：at_{uuid前16位}';
COMMENT ON COLUMN nrm_action_transfer_tasks.source_video_url IS '参考视频 URL（提取动作）';
COMMENT ON COLUMN nrm_action_transfer_tasks.target_image_url IS '目标图片 URL（应用动作）';
COMMENT ON COLUMN nrm_action_transfer_tasks.template_id IS '阿里云动作模板 ID';
```

### 3.3 类型定义

```typescript
// src/contracts/action-transfer-contract.ts

/** 动作迁移任务状态 */
export type ActionTransferStatus =
  | 'pending'           // 待处理
  | 'detecting'         // 图片检测中
  | 'detected'          // 图片检测完成
  | 'template_generating' // 动作模板生成中
  | 'template_generated'  // 动作模板生成完成
  | 'generating'        // 视频生成中
  | 'succeeded'         // 成功
  | 'failed'            // 失败
  | 'cancelled';        // 已取消

/** 动作迁移输入参数 */
export interface ActionTransferInput {
  projectId: string;
  userId: string;
  sourceVideoUrl: string;    // 参考视频（动作来源）
  targetImageUrl: string;    // 目标图片（应用动作的对象）
  prompt?: string;           // 可选描述文本
  durationLimit?: number;    // 时长限制（默认30秒）
}

/** 图片检测结果 */
export interface ImageDetectResult {
  valid: boolean;
  reason?: string;           // 不合规原因
  suggestions?: string[];    // 改进建议
}

/** 动作模板结果 */
export interface TemplateResult {
  templateId: string;
  duration: number;          // 模板时长（秒）
}

/** 视频生成结果 */
export interface VideoGenerateResult {
  videoUrl: string;
  duration: number;
  width: number;
  height: number;
}

/** 任务记录 */
export interface ActionTransferTaskRecord {
  taskId: string;
  projectId: string;
  userId: string;
  status: ActionTransferStatus;
  
  sourceVideoUrl: string;
  targetImageUrl: string;
  prompt?: string;
  durationSec: number;
  
  imageValid?: boolean;
  imageCheckResult?: ImageDetectResult;
  templateId?: string;
  
  resultVideoUrl?: string;
  
  errorMessage?: string;
  errorStage?: string;
  
  createdAt: number;
  updatedAt: number;
  asyncJobId?: string;
}
```

---

## 四、核心模块实现

### 4.1 阿里云 API 客户端

```typescript
// src/services/animate-anyone/api-client.ts

import type { ImageDetectResult, TemplateResult, VideoGenerateResult } from '../../contracts/action-transfer-contract.js';
import { AppError } from '../../core/errors.js';
import { getLogger } from '../../core/logger/index.js';

const log = getLogger('animate-anyone-api');

/** 阿里云百炼 API 配置 */
export interface AnimateAnyoneConfig {
  apiKey: string;           // 百炼 API Key
  baseUrl: string;          // API 地址
  region: string;           // 地域（固定北京）
}

/** 默认配置 */
const DEFAULT_CONFIG: AnimateAnyoneConfig = {
  baseUrl: 'https://bailian.cn-beijing.aliyuncs.com',
  region: 'cn-beijing',
};

/**
 * 阿里云 AnimateAnyone API 客户端
 */
export class AnimateAnyoneApiClient {
  private config: AnimateAnyoneConfig;

  constructor(apiKey: string, customConfig?: Partial<AnimateAnyoneConfig>) {
    this.config = { ...DEFAULT_CONFIG, apiKey, ...customConfig };
    
    if (!this.config.apiKey) {
      throw new Error('阿里云百炼 API Key 未配置');
    }
  }

  /**
   * Step 1: 图片合规检测
   * 
   * @param imageUrl 图片 URL
   * @returns 检测结果
   * @throws AppError 检测失败时抛出
   */
  async detectImage(imageUrl: string): Promise<ImageDetectResult> {
    log.info({ imageUrl }, '开始图片合规检测');
    
    try {
      const response = await this.invokeApi('animate-anyone-detect-gen2', {
        image_url: imageUrl,
      });

      const result = {
        valid: response.data?.valid ?? false,
        reason: response.data?.reason,
        suggestions: response.data?.suggestions,
      };

      log.info({ imageUrl, valid: result.valid }, '图片合规检测完成');
      return result;
    } catch (error) {
      log.error({ imageUrl, error }, '图片合规检测失败');
      throw new AppError(500, 'IMAGE_DETECT_FAILED', '图片合规检测失败');
    }
  }

  /**
   * Step 2: 动作模板生成
   * 
   * @param videoUrl 参考视频 URL
   * @returns 动作模板 ID 和时长
   * @throws AppError 生成失败时抛出
   */
  async generateTemplate(videoUrl: string): Promise<TemplateResult> {
    log.info({ videoUrl }, '开始动作模板生成');
    
    try {
      const response = await this.invokeApi('animate-anyone-template-gen2', {
        video_url: videoUrl,
      });

      const result = {
        templateId: response.data?.template_id,
        duration: response.data?.duration ?? 0,
      };

      if (!result.templateId) {
        throw new AppError(500, 'TEMPLATE_ID_MISSING', '动作模板 ID 未返回');
      }

      log.info({ videoUrl, templateId: result.templateId, duration: result.duration }, '动作模板生成完成');
      return result;
    } catch (error) {
      log.error({ videoUrl, error }, '动作模板生成失败');
      throw new AppError(500, 'TEMPLATE_GENERATE_FAILED', '动作模板生成失败');
    }
  }

  /**
   * Step 3: 视频生成
   * 
   * @param imageUrl 目标图片 URL
   * @param templateId 动作模板 ID
   * @param prompt 可选描述文本
   * @param duration 输出时长（秒）
   * @returns 生成的视频 URL
   * @throws AppError 生成失败时抛出
   */
  async generateVideo(
    imageUrl: string,
    templateId: string,
    prompt?: string,
    duration?: number
  ): Promise<VideoGenerateResult> {
    log.info({ imageUrl, templateId, prompt, duration }, '开始视频生成');
    
    try {
      const response = await this.invokeApi('animate-anyone-gen2', {
        image_url: imageUrl,
        template_id: templateId,
        prompt: prompt,
        second: duration,
      });

      const result = {
        videoUrl: response.data?.video_url,
        duration: response.data?.duration ?? 0,
        width: response.data?.width ?? 0,
        height: response.data?.height ?? 0,
      };

      if (!result.videoUrl) {
        throw new AppError(500, 'VIDEO_URL_MISSING', '视频 URL 未返回');
      }

      log.info({ videoUrl: result.videoUrl, duration: result.duration }, '视频生成完成');
      return result;
    } catch (error) {
      log.error({ imageUrl, templateId, error }, '视频生成失败');
      throw new AppError(500, 'VIDEO_GENERATE_FAILED', '视频生成失败');
    }
  }

  /**
   * 调用阿里云百炼 API（私有方法）
   * 
   * 实际实现需要参考阿里云官方 SDK 或 HTTP 接口规范
   */
  private async invokeApi(model: string, params: Record<string, unknown>): Promise<{ data: unknown }> {
    // 实际实现见 src/service/llm/llm-animate-anyone.ts
    // API端点: /api/v1/services/aigc/image2video/aa-{detect|template-generation|video-generation}
    
    // 注：此为伪代码示例，实际端点路径已更新
    const url = `${this.config.baseUrl}/api/v1/services/aigc/image2video/${this.getEndpointPath(model)}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AppError(response.status, 'API_ERROR', errorText);
    }

    return response.json();
  }
}
```

### 4.2 流程编排器

```typescript
// src/modules/action-transfer/orchestrator.ts

import type { AppContext } from '../../core/app-context.js';
import type { ActionTransferInput, ActionTransferTaskRecord } from '../../contracts/action-transfer-contract.js';
import { AnimateAnyoneApiClient } from '../../services/animate-anyone/api-client.js';
import { getLogger } from '../../core/logger/index.js';
import { finalizeAsyncJob } from '../../service/async-job-service.js';
import { sseManager } from '../sse-manager.js';

const log = getLogger('action-transfer-orchestrator');

/** 流程编排器依赖 */
export interface OrchestratorDeps {
  ctx: AppContext;
  taskId: string;
  input: ActionTransferInput;
  parentJobId: string;
}

/**
 * 动作迁移流程编排
 * 
 * 三步流程：
 * 1. 图片合规检测
 * 2. 动作模板生成
 * 3. 视频生成
 */
export async function executeActionTransferPipeline(deps: OrchestratorDeps): Promise<{ success: boolean; error?: string }> {
  const { ctx, taskId, input, parentJobId } = deps;
  const repo = ctx.repos.actionTransferTasks;
  const now = Date.now();

  // 获取配置（从环境变量）
  const apiKey = process.env.ALIYUN_BAILIAN_API_KEY;
  if (!apiKey) {
    log.error('阿里云百炼 API Key 未配置');
    await updateStatus(repo, taskId, 'failed', 'API Key 未配置', 'config', now);
    return { success: false, error: 'API Key 未配置' };
  }

  const apiClient = new AnimateAnyoneApiClient(apiKey);

  try {
    // ========================================================================
    // Step 1: 图片合规检测
    // ========================================================================
    await updateStatus(repo, taskId, 'detecting', null, null, now);
    pushProgress(ctx, parentJobId, 'detecting', '正在检测图片合规性...');

    const detectResult = await apiClient.detectImage(input.targetImageUrl);
    
    await repo.updateFields(taskId, {
      imageValid: detectResult.valid,
      imageCheckResult: detectResult,
      updatedAt: Date.now(),
    });

    if (!detectResult.valid) {
      const errorMsg = detectResult.reason || '图片不符合规范';
      await updateStatus(repo, taskId, 'failed', errorMsg, 'detecting', Date.now());
      return { success: false, error: errorMsg };
    }

    await updateStatus(repo, taskId, 'detected', null, null, Date.now());
    pushProgress(ctx, parentJobId, 'detected', '图片检测通过');

    // ========================================================================
    // Step 2: 动作模板生成
    // ========================================================================
    await updateStatus(repo, taskId, 'template_generating', null, null, Date.now());
    pushProgress(ctx, parentJobId, 'template_generating', '正在提取动作模板...');

    const templateResult = await apiClient.generateTemplate(input.sourceVideoUrl);

    await repo.updateFields(taskId, {
      templateId: templateResult.templateId,
      durationSec: templateResult.duration,
      updatedAt: Date.now(),
    });

    await updateStatus(repo, taskId, 'template_generated', null, null, Date.now());
    pushProgress(ctx, parentJobId, 'template_generated', '动作模板生成完成');

    // ========================================================================
    // Step 3: 视频生成
    // ========================================================================
    await updateStatus(repo, taskId, 'generating', null, null, Date.now());
    pushProgress(ctx, parentJobId, 'generating', '正在生成视频...');

    const videoResult = await apiClient.generateVideo(
      input.targetImageUrl,
      templateResult.templateId,
      input.prompt,
      input.durationLimit ?? Math.min(templateResult.duration, 30)
    );

    await repo.updateFields(taskId, {
      resultVideoUrl: videoResult.videoUrl,
      updatedAt: Date.now(),
    });

    // ========================================================================
    // 完成
    // ========================================================================
    await updateStatus(repo, taskId, 'succeeded', null, null, Date.now());
    
    // 更新异步任务状态
    await finalizeAsyncJob(ctx.pool, parentJobId, 'succeeded', {
      videoUrl: videoResult.videoUrl,
      duration: videoResult.duration,
    }, null, Date.now(), ctx.queueDispatcher);

    // 推送成功通知
    sseManager.pushToUser(input.userId, {
      type: 'job_completed',
      jobId: parentJobId,
      jobType: 'action_transfer',
      status: 'succeeded',
      result: { videoUrl: videoResult.videoUrl },
      timestamp: Date.now(),
    });

    log.info({ taskId, videoUrl: videoResult.videoUrl }, '动作迁移流程完成');
    return { success: true };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const currentStatus = await repo.findById(taskId);
    const errorStage = currentStatus?.status || 'unknown';

    await updateStatus(repo, taskId, 'failed', errorMsg, errorStage, Date.now());
    
    // 更新异步任务状态
    await finalizeAsyncJob(ctx.pool, parentJobId, 'failed', null, {
      code: 'PIPELINE_ERROR',
      message: errorMsg,
      stage: errorStage,
    }, Date.now(), ctx.queueDispatcher);

    // 推送失败通知
    sseManager.pushToUser(input.userId, {
      type: 'job_failed',
      jobId: parentJobId,
      jobType: 'action_transfer',
      status: 'failed',
      error: { code: 'PIPELINE_ERROR', message: errorMsg },
      timestamp: Date.now(),
    });

    log.error({ taskId, error: errorMsg, stage: errorStage }, '动作迁移流程失败');
    return { success: false, error: errorMsg };
  }
}

/** 辅助函数：更新状态 */
async function updateStatus(
  repo: any,
  taskId: string,
  status: string,
  errorMessage: string | null,
  errorStage: string | null,
  updatedAt: number
): Promise<void> {
  await repo.updateStatus(taskId, status);
  if (errorMessage || errorStage) {
    await repo.updateFields(taskId, { errorMessage, errorStage, updatedAt });
  }
}

/** 辅助函数：推送进度 */
function pushProgress(ctx: AppContext, jobId: string, stage: string, message: string): void {
  // 通过 SSE 或其他机制推送进度
  // 参考现有 outfit_change 的进度推送方式
}
```

### 4.3 API 路由

```typescript
// src/routes/action-transfer-routes.ts

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { ActionTransferInput } from "../contracts/action-transfer-contract.js";
import { AppError } from "../core/errors.js";
import { requireUser } from "../services/auth/route-guards.js";
import { getLogger } from "../core/logger/index.js";
import { executeActionTransferPipeline } from "../modules/action-transfer/orchestrator.js";
import { createAsyncJob } from "../service/async-job-service.js";
import { randomUUID } from "node:crypto";

const log = getLogger("action-transfer-routes");

export interface ActionTransferRouteDeps {
  ctx: AppContext;
}

export async function registerActionTransferRoutes(
  app: FastifyInstance,
  deps: ActionTransferRouteDeps
): Promise<void> {
  const { ctx } = deps;
  const repo = ctx.repos.actionTransferTasks;

  // ===========================================================================
  // POST /action-transfer/tasks
  // 创建动作迁移任务
  // ===========================================================================
  app.post("/action-transfer/tasks", async (request, reply) => {
    const user = await requireUser(ctx, request);
    const body = request.body as ActionTransferInput;

    // 验证必填字段
    if (!body.sourceVideoUrl) {
      throw new AppError(400, "MISSING_SOURCE_VIDEO_URL", "参考视频 URL 不能为空");
    }
    if (!body.targetImageUrl) {
      throw new AppError(400, "MISSING_TARGET_IMAGE_URL", "目标图片 URL 不能为空");
    }
    if (!body.projectId) {
      throw new AppError(400, "MISSING_PROJECT_ID", "项目 ID 不能为空");
    }

    // 生成任务 ID
    const taskId = `at_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const now = Date.now();

    // 创建任务记录
    await repo.create({
      taskId,
      projectId: body.projectId,
      userId: user.id,
      status: "pending",
      sourceVideoUrl: body.sourceVideoUrl,
      targetImageUrl: body.targetImageUrl,
      prompt: body.prompt,
      durationSec: 0,
      createdAt: now,
      updatedAt: now,
    });

    // 创建异步任务
    const jobResult = await createAsyncJob(ctx.pool, {
      userId: user.id,
      jobType: "action_transfer",
      input: JSON.stringify({ taskId, ...body }),
      now: Date.now(),
      projectId: body.projectId,
      initialStatus: "pending",
    }, ctx.globalTaskConcurrencyService);

    if ("error" in jobResult) {
      return reply.code(429).send({ code: jobResult.errorCode, message: jobResult.error });
    }

    const parentJobId = jobResult.jobId;

    // 更新项目状态
    await ctx.pool.query(
      `UPDATE nrm_projects SET status = 'FILMING', updated_at = $1 WHERE id = $2`,
      [now, body.projectId]
    );

    // 异步执行流水线
    void executeActionTransferPipeline(ctx, { taskId, input: { ...body, userId: user.id }, parentJobId })
      .then((result) => {
        if (result.success) {
          log.info({ taskId, parentJobId }, "流水线启动成功");
        } else {
          log.error({ taskId, parentJobId, error: result.error }, "流水线启动失败");
        }
      });

    return reply.send({
      success: true,
      data: { taskId, asyncJobId: parentJobId, status: "pending" },
    });
  });

  // ===========================================================================
  // GET /action-transfer/tasks/:taskId
  // 查询任务详情
  // ===========================================================================
  app.get("/action-transfer/tasks/:taskId", async (request, reply) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { taskId: string };
    const task = await repo.findById(params.taskId);

    if (!task) {
      throw new AppError(404, "TASK_NOT_FOUND", "任务不存在");
    }
    if (task.userId !== user.id) {
      throw new AppError(403, "TASK_ACCESS_DENIED", "无权访问此任务");
    }

    return reply.send({ success: true, data: task });
  });

  // ===========================================================================
  // POST /action-transfer/tasks/:taskId/cancel
  // 取消任务
  // ===========================================================================
  app.post("/action-transfer/tasks/:taskId/cancel", async (request, reply) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { taskId: string };
    const task = await repo.findById(params.taskId);

    if (!task) {
      throw new AppError(404, "TASK_NOT_FOUND", "任务不存在");
    }
    if (task.userId !== user.id) {
      throw new AppError(403, "TASK_ACCESS_DENIED", "无权取消此任务");
    }

    const cancellable = ['pending', 'detecting', 'detected', 'template_generating', 'template_generated', 'generating'];
    if (!cancellable.includes(task.status)) {
      throw new AppError(400, "TASK_NOT_CANCELLABLE", `任务状态为 ${task.status}，无法取消`);
    }

    await repo.updateStatus(params.taskId, 'cancelled');
    return reply.send({ success: true, data: { taskId: params.taskId, status: 'cancelled' } });
  });

  log.info("动作迁移 API 路由已注册");
}
```

---

## 五、前端集成

### 5.1 UI 设计方案

**两种集成方式**：

#### 方案 A：作为换装项目的「动作迁移」模式

在现有换装项目中新增一种模式：

```
Step 1: 上传源视频
Step 2: 确认视频 → 选择模式：[服饰换装] [动作迁移]
Step 3: 选择角色/服饰 OR 上传目标图片
Step 4: 执行并查看结果
```

#### 方案 B：独立「动作迁移」项目类型

作为新的项目类型，与 video/image/outfit_change 并列：

```
项目类型：
- 视频项目 (video)
- 图片项目 (image)
- 逆向脚本 (reverse)
- 换装项目 (outfit_change)
- 动作迁移 (action_transfer) ← 新增
```

### 5.2 前端目录结构（方案 B）

```
apps/web/pages/
├── action-transfer/                 # 新增
│   ├── ActionTransferLayout.tsx     # 布局
│   ├── ActionTransferStep1.tsx      # Step 1: 上传参考视频
│   ├── ActionTransferStep2.tsx      # Step 2: 上传目标图片
│   ├── ActionTransferStep3.tsx      # Step 3: 执行迁移
│   └── index.ts
│
├── services/realApi/
│   └── action-transfer.ts           # 新增：API 封装
│
└── store/
    └── useActionTransferStore.ts    # 新增：状态管理（可选）
```

### 5.3 Step 1 UI 设计（核心改进：内置模板选择）

```tsx
// apps/web/pages/action-transfer/ActionTransferStep1.tsx

/**
 * Step 1: 选择动作来源
 * 
 * 两种模式：
 * 1. 上传参考视频（自定义动作）
 * 2. 选择内置模板（预设动作）
 */

import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

// 模式切换 Tab
const ACTION_SOURCE_MODES = [
  { key: 'upload_video', label: '上传视频', icon: 'video_library' },
  { key: 'builtin_template', label: '内置模板', icon: 'widgets' },
];

// 模板分类
const TEMPLATE_CATEGORIES = [
  { key: 'dance', label: '舞蹈', icon: '💃' },
  { key: 'sport', label: '运动', icon: '🏃' },
  { key: 'expression', label: '表情', icon: '😊' },
  { key: 'daily', label: '日常', icon: '🚶' },
  { key: 'special', label: '特殊', icon: '🎭' },
];

export const ActionTransferStep1: React.FC = () => {
  const [mode, setMode] = useState<'upload_video' | 'builtin_template'>('builtin_template');
  const [selectedCategory, setSelectedCategory] = useState<string>('dance');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const { projectId } = useParams();

  return (
    <div className="flex flex-col h-full">
      {/* 顶部：模式切换 */}
      <div className="flex gap-2 p-4 border-b">
        {ACTION_SOURCE_MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              mode === m.key 
                ? 'bg-primary text-white' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <span className="material-icons-round">{m.icon}</span>
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto p-4">
        {mode === 'upload_video' ? (
          /* 上传视频模式 */
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <h3 className="text-lg font-medium">上传参考视频</h3>
              <p className="text-sm text-gray-500">
                上传包含你想迁移动作的视频，系统将提取动作模板
              </p>
            </div>
            
            {/* 视频上传区域 */}
            <VideoUploader 
              onUploadComplete={(url) => setUploadedVideoUrl(url)}
            />
            
            {/* 提示信息 */}
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-blue-700">
                💡 建议：上传清晰的人物动作视频，动作明显、背景简洁效果更好
              </p>
              <p className="text-sm text-blue-600 mt-1">
                ⏱️ 视频时长限制：最长 30 秒，超出部分将被截取
              </p>
              <p className="text-sm text-orange-600 mt-1">
                💰 费用提示：需要生成动作模板（约 10 积分/秒）
              </p>
            </div>
          </div>
        ) : (
          /* 内置模板模式 */
          <div className="flex flex-col gap-4">
            {/* 分类选择 */}
            <div className="flex gap-2">
              {TEMPLATE_CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setSelectedCategory(cat.key)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full ${
                    selectedCategory === cat.key
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span className="text-sm">{cat.label}</span>
                </button>
              ))}
            </div>

            {/* 模板网格 */}
            <div className="grid grid-cols-3 gap-3">
              {templates
                .filter((t) => t.category === selectedCategory)
                .map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    selected={selectedTemplate === template.id}
                    onClick={() => setSelectedTemplate(template.id)}
                  />
                ))}
            </div>

            {/* 选中模板预览 */}
            {selectedTemplate && (
              <TemplatePreview 
                template={templates.find((t) => t.id === selectedTemplate)!}
              />
            )}
          </div>
        )}
      </div>

      {/* 底部：下一步按钮 */}
      <div className="p-4 border-t">
        <button
          onClick={() => navigate(`/action-transfer/${projectId}/step2`)}
          disabled={mode === 'upload_video' ? !uploadedVideoUrl : !selectedTemplate}
          className="w-full py-3 rounded-lg bg-primary text-white disabled:bg-gray-300"
        >
          下一步：上传目标图片
        </button>
      </div>
    </div>
  );
};

/** 模板卡片组件 */
const TemplateCard: React.FC<{
  template: ActionTemplate;
  selected: boolean;
  onClick: () => void;
}> = ({ template, selected, onClick }) => (
  <div
    onClick={onClick}
    className={`relative rounded-lg overflow-hidden cursor-pointer ${
      selected ? 'ring-2 ring-primary' : ''
    }`}
  >
    {/* 缩略图/GIF */}
    <img 
      src={template.previewGifUrl || template.thumbnailUrl} 
      alt={template.name}
      className="w-full aspect-[9/16] object-cover"
    />
    
    {/* 选中标记 */}
    {selected && (
      <div className="absolute top-2 right-2 bg-primary rounded-full p-1">
        <span className="material-icons-round text-white text-sm">check</span>
      </div>
    )}
    
    {/* 底部信息 */}
    <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2">
      <p className="text-white text-sm font-medium truncate">{template.name}</p>
      <p className="text-gray-300 text-xs">{template.durationSec}s · {template.tags?.join(' · ')}</p>
    </div>
    
    {/* 热度标记 */}
    {template.popularity > 1000 && (
      <div className="absolute top-2 left-2 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded">
        🔥 热门
      </div>
    )}
  </div>
);

/** 模板预览弹窗 */
const TemplatePreview: React.FC<{ template: ActionTemplate }> = ({ template }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
    <div className="relative bg-white rounded-2xl max-w-md w-full overflow-hidden">
      {/* 关闭按钮 */}
      <button className="absolute top-3 right-3 bg-black/50 rounded-full p-1.5">
        <span className="material-icons-round text-white">close</span>
      </button>
      
      {/* 预览视频 */}
      <video 
        src={template.previewVideoUrl} 
        controls 
        autoPlay 
        loop
        className="w-full aspect-video"
      />
      
      {/* 模板信息 */}
      <div className="p-4">
        <h3 className="text-lg font-medium">{template.name}</h3>
        <p className="text-sm text-gray-500">{template.description}</p>
        
        <div className="flex gap-2 mt-2">
          <span className="text-xs bg-gray-100 rounded px-2 py-1">
            ⏱️ {template.durationSec}秒
          </span>
          <span className="text-xs bg-gray-100 rounded px-2 py-1">
            🔥 {template.popularity} 次使用
          </span>
        </div>
        
        {/* 费用提示 */}
        <div className="mt-3 p-3 bg-green-50 rounded-lg">
          <p className="text-sm text-green-700">
            ✅ 内置模板无需生成动作模板，节省费用和时间
          </p>
          <p className="text-xs text-green-600 mt-1">
            预估费用：图片检测(1积分) + 视频生成({template.durationSec * 10}积分)
          </p>
        </div>
      </div>
    </div>
  </div>
);
```

### 5.4 内置模板 API 封装

```typescript
// apps/web/services/realApi/action-templates.ts

import { backendApi } from '../backendApi';

/** 查询内置模板列表 */
export async function getActionTemplates(
  token: string,
  params?: {
    category?: string;
    limit?: number;
    sortBy?: 'popularity' | 'duration';
  }
): Promise<ActionTemplate[]> {
  const query = new URLSearchParams(params as any).toString();
  const response = await fetch(
    `${backendApi.baseUrl}/action-templates?${query}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  
  if (!response.ok) throw new Error('查询模板列表失败');
  const data = await response.json();
  return data.data.items;
}

/** 查询模板详情 */
export async function getActionTemplateDetail(
  token: string,
  templateId: string
): Promise<ActionTemplate> {
  const response = await fetch(
    `${backendApi.baseUrl}/action-templates/${templateId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  
  if (!response.ok) throw new Error('查询模板详情失败');
  const data = await response.json();
  return data.data;
}
```

---

## 六、费用对比与优化

### 6.1 上传视频 vs 内置模板费用对比

| 模式 | 流程 | 积分计算（10秒视频） | 说明 |
|------|------|---------------------|------|
| **上传视频** | 检测 → 模板生成 → 视频生成 | 1 + 10×10 + 10×10 = **201 积分** | 需生成动作模板，耗时较长 |
| **内置模板** | 检测 → 视频生成 | 1 + 10×10 = **101 积分** | 跳过模板生成，节省 **50%** |

**内置模板优势**：
- ✅ 费用减半（无需模板生成费用）
- ✅ 时间缩短（跳过模板生成步骤，约快 30-60秒）
- ✅ 质量稳定（模板预验证，生成成功率更高）

### 6.2 积分定价规则

参考现有换装定价（[CreditPricingModal.tsx](apps/web/pages/credit-pricing/CreditPricingModal.tsx)）：

| 项目 | 积分定价 | 说明 |
|------|---------|------|
| 图片检测 | 1 积分 | 固定费用 |
| 动作模板生成 | 10 积分/秒 | 模板时长 × 10 |
| 视频生成 | 10 积分/秒 | 输出时长 × 10 |

**示例**：10 秒动作迁移视频
- 图片检测：1 积分
- 动作模板（10 秒）：100 积分
- 视频生成（10 秒）：100 积分
- **总计**：约 **200 积分**

### 6.3 积分扣除时机

```typescript
// 积分扣除策略
const CREDIT_STRATEGY = {
  // 预扣：创建任务时
  preDeduct: (durationSec: number) => 1 + 20 * durationSec,
  
  // 实扣：任务完成时根据实际时长
  actualDeduct: (templateDuration: number, videoDuration: number) => 
    1 + 10 * templateDuration + 10 * videoDuration,
  
  // 退还：任务取消或失败时
  refund: (preDeducted: number) => preDeducted,
};
```

---

## 七、环境配置

### 7.1 新增环境变量

```bash
# .env 新增
ALIYUN_BAILIAN_API_KEY=xxx          # 阿里云百炼 API Key
ALIYUN_BAILIAN_REGION=cn-beijing    # 地域（固定北京）
```

### 7.2 任务队列配置

```typescript
// src/config/task-queue-config.ts 新增

export const TASK_QUEUE_CONFIG = {
  // ...existing config...
  action_transfer: {
    jobType: 'action_transfer',
    displayName: '动作迁移',
    maxConcurrent: 3,              // 最大并发（阿里云限制 1-10）
    estimatedDuration: 60,         // 预估时长（秒）
    creditPerSecond: 10,           // 积分/秒
    routeOnSuccess: '/action-transfer/:projectId/step3?status=success',
    routeOnFail: '/action-transfer/:projectId/step3?status=fail',
    notification: {
      onStart: true,
      onComplete: true,
      onFail: true,
    },
  },
};
```

---

## 八、实施步骤

### Phase 1: 后端核心模块（2-3 天）

1. 创建数据库表 `nrm_action_transfer_tasks`
2. 实现类型定义 `action-transfer-contract.ts`
3. 实现阿里云 API 客户端 `api-client.ts`
4. 实现流程编排器 `orchestrator.ts`
5. 实现 API 路由 `action-transfer-routes.ts`
6. 注册路由到 `setup-routes.ts`
7. 配置环境变量

### Phase 2: 前端 UI（2-3 天）

1. 创建页面目录 `pages/action-transfer/`
2. 实现三个 Step 页面
3. 实现 API 服务封装
4. 集成任务队列进度显示
5. 集成积分扣除逻辑

### Phase 3: 测试与优化（1-2 天）

1. 单元测试：API 客户端、编排器
2. E2E 测试：完整流程
3. 错误处理边界测试
4. 积分计费验证

---

## 九、风险与注意事项

### 9.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 阿里云 API 变动 | 接口失效 | 封装适配层，便于快速调整 |
| 地域限制（仅北京） | 用户访问延迟 | 文档说明，引导用户 |
| 并发限制（1-10） | 高峰排队 | 任务队列 + 进度提示 |

### 9.2 费用风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 视频时长过长 | 费用超标 | 默认限制 30 秒，用户可调整 |
| API 调用失败 | 费用已扣 | 失败时退还积分 |
| 免费额度用尽 | 成本上升 | 监控用量，设置预警 |

### 9.3 合规风险

- 阿里云地域限制：仅支持「中国内地（北京）」
- 图片合规检测：必须先检测，否则生成可能失败
- 知识产权：参考视频需确保无版权问题

---

## 十一、模板库运营与维护体系

### 11.1 模板数据来源策略

| 来源 | 说明 | 维护方式 | 费用 |
|------|------|---------|------|
| **阿里云官方模板** | 百炼平台预置模板 | 定期同步官方列表 | 免费 |
| **系统预生成模板** | 热门舞蹈/运动视频预生成 | 运营团队上传生成 | 需支付生成费用 |
| **用户UGC模板** | 用户上传视频后保存 | 用户授权后收录 | 用户自费 |

### 11.2 模板库维护流程

```
┌──────────────────────────────────────────────────────────────┐
│                    模板库维护工作流                            │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  【日常维护】                                                  │
│  ├── 每周同步阿里云官方模板列表                                 │
│  ├── 监控模板热度，淘汰低使用率模板                             │
│  ├── 更新模板预览素材（缩略图/GIF）                            │
│  └── 检查模板有效性（API 可调用性）                            │
│                                                               │
│  【新增模板】                                                  │
│  ├── 运营需求：识别热点舞蹈/动作                                │
│  ├── 质量验证：                                │
│  │   ├── 1. 图片合规检测 ✅                                   │
│  │   ├── 2. 动作模板生成 ⏱️                                   │
│  │   ├── 3. 视频生成测试 🎬                                   │
│  │   └── 4. 效果评估 ✅/❌                                     │
│  ├── 上传预览素材到 OSS                                        │
│  └── 写入数据库 + 标记热度                                     │
│                                                               │
│  【模板淘汰】                                                  │
│  ├── 触发条件：                                                │
│  │   ├── 连续 30 天使用次数 < 10                              │
│  │   ├── API 模板失效（阿里云删除）                            │
│  │   ├── 效果质量下降                                         │
│  │   └── 版权/合规问题                                        │
│  ├── 处理方式：                                                │
│  │   ├── 设置 is_active = FALSE                               │
│  │   ├── 保留记录但标记失效                                    │
│  │   └── 可选：物理删除                                       │
│                                                               │
│  【UGC模板收录】                                               │
│  ├── 用户上传视频生成模板成功                                  │
│  ├── 用户勾选"保存为公共模板"                                  │
│  ├── 运营审核：                                                │
│  │   ├── 效果质量                                             │
│  │   ├── 版权合规                                             │
│  │   ├── 分类标签                                             │
│  │   └── 是否适合公开                                         │
│  ├── 审核通过：标记 source = 'user_created'                   │
│  └── 审核拒绝：仅用户私用                                      │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 11.3 模板热度算法

```typescript
// 模板热度评分算法
interface TemplatePopularityScore {
  usageCount: number;        // 使用次数
  recentUsage: number;       // 最近7天使用次数
  successRate: number;       // 成功率（生成成功/尝试次数）
  userRating: number;        // 用户评分（可选）
  categoryWeight: number;    // 分类权重（舞蹈 > 日常）
}

function calculatePopularity(score: TemplatePopularityScore): number {
  // 权重分配
  const weights = {
    usageCount: 0.3,      // 历史使用量
    recentUsage: 0.4,     // 近期热度更重要
    successRate: 0.2,     // 质量指标
    userRating: 0.1,      // 用户反馈
  };

  // 计算综合热度
  const popularity = 
    Math.log10(score.usageCount + 1) * weights.usageCount +
    score.recentUsage * weights.recentUsage +
    score.successRate * 100 * weights.successRate +
    (score.userRating || 3) * 20 * weights.userRating;

  return Math.round(popularity);
}

// 每日热度更新任务
async function updateTemplatePopularity(ctx: AppContext): Promise<void> {
  const templates = await ctx.repos.actionTemplates.findAllActive();
  
  for (const template of templates) {
    // 查询最近使用次数
    const recentUsage = await ctx.pool.query(
      `SELECT COUNT(*) FROM nrm_action_transfer_tasks 
       WHERE builtin_template_id = $1 
       AND created_at > $2`,
      [template.id, Date.now() - 7 * 24 * 60 * 60 * 1000]
    );

    // 更新热度
    const newPopularity = calculatePopularity({
      usageCount: template.popularity,
      recentUsage: recentUsage.rows[0].count,
      successRate: 0.95, // 默认值，可从实际数据计算
      userRating: 4,
      categoryWeight: template.category === 'dance' ? 1.2 : 1,
    });

    await ctx.repos.actionTemplates.update(template.id, { popularity: newPopularity });
  }
}
```

### 11.4 模板库后台管理 API

```typescript
// src/routes/action-template-admin-routes.ts

/** 管理员专用模板管理 API */

// POST /admin/action-templates - 新增模板
// 需要管理员权限
app.post("/admin/action-templates", async (request, reply) => {
  const user = await requireAdmin(ctx, request);
  const body = request.body as {
    name: string;
    category: string;
    sourceVideoUrl: string;    // 用于生成模板的参考视频
    description?: string;
    tags?: string[];
  };

  // 1. 验证视频
  // 2. 调用阿里云生成模板
  // 3. 生成预览素材
  // 4. 写入数据库
});

// PUT /admin/action-templates/:id - 更新模板信息
app.put("/admin/action-templates/:id", async (request, reply) => {
  // 更新模板元数据
});

// DELETE /admin/action-templates/:id - 删除/禁用模板
app.delete("/admin/action-templates/:id", async (request, reply) => {
  // 设置 is_active = FALSE
});

// POST /admin/action-templates/:id/regenerate-preview - 重新生成预览
app.post("/admin/action-templates/:id/regenerate-preview", async (request, reply) => {
  // 使用模板重新生成预览视频/GIF
});

// GET /admin/action-templates/stats - 模板使用统计
app.get("/admin/action-templates/stats", async (request, reply) => {
  // 返回各模板使用次数、成功率、热度排名等
});
```

---

---

## 十三、实施路线图（详细）

### 13.1 Phase 1：基础框架（第1周）

| 天数 | 任务 | 输出 |
|------|------|------|
| Day 1-2 | 数据库设计 + 表创建 | `nrm_action_templates`、`nrm_action_transfer_tasks` |
| Day 2-3 | 类型定义 + Repository | `action-template-contract.ts`、`action-transfer-contract.ts` |
| Day 3-4 | 阿里云 API 客户端 | `animate-anyone/api-client.ts` |
| Day 4-5 | 流程编排器（基础版） | `action-transfer/orchestrator.ts` |
| Day 5 | API 路由 + 注册 | `action-transfer-routes.ts` |

### 13.2 Phase 2：模板库系统（第2周）

| 天数 | 任务 | 输出 |
|------|------|------|
| Day 1-2 | 模板库 API 封装 | `action-template-routes.ts` |
| Day 2-3 | 模板热度算法 + 定时更新 | `template-popularity-update.ts` |
| Day 3-4 | 管理后台 API | `action-template-admin-routes.ts` |
| Day 4-5 | 初始模板数据导入 | 20-50 个初始模板 |

### 13.3 Phase 3：前端 UI（第3周）

| 天数 | 任务 | 输出 |
|------|------|------|
| Day 1-2 | Step 1：动作来源选择页 | `ActionTransferStep1.tsx` |
| Day 2-3 | Step 2：目标图片上传页 | `ActionTransferStep2.tsx` |
| Day 3-4 | Step 3：执行 + 结果页 | `ActionTransferStep3.tsx` |
| Day 4-5 | 任务队列集成 + 进度显示 | SSE 推送、进度条 |

### 13.4 Phase 4：优化与完善（第4周）

| 天数 | 任务 | 输出 |
|------|------|------|
| Day 1-2 | 积分系统集成 | 预扣、实扣、退还逻辑 |
| Day 2-3 | 错误处理优化 | 重试机制、超时处理 |
| Day 3-4 | 模板库内容扩充 | 累计 50+ 内置模板 |
| Day 4-5 | 测试 + 文档 | 单元测试、E2E测试、使用文档 |

---

## 十四、验收标准

### 14.1 功能验收

| 功能 | 验收标准 |
|------|---------|
| **上传视频模式** | 用户上传视频 → 生成动作模板 → 生成视频，流程完整 |
| **内置模板模式** | 用户选择模板 → 上传图片 → 生成视频，跳过模板生成 |
| **模板库展示** | 分类筛选、热度排序、预览弹窗、选中状态 |
| **进度推送** | SSE 实时推送各阶段进度 |
| **结果保存** | 生成视频自动转存 OSS，永久可用 |

### 14.2 性能验收

| 指标 | 目标 |
|------|------|
| 内置模板生成时间 | < 60秒（10秒视频） |
| 上传视频生成时间 | < 120秒（含模板生成） |
| 模板库加载时间 | < 500ms |
| 并发处理能力 | 支持 3 个并发任务 |

### 14.3 费用验收

| 场景 | 验收标准 |
|------|---------|
| 内置模板（10秒） | 积分消耗 ≤ 101 积分 |
| 上传视频（10秒） | 积分消耗 ≤ 201 积分 |
| 任务失败 | 积分全额退还 |
| 任务取消 | 积分全额退还 |

---

## 十五、附录

### 15.1 相关文档链接

| 文档 | 说明 |
|------|------|
| [AnimateAnyone API 文档](https://help.aliyun.com/zh/model-studio/animate-anyone-video-generation-api) | 阿里云官方 API 文档 |
| [百炼 API Key 获取](https://help.aliyun.com/zh/model-studio/get-api-key) | API Key 申请 |
| [异步任务管理](https://help.aliyun.com/zh/model-studio/manage-asynchronous-tasks) | 任务查询、取消 |

> **注意**：万相视频换人 API（wan2.2-animate-mix）已独立实现，详见：
> - Provider: `wanxiang-video-mix-bailian`（[provider-route-keys-and-call-modes.md](provider-route-keys-and-call-modes.md)）
> - 服务: `llm-wanxiang-video-mix.ts`（创建/查询任务）

### 15.2 环境变量完整清单

```bash
# .env 完整配置
ALIYUN_BAILIAN_API_KEY=xxx          # 百炼 API Key（北京地域）
ALIYUN_BAILIAN_REGION=cn-beijing    # 地域
DASHSCOPE_API_KEY=xxx               # DashScope API Key（万相 API 使用）

# OSS 配置（用于保存生成结果）
OSS_ACCESS_KEY_ID=xxx
OSS_ACCESS_KEY_SECRET=xxx
OSS_BUCKET_NAME=xxx
OSS_REGION=oss-cn-beijing

# 积分配置
ACTION_TRANSFER_CREDIT_DETECT=1     # 图片检测积分
ACTION_TRANSFER_CREDIT_TEMPLATE=10  # 模板生成积分/秒
ACTION_TRANSFER_CREDIT_VIDEO=10     # 视频生成积分/秒
```

### 15.3 错误码映射

| 错误码 | 说明 | 处理建议 |
|--------|------|---------|
| `InvalidApiKey` | API Key 无效 | 检查环境变量配置 |
| `ImageInvalid` | 图片不合规 | 提示用户更换图片 |
| `TemplateGenerateFailed` | 模板生成失败 | 检查视频质量 |
| `VideoGenerateFailed` | 视频生成失败 | 重试或联系客服 |
| `TaskTimeout` | 任务超时 | 重新提交任务 |
| `IPInfringementSuspect` | 版权问题 | 检查输入素材版权 |

---

**文档版本**: v2.0
**最后更新**: 2025-05-15
**维护者**: neirongmiao 技术团队