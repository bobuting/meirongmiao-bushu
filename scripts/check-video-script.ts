/**
 * 检查 "笑死我了" 脚本的详细信息
 */
import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30000 });

async function check() {
  console.log('=== 检查 "笑死我了" 脚本 ===\n');

  // 1. 查询所有 "笑死我了" 相关脚本
  const scripts = await pool.query(`
    SELECT id, type, title, source_oss_url, source_script_id, created_at, updated_at
    FROM nrm_script_data
    WHERE title LIKE '%笑死我了%'
    ORDER BY created_at DESC
  `);

  console.log(`找到 ${scripts.rows.length} 条 "笑死我了" 脚本：\n`);

  for (const script of scripts.rows) {
    console.log(`ID: ${script.id}`);
    console.log(`Type: ${script.type}`);
    console.log(`Title: ${script.title}`);
    console.log(`Source OSS URL: ${script.source_oss_url || '无'}`);
    console.log(`Source Script ID: ${script.source_script_id || '无'}`);
    console.log(`Created: ${new Date(script.created_at).toLocaleString()}`);
    console.log('---');
  }

  // 2. 检查 shot_breakdown
  const shotBreakdown = await pool.query(`
    SELECT sb.script_data_id, sb.shot_index, sb.shot_description
    FROM nrm_shot_breakdown sb
    JOIN nrm_script_data sd ON sb.script_data_id = sd.id
    WHERE sd.title LIKE '%笑死我了%'
    ORDER BY sb.script_data_id, sb.shot_index
  `);

  console.log(`\n找到 ${shotBreakdown.rows.length} 条分镜数据`);
  if (shotBreakdown.rows.length > 0) {
    console.log('分镜预览（前3条）：');
    shotBreakdown.rows.slice(0, 3).forEach(r => {
      console.log(`  [${r.shot_index}] ${r.shot_description?.substring(0, 50)}...`);
    });
  }

  // 3. 检查 type=1 的原始脚本是否有 source_oss_url
  const type1Scripts = await pool.query(`
    SELECT id, title, source_oss_url
    FROM nrm_script_data
    WHERE type = 1 AND title LIKE '%笑死我了%'
    LIMIT 5
  `);

  console.log(`\ntype=1 的 "笑死我了" 脚本：`);
  type1Scripts.rows.forEach(r => {
    console.log(`  ${r.id}: source_oss_url = ${r.source_oss_url || '无'}`);
  });

  await pool.end();
}

check().catch(e => { console.error('Error:', e.message); pool.end(); });
