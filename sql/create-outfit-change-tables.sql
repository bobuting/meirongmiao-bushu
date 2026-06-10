-- ============================================================================
-- 服装换装任务表（修正版）
-- ============================================================================

-- 创建表（如果不存在）
CREATE TABLE IF NOT EXISTS nrm_outfit_change_tasks (
  task_id VARCHAR(64) PRIMARY KEY,
  input_json JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  stage0_result_json JSONB,
  stage1_result_json JSONB,
  stage2_result_json JSONB,
  stage3_result_json JSONB,
  error_message TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(epoch FROM now()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(epoch FROM now()) * 1000)::BIGINT,
  project_id TEXT,
  user_id TEXT,
  source_video_url TEXT,
  target_outfit_id TEXT,
  character_id TEXT
);

-- 添加表备注
COMMENT ON TABLE nrm_outfit_change_tasks IS '服装换装视频生成任务记录';
COMMENT ON COLUMN nrm_outfit_change_tasks.task_id IS '任务唯一标识（格式：oc_{uuid前16位})';
COMMENT ON COLUMN nrm_outfit_change_tasks.input_json IS '输入参数 JSON';
COMMENT ON COLUMN nrm_outfit_change_tasks.status IS '任务状态：draft/pending/capturing/understanding/extracting/generating/succeeded/failed';
COMMENT ON COLUMN nrm_outfit_change_tasks.stage0_result_json IS 'Stage 0 参考图采集结果';
COMMENT ON COLUMN nrm_outfit_change_tasks.stage1_result_json IS 'Stage 1 视频理解结果';
COMMENT ON COLUMN nrm_outfit_change_tasks.stage2_result_json IS 'Stage 2 角色服装适配结果（BatchAdaptResult）';
COMMENT ON COLUMN nrm_outfit_change_tasks.stage3_result_json IS 'Stage 3 视频生成结果（BatchGenerateResult）';
COMMENT ON COLUMN nrm_outfit_change_tasks.error_message IS '错误信息';
COMMENT ON COLUMN nrm_outfit_change_tasks.created_at IS '创建时间戳（毫秒）';
COMMENT ON COLUMN nrm_outfit_change_tasks.updated_at IS '更新时间戳（毫秒）';
COMMENT ON COLUMN nrm_outfit_change_tasks.project_id IS '关联项目ID，用于查询 draft 记录';
COMMENT ON COLUMN nrm_outfit_change_tasks.user_id IS '用户ID';
COMMENT ON COLUMN nrm_outfit_change_tasks.source_video_url IS '源视频URL，Step1 选择后即持久化';
COMMENT ON COLUMN nrm_outfit_change_tasks.target_outfit_id IS '目标服装ID，Step2 选择后即持久化';
COMMENT ON COLUMN nrm_outfit_change_tasks.character_id IS '目标角色ID，Step3 选择后即持久化';

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_outfit_change_tasks_project_id ON nrm_outfit_change_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_outfit_change_tasks_user_id ON nrm_outfit_change_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_outfit_change_tasks_status ON nrm_outfit_change_tasks(status);

-- ============================================================================
-- 验证表结构
-- ============================================================================

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = current_schema()
AND table_name = 'nrm_outfit_change_tasks'
ORDER BY ordinal_position;