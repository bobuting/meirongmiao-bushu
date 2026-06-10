/**
 * 模拟 enrichSnapshotWithShotBreakdown 函数执行
 * 检查 sourceUrl 补全逻辑是否正确
 */
import { Pool } from 'pg';
import 'dotenv/config';
import { getScriptsDataDbService } from '../src/service/scripts-data-db-service.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30000 });

async function test() {
  const projectId = '16656ca5-57d1-4187-88de-80391806167e';

  console.log('=== 模拟 enrichSnapshotWithShotBreakdown ===\n');

  // 1. 查询快照
  const snapshotQuery = await pool.query(`
    SELECT project_data->'step3ScriptCandidateSnapshot' as snapshot
    FROM nrm_project_workflow_states
    WHERE project_id = $1
  `, [projectId]);

  if (snapshotQuery.rows.length === 0 || !snapshotQuery.rows[0].snapshot) {
    console.log('没有找到快照');
    await pool.end();
    return;
  }

  const snapshot = snapshotQuery.rows[0].snapshot;
  const items = snapshot.items || [];

  console.log(`快照共有 ${items.length} 个脚本\n`);

  // 2. 检查需要补全 sourceUrl 的脚本
  const itemsNeedingSourceUrl = items.filter((item: any) => !item.sourceUrl && item.sourceScriptId);
  console.log(`需要补全 sourceUrl 的脚本: ${itemsNeedingSourceUrl.length} 个\n`);

  if (itemsNeedingSourceUrl.length === 0) {
    console.log('所有脚本都已有 sourceUrl');
    await pool.end();
    return;
  }

  // 3. 收集 sourceScriptId
  const sourceScriptIds = itemsNeedingSourceUrl
    .map((item: any) => item.sourceScriptId)
    .filter((id: string) => !!id);

  console.log('需要查询的 sourceScriptId:', sourceScriptIds.slice(0, 5), '...\n');

  // 4. 查询原始脚本
  const service = getScriptsDataDbService(pool);
  const sourceRecordsMap = await service.getByIds(sourceScriptIds);

  console.log(`查询到 ${sourceRecordsMap.size} 条原始脚本记录\n`);

  // 5. 检查原始脚本的 sourceOssUrl
  console.log('原始脚本的 sourceOssUrl:');
  sourceScriptIds.slice(0, 5).forEach((id: string) => {
    const record = sourceRecordsMap.get(id);
    console.log(`  ${id}: ${record?.sourceOssUrl || 'NULL'}`);
  });

  // 6. 模拟补全
  console.log('\n补全后的结果:');
  itemsNeedingSourceUrl.slice(0, 5).forEach((item: any) => {
    const sourceRecord = sourceRecordsMap.get(item.sourceScriptId);
    const newSourceUrl = sourceRecord?.sourceOssUrl || null;
    console.log(`  ${item.title?.substring(0, 30)}`);
    console.log(`    原 sourceUrl: ${item.sourceUrl || 'NULL'}`);
    console.log(`    新 sourceUrl: ${newSourceUrl || 'NULL'}`);
  });

  await pool.end();
}

test().catch(e => { console.error('Error:', e.message); pool.end(); });
