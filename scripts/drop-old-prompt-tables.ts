#!/usr/bin/env tsx
/**
 * 删除旧提示词系统数据库表
 * 执行前请确保已备份数据到 docs/prompts/ 目录
 */

import pg from 'pg';
import { config } from 'dotenv';

config();

const { Pool } = pg;

async function dropOldPromptTables() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🔍 检查旧提示词表是否存在...');

    // 检查表是否存在
    const checkResult = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE tablename IN ('nrm_prompt_templates', 'nrm_prompt_versions')
      ORDER BY tablename;
    `);

    if (checkResult.rows.length === 0) {
      console.log('✅ 旧提示词表不存在，无需删除');
      return;
    }

    console.log(`📋 找到 ${checkResult.rows.length} 个旧提示词表:`);
    checkResult.rows.forEach(row => console.log(`   - ${row.tablename}`));

    // 删除表
    console.log('\n🗑️  开始删除旧提示词表...');

    await pool.query('DROP TABLE IF EXISTS nrm_prompt_versions CASCADE;');
    console.log('✅ 已删除 nrm_prompt_versions');

    await pool.query('DROP TABLE IF EXISTS nrm_prompt_templates CASCADE;');
    console.log('✅ 已删除 nrm_prompt_templates');

    // 验证删除结果
    const verifyResult = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE tablename LIKE '%prompt%'
      ORDER BY tablename;
    `);

    console.log('\n🔍 验证删除结果:');
    if (verifyResult.rows.length === 0) {
      console.log('✅ 所有旧提示词表已成功删除');
    } else {
      console.log('⚠️  仍存在以下包含 prompt 的表:');
      verifyResult.rows.forEach(row => console.log(`   - ${row.tablename}`));
    }

  } catch (error) {
    console.error('❌ 删除表时出错:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

dropOldPromptTables()
  .then(() => {
    console.log('\n✅ 迁移完成！');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 迁移失败:', error);
    process.exit(1);
  });
