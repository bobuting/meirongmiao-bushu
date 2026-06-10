import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgres://gitlab:password@101.37.80.207:5432/neirongmiao',
  ssl: false
});

async function checkVideos() {
  try {
    // 检查视频重复
    const videoDup = await pool.query(`
      SELECT sec_uid, aweme_id, COUNT(*) as count
      FROM nrm_square_discovered_videos
      GROUP BY sec_uid, aweme_id
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 20
    `);
    console.log('\n视频重复情况:');
    console.table(videoDup.rows);

    // 统计总体数据
    const stats = await pool.query(`
      SELECT
        COUNT(DISTINCT sec_uid) as unique_creators,
        COUNT(DISTINCT aweme_id) as unique_videos,
        COUNT(*) as total_records,
        SUM(CASE WHEN (SELECT COUNT(*) FROM nrm_square_discovered_videos v2 WHERE v2.aweme_id = v.aweme_id AND v2.sec_uid = v.sec_uid AND v2.id != v.id) > 0 THEN 1 ELSE 0 END) as duplicate_count
      FROM nrm_square_discovered_videos v
    `);
    console.log('\n视频总体统计:');
    console.table(stats.rows);

    // 查看最近的重复记录详情
    const recentDup = await pool.query(`
      SELECT id, sec_uid, aweme_id, created_at, status
      FROM nrm_square_discovered_videos
      WHERE aweme_id IN (
        SELECT aweme_id
        FROM nrm_square_discovered_videos
        GROUP BY sec_uid, aweme_id
        HAVING COUNT(*) > 1
        LIMIT 3
      )
      ORDER BY aweme_id, created_at DESC
      LIMIT 10
    `);
    console.log('\n重复视频详情:');
    console.table(recentDup.rows);

    await pool.end();
  } catch (error) {
    console.error('查询失败:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkVideos();