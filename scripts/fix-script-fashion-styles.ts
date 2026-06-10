/**
 * 数据库脏数据修复脚本
 * 将 nrm_script_data.fashion_styles 中的 175 种脏数据映射到 25 种统一字典值
 *
 * 执行方式：
 * npx tsx scripts/fix-script-fashion-styles.ts
 */

import { Pool } from "pg";
import dotenv from "dotenv";
import { cleanDirtyStyle } from "../src/contant-config/script-style-mapping.js";
import { getLogger } from "../src/core/logger/index.js";

dotenv.config({ override: true });

const log = getLogger("fix-script-fashion-styles");

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
  });

  log.info("开始修复脚本数据库脏数据...");

  try {
    // 1. 查询所有需要修复的脚本
    const result = await pool.query(`
      SELECT id, title, fashion_styles
      FROM nrm_script_data
      WHERE fashion_styles IS NOT NULL
      ORDER BY updated_at DESC
    `);

    log.info(`查询到 ${result.rows.length} 条脚本需要处理`);

    // 2. 逐条修复
    let fixedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const row of result.rows) {
      const { id, title, fashion_styles } = row;

      try {
        // 解析 fashion_styles JSONB
        const styles = fashion_styles;
        if (!Array.isArray(styles) || styles.length === 0) {
          skippedCount++;
          continue;
        }

        // 清洗每个风格值
        const cleanedStyles = styles.map((item: { style?: string; fit_score?: number; reason?: string }) => {
          const originalStyle = item?.style;
          if (!originalStyle) {
            return item;
          }

          const cleanedStyle = cleanDirtyStyle(originalStyle);

          // 记录变化
          if (originalStyle !== cleanedStyle) {
            log.info(`[${id.substring(0, 8)}] "${originalStyle}" → "${cleanedStyle}"`);
          }

          return {
            ...item,
            style: cleanedStyle,
          };
        });

        // 检查是否有变化
        const hasChanges = styles.some((item: { style?: string }, index: number) => {
          return item?.style !== cleanedStyles[index]?.style;
        });

        if (!hasChanges) {
          skippedCount++;
          continue;
        }

        // 3. 更新数据库
        await pool.query(`
          UPDATE nrm_script_data
          SET fashion_styles = $1, updated_at = $2
          WHERE id = $3
        `, [JSON.stringify(cleanedStyles), Date.now(), id]);

        fixedCount++;
      } catch (err) {
        log.error({ err, scriptId: id }, `修复失败: ${title}`);
        errorCount++;
      }
    }

    log.info(`修复完成: 成功 ${fixedCount} 条, 跳过 ${skippedCount} 条, 失败 ${errorCount} 条`);

    // 4. 统计修复后的风格分布
    const statsResult = await pool.query(`
      SELECT
        jsonb_array_elements(fashion_styles)->>'style' as style,
        COUNT(*) as count
      FROM nrm_script_data
      WHERE fashion_styles IS NOT NULL
      GROUP BY style
      ORDER BY count DESC
      LIMIT 30
    `);

    log.info("修复后风格分布（前30）:");
    statsResult.rows.forEach(row => {
      log.info(`  ${row.style}: ${row.count}`);
    });

  } catch (err) {
    log.error({ err }, "修复脚本执行失败");
    throw err;
  } finally {
    pool.end();
  }
}

main().catch(err => {
  console.error("执行失败:", err);
  process.exit(1);
});