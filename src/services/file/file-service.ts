/**
 * 文件服务
 * 统一管理文件上传、去重、引用追踪
 */

import { createHash } from "node:crypto";
import type { IObjectStorageAdapter } from "../../contracts/object-storage.js";
import type {
  FileRegistryRecord,
  FileUploadOptions,
  ReferenceEntity,
  FileType,
  FileUploaderType,
  FileStorageDriver,
  FileEnvironment,
} from "../../contracts/file-registry-contract.js";
import type { IFileRegistryRepository } from "../../contracts/repository-ports/file-registry-repository.js";
import type { IRepositoryClock } from "../../contracts/repository-ports/common.js";
import { detectFileType, inferMimeType } from "./file-type-detector.js";
import { getLogger } from "../../core/logger/index.js";

const log = getLogger("file-service");

export interface FileServiceDeps {
  repos: { fileRegistry: IFileRegistryRepository };
  clock: IRepositoryClock;
  storage: IObjectStorageAdapter | null;
  defaultStorageDriver: FileStorageDriver;
  /** 当前环境：test 或 production */
  environment: FileEnvironment;
}

export class FileService {
  constructor(private readonly deps: FileServiceDeps) {}

  /**
   * 上传文件（自动去重）
   * - 检查 SHA256 是否已存在
   * - 已存在：返回已有记录，增加引用计数
   * - 不存在：上传到存储，创建注册记录
   */
  async upload(
    uploaderId: string,
    content: Uint8Array,
    options: FileUploadOptions
  ): Promise<FileRegistryRecord> {
    const { repos, clock, storage, defaultStorageDriver } = this.deps;

    if (!storage) {
      throw new Error("Storage not configured");
    }

    // 1. 计算 SHA256
    const sha256 = createHash("sha256").update(content).digest("hex");

    // 2. 确定存储驱动
    const storageDriver = options.storageDriver ?? defaultStorageDriver;

    // 3. 检查是否已存在（去重）
    const existing = await repos.fileRegistry.findBySha256(sha256, storageDriver);
    if (existing) {
      // 已存在，增加引用计数
      await repos.fileRegistry.incrementRefCount(existing.id);

      // 如果有首次引用实体，更新 business_tags
      if (options.firstRefEntity) {
        const updatedTags = {
          ...existing.businessTags,
          [options.firstRefEntity.entityType]: options.firstRefEntity.entityId,
        };
        existing.businessTags = updatedTags;
        await repos.fileRegistry.update(existing);
      }

      return existing;
    }

    // 4. 不存在，上传到存储
    const contentType =
      options.contentType ??
      inferMimeType(
        detectFileType(options.contentType ?? null, options.fileName ?? null),
        options.fileName
      );
    const fileType: FileType = detectFileType(contentType, options.fileName ?? null);
    const fileName = options.fileName ?? `file_${Date.now()}`;

    // 生成存储路径
    const storageKey = this.generateStorageKey(sha256, fileName, fileType);

    // 上传到对象存储
    await storage.putObject(storageKey, content, contentType);

    // 获取公开 URL
    const publicUrl = await storage.getSignedUrl(storageKey);

    // 5. 创建注册记录
    const now = clock.now();
    const uploaderType: FileUploaderType = "user";
    const environment = options.environment ?? this.deps.environment;

    const record: FileRegistryRecord = {
      id: clock.generateId(),
      uploaderId,
      uploaderType,
      storageKey,
      storageDriver,
      publicUrl,
      contentSha256: sha256,
      fileType,
      contentType,
      fileSizeBytes: content.length,
      fileName,
      businessDomain: options.businessDomain,
      businessSubdomain: options.businessSubdomain ?? "media_persist",
      businessTags: options.businessTags ?? {},
      refCount: 1,
      firstRefEntity: options.firstRefEntity?.entityType ?? "",
      firstRefEntityId: options.firstRefEntity?.entityId ?? "",
      environment,
      createdAt: now,
      updatedAt: now,
    };

    // 插入数据库（使用 upsertReturning 处理并发情况）
    const saved = await repos.fileRegistry.upsertReturning(record);

    return saved;
  }

  /**
   * 注册引用关系
   */
  async registerReference(fileId: string, refEntity: ReferenceEntity): Promise<void> {
    const { repos, clock } = this.deps;

    const record = await repos.fileRegistry.findById(fileId);
    if (!record) {
      throw new Error(`File not found: ${fileId}`);
    }

    // 增加引用计数
    await repos.fileRegistry.incrementRefCount(fileId);

    // 更新 business_tags
    const updatedTags = {
      ...record.businessTags,
      [refEntity.entityType]: refEntity.entityId,
    };

    await repos.fileRegistry.update({
      ...record,
      businessTags: updatedTags,
      updatedAt: clock.now(),
    });
  }

  /**
   * 释放引用关系
   */
  async releaseReference(fileId: string, refEntity: ReferenceEntity): Promise<void> {
    const { repos, clock } = this.deps;

    const record = await repos.fileRegistry.findById(fileId);
    if (!record) {
      log.warn({ fileId, refEntity }, "FileService releaseReference file not found");
      return;
    }

    // 减少引用计数
    await repos.fileRegistry.decrementRefCount(fileId);

    // 从 business_tags 中移除关联
    const updatedTags = { ...record.businessTags };
    delete updatedTags[refEntity.entityType];

    await repos.fileRegistry.update({
      ...record,
      businessTags: updatedTags,
      updatedAt: clock.now(),
    });
  }

  /**
   * 按存储路径查找
   */
  async findByStorageKey(storageKey: string): Promise<FileRegistryRecord | null> {
    return this.deps.repos.fileRegistry.findByStorageKey(storageKey);
  }

  /**
   * 按 SHA256 查找
   */
  async findBySha256(sha256: string, driver?: string): Promise<FileRegistryRecord | null> {
    return this.deps.repos.fileRegistry.findBySha256(
      sha256,
      driver ?? this.deps.defaultStorageDriver
    );
  }

  /**
   * 查询零引用文件
   */
  async findZeroRefFiles(options: {
    olderThanDays?: number;
    businessDomain?: string;
    limit?: number;
  }): Promise<FileRegistryRecord[]> {
    return this.deps.repos.fileRegistry.findZeroRefFiles(options);
  }

  /**
   * 删除文件（仅零引用文件可删除）
   * @returns true 表示完全删除成功（存储+数据库）
   * @throws 如果存储删除失败，抛出错误（数据库记录保留）
   */
  async deleteFile(fileId: string): Promise<boolean> {
    const { repos, storage } = this.deps;

    const record = await repos.fileRegistry.findById(fileId);
    if (!record) {
      return false;
    }

    if (record.refCount > 0) {
      throw new Error(`Cannot delete file with ref_count > 0: ${fileId}`);
    }

    // 从对象存储删除（失败时抛出错误，保留数据库记录）
    if (storage) {
      await storage.deleteObject(record.storageKey);
    }

    // 从数据库删除
    return repos.fileRegistry.deleteIfUnreferenced(fileId);
  }

  /**
   * 生成存储路径
   */
  private generateStorageKey(sha256: string, fileName: string, fileType: FileType): string {
    const ext = fileName.split(".").pop() ?? "";
    const prefix = this.getStoragePrefix(fileType);
    return `${prefix}/${sha256.slice(0, 2)}/${sha256}.${ext}`;
  }

  /**
   * 获取存储路径前缀
   */
  private getStoragePrefix(fileType: FileType): string {
    const prefixes: Record<FileType, string> = {
      image: "media/images",
      video: "media/videos",
      audio: "media/audios",
      document: "media/documents",
    };
    return prefixes[fileType];
  }
}