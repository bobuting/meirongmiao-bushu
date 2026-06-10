/**
 * nrm_provider_policies 表迁移脚本
 * 1. 添加 description 和 functional_key 字段
 * 2. 插入缺失的 routeKey
 * 3. 软删除旧版 routeKey
 */

require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. 添加新字段
    console.log('Adding new columns...');
    await client.query(`
      ALTER TABLE nrm_provider_policies
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS functional_key TEXT
    `);

    // 2. 更新现有记录的 functional_key 和 description
    console.log('Updating existing records...');

    const updates = [
      { route_key: 'hot_trend_video_reverse', functional_key: 'video_to_text', description: '热榜视频反推' },
      { route_key: 'square_video_reverse', functional_key: 'video_to_text', description: '广场视频反推' },
      { route_key: 'step1_fashion_search', functional_key: 'video_to_text', description: 'Step1 服饰搜索 LLM 增强' },
      { route_key: 'step3_script_generation', functional_key: 'text_to_text', description: 'Step3 脚本生成' },
      { route_key: 'image_generation', functional_key: 'text_to_image', description: '能力实验室 - 图像生成测试' },
      { route_key: 'video_generation', functional_key: 'text_to_video', description: '能力实验室 - 视频生成测试' },
    ];

    for (const u of updates) {
      await client.query(
        'UPDATE nrm_provider_policies SET functional_key = $1, description = $2 WHERE route_key = $3',
        [u.functional_key, u.description, u.route_key]
      );
    }

    // 3. 获取已存在的 provider_id
    const llmResult = await client.query('SELECT primary_provider_id FROM nrm_provider_policies WHERE route_key = $1', ['step3_script_generation']);
    const llmProviderId = llmResult.rows[0]?.primary_provider_id;

    const imageResult = await client.query('SELECT primary_provider_id FROM nrm_provider_policies WHERE route_key = $1', ['image_generation']);
    const imageProviderId = imageResult.rows[0]?.primary_provider_id;

    const videoResult = await client.query('SELECT primary_provider_id FROM nrm_provider_policies WHERE route_key = $1', ['video_generation']);
    const videoProviderId = videoResult.rows[0]?.primary_provider_id;

    console.log('Provider IDs:', { llmProviderId, imageProviderId, videoProviderId });

    // 4. 插入缺失的 routeKey
    console.log('Inserting missing routeKeys...');
    const now = Date.now();

    const newRouteKeys = [
      { route_key: 'step1_fashion_analysis', functional_key: 'video_to_text', description: 'Step1 服饰分析', provider_id: llmProviderId },
      { route_key: 'step1_role_preset', functional_key: 'text_to_image', description: 'Step1 角色预设生成', provider_id: imageProviderId },
      { route_key: 'step2_five_view_generation', functional_key: 'text_to_image', description: 'Step2 五视图生成', provider_id: imageProviderId },
      { route_key: 'step3_storyboard_image', functional_key: 'text_to_image', description: 'Step3 分镜图生成', provider_id: imageProviderId },
      { route_key: 'step4_storyboard_video', functional_key: 'text_to_video', description: 'Step4 分镜视频生成', provider_id: videoProviderId },
      { route_key: 'step5_video_generation', functional_key: 'text_to_video', description: 'Step5 成片生成', provider_id: videoProviderId },
      { route_key: 'library_portrait_detect', functional_key: 'image_to_text', description: '库管理 - 人像检测', provider_id: llmProviderId },
      { route_key: 'text_generation', functional_key: 'text_to_text', description: '能力实验室 - 文本生成测试', provider_id: llmProviderId },
    ];

    for (const item of newRouteKeys) {
      if (item.provider_id) {
        // 检查是否已存在
        const exists = await client.query('SELECT id FROM nrm_provider_policies WHERE route_key = $1', [item.route_key]);
        if (exists.rows.length === 0) {
          await client.query(`
            INSERT INTO nrm_provider_policies (id, route_key, primary_provider_id, fallback_provider_ids, timeout_ms, retry_count, enabled, updated_at, description, functional_key)
            VALUES ($1, $2, $3, '[]'::jsonb, 20000, 2, true, $4, $5, $6)
          `, [`${now}_${item.route_key}`, item.route_key, item.provider_id, now, item.description, item.functional_key]);
          console.log('  ✓ Inserted:', item.route_key);
        } else {
          console.log('  - Already exists:', item.route_key);
        }
      } else {
        console.log('  ✗ Skipped:', item.route_key, '(no provider_id)');
      }
    }

    // 5. 处理旧版 routeKey - 软删除
    console.log('Soft deleting old routeKeys...');
    const oldKeys = ['image_to_image', 'text_to_image', 'step1_image_pick_polish'];
    for (const key of oldKeys) {
      const result = await client.query(
        'UPDATE nrm_provider_policies SET deleted_at = $1, deleted_by = $2 WHERE route_key = $3 AND deleted_at IS NULL',
        [now, 'migration_script', key]
      );
      console.log(`  ✓ Deleted ${key}: ${result.rowCount} rows`);
    }

    await client.query('COMMIT');
    console.log('\n✅ Migration completed successfully!');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', e.message);
    throw e;
  } finally {
    client.release();
  }
}

migrate()
  .then(() => pool.end())
  .catch(() => pool.end());