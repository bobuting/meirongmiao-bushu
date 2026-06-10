import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://gitlab:password@101.37.80.207:5432/neirongmiao', ssl: false });

pool.query(`SELECT error_code, error_message, created_at FROM nrm_error_logs WHERE api_path LIKE '%role-direction-from-garments%' ORDER BY created_at DESC LIMIT 3`)
  .then(r => { console.log(JSON.stringify(r.rows, null, 2)); pool.end(); })
  .catch(e => { console.error('Error:', e.message); pool.end(); });
