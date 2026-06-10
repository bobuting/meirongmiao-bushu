/**
 * Skills 测试 API 路由
 *
 * 提供 Skills 系统的测试和管理接口
 */

import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../core/app-context.js';
import { SkillLoader } from '../services/skills/skill-loader.js';
import path from 'node:path';

export interface SkillsTestDeps {
  skillLoader?: SkillLoader;
}

/**
 * 注册 Skills 测试路由
 */
export function registerSkillsTestRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: SkillsTestDeps = {}
) {
  const skillsDir = path.join(process.cwd(), 'skills');
  const skillLoader = deps.skillLoader || new SkillLoader(skillsDir);
  const prefix = '/skills-test';

  // 1. GET /skills-test - 列出所有 Skills
  app.get(prefix, async (request, reply) => {
    try {
      const skills = await skillLoader.listAll();
      return { success: true, skills };
    } catch (error) {
      app.log.error({ error }, 'Failed to list skills');
      return reply.status(500).send({
        success: false,
        error: 'Failed to list skills'
      });
    }
  });

  // 2. GET /skills-test/:code - 获取 Skill 详情
  app.get(`${prefix}/:code`, async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const skill = await skillLoader.load(code);

      return {
        success: true,
        skill: {
          metadata: skill.metadata,
          variants: skill.variants,
          defaultVariant: skill.defaultVariant,
          hasSchema: !!skill.inputSchema,
          exampleCount: skill.examples?.length || 0
        }
      };
    } catch (error) {
      app.log.error({ error }, 'Failed to load skill');
      return reply.status(404).send({
        success: false,
        error: 'Skill not found'
      });
    }
  });

  // 3. POST /skills-test/:code/render - 渲染提示词
  app.post(`${prefix}/:code/render`, async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const { variables, variantCode } = request.body as {
        variables: Record<string, unknown>;
        variantCode?: string;
      };

      const skill = await skillLoader.load(code);

      // 验证输入
      if (skill.inputSchema) {
        const validation = skill.validateInput(variables);
        if (!validation.valid) {
          return reply.status(400).send({
            success: false,
            error: 'Input validation failed',
            errors: validation.errors
          });
        }
      }

      // 渲染
      const prompts = await skill.render(variables, variantCode);

      return {
        success: true,
        prompts,
        variant: variantCode || skill.defaultVariant
      };
    } catch (error) {
      app.log.error({ error }, 'Failed to render skill');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to render skill'
      });
    }
  });

  // 4. GET /skills-test/:code/examples - 获取示例
  app.get(`${prefix}/:code/examples`, async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const skill = await skillLoader.load(code);

      return {
        success: true,
        examples: skill.examples || []
      };
    } catch (error) {
      app.log.error({ error }, 'Failed to load examples');
      return reply.status(404).send({
        success: false,
        error: 'Skill not found'
      });
    }
  });

  // 5. GET /skills-test/:code/schema - 获取 Schema
  app.get(`${prefix}/:code/schema`, async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const skill = await skillLoader.load(code);

      if (!skill.inputSchema) {
        return {
          success: true,
          hasSchema: false
        };
      }

      // 返回 Schema 的 JSON 表示
      return {
        success: true,
        hasSchema: true,
        schema: skill.inputSchema._def
      };
    } catch (error) {
      app.log.error({ error }, 'Failed to load schema');
      return reply.status(404).send({
        success: false,
        error: 'Skill not found'
      });
    }
  });

  // 6. GET /skills-test/stats - 获取缓存统计
  app.get(`${prefix}-stats`, async (request, reply) => {
    try {
      const stats = skillLoader.getCacheStats();
      return {
        success: true,
        stats
      };
    } catch (error) {
      app.log.error({ error }, 'Failed to get stats');
      return reply.status(500).send({
        success: false,
        error: 'Failed to get stats'
      });
    }
  });

  // 7. POST /skills-test/:code/validate - 验证输入
  app.post(`${prefix}/:code/validate`, async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const { variables } = request.body as { variables: Record<string, unknown> };

      const skill = await skillLoader.load(code);
      const validation = skill.validateInput(variables);

      return {
        success: true,
        validation
      };
    } catch (error) {
      app.log.error({ error }, 'Failed to validate input');
      return reply.status(404).send({
        success: false,
        error: 'Skill not found'
      });
    }
  });

  // 8. GET /skills-test/:code/variants - 获取变体列表
  app.get(`${prefix}/:code/variants`, async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const skill = await skillLoader.load(code);

      return {
        success: true,
        variants: skill.variants,
        defaultVariant: skill.defaultVariant
      };
    } catch (error) {
      app.log.error({ error }, 'Failed to load variants');
      return reply.status(404).send({
        success: false,
        error: 'Skill not found'
      });
    }
  });

  app.log.info('Skills test routes registered');
}
