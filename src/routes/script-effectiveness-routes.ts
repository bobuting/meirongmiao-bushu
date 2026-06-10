/**
 * 脚本有效性分析路由
 *
 * 提供基于 BettaFish 反思循环模式的脚本生成 API：
 * - POST /script-effectiveness/generate — 生成高质量脚本
 *
 * 核心设计：
 * 1. 热点匹配：从热点资产中提取最佳匹配
 * 2. 多视角评估：观众、编导、策略师三方并行评估
 * 3. 反思迭代：根据评估结果迭代优化，直到质量达标
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { requireUser } from "../services/auth/route-guards.js";
import { ScriptGenerator } from "../modules/script-effectiveness/index.js";
import type {
  OutfitAssetInput,
  CharacterInfoInput,
} from "../modules/script-effectiveness/index.js";
import { randomUUID } from "node:crypto";
import { requestLlmPlainText } from "../services/llm/llm-transport.js";
import { resolveRouteProvider } from "../services/llm/provider-resolver.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";
import { AppError } from "../core/errors.js";

export function registerScriptEffectivenessRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  // POST /script-effectiveness/generate — 生成高质量脚本
  app.post("/script-effectiveness/generate", async (request) => {
    const user = await requireUser(ctx, request);
    const body = request.body as {
      assets: OutfitAssetInput[];
      characters: CharacterInfoInput[];
      analysisConfig?: {
        maxIterations?: number;
        effectivenessThreshold?: number;
      };
    };

    if (!body.assets?.length) {
      throw new AppError(400, "MISSING_ASSETS", "请提供至少一个服饰资产");
    }

    // 创建 LLM 请求适配器
    const provider = await resolveRouteProvider(ctx, ProviderRouteKeys.SCRIPT_EFFECTIVENESS_GENERATION);
    if (!provider) {
      throw new AppError(503, "NO_LLM_PROVIDER", "未配置可用的 LLM 提供商");
    }
    const requestLlm = async (prompt: string): Promise<string> => {
      return requestLlmPlainText(provider, "", prompt, 0.6, {
        ctx,
        routeKey: ProviderRouteKeys.SCRIPT_EFFECTIVENESS_GENERATION,
        businessContext: "种草脚本生成 - Effectiveness 策略",
        userId: user.id,
      });
    };

    const generator = new ScriptGenerator({
      pool: ctx.pool,
      repos: { scriptData: ctx.repos.scriptData },
      requestLlmPlainText: requestLlm,
      generateId: () => randomUUID(),
    });

    const record = await generator.generate({
      userId: user.id,
      assets: body.assets,
      characters: body.characters,
      analysisConfig: body.analysisConfig,
    });

    return {
      record: {
        id: record.id,
        type: record.type,
        payloadJson: record.payloadJson,
      },
    };
  });
}
