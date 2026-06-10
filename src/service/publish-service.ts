// src/service/publish-service.ts

/**
 * 发布管理服务
 * 负责处理用户作品发布请求的创建、审核和管理
 *
 * 流程：
 * 1. 用户提交发布请求 → 创建 pending 状态的请求记录
 * 2. 运营审核通过 → 创建作品记录，更新请求状态为 approved
 * 3. 运营审核拒绝 → 更新请求状态为 rejected，记录拒绝理由
 */

import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import {
  PgSquarePublishRequestRepository,
  type SquarePublishRequest,
  type PublishRequestStatus,
} from "../repositories/pg/square-publish-request-pg-repository.js";
import {
  PgSquareUserWorkRepository,
  type SquareUserWork,
} from "../repositories/pg/square-user-work-pg-repository.js";
import { PgProjectRepository } from "../repositories/pg/project-pg-repository.js";
import { PgAssetRepository } from "../repositories/pg/asset-pg-repository.js";
import type { SquarePublishCategory } from "../contracts/square-publish-category.js";

// ============================================================================
// 类型定义
// ============================================================================

/** 创建发布请求参数 */
export interface CreatePublishRequestParams {
  userId: string;
  projectId: string;
}

/** 创建发布请求结果 */
export interface CreatePublishRequestResult {
  success: boolean;
  message: string;
  requestId: string | null;
}

/** 审核通过结果 */
export interface ApprovePublishRequestResult {
  success: boolean;
  workId: string | null;
}

/** 审核拒绝参数 */
export interface RejectPublishRequestParams {
  requestId: string;
  reviewerId: string;
  reason?: string;
}

/** 待审核请求列表参数 */
export interface GetPendingRequestsParams {
  status?: PublishRequestStatus;
  page?: number;
  pageSize?: number;
}

/** 待审核请求列表结果 */
export interface GetPendingRequestsResult {
  data: SquarePublishRequest[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================================
// 错误类型
// ============================================================================

/** 发布请求错误 */
export class PublishServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishServiceError";
  }
}

// ============================================================================
// 服务接口
// ============================================================================

/**
 * 发布管理服务接口
 */
export interface IPublishService {
  /** 创建发布请求 */
  createPublishRequest(params: CreatePublishRequestParams): Promise<CreatePublishRequestResult>;

  /** 审核通过发布请求 */
  approvePublishRequest(requestId: string, reviewerId: string): Promise<ApprovePublishRequestResult>;

  /** 审核拒绝发布请求 */
  rejectPublishRequest(params: RejectPublishRequestParams): Promise<void>;

  /** 获取待审核请求列表 */
  getPendingRequests(params: GetPendingRequestsParams): Promise<GetPendingRequestsResult>;
}

// ============================================================================
// 服务实现
// ============================================================================

/**
 * 发布管理服务实现
 */
export class PublishService implements IPublishService {
  private pool: Pool;
  private publishRequestRepo: PgSquarePublishRequestRepository;
  private userWorkRepo: PgSquareUserWorkRepository;
  private projectRepo: PgProjectRepository;
  private assetRepo: PgAssetRepository;

  constructor(pool: Pool) {
    this.pool = pool;
    this.publishRequestRepo = new PgSquarePublishRequestRepository(pool);
    this.userWorkRepo = new PgSquareUserWorkRepository(pool);
    this.projectRepo = new PgProjectRepository(pool);
    this.assetRepo = new PgAssetRepository(pool);
  }

  /**
   * 创建发布请求
   *
   * 检查：
   * 1. 项目是否存在
   * 2. 项目是否已完成视频生成
   * 3. 是否已有待处理的请求（防止重复提交）
   *
   * @param userId 用户ID
   * @param projectId 项目ID
   */
  async createPublishRequest(params: CreatePublishRequestParams): Promise<CreatePublishRequestResult> {
    const { userId, projectId } = params;

    // 1. 检查项目是否存在
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      return {
        success: false,
        message: "项目不存在",
        requestId: null,
      };
    }

    // 2. 检查项目归属
    if (project.userId !== userId) {
      return {
        success: false,
        message: "无权发布此项目",
        requestId: null,
      };
    }

    // 3. 检查项目是否已完成视频生成（有 export_url）
    if (!project.exportUrl) {
      return {
        success: false,
        message: "项目尚未完成视频生成，无法发布",
        requestId: null,
      };
    }

    // 4. 检查是否已有待处理的请求（防止重复提交）
    const hasPending = await this.publishRequestRepo.hasPendingRequest(projectId);
    if (hasPending) {
      return {
        success: false,
        message: "该项目已有待处理的发布请求，请等待审核",
        requestId: null,
      };
    }

    // 5. 创建发布请求
    const now = Date.now();
    const requestId = randomUUID();
    const request: SquarePublishRequest = {
      id: requestId,
      userId,
      projectId,
      status: "pending",
      rejectReason: null,
      reviewerId: null,
      reviewedAt: null,
      createdAt: now,
    };

    await this.publishRequestRepo.create(request);

    return {
      success: true,
      message: "已提交发布申请，等待审核",
      requestId,
    };
  }

  /**
   * 审核通过发布请求
   *
   * 流程：
   * 1. 获取发布请求信息
   * 2. 获取项目信息（标题、封面、视频、服装分类）
   * 3. 创建作品记录
   * 4. 更新发布请求状态为 approved
   *
   * @param requestId 发布请求ID
   * @param reviewerId 审核人ID
   */
  async approvePublishRequest(requestId: string, reviewerId: string): Promise<ApprovePublishRequestResult> {
    // 1. 获取发布请求
    const request = await this.publishRequestRepo.findById(requestId);
    if (!request) {
      throw new PublishServiceError("发布请求不存在");
    }

    if (request.status !== "pending") {
      throw new PublishServiceError(`发布请求已处理，当前状态：${request.status}`);
    }

    // 2. 获取项目信息
    const project = await this.projectRepo.findById(request.projectId);
    if (!project) {
      throw new PublishServiceError("关联项目不存在");
    }

    // 3. 获取服装分类（从项目资产的 apparelCategory 字段）
    const category = await this.getProjectCategory(request.projectId);

    // 4. 创建作品记录
    const now = Date.now();
    const workId = randomUUID();
    const work: SquareUserWork = {
      id: workId,
      userId: request.userId,
      projectId: request.projectId,
      title: project.name,
      coverUrl: project.thumbnailUrl,
      videoUrl: project.exportUrl,
      category,
      views: 0,
      likes: 0,
      isEnabled: true,
      publishedAt: now,
      createdAt: now,
    };

    await this.userWorkRepo.create(work);

    // 5. 更新发布请求状态
    await this.publishRequestRepo.updateStatus(requestId, "approved", reviewerId);

    return {
      success: true,
      workId,
    };
  }

  /**
   * 审核拒绝发布请求
   *
   * @param requestId 发布请求ID
   * @param reviewerId 审核人ID
   * @param reason 拒绝理由（可选）
   */
  async rejectPublishRequest(params: RejectPublishRequestParams): Promise<void> {
    const { requestId, reviewerId, reason } = params;

    // 1. 获取发布请求
    const request = await this.publishRequestRepo.findById(requestId);
    if (!request) {
      throw new PublishServiceError("发布请求不存在");
    }

    if (request.status !== "pending") {
      throw new PublishServiceError(`发布请求已处理，当前状态：${request.status}`);
    }

    // 2. 更新发布请求状态
    await this.publishRequestRepo.updateStatus(requestId, "rejected", reviewerId, reason);
  }

  /**
   * 获取待审核请求列表
   *
   * @param status 状态筛选（可选，默认 pending）
   * @param page 页码
   * @param pageSize 每页数量
   */
  async getPendingRequests(params: GetPendingRequestsParams): Promise<GetPendingRequestsResult> {
    const { status = "pending", page = 1, pageSize = 20 } = params;
    const offset = (page - 1) * pageSize;

    // 获取请求列表
    const requests = await this.publishRequestRepo.findByStatus(status, pageSize, offset);

    // 获取总数
    const total = await this.publishRequestRepo.countByStatus(status);
    const totalPages = Math.ceil(total / pageSize);

    return {
      data: requests,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  /**
   * 获取项目的服装分类
   * 从项目资产的 apparelCategory 字段获取，取第一个资产的分类
   * 如果没有资产或资产没有分类，返回默认分类"女装"
   */
  private async getProjectCategory(projectId: string): Promise<SquarePublishCategory> {
    const assets = await this.assetRepo.findByProjectId(projectId);

    // 查找第一个有 apparelCategory 的资产
    for (const asset of assets) {
      if (asset.apparelCategory) {
        return asset.apparelCategory;
      }
    }

    // 默认分类为女装
    return "女装";
  }
}