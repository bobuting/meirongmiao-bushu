/**
 * 数据迁移：将项目 projectData JSONB 中的 step4 视频数据
 * 迁移到 nrm_step4_video_scenes 表（一场景一行）
 *
 * 运行: node scripts/migrate-step4-video-scenes.cjs
 */

const { Pool } = require("pg");
const { randomUUID } = require("crypto");
require("dotenv").config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL 未设置");
  process.exit(1);
}

async function migrate() {
  const pool = new Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 15000 });

  try {
    // 查找有 step4 视频数据的记录
    const result = await pool.query(
      `SELECT id, project_id, user_id, project_data
       FROM nrm_project_workflow_states
       WHERE project_data IS NOT NULL
         AND (
           project_data ? 'step4SceneVariantsByScene'
           OR project_data ? 'clipStatuses'
         )
       ORDER BY updated_at DESC`
    );

    console.log(`找到 ${result.rows.length} 条需要迁移的记录\n`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of result.rows) {
      const projectId = row.project_id;
      const userId = row.user_id;
      const data = row.project_data;

      try {
        const sceneVariants = data.step4SceneVariantsByScene || {};
        const selectedIndices = data.step4SelectedVariantByScene || {};
        const clipStatuses = Array.isArray(data.clipStatuses) ? data.clipStatuses : [];

        const hasVariants = Object.keys(sceneVariants).length > 0;
        const hasClips = clipStatuses.length > 0;

        if (!hasVariants && !hasClips) {
          skipped++;
          continue;
        }

        // 按 sceneIndex 构建每行的数据
        const sceneMap = new Map();

        // 从 sceneVariants 收集
        for (const [key, urls] of Object.entries(sceneVariants)) {
          const idx = Number(key);
          if (Number.isInteger(idx) && idx >= 0) {
            sceneMap.set(idx, {
              sceneIndex: idx,
              variantUrls: Array.isArray(urls) ? urls : [],
              selectedIndex: Number(selectedIndices[key]) || 0,
            });
          }
        }

        // 从 clipStatuses 补充
        for (const clip of clipStatuses) {
          if (typeof clip.id !== "number") continue;
          const idx = clip.id;
          if (!sceneMap.has(idx)) {
            sceneMap.set(idx, {
              sceneIndex: idx,
              variantUrls: [],
              selectedIndex: 0,
            });
          }
          const scene = sceneMap.get(idx);
          scene.clipStatus = clip.status || "pending";
          scene.clipUrl = clip.url || null;
          scene.clipPrompt = clip.prompt || null;
          scene.clipProgress = Number(clip.progress) || 0;
        }

        const scenes = Array.from(sceneMap.values()).sort((a, b) => a.sceneIndex - b.sceneIndex);

        // 去重检查
        const existing = await pool.query(
          `SELECT scene_index FROM nrm_step4_video_scenes WHERE project_id = $1`,
          [projectId]
        );
        const existingSet = new Set(existing.rows.map(r => r.scene_index));
        const newScenes = scenes.filter(s => !existingSet.has(s.sceneIndex));

        if (newScenes.length === 0) {
          skipped++;
          continue;
        }

        const now = Date.now();
        for (const scene of newScenes) {
          await pool.query(
            `INSERT INTO nrm_step4_video_scenes (
               id, project_id, user_id, scene_index,
               variant_urls, selected_index,
               clip_status, clip_url, clip_prompt, clip_progress,
               created_at, updated_at
             ) VALUES ($1,$2,$3,$4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12)`,
            [
              randomUUID(),
              projectId,
              userId,
              scene.sceneIndex,
              JSON.stringify(scene.variantUrls),
              scene.selectedIndex,
              scene.clipStatus || "pending",
              scene.clipUrl,
              scene.clipPrompt,
              scene.clipProgress,
              now,
              now,
            ]
          );
        }

        migrated += newScenes.length;
        console.log(`  ✓ 项目 ${projectId.slice(0, 8)}... 迁移 ${newScenes.length} 个分镜`);
      } catch (err) {
        errors++;
        console.error(`  ✗ 项目 ${projectId.slice(0, 8)}... 失败: ${err.message}`);
      }
    }

    console.log(`\n迁移结果: 成功 ${migrated} 行, 跳过 ${skipped} 条, 失败 ${errors} 条`);
  } catch (err) {
    console.error("迁移失败:", err.message);
  } finally {
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error("未捕获错误:", err);
  process.exit(1);
});
