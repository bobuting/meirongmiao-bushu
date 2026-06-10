/**
 * 插入分镜提示词工程师模板到数据库
 *
 * 运行方式: node scripts/insert-shot-prompt-engineer-template.js
 */

import pg from 'pg';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// 加载 .env 文件
dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库连接
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 提示词模板内容
const PROMPT_CONTENT = fs.readFileSync(
  path.join(__dirname, '../src/modules/video-step/step3/md/prompt-shot-engineer.md'),
  'utf-8'
);

// 变量定义
const VARIABLES = {
  userPrompt: {
    type: 'string',
    required: true,
    description: '用户输入的分镜JSON数据和参数',
  },
};

async function main() {
  try {
    const now = Date.now();
    const id = randomUUID();
    const code = 'shot_prompt_engineer';
    const name = '分镜提示词工程师';
    const type = 'storyboard_generation';
    const description = '将分镜JSON数据转化为可直接投入AI视频工具生产的高精度提示词指令包，包含关键帧图片提示词和视频提示词';
    const tags = ['分镜', '提示词', '视频生成', '图片生成', 'AI视频'];

    // 检查是否已存在
    const existingResult = await pool.query(
      'SELECT id FROM nrm_prompt_templates WHERE code = $1',
      [code]
    );

    if (existingResult.rows.length > 0) {
      console.log(`提示词模板 "${code}" 已存在，更新内容...`);

      await pool.query(
        `UPDATE nrm_prompt_templates
         SET name = $2, description = $3, content = $4, variables = $5, tags = $6, updated_at = $7, status = 'published'
         WHERE code = $1`,
        [code, name, description, PROMPT_CONTENT, JSON.stringify(VARIABLES), JSON.stringify(tags), now]
      );

      console.log('✅ 提示词模板更新成功！');
    } else {
      console.log(`创建新的提示词模板 "${code}"...`);

      await pool.query(
        `INSERT INTO nrm_prompt_templates
         (id, code, name, type, description, content, variables, status, current_version, created_at, updated_at, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          id,
          code,
          name,
          type,
          description,
          PROMPT_CONTENT,
          JSON.stringify(VARIABLES),
          'published',
          1,
          now,
          now,
          JSON.stringify(tags),
        ]
      );

      console.log('✅ 提示词模板创建成功！');
    }

    // 查询并显示结果
    const result = await pool.query(
      'SELECT id, code, name, type, status, created_at FROM nrm_prompt_templates WHERE code = $1',
      [code]
    );

    console.log('\n📋 提示词模板信息:');
    console.log(JSON.stringify(result.rows[0], null, 2));

  } catch (error) {
    console.error('❌ 操作失败:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
}

main();
