/**
 * Step3 脚本生成 API
 * 提供前端调用的API方法
 */

import type {
  Step3ScriptGenerationRequest,
  Step3ScriptGenerationResult,
} from "../../../src/modules/video-step/step3/types.js";
import { request } from "./backendApi.request.js";

/**
 * 请求Step3脚本生成
 * POST /projects/:projectId/step3/scripts
 *
 * 注意：此函数已被弃用，建议使用 backendApi 中的通用 request 函数
 * 保留此函数仅用于向后兼容
 * @deprecated 使用 backendApi.request 代替
 */
export async function requestStep3ScriptGeneration(
  _token: string, // 已弃用，token 由 request 函数自动从 store 获取
  projectId: string,
  requestBody: Step3ScriptGenerationRequest = {},
): Promise<Step3ScriptGenerationResult> {
  // 使用统一的 request 函数，401 会自动触发弹窗
  return request<Step3ScriptGenerationResult>(
    "POST",
    `/projects/${projectId}/step3/scripts`,
    { body: requestBody }
  );
}

// 导出类型
export type { Step3ScriptGenerationRequest, Step3ScriptGenerationResult };
