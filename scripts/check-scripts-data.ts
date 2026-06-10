/**
 * 检查 nrm_script_data 表中的视频脚本数据
 */
import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30000 });

async function check() {
  console.log('=== 检查 nrm_script_data 表 ===\n');

  // 1. 查询各类型的数量
  const typeCount = await pool.query(`
    SELECT type, COUNT(*) as count
    FROM nrm_script_data
    GROUP BY type
    ORDER BY type
  `);
  console.log('各类型数量：');
  typeCount.rows.forEach(r => {
    const typeNames: Record<number, string> = { 0: 'NORMAL', 1: 'REVERSE', 2: 'LIBRARY', 3: 'VIDEO', 4: 'REALTIME', 5: 'STORY' };
    console.log(`  type ${r.type} (${typeNames[r.type] || '未知'}): ${r.count} 条`);
  });

  // 2. 查询 type != 1 的脚本详情
  const videoScripts = await pool.query(`
    SELECT id, type, title, source_oss_url, created_at
    FROM nrm_script_data
    WHERE type != 1
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.log('\ntype != 1 的脚本（最近10条）：');
  videoScripts.rows.forEach(r => {
    console.log(`  [${r.type}] ${(r.title || '无标题').substring(0, 30)}... | source_oss_url: ${r.source_oss_url ? '有' : '无'}`);
  });

  // 3. 检查是否有 source_oss_url
  const withUrl = await pool.query(`
    SELECT type, COUNT(*) as count
    FROM nrm_script_data
    WHERE source_oss_url IS NOT NULL
    GROUP BY type
  `);
  console.log('\n有 source_oss_url 的脚本数量：');
  withUrl.rows.forEach(r => {
    console.log(`  type ${r.type}: ${r.count} 条`);
  });

  await pool.end();
}

check().catch(e => { console.error('Error:', e.message); pool.end(); });
