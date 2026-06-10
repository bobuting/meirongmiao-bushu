/**
 * Skills 提示词管理系统 - Skill 加载器
 *
 * 负责从文件系统加载 Skill 定义，解析元数据、Schema、模板
 * 支持共享规则依赖（includes）
 */

import fs from 'fs/promises';
import path from 'path';
import Handlebars from 'handlebars';
import { z } from 'zod';
import type { Skill, SkillMetadata, SkillVariant, SkillExample, SkillListItem, SkillLoadOptions, SharedRuleName } from './skill-types.js';
import { SkillCache } from './skill-cache.js';
import { registerBuiltinHelpers } from './handlebars-helpers.js';
import { getLogger } from "../../core/logger/index.js";

const log = getLogger("skill-loader");

/**
 * Skill 加载器
 */
export class SkillLoader {
  private skillsDir: string;
  private cache: SkillCache;
  /** 共享规则缓存 */
  private sharedRulesCache: Map<SharedRuleName, string> = new Map();

  constructor(skillsDir = 'skills') {
    this.skillsDir = skillsDir;
    this.cache = new SkillCache({ maxSize: 50, ttl: 5 * 60 * 1000 });
    registerBuiltinHelpers();
  }

  /**
   * 列出所有可用的 Skills
   */
  async listAll(): Promise<SkillListItem[]> {
    const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
    const skills: SkillListItem[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('_')) continue; // 跳过 _shared 等目录

      const skillPath = path.join(this.skillsDir, entry.name);
      const metadataPath = path.join(skillPath, 'SKILL.md');

      try {
        const content = await fs.readFile(metadataPath, 'utf-8');
        const metadata = this.parseMetadata(content);
        skills.push({
          code: metadata.code,
          name: metadata.name,
          description: metadata.description,
          version: metadata.version,
          category: metadata.category,
          tags: metadata.tags
        });
      } catch (error) {
        log.warn({ entryName: entry.name, error }, "Failed to load skill metadata");
      }
    }

    return skills;
  }

  /**
   * 加载指定的 Skill
   */
  async load(code: string, options: SkillLoadOptions = {}): Promise<Skill> {
    const { useCache = true, hotReload = false } = options;

    // 开发模式下强制重新加载
    if (hotReload) {
      this.cache.delete(code);
    }

    // 尝试从缓存获取
    if (useCache) {
      const cached = this.cache.get(code);
      if (cached) return cached;
    }

    // 从文件系统加载
    const skillPath = path.join(this.skillsDir, code);
    const metadataPath = path.join(skillPath, 'SKILL.md');

    // 读取 SKILL.md
    const content = await fs.readFile(metadataPath, 'utf-8');
    const metadata = this.parseMetadata(content);

    // 加载共享规则（如果有 includes）
    let sharedRules: Record<string, string> = {};
    if (metadata.includes?.rules && metadata.includes.rules.length > 0) {
      sharedRules = await this.loadSharedRules(metadata.includes.rules, code);
    }

    // 加载 Schema（如果存在）
    let inputSchema: z.ZodType<any> | undefined;
    const schemaPath = path.join(skillPath, 'schema.ts');
    try {
      await fs.access(schemaPath);
      const schemaModule = await import(path.resolve(schemaPath));
      inputSchema = schemaModule.inputSchema;
    } catch {
      // Schema 文件不存在，跳过
    }

    // 加载变体
    const variants = await this.loadVariants(skillPath, metadata);

    // 加载示例
    const examples = await this.loadExamples(skillPath);

    // 构建 Skill 对象
    const skill: Skill = {
      metadata,
      inputSchema,
      variants,
      defaultVariant: variants[0]?.code || 'default',
      examples,
      render: (variables: Record<string, any>, variantCode?: string) => {
        return this.renderSkill(skill, variables, variantCode, sharedRules);
      },
      validateInput: (variables: Record<string, any>) => {
        return this.validateInput(skill, variables);
      }
    };

    // 缓存
    if (useCache) {
      this.cache.set(code, skill);
    }

    return skill;
  }

  /**
   * 解析 SKILL.md 的 frontmatter
   */
  private parseMetadata(content: string): SkillMetadata {
    // 统一换行符，处理 CRLF 和 LF
    const normalizedContent = content.replace(/\r\n/g, '\n');
    const frontmatterMatch = normalizedContent.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      throw new Error('Invalid SKILL.md: missing frontmatter');
    }

    const frontmatter = frontmatterMatch[1];
    const lines = frontmatter.split('\n');
    const metadata: Record<string, unknown> = {};
    const setNested = (key: string, sub: string, val: unknown) => {
      const obj = metadata[key];
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        (obj as Record<string, unknown>)[sub] = val;
      } else {
        metadata[key] = { [sub]: val };
      }
    };
    let currentKey: string | null = null;
    let currentArray: string[] = [];
    let inNestedBlock = false;
    let nestedKey: string | null = null;
    let nestedArray: string[] = [];

    for (const line of lines) {
      // 检查是否在嵌套块中（如 includes.rules）
      if (inNestedBlock && nestedKey) {
        const nestedItemMatch = line.match(/^\s+-\s+(.+)$/);
        if (nestedItemMatch) {
          nestedArray.push(nestedItemMatch[1].trim());
          continue;
        } else if (line.trim() === '' || !line.startsWith(' ')) {
          // 嵌套块结束
          setNested(currentKey!, nestedKey, nestedArray);
          inNestedBlock = false;
          nestedKey = null;
          nestedArray = [];
        }
      }

      // 检查是否是数组项（以 - 开头）
      const arrayItemMatch = line.match(/^\s*-\s+(.+)$/);
      if (arrayItemMatch && currentKey && !inNestedBlock) {
        currentArray.push(arrayItemMatch[1].trim());
        continue;
      }

      // 如果之前在解析数组，保存它
      if (currentKey && currentArray.length > 0 && !inNestedBlock) {
        metadata[currentKey] = currentArray;
        currentArray = [];
        currentKey = null;
      }

      // 解析键值对
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match) {
        const [, key, value] = match;
        if (value.trim()) {
          // 单行值
          if (key === 'tags') {
            metadata[key] = value.split(',').map(t => t.trim());
          } else {
            metadata[key] = value.trim();
          }
        } else {
          // 可能是数组或嵌套块的开始
          currentKey = key;
          // 检查下一行是否是嵌套块（如 rules:）
        }
      }

      // 检测嵌套块开始（如 includes: 下面的 rules:）
      const nestedMatch = line.match(/^\s+(\w+):\s*$/);
      if (nestedMatch && currentKey) {
        nestedKey = nestedMatch[1];
        inNestedBlock = true;
        nestedArray = [];
        if (!metadata[currentKey]) {
          metadata[currentKey] = {};
        }
      }
    }

    // 处理最后一个数组
    if (currentKey && currentArray.length > 0) {
      metadata[currentKey] = currentArray;
    }

    // 处理最后一个嵌套块
    if (inNestedBlock && nestedKey && currentKey) {
      setNested(currentKey, nestedKey, nestedArray);
    }

    // 确保 tags 存在
    if (!metadata.tags) {
      metadata.tags = [];
    }

    return metadata as unknown as SkillMetadata;
  }

  /**
   * 加载共享规则
   *
   * @param ruleNames 规则名称列表
   * @param skillCode 调用方 Skill 代码（用于错误信息）
   * @returns 规则名称到内容的映射（键转换为驼峰命名）
   * @throws 如果规则文件不存在
   */
  private async loadSharedRules(
    ruleNames: SharedRuleName[],
    skillCode: string
  ): Promise<Record<string, string>> {
    const rules: Record<string, string> = {};
    const rulesDir = path.join(this.skillsDir, '_shared', 'rules');

    for (const ruleName of ruleNames) {
      // 先检查缓存（使用原始名称）
      if (this.sharedRulesCache.has(ruleName)) {
        // 转换为驼峰命名作为键
        const camelCaseKey = this.toCamelCase(ruleName);
        rules[camelCaseKey] = this.sharedRulesCache.get(ruleName)!;
        continue;
      }

      // 从文件系统加载
      const rulePath = path.join(rulesDir, `${ruleName}.md`);
      try {
        const ruleContent = await fs.readFile(rulePath, 'utf-8');
        // 缓存使用原始名称
        this.sharedRulesCache.set(ruleName, ruleContent);
        // 返回对象使用驼峰命名作为键，便于模板引用
        const camelCaseKey = this.toCamelCase(ruleName);
        rules[camelCaseKey] = ruleContent;
      } catch (error) {
        throw new Error(
          `Skill "${skillCode}" requires shared rule "${ruleName}" but file not found at ${rulePath}`
        );
      }
    }

    return rules;
  }

  /**
   * 将 kebab-case 转换为 camelCase
   * 例如：video-output-schema → videoOutputSchema
   */
  private toCamelCase(str: string): string {
    return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * 查找模板文件，支持 .hbs 和 .md 两种扩展名
   * 优先查找 .hbs，不存在则回退到 .md
   */
  private async resolveTemplateFile(dir: string, baseName: string): Promise<string | null> {
    const hbsPath = path.join(dir, `${baseName}.hbs`);
    try {
      await fs.access(hbsPath);
      return hbsPath;
    } catch {
      // 回退到 .md
    }
    const mdPath = path.join(dir, `${baseName}.md`);
    try {
      await fs.access(mdPath);
      return mdPath;
    } catch {
      return null;
    }
  }

  /**
   * 加载变体
   */
  private async loadVariants(skillPath: string, metadata: SkillMetadata): Promise<SkillVariant[]> {
    const variantsPath = path.join(skillPath, 'variants');
    const variants: SkillVariant[] = [];

    try {
      const entries = await fs.readdir(variantsPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const variantPath = path.join(variantsPath, entry.name);
        const systemPath = await this.resolveTemplateFile(variantPath, 'system');
        const userPath = await this.resolveTemplateFile(variantPath, 'user');

        if (systemPath && userPath) {
          variants.push({
            code: entry.name,
            name: entry.name,
            systemPrompt: systemPath,
            userPrompt: userPath
          });
        } else {
          log.warn({ variantName: entry.name }, "Variant missing required files");
        }
      }
    } catch {
      // 没有 variants 目录，使用默认模板
      const systemPath = await this.resolveTemplateFile(skillPath, 'system');
      const userPath = await this.resolveTemplateFile(skillPath, 'user');

      if (systemPath && userPath) {
        variants.push({
          code: 'default',
          name: 'Default',
          systemPrompt: systemPath,
          userPrompt: userPath
        });
      } else {
        throw new Error(
          `Skill "${metadata.code}" missing template files: need system.(hbs|md) and user.(hbs|md) in ${skillPath}`
        );
      }
    }

    return variants;
  }

  /**
   * 加载示例
   */
  private async loadExamples(skillPath: string): Promise<SkillExample[]> {
    const examplesPath = path.join(skillPath, 'examples.json');

    try {
      const content = await fs.readFile(examplesPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  /**
   * 渲染 Skill
   */
  private async renderSkill(
    skill: Skill,
    variables: Record<string, any>,
    variantCode?: string,
    sharedRules?: Record<string, string>
  ): Promise<{ system: string; user: string }> {
    const variant = skill.variants.find(v => v.code === (variantCode || skill.defaultVariant));
    if (!variant) {
      throw new Error(`Variant not found: ${variantCode}`);
    }

    // 读取模板
    const systemTemplate = await fs.readFile(variant.systemPrompt, 'utf-8');
    const userTemplate = await fs.readFile(variant.userPrompt, 'utf-8');

    // 注册 Handlebars helpers
    Handlebars.registerHelper('json', (context: any) => {
      return JSON.stringify(context, null, 2);
    });

    // 编译并渲染（禁用 HTML 转义，保持 Markdown 格式）
    const systemCompiled = Handlebars.compile(systemTemplate, { noEscape: true });
    const userCompiled = Handlebars.compile(userTemplate, { noEscape: true });

    // 构建模板变量（注入共享规则）
    const templateVariables = {
      ...variables,
      sharedRules: sharedRules || {}
    };

    const system = systemCompiled(templateVariables);
    const user = userCompiled(templateVariables);

    return { system, user };
  }

  /**
   * 验证输入
   */
  private validateInput(skill: Skill, variables: Record<string, any>): { valid: boolean; errors?: string[] } {
    if (!skill.inputSchema) {
      return { valid: true };
    }

    try {
      skill.inputSchema.parse(variables);
      return { valid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        };
      }
      return { valid: false, errors: ['Unknown validation error'] };
    }
  }

  /**
   * 便捷方法：加载 + 校验 + 渲染一步到位
   *
   * 业务模块统一使用此方法获取提示词，无需分别调用 load + render
   *
   * @param code Skill code
   * @param params 参数对象，支持两种格式：
   *   - { variables: { ... } }（推荐，所有模块统一使用此格式）
   *   - { ... } 直接传入变量对象（兼容旧调用）
   */
  async render(code: string, params: Record<string, unknown>): Promise<{ system: string; user: string }> {
    const startTime = Date.now();

    const skill = await this.load(code);

    // 提取实际变量（兼容 { variables: {...} } 和直接传入 {...} 两种格式）
    const variables = ('variables' in params && typeof params.variables === 'object')
      ? params.variables as Record<string, unknown>
      : params;

    // Zod 运行时校验
    if (skill.inputSchema) {
      skill.inputSchema.parse(variables);
    }

    const result = await skill.render(variables);

    // 记录 metrics
    try {
      const { recordMetrics } = await import('./index.js');
      recordMetrics({ code, success: true, duration: Date.now() - startTime });
    } catch {
      // metrics 记录失败不影响主流程
    }

    return result;
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * 清空缓存
   */
  clearCache() {
    this.cache.clear();
    this.sharedRulesCache.clear();
  }
}
