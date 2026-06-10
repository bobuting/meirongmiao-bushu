/**
 * 从 AppConfig 创建 OSS 存储适配器
 * 用于裂变分镜等功能，从数据库配置创建 OSS 适配器
 */

import type { AppConfig } from "../../contracts/types.js";
import type { IObjectStorageAdapter, ObjectStorageDriver } from "../../contracts/object-storage.js";
import { getLogger } from "../../core/logger/index.js";
import { AliOssStorageAdapter, S3ObjectStorageAdapter } from "../../storage/adapters.js";

const log = getLogger("oss-adapter-from-config");

/**
 * 检查 AppConfig 中是否有有效的 OSS 配置
 * @param config AppConfig 配置
 * @returns 是否有有效的 OSS 配置
 */
export function hasValidOssConfig(config: AppConfig | undefined): boolean {
  if (!config) return false;
  return Boolean(
    config.ossEndpoint &&
    config.ossRegion &&
    config.ossAccessKeyId &&
    config.ossSecretAccessKey &&
    config.ossBucketName
  );
}

/**
 * 从 AppConfig 创建 OSS 存储适配器
 * @param config AppConfig 配置
 * @param driver 存储驱动类型，默认 "s3"，可选 "alioss" 使用阿里云原生 SDK
 * @returns 存储适配器实例，如果配置无效则返回 null
 */
export function createOssAdapterFromConfig(
  config: AppConfig | undefined,
  driver: ObjectStorageDriver = "s3"
): IObjectStorageAdapter | null {
  if (!hasValidOssConfig(config)) {
    log.warn("[OSS] AppConfig 中缺少有效的 OSS 配置");
    return null;
  }


  // 使用阿里云原生 SDK
  if (driver === "alioss") {
    return new AliOssStorageAdapter({
      bucket: config!.ossBucketName,
      region: config!.ossRegion,
      endpoint: config!.ossEndpoint,
      publicBaseUrl: config!.ossPublicBaseUrl || undefined,
      accessKeyId: config!.ossAccessKeyId,
      accessKeySecret: config!.ossSecretAccessKey,
    });
  }

  // 默认使用 S3 兼容 SDK
  return new S3ObjectStorageAdapter({
    bucket: config!.ossBucketName,
    region: config!.ossRegion,
    endpoint: config!.ossEndpoint,
    publicBaseUrl: config!.ossPublicBaseUrl || undefined,
    forcePathStyle: config!.ossForcePathStyle ?? false,
    accessKeyId: config!.ossAccessKeyId,
    secretAccessKey: config!.ossSecretAccessKey,
  });
}