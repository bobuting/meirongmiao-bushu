/**
 * 检查视频脚本数据流：从数据库到前端
 */
import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30000 });

async function check() {
  console.log('=== 检查视频脚本数据流 ===\n');

  // 1. 检查 nrm_script_data 中 type=3 的脚本是否有 source_oss_url
  console.log('【1】nrm_script_data 中 type=3 的脚本：');
  const type3Scripts = await pool.query(`
    SELECT id, title, source_oss_url, source_script_id
    FROM nrm_script_data
    WHERE type = 3
    ORDER BY updated_at DESC
    LIMIT 5
  `);
  type3Scripts.rows.forEach(r => {
    console.log(`  ${r.id}`);
    console.log(`    title: ${r.title}`);
    console.log(`    source_oss_url: ${r.source_oss_url || '❌ 无'}`);
    console.log(`    source_script_id: ${r.source_script_id || '无'}`);
  });

  // 2. 检查快照中是否存储了 sourceUrl
  console.log('\n【2】检查快照中是否存储了 sourceUrl：');
  const snapshots = await pool.query(`
    SELECT id, project_id, project_data->'step3ScriptCandidateSnapshot'->'items' as items
    FROM nrm_project_workflow_states
    WHERE project_data->'step3ScriptCandidateSnapshot' IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 1
  `);

  if (snapshots.rows.length > 0) {
    const items = snapshots.rows[0].items;
    console.log(`  项目ID: ${snapshots.rows[0].project_id}`);
    if (items && Array.isArray(items)) {
      // 找到 trendType=video 的脚本
      const videoItems = items.filter((item: any) => item.trendType === 'video');
      console.log(`  视频脚本数量: ${videoItems.length}`);
      videoItems.slice(0, 3).forEach((item: any, i: number) => {
        console.log(`  [${i}] ${item.title || '无标题'}`);
        console.log(`      candidateId: ${item.candidateId}`);
        console.log(`      sourceUrl: ${item.sourceUrl || '❌ 无'}`);
        console.log(`      sourceScriptId: ${item.sourceScriptId || '无'}`);
      });
    }
  } else {
    console.log('  没有找到快照');
  }

  // 3. 检查引用格式快照
  console.log('\n【3】检查引用格式快照 (ref_v1)：');
  const refSnapshots = await pool.query(`
    SELECT id, project_id,
           project_data->'step3ScriptCandidateSnapshotRef'->'itemRefs' as itemRefs
    FROM nrm_project_workflow_states
    WHERE project_data->'step3ScriptCandidateSnapshotRef' IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 1
  `);

  if (refSnapshots.rows.length > 0 && refSnapshots.rows[0].itemrefs) {
    const itemRefs = refSnapshots.rows[0].itemrefs;
    console.log(`  项目ID: ${refSnapshots.rows[0].project_id}`);
    if (Array.isArray(itemRefs)) {
      // 找到 trendType=video 的引用
      const videoRefs = itemRefs.filter((ref: any) => ref.trendType === 'video');
      console.log(`  视频脚本引用数量: ${videoRefs.length}`);
      videoRefs.slice(0, 3).forEach((ref: any, i: number) => {
        console.log(`  [${i}] candidateId: ${ref.candidateId}`);
        console.log(`      sourceScriptId: ${ref.sourceScriptId || '无'}`);
      });
    }
  } else {
    console.log('  没有找到引用格式快照');
  }

  await pool.end();
}

check().catch(e => { console.error('Error:', e.message); pool.end(); });
