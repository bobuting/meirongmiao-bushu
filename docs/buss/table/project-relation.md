# 项目数据库表关系文档

> 本文档描述 AI 电商短视频项目的核心数据表结构及其关系，供 AI 助手理解业务模型。
>
> **数据库连接**：使用 `.env` 中的 `DATABASE_URL` 连接，通过 `dotenv.config()` 加载配置。

---

## 通用字段约定

### 时间戳字段
| 字段名 | 类型 | 说明 |
|--------|------|------|
| `created_at` | `bigint` | 创建时间（毫秒时间戳），所有表都有 |
| `updated_at` | `bigint` | 更新时间（毫秒时间戳），大部分表都有 |

### 软删除字段
| 字段名 | 类型 | 说明 |
|--------|------|------|
| `deleted_at` | `bigint` | 软删除时间戳，`NULL` 表示未删除 |
| `deleted_by` | `text` | 删除操作者用户 ID |

**软删除查询规范**：查询时需加 `WHERE deleted_at IS NULL` 过滤已删除记录。

### 主键类型
- **UUID**：使用 `text` 类型存储 UUID 字符串
- **复合 ID**：部分业务表使用 `varchar(128)` 支持复合 ID 格式

---

## 核心项目表

### nrm_projects
**项目主表** - 存储项目基础信息，一个项目对应一个视频生成任务。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 项目唯一标识（UUID） |
| `user_id` | `text NOT NULL` | 项目所有者用户 ID |
| `name` | `text NOT NULL` | 项目名称 |
| `status` | `text NOT NULL` | 项目状态：draft/step1/step2/step3/step4/step5/published |
| `selected_outfit_plan_id` | `text` | 选中的服装搭配方案 ID |
| `selected_character_preview_id` | `text` | 选中的角色预览 ID |
| `thumbnail_url` | `text NOT NULL` | 项目封面图 URL |
| `format_label` | `text NOT NULL` | 视频格式标签 |
| `duration_sec` | `integer NOT NULL` | 视频时长（秒） |
| `last_visited_step` | `integer NOT NULL` | 最后访问的步骤（1-5） |

**关联关系**：
- `1:N` → `nrm_project_garment_assoc`（服装关联）
- `1:N` → `nrm_project_outfit_plans`（穿搭方案关联）
- `1:1` → `nrm_role_direction_cards`（角色预设卡片）
- `1:N` → `nrm_project_characters`（项目角色）
- `1:1` → `nrm_script_data`（脚本数据，通过 `nrm_project_script_assoc`）
- `1:N` → `nrm_shot_breakdown`（分镜拆分，通过 `nrm_script_data`）
- `1:N` → `nrm_step4_video_scenes`（分镜视频）

---

## Step1：服装上传与搭配推荐

### nrm_garment_assets
**服装资产表** - 存储上传的服装图片资源，独立资源表可被多个项目复用。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 主键 ID |
| `user_id` | `text NOT NULL` | 用户 ID，公共资产使用 `"system"` |
| `name` | `text NOT NULL` | 服饰名称 |
| `type` | `text NOT NULL` | 类型：image / video |
| `category` | `text NOT NULL` | 服装类别：top / bottom / shoes / accessory |
| `main_image_url` | `text NOT NULL` | 主图 URL |
| `sub_image_url_1~3` | `text` | 副图 URL |

### nrm_project_garment_assoc
**项目-服装关联表** - 多对多关系，一个项目可关联多件服装。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 主键 |
| `project_id` | `text NOT NULL` | 项目 ID |
| `garment_asset_id` | `text NOT NULL` | 服装资产 ID |

### nrm_outfit_plans
**穿搭方案表** - AI 生成的服装搭配建议。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 方案唯一标识 |
| `project_id` | `text NOT NULL` | 关联项目 ID |
| `user_id` | `text NOT NULL` | 用户 ID |
| `asset_ids` | `jsonb NOT NULL` | 搭配资产 ID 列表（JSONB 数组） |
| `index` | `integer NOT NULL` | 方案序号 |
| `title` | `text` | 方案标题 |
| `reason` | `text` | 推荐理由 |

### nrm_project_outfit_plans
**项目-穿搭方案关联表** - 多对多关系。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 主键 |
| `project_id` | `text NOT NULL` | 项目 ID |
| `outfit_plan_id` | `text NOT NULL` | 穿搭方案 ID |
| `selected` | `boolean` | 是否被选中 |

### nrm_role_direction_cards
**角色预设卡片表** - 存储 AI 生成的角色方向选择列表，与 `nrm_projects` 一对一。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `uuid NOT NULL` | 主键 UUID |
| `project_id` | `text NOT NULL` | 关联项目 ID |
| `cards_json` | `jsonb` | `Step1RoleDirectionCard[]` 数组 |

---

## Step2：角色定妆

### nrm_library_characters
**角色库表** - 预设角色模板库，可复用的角色资源。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 角色唯一标识 |
| `user_id` | `text NOT NULL` | 所有者用户 ID |
| `name` | `text NOT NULL` | 角色名称 |
| `kind` | `text NOT NULL` | 角色类型：human / cartoon |
| `status` | `text NOT NULL` | 状态：pending / ready / error |
| `thumbnail_url` | `text NOT NULL` | 角色缩略图 URL |
| `views` | `jsonb` | 五视图 URLs（JSONB） |
| `tags` | `jsonb NOT NULL` | 标签（JSONB 数组） |

### nrm_project_characters
**项目角色表** - 存储项目中使用的角色信息。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 主键 |
| `project_id` | `text NOT NULL` | 项目 ID |
| `library_character_id` | `text NOT NULL` | 角色库角色 ID |
| `role` | `text NOT NULL` | 角色用途：main（主角色）/ secondary（配角） |
| `is_selected` | `boolean` | 是否为项目当前选中的角色 |

### nrm_character_five_views
**角色五视图表** - 存储角色的五视图生成结果。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 主键 UUID |
| `character_id` | `text NOT NULL` | 关联角色 ID |
| `image_url` | `text` | 五视图图片 OSS 地址 |
| `status` | `text NOT NULL` | 状态：pending / processing / ready / failed |
| `is_active` | `boolean NOT NULL` | 是否为激活版本 |

---

## 图片项目（Image Project）

> 图片项目流程：Step1(服饰搭配) → Step2(角色定妆) → Step3(模特图生成) → Step4(电商详情页生成)

### nrm_model_photos
**模特图表** - 存储生成的模特图。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 主键 UUID |
| `project_id` | `text NOT NULL` | 关联项目 ID |
| `image_url` | `text` | 模特图 URL |
| `pose_label` | `text` | 姿势标签 |
| `bg_label` | `text` | 背景标签 |
| `is_selected` | `boolean` | 是否选中 |
| `status` | `text` | 状态：pending / ready / error |
| `sort_order` | `integer` | 排序序号 |

### nrm_image_project_ext
**图片项目扩展表** - 存储电商详情页的 Logo 配置和拼接图信息。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 主键 |
| `project_id` | `text NOT NULL` | 关联项目 ID |
| `logo_url` | `text` | Logo 图片 URL |
| `logo_position` | `text NOT NULL` | Logo 位置：top-left / top-right / bottom-left / bottom-right |
| `logo_max_width` | `integer NOT NULL` | Logo 最大宽度（像素） |
| `logo_min_width` | `integer` | Logo 最小宽度（像素） |
| `logo_width_ratio` | `numeric` | Logo 宽度比例（0-1） |
| `logo_margin` | `integer NOT NULL` | Logo 边距（像素） |
| `logo_opacity` | `numeric NOT NULL` | Logo 透明度（0-1） |
| `stitch_image_url` | `text` | 拼接图 URL |
| `stitch_hash` | `text` | 拼接图哈希值（用于判断是否需要重新生成） |
| `stitch_updated_at` | `bigint` | 拼接图更新时间 |
| `long_image_url` | `text` | 长图 URL |
| `long_image_sketch_url` | `text` | 长图草图 URL |

### nrm_page_sections
**页面区块表** - 存储电商详情页的各区块配置。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 主键 |
| `project_id` | `text NOT NULL` | 关联项目 ID |
| `section_key` | `text` | 区块标识键 |
| `section_type` | `text` | 区块类型 |
| `title` | `text` | 区块标题 |
| `goal` | `text` | 营销目标 |
| `copy` | `text` | 文案内容 |
| `visual_prompt` | `text` | 视觉提示词 |
| `sort_order` | `integer` | 排序序号 |
| `status` | `text` | 状态：draft / ready / error |
| `current_image_asset_id` | `text` | 当前图片资产 ID |
| `editable_data` | `jsonb` | 可编辑数据（JSONB） |
| `display_config` | `jsonb` | 显示配置（JSONB） |
| `layout_config` | `jsonb` | 布局配置（JSONB） |

### nrm_section_versions
**区块版本表** - 存储区块的历史版本快照。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 主键 |
| `section_id` | `text NOT NULL` | 关联区块 ID |
| `project_id` | `text NOT NULL` | 关联项目 ID |
| `version_number` | `integer NOT NULL` | 版本号 |
| `prompt_snapshot` | `jsonb` | 提示词快照（JSONB） |
| `copy_snapshot` | `jsonb` | 文案快照（JSONB） |
| `image_asset_id` | `text` | 图片资产 ID |
| `is_active` | `boolean NOT NULL` | 是否为激活版本 |

---

## 换装项目（Outfit Change Project）

> 换装项目流程：Step1(上传源视频) → Step2(确认视频) → Step3(选择角色) → Step4(一键换装)

### nrm_outfit_change_projects
**换装项目主表** - 存储换装项目的核心数据。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 任务 ID（主键） |
| `project_id` | `text NOT NULL` | 关联项目 ID |
| `input_json` | `jsonb` | 输入参数 JSON |
| `stage1_result_json` | `jsonb` | 阶段一结果 JSON |
| `status` | `text NOT NULL` | 状态：pending / processing / ready / error |

### nrm_outfit_segment_images
**换装分镜图表** - 存储换装项目各分镜的图片。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 主键 |
| `task_id` | `text NOT NULL` | 关联任务 ID |
| `segment_index` | `integer NOT NULL` | 分镜序号 |
| `image_url` | `text` | 图片 URL |

### nrm_outfit_segment_videos
**换装分镜视频表** - 存储换装项目各分镜的视频。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 主键 |
| `task_id` | `text NOT NULL` | 关联任务 ID |
| `segment_index` | `integer NOT NULL` | 分镜序号 |
| `video_url` | `text` | 视频 URL |
| `status` | `text` | 状态 |

---

## Step3：脚本与分镜

### nrm_script_data
**脚本数据表** - 存储生成的视频脚本内容。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `varchar(128) NOT NULL` | 脚本数据主键 ID |
| `type` | `integer NOT NULL` | 脚本类型：1-短视频 / 2-长视频 |
| `title` | `text` | 脚本标题 |
| `duration_seconds` | `integer` | 预计时长（秒） |
| `source` | `text` | 来源：manual / ai / reverse |
| `summary` | `text` | 剧情摘要 |
| `primary_emotion` | `text` | 主要情感 |
| `theme` | `text` | 主题标签 |
| `video_type` | `text` | 视频类型 |
| `video_style` | `text` | 视频风格 |

**任务管理**：使用全局队列 `nrm_async_jobs`（`job_type: step3_*`）。

### nrm_project_script_assoc
**项目-脚本关联表** - 项目与脚本的多版本关联。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 主键 |
| `project_id` | `text NOT NULL` | 项目 ID |
| `script_data_id` | `text NOT NULL` | 脚本数据 ID |
| `version` | `integer NOT NULL` | 脚本版本号 |
| `is_active` | `boolean NOT NULL` | 是否为当前活跃版本 |

### nrm_shot_breakdown
**分镜拆分表** - 脚本拆解为具体镜头。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `varchar(128) NOT NULL` | 镜头数据主键 ID |
| `script_data_id` | `varchar(128) NOT NULL` | 关联脚本数据 ID |
| `shot_index` | `integer NOT NULL` | 镜头序号 |
| `shot_type` | `varchar` | 镜头类型：远景/中景/近景/特写等 |
| `camera_movement` | `varchar` | 镜头运动：推/拉/摇/移/跟等 |
| `shot_description` | `text` | 镜头画面描述 |
| `duration_seconds` | `numeric` | 镜头持续时长（秒） |

### nrm_step3_frame_images
**分镜图片表** - 存储分镜对应的参考图。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `uuid NOT NULL` | 主键 |
| `project_id` | `text NOT NULL` | 项目 ID |
| `shot_breakdown_id` | `text NOT NULL` | 关联分镜表 ID |
| `frame_index` | `integer NOT NULL` | 镜头序号 |
| `batches` | `jsonb NOT NULL` | 批次图片数据 |
| `selected_image_url` | `text` | 选中的图片 URL |

### nrm_shot_prompts
**专业提示词表** - 存储用于视频生成的提示词，可被 Step3 和 Step4 复用。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 主键 UUID |
| `project_id` | `text NOT NULL` | 关联项目 ID |
| `type` | `text NOT NULL` | 类型：origin（Step3 原始）/ fission（裂变） |
| `version` | `integer NOT NULL` | 版本号 |
| `is_active` | `boolean NOT NULL` | 是否激活版本 |
| `shots` | `jsonb NOT NULL` | 镜头提示词数组 `ShotPromptItem[]` |

---

## Step4：分镜视频生成

### nrm_step4_video_scenes
**分镜视频场景表** - 存储每个分镜生成的视频片段。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `uuid NOT NULL` | 主键 |
| `project_id` | `text NOT NULL` | 项目 ID |
| `scene_index` | `integer NOT NULL` | 场景序号 |
| `variant_urls` | `jsonb NOT NULL` | 视频变体 URL 数组 |
| `selected_index` | `integer NOT NULL` | 选中的变体索引 |
| `clip_url` | `text` | 最终剪辑 URL |
| `clip_status` | `text` | 剪辑状态 |
| `error_message` | `text` | 错误信息 |

**任务管理**：使用全局队列 `nrm_async_jobs`（`job_type: step4_video`）。

### nrm_video_musics
**背景音乐库表** - 存储可用的背景音乐资源。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 音乐唯一标识 |
| `title` | `text NOT NULL` | 音乐标题 |
| `music_url` | `text NOT NULL` | 音乐文件 URL |
| `atmospheres` | `jsonb NOT NULL` | 氛围标签（JSONB 数组） |
| `duration_sec` | `integer` | 时长（秒） |
| `artist` | `text` | 艺术家 |
| `cover_url` | `text` | 封面 URL |

### nrm_project_video_musics
**项目-音乐关联表** - 项目选中的背景音乐。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 主键 |
| `project_id` | `text NOT NULL` | 项目 ID |
| `music_id` | `text NOT NULL` | 音乐 ID |
| `is_selected` | `boolean NOT NULL` | 是否选中 |
| `volume` | `numeric` | 音量 |

### nrm_final_videos
**成片表** - 存储最终生成的完整视频。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 主键 UUID |
| `project_id` | `text NOT NULL` | 项目 ID |
| `video_type` | `text NOT NULL` | 成片类型：step4 / fission |
| `video_url` | `text NOT NULL` | 视频 URL |
| `duration_sec` | `numeric` | 视频时长（秒） |
| `cover_image_url` | `text` | 封面图 URL |
| `background_music_url` | `text` | 背景音乐 URL |
| `storyboard_ids` | `text` | 分镜 ID 列表（JSON） |

---

## 裂变系统（Step3/Step4 共用）

> 裂变功能允许从单个分镜生成多个变体，提升内容多样性。

### nrm_fission_video_status
**裂变状态表** - 记录裂变任务的整体状态。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 状态唯一标识 |
| `project_id` | `text NOT NULL` | 关联项目 ID |
| `fission_count` | `integer` | 裂变视频总数 |
| `completed_count` | `integer` | 已完成数量 |
| `status` | `text NOT NULL` | 当前状态：整理镜像/生成视频/已完成 |

### nrm_fission_storyboard_sub
**裂变分镜子表** - 记录裂变产生的分镜变体。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 记录唯一标识 |
| `project_id` | `text NOT NULL` | 关联项目 ID |
| `fission_id` | `text` | 关联裂变任务 ID |
| `storyboard_url` | `text NOT NULL` | 分镜图 URL |
| `storyboard_source` | `text NOT NULL` | 分镜来源 |

### nrm_fission_task_items
**裂变任务项表** - 细化的任务清单。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `uuid NOT NULL` | 主键 |
| `fission_video_status_id` | `uuid NOT NULL` | 关联裂变状态 ID |
| `task_type` | `text NOT NULL` | 任务类型 |
| `item_index` | `integer NOT NULL` | 任务序号 |
| `image_status` | `text` | 图片生成状态 |
| `video_status` | `text` | 视频生成状态 |

### nrm_fission_videos
**裂变生成视频表** - 存储裂变生成的最终视频。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 视频唯一标识 |
| `project_id` | `text NOT NULL` | 关联项目 ID |
| `fission_type` | `text NOT NULL` | 裂变类型：ai_new_story / manual |
| `video_path` | `text` | 视频存储路径 |
| `thumbnail_url` | `text` | 缩略图 URL |
| `status` | `text NOT NULL` | 状态：pending/processing/completed/failed |

---

## 全局任务队列

### nrm_async_jobs
**异步任务队列表** - 统一管理所有异步任务。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 任务唯一标识 |
| `user_id` | `text NOT NULL` | 用户 ID |
| `job_type` | `text NOT NULL` | 任务类型：`step3_*` / `step4_video` 等 |
| `project_id` | `text` | 关联项目 ID |
| `input` | `text NOT NULL` | 输入参数（JSON） |
| `status` | `text NOT NULL` | 状态：pending/processing/completed/failed |
| `stage` | `text` | 当前阶段 |
| `result` | `jsonb` | 执行结果 |
| `error` | `jsonb` | 错误信息 |
| `visible_to_user` | `boolean NOT NULL` | 是否对用户可见 |

---

## LLM 模型管理系统

> 统一管理多个 LLM 提供商的配置、密钥、路由策略和调用审计。

### nrm_providers
**LLM 提供商表** - 存储模型提供商基础信息。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | Provider 唯一标识 |
| `name` | `text NOT NULL` | Provider 名称 |
| `type` | `text NOT NULL` | 类型：llm / video / image |
| `vendor` | `text NOT NULL` | 供应商：openai / anthropic / runway 等 |
| `model` | `text NOT NULL` | 模型标识 |
| `base_url` | `text NOT NULL` | API 基础 URL |
| `call_mode` | `text NOT NULL` | 调用模式 |
| `enabled` | `boolean NOT NULL` | 是否启用 |

### nrm_provider_secrets
**LLM 密钥表** - 安全存储 API Key。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `provider_id` | `text NOT NULL` | 关联 Provider ID |
| `cipher_text` | `text NOT NULL` | 加密后的密钥 |

### nrm_provider_policies
**LLM 路由策略表** - 定义模型选择规则。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 策略唯一标识 |
| `route_key` | `text NOT NULL` | 路由键（标识业务场景） |
| `primary_provider_id` | `text NOT NULL` | 主 Provider ID |
| `fallback_provider_ids` | `jsonb NOT NULL` | 备选 Provider IDs（JSONB 数组） |
| `timeout_ms` | `integer NOT NULL` | 超时时间（毫秒） |
| `enabled` | `boolean NOT NULL` | 是否启用 |

### nrm_provider_call_audits
**LLM 调用审计表** - 记录所有 LLM API 调用，用于调试、成本分析、性能监控和质量追踪。

> 这是大模型调用日志的核心表，完整记录每次 LLM 调用的入参、出参、性能指标和成本数据。

| 字段分类 | 核心字段 | 类型 | 说明 |
|----------|----------|------|------|
| **基础信息** | `id` | `text NOT NULL` | 审计记录唯一标识 |
| | `created_at` | `bigint` | 创建时间戳 |
| | `request_id` | `text` | 请求 ID，用于链路追踪 |
| **Provider 信息** | `provider_id` | `text` | Provider ID |
| | `provider_vendor` | `text` | 提供商厂商：openai / anthropic 等 |
| | `provider_base_url` | `text` | 提供商基础 URL |
| | `actual_model` | `text` | 实际调用的模型 |
| | `actual_endpoint` | `text` | 实际调用的完整 API URL |
| | `call_mode` | `varchar` | 调用模式 |
| **路由信息** | `route_key` | `text` | 路由键（标识业务场景） |
| | `project_id` | `text` | 项目 ID |
| | `user_id` | `text` | 用户 ID |
| | `call_context` | `text` | 调用上下文 |
| **请求信息** | `messages_json` | `text` | 消息 JSON（完整请求体） |
| | `query_params_json` | `text` | 查询参数 JSON |
| | `request_body_json` | `text` | 请求体 JSON |
| | `request_headers_json` | `text` | 请求头 JSON |
| | `request_summary` | `text` | 请求摘要（用于快速浏览） |
| **响应信息** | `response_summary` | `text` | 响应摘要 |
| | `status` | `text` | 状态：pending / success / error / timeout |
| | `error_code` | `text` | 错误码 |
| | `error_message` | `text` | 错误信息 |
| **性能指标** | `latency_ms` | `integer` | 总延迟（毫秒） |
| | `ttft_ms` | `integer` | 首 Token 时间（Time To First Token） |
| | `timeout_ms` | `integer` | 超时设置 |
| | `slow_request` | `boolean` | 是否慢请求 |
| **Token 统计** | `input_tokens` | `integer` | 输入 Token 数 |
| | `output_tokens` | `integer` | 输出 Token 数 |
| **成本信息** | `cost` | `double precision` | 成本（美元） |
| **重试记录** | `attempts_json` | `text` | 重试记录 JSON |

**使用场景**：
1. **调试排查**：通过 `messages_json` 查看完整请求体，定位调用问题
2. **成本分析**：统计 `cost`、`input_tokens`、`output_tokens` 分析成本趋势
3. **性能监控**：通过 `latency_ms`、`ttft_ms` 监控响应速度，识别慢请求
4. **质量追踪**：通过 `route_key` 分业务场景统计成功率和错误分布

---

## 错误日志系统

### nrm_error_logs
**错误日志表** - 统一记录系统错误。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `uuid NOT NULL` | 主键 ID（UUID） |
| `error_code` | `text NOT NULL` | 错误码，用于分类统计 |
| `error_message` | `text NOT NULL` | 错误消息 |
| `error_stack` | `text` | 错误堆栈信息 |
| `severity` | `text NOT NULL` | 错误级别：error / warn / critical |
| `api_path` | `text` | API 路径 |
| `source_module` | `text` | 来源模块 |
| `project_id` | `uuid` | 项目 ID |
| `input_params` | `jsonb` | 输入参数（JSONB） |

---

## 配置管理系统

### nrm_config
**通用配置表** - 存储系统级配置项。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `id` | `text NOT NULL` | 配置项唯一标识 |
| `payload_json` | `jsonb NOT NULL` | 配置内容（JSONB） |
| `payload_hash` | `text` | 配置内容哈希值 |
| `updated_at` | `bigint NOT NULL` | 更新时间（毫秒时间戳） |

### nrm_business_configs
**业务配置表** - 存储业务模块配置。

| 核心字段 | 类型 | 说明 |
|----------|------|------|
| `module` | `varchar NOT NULL` | 配置模块标识 |
| `config_json` | `jsonb NOT NULL` | 配置内容（JSONB） |
| `description` | `text` | 配置说明 |
| `created_at` | `bigint NOT NULL` | 创建时间（毫秒时间戳） |
| `updated_at` | `bigint NOT NULL` | 更新时间（毫秒时间戳） |
| `updated_by` | `varchar` | 最后修改人 |

---

## 表关系总结

```
nrm_projects (项目)
    │
    ├── Step1: 服装与穿搭
    │   ├── nrm_garment_assets ←→ nrm_project_garment_assoc (多对多)
    │   ├── nrm_outfit_plans ←→ nrm_project_outfit_plans (多对多)
    │   └── nrm_role_direction_cards (1:1 角色预设卡片)
    │
    ├── Step2: 角色定妆
    │   ├── nrm_library_characters (角色库)
    │   ├── nrm_project_characters (项目角色)
    │   └── nrm_character_five_views (五视图)
    │
    ├── Step3: 脚本与分镜
    │   ├── nrm_script_data (脚本数据)
    │   │   └── nrm_project_script_assoc (项目-脚本关联)
    │   ├── nrm_shot_breakdown (分镜拆分)
    │   ├── nrm_step3_frame_images (分镜图片)
    │   └── nrm_shot_prompts (提示词, type='origin')
    │
    ├── Step4: 分镜视频
    │   ├── nrm_step4_video_scenes (视频场景)
    │   ├── nrm_shot_prompts (提示词, type='origin')
    │   ├── nrm_video_musics (音乐库)
    │   ├── nrm_project_video_musics (项目音乐)
    │   └── nrm_final_videos (成片)
    │
    ├── 裂变系统 (Step3/Step4 共用)
    │   ├── nrm_fission_video_status (状态)
    │   ├── nrm_shot_prompts (提示词, type='fission')
    │   ├── nrm_fission_storyboard_sub (子分镜)
    │   ├── nrm_fission_task_items (任务项)
    │   └── nrm_fission_videos (生成视频)
            nrm_async_jobs (异步任务队列)
    │
    └── 全局系统
        ├── nrm_async_jobs (异步任务队列)
        ├── nrm_config (通用配置)
        ├── nrm_business_configs (业务配置)
        ├── nrm_providers (LLM 提供商)
        ├── nrm_provider_secrets (密钥)
        ├── nrm_provider_policies (路由策略)
        ├── nrm_provider_call_audits (调用审计)
        └── nrm_error_logs (错误日志)
```

---

## AI 使用指南

### 查询数据时
1. **项目维度**：从 `nrm_projects` 开始，通过 `project_id` 关联其他表
2. **Step 维度**：根据当前步骤，查询对应的业务表
3. **状态追踪**：通过 `nrm_projects.status` 了解项目进度
4. **软删除过滤**：查询时加 `WHERE deleted_at IS NULL`

### 创建数据时
1. **遵循流水线顺序**：Step1 → Step2 → Step3 → Step4 → Step5
2. **关联关系**：创建子表数据时，确保父表记录已存在
3. **任务追踪**：耗时操作使用全局任务队列 `nrm_async_jobs`

### 修改数据时
1. **不要删除项目**：项目采用软删除，标记 `deleted_at` 字段
2. **状态一致性**：修改业务数据时，确保关联数据状态同步
3. **裂变数据**：修改原始分镜时，考虑是否需要更新裂变子表

---

## 常见查询场景

### 查询项目的完整状态
```sql
SELECT p.*
FROM nrm_projects p
WHERE p.id = $projectId AND p.deleted_at IS NULL;
```

### 查询项目的服装和穿搭
```sql
SELECT ga.*, op.*
FROM nrm_garment_assets ga
JOIN nrm_project_garment_assoc pga ON ga.id = pga.garment_asset_id
JOIN nrm_outfit_plans op ON op.project_id = $projectId
WHERE pga.project_id = $projectId AND ga.deleted_at IS NULL;
```

### 查询分镜及裂变状态
```sql
SELECT sb.*, fvs.status as fission_status
FROM nrm_shot_breakdown sb
LEFT JOIN nrm_fission_video_status fvs ON fvs.project_id = sb.project_id
WHERE sb.project_id = $projectId;
```

### 查询最近错误日志
```sql
SELECT error_code, error_message, severity, api_path, created_at
FROM nrm_error_logs
ORDER BY created_at DESC
LIMIT 20;
```

---

### 查询提示词优化记录
```sql
SELECT original_prompt, refined_prompt, analysis, changes_summary, generation, created_at
FROM nrm_step4_prompt_refinements
WHERE project_id = $projectId AND scene_index = $sceneIndex
ORDER BY created_at DESC
LIMIT 10;
```

---

## 更新记录

- **2026-05-25**: 新增 `nrm_step4_prompt_refinements` 表，记录 Step4 视频重试时的提示词优化过程
- **2026-04-22**: 优化文档结构，补充字段详情、软删除约定、通用字段说明，规范关系图
- **2026-04-21**: 删除 `nrm_project_workflow_states` 表，工作流状态迁移到各业务表
- **2026-04-19**: 删除 `nrm_video_jobs`、`nrm_step3_script_jobs` 表，Step3/Step4 任务管理统一使用全局队列 `nrm_async_jobs`
- **2026-04-16**: 新增 `nrm_role_direction_cards` 角色预设卡片表，角色预设列表从 workflow state 快照迁移到独立表
- **2026-04-15**: 新增 LLM 模型管理系统；优化文档结构，增加 AI 使用指南和查询示例
