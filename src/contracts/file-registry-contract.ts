/**
 * 文件注册中心类型契约
 *
 * 定义文件生命周期管理的核心类型，包括业务域、存储驱动、实体记录等。
 */

// ============================================================================
// 枚举类型定义
// ============================================================================

/** 业务域 */
export type FileBusinessDomain =
  | 'project'
  | 'library'
  | 'square'
  | 'hot_trend'
  | 'fission';

/** 业务子域 */
export type FileBusinessSubdomain =
  | 'step1_clothing'
  | 'step2_character'
  | 'step3_script'
  | 'step4_storyboard'
  | 'step5_delivery'
  | 'media_persist'
  | 'garment_asset'
  | 'character'
  | 'publish'
  | 'reverse'
  | 'sync'
  | 'video_cover'
  | 'storyboard_video'
  | 'new_story';

/** 上传者类型 */
export type FileUploaderType = 'user' | 'system' | 'scheduler';

/** 文件类型 */
export type FileType = 'image' | 'video' | 'audio' | 'document';

/** 存储驱动类型 */
export type FileStorageDriver = 'alioss' | 'local';

/** 环境类型 */
export type FileEnvironment = 'test' | 'production';

// ============================================================================
// 实体类型定义
// ============================================================================

/** 文件注册记录 */
export interface FileRegistryRecord {
  id: string;
  uploaderId: string;
  uploaderType: FileUploaderType;
  storageKey: string;
  storageDriver: FileStorageDriver;
  publicUrl: string;
  contentSha256: string;
  fileType: FileType;
  contentType: string;
  fileSizeBytes: number;
  fileName: string;
  businessDomain: FileBusinessDomain;
  businessSubdomain: FileBusinessSubdomain;
  businessTags: Record<string, string>;
  refCount: number;
  firstRefEntity: string;
  firstRefEntityId: string;
  /** 环境：test 或 production，用于区分测试库和正式库 */
  environment: FileEnvironment;
  createdAt: number;
  updatedAt: number;
}

/** 引用实体 */
export interface ReferenceEntity {
  entityType: string;
  entityId: string;
}

/** 上传选项 */
export interface FileUploadOptions {
  fileName?: string;
  contentType?: string;
  storageDriver?: FileStorageDriver;
  businessDomain: FileBusinessDomain;
  businessSubdomain?: FileBusinessSubdomain;
  businessTags?: Record<string, string>;
  firstRefEntity?: ReferenceEntity;
  /** 环境：test 或 production，默认根据 NODE_ENV 自动判断 */
  environment?: FileEnvironment;
}

/** 文件查询过滤器 */
export interface FileRegistryFilters {
  page?: number;
  pageSize?: number;
  businessDomain?: FileBusinessDomain;
  businessSubdomain?: FileBusinessSubdomain;
  fileType?: FileType;
  uploaderId?: string;
  refCountZero?: boolean;
  createdAfter?: number;
  createdBefore?: number;
  /** 按环境过滤 */
  environment?: FileEnvironment;
}

/** 存储统计 */
export interface FileStorageStats {
  totalFiles: number;
  totalSizeBytes: number;
  byDomain: Record<string, { count: number; sizeBytes: number }>;
  byFileType: Record<FileType, { count: number; sizeBytes: number }>;
  zeroRefFiles: number;
  zeroRefSizeBytes: number;
}

/** 清理状态 */
export interface FileCleanupStatus {
  enabled: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  retentionDays: number;
  totalCleaned: number;
}