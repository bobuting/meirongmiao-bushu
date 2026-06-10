/**
 * Skills 管理前端 API 服务
 */

import { useAppStore } from "../store/useAppStore";
import { API_PATH_PREFIX } from "./backendApi.config";

/**
 * API 响应格式
 */
interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

/**
 * Skill 元数据
 */
export interface SkillMetadata {
  code: string;
  name: string;
  description: string;
  category?: string;
  tags: string[];
  version: string;
  author: string;
  defaultVariant: string;
  // 新增：共享规则依赖
  includes?: {
    rules?: string[];
  };
}

/**
 * Skill 详情（包含模板内容）
 */
export interface SkillDetail extends SkillMetadata {
  systemPrompt: string;
  userPrompt: string;
  inputSchema?: string;
  examples?: Array<{
    name: string;
    description?: string;
    variables: Record<string, any>;
  }>;
  // 新增：原始 SKILL.md 内容
  skillMdContent?: string;
}

/**
 * Skill 列表项
 */
export interface SkillListItem {
  code: string;
  name: string;
  description: string;
  category?: string;
  tags?: string[];
}

/**
 * 渲染结果
 */
export interface RenderResult {
  system: string;
  user: string;
  variant: string;
}

/**
 * 性能指标
 */
export interface SkillsMetrics {
  total: number;
  skillsUsed: number;
  skillsSuccess: number;
  skillsFailed: number;
  skillsSuccessRate: number;
  avgDuration: number;
  skillsAvgDuration: number;
  dbUsed: number;
  dbAvgDuration: number;
  performanceGain: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
}

/**
 * 创建 Skill 请求
 */
export interface CreateSkillRequest {
  code: string;
  name: string;
  description: string;
  category?: string;
  tags?: string[];
  systemPrompt: string;
  userPrompt: string;
  inputSchema?: string;
  examples?: Array<{
    name: string;
    description?: string;
    variables: Record<string, any>;
  }>;
  // 共享规则依赖
  includes?: {
    rules?: string[];
  };
}

/**
 * 更新 Skill 请求
 */
export interface UpdateSkillRequest {
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  systemPrompt?: string;
  userPrompt?: string;
  inputSchema?: string;
  examples?: Array<{
    name: string;
    description?: string;
    variables: Record<string, any>;
  }>;
  author?: string;
  changeLog?: string;
  // 共享规则依赖
  includes?: {
    rules?: string[];
  };
}

// =====================================================
// 共享规则类型定义
// =====================================================

/**
 * 共享规则列表项
 */
export interface SharedRuleListItem {
  name: string;
  filename: string;
  description: string;
}

/**
 * 共享规则详情
 */
export interface SharedRuleDetail {
  name: string;
  filename: string;
  content: string;
}

/**
 * 创建共享规则请求
 */
export interface CreateSharedRuleRequest {
  name: string;
  content: string;
}

/**
 * 更新共享规则请求
 */
export interface UpdateSharedRuleRequest {
  content: string;
}

/**
 * 版本信息
 */
export interface SkillVersion {
  version: string;
  timestamp: number;
  author: string;
  changeLog: string;
}

/**
 * 版本详情
 */
export interface SkillVersionDetail extends SkillVersion {
  metadata: string;
  systemPrompt: string;
  userPrompt: string;
  inputSchema: string;
  examples: string;
}

// =====================================================
// 系统配置类型定义
// =====================================================

/**
 * 系统配置
 */
export interface SkillsSystemConfig {
  scoringDaemonEnabled: boolean;
  evolutionEnabled: boolean;
}

/**
 * 系统配置运行状态
 */
export interface SkillsSystemStatus {
  config: SkillsSystemConfig;
  runtime: {
    scoringDaemonRunning: boolean;
    evolutionRunning: boolean;
  };
  scoringLoop?: {
    enabled: boolean;
    minScoreForLibrary: number;
    deprecationThreshold: number;
    weaknessFeedbackEnabled: boolean;
  };
  warnings?: string[];
  metrics?: SkillsMetrics;
  cache?: { size: number; hits: number; misses: number; hitRate: number };
}

/**
 * 创建 Skills 管理 API 服务
 */
export function createSkillsBackendApi() {
  const getHeaders = () => {
    const token = useAppStore.getState().token;
    return {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    };
  };

  const request = async <T>(url: string, options?: RequestInit): Promise<T> => {
    const response = await fetch(API_PATH_PREFIX + url, {
      ...options,
      headers: {
        ...getHeaders(),
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Request failed" }));

      // 401 时触发重登录
      if (response.status === 401 && typeof window !== "undefined") {
        useAppStore.getState().showReLoginModal(options?.method || "GET", url);
      }

      throw new Error(error.message || error.error || `HTTP ${response.status}`);
    }

    const result: ApiResponse<T> = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Request failed");
    }

    return result.data;
  };

  return {
    // ==================== 查询接口 ====================

    /**
     * 获取 Skills 列表
     */
    async listSkills(): Promise<SkillListItem[]> {
      return request<SkillListItem[]>("/admin/skills?pageSize=200");
    },

    /**
     * 获取 Skill 详情
     */
    async getSkill(code: string): Promise<SkillDetail> {
      return request<SkillDetail>(`/admin/skills/${code}`);
    },

    /**
     * 渲染 Skill
     */
    async renderSkill(code: string, variables: Record<string, any>, variant?: string): Promise<RenderResult> {
      return request<RenderResult>(`/skills-test/${code}/render`, {
        method: "POST",
        body: JSON.stringify({ variables, variant }),
      });
    },

    /**
     * 获取 Skill 示例
     */
    async getExamples(code: string): Promise<Array<{ name: string; description?: string; variables: Record<string, any> }>> {
      return request<Array<{ name: string; description?: string; variables: Record<string, any> }>>(`/skills-test/${code}/examples`);
    },

    // ==================== CRUD 接口 ====================

    /**
     * 创建 Skill
     */
    async createSkill(data: CreateSkillRequest): Promise<{ code: string; path: string }> {
      return request<{ code: string; path: string }>("/admin/skills", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    /**
     * 更新 Skill
     */
    async updateSkill(code: string, data: UpdateSkillRequest): Promise<{ code: string; updated: boolean }> {
      return request<{ code: string; updated: boolean }>(`/admin/skills/${code}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },

    /**
     * 删除 Skill
     */
    async deleteSkill(code: string): Promise<{ code: string; deleted: boolean }> {
      return request<{ code: string; deleted: boolean }>(`/admin/skills/${code}`, {
        method: "DELETE",
      });
    },

    /**
     * 导出 Skill
     */
    async exportSkill(code: string): Promise<{ code: string; files: Record<string, string> }> {
      return request<{ code: string; files: Record<string, string> }>(`/admin/skills/${code}/export`);
    },

    /**
     * 导入 Skill
     */
    async importSkill(code: string, files: Record<string, string>, overwrite = false): Promise<{ code: string; imported: boolean }> {
      return request<{ code: string; imported: boolean }>("/admin/skills/import", {
        method: "POST",
        body: JSON.stringify({ code, files, overwrite }),
      });
    },

    /**
     * 复制 Skill
     */
    async duplicateSkill(code: string, newCode: string): Promise<{ code: string; duplicated: boolean }> {
      return request<{ code: string; duplicated: boolean }>(`/admin/skills/${code}/duplicate`, {
        method: "POST",
        body: JSON.stringify({ newCode }),
      });
    },

    // ==================== 性能监控 ====================

    /**
     * 获取性能指标
     */
    async getMetrics(): Promise<SkillsMetrics> {
      return request<SkillsMetrics>("/admin/skills/metrics");
    },

    /**
     * 重置性能指标
     */
    async resetMetrics(): Promise<{ reset: boolean }> {
      return request<{ reset: boolean }>("/admin/skills/metrics/reset", {
        method: "POST",
      });
    },

    /**
     * 清空缓存
     */
    async clearCache(): Promise<{ cleared: boolean }> {
      return request<{ cleared: boolean }>("/admin/skills/clear-cache", {
        method: "POST",
      });
    },

    /**
     * 重载 Skill
     */
    async reloadSkill(code: string): Promise<{ code: string; reloaded: boolean }> {
      return request<{ code: string; reloaded: boolean }>("/admin/skills/reload", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
    },

    /**
     * 获取版本历史列表
     */
    async getVersions(code: string): Promise<SkillVersion[]> {
      return request<SkillVersion[]>(`/admin/skills/${code}/versions`);
    },

    /**
     * 获取版本详情
     */
    async getVersionDetail(code: string, version: string): Promise<SkillVersionDetail> {
      return request<SkillVersionDetail>(`/admin/skills/${code}/versions/${version}`);
    },

    /**
     * 回滚到指定版本
     */
    async rollbackToVersion(code: string, version: string): Promise<{ code: string; version: string; rolledBack: boolean }> {
      return request<{ code: string; version: string; rolledBack: boolean }>(`/admin/skills/${code}/rollback`, {
        method: "POST",
        body: JSON.stringify({ version }),
      });
    },

    // ==================== 共享规则管理 ====================

    /**
     * 获取共享规则列表
     */
    async listSharedRules(): Promise<SharedRuleListItem[]> {
      return request<SharedRuleListItem[]>("/admin/skills/shared-rules");
    },

    /**
     * 获取共享规则详情
     */
    async getSharedRule(name: string): Promise<SharedRuleDetail> {
      return request<SharedRuleDetail>(`/admin/skills/shared-rules/${name}`);
    },

    /**
     * 创建共享规则
     */
    async createSharedRule(data: CreateSharedRuleRequest): Promise<{ name: string; created: boolean }> {
      return request<{ name: string; created: boolean }>("/admin/skills/shared-rules", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    /**
     * 更新共享规则
     */
    async updateSharedRule(name: string, data: UpdateSharedRuleRequest): Promise<{ name: string; updated: boolean }> {
      return request<{ name: string; updated: boolean }>(`/admin/skills/shared-rules/${name}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },

    /**
     * 删除共享规则
     */
    async deleteSharedRule(name: string): Promise<{ name: string; deleted: boolean }> {
      return request<{ name: string; deleted: boolean }>(`/admin/skills/shared-rules/${name}`, {
        method: "DELETE",
      });
    },

    // ==================== 系统配置 ====================

    /**
     * 获取系统配置 + 运行状态
     */
    async getSystemConfig(): Promise<SkillsSystemStatus> {
      return request<SkillsSystemStatus>("/admin/skills/system-config");
    },

    /**
     * 更新系统配置（动态启停 daemon）
     */
    async updateSystemConfig(config: Partial<SkillsSystemConfig>): Promise<SkillsSystemStatus> {
      return request<SkillsSystemStatus>("/admin/skills/system-config", {
        method: "PUT",
        body: JSON.stringify(config),
      });
    },
  };
}
