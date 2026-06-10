/**
 * Skills 提示词管理系统 - 类型定义
 *
 * 定义 Skill 的核心类型、接口和元数据结构
 */

import { z } from 'zod';

// ============================================================================
// 共享规则类型定义
// ============================================================================

/**
 * 可用的共享规则名称
 *
 * 新增共享规则时需要在此处添加类型
 */
export type SharedRuleName =
  | 'shot-description'        // shot_description 字段生成规则
  | 'shot-breakdown-schema'   // shot_breakdown JSON 结构定义
  | 'continuity'              // 故事线连贯性规则
  | 'video-output-schema';    // 视频脚本完整输出格式（统一标准）

/**
 * Skill includes 配置
 *
 * 声明 Skill 依赖的共享规则
 */
export interface SkillIncludes {
  /** 共享规则名称列表 */
  rules?: SharedRuleName[];
}

// ============================================================================
// Skill 核心类型定义
// ============================================================================

/**
 * Skill 元数据（从 SKILL.md frontmatter 解析）
 */
export interface SkillMetadata {
  /** Skill 唯一标识符 */
  code: string;
  /** Skill 名称 */
  name: string;
  /** Skill 描述 */
  description: string;
  /** Skill 版本号 */
  version: string;
  /** 作者 */
  author?: string;
  /** 分类 */
  category?: string;
  /** 标签 */
  tags?: string[];
  /** 创建时间 */
  createdAt?: string;
  /** 更新时间 */
  updatedAt?: string;
  /** 共享规则依赖 */
  includes?: SkillIncludes;
}

/**
 * Skill 变体定义
 */
export interface SkillVariant {
  /** 变体代码 */
  code: string;
  /** 变体名称 */
  name: string;
  /** 变体描述 */
  description?: string;
  /** System Prompt 模板路径 */
  systemPrompt: string;
  /** User Prompt 模板路径 */
  userPrompt: string;
}

/**
 * Skill 示例
 */
export interface SkillExample {
  /** 示例名称 */
  name: string;
  /** 示例描述 */
  description?: string;
  /** 输入变量 */
  input: Record<string, any>;
  /** 期望输出（可选） */
  expectedOutput?: string;
}

/**
 * Skill 完整定义
 */
export interface Skill {
  /** 元数据 */
  metadata: SkillMetadata;

  /** 输入 Schema（Zod） */
  inputSchema?: z.ZodType<any>;

  /** 变体列表 */
  variants: SkillVariant[];

  /** 默认变体代码 */
  defaultVariant: string;

  /** 示例列表 */
  examples?: SkillExample[];

  /**
   * 渲染提示词
   * @param variables 输入变量
   * @param variantCode 变体代码（可选，默认使用 defaultVariant）
   * @returns 渲染后的 System 和 User Prompt
   */
  render(variables: Record<string, any>, variantCode?: string): Promise<{ system: string; user: string }>;

  /**
   * 验证输入
   * @param variables 输入变量
   * @returns 验证结果
   */
  validateInput(variables: Record<string, any>): { valid: boolean; errors?: string[] };
}

/**
 * Skill 加载选项
 */
export interface SkillLoadOptions {
  /** 是否使用缓存 */
  useCache?: boolean;
  /** 是否热重载（开发模式） */
  hotReload?: boolean;
}

/**
 * Skill 列表项（轻量级元数据）
 */
export interface SkillListItem {
  code: string;
  name: string;
  description: string;
  version: string;
  category?: string;
  tags?: string[];
}

/**
 * Skill 渲染结果
 */
export interface SkillRenderResult {
  system: string;
  user: string;
  variant: string;
  timestamp: number;
}

/**
 * Skill 验证结果
 */
export interface SkillValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 * Skill 版本历史记录
 */
export interface SkillVersion {
  /** 版本号 */
  version: string;
  /** 创建时间 */
  timestamp: number;
  /** 作者 */
  author?: string;
  /** 变更说明 */
  changeLog?: string;
  /** 是否为当前版本 */
  isCurrent?: boolean;
}

/**
 * Skill 版本详情（包含完整内容）
 */
export interface SkillVersionDetail extends SkillVersion {
  /** 元数据 */
  metadata: SkillMetadata;
  /** System Prompt */
  systemPrompt: string;
  /** User Prompt */
  userPrompt: string;
  /** Input Schema */
  inputSchema: string;
}
