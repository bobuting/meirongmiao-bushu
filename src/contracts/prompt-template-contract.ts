/**
 * 提示词管理系统类型定义
 * 包含提示词模板、版本、调用日志等相关类型
 */

// 从共享字典 re-export 提示词类型
export { PROMPT_TYPE, PROMPT_TYPE_LABELS, PROMPT_TYPE_OPTIONS } from '../contant-config/shared_dict.js';
export type { PromptType } from '../contant-config/shared_dict.js';
import type { PromptType } from '../contant-config/shared_dict.js';

/**
 * 提示词状态枚举
 */
export type PromptStatus = 'draft' | 'published' | 'archived' | 'active';

/**
 * 变量类型枚举
 */
export type VariableType = 'string' | 'number' | 'boolean' | 'array' | 'object';

/**
 * 变量定义
 */
export interface VariableDefinition {
  type: VariableType;
  required: boolean;
  description?: string;
  default?: unknown;
  enum?: string[];
}

/**
 * 提示词模板
 */
export interface PromptTemplate {
  id: string;
  code: string;
  name: string;
  type: PromptType;
  description?: string;
  content: string;
  variables: Record<string, VariableDefinition>;
  status: PromptStatus;
  currentVersion: string;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  tags: string[];
}

/**
 * 提示词版本
 */
export interface PromptVersion {
  id: string;
  templateId: string;
  version: string;
  content: string;
  changeSummary?: string;
  variables: Record<string, VariableDefinition>;
  createdAt: number;
  createdBy?: string;
}

/**
 * 调用日志
 */
export interface PromptCallLog {
  id: string;
  templateId?: string;
  templateCode?: string;
  version?: string;
  inputVariables?: Record<string, unknown>;
  renderedContent?: string;
  llmVendor?: string;
  llmModel?: string;
  success: boolean;
  responseTimeMs?: number;
  tokenInput?: number;
  tokenOutput?: number;
  errorMessage?: string;
  createdAt: number;
  projectId?: string;
  userId?: string;
}

/**
 * 创建提示词请求
 */
export interface CreatePromptTemplateRequest {
  code: string;
  name: string;
  type: PromptType;
  description?: string;
  content: string;
  variables?: Record<string, VariableDefinition>;
  tags?: string[];
}

/**
 * 更新提示词请求
 */
export interface UpdatePromptTemplateRequest {
  name?: string;
  description?: string;
  content?: string;
  variables?: Record<string, VariableDefinition>;
  tags?: string[];
}

/**
 * 发布提示词请求
 */
export interface PublishPromptTemplateRequest {
  changeSummary?: string;
}

/**
 * 渲染提示词请求
 */
export interface RenderPromptRequest {
  code: string;
  version?: string;
  variables: Record<string, unknown>;
}

/**
 * 渲染结果
 */
export interface RenderPromptResult {
  templateId: string;
  version: string;
  renderedContent: string;
}

/**
 * 统计概览
 */
export interface PromptStatsOverview {
  totalCalls: number;
  successRate: number;
  avgResponseTimeMs: number;
  totalTokenInput: number;
  totalTokenOutput: number;
  callsByType: Record<PromptType, number>;
  callsTrend: Array<{
    date: string;
    calls: number;
    successRate: number;
  }>;
}

/**
 * 按模板统计
 */
export interface PromptStatsByTemplate {
  templateId: string;
  templateCode: string;
  templateName: string;
  totalCalls: number;
  successRate: number;
  avgResponseTimeMs: number;
  avgTokenInput: number;
  avgTokenOutput: number;
}

/**
 * 版本对比结果
 */
export interface PromptVersionCompareResult {
  fromVersion: {
    version: string;
    content: string;
  };
  toVersion: {
    version: string;
    content: string;
  };
  diff: string;
}

/**
 * 分页查询结果
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 列表查询参数
 */
export interface ListTemplatesQuery {
  type?: PromptType;
  status?: PromptStatus;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/**
 * 日志查询参数
 */
export interface ListLogsQuery {
  templateId?: string;
  templateCode?: string;
  success?: boolean;
  startDate?: number;
  endDate?: number;
  page?: number;
  pageSize?: number;
}

/**
 * 统计查询参数
 */
export interface StatsQuery {
  templateId?: string;
  startDate?: number;
  endDate?: number;
}

/**
 * 版本对比查询参数
 */
export interface CompareVersionsQuery {
  fromVersion: string;
  toVersion: string;
}