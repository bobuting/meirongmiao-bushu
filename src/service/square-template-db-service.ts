/**
 * 创作广场模板数据库服务
 * 委托 PgSquareTemplateRepository 执行数据库操作
 */

import type { PgSquareTemplateRepository } from "../repositories/pg/square-template-pg-repository.js";

/** 审核状态（从 repo 重新导出） */
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

/** 模板信息（与 repo record 兼容） */
export interface SquareTemplate {
  id: string;
  title: string;
  category: string;
  author: string;
  coverUrl: string;
  videoUrl: string | null;
  views: number;
  likes: number;
  sortOrder: number;
  isEnabled: boolean;
  creatorId: string;
  scriptDataId: string | null;
  projectId: string | null;
  reviewStatus: ReviewStatus;
  reviewerId: string | null;
  reviewedAt: number | null;
  rejectReason: string | null;
  createdAt: number;
  updatedAt: number;
}

/** 创建模板输入参数 */
export type CreateSquareTemplateInput = {
  title: string;
  category: string;
  author: string;
  coverUrl: string;
  videoUrl?: string | null;
  views?: number;
  likes?: number;
  sortOrder?: number;
  isEnabled?: boolean;
  creatorId: string;
  projectId?: string | null;
  reviewStatus?: ReviewStatus;
  scriptDataId?: string | null;
};

/** 从 Step5 发布创建模板的参数 */
export type CreateTemplateFromPublishInput = {
  title: string;
  category: string;
  author: string;
  coverUrl: string;
  videoUrl: string;
  projectId: string;
  creatorId: string;
  scriptDataId?: string | null;
};

/** 更新模板输入参数 */
export type UpdateSquareTemplateInput = {
  title?: string;
  category?: string;
  author?: string;
  coverUrl?: string;
  videoUrl?: string | null;
  views?: number;
  likes?: number;
  sortOrder?: number;
  isEnabled?: boolean;
};

/** 分页查询结果 */
export interface SquareTemplatePaginatedResult {
  data: SquareTemplate[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 创作广场模板服务接口 */
export interface ISquareTemplateService {
  listEnabled(): Promise<SquareTemplate[]>;
  listPaginated(page: number, pageSize: number, search?: string, category?: string, reviewStatus?: ReviewStatus): Promise<SquareTemplatePaginatedResult>;
  getById(id: string): Promise<SquareTemplate | null>;
  create(input: CreateSquareTemplateInput): Promise<SquareTemplate>;
  createFromPublish(input: CreateTemplateFromPublishInput): Promise<SquareTemplate>;
  update(id: string, input: UpdateSquareTemplateInput): Promise<SquareTemplate | null>;
  delete(id: string): Promise<boolean>;
  linkScript(id: string, scriptDataId: string): Promise<boolean>;
  reviewTemplate(id: string, action: 'approve' | 'reject', reviewerId: string, reason?: string): Promise<SquareTemplate | null>;
}

/**
 * 创作广场模板服务实现
 * 委托 PgSquareTemplateRepository 执行所有数据库操作
 */
export class SquareTemplateService implements ISquareTemplateService {
  constructor(private readonly repo: PgSquareTemplateRepository) {}

  /** 获取启用的模板列表（只返回已审核通过且已启用） */
  async listEnabled(): Promise<SquareTemplate[]> {
    return this.repo.listEnabled();
  }

  /** 分页查询模板列表 */
  async listPaginated(page: number, pageSize: number, search?: string, category?: string, reviewStatus?: ReviewStatus): Promise<SquareTemplatePaginatedResult> {
    return this.repo.listPaginated(page, pageSize, search, category, reviewStatus);
  }

  /** 根据ID获取模板详情 */
  async getById(id: string): Promise<SquareTemplate | null> {
    return this.repo.findById(id);
  }

  /** 创建模板 */
  async create(input: CreateSquareTemplateInput): Promise<SquareTemplate> {
    return this.repo.create(input);
  }

  /** 从 Step5 发布创建模板（待审核状态） */
  async createFromPublish(input: CreateTemplateFromPublishInput): Promise<SquareTemplate> {
    return this.repo.createFromPublish(input);
  }

  /** 更新模板 */
  async update(id: string, input: UpdateSquareTemplateInput): Promise<SquareTemplate | null> {
    return this.repo.update(id, input);
  }

  /** 删除模板 */
  async delete(id: string): Promise<boolean> {
    return this.repo.deleteTemplate(id);
  }

  /** 关联脚本到模板 */
  async linkScript(id: string, scriptDataId: string): Promise<boolean> {
    return this.repo.linkScript(id, scriptDataId);
  }

  /** 审核模板 */
  async reviewTemplate(id: string, action: 'approve' | 'reject', reviewerId: string, reason?: string): Promise<SquareTemplate | null> {
    return this.repo.reviewTemplate(id, action, reviewerId, reason);
  }
}
