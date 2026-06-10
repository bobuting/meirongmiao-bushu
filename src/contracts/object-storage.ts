export type ObjectStorageDriver = "local" | "supabase" | "s3" | "alioss";

export interface ISignedUrlOptions {
  expiresInSec?: number;
  downloadName?: string;
  method?: "GET" | "PUT"; // HTTP 方法，支持 GET 下载或 PUT 上传
  contentType?: string; // PUT 上传时指定内容类型
}

export interface IObjectStorageAdapter {
  readonly driver: ObjectStorageDriver;
  readonly bucket: string;
  putObject(key: string, content: Uint8Array, contentType?: string): Promise<{ key: string }>;
  /**
   * 获取对象的签名 URL
   * @param key 存储路径
   * @param options 答名选项，method 可为 "GET" 或 "PUT"
   * @returns 答名 URL
   */
  getSignedUrl(key: string, options?: ISignedUrlOptions): Promise<string>;
  /**
   * 获取对象的永久公开 URL（无过期时间）
   * 适用于已上传到自己 OSS 的持久资源（图片、视频等）
   * @param key 存储路径
   * @returns 永久公开 URL
   */
  getPublicUrl(key: string): string;
  /**
   * 获取对象内容（用于后端代理下载）
   * @param key 存储路径
   * @returns 文件内容 Uint8Array
   */
  getObject(key: string): Promise<Uint8Array>;
  deleteObject(key: string): Promise<void>;
}

