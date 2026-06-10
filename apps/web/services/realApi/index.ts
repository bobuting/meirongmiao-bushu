/**
 * realApi/index.ts - Real API 模块统一入口
 * 将所有按域拆分的 API 实现合并为一个统一的 realBackendApi 对象
 */

import { realAuthApi, type RealAuthApi } from "./auth";
import { realProjectsApi, type RealProjectsApi } from "./projects";
import { realStep1Api, type RealStep1Api } from "./step1";
import { realStep2Api, type RealStep2Api } from "./step2";
import { realStep3Api, type RealStep3Api } from "./step3";
import { realVideoApi, type RealVideoApi } from "./video";
import { realDouyinApi, type RealDouyinApi } from "./douyin";
import { realCreditsApi, type RealCreditsApi } from "./credits";
import { realThemesApi, type RealThemesApi } from "./themes";
import { realAdminApi, type RealAdminApi } from "./admin/index";
import { realLibraryApi, type RealLibraryApi } from "./library";
import { realReverseApi, type RealReverseApi } from "./reverse";
import { realSquareApi, type RealSquareApi } from "./square";
import { realStoryboardApi, type RealStoryboardApi } from "./storyboard";
import { realGarmentAssetsApi, type RealGarmentAssetsApi } from "./garment-assets";
import { realProjectGarmentAssocApi, type RealProjectGarmentAssocApi } from "./project-garment-assoc";
import { announcementApi, type RealAnnouncementApi } from "./announcement";
// shot-prompts.ts 已删除：独立路由已弃用，使用 storyboard/shot-prompts/* 替代
import { realFileRegistryApi, type RealFileRegistryApi } from "./fileRegistry";
import { realImageStep4Api, type RealImageStep4Api } from "./image-step4";
import { imageStep1Api, type ImageStep1Api } from "./image-step1";
import { imageStep2Api, type ImageStep2Api } from "./image-step2";
import { imageStep3Api, type ImageStep3Api } from "./image-step3";
import { realProjectCharactersApi, type RealProjectCharactersApi } from "./project-characters";
import { realBusinessConfigApi, type RealBusinessConfigApi } from "./businessConfig";
import { realOutfitChangeApi, type RealOutfitChangeApi } from "./outfit-change";
import { realRuntimeConfigApi, type RealRuntimeConfigApi } from "./runtime-config";
import { realActionTemplatesApi, type RealActionTemplatesApi } from "./action-templates";
import { realActionTransferApi, type RealActionTransferApi } from "./action-transfer";
import {
  adminAestheticLibraryApi,
  type AdminAestheticLibraryApi,
} from "./admin-aesthetic-library";
import {
  adminSceneLibraryApi,
  type AdminSceneLibraryApi,
} from "./admin-scene-library";
import { createVideoMusicRealBackendApi, type VideoMusicBackendApiShape } from "../backendApi.videoMusic";
import { request } from "../backendApi.request";

// 导出所有子模块类型
export type {
  RealAuthApi,
  RealProjectsApi,
  RealStep1Api,
  RealStep2Api,
  RealStep3Api,
  RealVideoApi,
  RealDouyinApi,
  RealCreditsApi,
  RealThemesApi,
  RealAdminApi,
  RealLibraryApi,
  RealReverseApi,
  RealSquareApi,
  RealStoryboardApi,
  RealGarmentAssetsApi,
  RealProjectGarmentAssocApi,
  RealAnnouncementApi,
  ImageStep1Api,
  ImageStep2Api,
  ImageStep3Api,
  RealFileRegistryApi,
  RealImageStep4Api,
  RealProjectCharactersApi,
  RealBusinessConfigApi,
  RealOutfitChangeApi,
  RealRuntimeConfigApi,
  AdminAestheticLibraryApi,
  AdminSceneLibraryApi,
  RealActionTemplatesApi,
  RealActionTransferApi,
};

// 导出所有子模块
export {
  realAuthApi,
  realProjectsApi,
  realStep1Api,
  realStep2Api,
  realStep3Api,
  realVideoApi,
  realDouyinApi,
  realCreditsApi,
  realThemesApi,
  realAdminApi,
  realLibraryApi,
  realReverseApi,
  realSquareApi,
  realStoryboardApi,
  realGarmentAssetsApi,
  realProjectGarmentAssocApi,
  realFileRegistryApi,
  realImageStep4Api,
  realProjectCharactersApi,
  realBusinessConfigApi,
  realOutfitChangeApi,
  realRuntimeConfigApi,
  realActionTemplatesApi,
  realActionTransferApi,
};

/**
 * 合并后的 RealBackendApi 类型
 * 包含所有拆分模块的方法
 */
export type RealBackendApi = RealAuthApi &
  RealProjectsApi &
  RealStep1Api &
  RealStep2Api &
  RealStep3Api &
  RealVideoApi &
  VideoMusicBackendApiShape &
  RealDouyinApi &
  RealCreditsApi &
  RealThemesApi &
  RealAdminApi &
  RealLibraryApi &
  RealReverseApi &
  RealSquareApi &
  RealStoryboardApi &
  RealGarmentAssetsApi &
  RealProjectGarmentAssocApi &
  RealAnnouncementApi &
  ImageStep1Api &
  ImageStep2Api &
  ImageStep3Api &
  RealFileRegistryApi &
  RealImageStep4Api &
  RealProjectCharactersApi &
  RealBusinessConfigApi &
  RealOutfitChangeApi &
  RealRuntimeConfigApi &
  AdminAestheticLibraryApi &
  AdminSceneLibraryApi &
  RealActionTemplatesApi &
  RealActionTransferApi;

/**
 * 统一的 realBackendApi 对象
 * 通过对象展开运算符合并所有子模块
 * 注意：video music 和 video export 由独立子模块提供
 * 使用类型断言绕过 TypeScript 联合类型的严格检查
 */
export const realBackendApi = {
  ...realAuthApi,
  ...realProjectsApi,
  ...realStep1Api,
  ...realStep2Api,
  ...realStep3Api,
  ...realVideoApi,
  ...createVideoMusicRealBackendApi(request),
  ...realDouyinApi,
  ...realCreditsApi,
  ...realThemesApi,
  ...realAdminApi,
  ...realLibraryApi,
  ...realReverseApi,
  ...realSquareApi,
  ...realStoryboardApi,
  ...realGarmentAssetsApi,
  ...realProjectGarmentAssocApi,
  ...announcementApi,
  // realShotPromptsApi 已删除：独立路由已弃用
  ...imageStep1Api,
  ...imageStep2Api,
  ...imageStep3Api,
  ...realFileRegistryApi,
  ...realImageStep4Api,
  ...realProjectCharactersApi,
  ...realBusinessConfigApi,
  ...realOutfitChangeApi,
  ...realRuntimeConfigApi,
  ...realActionTemplatesApi,
  ...realActionTransferApi,
  ...adminAestheticLibraryApi,
  ...adminSceneLibraryApi,
} as RealBackendApi;
