-- 扩展抖音账号绑定表
-- 用途：存储用户通过 Chrome 扩展绑定的抖音账号信息
-- 隔离：独立于服务端自动化，不修改现有 douyin 相关表
CREATE TABLE IF NOT EXISTS nrm_ext_douyin_accounts (
  id              TEXT PRIMARY KEY,                    -- UUID
  user_id         TEXT NOT NULL,                       -- 关联 nrm_users.id
  label           TEXT NOT NULL DEFAULT '',            -- 用户自定义标签，如 "主号"
  douyin_uid      TEXT,                                -- 抖音用户 UID（登录后获取）
  status          TEXT NOT NULL DEFAULT 'pending'      -- 账号状态
    CHECK (status IN ('active', 'expired', 'pending', 'revoked')),
  last_verified_at BIGINT,                             -- 最后验证时间戳（毫秒）
  created_at      BIGINT NOT NULL,                     -- 创建时间戳
  updated_at      BIGINT NOT NULL,                     -- 更新时间戳

  FOREIGN KEY (user_id) REFERENCES nrm_users(id) ON DELETE CASCADE
);

COMMENT ON TABLE nrm_ext_douyin_accounts IS '扩展抖音账号绑定表，Cookie 存储在用户浏览器端';
COMMENT ON COLUMN nrm_ext_douyin_accounts.id IS '账号 UUID';
COMMENT ON COLUMN nrm_ext_douyin_accounts.user_id IS '关联用户 ID';
COMMENT ON COLUMN nrm_ext_douyin_accounts.label IS '用户自定义标签';
COMMENT ON COLUMN nrm_ext_douyin_accounts.douyin_uid IS '抖音用户 UID';
COMMENT ON COLUMN nrm_ext_douyin_accounts.status IS '账号状态：active=已登录，expired=已过期，pending=待登录，revoked=已撤销';
COMMENT ON COLUMN nrm_ext_douyin_accounts.last_verified_at IS '最后验证登录态的时间戳（毫秒）';

CREATE INDEX IF NOT EXISTS idx_ext_douyin_accounts_user ON nrm_ext_douyin_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_ext_douyin_accounts_status ON nrm_ext_douyin_accounts(status);

-- 扩展发布任务表
-- 用途：存储 Chrome 扩展执行的抖音发布任务
-- 隔离：独立于 nrm_async_jobs，不修改现有任务表
CREATE TABLE IF NOT EXISTS nrm_ext_douyin_publish_jobs (
  id              TEXT PRIMARY KEY,                    -- 任务 UUID
  user_id         TEXT NOT NULL,                       -- 关联 nrm_users.id
  project_id      TEXT NOT NULL,                       -- 关联项目 ID
  account_id      TEXT NOT NULL,                       -- 关联 nrm_ext_douyin_accounts.id
  status          TEXT NOT NULL DEFAULT 'pending'      -- 任务状态
    CHECK (status IN ('pending', 'claimed', 'running', 'completed', 'failed', 'expired')),
  stage           TEXT,                                -- 当前执行阶段
  input_json      JSONB NOT NULL,                      -- 输入参数（视频URL、标题、标签等）
  result_json     JSONB,                               -- 执行结果
  error_json      JSONB,                               -- 错误信息
  created_at      BIGINT NOT NULL,                     -- 创建时间戳
  updated_at      BIGINT NOT NULL,                     -- 更新时间戳
  claimed_at      BIGINT,                              -- 扩展认领时间戳
  completed_at    BIGINT,                              -- 完成时间戳

  FOREIGN KEY (user_id) REFERENCES nrm_users(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES nrm_ext_douyin_accounts(id) ON DELETE CASCADE
);

COMMENT ON TABLE nrm_ext_douyin_publish_jobs IS '扩展发布任务表，任务由 Chrome 扩展在用户浏览器端执行';
COMMENT ON COLUMN nrm_ext_douyin_publish_jobs.id IS '任务 UUID';
COMMENT ON COLUMN nrm_ext_douyin_publish_jobs.user_id IS '关联用户 ID';
COMMENT ON COLUMN nrm_ext_douyin_publish_jobs.project_id IS '关联项目 ID';
COMMENT ON COLUMN nrm_ext_douyin_publish_jobs.account_id IS '使用的抖音账号 ID';
COMMENT ON COLUMN nrm_ext_douyin_publish_jobs.status IS '任务状态：pending=待执行，claimed=已认领，running=执行中，completed=已完成，failed=失败，expired=已过期';
COMMENT ON COLUMN nrm_ext_douyin_publish_jobs.stage IS '当前执行阶段：uploading/processing/filling_form/selecting_cover/publishing';
COMMENT ON COLUMN nrm_ext_douyin_publish_jobs.input_json IS '输入参数 JSON';
COMMENT ON COLUMN nrm_ext_douyin_publish_jobs.result_json IS '执行结果 JSON';
COMMENT ON COLUMN nrm_ext_douyin_publish_jobs.error_json IS '错误信息 JSON';

CREATE INDEX IF NOT EXISTS idx_ext_publish_jobs_user ON nrm_ext_douyin_publish_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_ext_publish_jobs_status ON nrm_ext_douyin_publish_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ext_publish_jobs_created ON nrm_ext_douyin_publish_jobs(created_at);