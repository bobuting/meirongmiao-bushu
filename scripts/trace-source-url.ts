/**
 * 追踪特定脚本的 sourceOssUrl 数据流
 */
import { Pool } from 'pg';
import 'dotenv/config';
import { getScriptsDataDbService } from '../src/service/scripts-data-db-service.js';
import { parseVideoScriptsContentsWithShots } from '../src/modules/video-step/step3-video-script/content-parser.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30000 });

async function trace() {
  console.log('=== 追踪 sourceOssUrl 数据流 ===\n');

  // 选择一个 type=3 没有 source_oss_url 但 source_script_id 指向有 source_oss_url 的脚本
  const targetId = 'video-script-video-1775742461684-4-1775820026593';

  // 1. 查询 type=3 脚本
  console.log(`【1】查询 type=3 脚本 ${targetId}：`);
  const type3Result = await pool.query(`
    SELECT id, source_script_id, source_oss_url
    FROM nrm_script_data
    WHERE id = $1
  `, [targetId]);

  if (type3Result.rows.length > 0) {
    const t3 = type3Result.rows[0];
    console.log(`  id: ${t3.id}`);
    console.log(`  source_script_id: ${t3.source_script_id}`);
    console.log(`  source_oss_url: ${t3.source_oss_url || 'NULL'}`);
  }

  // 2. 使用 service 查询并解析
  console.log('\n【2】使用 ScriptsDataDbService 查询并解析：');
  const service = getScriptsDataDbService(pool);
  const records = await service.getByIds([targetId]);
  const record = records.get(targetId);

  if (record) {
    console.log(`  record.id: ${record.id}`);
    console.log(`  record.sourceScriptId: ${record.sourceScriptId}`);
    console.log(`  record.sourceOssUrl: ${record.sourceOssUrl || 'NULL'}`);

    // 3. 解析脚本
    console.log('\n【3】解析脚本：');
    const parsed = await parseVideoScriptsContentsWithShots(pool, [record]);
    if (parsed.length > 0) {
      const p = parsed[0];
      console.log(`  parsed.id: ${p.id}`);
      console.log(`  parsed.sourceOssUrl: ${p.sourceOssUrl || 'NULL'}`);
    }
  }

  // 4. 查询原始 type=1 脚本
  const sourceScriptId = type3Result.rows[0]?.source_script_id;
  if (sourceScriptId) {
    console.log(`\n【4】查询原始 type=1 脚本 ${sourceScriptId}：`);
    const type1Result = await pool.query(`
      SELECT id, source_oss_url
      FROM nrm_script_data
      WHERE id = $1
    `, [sourceScriptId]);

    if (type1Result.rows.length > 0) {
      console.log(`  id: ${type1Result.rows[0].id}`);
      console.log(`  source_oss_url: ${type1Result.rows[0].source_oss_url || 'NULL'}`);
    }
  }

  await pool.end();
}

trace().catch(e => { console.error('Error:', e.message); pool.end(); });
