import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { User } from "../contracts/types.js";
import type { FileBusinessDomain, FileBusinessSubdomain } from "../contracts/file-registry-contract.js";
import { AppError } from "../core/errors.js";
import OSS from "ali-oss";
import { getLogger } from "../core/logger/index.js";
const log = getLogger("library-asset-upload-routes");

/**
 * 路由依赖注入接口
 */
interface LibraryAssetUploadRouteDependencies {
  requireUser: (ctx: AppContext, request: FastifyRequest) => Promise<User>;
}

/**
 * STS 凭证响应
 */
interface StsCredentialResponse {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  expiration: string;
  bucket: string;
  region: string;
  endpoint: string;
  dir: string;  // 允许上传的目录前缀
}

/**
 * 签名上传 URL 请求参数
 */
interface SignUploadUrlRequest {
  /** 文件名（用于生成存储路径） */
  filename: string;
  /** 文件 Content-Type */
  contentType: string;
  /** 项目 ID（可选，资产库上传可不传） */
  projectId?: string;
  /** 是否为资产库上传（不关联具体项目） */
  forLibrary?: boolean;
  /** 业务域（可选，用于文件注册） */
  businessDomain?: FileBusinessDomain;
  /** 业务子域（可选，用于文件注册） */
  businessSubdomain?: FileBusinessSubdomain;
}

/**
 * 签名上传 URL 响应
 */
interface SignUploadUrlResponse {
  /** 带签名的上传 URL（前端直接 PUT） */
  uploadUrl: string;
  /** 存储路径（用于后续构建访问 URL） */
  objectKey: string;
  /** 文件访问 URL */
  fileUrl: string;
  /** URL 过期时间（秒） */
  expiresInSeconds: number;
  /** 文件注册记录 ID（预注册） */
  fileRegistryId?: string;
}

/**
 * 获取签名上传 URL 路由
 * 前端直接 PUT 到返回的 uploadUrl，无需暴露任何凭证
 */
export async function getSignUploadUrlRoute(
  request: FastifyRequest,
  ctx: AppContext,
  dependencies: LibraryAssetUploadRouteDependencies
): Promise<SignUploadUrlResponse> {
  const user = await dependencies.requireUser(ctx, request);
  const body = request.body as SignUploadUrlRequest;
  const { filename, contentType, projectId, forLibrary, businessDomain, businessSubdomain } = body;

  // 验证必填参数
  if (!filename || typeof filename !== "string" || !filename.trim()) {
    throw new AppError(400, "FILENAME_REQUIRED", "filename is required");
  }
  if (!contentType || typeof contentType !== "string" || !contentType.trim()) {
    throw new AppError(400, "CONTENT_TYPE_REQUIRED", "contentType is required");
  }

  // 确定上传目录
  let dir: string;
  if (forLibrary) {
    // 资产库上传模式：使用用户固定目录
    dir = `storage/media/library/${user.id}/`;
  } else {
    // 项目关联模式：验证项目存在且属于当前用户
    if (!projectId || typeof projectId !== "string" || !projectId.trim()) {
      throw new AppError(400, "PROJECT_ID_REQUIRED", "projectId is required when not in library mode");
    }

    const project = await ctx.repos.projects.findById(projectId.trim());
    if (!project || project.userId !== user.id) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "项目不存在或无权限");
    }

    dir = `storage/media/library/${user.id}/${projectId.trim()}/`;
  }

  // 生成存储路径
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const ext = filename.includes(".") ? "." + filename.split(".").pop() : "";
  const objectKey = `${dir}${timestamp}_${randomSuffix}${ext}`;

  // 生成签名 URL
  const { uploadUrl, fileUrl, expiresInSeconds } = await generateSignedUploadUrl(objectKey, contentType);

  // 预注册文件记录（ref_count = 0，等待上传确认）
  let fileRegistryId: string | undefined;
  try {
    const registryId = ctx.clock.generateId();
    await ctx.repos.fileRegistry.insert({
      id: registryId,
      uploaderId: user.id,
      uploaderType: "user",
      storageKey: objectKey,
      storageDriver: ctx.storage?.driver === "alioss" ? "alioss" : "local",
      publicUrl: fileUrl,
      contentSha256: "", // 上传后才能计算，暂时为空
      fileType: contentType.startsWith("image/") ? "image" : contentType.startsWith("video/") ? "video" : "document",
      contentType,
      fileSizeBytes: 0, // 上传后才能确定，暂时为 0
      fileName: filename,
      businessDomain: businessDomain ?? (forLibrary ? "library" : "project"),
      businessSubdomain: businessSubdomain ?? "media_persist",
      businessTags: projectId ? { projectId } : {},
      refCount: 0, // 预注册，ref_count = 0
      firstRefEntity: "",
      firstRefEntityId: "",
      environment: process.env.NODE_ENV === "production" ? "production" : "test",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    fileRegistryId = registryId;
    log.info({ objectKey, fileRegistryId, userId: user.id }, "预注册文件记录成功");
  } catch (error) {
    // 预注册失败不影响上传，只记录日志
    log.warn({ error, objectKey, userId: user.id }, "预注册文件记录失败（不影响上传）");
  }

  return { uploadUrl, objectKey, fileUrl, expiresInSeconds, fileRegistryId };
}

/**
 * 生成签名上传 URL（内部函数）
 */
async function generateSignedUploadUrl(
  objectKey: string,
  contentType: string
): Promise<{ uploadUrl: string; fileUrl: string; expiresInSeconds: number }> {
  // 从环境变量获取 OSS 配置
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID?.trim() || process.env.S3_ACCESS_KEY_ID?.trim();
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET?.trim() || process.env.S3_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.OBJECT_STORAGE_BUCKET?.trim();
  const region = process.env.OSS_REGION?.trim() || process.env.S3_REGION?.trim();
  const endpoint = process.env.OSS_ENDPOINT?.trim() || process.env.S3_ENDPOINT?.trim() || `https://${region}.aliyuncs.com`;

  if (!accessKeyId || !accessKeySecret || !bucket || !region) {
    throw new AppError(503, "OSS_NOT_CONFIGURED", "OSS 服务未配置");
  }

  // 签名有效期（15 分钟）
  const expiresInSeconds = 900;

  const store = new OSS({
    region,
    bucket,
    accessKeyId,
    accessKeySecret,
    secure: true,
  });

  // 生成签名 PUT URL（包含 x-oss-object-acl header）
  // 注意：必须与前端发送的 header 一致，否则签名验证失败
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uploadUrl = (store as any).signatureUrl(objectKey, {
    method: "PUT",
    expires: expiresInSeconds,
    "Content-Type": contentType,
    "x-oss-object-acl": "public-read",
  });

  // 构建文件访问 URL
  const endpointHost = endpoint.replace(/^https?:\/\//, "");
  const fileUrl = `https://${bucket}.${endpointHost}/${objectKey}`;

  return { uploadUrl, fileUrl, expiresInSeconds };
}

/**
 * 删除文件路由（已禁用）
 * 文件注册中心不支持手动删除，避免破坏引用关系
 */
export async function deleteFileRoute(
  request: FastifyRequest,
  ctx: AppContext,
  dependencies: LibraryAssetUploadRouteDependencies
): Promise<{ ok: boolean }> {
  throw new AppError(403, "DELETE_DISABLED", "文件删除功能已禁用，请联系管理员处理");
}

/**
 * 获取 STS 临时凭证请求参数
 */
interface StsCredentialRequest {
  projectId?: string;
  /** 是否为资产库上传（不关联具体项目） */
  forLibrary?: boolean;
}

/**
 * 获取 STS 临时凭证路由
 * 用于前端使用 ali-oss SDK 直传 OSS
 * @deprecated 建议使用 getSignUploadUrlRoute，更安全（凭证不暴露给前端）
 */
export async function getStsCredentialRoute(
  request: FastifyRequest,
  ctx: AppContext,
  dependencies: LibraryAssetUploadRouteDependencies
): Promise<StsCredentialResponse> {
  const user = await dependencies.requireUser(ctx, request);
  const body = request.body as StsCredentialRequest;
  const { projectId, forLibrary } = body;

  // 资产库上传模式：不验证项目，使用固定目录
  if (forLibrary) {
    return buildStsCredentialResponse(user, `storage/media/library/${user.id}/`);
  }

  // 项目关联模式：验证项目存在且属于当前用户
  if (!projectId || typeof projectId !== "string" || !projectId.trim()) {
    throw new AppError(400, "PROJECT_ID_REQUIRED", "projectId is required");
  }

  const project = await ctx.repos.projects.findById(projectId.trim());
  if (!project || project.userId !== user.id) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "项目不存在或无权限");
  }

  return buildStsCredentialResponse(user, `storage/media/library/${user.id}/${projectId.trim()}/`);
}

/**
 * 构建 STS 凭证响应
 */
async function buildStsCredentialResponse(
  user: User,
  dir: string
): Promise<StsCredentialResponse> {

  // 从环境变量获取 STS 配置
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID?.trim() || process.env.S3_ACCESS_KEY_ID?.trim();
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET?.trim() || process.env.S3_SECRET_ACCESS_KEY?.trim();
  const roleArn = process.env.OSS_STS_ROLE_ARN?.trim();
  const bucket = process.env.OBJECT_STORAGE_BUCKET?.trim();
  const region = process.env.OSS_REGION?.trim() || process.env.S3_REGION?.trim();
  const endpoint = process.env.OSS_ENDPOINT?.trim() || process.env.S3_ENDPOINT?.trim() || `https://${region}.aliyuncs.com`;

  if (!accessKeyId || !accessKeySecret || !bucket || !region) {
    throw new AppError(503, "STS_NOT_CONFIGURED", "STS 服务未配置");
  }

  // 如果配置了 RAM 角色，使用 STS AssumeRole 获取临时凭证
  if (roleArn) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const STS = (OSS as any).STS;
    const stsClient = new STS({
      accessKeyId,
      accessKeySecret,
    });

    // 限制用户只能上传到自己的目录
    const policy = {
      Version: "1",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "oss:PutObject",
            "oss:GetObject",
            "oss:DeleteObject",
          ],
          Resource: [
            `acs:oss:*:*:${bucket}/storage/media/library/${user.id}/*`,
          ],
        },
      ],
    };

    const result = await stsClient.assumeRole(
      roleArn,
      policy,
      3600, // 1 小时有效期
      `user-${user.id}-${Date.now()}`
    );

    return {
      accessKeyId: result.Credentials.AccessKeyId,
      accessKeySecret: result.Credentials.AccessKeySecret,
      securityToken: result.Credentials.SecurityToken,
      expiration: result.Credentials.Expiration,
      bucket,
      region,
      endpoint,
      dir,
    };
  }

  // 如果没有配置 RAM 角色，返回主账号凭证（仅限开发环境使用）
  // 生产环境强烈建议配置 OSS_STS_ROLE_ARN
  log.warn("STS 未配置 OSS_STS_ROLE_ARN，返回主账号凭证（仅限开发环境）");

  return {
    accessKeyId,
    accessKeySecret,
    securityToken: "",
    expiration: new Date(Date.now() + 3600 * 1000).toISOString(),
    bucket,
    region,
    endpoint,
    dir,
  };
}

/**
 * 注册上传路由
 */
export function registerLibraryAssetUploadRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  dependencies: LibraryAssetUploadRouteDependencies
): void {
  // 获取签名上传 URL（推荐，更安全）
  app.post("/library/assets/sign-upload-url", async (request) => {
    return getSignUploadUrlRoute(request, ctx, dependencies);
  });

  // 删除文件（服务端代理删除）
  app.post("/library/assets/delete-file", async (request) => {
    return deleteFileRoute(request, ctx, dependencies);
  });

  // 获取 STS 临时凭证（用于前端 ali-oss SDK 直传）
  // @deprecated 建议使用 /library/assets/sign-upload-url
  app.post("/library/assets/sts-credential", async (request) => {
    return getStsCredentialRoute(request, ctx, dependencies);
  });
}
