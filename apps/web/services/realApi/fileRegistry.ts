/**
 * 文件注册中心前端 API
 */

import { request } from "../backendApi.request";

// ============================================================================
// 类型定义
// ============================================================================

/** 业务域 */
export type FileBusinessDomain =
  | "project"
  | "library"
  | "square"
  | "hot_trend"
  | "fission";

/** 业务子域 */
export type FileBusinessSubdomain =
  | "step1_clothing"
  | "step2_character"
  | "step3_script"
  | "step4_storyboard"
  | "step5_delivery"
  | "media_persist"
  | "garment_asset"
  | "character"
  | "publish"
  | "reverse"
  | "sync"
  | "video_cover"
  | "storyboard_video"
  | "new_story";

/** 上传者类型 */
export type FileUploaderType = "user" | "system" | "scheduler";

/** 文件类型 */
export type FileType = "image" | "video" | "audio" | "document";

/** 存储驱动类型 */
export type FileStorageDriver = "alioss" | "local";

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
  businessDomain: FileBusinessDomain | null;
  businessSubdomain: FileBusinessSubdomain | null;
  businessTags: Record<string, string>;
  refCount: number;
  firstRefEntity: string | null;
  firstRefEntityId: string | null;
  createdAt: number;
  updatedAt: number;
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

/** 分页结果 */
export interface FileRegistryListResult {
  items: FileRegistryRecord[];
  total: number;
  page: number;
  pageSize: number;
}

// ============================================================================
// API 接口定义
// ============================================================================

/** 文件注册 API 接口 */
export interface RealFileRegistryApi {
  /** 获取文件列表（分页） */
  fileRegistryList(
    token: string,
    filters?: FileRegistryFilters
  ): Promise<FileRegistryListResult>;

  /** 获取文件详情 */
  fileRegistryDetail(token: string, id: string): Promise<FileRegistryRecord>;

  /** 获取存储统计 */
  fileRegistryStats(token: string): Promise<FileStorageStats>;

  /** 删除零引用文件 */
  fileRegistryDelete(
    token: string,
    id: string
  ): Promise<{ success: boolean; message: string }>;

  /** 获取零引用文件列表 */
  fileRegistryZeroRefFiles(
    token: string,
    olderThanDays?: number,
    businessDomain?: FileBusinessDomain,
    limit?: number
  ): Promise<FileRegistryRecord[]>;

  /** 获取清理状态 */
  fileRegistryCleanupStatus(token: string): Promise<FileCleanupStatus>;
}

// ============================================================================
// API 实现
// ============================================================================

export const realFileRegistryApi: RealFileRegistryApi = {
  /** 获取文件列表（分页） */
  async fileRegistryList(
    token: string,
    filters?: FileRegistryFilters
  ): Promise<FileRegistryListResult> {
    const params = new URLSearchParams();
    if (filters?.page) params.set("page", filters.page.toString());
    if (filters?.pageSize) params.set("pageSize", filters.pageSize.toString());
    if (filters?.businessDomain) params.set("businessDomain", filters.businessDomain);
    if (filters?.businessSubdomain) params.set("businessSubdomain", filters.businessSubdomain);
    if (filters?.fileType) params.set("fileType", filters.fileType);
    if (filters?.uploaderId) params.set("uploaderId", filters.uploaderId);
    if (filters?.refCountZero !== undefined) params.set("refCountZero", filters.refCountZero.toString());
    if (filters?.createdAfter) params.set("createdAfter", filters.createdAfter.toString());
    if (filters?.createdBefore) params.set("createdBefore", filters.createdBefore.toString());

    const query = params.toString() ? `?${params.toString()}` : "";
    return request("GET", `/admin/files${query}`, { token });
  },

  /** 获取文件详情 */
  async fileRegistryDetail(
    token: string,
    id: string
  ): Promise<FileRegistryRecord> {
    return request("GET", `/admin/files/${id}`, { token });
  },

  /** 获取存储统计 */
  async fileRegistryStats(token: string): Promise<FileStorageStats> {
    return request("GET", "/admin/files/stats", { token });
  },

  /** 删除零引用文件 */
  async fileRegistryDelete(
    token: string,
    id: string
  ): Promise<{ success: boolean; message: string }> {
    return request("DELETE", `/admin/files/${id}`, { token });
  },

  /** 获取零引用文件列表 */
  async fileRegistryZeroRefFiles(
    token: string,
    olderThanDays?: number,
    businessDomain?: FileBusinessDomain,
    limit?: number
  ): Promise<FileRegistryRecord[]> {
    const params = new URLSearchParams();
    if (olderThanDays) params.set("olderThanDays", olderThanDays.toString());
    if (businessDomain) params.set("businessDomain", businessDomain);
    if (limit) params.set("limit", limit.toString());

    const query = params.toString() ? `?${params.toString()}` : "";
    return request("GET", `/admin/files/zero-ref${query}`, { token });
  },

  /** 获取清理状态 */
  async fileRegistryCleanupStatus(token: string): Promise<FileCleanupStatus> {
    return request("GET", "/admin/files/cleanup/status", { token });
  },
};