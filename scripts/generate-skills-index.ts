/**
 * Skills 汇总文档生成脚本
 * 
 * 运行方式：npm run skills:generate-index
 * 
 * 功能：
 * - 读取所有 skills 目录下的 SKILL.md 元数据
 * - 生成 skills/SKILLS_INDEX.md 汇总文档
 * - 包含每个 skill 的 code、name、description、category、tags
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILLS_DIR = path.join(__dirname, '../skills');

interface SkillMetadata {
  code: string;
  name: string;
  description: string;
  category?: string;
  tags?: string[];
  version?: string;
  author?: string;
}

/**
 * 解析 SKILL.md 的 frontmatter
 */
function parseSkillMd(filePath: string): SkillMetadata | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // 解析 YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      return null;
    }
    
    const frontmatter = frontmatterMatch[1];
    const metadata: SkillMetadata = {
      code: '',
      name: '',
      description: '',
    };
    
    // 解析每一行
    frontmatter.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();
      
      switch (key.trim()) {
        case 'code':
          metadata.code = value;
          break;
        case 'name':
          metadata.name = value;
          break;
        case 'description':
          metadata.description = value;
          break;
        case 'category':
          metadata.category = value;
          break;
        case 'tags':
          // 解析数组格式 [tag1, tag2]
          if (value.startsWith('[') && value.endsWith(']')) {
            metadata.tags = value
              .slice(1, -1)
              .split(',')
              .map(t => t.trim().replace(/'/g, '').replace(/"/g, ''))
              .filter(t => t.length > 0);
          }
          break;
        case 'version':
          metadata.version = value;
          break;
        case 'author':
          metadata.author = value;
          break;
      }
    });
    
    return metadata;
  } catch (error) {
    console.error(`解析失败: ${filePath}`, error);
    return null;
  }
}

/**
 * 获取所有 skills
 */
function getAllSkills(): SkillMetadata[] {
  const skills: SkillMetadata[] = [];
  
  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('_')) continue; // 跳过 _shared 目录
    
    const skillMdPath = path.join(SKILLS_DIR, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) continue;
    
    const metadata = parseSkillMd(skillMdPath);
    if (metadata) {
      skills.push(metadata);
    }
  }
  
  return skills.sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * 按类别分组 skills
 */
function groupByCategory(skills: SkillMetadata[]): Map<string, SkillMetadata[]> {
  const groups = new Map<string, SkillMetadata[]>();
  
  for (const skill of skills) {
    const category = skill.category || 'uncategorized';
    if (!groups.has(category)) {
      groups.set(category, []);
    }
    groups.get(category)!.push(skill);
  }
  
  return groups;
}

/**
 * 生成汇总文档
 */
function generateIndexDoc(skills: SkillMetadata[]): string {
  const now = new Date().toISOString().split('T')[0];
  const total = skills.length;
  
  const groups = groupByCategory(skills);
  
  let doc = `# Skills 汇总文档

> 📌 **重要提醒**：每次修改任何 Skill 后，必须运行 \`npm run skills:generate-index\` 更新此文档！

---

## 统计信息

| 指标 | 数值 |
|------|------|
| Skills 总数 | ${total} |
| 类别数量 | ${groups.size} |
| 更新日期 | ${now} |

---

## 目录

`;

  // 添加类别目录
  const categoryNames = Array.from(groups.keys()).sort();
  for (const category of categoryNames) {
    const count = groups.get(category)!.length;
    const anchor = category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    doc += `- [${category}](#${anchor}) (${count} 个)\n`;
  }
  
  doc += '\n---\n\n';
  
  // 添加每个类别的详细内容
  for (const category of categoryNames) {
    const categorySkills = groups.get(category)!;
    const anchor = category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    
    doc += `## ${category}\n\n`;
    doc += `| Code | 名称 | 描述 | 版本 | 标签 |\n`;
    doc += `|------|------|------|------|------|\n`;
    
    for (const skill of categorySkills) {
      const tagsStr = skill.tags && skill.tags.length > 0 
        ? skill.tags.map(t => `\`${t}\``).join(', ')
        : '-';
      const version = skill.version || '-';
      
      doc += `| ${skill.code} | ${skill.name} | ${skill.description || '-'} | ${version} | ${tagsStr} |\n`;
    }
    
    doc += '\n';
  }
  
  // 添加更新指南
  doc += `---

## 更新指南

### 何时更新此文档

以下情况必须运行更新命令：

- ✅ 新增 Skill
- ✅ 修改 Skill 元数据（SKILL.md）
- ✅ 修改 Skill 名称、描述、分类、标签
- ✅ 删除 Skill

以下情况**不需要**更新此文档：

- ❌ 修改 system.md/system.hbs 内容
- ❌ 修改 user.md/user.hbs 内容
- ❌ 修改 schema.ts
- ❌ 修改 examples.json

### 更新命令

\`\`\`bash
npm run skills:generate-index
\`\`\`

### 强制更新提醒

建议在以下场景添加强制更新检查：

1. **Git Pre-commit Hook**: 提交时检查 SKILL.md 变动，提醒更新汇总文档
2. **CI Pipeline**: PR 合并前检查汇总文档是否为最新版本
3. **定期审计**: 每周运行 \`npm run skills:check\` 检查一致性

---

## 快速查询

### 查看单个 Skill 详情

\`\`\`bash
npm run skills:info {skill-code}
\`\`\`

### 测试 Skill 渲染

\`\`\`bash
npm run skills:test {skill-code} -- -e 0
\`\`\`

### 验证 Skill 完整性

\`\`\`bash
npm run skills:validate {skill-code}
\`\`\`

---

*此文档由 \`scripts/generate-skills-index.ts\` 自动生成*
`;
  
  return doc;
}

// 主函数
function main() {
  console.log('正在扫描 skills 目录...');
  
  const skills = getAllSkills();
  console.log(`找到 ${skills.length} 个 Skills`);
  
  const doc = generateIndexDoc(skills);
  
  const outputPath = path.join(SKILLS_DIR, 'SKILLS_INDEX.md');
  fs.writeFileSync(outputPath, doc, 'utf-8');
  
  console.log(`✅ 汇总文档已生成: ${outputPath}`);
}

main();
