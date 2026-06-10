-- AnimateAnyone 动作迁移数据库表
-- 创建时间: 2025-05-15
-- 说明: 支持内置动作模板库 + 动作迁移任务管理

-- ===========================================================================
-- 1. 内置动作模板库表
-- ===========================================================================

-- 内置动作模板库表
CREATE TABLE IF NOT EXISTS nrm_action_templates (
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

-- 索引
CREATE INDEX IF NOT EXISTS idx_action_templates_category ON nrm_action_templates(category);
CREATE INDEX IF NOT EXISTS idx_action_templates_popularity ON nrm_action_templates(popularity DESC);
CREATE INDEX IF NOT EXISTS idx_action_templates_active ON nrm_action_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_action_templates_source ON nrm_action_templates(source);

-- 表备注
COMMENT ON TABLE nrm_action_templates IS '内置动作模板库（AnimateAnyone 动作迁移）';
COMMENT ON COLUMN nrm_action_templates.id IS '模板 ID，格式：tpl_{uuid前16位}';
COMMENT ON COLUMN nrm_action_templates.name IS '模板名称（如"流行舞-科目三"）';
COMMENT ON COLUMN nrm_action_templates.category IS '分类：dance=舞蹈，sport=运动，expression=表情，daily=日常，special=特殊';
COMMENT ON COLUMN nrm_action_templates.ali_template_id IS '阿里云预置模板 ID，可直接调用无需生成';
COMMENT ON COLUMN nrm_action_templates.duration_sec IS '模板时长（秒）';
COMMENT ON COLUMN nrm_action_templates.thumbnail_url IS '缩略图 URL（静态预览）';
COMMENT ON COLUMN nrm_action_templates.preview_video_url IS '预览视频 URL（动态预览）';
COMMENT ON COLUMN nrm_action_templates.preview_gif_url IS '预览 GIF URL（轻量动态预览）';
COMMENT ON COLUMN nrm_action_templates.description IS '模板描述';
COMMENT ON COLUMN nrm_action_templates.tags IS '标签数组（JSONB），如["热门", "简单", "适合新手"]';
COMMENT ON COLUMN nrm_action_templates.popularity IS '热度/使用次数（用于排序）';
COMMENT ON COLUMN nrm_action_templates.is_active IS '是否启用（失效模板不展示）';
COMMENT ON COLUMN nrm_action_templates.source IS '来源：official=阿里云官方模板，user_created=用户上传生成，system=系统预生成';

-- ===========================================================================
-- 2. 动作迁移任务表
-- ===========================================================================

-- 动作迁移任务表
CREATE TABLE IF NOT EXISTS nrm_action_transfer_tasks (
    task_id VARCHAR(64) PRIMARY KEY,              -- 任务 ID
    project_id VARCHAR(64) NOT NULL,              -- 项目 ID
    user_id VARCHAR(64) NOT NULL,                 -- 用户 ID
    status VARCHAR(32) NOT NULL,                  -- 状态

    -- 动作来源（两种模式）
    action_source_type VARCHAR(32) NOT NULL,      -- 动作来源类型：upload_video / builtin_template
    source_video_url TEXT,                        -- 参考视频 URL（上传视频模式）
    builtin_template_id VARCHAR(64),              -- 内置模板 ID（内置模板模式）

    -- 目标图片
    target_image_url TEXT NOT NULL,               -- 目标图片 URL

    -- 可选参数
    prompt TEXT,                                  -- 描述文本
    duration_sec INTEGER DEFAULT 0,               -- 视频时长（限制）
    background_mode VARCHAR(16) DEFAULT 'image',  -- 背景模式：image / video

    -- 中间结果
    image_valid BOOLEAN,                          -- 图片检测结果
    image_check_result JSONB,                     -- 图片检测详情
    template_id VARCHAR(128),                     -- 动作模板 ID（阿里云）
    template_duration_sec INTEGER,                -- 模板时长

    -- 输出结果
    result_video_url TEXT,                        -- 生成的视频 URL
    result_duration_sec INTEGER,                  -- 结果视频时长
    result_width INTEGER,                         -- 结果视频宽度
    result_height INTEGER,                        -- 结果视频高度

    -- 错误信息
    error_message TEXT,
    error_stage VARCHAR(32),                      -- 失败阶段：detecting/template_generating/generating

    -- 时间戳
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,

    -- 关联
    async_job_id VARCHAR(64),                     -- 异步任务 ID

    UNIQUE(project_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_action_transfer_user ON nrm_action_transfer_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_action_transfer_status ON nrm_action_transfer_tasks(status);
CREATE INDEX IF NOT EXISTS idx_action_transfer_project ON nrm_action_transfer_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_action_transfer_template ON nrm_action_transfer_tasks(builtin_template_id);
CREATE INDEX IF NOT EXISTS idx_action_transfer_job ON nrm_action_transfer_tasks(async_job_id);

-- 表备注
COMMENT ON TABLE nrm_action_transfer_tasks IS '动作迁移任务表（AnimateAnyone 三步流程）';
COMMENT ON COLUMN nrm_action_transfer_tasks.task_id IS '任务 ID，格式：at_{uuid前16位}';
COMMENT ON COLUMN nrm_action_transfer_tasks.project_id IS '项目 ID（关联 nrm_projects）';
COMMENT ON COLUMN nrm_action_transfer_tasks.user_id IS '用户 ID';
COMMENT ON COLUMN nrm_action_transfer_tasks.status IS '状态：pending/detecting/detected/template_generating/template_generated/generating/succeeded/failed/cancelled';
COMMENT ON COLUMN nrm_action_transfer_tasks.action_source_type IS '动作来源类型：upload_video=上传视频，builtin_template=内置模板';
COMMENT ON COLUMN nrm_action_transfer_tasks.source_video_url IS '参考视频 URL（上传视频模式，提取动作）';
COMMENT ON COLUMN nrm_action_transfer_tasks.builtin_template_id IS '内置模板 ID（内置模板模式，关联 nrm_action_templates）';
COMMENT ON COLUMN nrm_action_transfer_tasks.target_image_url IS '目标图片 URL（应用动作的对象）';
COMMENT ON COLUMN nrm_action_transfer_tasks.prompt IS '可选描述文本（影响生成效果）';
COMMENT ON COLUMN nrm_action_transfer_tasks.duration_sec IS '视频时长限制（默认取模板时长）';
COMMENT ON COLUMN nrm_action_transfer_tasks.background_mode IS '背景模式：image=图片背景，video=视频背景';
COMMENT ON COLUMN nrm_action_transfer_tasks.image_valid IS '图片检测结果（true=合规，false=不合规）';
COMMENT ON COLUMN nrm_action_transfer_tasks.image_check_result IS '图片检测详情（JSONB，包含 reason/suggestions）';
COMMENT ON COLUMN nrm_action_transfer_tasks.template_id IS '阿里云动作模板 ID';
COMMENT ON COLUMN nrm_action_transfer_tasks.template_duration_sec IS '模板时长（秒）';
COMMENT ON COLUMN nrm_action_transfer_tasks.result_video_url IS '生成的视频 URL';
COMMENT ON COLUMN nrm_action_transfer_tasks.result_duration_sec IS '结果视频时长（秒）';
COMMENT ON COLUMN nrm_action_transfer_tasks.result_width IS '结果视频宽度';
COMMENT ON COLUMN nrm_action_transfer_tasks.result_height IS '结果视频高度';
COMMENT ON COLUMN nrm_action_transfer_tasks.error_message IS '错误信息';
COMMENT ON COLUMN nrm_action_transfer_tasks.error_stage IS '失败阶段：detecting/template_generating/generating';
COMMENT ON COLUMN nrm_action_transfer_tasks.async_job_id IS '异步任务 ID（关联 nrm_async_jobs）';

-- ===========================================================================
-- 3. 状态说明
-- ===========================================================================

-- 任务状态流转：
-- pending → detecting → detected → template_generating → template_generated → generating → succeeded
--                   ↓                      ↓                      ↓
--               failed                  failed                  failed
--
-- 内置模板模式：
-- pending → detecting → detected → generating → succeeded
--                   ↓                      ↓
--               failed                  failed