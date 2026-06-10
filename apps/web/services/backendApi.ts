// apps/web/services/backendApi.ts
/**
 * BackendApi 主入口
 * 聚合各 API 模块，提供统一 API 接口
 *
 * 架构重构：使用 realApi 的完整实现，通过 Proxy 动态路由
 */

// ============================================================================
// 保留原有的外部模块导入（向后兼容）
// ============================================================================

import { sanitizeStoryboardGeneratePayload } from "../../../src/storyboard-scene-ref-sanitizer";
import type { ReverseStoryboardLibraryRecordDto } from "../../../src/contracts/reverse-storyboard-library-api";
import type {
  MyLibraryPagedResponse,
  UserScriptRecordDto,
  MyStoryboardLibraryRecordDto,
} from "../../../src/contracts/my-library-api";
import type { SmartStoryboardLibraryRecordDto } from "../../../src/contracts/smart-storyboard-library-api";
import type { ReverseStoryboardPanelViewModel } from "../../../src/contracts/reverse-storyboard-report";
import {
  collectLegacyVideoReverseRecords,
  migrateLegacyVideoReverseRecords,
} from "../../../src/modules/reverse-storyboard-legacy-compat";
import { useAppStore } from "../store/useAppStore";
import { createProjectReverseBackendApi } from "./backendApi.projectReverse";
import { createDouyinPublishBackendApi } from "./backendApi.douyinPublish";
import { createSquareAdminLibraryBackendApi } from "./backendApi.squareAdminLibrary";
import {
  createVideoMusicBackendApi,
  createVideoMusicMockBackendApi,
  createVideoMusicRealBackendApi,
} from "./backendApi.videoMusic";
import {
  startReverseParseV2JobRequest,
  type ReverseParseV2UploadRequestPayload,
} from "./backendApi.reverseParseUpload";
import type {
  BackendApiStoryboardGeneratePayload,
} from "./backendApi.storyboard";
import type { Theme, ThemeCategory, ThemeConfig, UserThemePreference } from "../types";
import type { Step1RoleDirectionCard } from "../../../src/contracts/step1-joint-reverse-contract";

// ============================================================================
// API 配置和类型导入
// ============================================================================

import {
  API_MODE,
  API_REAL_FALLBACK_TO_MOCK,
  backendApiRuntime,
} from './backendApi.config';
import type { BackendApi } from './backendApi.types';

// 导入完整的 realApi 和 mockApi
import { realBackendApi } from './realApi/index';
import { mockBackendApi } from './mock/mock-api';

// 重新导出 request 函数，用于重试机制
export { request } from './backendApi.request';

// ============================================================================
// 重新导出类型（向后兼容）
// ============================================================================

export * from './backendApi.types';

// 重新导出原有的辅助函数和常量（向后兼容）
export {
  sanitizeStoryboardGeneratePayload,
  collectLegacyVideoReverseRecords,
  migrateLegacyVideoReverseRecords,
  createProjectReverseBackendApi,
  createDouyinPublishBackendApi,
  createSquareAdminLibraryBackendApi,
  createVideoMusicBackendApi,
  createVideoMusicMockBackendApi,
  createVideoMusicRealBackendApi,
  startReverseParseV2JobRequest,
};

// 重新导出类型
export type {
  ReverseStoryboardLibraryRecordDto,
  MyLibraryPagedResponse,
  UserScriptRecordDto,
  MyStoryboardLibraryRecordDto,
  SmartStoryboardLibraryRecordDto,
  ReverseStoryboardPanelViewModel,
  ReverseParseV2UploadRequestPayload,
  BackendApiStoryboardGeneratePayload,
  Theme,
  ThemeCategory,
  ThemeConfig,
  UserThemePreference,
  Step1RoleDirectionCard,
};

// ============================================================================
// API 调用路由
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMethod = (...args: any[]) => any;

/**
 * 判断是否使用真实 API
 */
function shouldUseReal(): boolean {
  if (API_MODE === "real") return true;
  if (API_MODE === "mock") return false;
  // hybrid 模式默认使用真实 API，失败时降级
  return true;
}

/**
 * 安全调用 API 方法
 */
function safeCallMethod(obj: Record<string, unknown>, prop: string, args: unknown[]): unknown {
  const method = obj[prop];
  if (typeof method === 'function') {
    return (method as AnyMethod)(...args);
  }
  return null;
}

/**
 * 创建动态路由的 backendApi
 * 使用 Proxy 模式动态处理所有方法调用
 */
export const backendApi: BackendApi = new Proxy({} as BackendApi, {
  get(_target, prop: string) {
    // 返回一个函数，根据配置路由到 real 或 mock
    return (...args: unknown[]): unknown => {
      const useReal = shouldUseReal();

      if (useReal) {
        // hybrid 模式下，真实 API 失败时可降级到 mock
        if (API_MODE === "hybrid" && API_REAL_FALLBACK_TO_MOCK) {
          const result = safeCallMethod(realBackendApi as unknown as Record<string, unknown>, prop, args);
          if (result !== null) {
            return result;
          }
          console.warn(`[backendApi] Real API failed for ${prop}, falling back to mock`);
          const mockResult = safeCallMethod(mockBackendApi as unknown as Record<string, unknown>, prop, args);
          if (mockResult !== null) {
            return mockResult;
          }
          return Promise.reject(new Error(`Method ${prop} not implemented`));
        }

        // real 模式直接调用
        const result = safeCallMethod(realBackendApi as unknown as Record<string, unknown>, prop, args);
        if (result !== null) {
          return result;
        }
        console.warn(`[backendApi] Method ${prop} not found in realBackendApi`);
        return Promise.reject(new Error(`Method ${prop} not implemented`));
      }

      // mock 模式
      const mockResult = safeCallMethod(mockBackendApi as unknown as Record<string, unknown>, prop, args);
      if (mockResult !== null) {
        return mockResult;
      }
      // Mock 模式下，缺失方法返回占位响应
      console.warn(`[backendApi] Mock method ${prop} not implemented, returning placeholder`);
      return Promise.resolve({});
    };
  }
});

export { backendApiRuntime };

// ============================================================================
// 向后兼容：导出 useAppStore
// ============================================================================

export { useAppStore };