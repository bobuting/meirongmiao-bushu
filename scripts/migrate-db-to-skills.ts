#!/usr/bin/env tsx
/**
 * 数据库提示词迁移到 Skills 系统
 *
 * 从数据库读取提示词，生成对应的 Skill 文件
 */

import 'dotenv/config';
import { Pool } from 'pg';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库配置
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

interface PromptTemplate {
  id: string;
  code: string;
  name: string;
  type: string;
  description: string;
  content: string;
  tags: string;
  current_version: string;
  status: string;
  created_at: number;
  updated_at: number;
}

/**
 * 从数据库获取所有已发布的提示词
 */
async function fetchPrompts(): Promise<PromptTemplate[]> {
  const result = await pool.query<PromptTemplate>(`
    SELECT
      id, code, name, type, description, content, tags,
      current_version, status, created_at, updated_at
    FROM nrm_prompt_templates
    WHERE status = 'published'
    ORDER BY code
  `);

  return result.rows;
}

/**
 * 解析提示词内容，分离 system 和 user 部分
 */
function parsePromptContent(content: string): { system: string; user: string } {
  const systemMarker = '---SYSTEM---';
  const userMarker = '---USER---';

  const systemIndex = content.indexOf(systemMarker);
  const userIndex = content.indexOf(userMarker);

  if (systemIndex !== -1 && userIndex !== -1) {
    const systemStart = systemIndex + systemMarker.length;
    const systemEnd = userIndex;
    const userStart = userIndex + userMarker.length;

    return {
      system: content.slice(systemStart, systemEnd).trim(),
      user: content.slice(userStart).trim()
    };
  }

  // 如果没有分隔符，尝试查找 {{userPrompt}} 占位符
  if (content.includes('{{userPrompt}}')) {
    const parts = content.split('{{userPrompt}}');
    return {
      system: parts[0].trim(),
      user: '{{userPrompt}}'
    };
  }

  // 默认全部作为 system
  return {
    system: content.trim(),
    user: '请严格按照要求执行'
  };
}

/**
 * 提取模板中的变量
 */
function extractVariables(content: string): string[] {
  const regex = /\{\{([^}]+)\}\}/g;
  const variables = new Set<string>();
  let match;

  while ((match = regex.exec(content)) !== null) {
    const varName = match[1].trim();
    // 排除 Handlebars 控制结构
    if (!varName.startsWith('#') && !varName.startsWith('/') && !varName.startsWith('else')) {
      variables.add(varName);
    }
  }

  return Array.from(variables);
}

/**
 * 生成 Schema 文件内容
 */
function generateSchema(variables: string[]): string {
  const fields = variables.map(v => {
    // 根据变量名推测类型
    if (v.toLowerCase().includes('count') || v.toLowerCase().includes('duration')) {
      return `  ${v}: z.number().optional(),`;
    } else if (v.toLowerCase().includes('is') || v.toLowerCase().includes('has')) {
      return `  ${v}: z.boolean().optional(),`;
    } else {
      return `  ${v}: z.string().optional(),`;
    }
  }).join('\n');

  return `import { z } from 'zod';

/**
 * 输入参数 Schema
 */
export const inputSchema = z.object({
${fields}
});

export type Input = z.infer<typeof inputSchema>;
`;
}

/**
 * 生成 SKILL.md 文件内容
 */
function generateSkillMd(prompt: PromptTemplate): string {
  const tags = prompt.type ? `  - ${prompt.type}` : '  - general';
  const createdAt = typeof prompt.created_at === 'string'
    ? prompt.created_at
    : new Date(prompt.created_at).toISOString();

  return `---
code: ${prompt.code}
name: ${prompt.name}
description: ${prompt.description || '无描述'}
version: ${prompt.current_version}
category: ${prompt.type || 'general'}
author: System
created: ${createdAt}
tags:
${tags}
---

# ${prompt.name}

${prompt.description || '无描述'}

## 使用场景

从数据库迁移的提示词。

## 输入参数

请参考 schema.ts 文件。

## 输出格式

根据提示词模板生成相应的输出。
`;
}

/**
 * 创建 Skill 目录和文件
 */
async function createSkill(prompt: PromptTemplate): Promise<void> {
  const skillDir = path.join(__dirname, '..', 'skills', prompt.code);

  // 创建目录
  await fs.mkdir(skillDir, { recursive: true });

  // 解析内容
  const { system, user } = parsePromptContent(prompt.content);
  const variables = extractVariables(prompt.content);

  // 生成文件
  await Promise.all([
    // SKILL.md
    fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      generateSkillMd(prompt)
    ),

    // system.hbs
    fs.writeFile(
      path.join(skillDir, 'system.hbs'),
      system
    ),

    // user.hbs
    fs.writeFile(
      path.join(skillDir, 'user.hbs'),
      user
    ),

    // schema.ts
    fs.writeFile(
      path.join(skillDir, 'schema.ts'),
      generateSchema(variables)
    ),

    // examples.json
    fs.writeFile(
      path.join(skillDir, 'examples.json'),
      JSON.stringify([
        {
          name: '示例 1',
          description: '基本使用示例',
          input: variables.reduce((acc, v) => {
            acc[v] = `示例${v}`;
            return acc;
          }, {} as Record<string, string>),
          expectedOutput: '根据提示词生成的输出'
        }
      ], null, 2)
    )
  ]);

  console.log(`✅ 创建 Skill: ${prompt.code}`);
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始迁移数据库提示词到 Skills 系统...\n');

  try {
    // 获取所有提示词
    const prompts = await fetchPrompts();
    console.log(`📊 找到 ${prompts.length} 个已发布的提示词\n`);

    // 迁移每个提示词
    let successCount = 0;
    let failCount = 0;

    for (const prompt of prompts) {
      try {
        await createSkill(prompt);
        successCount++;
      } catch (error) {
        console.error(`❌ 迁移失败: ${prompt.code}`, error);
        failCount++;
      }
    }

    console.log('\n📈 迁移统计:');
    console.log(`  成功: ${successCount}`);
    console.log(`  失败: ${failCount}`);
    console.log(`  总计: ${prompts.length}`);

    if (successCount === prompts.length) {
      console.log('\n✅ 所有提示词迁移成功！');
    } else {
      console.log('\n⚠️  部分提示词迁移失败，请检查错误日志');
    }

  } catch (error) {
    console.error('❌ 迁移过程出错:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// 运行
main().catch(console.error);
