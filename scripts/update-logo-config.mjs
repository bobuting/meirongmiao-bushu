import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgres://gitlab:password@101.37.80.207:5432/neirongmiao',
  ssl: false
});

const projectId = '07c2defe-5d9b-4d09-bd3d-8c6ba7ccf6a1';

async function updateConfig() {
  try {
    // 先查询当前配置
    const current = await pool.query(
      `SELECT logo_width_ratio, logo_margin, logo_min_width, logo_max_width, logo_opacity, logo_position 
       FROM nrm_image_project_ext WHERE project_id = $1`,
      [projectId]
    );
    
    if (current.rows.length === 0) {
      console.log('❌ 项目记录不存在');
      await pool.end();
      return;
    }
    
    console.log('当前配置:', current.rows[0]);
    
    // 更新为新配置
    const result = await pool.query(
      `UPDATE nrm_image_project_ext 
       SET logo_width_ratio = 0.25, 
           logo_min_width = 250, 
           logo_max_width = 500, 
           logo_margin = 30, 
           logo_opacity = 1.0,
           updated_at = $1
       WHERE project_id = $2
       RETURNING logo_width_ratio, logo_margin, logo_min_width, logo_max_width, logo_opacity`,
      [Date.now(), projectId]
    );
    
    console.log('✅ 已更新为新配置:', result.rows[0]);
    console.log('\n请重新生成模特图以应用新 Logo 配置');
    
    await pool.end();
  } catch (err) {
    console.error('❌ 更新失败:', err.message);
    process.exit(1);
  }
}

updateConfig();
