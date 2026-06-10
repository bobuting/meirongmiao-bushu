/**
 * 镜像视频服务
 * 处理镜像视频的数据库操作
 * 使用传统字段模式
 */

import type { PgRepositoryCollection } from "../../repositories/pg/index.js";
import type { PgFissionVideosMirrorRepository, FissionVideosMirrorRecord } from "../../repositories/pg/fission-videos-mirror-pg-repository.js";

/**
 * 镜像视频 payload 结构
 */
export interface MirrorVideoPayload {
  mirrorVideoUrls: string[];
  mirrorCount: number;
  sourceProjectId: string;
  uploadedAt?: number;
  durationSec?: number;
}

/**
 * 镜像视频记录
 */
export interface MirrorVideoRecord {
  id: string;
  projectId: string;
  creatorId: string;
  payloadJson: MirrorVideoPayload;
  status: "pending" | "completed" | "failed";
  createdAt: number;
  updatedAt: number;
}

/**
 * 镜像视频服务接口
 */
export interface IMirrorVideoService {
  getById(id: string): Promise<MirrorVideoRecord | null>;
  getByProjectId(projectId: string): Promise<MirrorVideoRecord | null>;
  create(record: MirrorVideoRecord): Promise<MirrorVideoRecord>;
  update(record: MirrorVideoRecord): Promise<MirrorVideoRecord>;
  delete(id: string): Promise<boolean>;
}

/**
 * 镜像视频服务实现
 */
export class MirrorVideoService implements IMirrorVideoService {
  private repo: PgFissionVideosMirrorRepository;

  constructor(repos: PgRepositoryCollection) {
    this.repo = repos.fissionVideosMirror;
  }

  private recordToMirrorVideo(record: FissionVideosMirrorRecord): MirrorVideoRecord {
    const payloadJson: MirrorVideoPayload = {
      mirrorVideoUrls: record.mirrorVideoUrls,
      mirrorCount: record.mirrorCount,
      sourceProjectId: record.sourceProjectId ?? "",
      uploadedAt: record.uploadedAt ?? undefined,
      durationSec: record.durationSec ?? undefined,
    };

    return {
      id: record.id,
      projectId: record.projectId,
      creatorId: record.creatorId,
      payloadJson,
      status: record.status as MirrorVideoRecord["status"],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private mirrorVideoToRecord(record: MirrorVideoRecord): FissionVideosMirrorRecord {
    const p = record.payloadJson;
    return {
      id: record.id,
      projectId: record.projectId,
      creatorId: record.creatorId,
      mirrorVideoUrls: p.mirrorVideoUrls,
      mirrorCount: p.mirrorCount,
      sourceProjectId: p.sourceProjectId,
      uploadedAt: p.uploadedAt ?? null,
      durationSec: p.durationSec ?? null,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  async getById(id: string): Promise<MirrorVideoRecord | null> {
    const record = await this.repo.getById(id);
    if (!record) return null;
    return this.recordToMirrorVideo(record);
  }

  async getByProjectId(projectId: string): Promise<MirrorVideoRecord | null> {
    const record = await this.repo.getByProjectId(projectId);
    if (!record) return null;
    return this.recordToMirrorVideo(record);
  }

  async create(record: MirrorVideoRecord): Promise<MirrorVideoRecord> {
    const repoRecord = this.mirrorVideoToRecord(record);
    await this.repo.createRecord(repoRecord);
    return record;
  }

  async update(record: MirrorVideoRecord): Promise<MirrorVideoRecord> {
    const repoRecord = this.mirrorVideoToRecord(record);
    await this.repo.updateRecord(repoRecord);
    return record;
  }

  async delete(id: string): Promise<boolean> {
    return this.repo.deleteById(id);
  }
}
