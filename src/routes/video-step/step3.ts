/**
 * Step3 脚本生成 API 路由
 * 提供 POST /projects/:projectId/step3/scripts 端点
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../../core/app-context.js";
import type { User } from "../../contracts/types.js";
import { AppError } from "../../core/errors.js";
import { generateStep3ScriptsSnapshot } from "../../modules/video-step/step3/script-generation-service.js";
import type { Step3ScriptGenerationRequest, Step3ScriptGenerationSnapshotResult } from "../../modules/video-step/step3/types.js";
import { getLogger } from "../../core/logger/index.js";
const log = getLogger("video-step-step3");

/**
 * 路由依赖接口
 */
interface Step3ScriptRouteDependencies {
  requireUser: (ctx: AppContext, request: FastifyRequest) => Promise<User>;
  requireAdmin: (ctx: AppContext, request: FastifyRequest) => Promise<User>;
}

/**
 * 检查项目是否有有效的角色信息
 * 使用 ProjectContextService 统一获取项目上下文
 *
 * 数据来源：
 * - nrm_project_characters（已选中的角色）
 * - nrm_outfit_plans（穿搭方案）
 * - nrm_garment_assets（服饰单品）
 */
export async function hasValidCharacterSelection(
  ctx: AppContext,
  projectId: string,
): Promise<boolean> {
  const projectContext = await ctx.projectContextService.getProjectContext(projectId);

  // 有角色或有服饰风格即放行
  return projectContext.character !== null || projectContext.clothingStyles.length > 0;
}

/**
 * 注册 Step3 脚本生成路由
 */
export function registerStep3ScriptRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  dependencies: Step3ScriptRouteDependencies,
): void {
  /**
   * POST /projects/:projectId/step3/scripts
   * 生成热榜脚本
   *
   * 请求体（可选）:
   * {
   *   hotspotLimit?: number;  // 热点数量，默认50
   * }
   *
   * 响应格式与 /projects/:projectId/step3/candidates/snapshot 一致:
   * {
   *   snapshot: {
   *     snapshotId: string;
   *     promptVersion: string;
   *     lockState: "snapshot_ready";
   *     lockVersion: number;
   *     generationMode: "real" | "degraded";
   *     selectedCandidateId: null;
   *     confirmedCandidateId: null;
   *     items: ScriptCandidateEntity[];
   *   }
   * }
   */
  app.post<{
    Params: { projectId: string };
    Body: Step3ScriptGenerationRequest | undefined;
    Reply: Step3ScriptGenerationSnapshotResult | { error: string };
  }>("/projects/:projectId/step3/scripts", async (request, reply) => {
    // 验证用户身份
    const user = await dependencies.requireUser(ctx, request);

    const { projectId } = request.params;
    const body = request.body ?? {};


    try {
      // 验证项目所有权
      const project = await ctx.projectService.requireOwnerProject(user, projectId);
      if (!project) {
        throw new AppError(404, "PROJECT_NOT_FOUND", "项目不存在或无权访问");
      }

      // 检查是否选择了角色
      if (!await hasValidCharacterSelection(ctx, projectId)) {
        throw new AppError(400, "CHARACTER_NOT_SELECTED", "请先完成角色选择");
      }

      // 调用脚本生成服务（返回快照格式）
      const result = await generateStep3ScriptsSnapshot(ctx, projectId, {
        hotspotLimit: body.hotspotLimit,
      });

      // 更新项目状态为 SCRIPT_GENERATED（脚本已生成）
      if (result.snapshot.items.length > 0) {
        await ctx.repos.projects.updateStatus(projectId, "SCRIPT_GENERATED");
      }


      return result;
    } catch (error) {
      log.error({ err: error }, "Step3Route Error generating scripts");

      // 处理已知错误类型 — AppError 直接重新抛出，让 Fastify 错误处理器处理
      if (error instanceof AppError) {
        throw error;
      }

      if (error instanceof Error) {
        // 处理业务错误
        if (error.message.includes("未找到角色信息") || error.message.includes("请先完成角色选择")) {
          throw new AppError(400, "CHARACTER_NOT_SELECTED", error.message);
        }

        // 其他错误
        throw new AppError(500, "SCRIPT_GENERATION_FAILED", `脚本生成失败: ${error.message}`);
      }

      // 未知错误
      throw new AppError(500, "SCRIPT_GENERATION_FAILED", "脚本生成失败，请稍后重试");
    }
  });
}
