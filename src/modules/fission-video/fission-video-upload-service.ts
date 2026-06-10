/**
 * 裂变视频上传服务
 * 职责：业务逻辑封装，路径构建，类别映射
 */

import type { IObjectStorageAdapter } from "../../contracts/object-storage.js";
import { getOssService, type OssUploadResult, type OssConfig } from "../../service/oss/oss-service.js";

/**
 * 存储路径类别
 */
export type FissionVideoCategory =
  | 'fission_video'      // 裂变视频
  | 'storyboard'         // 分镜视频
  | 'mirror'             // 镜像视频
  | 'storyboard_image'   // 分镜图片
  | 'thumbnail';         // 缩略图

/**
 * 路径类别映射配置
 */
const CATEGORY_PATHS: Record<FissionVideoCategory, string> = {
  fission_video: 'fission/new_video',
  storyboard: 'fission/storyboard',
  mirror: 'fission/mirror',
  storyboard_image: 'fission/storyboard_image',
  thumbnail: 'fission/thumbnail',
};

/**
 * MIME 类型映射
 */
const CATEGORY_MIME_TYPES: Record<FissionVideoCategory, string> = {
  fission_video: 'video/mp4',
  storyboard: 'video/mp4',
  mirror: 'video/mp4',
  storyboard_image: 'image/png',
  thumbnail: 'image/png',
};

/**
 * 上传结果（业务层）
 */
export interface FissionVideoUploadResult extends OssUploadResult {
  category: FissionVideoCategory;
  projectId: string;
}

/**
 * 构建存储路径
 * @param category 类别
 * @param projectId 项目 ID
 * @param filename 文件名
 * @returns 完整存储路径
 */
export function buildStoragePath(
  category: FissionVideoCategory,
  projectId: string,
  filename: string
): string {
  const categoryPath = CATEGORY_PATHS[category];
  return `projects/${projectId}/${categoryPath}/${filename}`;
}

/**
 * 上传裂变视频
 * @param storage 存储适配器
 * @param projectId 项目 ID
 * @param filename 文件名
 * @param content 视频内容
 * @param publicBaseUrl 公开访问基础 URL（可选）
 * @returns 上传结果
 */
export async function uploadFissionVideo(
  storage: IObjectStorageAdapter,
  projectId: string,
  filename: string,
  content: Buffer | Uint8Array,
  publicBaseUrl?: string
): Promise<FissionVideoUploadResult> {
  const ossService = getOssService(storage, { publicBaseUrl });
  const key = buildStoragePath('fission_video', projectId, filename);
  const result = await ossService.upload(key, content, CATEGORY_MIME_TYPES.fission_video);
  return { ...result, category: 'fission_video', projectId };
}

/**
 * 上传分镜视频
 * @param storage 存储适配器
 * @param projectId 项目 ID
 * @param filename 文件名
 * @param content 视频内容
 * @param publicBaseUrl 公开访问基础 URL（可选）
 * @returns 上传结果
 */
export async function uploadStoryboardVideo(
  storage: IObjectStorageAdapter,
  projectId: string,
  filename: string,
  content: Buffer | Uint8Array,
  publicBaseUrl?: string
): Promise<FissionVideoUploadResult> {
  const ossService = getOssService(storage, { publicBaseUrl });
  const key = buildStoragePath('storyboard', projectId, filename);
  const result = await ossService.upload(key, content, CATEGORY_MIME_TYPES.storyboard);
  return { ...result, category: 'storyboard', projectId };
}

/**
 * 上传镜像视频
 * @param storage 存储适配器
 * @param projectId 项目 ID
 * @param filename 文件名
 * @param content 视频内容
 * @param publicBaseUrl 公开访问基础 URL（可选）
 * @returns 上传结果
 */
export async function uploadMirrorVideo(
  storage: IObjectStorageAdapter,
  projectId: string,
  filename: string,
  content: Buffer | Uint8Array,
  publicBaseUrl?: string
): Promise<FissionVideoUploadResult> {
  const ossService = getOssService(storage, { publicBaseUrl });
  const key = buildStoragePath('mirror', projectId, filename);
  const result = await ossService.upload(key, content, CATEGORY_MIME_TYPES.mirror);
  return { ...result, category: 'mirror', projectId };
}

/**
 * 上传分镜图片
 * @param storage 存储适配器
 * @param projectId 项目 ID
 * @param filename 文件名
 * @param content 图片内容
 * @param publicBaseUrl 公开访问基础 URL（可选）
 * @returns 上传结果
 */
export async function uploadStoryboardImage(
  storage: IObjectStorageAdapter,
  projectId: string,
  filename: string,
  content: Buffer | Uint8Array,
  publicBaseUrl?: string
): Promise<FissionVideoUploadResult> {
  const ossService = getOssService(storage, { publicBaseUrl });
  const key = buildStoragePath('storyboard_image', projectId, filename);
  const result = await ossService.upload(key, content, CATEGORY_MIME_TYPES.storyboard_image);
  return { ...result, category: 'storyboard_image', projectId };
}

/**
 * 上传缩略图
 * @param storage 存储适配器
 * @param projectId 项目 ID
 * @param filename 文件名
 * @param content 图片内容
 * @param publicBaseUrl 公开访问基础 URL（可选）
 * @returns 上传结果
 */
export async function uploadThumbnail(
  storage: IObjectStorageAdapter,
  projectId: string,
  filename: string,
  content: Buffer | Uint8Array,
  publicBaseUrl?: string
): Promise<FissionVideoUploadResult> {
  const ossService = getOssService(storage, { publicBaseUrl });
  const key = buildStoragePath('thumbnail', projectId, filename);
  const result = await ossService.upload(key, content, CATEGORY_MIME_TYPES.thumbnail);
  return { ...result, category: 'thumbnail', projectId };
}

/**
 * 通过 URL 获取文件内容
 * @param storage 存储适配器
 * @param url 文件 URL
 * @param publicBaseUrl 公开访问基础 URL（可选）
 * @returns 文件内容
 */
export async function fetchVideoByUrl(
  storage: IObjectStorageAdapter,
  url: string,
  publicBaseUrl?: string
): Promise<Buffer> {
  const ossService = getOssService(storage, { publicBaseUrl });
  return ossService.fetchByUrl(url);
}

/**
 * 获取存储访问 URL
 * @param storage 存储适配器
 * @param key 存储路径
 * @param publicBaseUrl 公开访问基础 URL（可选）
 * @returns 访问 URL
 */
export async function getStorageUrl(storage: IObjectStorageAdapter, key: string, publicBaseUrl?: string): Promise<string> {
  const ossService = getOssService(storage, { publicBaseUrl });
  return await ossService.getUrl(key);
}

/**
 * 通用上传方法（支持自定义类别和 MIME 类型）
 * @param storage 存储适配器
 * @param category 类别
 * @param projectId 项目 ID
 * @param filename 文件名
 * @param content 文件内容
 * @param contentType MIME 类型
 * @param publicBaseUrl 公开访问基础 URL（可选）
 * @returns 上传结果
 */
export async function uploadFile(
  storage: IObjectStorageAdapter,
  category: FissionVideoCategory,
  projectId: string,
  filename: string,
  content: Buffer | Uint8Array,
  contentType?: string,
  publicBaseUrl?: string
): Promise<FissionVideoUploadResult> {
  const ossService = getOssService(storage, { publicBaseUrl });
  const key = buildStoragePath(category, projectId, filename);
  const mimeType = contentType || CATEGORY_MIME_TYPES[category];
  const result = await ossService.upload(key, content, mimeType);
  return { ...result, category, projectId };
}

/**
 * 删除文件
 * @param storage 存储适配器
 * @param key 存储路径
 * @param publicBaseUrl 公开访问基础 URL（可选）
 * @returns 是否删除成功
 */
export async function deleteFile(
  storage: IObjectStorageAdapter,
  key: string,
  publicBaseUrl?: string
): Promise<boolean> {
  const ossService = getOssService(storage, { publicBaseUrl });
  return ossService.delete(key);
}