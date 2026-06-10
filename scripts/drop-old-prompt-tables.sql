-- 删除旧提示词系统数据库表
-- 执行前请确保已备份数据到 docs/prompts/ 目录
-- 执行时间: 2024-04-21

-- 1. 备份表数据（可选，如果需要额外备份）
-- CREATE TABLE nrm_prompt_templates_backup AS SELECT * FROM nrm_prompt_templates;
-- CREATE TABLE nrm_prompt_versions_backup AS SELECT * FROM nrm_prompt_versions;

-- 2. 删除旧提示词版本表
DROP TABLE IF EXISTS nrm_prompt_versions CASCADE;

-- 3. 删除旧提示词模板表
DROP TABLE IF EXISTS nrm_prompt_templates CASCADE;

-- 4. 验证表已删除
-- SELECT tablename FROM pg_tables WHERE tablename LIKE '%prompt%';
