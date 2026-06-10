import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgres://gitlab:password@101.37.80.207:5432/neirongmiao',
  ssl: false
});

async function check() {
  try {
    const result = await pool.query(
      `SELECT id, job_type, project_id, input, status, created_at
       FROM nrm_async_jobs 
       WHERE job_type = 'image_step3_single_photo' 
       ORDER BY created_at DESC 
       LIMIT 3`
    );
    
    console.log(`最近 ${result.rows.length} 个单图生成任务：\n`);
    
    for (const row of result.rows) {
      const time = new Date(Number(row.created_at)).toLocaleString('zh-CN');
      console.log(`ID: ${row.id}`);
      console.log(`类型: ${row.job_type}`);
      console.log(`projectId: ${row.project_id || '❌ NULL'}`);
      console.log(`状态: ${row.status}`);
      console.log(`时间: ${time}`);
      
      // 解析input看是否有photoId
      try {
        const input = JSON.parse(row.input);
        console.log(`input.photoId: ${input.photoId || '❌ 缺失'}`);
      } catch (e) {
        console.log('input解析失败');
      }
      console.log('---\n');
    }
    
    await pool.end();
  } catch (err) {
    console.error('查询失败:', err.message);
    process.exit(1);
  }
}

check();
