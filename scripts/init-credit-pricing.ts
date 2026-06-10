/**
 * 初始化积分定价配置
 *
 * 运行方式：tsx scripts/init-credit-pricing.ts
 *
 * 定价策略：
 * - 简单 LLM 调用：1-2 积分（文本生成、分析类）
 * - 中等复杂度：3-5 积分（脚本生成、概念生成）
 * - 图片生成：5-10 积分（五视图、分镜图、模特图）
 * - 视频生成：10-20 积分（分镜视频、裂变视频）
 * - 测试功能：1 积分
 */

import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL || "postgres://gitlab:password@101.37.80.207:5432/neirongmiao";

/** RouteKey 定价配置 */
const PRICING_CONFIG: Array<{ routeKey: string; creditCost: number; description: string; category: string }> = [
  // === Step1 服饰上传 ===
  { routeKey: "step1_fashion_analysis", creditCost: 20, description: "服饰分析", category: "step1" },
  { routeKey: "step1_fashion_search", creditCost: 20, description: "服饰搜索 LLM 增强", category: "step1" },
  { routeKey: "step1_role_preset", creditCost: 20, description: "角色预设生成", category: "step1" },
  { routeKey: "image_project_step1_selling_points", creditCost: 20, description: "卖点提取（图片项目）", category: "step1" },

  // === Step2 定妆 ===
  { routeKey: "step2_five_view_generation_child", creditCost: 80, description: "五视图生成 - 儿童（≤17岁）", category: "step2" },
  { routeKey: "step2_five_view_generation_adult", creditCost: 80, description: "五视图生成 - 成人（≥18岁）", category: "step2" },

  // === Step3 脚本生成 ===
  { routeKey: "step3_realtime_script_generation", creditCost: 50, description: "实时热点脚本生成", category: "step3-script" },
  { routeKey: "step3_hot_deep_analysis", creditCost: 30, description: "热点深度分析", category: "step3-script" },
  { routeKey: "step3_storyboard_image", creditCost: 60, description: "分镜图生成", category: "step3-script" },
  { routeKey: "step3_storyboard_image_child", creditCost: 60, description: "分镜图生成 - 儿童（≤17岁）", category: "step3-script" },
  { routeKey: "step3_storyboard_image_adult", creditCost: 60, description: "分镜图生成 - 成人（≥18岁）", category: "step3-script" },
  { routeKey: "step3_storyboard_prompt", creditCost: 20, description: "分镜提示词工程", category: "step3-script" },
  { routeKey: "step3_custom_script_generation", creditCost: 50, description: "场景化种草脚本生成", category: "step3-script" },
  { routeKey: "step3_custom_script_concept", creditCost: 30, description: "场景化脚本概念生成", category: "step3-script" },
  { routeKey: "step3_fashion_script_generation", creditCost: 50, description: "时尚大片脚本生成", category: "step3-script" },
  { routeKey: "step3_fashion_script_concept", creditCost: 30, description: "时尚大片视觉概念生成", category: "step3-script" },
  { routeKey: "step3_emotion_archetype_generation", creditCost: 50, description: "情感原型脚本生成", category: "step3-script" },
  { routeKey: "step3_emotion_archetype_outline", creditCost: 30, description: "情感原型大纲生成", category: "step3-script" },
  { routeKey: "script_effectiveness_generation", creditCost: 50, description: "种草脚本生成", category: "step3-script" },
  { routeKey: "step3_aesthetic_script_generation", creditCost: 50, description: "生活美学脚本生成", category: "step3-script" },
  { routeKey: "step3_product_showcase_script_generation", creditCost: 50, description: "产品展示脚本生成", category: "step3-script" },
  { routeKey: "step3_product_showcase_script_concept", creditCost: 30, description: "产品展示视觉概念生成", category: "step3-script" },
  { routeKey: "step3_story_theme_concept", creditCost: 30, description: "主题叙事-主题构思", category: "step3-script" },
  { routeKey: "step3_story_theme_outline", creditCost: 30, description: "主题叙事-故事大纲", category: "step3-script" },
  { routeKey: "step3_story_theme_generation", creditCost: 50, description: "主题叙事-分镜展开", category: "step3-script" },
  { routeKey: "step3_resonance_story_concept", creditCost: 30, description: "共鸣故事-概念生成", category: "step3-script" },
  { routeKey: "step3_resonance_story_generation", creditCost: 50, description: "共鸣故事-分镜展开", category: "step3-script" },
  { routeKey: "step3_video_script_rewrite", creditCost: 30, description: "视频热榜脚本改写", category: "step3-script" },
  { routeKey: "step3_library_script_rewrite", creditCost: 30, description: "库脚本改写", category: "step3-script" },
  { routeKey: "step3_product_showcase_script_rewrite", creditCost: 30, description: "产品展示脚本改写", category: "step3-script" },

  // === 脚本质量与 Prompt 进化 ===
  { routeKey: "script_quality_scoring", creditCost: 20, description: "脚本质量评分", category: "quality" },
  { routeKey: "prompt_evolution_generation", creditCost: 20, description: "Prompt 进化提案生成", category: "quality" },

  // === 图片项目 ===
  { routeKey: "image_project_step3_model_photo", creditCost: 100, description: "模特图生成", category: "image-project" },
  { routeKey: "image_project_step3_model_plan", creditCost: 30, description: "模特图规划 - 成人", category: "image-project" },
  { routeKey: "image_project_step3_model_plan_child", creditCost: 30, description: "模特图规划 - 儿童", category: "image-project" },
  { routeKey: "image_project_step4_section_plan", creditCost: 30, description: "Section 规划", category: "image-project" },
  { routeKey: "image_project_step4_section_image", creditCost: 60, description: "Section 图片生成", category: "image-project" },
  { routeKey: "image_project_step4_long_image", creditCost: 300, description: "一键长图生成（万相营造商详长图 API）", category: "image-project" },

  // === Step4 分镜视频 ===
  { routeKey: "step4_clip_video_generation_child", creditCost: 150, description: "分镜视频生成 - 儿童（≤17岁）", category: "step4" },
  { routeKey: "step4_clip_video_generation_adult", creditCost: 150, description: "分镜视频生成 - 成人（≥18岁）", category: "step4" },
  { routeKey: "step4_video_export", creditCost: 50, description: "视频导出", category: "step4" },

  // === 裂变 ===
  { routeKey: "fission_video_generation_child", creditCost: 150, description: "裂变视频生成 - 儿童（≤17岁）", category: "fission" },
  { routeKey: "fission_video_generation_adult", creditCost: 150, description: "裂变视频生成 - 成人（≥18岁）", category: "fission" },
  { routeKey: "fission_story_generation", creditCost: 50, description: "裂变故事生成", category: "fission" },
  { routeKey: "fission_storyboard_prompt", creditCost: 20, description: "裂变分镜提示词工程", category: "fission" },
  { routeKey: "fission_storyboard_image_child", creditCost: 60, description: "裂变分镜图片生成 - 儿童（≤17岁）", category: "fission" },
  { routeKey: "fission_storyboard_image_adult", creditCost: 60, description: "裂变分镜图片生成 - 成人（≥18岁）", category: "fission" },

  // === 广场 ===
  { routeKey: "square_video_reverse", creditCost: 30, description: "广场反推", category: "square" },
  { routeKey: "square_creator_evaluation", creditCost: 20, description: "广场达人评估", category: "square" },

  // === 热榜 ===
  { routeKey: "hot_trend_video_reverse", creditCost: 30, description: "热榜反推", category: "hot-trend" },

  // === 库管理 ===
  { routeKey: "library_portrait_detect", creditCost: 10, description: "人像检测", category: "library" },
  { routeKey: "garment_flat_lay_generation", creditCost: 60, description: "服饰平铺图生成", category: "library" },

  // === 换装 ===
  { routeKey: "outfit_change_image_generation", creditCost: 80, description: "换装图片生成", category: "outfit-change" },
  { routeKey: "outfit_change_video_edit", creditCost: 150, description: "换装视频编辑", category: "outfit-change" },

  // === 音乐 ===
  { routeKey: "music_atmosphere_analysis", creditCost: 20, description: "音乐氛围分析", category: "music" },

  // === 特征提取 ===
  { routeKey: "aesthetic_feature_extraction", creditCost: 30, description: "审美特征提取", category: "feature-extraction" },
  { routeKey: "scene_feature_extraction", creditCost: 30, description: "场景特征提取", category: "feature-extraction" },
  { routeKey: "emotion_archetype_extraction", creditCost: 30, description: "情感原型提取", category: "feature-extraction" },

  // === 测试 ===
  { routeKey: "text_generation", creditCost: 10, description: "文本生成测试", category: "test" },
  { routeKey: "image_generation", creditCost: 10, description: "图片生成测试", category: "test" },
  { routeKey: "video_generation", creditCost: 10, description: "视频生成测试", category: "test" },
];

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log(`开始初始化积分定价，共 ${PRICING_CONFIG.length} 个 RouteKey`);

    const now = Date.now();
    let inserted = 0;
    let updated = 0;

    for (const config of PRICING_CONFIG) {
      // 检查是否已存在
      const existing = await pool.query(
        `SELECT route_key, credit_cost FROM nrm_credit_pricing WHERE route_key = $1`,
        [config.routeKey]
      );

      if (existing.rows.length > 0) {
        // 已存在，更新
        await pool.query(
          `UPDATE nrm_credit_pricing
           SET credit_cost = $2, description = $3, category = $4, is_active = true, updated_at = $5
           WHERE route_key = $1`,
          [config.routeKey, config.creditCost, config.description, config.category, now]
        );
        updated++;
      } else {
        // 不存在，插入
        await pool.query(
          `INSERT INTO nrm_credit_pricing (route_key, credit_cost, description, category, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, true, $5, $5)`,
          [config.routeKey, config.creditCost, config.description, config.category, now]
        );
        inserted++;
      }
    }

    console.log(`✅ 初始化完成：插入 ${inserted} 条，更新 ${updated} 条`);
  } catch (error) {
    console.error("❌ 初始化失败:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

main();