/**
 * 检查 source_oss_url 为空的视频脚本
 */
import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30000 });

async function check() {
  console.log('=== 检查 source_oss_url 无效的视频脚本 ===\n');

  // 1. 检查 type=1（反推脚本）的 source_oss_url
  console.log('【1】type=1 的反推脚本 source_oss_url：');
  const type1Scripts = await pool.query(`
    SELECT id, title, source_oss_url
    FROM nrm_script_data
    WHERE type = 1
    ORDER BY updated_at DESC
    LIMIT 10
  `);
  type1Scripts.rows.forEach(r => {
    const hasValidUrl = r.source_oss_url && r.source_oss_url.startsWith('http');
    console.log(`  ${r.id}: ${hasValidUrl ? '✅ 有效' : '❌ 无效/空'} (${r.source_oss_url || 'NULL'})`);
  });

  // 2. 检查 source_oss_url 的不同值分布
  console.log('\n【2】source_oss_url 值分布：');
  const urlStats = await pool.query(`
    SELECT
      CASE
        WHEN source_oss_url IS NULL THEN 'NULL'
        WHEN source_oss_url LIKE 'http%' THEN '有效URL'
        ELSE '其他值'
      END as category,
      COUNT(*) as count
    FROM nrm_script_data
    WHERE type = 1
    GROUP BY category
  `);
  urlStats.rows.forEach(r => {
    console.log(`  ${r.category}: ${r.count} 条`);
  });

  // 3. 检查具体的"其他值"
  console.log('\n【3】source_oss_url 的"其他值"示例：');
  const otherValues = await pool.query(`
    SELECT DISTINCT source_oss_url
    FROM nrm_script_data
    WHERE type = 1
    AND source_oss_url IS NOT NULL
    AND source_oss_url NOT LIKE 'http%'
    LIMIT 10
  `);
  otherValues.rows.forEach(r => {
    console.log(`  - "${r.source_oss_url}"`);
  });

  await pool.end();
}

check().catch(e => { console.error('Error:', e.message); pool.end(); });
