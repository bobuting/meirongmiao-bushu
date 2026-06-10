/**
 * 提示词迁移脚本：将 docs/prompts/ 中的提示词转换为 Skills 格式
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

interface PromptMetadata {
  id?: string;
  code: string;
  name: string;
  description?: string;
  type?: string;
  status?: string;
  version?: string;
}

/**
 * 解析提示词 MD 文件的 frontmatter
 */
function parseFrontmatter(content: string): { metadata: PromptMetadata; body: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    throw new Error('无法解析 frontmatter');
  }

  const [, frontmatterText, body] = match;
  const metadata: any = {};

  // 解析 YAML 格式的 frontmatter
  frontmatterText.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length > 0) {
      const value = valueParts.join(':').trim();
      metadata[key.trim()] = value;
    }
  });

  return { metadata: metadata as PromptMetadata, body: body.trim() };
}

/**
 * 拆分提示词内容为 system 和 user 部分
 */
function splitPromptContent(content: string): { systemPrompt: string; userPrompt: string } {
  const systemMarker = '---SYSTEM---';
  const userMarker = '---USER---';

  const systemIndex = content.indexOf(systemMarker);
  const userIndex = content.indexOf(userMarker);

  if (systemIndex !== -1 || userIndex !== -1) {
    // 有分隔符，按分隔符提取
    let systemPrompt = '';
    if (systemIndex !== -1) {
      const afterSystem = content.slice(systemIndex + systemMarker.length);
      const endOfSystem = userIndex > systemIndex ? userIndex - systemIndex - systemMarker.length : afterSystem.length;
      systemPrompt = afterSystem.slice(0, endOfSystem).trim();
    }

    let userPrompt = '';
    if (userIndex !== -1) {
      const afterUser = content.slice(userIndex + userMarker.length);
      userPrompt = afterUser.trim();
    }

    return { systemPrompt, userPrompt };
  }

  // 无分隔符，检查是否有 {{userPrompt}} 占位符
  if (content.includes('{{userPrompt}}')) {
    // 将 {{userPrompt}} 之前的内容作为 system，之后的作为 user
    const lines = content.split('\n');
    let splitIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('{{userPrompt}}')) {
        splitIndex = i;
        break;
      }
    }

    if (splitIndex !== -1) {
      const systemPrompt = lines.slice(0, splitIndex).join('\n').trim();
      const userPrompt = lines.slice(splitIndex).join('\n').trim();
      return { systemPrompt, userPrompt };
    }
  }

  // 无分隔符且无占位符，全部作为 system
  return { systemPrompt: content.trim(), userPrompt: '{{userPrompt}}' };
}

/**
 * 将单个提示词转换为 Skill
 */
function convertPromptToSkill(promptFile: string, outputDir: string): void {
  const content = readFileSync(promptFile, 'utf-8');
  const { metadata, body } = parseFrontmatter(content);

  // 创建 Skill 目录
  const skillDir = join(outputDir, metadata.code);
  if (!existsSync(skillDir)) {
    mkdirSync(skillDir, { recursive: true });
  }

  // 拆分 system 和 user 提示词
  const { systemPrompt, userPrompt } = splitPromptContent(body);

  // 创建 SKILL.md
  const skillMd = `---
code: ${metadata.code}
name: ${metadata.name}
description: ${metadata.description || ''}
category: ${metadata.type || 'general'}
tags: []
version: ${metadata.version || '1.0.0'}
author: system
defaultVariant: default
---

# ${metadata.name}

${metadata.description || ''}
`;
  writeFileSync(join(skillDir, 'SKILL.md'), skillMd);

  // 创建 system.md
  writeFileSync(join(skillDir, 'system.md'), systemPrompt);

  // 创建 user.md
  writeFileSync(join(skillDir, 'user.md'), userPrompt);

  console.log(`✅ 已转换: ${metadata.code}`);
}

/**
 * 批量转换所有提示词
 */
function migrateAllPrompts(): void {
  const promptsDir = join(process.cwd(), 'docs/prompts');
  const skillsDir = join(process.cwd(), 'skills');

  // 确保 skills 目录存在
  if (!existsSync(skillsDir)) {
    mkdirSync(skillsDir, { recursive: true });
  }

  // 读取所有提示词文件
  const files = readdirSync(promptsDir)
    .filter(f => f.endsWith('.md') && f !== 'README.md')
    .map(f => join(promptsDir, f));

  console.log(`\n开始迁移 ${files.length} 个提示词...\n`);

  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    try {
      convertPromptToSkill(file, skillsDir);
      successCount++;
    } catch (error) {
      console.error(`❌ 转换失败: ${file}`);
      console.error(`   错误: ${error instanceof Error ? error.message : String(error)}`);
      failCount++;
    }
  }

  console.log(`\n迁移完成！`);
  console.log(`✅ 成功: ${successCount}`);
  console.log(`❌ 失败: ${failCount}`);
}

// 执行迁移
migrateAllPrompts();
