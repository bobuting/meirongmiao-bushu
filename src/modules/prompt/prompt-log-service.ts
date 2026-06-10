/**
 * 提示词调用日志服务
 * 负责日志记录和统计分析
 */

import { randomUUID } from "crypto";
import type { PgPromptCallLogRepository } from "../../repositories/pg/prompt-call-log-pg-repository.js";
import type {
  PromptCallLog,
  PromptStatsOverview,
  PromptStatsByTemplate,
  ListLogsQuery,
} from "../../contracts/prompt-template-contract.js";

/**
 * 记录日志请求
 */
export interface LogCallRequest {
  templateId?: string;
  templateCode?: string;
  version?: number;
  inputVariables?: Record<string, unknown>;
  renderedContent?: string;
  llmVendor?: string;
  llmModel?: string;
  success: boolean;
  responseTimeMs?: number;
  tokenInput?: number;
  tokenOutput?: number;
  errorMessage?: string;
  projectId?: string;
  userId?: string;
}

/**
 * 提示词日志服务
 */
export class PromptLogService {
  constructor(private readonly promptCallLogRepo: PgPromptCallLogRepository) {}

  /**
   * 记录调用日志
   */
  async logCall(request: LogCallRequest): Promise<string> {
    const id = randomUUID();
    const now = Date.now();

    await this.promptCallLogRepo.create(request, id, now);

    return id;
  }

  /**
   * 获取日志列表
   */
  async listLogs(params: ListLogsQuery): Promise<{ items: PromptCallLog[]; total: number }> {
    return await this.promptCallLogRepo.findPaginated(params);
  }

  /**
   * 获取日志详情
   */
  async getLog(id: string): Promise<PromptCallLog | null> {
    return await this.promptCallLogRepo.findById(id);
  }

  /**
   * 获取统计概览
   */
  async getStatsOverview(params: {
    templateId?: string;
    startDate?: number;
    endDate?: number;
  }): Promise<PromptStatsOverview> {
    return await this.promptCallLogRepo.findStatsOverview(params);
  }

  /**
   * 按模板统计
   */
  async getStatsByTemplate(params: {
    startDate?: number;
    endDate?: number;
  }): Promise<PromptStatsByTemplate[]> {
    return await this.promptCallLogRepo.findStatsByTemplate(params);
  }
}