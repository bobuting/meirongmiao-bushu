/**
 * 检查 type=3 视频脚本的 source_oss_url
 */
import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30000 });

async function check() {
  console.log('=== 检查 type=3 视频脚本的 source_oss_url ===\n');

  // 1. type=3 的 source_oss_url 分布
  console.log('【1】type=3 的 source_oss_url 值分布：');
  const urlStats = await pool.query(`
    SELECT
      CASE
        WHEN source_oss_url IS NULL THEN 'NULL'
        WHEN source_oss_url LIKE 'http%' THEN '有效URL'
        ELSE '其他值'
      END as category,
      COUNT(*) as count
    FROM nrm_script_data
    WHERE type = 3
    GROUP BY category
  `);
  urlStats.rows.forEach(r => {
    console.log(`  ${r.category}: ${r.count} 条`);
  });

  // 2. type=3 的"其他值"示例
  console.log('\n【2】type=3 的 source_oss_url "其他值"示例：');
  const otherValues = await pool.query(`
    SELECT DISTINCT source_oss_url
    FROM nrm_script_data
    WHERE type = 3
    AND source_oss_url IS NOT NULL
    AND source_oss_url NOT LIKE 'http%'
    LIMIT 10
  `);
  otherValues.rows.forEach(r => {
    console.log(`  - "${r.source_oss_url}"`);
  });

  // 3. 检查 type=3 中没有 source_oss_url 但 source_script_id 有值的情况
  console.log('\n【3】type=3 没有有效 URL 但有 source_script_id 的脚本：');
  const missingUrl = await pool.query(`
    SELECT
      t3.id,
      t3.title,
      t3.source_script_id,
      t1.source_oss_url as original_source_url
    FROM nrm_script_data t3
    LEFT JOIN nrm_script_data t1 ON t3.source_script_id = t1.id
    WHERE t3.type = 3
    AND (t3.source_oss_url IS NULL OR t3.source_oss_url NOT LIKE 'http%')
    ORDER BY t3.updated_at DESC
    LIMIT 10
  `);
  missingUrl.rows.forEach(r => {
    console.log(`  ${r.id}`);
    console.log(`    title: ${r.title?.substring(0, 30)}`);
    console.log(`    source_script_id: ${r.source_script_id || '无'}`);
    console.log(`    原脚本 source_url: ${r.original_source_url || '无'}`);
    console.log('');
  });

  await pool.end();
}

check().catch(e => { console.error('Error:', e.message); pool.end(); });
