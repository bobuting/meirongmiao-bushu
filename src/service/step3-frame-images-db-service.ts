/**
 * step3-frame-images-db-service.ts
 * Step3 分镜图片数据库服务
 *
 * 薄封装层：委托给 PgStep3FrameImageRepository。
 * 保留公共 API 不变，最小化调用方改动。
 */

import type { PgRepositoryCollection } from "../repositories/pg/index.js";
import type {
  Step3FrameImageRecord,
  Step3FrameImageBatch,
  AppendBatchParams,
  SelectImageParams,
} from "../repositories/pg/step3-frame-image-pg-repository.js";

// 重新导出类型，保持调用方 import 路径兼容
export type { Step3FrameImageBatch, AppendBatchParams, SelectImageParams };
export type { Step3FrameImageRecord };

/**
 * Step3 分镜图片数据库服务
 */
export class Step3FrameImagesDbService {
  constructor(private repos: PgRepositoryCollection) {}

  /** 按项目+镜头查询 */
  async findByProjectAndFrame(projectId: string, frameIndex: number): Promise<Step3FrameImageRecord | null> {
    return this.repos.step3FrameImages.findByProjectAndFrame(projectId, frameIndex);
  }

  /** 按分镜ID查询 */
  async findByShotBreakdownId(shotBreakdownId: string): Promise<Step3FrameImageRecord | null> {
    return this.repos.step3FrameImages.findByShotBreakdownId(shotBreakdownId);
  }

  /** 按 jobId 查询 */
  async findByJobId(
    projectId: string,
    jobId: string,
  ): Promise<{ record: Step3FrameImageRecord; batch: Step3FrameImageBatch } | null> {
    return this.repos.step3FrameImages.findByJobId(projectId, jobId);
  }

  /** 按项目查询所有镜头图片 */
  async findByProjectId(projectId: string): Promise<Step3FrameImageRecord[]> {
    return this.repos.step3FrameImages.findByProjectId(projectId);
  }

  /** 追加批次（如果记录不存在则创建） */
  async appendBatch(params: AppendBatchParams): Promise<Step3FrameImageRecord> {
    return this.repos.step3FrameImages.appendBatch(params);
  }

  /** 选择图片（更新选中状态） */
  async selectImage(params: SelectImageParams): Promise<Step3FrameImageRecord | null> {
    return this.repos.step3FrameImages.selectImage(params);
  }

  /** 根据图片 URL 选择图片（按 project_id + frame_index 查找） */
  async selectImageByProjectAndFrame(
    projectId: string,
    frameIndex: number,
    imageUrl: string,
  ): Promise<Step3FrameImageRecord | null> {
    return this.repos.step3FrameImages.selectImageByProjectAndFrame(projectId, frameIndex, imageUrl);
  }

  /** 根据图片 URL 选择图片（按 shot_breakdown_id 查找） */
  async selectImageByUrl(
    shotBreakdownId: string,
    imageUrl: string,
  ): Promise<Step3FrameImageRecord | null> {
    return this.repos.step3FrameImages.selectImageByUrl(shotBreakdownId, imageUrl);
  }

  /** 按项目删除所有镜头图片 */
  async deleteByProjectId(projectId: string): Promise<void> {
    return this.repos.step3FrameImages.deleteByProjectId(projectId);
  }
}

/**
 * 创建服务实例的工厂函数
 */
let serviceInstance: Step3FrameImagesDbService | null = null;

export function getStep3FrameImagesDbService(repos: PgRepositoryCollection): Step3FrameImagesDbService {
  if (!serviceInstance) {
    serviceInstance = new Step3FrameImagesDbService(repos);
  }
  return serviceInstance;
}
