/**
 * step1-role-direction-task.ts
 *
 * 角色方向生成（同步）：根据服饰信息调用 LLM 生成角色预设卡片。
 */

import type { ProviderRouteKey } from "../contracts/types.js";
import type { Step1RoleDirectionCard } from "../contracts/step1-joint-reverse-contract.js";
import type { AppContext } from "../core/app-context.js";
import type { GarmentAsset } from "../contracts/types.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";
import { getLogger } from "../core/logger/index.js";
import {
  resolveRouteProvider,
} from "../services/llm/provider-resolver.js";
import { requestLlmPlainTextWithMetadata } from "../services/llm/llm-transport.js";
import { extractJsonValue } from "../utils/json.js";
import { normalizeRoleDirectionCardsFromJsonValue } from "./outfit-analysis-helpers.js";
import { skillLoader } from "../services/skills/index.js";
import { ETHNICITY_BY_CATEGORY } from "../contracts/ethnicity-dictionary.js";

const logger = getLogger("step1-role-direction");

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const ROUTE_KEY_STEP1_ROLE_PRESET: ProviderRouteKey = ProviderRouteKeys.STEP1_ROLE_PRESET;
const STEP1_ROLE_DIRECTION_FROM_GARMENTS_PROMPT_CODE = "step1_role_direction_from_garments";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface Step1RoleDirectionGenerateResult {
  roleDirectionCards: Step1RoleDirectionCard[];
}

/** 用户已选的角色方向上下文 */
export interface Step1RoleDirectionUserContext {
  gender: string | null;
  age: number | null;
  /** 界面显示的年龄段文本，如 "17-21岁" */
  ageRange: string | null;
  styleWords: string[] | null;
}

// ---------------------------------------------------------------------------
// 基于服饰信息生成角色预设（不依赖穿搭方案）
// ---------------------------------------------------------------------------

/** 构建基于服饰信息的角色方向生成提示词（使用结构化变量） */
export async function buildRoleDirectionPromptFromGarments(
  input: {
    garmentAssets: GarmentAsset[];
    expectedCount: number;
    userDirectionHint: Step1RoleDirectionUserContext;
  }
): Promise<{ systemPrompt: string; userPrompt: string }> {
  const { garmentAssets, expectedCount, userDirectionHint } = input;

  // 构建结构化参数（符合 schema.ts 定义）
  const promptVariables = {
    expectedCount,
    garmentAssets: garmentAssets.map(g => ({
      name: g.name || "服饰单品",
      category: g.category || undefined,
      description: g.description || undefined,
    })),
    userDirectionHint: {
      gender: userDirectionHint.gender,
      age: userDirectionHint.age ?? undefined,
      ageRange: userDirectionHint.ageRange ?? undefined,
    },
    // 种族字典：按分类分组展示
    ethnicityDictionary: [
      `### 亚洲类（80%概率）\n${ETHNICITY_BY_CATEGORY.asian.join("、")}`,
      `### 欧洲类（15%概率）\n${ETHNICITY_BY_CATEGORY.european.join("、")}`,
      `### 其他类（5%概率）\n${ETHNICITY_BY_CATEGORY.other.join("、")}`,
    ].join("\n\n"),
  };

  const { system, user } = await skillLoader.render(STEP1_ROLE_DIRECTION_FROM_GARMENTS_PROMPT_CODE, { variables: promptVariables });
  return { systemPrompt: system, userPrompt: user };
}

/** 基于服饰信息同步生成角色方向卡片（新流程：先选性别年龄，再生成角色预设） */
export async function generateStep1RoleDirectionCardsFromGarments(
  ctx: AppContext,
  app: { log: { warn: (input: Record<string, unknown>, msg?: string) => void } },
  projectId: string,
  userId: string,
  garmentAssets: GarmentAsset[],
  roleDirectionCount: number,
  userDirectionHint: Step1RoleDirectionUserContext,
): Promise<Step1RoleDirectionGenerateResult> {
  // 获取 Step1 搜图模型 provider
  const step1SearchProvider = await resolveRouteProvider(ctx, ROUTE_KEY_STEP1_ROLE_PRESET);
  if (!step1SearchProvider) {
    throw new Error("Step1 搜图+Grounding 模型未启用，请联系管理员配置。");
  }

  const expectedCount = Math.max(1, Math.floor(roleDirectionCount));
  const { systemPrompt, userPrompt } = await buildRoleDirectionPromptFromGarments({
    garmentAssets,
    expectedCount,
    userDirectionHint,
  });

  const taskId = ctx.clock.generateId();

  let result;
  try {
    result = await requestLlmPlainTextWithMetadata(
      step1SearchProvider,
      systemPrompt,
      userPrompt,
      0.25,
      {
        ctx,
        routeKey: ROUTE_KEY_STEP1_ROLE_PRESET,
        businessContext: "Step1 角色方向生成（基于服饰）",
        projectId,
        userId,
        forceGeminiGrounding: false,
        forceGeminiTransport: true,
      },
    );
  } catch (error) {
    logger.error(
      { err: error, routeKey: ProviderRouteKeys.STEP1_ROLE_PRESET },
      "LLM 调用失败"
    );
    throw error;
  }

  const parsed = extractJsonValue(result.text);
  const roleDirectionCards = normalizeRoleDirectionCardsFromJsonValue(
    parsed,
    expectedCount,
    `step1-role-direction-${taskId}`,
  );

  return { roleDirectionCards };
}