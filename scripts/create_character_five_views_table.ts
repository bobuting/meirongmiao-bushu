/**
 * 创建角色五视图表
 */

import { Pool } from "pg";
import "dotenv/config";

const TABLE_NAME = "nrm_character_five_views";

function table(name: string): string {
  return `nrm_${name}`;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("错误: DATABASE_URL 未设置");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
  });

  try {
    console.log(`Creating table ${TABLE_NAME}...`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id TEXT PRIMARY KEY,
        character_id TEXT NOT NULL,
        image_url TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        is_active BOOLEAN NOT NULL DEFAULT false,
        prompt TEXT,
        model TEXT,
        generation_params JSONB,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_five_views_character_id ON ${TABLE_NAME}(character_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_five_views_is_active ON ${TABLE_NAME}(character_id, is_active) WHERE is_active = true
    `);

    // 添加外键约束（如果 library_characters 表存在）
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'nrm_library_characters') THEN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'fk_five_views_character_id'
          ) THEN
            ALTER TABLE ${TABLE_NAME}
            ADD CONSTRAINT fk_five_views_character_id
            FOREIGN KEY (character_id) REFERENCES nrm_library_characters(id) ON DELETE CASCADE;
          END IF;
        END IF;
      END $$
    `);

    // 添加表注释
    await pool.query(`COMMENT ON TABLE ${TABLE_NAME} IS '角色五视图表'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.id IS '主键UUID'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.character_id IS '关联角色ID'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.image_url IS '五视图图片OSS地址'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.status IS '状态：pending/processing/ready/failed'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.is_active IS '是否为激活版本'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.prompt IS '生成提示词'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.model IS '生成模型'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.generation_params IS '其他生成参数JSON'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.error_message IS '错误信息'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.retry_count IS '重试次数'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.created_at IS '创建时间戳'`);
    await pool.query(`COMMENT ON COLUMN ${TABLE_NAME}.updated_at IS '更新时间戳'`);

    console.log(`✓ Table ${TABLE_NAME} created successfully`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Failed to create table:", err);
  process.exit(1);
});