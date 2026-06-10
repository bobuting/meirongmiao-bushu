/**
 * 检查特定项目的快照数据
 */
import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30000 });

const PROJECT_ID = '16656ca5-57d1-4187-88de-80391806167e';

async function check() {
  console.log(`=== 检查项目 ${PROJECT_ID} 的快照数据 ===\n`);

  // 1. 检查快照结构
  console.log('【1】检查快照结构：');
  const snapshot = await pool.query(`
    SELECT
      project_data->'step3ScriptCandidateSnapshot'->'schemaVersion' as schemaVersion,
      project_data->'step3ScriptCandidateSnapshot'->'generationMode' as generationMode,
      jsonb_array_length(project_data->'step3ScriptCandidateSnapshot'->'items') as itemCount,
      project_data->'step3ScriptCandidateSnapshotRef'->'schemaVersion' as refSchemaVersion
    FROM nrm_project_workflow_states
    WHERE project_id = $1
  `, [PROJECT_ID]);

  if (snapshot.rows.length > 0) {
    const row = snapshot.rows[0];
    console.log(`  schemaVersion: ${row.schemaversion || '旧格式'}`);
    console.log(`  generationMode: ${row.generationmode}`);
    console.log(`  items 数量: ${row.itemcount || 0}`);
    console.log(`  refSchemaVersion: ${row.refschemaversion || '无'}`);
  }

  // 2. 检查 items 中的视频脚本
  console.log('\n【2】检查 items 中的视频脚本：');
  const items = await pool.query(`
    SELECT
      jsonb_array_elements(project_data->'step3ScriptCandidateSnapshot'->'items') as item
    FROM nrm_project_workflow_states
    WHERE project_id = $1
  `, [PROJECT_ID]);

  if (items.rows.length > 0) {
    items.rows.forEach((row, i) => {
      const item = row.item;
      console.log(`  [${i}] trendType: ${item.trendType}`);
      console.log(`      title: ${item.title?.substring(0, 30) || '无标题'}`);
      console.log(`      candidateId: ${item.candidateId}`);
      console.log(`      sourceUrl: ${item.sourceUrl || '❌ 无'}`);
      console.log(`      sourceScriptId: ${item.sourceScriptId || '无'}`);
      console.log('');
    });
  }

  // 3. 如果是引用格式，检查 itemRefs
  console.log('【3】检查引用格式 itemRefs：');
  const refItems = await pool.query(`
    SELECT
      jsonb_array_elements(project_data->'step3ScriptCandidateSnapshotRef'->'itemRefs') as ref
    FROM nrm_project_workflow_states
    WHERE project_id = $1
    AND project_data->'step3ScriptCandidateSnapshotRef' IS NOT NULL
  `, [PROJECT_ID]);

  if (refItems.rows.length > 0) {
    refItems.rows.forEach((row, i) => {
      const ref = row.ref;
      console.log(`  [${i}] trendType: ${ref.trendType}`);
      console.log(`      candidateId: ${ref.candidateId}`);
      console.log(`      sourceScriptId: ${ref.sourceScriptId || '无'}`);
      console.log('');
    });
  } else {
    console.log('  无引用格式数据');
  }

  await pool.end();
}

check().catch(e => { console.error('Error:', e.message); pool.end(); });
