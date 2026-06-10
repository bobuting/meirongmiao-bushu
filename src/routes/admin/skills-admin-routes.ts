/**
 * Skills 系统管理路由
 *
 * 提供 Skills 系统的配置管理、监控和控制接口
 * 以及共享规则管理接口、系统配置接口（daemon 动态开关）
 */

import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  getSkillsStats,
  clearSkillsCache,
  getSkillsMetrics,
  resetSkillsMetrics,
} from '../../services/skills/index.js';
import type { ScriptQualityScoringDaemon } from '../../modules/script-quality/scoring-daemon.js';
import type { MetricsScheduler } from '../../modules/script-quality/metrics-scheduler.js';
import type { PromptEvolutionDaemon } from '../../modules/prompt-evolution/evolution-daemon.js';
import type { AppContext } from '../../core/app-context.js';
import { requireAdmin } from '../../services/auth/route-guards.js';
import { DEFAULT_SCORING_LOOP_CONFIG } from '../../contracts/business-config-contract.js';

const SKILLS_DIR = path.join(process.cwd(), 'skills');
const SHARED_RULES_DIR = path.join(SKILLS_DIR, '_shared', 'rules');
const SYSTEM_CONFIG_MODULE = 'skills_system';

/** 系统配置结构 */
interface SkillsSystemConfig {
  scoringDaemonEnabled: boolean;
  evolutionEnabled: boolean;
}

/** Skills 管理路由依赖 */
interface SkillsAdminDeps {
  scoringDaemon: ScriptQualityScoringDaemon;
  metricsScheduler: MetricsScheduler;
  evolutionDaemon: PromptEvolutionDaemon;
  pool: Pool;
  ctx: AppContext;
}

// ---------------------------------------------------------------------------
// 系统配置不一致性警告检测
// ---------------------------------------------------------------------------

function buildSystemWarnings(config: SkillsSystemConfig, ctx: AppContext): string[] {
  const warnings: string[] = [];
  const scoringLoop = ctx.businessConfigService.get("scoring_loop", DEFAULT_SCORING_LOOP_CONFIG);

  if (scoringLoop.enabled && !config.scoringDaemonEnabled) {
    warnings.push("评分闭环已启用，但评分守护进程未开启。闭环依赖评分数据，请先开启 scoring daemon 或调用 batch-score-existing 生成评分数据");
  }

  if (scoringLoop.deprecationThreshold > scoringLoop.minScoreForLibrary) {
    warnings.push(`阈值配置不合理：低分淘汰阈值(${scoringLoop.deprecationThreshold})高于库存筛选最低分(${scoringLoop.minScoreForLibrary})。正确的配置应为：deprecationThreshold < minScoreForLibrary`);
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// nrm_business_configs 读写
// ---------------------------------------------------------------------------

async function readSystemConfig(pool: Pool): Promise<SkillsSystemConfig | null> {
  const { createPgRepositories } = await import("../../repositories/pg/index.js");
  const repos = createPgRepositories(pool);
  const result = await repos.businessConfigs.get(SYSTEM_CONFIG_MODULE);
  return result as SkillsSystemConfig | null;
}

async function writeSystemConfig(pool: Pool, config: SkillsSystemConfig): Promise<void> {
  const { createPgRepositories } = await import("../../repositories/pg/index.js");
  const repos = createPgRepositories(pool);
  await repos.businessConfigs.upsert(SYSTEM_CONFIG_MODULE, config as unknown as Record<string, unknown>, 'Skills 系统配置（daemon 开关）');
}

// ---------------------------------------------------------------------------
// 路由注册
// ---------------------------------------------------------------------------

export async function registerSkillsAdminRoutes(
  app: FastifyInstance,
  deps: SkillsAdminDeps,
) {
  const { scoringDaemon, metricsScheduler, evolutionDaemon, ctx } = deps;

  // 所有 admin/skills 路由要求管理员权限
  app.addHook('preHandler', async (request) => {
    await requireAdmin(ctx, request);
  });

  /**
   * 获取 Skills 缓存统计
   */
  app.get('/cache-stats', async (request, reply) => {
    const stats = getSkillsStats();
    return reply.send({
      success: true,
      data: stats
    });
  });

  /**
   * 清空 Skills 缓存
   */
  app.post('/clear-cache', async (request, reply) => {
    clearSkillsCache();
    return reply.send({
      success: true,
      data: { cleared: true }
    });
  });

  /**
   * 获取 Skills 使用指标
   */
  app.get('/metrics', async (request, reply) => {
    const metrics = getSkillsMetrics();
    return reply.send({
      success: true,
      data: metrics
    });
  });

  /**
   * 重置 Skills 使用指标
   */
  app.post('/metrics/reset', async (request, reply) => {
    const cleared = resetSkillsMetrics();
    return reply.send({
      success: true,
      data: { reset: true, cleared }
    });
  });

  /**
   * 检查 Skill 是否存在
   */
  app.get('/check/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const { skillLoader } = await import('../../services/skills/index.js');
    let exists = false;
    try {
      await skillLoader.load(code);
      exists = true;
    } catch {
      exists = false;
    }

    return reply.send({
      success: true,
      data: {
        code,
        exists
      }
    });
  });

  /**
   * 获取完整的系统状态
   */
  app.get('/status', async (request, reply) => {
    const cacheStats = getSkillsStats();
    const metrics = getSkillsMetrics();

    return reply.send({
      success: true,
      data: {
        cache: cacheStats,
        metrics,
        timestamp: new Date().toISOString()
      }
    });
  });

  // ==================== 系统配置（daemon 动态开关） ====================

  /**
   * 获取系统配置 + 运行状态
   */
  app.get('/system-config', async (request, reply) => {
    try {
      const dbResult = await ctx.repos.businessConfigs.get(SYSTEM_CONFIG_MODULE);
      const dbConfig = dbResult as SkillsSystemConfig | null;

      // DB 无记录时取当前运行状态
      const config: SkillsSystemConfig = dbConfig ?? {
        scoringDaemonEnabled: scoringDaemon.running,
        evolutionEnabled: evolutionDaemon.running,
      };

      return reply.send({
        success: true,
        data: {
          config,
          runtime: {
            scoringDaemonRunning: scoringDaemon.running,
            evolutionRunning: evolutionDaemon.running,
          },
          scoringLoop: ctx.businessConfigService.get("scoring_loop", DEFAULT_SCORING_LOOP_CONFIG),
          warnings: buildSystemWarnings(config, ctx),
          metrics: getSkillsMetrics(),
          cache: getSkillsStats(),
        },
      });
    } catch (error) {
      app.log.error({ error }, 'Failed to get system config');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get system config',
      });
    }
  });

  /**
   * 更新系统配置 + 动态启停 daemon
   */
  app.put('/system-config', async (request, reply) => {
    try {
      const body = (request.body ?? {}) as Partial<SkillsSystemConfig>;

      // 读取当前配置
      const currentResult = await ctx.repos.businessConfigs.get(SYSTEM_CONFIG_MODULE);
      const current = currentResult as SkillsSystemConfig | null;
      const newConfig: SkillsSystemConfig = {
        scoringDaemonEnabled: body.scoringDaemonEnabled ?? current?.scoringDaemonEnabled ?? scoringDaemon.running,
        evolutionEnabled: body.evolutionEnabled ?? current?.evolutionEnabled ?? evolutionDaemon.running,
      };

      // 动态启停 scoring daemon
      if (newConfig.scoringDaemonEnabled && !scoringDaemon.running) {
        scoringDaemon.start();
        metricsScheduler.start();
      } else if (!newConfig.scoringDaemonEnabled && scoringDaemon.running) {
        scoringDaemon.stop();
        metricsScheduler.stop();
      }

      // 动态启停 evolution daemon
      if (newConfig.evolutionEnabled && !evolutionDaemon.running) {
        evolutionDaemon.start();
      } else if (!newConfig.evolutionEnabled && evolutionDaemon.running) {
        evolutionDaemon.stop();
      }

      // 持久化到 DB
      await ctx.repos.businessConfigs.upsert(SYSTEM_CONFIG_MODULE, newConfig as unknown as Record<string, unknown>, 'Skills 系统配置（daemon 开关）');

      app.log.info(newConfig, '[SkillsAdmin] system config updated');

      return reply.send({
        success: true,
        data: {
          config: newConfig,
          runtime: {
            scoringDaemonRunning: scoringDaemon.running,
            evolutionRunning: evolutionDaemon.running,
          },
          warnings: buildSystemWarnings(newConfig, ctx),
        },
      });
    } catch (error) {
      app.log.error({ error }, 'Failed to update system config');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update system config',
      });
    }
  });

  // ==================== 存量脚本批量评分 ====================

  /**
   * 触发存量脚本批量评分（冷启动使用）
   * 扫描所有未评分的 nrm_script_data（type != 1），为每条创建 quality_scoring 任务。
   * 最多处理 200 条，避免一次性过载。
   */
  app.post('/batch-score-existing', async (request, reply) => {
    try {
      const body = (request.body ?? {}) as { limit?: number; excludeType?: number };
      const limit = Math.min(body.limit ?? 200, 500);
      const excludeType = body.excludeType ?? 1;

      const now = Date.now();

      // 查询未评分的脚本（排除已评分的）
      const scripts = await ctx.repos.scriptData.findUnscored({ excludeType, limit });

      if (scripts.length === 0) {
        return reply.send({ success: true, data: { scanned: 0, queued: 0, message: '所有库存脚本已有评分' } });
      }

      // 从 DailyScoringScheduler 提取的推断逻辑
      function inferStrategy(type: number | null, source: string | null): string {
        if (type === 2) return 'library';
        if (type === 3) return 'video';
        if (type === 4) return 'realtime';
        if (type === 5) return 'effectiveness';
        if (type === 6) return 'custom';
        if (source?.includes('hot_trend') || source?.includes('realtime')) return 'realtime';
        if (source?.includes('effectiveness')) return 'effectiveness';
        if (source?.includes('fashion')) return 'fashion';
        return 'custom';
      }

      const { STRATEGY_PROMPT_CODE_MAP } = await import('../../modules/script-quality/scoring-types.js');

      let queued = 0;
      for (const script of scripts) {
        const strategy = inferStrategy(script.type as number | null, script.source as string | null);
        const input = {
          scriptDataId: script.id,
          strategy,
          projectId: null,
          userId: null,
          promptCode: STRATEGY_PROMPT_CODE_MAP[strategy as keyof typeof STRATEGY_PROMPT_CODE_MAP] ?? null,
          promptVersion: null,
          scriptContent: script.summary ?? script.theme ?? '',
          scriptTitle: script.title ?? null,
          scriptSummary: script.summary ?? null,
          videoType: script.video_type ?? null,
          videoStyle: script.video_style ?? null,
        };

        const jobId = `batch-score-${script.id}-${now}`;
        try {
          await ctx.repos.systemJobs.insertSystemJob({
            id: jobId,
            jobType: 'quality_scoring',
            input: input as unknown as Record<string, unknown>,
            now,
          });
          queued++;
        } catch (err) {
          app.log.warn({ err, scriptId: script.id }, '[SkillsAdmin] failed to create batch scoring job');
        }
      }

      app.log.info({ queued, scanned: scripts.length }, '[SkillsAdmin] batch scoring jobs created');

      return reply.send({
        success: true,
        data: {
          scanned: scripts.length,
          queued,
          message: `为 ${queued} 条未评分脚本创建了评分任务`,
        },
      });
    } catch (error) {
      app.log.error({ error }, 'Failed to batch score existing scripts');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to batch score existing scripts',
      });
    }
  });

  // ==================== 共享规则管理 ====================

  /**
   * 获取共享规则列表
   */
  app.get('/shared-rules', async (request, reply) => {
    try {
      // 确保目录存在
      try {
        await fs.access(SHARED_RULES_DIR);
      } catch {
        // 目录不存在，返回空列表
        return reply.send({
          success: true,
          data: []
        });
      }

      const entries = await fs.readdir(SHARED_RULES_DIR, { withFileTypes: true });
      const rules: Array<{ name: string; filename: string; description: string }> = [];

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

        const filePath = path.join(SHARED_RULES_DIR, entry.name);
        const content = await fs.readFile(filePath, 'utf-8');

        // 从文件内容提取描述（第一行标题或 frontmatter description）
        let description = '';
        const titleMatch = content.match(/^#\s+(.+)$/m);
        if (titleMatch) {
          description = titleMatch[1];
        } else {
          // 尝试从 frontmatter 提取
          const descMatch = content.match(/^description:\s*(.+)$/m);
          if (descMatch) {
            description = descMatch[1];
          }
        }

        rules.push({
          name: entry.name.replace('.md', ''),
          filename: entry.name,
          description: description.slice(0, 100) || '共享规则文件'
        });
      }

      return reply.send({
        success: true,
        data: rules
      });
    } catch (error) {
      app.log.error({ error }, 'Failed to list shared rules');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list shared rules'
      });
    }
  });

  /**
   * 获取共享规则内容
   */
  app.get('/shared-rules/:name', async (request, reply) => {
    try {
      const { name } = request.params as { name: string };
      const filePath = path.join(SHARED_RULES_DIR, `${name}.md`);

      try {
        await fs.access(filePath);
      } catch {
        return reply.status(404).send({
          success: false,
          error: `Shared rule "${name}" not found`
        });
      }

      const content = await fs.readFile(filePath, 'utf-8');

      return reply.send({
        success: true,
        data: {
          name,
          filename: `${name}.md`,
          content
        }
      });
    } catch (error) {
      app.log.error({ error }, 'Failed to get shared rule');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get shared rule'
      });
    }
  });

  /**
   * 创建共享规则
   */
  app.post('/shared-rules', async (request, reply) => {
    try {
      const body = request.body as { name: string; content: string };

      if (!body.name || !body.content) {
        return reply.status(400).send({
          success: false,
          error: 'name 和 content 参数必填'
        });
      }

      // 确保 name 只包含有效字符
      if (!/^[\w-]+$/.test(body.name)) {
        return reply.status(400).send({
          success: false,
          error: 'name 只能包含字母、数字、下划线和连字符'
        });
      }

      // 确保目录存在
      await fs.mkdir(SHARED_RULES_DIR, { recursive: true });

      const filePath = path.join(SHARED_RULES_DIR, `${body.name}.md`);

      // 检查是否已存在
      try {
        await fs.access(filePath);
        return reply.status(409).send({
          success: false,
          error: `Shared rule "${body.name}" already exists`
        });
      } catch {
        // 不存在，继续创建
      }

      await fs.writeFile(filePath, body.content, 'utf-8');

      return reply.send({
        success: true,
        data: { name: body.name, created: true }
      });
    } catch (error) {
      app.log.error({ error }, 'Failed to create shared rule');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create shared rule'
      });
    }
  });

  /**
   * 更新共享规则
   */
  app.put('/shared-rules/:name', async (request, reply) => {
    try {
      const { name } = request.params as { name: string };
      const body = request.body as { content: string };

      if (!body.content) {
        return reply.status(400).send({
          success: false,
          error: 'content 参数必填'
        });
      }

      const filePath = path.join(SHARED_RULES_DIR, `${name}.md`);

      try {
        await fs.access(filePath);
      } catch {
        return reply.status(404).send({
          success: false,
          error: `Shared rule "${name}" not found`
        });
      }

      await fs.writeFile(filePath, body.content, 'utf-8');

      return reply.send({
        success: true,
        data: { name, updated: true }
      });
    } catch (error) {
      app.log.error({ error }, 'Failed to update shared rule');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update shared rule'
      });
    }
  });

  /**
   * 删除共享规则
   */
  app.delete('/shared-rules/:name', async (request, reply) => {
    try {
      const { name } = request.params as { name: string };
      const filePath = path.join(SHARED_RULES_DIR, `${name}.md`);

      try {
        await fs.access(filePath);
      } catch {
        return reply.status(404).send({
          success: false,
          error: `Shared rule "${name}" not found`
        });
      }

      await fs.unlink(filePath);

      return reply.send({
        success: true,
        data: { name, deleted: true }
      });
    } catch (error) {
      app.log.error({ error }, 'Failed to delete shared rule');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete shared rule'
      });
    }
  });
}

/**
 * 导出读取函数供 setup-core.ts 启动时使用
 */
export { readSystemConfig, type SkillsSystemConfig };
