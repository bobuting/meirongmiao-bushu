import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgres://gitlab:password@101.37.80.207:5432/neirongmiao',
  ssl: false
});

const projectId = '07c2defe-5d9b-4d09-bd3d-8c6ba7ccf6a1';

async function checkLabels() {
  try {
    const result = await pool.query(
      `SELECT pose_label, bg_label, created_at 
       FROM nrm_model_photos 
       WHERE project_id = $1 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [projectId]
    );
    
    if (result.rows.length === 0) {
      console.log('该项目暂无模特图');
      return;
    }
    
    console.log(`\n最近 ${result.rows.length} 张模特图的标签：\n`);
    result.rows.forEach((row, i) => {
      const time = new Date(Number(row.created_at)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      console.log(`${i + 1}. 姿势: ${row.pose_label || '未设置'} | 背景: ${row.bg_label || '未设置'}`);
    });
    
    // 统计标签重复度
    const poseLabels = result.rows.map(r => r.pose_label).filter(Boolean);
    const bgLabels = result.rows.map(r => r.bg_label).filter(Boolean);
    
    const poseUnique = new Set(poseLabels).size;
    const bgUnique = new Set(bgLabels).size;
    
    console.log(`\n统计：`);
    console.log(`- 姿势标签: ${poseUnique}/${poseLabels.length} 种不同`);
    console.log(`- 背景标签: ${bgUnique}/${bgLabels.length} 种不同`);
    
    await pool.end();
  } catch (err) {
    console.error('查询失败:', err.message);
    process.exit(1);
  }
}

checkLabels();
