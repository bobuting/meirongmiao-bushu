/**
 * Repository Ports 统一导出
 */

// 公共类型
export type { IRepositoryClock } from "./common.js";

// 用户
export type { IUserRepository, ISessionRepository } from "./user-repository.js";

// Provider
export type { IProviderRepository, IProviderSecretRepository, IProviderPolicyRepository } from "./provider-repository.js";

// 资产
export type { IAssetRepository, IOutfitPlanRepository } from "./asset-repository.js";

// 服饰资产
export type { IGarmentAssetRepository, IProjectGarmentAssocRepository } from "./garment-repository.js";

// 项目
export type { IProjectRepository } from "./project-repository.js";

// 角色
export type { ILibraryCharacterRepository } from "./library-repository.js";

// 项目角色
export type { IProjectCharacterRepository } from "./library-repository.js";

// 脚本
export type { IScriptVersionRepository } from "./script-repository.js";

// 主题
export type { IThemeRepository, IUserThemePreferenceRepository } from "./theme-repository.js";

// 反向
export type { IReverseTaskRepository, IReverseAttemptRepository, IReverseTraceRepository, ISourceCredentialRepository } from "./reverse-repository.js";

// 库存
export type {
  ILibraryScriptRepository,
  ILibraryScriptVersionRepository,
  IReverseStoryboardLibraryRepository,
  IReverseStoryboardLibraryVersionRepository,
  ISmartStoryboardLibraryRepository,
  ISmartStoryboardLibraryVersionRepository,
} from "./library-repository.js";

// 审核
export type { IReviewRequestRepository, IPublicResourceRepository } from "./review-repository.js";

// 积分
export type { ICreditRepository } from "./credit-repository.js";

// 系统
export type { IConfigRepository, IDeadLetterRepository, IVideoMusicRepository } from "./system-repository.js";

// 文件注册
export type { IFileRegistryRepository } from "./file-registry-repository.js";

// 项目-视频音乐
export type { IProjectVideoMusicRepository, BatchSaveProjectVideoMusicInput, ProjectVideoMusicUpdatePatch } from "./project-video-music-repository.js";