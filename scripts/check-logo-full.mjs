import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgres://gitlab:password@101.37.80.207:5432/neirongmiao',
  ssl: false
});

const projectId = '07c2defe-5d9b-4d09-bd3d-8c6ba7ccf6a1';

async function check() {
  try {
    const result = await pool.query(
      `SELECT logo_url, logo_width_ratio, logo_margin, logo_position, logo_min_width, logo_max_width, logo_opacity, updated_at
       FROM nrm_image_project_ext 
       WHERE project_id = $1`,
      [projectId]
    );
    
    if (result.rows.length === 0) {
      console.log('❌ 项目记录不存在');
      return;
    }
    
    const row = result.rows[0];
    console.log('Logo配置详情：');
    console.log(`- logo_url: ${row.logo_url || '❌ NULL（未上传）'}`);
    console.log(`- logo_width_ratio: ${row.logo_width_ratio}`);
    console.log(`- logo_margin: ${row.logo_margin}px`);
    console.log(`- logo_position: ${row.logo_position}`);
    console.log(`- logo_min_width: ${row.logo_min_width}px`);
    console.log(`- logo_max_width: ${row.logo_max_width}px`);
    console.log(`- logo_opacity: ${row.logo_opacity}`);
    console.log(`- updated_at: ${new Date(Number(row.updated_at)).toLocaleString('zh-CN')}`);
    
    // 检查Logo URL是否可访问
    if (row.logo_url) {
      console.log('\n检查Logo URL可访问性...');
      try {
        const response = await fetch(row.logo_url, { method: 'HEAD' });
        console.log(`- HTTP状态: ${response.status}`);
        console.log(`- Content-Type: ${response.headers.get('content-type')}`);
        console.log(`- Content-Length: ${response.headers.get('content-length')} bytes`);
      } catch (err) {
        console.log(`- ❌ Logo URL访问失败: ${err.message}`);
      }
    }
    
    await pool.end();
  } catch (err) {
    console.error('查询失败:', err.message);
    process.exit(1);
  }
}

check();
