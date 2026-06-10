/**
 * 检查所有 Skill 的 Schema 参数与模板使用的一致性
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.join(__dirname, '..', 'skills');

interface SkillCheckResult {
  skillCode: string;
  schemaParams: string[];
  templateVars: string[];
  unusedInTemplate: string[];  // schema定义但模板未使用
  undefinedInSchema: string[]; // 模板使用但schema未定义
  hasTemplate: boolean;
  templateFile: string | null;
}

/**
 * 从 schema.ts 文件提取参数名
 */
function extractSchemaParams(schemaContent: string): string[] {
  const params: string[] = [];

  // 匹配 z.object({...}) 中的字段定义
  // 常见模式: fieldName: z.string() 或 fieldName: z.object({...})

  // 方法1：匹配行首带字段名的定义
  const linePattern = /^\s+(\w+)\s*:\s*z\./gm;
  let match;
  while ((match = linePattern.exec(schemaContent)) !== null) {
    if (match[1] !== 'inputSchema' && match[1] !== 'outputSchema') {
      params.push(match[1]);
    }
  }

  // 方法2：匹配对象字面量中的字段（如 nested object）
  const nestedPattern = /z\.object\(\{([^}]+)\}\)/g;
  while ((match = nestedPattern.exec(schemaContent)) !== null) {
    const body = match[1];
    const fieldPattern = /(\w+)\s*:\s*z\./g;
    let fieldMatch;
    while ((fieldMatch = fieldPattern.exec(body)) !== null) {
      if (!params.includes(fieldMatch[1]) && fieldMatch[1] !== 'inputSchema') {
        params.push(fieldMatch[1]);
      }
    }
  }

  return params.sort();
}

/**
 * 从模板文件提取变量名
 * 支持 Handlebars {{var}} 和 Markdown {{var}} 格式
 */
function extractTemplateVars(templateContent: string): string[] {
  const vars: string[] = [];

  // 匹配 {{variable}} 格式
  // 包括 {{#each xxx}}, {{#if xxx}}, {{xxx}}, {{{xxx}}}
  const patterns = [
    /\{\{#each\s+(\w+)\}\}/g,           // {{#each items}}
    /\{\{#if\s+(\w+)\}\}/g,              // {{#if roleContext}}
    /\{\{(\w+)(?:\.\w+)*\}\}/g,          // {{targetCardCount}} 或 {{roleContext.gender}}
    /\{\{\{(\w+)(?:\.\w+)*\}\}\}/g,      // {{{variable}}}
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(templateContent)) !== null) {
      const varName = match[1];
      // 过滤 Handlebars 关键字和内置变量
      const handlebarsKeywords = ['else', 'this', '@index', '@first', '@last', 'unless', 'with', 'partial'];
      if (!handlebarsKeywords.includes(varName) && !vars.includes(varName)) {
        vars.push(varName);
      }
    }
  }

  return vars.sort();
}

/**
 * 检查单个 Skill
 */
function checkSkill(skillDir: string): SkillCheckResult {
  const skillCode = path.basename(skillDir);

  // 查找 schema.ts
  const schemaPath = path.join(skillDir, 'schema.ts');
  let schemaParams: string[] = [];

  if (fs.existsSync(schemaPath)) {
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    schemaParams = extractSchemaParams(schemaContent);
  }

  // 查找模板文件
  const userHbsPath = path.join(skillDir, 'user.hbs');
  const userMdPath = path.join(skillDir, 'user.md');

  let templateFile: string | null = null;
  let templateVars: string[] = [];

  if (fs.existsSync(userHbsPath)) {
    templateFile = 'user.hbs';
    const templateContent = fs.readFileSync(userHbsPath, 'utf-8');
    templateVars = extractTemplateVars(templateContent);
  } else if (fs.existsSync(userMdPath)) {
    templateFile = 'user.md';
    const templateContent = fs.readFileSync(userMdPath, 'utf-8');
    templateVars = extractTemplateVars(templateContent);
  }

  // 对比
  const unusedInTemplate = schemaParams.filter(p => !templateVars.includes(p));
  const undefinedInSchema = templateVars.filter(v => !schemaParams.includes(v));

  return {
    skillCode,
    schemaParams,
    templateVars,
    unusedInTemplate,
    undefinedInSchema,
    hasTemplate: templateFile !== null,
    templateFile,
  };
}

/**
 * 主函数
 */
function main() {
  const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('_') && d.name !== 'SKILLS_INDEX.md')
    .map(d => path.join(skillsDir, d.name));

  const results: SkillCheckResult[] = [];

  for (const skillDir of skillDirs) {
    const result = checkSkill(skillDir);
    results.push(result);
  }

  // 输出不一致的结果
  const issues = results.filter(r =>
    (r.unusedInTemplate.length > 0 || r.undefinedInSchema.length > 0) &&
    r.schemaParams.length > 0
  );

  console.log(`\n=== Schema 参数与模板一致性检查 ===\n`);
  console.log(`总 Skills: ${results.length}`);
  console.log(`有 Schema: ${results.filter(r => r.schemaParams.length > 0).length}`);
  console.log(`有模板: ${results.filter(r => r.hasTemplate).length}`);
  console.log(`存在问题: ${issues.length}\n`);

  if (issues.length > 0) {
    console.log(`=== 问题详情 ===\n`);

    for (const issue of issues) {
      console.log(`【${issue.skillCode}】`);
      console.log(`  模板: ${issue.templateFile || '无'}`);

      if (issue.unusedInTemplate.length > 0) {
        console.log(`  ⚠️ Schema 定义但模板未使用: ${issue.unusedInTemplate.join(', ')}`);
      }

      if (issue.undefinedInSchema.length > 0) {
        console.log(`  ⚠️ 模板使用但 Schema 未定义: ${issue.undefinedInSchema.join(', ')}`);
      }

      console.log(``);
    }
  }

  // 输出 JSON 格式供后续处理
  const outputPath = path.join(__dirname, 'schema-template-check-result.json');
  fs.writeFileSync(outputPath, JSON.stringify(issues, null, 2));
  console.log(`\n结果已保存到: ${outputPath}`);
}

main();