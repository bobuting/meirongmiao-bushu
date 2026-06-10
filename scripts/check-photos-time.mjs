import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgres://gitlab:password@101.37.80.207:5432/neirongmiao',
  ssl: false
});

const projectId = '07c2defe-5d9b-4d09-bd3d-8c6ba7ccf6a1';

async function check() {
  try {
    // 先查表结构
    const schema = await pool.query(
      `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_name = 'nrm_model_photos' 
       ORDER BY ordinal_position`
    );
    
    console.log('表字段：', schema.rows.map(r => r.column_name).join(', '));
    
    // 查最近照片
    const result = await pool.query(
      `SELECT * FROM nrm_model_photos WHERE project_id = $1 ORDER BY created_at DESC LIMIT 3`,
      [projectId]
    );
    
    if (result.rows.length === 0) {
      console.log('该项目暂无模特图');
    } else {
      console.log(`\n最近 ${result.rows.length} 张模特图：`);
      result.rows.forEach((row, i) => {
        const time = new Date(Number(row.created_at)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        console.log(`${i + 1}. ID: ${row.id}, 时间: ${time}`);
      });
    }
    
    await pool.end();
  } catch (err) {
    console.error('查询失败:', err.message);
    process.exit(1);
  }
}

check();
