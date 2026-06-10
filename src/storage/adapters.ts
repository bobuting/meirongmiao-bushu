import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl as s3GetSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { IObjectStorageAdapter, ISignedUrlOptions, ObjectStorageDriver } from "../contracts/object-storage.js";

function normalizeObjectKey(key: string): string {
  const normalized = key.replace(/^\/+/, "").trim();
  if (!normalized) {
    throw new Error("Invalid object key");
  }
  return normalized;
}

export class LocalObjectStorageAdapter implements IObjectStorageAdapter {
  public readonly driver: ObjectStorageDriver = "local";
  public readonly bucket: string;
  private readonly rootDir: string;
  private readonly publicBaseUrl: string;

  constructor(params?: { bucket?: string; rootDir?: string; publicBaseUrl?: string }) {
    this.bucket = params?.bucket?.trim() || "app";
    this.rootDir = resolve(params?.rootDir?.trim() || join(process.cwd(), "data", "object-storage"));
    this.publicBaseUrl = (params?.publicBaseUrl?.trim() || "/storage/objects").replace(/\/+$/, "");
  }

  async putObject(key: string, content: Uint8Array, _contentType?: string): Promise<{ key: string }> {
    const k = normalizeObjectKey(key);
    const targetPath = resolve(join(this.rootDir, k));
    if (!targetPath.startsWith(this.rootDir)) {
      throw new Error("Invalid object key");
    }
    await mkdir(resolve(join(targetPath, "..")), { recursive: true });
    await writeFile(targetPath, content);
    return { key: k };
  }

  async getSignedUrl(key: string, _options?: ISignedUrlOptions): Promise<string> {
    const k = normalizeObjectKey(key);
    return `${this.publicBaseUrl}/${encodeURI(k)}`;
  }

  getPublicUrl(key: string): string {
    const k = normalizeObjectKey(key);
    return `${this.publicBaseUrl}/${encodeURI(k)}`;
  }

  async deleteObject(key: string): Promise<void> {
    const k = normalizeObjectKey(key);
    const targetPath = resolve(join(this.rootDir, k));
    if (!targetPath.startsWith(this.rootDir)) {
      return;
    }
    await rm(targetPath, { force: true });
  }

  async getObject(key: string): Promise<Uint8Array> {
    const k = normalizeObjectKey(key);
    const targetPath = resolve(join(this.rootDir, k));
    if (!targetPath.startsWith(this.rootDir)) {
      throw new Error("Invalid object key");
    }
    return readFile(targetPath);
  }
}

export class SupabaseObjectStorageAdapter implements IObjectStorageAdapter {
  public readonly driver: ObjectStorageDriver = "supabase";
  public readonly bucket: string;
  private readonly url: string;

  constructor(params: { url: string; key: string; bucket: string }) {
    this.url = params.url;
    this.bucket = params.bucket;
  }

  async putObject(_key: string, _content: Uint8Array, _contentType?: string): Promise<{ key: string }> {
    throw new Error("Supabase adapter not available in local harness (no SDK)");
  }

  async getSignedUrl(key: string, _options?: ISignedUrlOptions): Promise<string> {
    const k = normalizeObjectKey(key);
    return `${this.url}/storage/v1/object/sign/${this.bucket}/${encodeURI(k)}`;
  }

  getPublicUrl(key: string): string {
    const k = normalizeObjectKey(key);
    return `${this.url}/storage/v1/object/public/${this.bucket}/${encodeURI(k)}`;
  }

  async deleteObject(_key: string): Promise<void> {
    throw new Error("Supabase adapter not available in local harness (no SDK)");
  }

  async getObject(_key: string): Promise<Uint8Array> {
    throw new Error("Supabase adapter not available in local harness (no SDK)");
  }
}

export class S3ObjectStorageAdapter implements IObjectStorageAdapter {
  public readonly driver: ObjectStorageDriver = "s3";
  public readonly bucket: string;
  private readonly region: string;
  private readonly endpoint?: string;
  private readonly forcePathStyle: boolean;
  private readonly publicBaseUrl?: string;
  private readonly client: S3Client;

  constructor(params: {
    bucket: string;
    region: string;
    endpoint?: string;
    forcePathStyle?: boolean;
    publicBaseUrl?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
  }) {
    this.bucket = params.bucket.trim();
    this.region = params.region.trim();
    this.endpoint = params.endpoint?.trim() || undefined;
    this.forcePathStyle = params.forcePathStyle ?? Boolean(this.endpoint);
    this.publicBaseUrl = params.publicBaseUrl?.trim().replace(/\/+$/, "") || undefined;
    if (!this.bucket || !this.region) {
      throw new Error("Invalid s3 object storage config");
    }
    const accessKeyId = params.accessKeyId?.trim();
    const secretAccessKey = params.secretAccessKey?.trim();
    const sessionToken = params.sessionToken?.trim();
    const hasAccessKey = Boolean(accessKeyId);
    const hasSecretKey = Boolean(secretAccessKey);
    if (hasAccessKey !== hasSecretKey) {
      throw new Error("Invalid s3 credentials: access key and secret key must be configured together");
    }
    this.client = new S3Client({
      region: this.region,
      ...(this.endpoint ? { endpoint: this.endpoint } : {}),
      forcePathStyle: this.forcePathStyle,
      ...(hasAccessKey && hasSecretKey
        ? {
            credentials: {
              accessKeyId: accessKeyId as string,
              secretAccessKey: secretAccessKey as string,
              ...(sessionToken ? { sessionToken } : {}),
            },
          }
        : {}),
    });
  }

  private resolveObjectUrl(key: string): string {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl}/${encodeURI(key)}`;
    }
    if (this.endpoint) {
      const normalizedEndpoint = this.endpoint.replace(/\/+$/, "");
      if (this.forcePathStyle) {
        return `${normalizedEndpoint}/${this.bucket}/${encodeURI(key)}`;
      }
      try {
        const parsed = new URL(normalizedEndpoint);
        const host = `${this.bucket}.${parsed.host}`;
        return `${parsed.protocol}//${host}/${encodeURI(key)}`;
      } catch {
        return `${normalizedEndpoint}/${this.bucket}/${encodeURI(key)}`;
      }
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${encodeURI(key)}`;
  }

  getPublicUrl(key: string): string {
    const k = normalizeObjectKey(this.resolveStorageKey(key));
    return this.resolveObjectUrl(k);
  }

  async putObject(key: string, content: Uint8Array, contentType?: string): Promise<{ key: string }> {
    const k = normalizeObjectKey(this.resolveStorageKey(key));
    // 图片类型必须设置 inline，否则浏览器会下载而非内嵌渲染
    const isImage = contentType?.startsWith("image/");
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: k,
        Body: content,
        ...(contentType ? { ContentType: contentType } : {}),
        ...(isImage ? { ContentDisposition: "inline" } : {}),
      }),
    );
    return { key: k };
  }

  /**
   * 获取对象的完整存储 key（包含 S3_BASE_PREFIX 前缀）
   * 用于统一处理 putObject 和 getSignedUrl 的前缀逻辑
   */
  private resolveStorageKey(key: string): string {
    const prefix = process.env.S3_BASE_PREFIX?.trim();
    // 如果配置了前缀且 key 不以该前缀开头，则添加前缀
    if (prefix && !key.startsWith(prefix)) {
      return prefix + key;
    }
    return key;
  }

  /**
   * 获取对象的签名 URL
   * 支持 GET 下载和 PUT 上传
   * PUT 上传时通过 S3 预签名 URL 实现
   */
  async getSignedUrl(key: string, options?: ISignedUrlOptions): Promise<string> {
    const k = normalizeObjectKey(this.resolveStorageKey(key));
    const method = options?.method || "GET";

    // PUT 方法：生成预签名 URL
    if (method === "PUT") {
      const expiresInSec = options?.expiresInSec || 3600;
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: k,
        ...(options?.contentType ? { ContentType: options.contentType } : {}),
      });
      return await s3GetSignedUrl(this.client, command, { expiresIn: expiresInSec });
    }

    // GET 方法：如果有 publicBaseUrl，返回公开 URL
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl}/${encodeURI(k)}`;
    }

    // 否则返回默认 URL
    return this.resolveObjectUrl(k);
  }

  async deleteObject(key: string): Promise<void> {
    const k = normalizeObjectKey(this.resolveStorageKey(key));
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: k,
      }),
    );
  }

  async getObject(key: string): Promise<Uint8Array> {
    const k = normalizeObjectKey(this.resolveStorageKey(key));
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: k,
      }),
    );
    if (!response.Body) {
      throw new Error(`Empty response body for key: ${k}`);
    }
    const arrayBuffer = await new Response(response.Body as ReadableStream).arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }
}

/**
 * 阿里云 OSS 存储适配器
 * 使用 ali-oss SDK 实现
 */
export class AliOssStorageAdapter implements IObjectStorageAdapter {
  public readonly driver: ObjectStorageDriver = "alioss";
  public readonly bucket: string;
  private readonly region: string;
  private readonly endpoint: string;
  private readonly publicBaseUrl?: string;
  private readonly client: import("ali-oss").OSS;

  constructor(params: {
    bucket: string;
    region: string;
    endpoint?: string;
    publicBaseUrl?: string;
    accessKeyId: string;
    accessKeySecret: string;
    stsToken?: string;
  }) {
    this.bucket = params.bucket.trim();
    this.region = params.region.trim();
    this.endpoint = params.endpoint?.trim() || `https://oss-${this.region}.aliyuncs.com`;
    this.publicBaseUrl = params.publicBaseUrl?.trim().replace(/\/+$/, "") || undefined;

    if (!this.bucket || !this.region || !params.accessKeyId || !params.accessKeySecret) {
      throw new Error("Invalid aliyun OSS config: bucket, region, accessKeyId, accessKeySecret are required");
    }

    // 动态导入 ali-oss
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const OSS = require("ali-oss");

    this.client = new OSS({
      region: this.region,
      bucket: this.bucket,
      endpoint: this.endpoint,
      accessKeyId: params.accessKeyId.trim(),
      accessKeySecret: params.accessKeySecret.trim(),
      stsToken: params.stsToken?.trim() || undefined,
      secure: true, // 使用 HTTPS
    });
  }

  /**
   * 获取对象的完整存储 key（包含 S3_BASE_PREFIX 前缀）
   */
  private resolveStorageKey(key: string): string {
    const prefix = process.env.S3_BASE_PREFIX?.trim();
    if (prefix && !key.startsWith(prefix)) {
      return prefix + key;
    }
    return key;
  }

  async putObject(key: string, content: Uint8Array, contentType?: string): Promise<{ key: string }> {
    const k = normalizeObjectKey(this.resolveStorageKey(key));
    // 图片类型必须设置 Content-Disposition: inline，否则阿里云 OSS 默认 attachment 导致浏览器下载而非内嵌渲染
    const headers: Record<string, string> = {};
    if (contentType) {
      headers["Content-Type"] = contentType;
    }
    if (contentType?.startsWith("image/")) {
      headers["Content-Disposition"] = "inline";
    }
    await this.client.put(k, Buffer.from(content), {
      headers,
    });
    return { key: k };
  }

  /**
   * 获取对象的签名 URL
   * 支持 GET 下载和 PUT 上传
   */
  async getSignedUrl(key: string, options?: ISignedUrlOptions): Promise<string> {
    const k = normalizeObjectKey(this.resolveStorageKey(key));
    const method = options?.method || "GET";
    const expiresInSec = options?.expiresInSec || 3600;

    // PUT 方法：生成预签名 URL
    if (method === "PUT") {
      const url = this.client.signatureUrl(k, {
        method: "PUT",
        expires: expiresInSec,
        "Content-Type": options?.contentType || "application/octet-stream",
      });
      return url;
    }

    // GET 方法：如果有 publicBaseUrl，返回公开 URL
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl}/${encodeURI(k)}`;
    }

    // 否则生成签名 URL
    return this.client.signatureUrl(k, {
      method: "GET",
      expires: expiresInSec,
      response: options?.downloadName
        ? {
            "content-disposition": `attachment; filename="${encodeURIComponent(options.downloadName)}"`,
          }
        : undefined,
    });
  }

  getPublicUrl(key: string): string {
    const k = normalizeObjectKey(this.resolveStorageKey(key));
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl}/${encodeURI(k)}`;
    }
    return `https://${this.bucket}.${encodeURI(this.endpoint.replace(/^https?:\/\//, ""))}/${encodeURI(k)}`;
  }

  async deleteObject(key: string): Promise<void> {
    const k = normalizeObjectKey(this.resolveStorageKey(key));
    await this.client.delete(k);
  }

  async getObject(key: string): Promise<Uint8Array> {
    const k = normalizeObjectKey(this.resolveStorageKey(key));
    const result = await this.client.get(k);
    if (!result?.content) {
      throw new Error(`Empty response for key: ${k}`);
    }
    // ali-oss client.get() 返回的 content 是 Buffer，直接转为 Uint8Array
    const content = result.content;
    if (Buffer.isBuffer(content)) {
      return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
    }
    return new Uint8Array(content as unknown as ArrayBuffer);
  }
}
