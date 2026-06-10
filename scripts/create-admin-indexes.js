import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const createIndexesSQL = `
-- ============================================
-- 异步任务查询优化
-- ============================================

-- 按项目 + 状态查询（项目详情页任务列表）
CREATE INDEX IF NOT EXISTS idx_async_jobs_project_status
ON nrm_async_jobs (project_id, status);

-- 按类型 + 状态查询（异常任务筛选）
CREATE INDEX IF NOT EXISTS idx_async_jobs_type_status
ON nrm_async_jobs (job_type, status);

-- ============================================
-- 项目列表查询优化
-- ============================================

-- 按状态 + 类型筛选
CREATE INDEX IF NOT EXISTS idx_projects_status_kind
ON nrm_projects (status, project_kind);

-- 按更新时间排序
CREATE INDEX IF NOT EXISTS idx_projects_updated_at
ON nrm_projects (updated_at DESC);

-- ============================================
-- 公司筛选优化
-- ============================================

-- 按公司名称筛选
CREATE INDEX IF NOT EXISTS idx_users_company_name
ON nrm_users (company_name);
`;

async function main() {
  try {
    await pool.query(createIndexesSQL);
    console.log('✅ 索引创建成功');

    const result = await pool.query(`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'idx_async_jobs_project_status',
          'idx_async_jobs_type_status',
          'idx_projects_status_kind',
          'idx_projects_updated_at',
          'idx_users_company_name'
        )
      ORDER BY indexname
    `);

    console.log('\n新创建的索引:');
    result.rows.forEach(row => console.log(`  ✓ ${row.indexname} (${row.tablename})`));

    await pool.end();
  } catch (error) {
    console.error('❌ 创建失败:', error.message);
    await pool.end();
    process.exit(1);
  }
}

main();
