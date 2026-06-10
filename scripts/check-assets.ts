import pg from 'pg';
const { Pool } = pg;
const url = process.env.DATABASE_URL || 'postgres://gitlab:password@101.37.80.207:5432/neirongmiao';
const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 10000, ssl: false });

async function check() {
  // 1. 查询表名
  const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND (table_name LIKE '%asset%' OR table_name LIKE '%garment%' OR table_name LIKE '%error%')");
  console.log('相关表:', tables.rows.map((r: any) => r.table_name).join(', '));

  // 2. 查询最近错误日志
  const errors = await pool.query("SELECT error_code, error_message, api_path, created_at FROM nrm_error_logs WHERE api_path LIKE '%role-direction%' ORDER BY created_at DESC LIMIT 5");
  console.log('\n错误日志:', JSON.stringify(errors.rows, null, 2));

  // 3. 查询项目资产
  const assets = await pool.query("SELECT id, garment_asset_id, project_id FROM nrm_project_assets WHERE project_id = $1", ['420847a5-bcc4-4362-9d4a-49065ed8f287']);
  console.log('\n项目资产:', JSON.stringify(assets.rows, null, 2));

  pool.end();
}

check().catch(e => { console.error('Error:', e.message); pool.end(); });
