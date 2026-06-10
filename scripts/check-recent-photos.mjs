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
      `SELECT id, image_url, pose_label, bg_label, created_at, updated_at
       FROM nrm_model_photos 
       WHERE project_id = $1 
       ORDER BY created_at DESC 
       LIMIT 3`,
      [projectId]
    );
    
    console.log(`最近 ${result.rows.length} 张模特图：\n`);
    
    for (const row of result.rows) {
      const time = new Date(Number(row.created_at)).toLocaleString('zh-CN');
      console.log(`ID: ${row.id}`);
      console.log(`时间: ${time}`);
      console.log(`姿势: ${row.pose_label}`);
      console.log(`背景: ${row.bg_label}`);
      console.log(`图片URL: ${row.image_url}`);
      console.log('---');
      
      // 检查图片是否有Logo（下载并检查）
      if (row.image_url) {
        console.log('检查图片内容...');
        try {
          const response = await fetch(row.image_url);
          const buffer = await response.arrayBuffer();
          console.log(`- 图片大小: ${buffer.byteLength} bytes`);
          
          // 使用Sharp检查图片元数据
          const { default: sharp } = await import('sharp');
          const meta = await sharp(Buffer.from(buffer)).metadata();
          console.log(`- 图片尺寸: ${meta.width}x${meta.height}`);
          console.log(`- 格式: ${meta.format}`);
          console.log(`- 是否有alpha通道: ${meta.hasAlpha ? '是' : '否'}`);
        } catch (err) {
          console.log(`- 图片检查失败: ${err.message}`);
        }
      }
      console.log('\n');
    }
    
    await pool.end();
  } catch (err) {
    console.error('查询失败:', err.message);
    process.exit(1);
  }
}

check();
