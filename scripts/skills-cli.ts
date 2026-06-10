#!/usr/bin/env node
/**
 * Skills CLI 工具
 *
 * 提供命令行接口管理和测试 Skills
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { SkillLoader } from '../src/services/skills/skill-loader.js';
import type { SharedRuleName } from '../src/services/skills/skill-types.js';
import fs from 'fs/promises';
import path from 'path';

const program = new Command();
const skillLoader = new SkillLoader();

program
  .name('skills-cli')
  .description('Skills 提示词管理 CLI 工具')
  .version('1.0.0');

// 命令 1: list - 列出所有 Skills
program
  .command('list')
  .description('列出所有可用的 Skills')
  .action(async () => {
    try {
      const skills = await skillLoader.listAll();
      console.log(chalk.bold(`\n找到 ${skills.length} 个 Skills:\n`));

      skills.forEach(skill => {
        console.log(chalk.cyan(`  ${skill.code}`) + chalk.gray(` - ${skill.name}`));
        console.log(chalk.gray(`    ${skill.description}`));
        if (skill.tags && skill.tags.length > 0) {
          console.log(chalk.yellow(`    标签: ${skill.tags.join(', ')}`));
        }
        console.log();
      });
    } catch (error) {
      console.error(chalk.red('✗ 加载失败:'), error);
      process.exit(1);
    }
  });

// 命令 2: info - 查看 Skill 详情
program
  .command('info <code>')
  .description('查看 Skill 详细信息')
  .action(async (code) => {
    try {
      const skill = await skillLoader.load(code);

      console.log(chalk.bold(`\n${skill.metadata.name} (${skill.metadata.code})`));
      console.log(chalk.gray(skill.metadata.description));
      console.log();

      console.log(chalk.bold('版本:'), skill.metadata.version);
      if (skill.metadata.author) {
        console.log(chalk.bold('作者:'), skill.metadata.author);
      }
      if (skill.metadata.tags) {
        console.log(chalk.bold('标签:'), skill.metadata.tags.join(', '));
      }
      console.log();

      console.log(chalk.bold('变体:'));
      skill.variants.forEach(variant => {
        const isDefault = variant.code === skill.defaultVariant;
        const marker = isDefault ? chalk.green('(默认)') : '';
        console.log(`  - ${variant.code} ${marker}`);
      });
      console.log();

      console.log(chalk.bold('Schema:'), skill.inputSchema ? chalk.green('✓') : chalk.gray('无'));
      console.log(chalk.bold('示例:'), skill.examples?.length || 0);
      console.log();
    } catch (error) {
      console.error(chalk.red('✗ 加载失败:'), error);
      process.exit(1);
    }
  });

// 命令 3: test - 测试 Skill
program
  .command('test <code>')
  .description('测试 Skill 渲染')
  .option('-i, --input <json>', '输入 JSON')
  .option('-f, --file <path>', '从文件读取输入')
  .option('-v, --variant <code>', '使用变体')
  .option('-e, --example <index>', '使用示例（索引从 0 开始）')
  .action(async (code, options) => {
    try {
      const skill = await skillLoader.load(code);
      let input = {};

      // 确定输入来源
      if (options.example !== undefined) {
        const exampleIndex = parseInt(options.example);
        if (!skill.examples || exampleIndex >= skill.examples.length) {
          console.error(chalk.red('✗ 示例索引无效'));
          process.exit(1);
        }
        input = skill.examples[exampleIndex].input;
        console.log(chalk.blue(`使用示例: ${skill.examples[exampleIndex].name}`));
      } else if (options.file) {
        const content = await fs.readFile(options.file, 'utf-8');
        input = JSON.parse(content);
      } else if (options.input) {
        input = JSON.parse(options.input);
      } else {
        console.error(chalk.red('✗ 请提供输入: -i, -f 或 -e'));
        process.exit(1);
      }

      // 验证输入
      const validation = skill.validateInput(input);
      if (!validation.valid) {
        console.error(chalk.red('✗ 输入验证失败:'));
        validation.errors?.forEach(err => console.error(chalk.red(`  - ${err}`)));
        process.exit(1);
      }

      // 渲染
      const { system, user } = await skill.render(input, options.variant);

      console.log(chalk.green('\n✓ 渲染成功\n'));
      console.log(chalk.bold('System Prompt:'));
      console.log(chalk.gray('─'.repeat(80)));
      console.log(system);
      console.log(chalk.gray('─'.repeat(80)));
      console.log();
      console.log(chalk.bold('User Prompt:'));
      console.log(chalk.gray('─'.repeat(80)));
      console.log(user);
      console.log(chalk.gray('─'.repeat(80)));
      console.log();
    } catch (error) {
      console.error(chalk.red('✗ 测试失败:'), error);
      process.exit(1);
    }
  });

// 命令 4: validate - 验证 Skill
program
  .command('validate <code>')
  .description('验证 Skill 完整性')
  .action(async (code) => {
    try {
      const skill = await skillLoader.load(code);

      console.log(chalk.bold(`\n验证 Skill: ${skill.metadata.name}`));
      console.log();

      let passed = 0;
      let failed = 0;

      // 检查元数据
      console.log(chalk.bold('元数据:'));
      if (skill.metadata.code && skill.metadata.name && skill.metadata.description) {
        console.log(chalk.green('  ✓ 元数据完整'));
        passed++;
      } else {
        console.log(chalk.red('  ✗ 元数据不完整'));
        failed++;
      }

      // 检查变体
      console.log(chalk.bold('变体:'));
      if (skill.variants.length > 0) {
        console.log(chalk.green(`  ✓ 找到 ${skill.variants.length} 个变体`));
        passed++;
      } else {
        console.log(chalk.red('  ✗ 没有变体'));
        failed++;
      }

      // 检查 Schema
      console.log(chalk.bold('Schema:'));
      if (skill.inputSchema) {
        console.log(chalk.green('  ✓ Schema 已定义'));
        passed++;
      } else {
        console.log(chalk.yellow('  ⚠ 没有 Schema（可选）'));
      }

      // 检查示例
      console.log(chalk.bold('示例:'));
      if (skill.examples && skill.examples.length > 0) {
        console.log(chalk.green(`  ✓ 找到 ${skill.examples.length} 个示例`));
        passed++;

        // 验证每个示例
        for (let i = 0; i < skill.examples.length; i++) {
          const example = skill.examples[i];
          const validation = skill.validateInput(example.input);
          if (validation.valid) {
            console.log(chalk.green(`    ✓ 示例 ${i}: ${example.name}`));
          } else {
            console.log(chalk.red(`    ✗ 示例 ${i}: ${example.name}`));
            validation.errors?.forEach(err => console.log(chalk.red(`      - ${err}`)));
            failed++;
          }
        }
      } else {
        console.log(chalk.yellow('  ⚠ 没有示例（可选）'));
      }

      console.log();
      console.log(chalk.bold('结果:'));
      console.log(chalk.green(`  通过: ${passed}`));
      if (failed > 0) {
        console.log(chalk.red(`  失败: ${failed}`));
        process.exit(1);
      } else {
        console.log(chalk.green('  ✓ 验证通过'));
      }
    } catch (error) {
      console.error(chalk.red('✗ 验证失败:'), error);
      process.exit(1);
    }
  });

// 命令 5: check - 检查所有 Skills 的 includes dependencies
program
  .command('check')
  .description('检查所有 Skills 的 includes dependencies 是否有效')
  .action(async () => {
    try {
      const skills = await skillLoader.listAll();
      console.log(chalk.bold(`\n检查 ${skills.length} 个 Skills 的 includes dependencies:\n`));

      let totalIssues = 0;
      const sharedRulesDir = path.join(process.cwd(), 'skills', '_shared', 'rules');

      for (const skill of skills) {
        const skillDetail = await skillLoader.load(skill.code);
        const includes = skillDetail.metadata.includes;

        if (!includes || !includes.rules || includes.rules.length === 0) {
          console.log(chalk.gray(`  ${skill.code}: 无 includes`));
          continue;
        }

        console.log(chalk.cyan(`  ${skill.code}:`));
        let skillIssues = 0;

        for (const ruleName of includes.rules) {
          const ruleFile = path.join(sharedRulesDir, `${ruleName}.md`);

          try {
            await fs.access(ruleFile);
            console.log(chalk.green(`    ✓ ${ruleName}`));
          } catch {
            console.log(chalk.red(`    ✗ ${ruleName} - 文件不存在: ${ruleFile}`));
            skillIssues++;
            totalIssues++;
          }
        }

        if (skillIssues > 0) {
          console.log(chalk.red(`    ⚠ ${skill.code} 有 ${skillIssues} 个缺失的 dependencies`));
        }
      }

      console.log();
      if (totalIssues > 0) {
        console.log(chalk.red(`✗ 发现 ${totalIssues} 个问题`));
        process.exit(1);
      } else {
        console.log(chalk.green('✓ 所有 includes dependencies 检查通过'));
      }
    } catch (error) {
      console.error(chalk.red('✗ 检查失败:'), error);
      process.exit(1);
    }
  });

// 命令 6: create - 创建新 Skill
program
  .command('create <code>')
  .description('创建新的 Skill 模板')
  .option('-n, --name <name>', 'Skill 名称')
  .option('-d, --description <desc>', 'Skill 描述')
  .action(async (code, options) => {
    try {
      const skillDir = `skills/${code}`;

      // 检查是否已存在
      try {
        await fs.access(skillDir);
        console.error(chalk.red(`✗ Skill ${code} 已存在`));
        process.exit(1);
      } catch {
        // 不存在，继续创建
      }

      // 创建目录
      await fs.mkdir(skillDir, { recursive: true });

      // 创建 SKILL.md
      const skillMd = `---
code: ${code}
name: ${options.name || code}
description: ${options.description || 'Skill 描述'}
version: 1.0.0
author: AI Team
tags:
createdAt: ${new Date().toISOString().split('T')[0]}
updatedAt: ${new Date().toISOString().split('T')[0]}
---

# ${options.name || code}

## 功能说明

TODO: 描述 Skill 的功能

## 输入参数

TODO: 列出输入参数

## 输出格式

TODO: 描述输出格式

## 使用示例

\`\`\`typescript
const skill = await skillLoader.load('${code}');
const result = skill.render({
  // TODO: 输入参数
});
\`\`\`
`;
      await fs.writeFile(`${skillDir}/SKILL.md`, skillMd);

      // 创建 system.hbs
      const systemHbs = `你是一位专业的 AI 助手。

你的任务是：
1. TODO: 任务描述

输出格式：
TODO: 输出格式要求
`;
      await fs.writeFile(`${skillDir}/system.hbs`, systemHbs);

      // 创建 user.hbs
      const userHbs = `请完成以下任务：

TODO: 用户提示词模板
`;
      await fs.writeFile(`${skillDir}/user.hbs`, userHbs);

      // 创建 schema.ts
      const schemaTs = `import { z } from 'zod';

export const inputSchema = z.object({
  // TODO: 定义输入 Schema
});

export type ${code.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}Input = z.infer<typeof inputSchema>;
`;
      await fs.writeFile(`${skillDir}/schema.ts`, schemaTs);

      // 创建 examples.json
      const examplesJson = `[
  {
    "name": "示例 1",
    "description": "TODO: 示例描述",
    "input": {
    }
  }
]
`;
      await fs.writeFile(`${skillDir}/examples.json`, examplesJson);

      console.log(chalk.green(`\n✓ Skill ${code} 创建成功`));
      console.log();
      console.log(chalk.bold('创建的文件:'));
      console.log(`  - ${skillDir}/SKILL.md`);
      console.log(`  - ${skillDir}/system.hbs`);
      console.log(`  - ${skillDir}/user.hbs`);
      console.log(`  - ${skillDir}/schema.ts`);
      console.log(`  - ${skillDir}/examples.json`);
      console.log();
      console.log(chalk.yellow('下一步:'));
      console.log('  1. 编辑 SKILL.md 完善元数据');
      console.log('  2. 编辑 schema.ts 定义输入 Schema');
      console.log('  3. 编辑 system.hbs 和 user.hbs 编写提示词模板');
      console.log('  4. 编辑 examples.json 添加示例');
      console.log(`  5. 运行 npm run skills:validate ${code} 验证`);
      console.log();
    } catch (error) {
      console.error(chalk.red('✗ 创建失败:'), error);
      process.exit(1);
    }
  });

program.parse();
