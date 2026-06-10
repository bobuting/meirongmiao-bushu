import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgres://gitlab:password@101.37.80.207:5432/neirongmiao',
  ssl: false
});

async function check() {
  try {
    // 检查执行日志重复
    const logs = await pool.query(`
      SELECT type, status, DATE(started_at) as date, COUNT(*) as count
      FROM nrm_square_execution_logs
      WHERE type = 'discovery' AND status = 'success'
      GROUP BY type, status, DATE(started_at)
      ORDER BY date DESC
      LIMIT 10
    `);
    console.log('\n执行日志重复情况:');
    console.table(logs.rows);

    // 检查达人重复
    const creators = await pool.query(`
      SELECT sec_uid, nickname, COUNT(*) as count
      FROM nrm_square_creator_targets
      WHERE source = 'discovery'
      GROUP BY sec_uid, nickname
      HAVING COUNT(*) > 1
      LIMIT 10
    `);
    console.log('\n达人重复情况:');
    console.table(creators.rows);

    // 检查 square 相关表
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name LIKE '%square%'
      ORDER BY table_name
    `);
    console.log('\n创作广场相关表:', tables.rows.map(r => r.table_name).join(', '));

    // 检查最近一次执行详情
    const lastExec = await pool.query(`
      SELECT id, type, status, summary, started_at, completed_at
      FROM nrm_square_execution_logs
      WHERE type = 'discovery'
      ORDER BY started_at DESC
      LIMIT 5
    `);
    console.log('\n最近5次执行:');
    console.table(lastExec.rows);

    await pool.end();
  } catch (error) {
    console.error('查询失败:', error.message);
    await pool.end();
    process.exit(1);
  }
}

check();