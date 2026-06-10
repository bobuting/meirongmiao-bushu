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
      `SELECT logo_url, logo_width_ratio, logo_margin, logo_min_width, logo_max_width, logo_opacity, logo_position, updated_at
       FROM nrm_image_project_ext 
       WHERE project_id = $1`,
      [projectId]
    );
    
    if (result.rows.length === 0) {
      console.log('❌ 项目记录不存在');
      return;
    }
    
    const row = result.rows[0];
    const updateTime = new Date(Number(row.updated_at)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    
    console.log('Logo 配置详情：');
    console.log(`- Logo URL: ${row.logo_url || '❌ 未设置'}`);
    console.log(`- 宽度比例: ${row.logo_width_ratio}`);
    console.log(`- 边距: ${row.logo_margin}px`);
    console.log(`- 最小宽度: ${row.logo_min_width}px`);
    console.log(`- 最大宽度: ${row.logo_max_width}px`);
    console.log(`- 透明度: ${row.logo_opacity}`);
    console.log(`- 位置: ${row.logo_position}`);
    console.log(`- 更新时间: ${updateTime}`);
    
    if (!row.logo_url) {
      console.log('\n⚠️  Logo URL 未设置，请先上传 Logo 图片');
    }
    
    await pool.end();
  } catch (err) {
    console.error('查询失败:', err.message);
    process.exit(1);
  }
}

check();
