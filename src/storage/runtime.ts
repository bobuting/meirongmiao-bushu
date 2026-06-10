import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { IObjectStorageAdapter } from "../contracts/object-storage.js";
import {
  AliOssStorageAdapter,
  LocalObjectStorageAdapter,
  S3ObjectStorageAdapter,
  SupabaseObjectStorageAdapter,
} from "./adapters.js";

const runtimeModuleDir = dirname(fileURLToPath(import.meta.url));
const projectRootDir = resolve(runtimeModuleDir, "../..");
const defaultLocalObjectStorageDir = join("data", "object-storage");

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

export function resolveObjectStorageLocalRoot(rawRootDir: string | undefined): string {
  const normalized = rawRootDir?.trim();
  if (!normalized) {
    return resolve(projectRootDir, defaultLocalObjectStorageDir);
  }
  if (isAbsolute(normalized)) {
    return resolve(normalized);
  }
  return resolve(projectRootDir, normalized);
}

export function createObjectStorageAdapter(): IObjectStorageAdapter | null {
  const driver = (process.env.OBJECT_STORAGE_DRIVER ?? "local").trim().toLowerCase();
  if (driver === "local") {
    const bucket = process.env.OBJECT_STORAGE_BUCKET?.trim() || "app";
    const rootDir = resolveObjectStorageLocalRoot(process.env.OBJECT_STORAGE_LOCAL_DIR);
    const publicBaseUrl = process.env.OBJECT_STORAGE_PUBLIC_BASE?.trim() || "/storage/objects";
    return new LocalObjectStorageAdapter({ bucket, rootDir, publicBaseUrl });
  }
  if (driver === "supabase") {
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_ANON_KEY?.trim();
    const bucket = process.env.OBJECT_STORAGE_BUCKET?.trim();
    if (url && key && bucket) {
      return new SupabaseObjectStorageAdapter({ url, key, bucket });
    }
    return null;
  }
  if (driver === "s3") {
    const bucket = process.env.OBJECT_STORAGE_BUCKET?.trim();
    const region = process.env.S3_REGION?.trim();
    const endpoint = process.env.S3_ENDPOINT?.trim();
    const publicBaseUrl = process.env.OBJECT_STORAGE_S3_PUBLIC_BASE?.trim();
    const forcePathStyle =
      readOptionalBoolean(process.env.S3_FORCE_PATH_STYLE) ?? Boolean(endpoint && endpoint.length > 0);
    const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim() || process.env.AWS_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim() || process.env.AWS_SECRET_ACCESS_KEY?.trim();
    const sessionToken = process.env.S3_SESSION_TOKEN?.trim() || process.env.AWS_SESSION_TOKEN?.trim();
    if (bucket && region) {
      return new S3ObjectStorageAdapter({
        bucket,
        region,
        endpoint,
        publicBaseUrl,
        forcePathStyle,
        accessKeyId,
        secretAccessKey,
        sessionToken,
      });
    }
    return null;
  }
  // 阿里云 OSS 原生 SDK
  if (driver === "alioss") {
    const bucket = process.env.OBJECT_STORAGE_BUCKET?.trim();
    const region = process.env.OSS_REGION?.trim() || process.env.S3_REGION?.trim();
    const endpoint = process.env.OSS_ENDPOINT?.trim();
    const publicBaseUrl = process.env.OBJECT_STORAGE_S3_PUBLIC_BASE?.trim();
    const accessKeyId = process.env.OSS_ACCESS_KEY_ID?.trim() || process.env.S3_ACCESS_KEY_ID?.trim();
    const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET?.trim() || process.env.S3_SECRET_ACCESS_KEY?.trim();
    const stsToken = process.env.OSS_STS_TOKEN?.trim();
    if (bucket && region && accessKeyId && accessKeySecret) {
      return new AliOssStorageAdapter({
        bucket,
        region,
        endpoint,
        publicBaseUrl,
        accessKeyId,
        accessKeySecret,
        stsToken,
      });
    }
    return null;
  }
  return null;
}
