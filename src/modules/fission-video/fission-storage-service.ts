/**
 * 裂变视频存储服务
 * 根据数据库配置创建 S3/OSS 存储适配器
 * 不依赖全局 ctx.storage，支持动态配置
 */

import type { IObjectStorageAdapter } from "../../contracts/object-storage.js";
import type { AppConfig } from "../../contracts/types.js";
import { S3ObjectStorageAdapter } from "../../storage/adapters.js";

/**
 * 存储配置接口
 */
export interface FissionStorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle: boolean;
  publicBaseUrl: string;
}

/**
 * 从 AppConfig 提取存储配置
 */
export function extractStorageConfigFromAppConfig(config: AppConfig): FissionStorageConfig | null {
  // 检查必要的配置是否存在
  if (!config.ossEndpoint || !config.ossRegion || !config.ossBucketName) {
    return null;
  }

  // 检查凭证是否存在
  if (!config.ossAccessKeyId || !config.ossSecretAccessKey) {
    return null;
  }

  return {
    endpoint: config.ossEndpoint,
    region: config.ossRegion,
    accessKeyId: config.ossAccessKeyId,
    secretAccessKey: config.ossSecretAccessKey,
    bucket: config.ossBucketName,
    forcePathStyle: config.ossForcePathStyle ?? true,
    publicBaseUrl: config.ossPublicBaseUrl || "",
  };
}

/**
 * 根据数据库配置创建 S3/OSS 存储适配器
 * @param config 数据库配置
 * @returns S3 存储适配器，如果配置不完整则返回 null
 */
export function createS3StorageFromConfig(config: FissionStorageConfig): IObjectStorageAdapter {
  return new S3ObjectStorageAdapter({
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint,
    publicBaseUrl: config.publicBaseUrl || undefined,
    forcePathStyle: config.forcePathStyle,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
}

function readOptionalBoolean(value: string | undefined): boolean | null {
  if (value === undefined) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return null;
}
/**
 * 从环境变量创建 S3/OSS 存储适配器
 * 需要配置以下环境变量：
 * - S3_ENDPOINT: OSS 端点地址
 * - S3_REGION: 区域
 * - OBJECT_STORAGE_BUCKET: 存储桶名称
 * - S3_ACCESS_KEY_ID: AccessKey ID
 * - S3_SECRET_ACCESS_KEY: AccessKey Secret
 * - S3_FORCE_PATH_STYLE: 是否强制路径样式（可选）
 * - OBJECT_STORAGE_S3_PUBLIC_BASE: 公开访问基础 URL（可选）
 * @returns S3 存储适配器，如果配置不完整则抛出错误
 */
export function createS3StorageFromEnv(): IObjectStorageAdapter {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const region = process.env.S3_REGION?.trim();
  const bucket = process.env.OBJECT_STORAGE_BUCKET?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  const publicBaseUrl = process.env.OBJECT_STORAGE_S3_PUBLIC_BASE?.trim();

  // 检查必填配置
  if (!bucket || !region) {
    throw new Error("Missing required S3 configuration: OBJECT_STORAGE_BUCKET and S3_REGION must be set");
  }

  return new S3ObjectStorageAdapter({
    bucket,
    region,
    endpoint: endpoint || undefined,
    publicBaseUrl: publicBaseUrl || undefined,
    forcePathStyle: readOptionalBoolean(process.env.S3_FORCE_PATH_STYLE) ?? Boolean(endpoint && endpoint.length > 0),
    accessKeyId: accessKeyId || undefined,
    secretAccessKey: secretAccessKey || undefined,
  });
}

/**
 * 获取存储适配器
 * 统一使用 runtime.ts 配置的存储适配器（由环境变量控制）
 * @param appConfig 数据库配置（保留参数以兼容现有调用）
 * @param defaultStorage 默认存储适配器（来自 ctx.storage）
 * @returns 存储适配器
 */
export function getStorageAdapter(
  appConfig: AppConfig,
  defaultStorage: IObjectStorageAdapter | null
): IObjectStorageAdapter | null {
  // 统一使用 runtime.ts 配置的存储适配器
  // 存储行为由环境变量控制，不再优先使用数据库配置
  return defaultStorage;
}

/**
 * 获取公开访问 URL
 * @param config 存储配置
 * @param key 存储路径
 * @returns 公开访问 URL
 */
export function getPublicUrl(config: FissionStorageConfig, key: string): string {
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl}/${key}`;
  }
  return `/${key}`;
}