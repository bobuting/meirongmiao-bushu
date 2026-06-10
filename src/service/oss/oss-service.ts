/**
 * OSS 存储服务
 * 职责：纯 OSS 操作，不包含业务逻辑
 */

import type { IObjectStorageAdapter } from "../../contracts/object-storage.js";
import { getLogger } from "../../core/logger/index.js";

const log = getLogger("oss-service");

/**
 * 上传结果
 */
export interface OssUploadResult {
  success: boolean;
  key: string;           // 存储路径
  url: string;           // 访问 URL
  size: number;          // 文件大小（字节）
  message?: string;
}

/**
 * OSS 服务接口
 */
export interface IOssService {
  /**
   * 上传文件到指定路径
   */
  upload(key: string, content: Buffer | Uint8Array, contentType?: string): Promise<OssUploadResult>;

  /**
   * 删除文件
   */
  delete(key: string): Promise<boolean>;

  /**
   * 获取文件访问 URL
   */
  getUrl(key: string): Promise<string>;

  /**
   * 通过 URL 获取文件内容
   */
  fetchByUrl(url: string): Promise<Buffer>;
}

/**
 * OSS 配置参数
 */
export interface OssConfig {
  /** 公开访问基础 URL */
  publicBaseUrl?: string;
}

/**
 * OSS 服务实现
 */
export class OssService implements IOssService {
  private storage: IObjectStorageAdapter;
  private publicBaseUrl: string;

  constructor(storage: IObjectStorageAdapter, config?: OssConfig) {
    this.storage = storage;
    // 优先使用传入的配置，其次使用环境变量
    this.publicBaseUrl = config?.publicBaseUrl || process.env.OBJECT_STORAGE_S3_PUBLIC_BASE || "";
  }

  /**
   * 上传文件到指定路径
   * @param key 存储路径
   * @param content 文件内容
   * @param contentType MIME 类型
   * @returns 上传结果
   */
  async upload(key: string, content: Buffer | Uint8Array, contentType?: string): Promise<OssUploadResult> {
    try {
      await this.storage.putObject(key, content, contentType);
      return {
        success: true,
        key,
        url: await this.getUrl(key),
        size: content.length,
      };
    } catch (error) {
      return {
        success: false,
        key: "",
        url: "",
        size: 0,
        message: error instanceof Error ? error.message : "上传失败",
      };
    }
  }

  /**
   * 删除文件
   * @param key 存储路径
   * @returns 是否删除成功
   */
  async delete(key: string): Promise<boolean> {
    try {
      await this.storage.deleteObject(key);
      return true;
    } catch (error) {
      log.warn({ err: error, key }, "删除文件失败");
      return false;
    }
  }

  /**
   * 获取文件访问 URL
   * @param key 存储路径
   * @returns 访问 URL
   */
  async getUrl(key: string): Promise<string> {
    // 优先使用存储适配器的签名 URL
    const signedUrl = await this.storage.getSignedUrl(key);
    if (signedUrl && signedUrl.startsWith("http")) {
      return signedUrl;
    }

    // 如果配置了公开访问基础 URL，则拼接
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl}/${key}`;
    }

    // 默认返回相对路径
    return `/storage/objects/${key}`;
  }

  /**
   * 通过 URL 获取文件内容
   * @param url 文件 URL
   * @returns 文件内容
   */
  async fetchByUrl(url: string): Promise<Buffer> {
    let fetchUrl = url;

    // 处理相对路径
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      // 移除开头的 /storage/objects/ 前缀
      const normalizedPath = url.startsWith("/storage/objects/")
        ? url.replace("/storage/objects/", "")
        : url.replace(/^\//, "");

      // 如果有公开访问基础 URL，则拼接
      if (this.publicBaseUrl) {
        fetchUrl = `${this.publicBaseUrl}/${normalizedPath}`;
      } else {
        // 使用本地服务器地址
        const serverUrl = process.env.SERVER_BASE_URL || "http://localhost:3021";
        fetchUrl = `${serverUrl}/storage/objects/${normalizedPath}`;
      }
    }

    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`获取文件失败: HTTP ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
}

// 单例实例
let _ossService: OssService | null = null;

/**
 * 获取 OSS 服务实例
 * @param storage 存储适配器
 * @param config OSS 配置参数（可选）
 * @returns OSS 服务实例
 */
export function getOssService(storage: IObjectStorageAdapter, config?: OssConfig): OssService {
  if (!_ossService) {
    _ossService = new OssService(storage, config);
  }
  return _ossService;
}