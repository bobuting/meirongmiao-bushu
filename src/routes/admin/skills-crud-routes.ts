/**
 * Skills CRUD 管理路由
 * 提供创建、更新、删除、导入导出等管理功能
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs/promises';
import { SkillLoader } from '../../services/skills/skill-loader.js';
import { SkillVersionManager } from '../../services/skills/version-manager.js';
import type { AppContext } from '../../core/app-context.js';
import { requireAdmin } from '../../services/auth/route-guards.js';
import { getLogger } from '../../core/logger/index.js';

const log = getLogger("skills-crud");

const SKILLS_DIR = path.join(process.cwd(), 'skills');

// Zod Schema 定义
const CreateSkillSchema = z.object({
  code: z.string().min(1).regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1),
  description: z.string(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  systemPrompt: z.string().min(1),
  userPrompt: z.string().min(1),
  inputSchema: z.string().optional(), // TypeScript 代码字符串
  examples: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    variables: z.record(z.string(), z.any()),
  })).optional(),
  includes: z.object({
    rules: z.array(z.string()).optional(),
  }).optional(),
});

const UpdateSkillSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  systemPrompt: z.string().optional(),
  userPrompt: z.string().optional(),
  inputSchema: z.string().optional(),
  examples: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    variables: z.record(z.string(), z.any()),
  })).optional(),
  author: z.string().optional(),
  changeLog: z.string().optional(),
  includes: z.object({
    rules: z.array(z.string()).optional(),
  }).optional(),
});

export async function registerSkillsCrudRoutes(app: FastifyInstance, ctx: AppContext) {
  // 所有 admin/skills 路由要求管理员权限
  app.addHook('preHandler', async (request) => {
    await requireAdmin(ctx, request);
  });

  const skillsDir = path.join(process.cwd(), 'skills');
  const loader = new SkillLoader(skillsDir);
  const versionManager = new SkillVersionManager();

  // 获取 Skills 列表
  app.get('/', async (request, reply) => {
    try {
      const { page = 1, pageSize = 20, search, category } = request.query as {
        page?: number;
        pageSize?: number;
        search?: string;
        category?: string;
      };

      let skills = await loader.listAll();

      // 搜索过滤
      if (search) {
        const searchLower = search.toLowerCase();
        skills = skills.filter(skill =>
          skill.code.toLowerCase().includes(searchLower) ||
          skill.name.toLowerCase().includes(searchLower) ||
          skill.description.toLowerCase().includes(searchLower)
        );
      }

      // 类别过滤
      if (category) {
        skills = skills.filter(skill => skill.category === category);
      }

      // 分页
      const total = skills.length;
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      const paginatedSkills = skills.slice(start, end);

      return {
        success: true,
        data: paginatedSkills,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    } catch (error) {
      app.log.error({ error }, 'Failed to list skills');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list skills',
      });
    }
  });

  // 获取版本历史列表（必须在 :code 路由之前）
  app.get('/:code/versions', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const skillPath = path.join(SKILLS_DIR, code);

      // 检查 Skill 是否存在
      try {
        await fs.access(skillPath);
      } catch {
        return reply.status(404).send({
          success: false,
          error: `Skill ${code} not found`,
        });
      }

      const versions = await versionManager.listVersions(skillPath);

      return {
        success: true,
        data: versions,
      };
    } catch (error) {
      app.log.error({ error }, 'Failed to list versions');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list versions',
      });
    }
  });

  // 获取特定版本详情（必须在 :code 路由之前）
  app.get('/:code/versions/:version', async (request, reply) => {
    try {
      const { code, version } = request.params as { code: string; version: string };
      const skillPath = path.join(SKILLS_DIR, code);

      // 检查 Skill 是否存在
      try {
        await fs.access(skillPath);
      } catch {
        return reply.status(404).send({
          success: false,
          error: `Skill ${code} not found`,
        });
      }

      const versionData = await versionManager.getVersion(skillPath, version);

      return {
        success: true,
        data: versionData,
      };
    } catch (error) {
      app.log.error({ error }, 'Failed to get version');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get version',
      });
    }
  });

  // 获取单个 Skill 详情
  app.get('/:code', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const skill = await loader.load(code);

      // 读取模板内容
      const skillPath = path.join(SKILLS_DIR, code);
      const systemPrompt = await fs.readFile(path.join(skillPath, 'system.hbs'), 'utf-8');
      const userPrompt = await fs.readFile(path.join(skillPath, 'user.hbs'), 'utf-8');

      // 读取 Schema（如果存在）
      let inputSchema = '';
      try {
        inputSchema = await fs.readFile(path.join(SKILLS_DIR, code, 'schema.ts'), 'utf-8');
      } catch {
        // Schema 不存在
      }

      // 读取 SKILL.md 原始内容（用于获取 includes ）
      const skillMdContent = await fs.readFile(path.join(skillPath, 'SKILL.md'), 'utf-8');

      return {
        success: true,
        data: {
          code: skill.metadata.code,
          name: skill.metadata.name,
          description: skill.metadata.description,
          category: (skill.metadata as any).category,
          tags: skill.metadata.tags,
          version: skill.metadata.version,
          author: skill.metadata.author,
          systemPrompt,
          userPrompt,
          inputSchema,
          examples: skill.examples,
          // 新增：共享规则依赖
          includes: skill.metadata.includes || { rules: [] },
          // 新增：共享模块依赖
          // 新增：原始 SKILL.md 内容（用于编辑）
          skillMdContent,
        },
      };
    } catch (error) {
      app.log.error({ error }, 'Failed to get skill');
      return reply.status(404).send({
        success: false,
        error: error instanceof Error ? error.message : 'Skill not found',
      });
    }
  });

  // 创建新 Skill
  app.post('/', async (request, reply) => {
    try {
      const body = CreateSkillSchema.parse(request.body);
      const skillPath = path.join(SKILLS_DIR, body.code);

      // 检查是否已存在
      try {
        await fs.access(skillPath);
        return reply.status(409).send({
          success: false,
          error: `Skill ${body.code} already exists`,
        });
      } catch {
        // 不存在，继续创建
      }

      // 创建目录
      await fs.mkdir(skillPath, { recursive: true });

      // 构建 SKILL.md frontmatter
      const frontmatterLines = [
        `code: ${body.code}`,
        `name: ${body.name}`,
        `description: ${body.description}`,
        `category: ${body.category || 'other'}`,
        `tags: ${JSON.stringify(body.tags || [])}`,
        `version: 1.0.0`,
        `author: system`,
        `defaultVariant: default`,
      ];

      // 添加 includes 配置
      if (body.includes?.rules?.length) {
        frontmatterLines.push(`includes:`);
        frontmatterLines.push(`  rules:`);
        for (const rule of body.includes.rules) {
          frontmatterLines.push(`    - ${rule}`);
        }
      }

      // 写入 SKILL.md
      const metadata = `---
${frontmatterLines.join('\n')}
---

# ${body.name}

${body.description}
`;
      await fs.writeFile(path.join(skillPath, 'SKILL.md'), metadata, 'utf-8');

      // 写入模板文件
      await fs.writeFile(path.join(skillPath, 'system.hbs'), body.systemPrompt, 'utf-8');
      await fs.writeFile(path.join(skillPath, 'user.hbs'), body.userPrompt, 'utf-8');

      // 写入 schema.ts（如果提供）
      if (body.inputSchema) {
        await fs.writeFile(path.join(skillPath, 'schema.ts'), body.inputSchema, 'utf-8');
      } else {
        // 默认 schema
        const defaultSchema = `import { z } from 'zod';

export const inputSchema = z.object({
  // 在此定义输入参数
});

export type InputVariables = z.infer<typeof inputSchema>;
`;
        await fs.writeFile(path.join(skillPath, 'schema.ts'), defaultSchema, 'utf-8');
      }

      // 写入 examples.json（如果提供）
      if (body.examples && body.examples.length > 0) {
        await fs.writeFile(
          path.join(skillPath, 'examples.json'),
          JSON.stringify(body.examples, null, 2),
          'utf-8'
        );
      }

      // 清除缓存
      loader.clearCache();

      return {
        success: true,
        data: { code: body.code, path: skillPath },
      };
    } catch (error) {
      app.log.error({ error }, 'Failed to create skill');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create skill',
      });
    }
  });

  // 更新 Skill
  app.put('/:code', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const body = UpdateSkillSchema.parse(request.body);
      const skillPath = path.join(SKILLS_DIR, code);

      // 检查是否存在
      try {
        await fs.access(skillPath);
      } catch {
        return reply.status(404).send({
          success: false,
          error: `Skill ${code} not found`,
        });
      }

      // 读取现有 metadata
      const metadataPath = path.join(skillPath, 'SKILL.md');
      const existingContent = await fs.readFile(metadataPath, 'utf-8');
      const frontmatterMatch = existingContent.match(/^---\n([\s\S]*?)\n---/);

      if (!frontmatterMatch) {
        return reply.status(500).send({
          success: false,
          error: 'Invalid SKILL.md format',
        });
      }

      // 解析现有 frontmatter
      const frontmatter: Record<string, any> = {};
      frontmatterMatch[1].split('\n').forEach(line => {
        const [key, ...valueParts] = line.split(':');
        if (key && valueParts.length > 0) {
          const value = valueParts.join(':').trim();
          try {
            frontmatter[key.trim()] = value.startsWith('[') ? JSON.parse(value) : value;
          } catch {
            frontmatter[key.trim()] = value;
          }
        }
      });

      // 保存当前版本到历史
      await versionManager.saveVersion(skillPath, {
        author: body.author,
        changeLog: body.changeLog,
      });

      // 更新 metadata
      if (body.name) frontmatter.name = body.name;
      if (body.description) frontmatter.description = body.description;
      if (body.category) frontmatter.category = body.category;
      if (body.tags) frontmatter.tags = JSON.stringify(body.tags);
      // 新增：更新 includes 配置
      if (body.includes) frontmatter.includes = body.includes;

      // 构建 frontmatter 字符串
      const frontmatterLines = [
        `code: ${frontmatter.code}`,
        `name: ${frontmatter.name}`,
        `description: ${frontmatter.description}`,
        `category: ${frontmatter.category || frontmatter.type || 'other'}`,
        `tags: ${typeof frontmatter.tags === 'string' ? frontmatter.tags : JSON.stringify(frontmatter.tags)}`,
        `version: ${frontmatter.version}`,
        `author: ${frontmatter.author}`,
        `defaultVariant: ${frontmatter.defaultVariant}`,
      ];

      // 添加 includes 配置
      if (frontmatter.includes?.rules?.length) {
        frontmatterLines.push(`includes:`);
        frontmatterLines.push(`  rules:`);
        for (const rule of frontmatter.includes.rules) {
          frontmatterLines.push(`    - ${rule}`);
        }
      }

      // 写入更新后的 SKILL.md
      const updatedMetadata = `---
${frontmatterLines.join('\n')}
---

# ${frontmatter.name}

${frontmatter.description}
`;
      await fs.writeFile(metadataPath, updatedMetadata, 'utf-8');

      // 更新模板文件
      if (body.systemPrompt) {
        await fs.writeFile(path.join(skillPath, 'system.hbs'), body.systemPrompt, 'utf-8');
      }
      if (body.userPrompt) {
        await fs.writeFile(path.join(skillPath, 'user.hbs'), body.userPrompt, 'utf-8');
      }

      // 更新 schema.ts
      if (body.inputSchema) {
        await fs.writeFile(path.join(skillPath, 'schema.ts'), body.inputSchema, 'utf-8');
      }

      // 更新 examples.json
      if (body.examples) {
        await fs.writeFile(
          path.join(skillPath, 'examples.json'),
          JSON.stringify(body.examples, null, 2),
          'utf-8'
        );
      }

      // 清除缓存
      loader.clearCache();

      return {
        success: true,
        data: { code, updated: true },
      };
    } catch (error) {
      app.log.error({ error }, 'Failed to update skill');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update skill',
      });
    }
  });

  // 删除 Skill
  app.delete('/:code', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const skillPath = path.join(SKILLS_DIR, code);

      // 检查是否存在
      try {
        await fs.access(skillPath);
      } catch {
        return reply.status(404).send({
          success: false,
          error: `Skill ${code} not found`,
        });
      }

      // 删除目录
      await fs.rm(skillPath, { recursive: true, force: true });

      // 清除缓存
      loader.clearCache();

      return {
        success: true,
        data: { code, deleted: true },
      };
    } catch (error) {
      app.log.error({ error }, 'Failed to delete skill');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete skill',
      });
    }
  });

  // 导出 Skill（返回 ZIP 或 JSON）
  app.get('/:code/export', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const skillPath = path.join(SKILLS_DIR, code);

      // 检查是否存在
      try {
        await fs.access(skillPath);
      } catch {
        return reply.status(404).send({
          success: false,
          error: `Skill ${code} not found`,
        });
      }

      // 读取所有文件
      const files: Record<string, string> = {};
      const entries = await fs.readdir(skillPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile()) {
          const content = await fs.readFile(path.join(skillPath, entry.name), 'utf-8');
          files[entry.name] = content;
        }
      }

      return {
        success: true,
        data: {
          code,
          files,
        },
      };
    } catch (error) {
      app.log.error({ error }, 'Failed to export skill');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to export skill',
      });
    }
  });

  // 导入 Skill
  app.post('/import', async (request, reply) => {
    try {
      const body = request.body as {
        code: string;
        files: Record<string, string>;
        overwrite?: boolean;
      };

      if (!body.code || !body.files) {
        return reply.status(400).send({
          success: false,
          error: 'Missing code or files',
        });
      }

      const skillPath = path.join(SKILLS_DIR, body.code);

      // 检查是否已存在
      try {
        await fs.access(skillPath);
        if (!body.overwrite) {
          return reply.status(409).send({
            success: false,
            error: `Skill ${body.code} already exists. Set overwrite=true to replace.`,
          });
        }
        // 删除现有目录
        await fs.rm(skillPath, { recursive: true, force: true });
      } catch {
        // 不存在，继续
      }

      // 创建目录
      await fs.mkdir(skillPath, { recursive: true });

      // 写入所有文件
      for (const [filename, content] of Object.entries(body.files)) {
        await fs.writeFile(path.join(skillPath, filename), content, 'utf-8');
      }

      // 清除缓存
      loader.clearCache();

      return {
        success: true,
        data: { code: body.code, imported: true },
      };
    } catch (error) {
      app.log.error({ error }, 'Failed to import skill');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import skill',
      });
    }
  });

  // 复制 Skill
  app.post('/:code/duplicate', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const { newCode } = request.body as { newCode: string };

      if (!newCode || !/^[a-z0-9_-]+$/.test(newCode)) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid newCode format',
        });
      }

      const sourcePath = path.join(SKILLS_DIR, code);
      const targetPath = path.join(SKILLS_DIR, newCode);

      // 检查源是否存在
      try {
        await fs.access(sourcePath);
      } catch {
        return reply.status(404).send({
          success: false,
          error: `Skill ${code} not found`,
        });
      }

      // 检查目标是否已存在
      try {
        await fs.access(targetPath);
        return reply.status(409).send({
          success: false,
          error: `Skill ${newCode} already exists`,
        });
      } catch {
        // 不存在，继续
      }

      // 复制目录
      await fs.cp(sourcePath, targetPath, { recursive: true });

      // 更新 SKILL.md 中的 code
      const metadataPath = path.join(targetPath, 'SKILL.md');
      let content = await fs.readFile(metadataPath, 'utf-8');
      content = content.replace(/^code: .+$/m, `code: ${newCode}`);
      await fs.writeFile(metadataPath, content, 'utf-8');

      // 清除缓存
      loader.clearCache();

      return {
        success: true,
        data: { code: newCode, duplicated: true },
      };
    } catch (error) {
      app.log.error({ error }, 'Failed to duplicate skill');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to duplicate skill',
      });
    }
  });

  // 回滚到指定版本（必须在 :code 路由之前）
  app.post('/:code/rollback', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      const { version } = request.body as { version: string };

      if (!version) {
        return reply.status(400).send({
          success: false,
          error: 'Version is required',
        });
      }

      const skillPath = path.join(SKILLS_DIR, code);

      // 检查 Skill 是否存在
      try {
        await fs.access(skillPath);
      } catch {
        return reply.status(404).send({
          success: false,
          error: `Skill ${code} not found`,
        });
      }

      // 回滚前先保存当前版本
      await versionManager.saveVersion(skillPath, {
        author: 'System',
        changeLog: `Auto-save before rollback to ${version}`,
      });

      // 执行回滚
      await versionManager.rollback(skillPath, version);

      // 清除缓存
      loader.clearCache();

      return {
        success: true,
        data: { code, version, rolledBack: true },
      };
    } catch (error) {
      app.log.error({ error }, 'Failed to rollback');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to rollback',
      });
    }
  });
}
