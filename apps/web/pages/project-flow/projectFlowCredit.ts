import { ApiError, backendApi } from "../../services/backendApi";
import { useAppStore } from "../../store/useAppStore";

/**
 * 根据年龄选择对应的积分成本（儿童 ≤17岁）
 * 与后端 isChildAgeGroup 保持一致：NEWBORN/INFANT/TODDLER/KID/TEEN 为儿童
 * @param age - 角色年龄
 * @param childCost - 儿童场景的积分成本
 * @param adultCost - 成人场景的积分成本
 * @returns 对应的积分成本
 */
export function selectCreditCostByAge(
  age: number | null | undefined,
  childCost: number,
  adultCost: number,
): number {
  // 年龄 ≤17 岁使用儿童价格（与后端 isChildAgeGroup 一致）
  const isChild = age != null && age <= 17;
  return isChild ? childCost : adultCost;
}

export interface ProjectFlowCreditPricing {
  // 历史字段名（保持兼容，映射到成人价格）
  singleImageCreditCost: number;
  singleVideoCreditCost: number;
  videoExportCreditCost: number;
  fissionPerVideoCreditCost: number;

  // 新增儿童/成人分档字段（根据年龄选择正确价格）
  step2FiveViewChildCost: number;  // 五视图生成 - 儿童（≤17岁）
  step2FiveViewAdultCost: number;  // 五视图生成 - 成人（≥18岁）
  step3StoryboardChildCost: number; // 分镜图生成 - 儿童（≤17岁）
  step3StoryboardAdultCost: number; // 分镜图生成 - 成人（≥18岁）
  step4ClipChildCost: number;      // 分镜视频生成 - 儿童（≤17岁）
  step4ClipAdultCost: number;      // 分镜视频生成 - 成人（≥18岁）
  fissionChildCost: number;        // 裂变视频生成 - 儿童（≤17岁）
  fissionAdultCost: number;        // 裂变视频生成 - 成人（≥18岁）
  fissionStoryboardImageChildCost: number; // 裂变分镜图片生成 - 儿童（≤17岁）
  fissionStoryboardImageAdultCost: number; // 裂变分镜图片生成 - 成人（≥18岁）
}

/**
 * 默认积分定价配置（仅用于 useState 初始化，不代表真实定价）
 * 实际定价必须通过 loadProjectFlowCreditPricing API 从后端获取
 */
export const DEFAULT_PROJECT_FLOW_CREDIT_PRICING: ProjectFlowCreditPricing = {
  singleImageCreditCost: 0,
  singleVideoCreditCost: 0,
  videoExportCreditCost: 0,
  fissionPerVideoCreditCost: 0,
  step2FiveViewChildCost: 0,
  step2FiveViewAdultCost: 0,
  step3StoryboardChildCost: 0,
  step3StoryboardAdultCost: 0,
  step4ClipChildCost: 0,
  step4ClipAdultCost: 0,
  fissionChildCost: 0,
  fissionAdultCost: 0,
  fissionStoryboardImageChildCost: 0,
  fissionStoryboardImageAdultCost: 0,
};

/**
 * 从后端 API 返回值解析积分定价配置
 * 使用正确的 RouteKey 映射（儿童/成人分档）
 */
export function normalizeProjectFlowCreditPricing(
  value: Partial<ProjectFlowCreditPricing> | null | undefined,
): ProjectFlowCreditPricing {
  // 使用正确的 RouteKey 映射
  const step2ChildCost = Number(value?.step2FiveViewChildCost);
  const step2AdultCost = Number(value?.step2FiveViewAdultCost);
  const step3StoryboardChildCost = Number(value?.step3StoryboardChildCost);
  const step3StoryboardAdultCost = Number(value?.step3StoryboardAdultCost);
  const step4ClipChildCost = Number(value?.step4ClipChildCost);
  const step4ClipAdultCost = Number(value?.step4ClipAdultCost);
  const fissionChildCost = Number(value?.fissionChildCost);
  const fissionAdultCost = Number(value?.fissionAdultCost);
  const fissionStoryboardImageChildCost = Number(value?.fissionStoryboardImageChildCost);
  const fissionStoryboardImageAdultCost = Number(value?.fissionStoryboardImageAdultCost);
  const videoExportCreditCost = Number(value?.videoExportCreditCost);

  // 校验必填字段，缺失则抛错（禁止降级处理）
  if (!Number.isFinite(step2ChildCost) || step2ChildCost < 0) {
    throw new Error("积分定价配置缺失: step2FiveViewChildCost");
  }
  if (!Number.isFinite(step2AdultCost) || step2AdultCost < 0) {
    throw new Error("积分定价配置缺失: step2FiveViewAdultCost");
  }
  if (!Number.isFinite(step3StoryboardChildCost) || step3StoryboardChildCost < 0) {
    throw new Error("积分定价配置缺失: step3StoryboardChildCost");
  }
  if (!Number.isFinite(step3StoryboardAdultCost) || step3StoryboardAdultCost < 0) {
    throw new Error("积分定价配置缺失: step3StoryboardAdultCost");
  }
  if (!Number.isFinite(step4ClipChildCost) || step4ClipChildCost < 0) {
    throw new Error("积分定价配置缺失: step4ClipChildCost");
  }
  if (!Number.isFinite(step4ClipAdultCost) || step4ClipAdultCost < 0) {
    throw new Error("积分定价配置缺失: step4ClipAdultCost");
  }
  if (!Number.isFinite(videoExportCreditCost) || videoExportCreditCost < 0) {
    throw new Error("积分定价配置缺失: videoExportCreditCost");
  }
  if (!Number.isFinite(fissionChildCost) || fissionChildCost < 0) {
    throw new Error("积分定价配置缺失: fissionChildCost");
  }
  if (!Number.isFinite(fissionAdultCost) || fissionAdultCost < 0) {
    throw new Error("积分定价配置缺失: fissionAdultCost");
  }
  if (!Number.isFinite(fissionStoryboardImageChildCost) || fissionStoryboardImageChildCost < 0) {
    throw new Error("积分定价配置缺失: fissionStoryboardImageChildCost");
  }
  if (!Number.isFinite(fissionStoryboardImageAdultCost) || fissionStoryboardImageAdultCost < 0) {
    throw new Error("积分定价配置缺失: fissionStoryboardImageAdultCost");
  }

  return {
    // 历史字段名保持兼容（映射到成人价格作为默认值）
    singleImageCreditCost: Math.floor(step2AdultCost),
    singleVideoCreditCost: Math.floor(step4ClipAdultCost),
    videoExportCreditCost: Math.floor(videoExportCreditCost),
    fissionPerVideoCreditCost: Math.floor(fissionAdultCost),
    // 新增儿童/成人分档字段
    step2FiveViewChildCost: Math.floor(step2ChildCost),
    step2FiveViewAdultCost: Math.floor(step2AdultCost),
    step3StoryboardChildCost: Math.floor(step3StoryboardChildCost),
    step3StoryboardAdultCost: Math.floor(step3StoryboardAdultCost),
    step4ClipChildCost: Math.floor(step4ClipChildCost),
    step4ClipAdultCost: Math.floor(step4ClipAdultCost),
    fissionChildCost: Math.floor(fissionChildCost),
    fissionAdultCost: Math.floor(fissionAdultCost),
    fissionStoryboardImageChildCost: Math.floor(fissionStoryboardImageChildCost),
    fissionStoryboardImageAdultCost: Math.floor(fissionStoryboardImageAdultCost),
  };
}

/**
 * 从后端加载积分定价配置
 * 失败时抛错，不提供默认值（禁止降级处理）
 */
export async function loadProjectFlowCreditPricing(token: string | null): Promise<ProjectFlowCreditPricing> {
  if (!token) {
    throw new Error("登录状态已失效，请重新登录后重试。");
  }
  const response = await backendApi.creditPricing(token);
  return normalizeProjectFlowCreditPricing(response);
}

export async function spendProjectFlowCredits(input: {
  token: string | null;
  routeKey: string;
  operation?: string;
  reason?: string;
  projectId?: string;
}): Promise<{ balance: number; expiresAt: number; spent: number }> {
  if (!input.token) {
    throw new Error("登录状态已失效，请重新登录后重试。");
  }
  const response = await backendApi.spendCredits(input.token, {
    routeKey: input.routeKey,
    operation: input.operation ?? input.routeKey,
    reason: input.reason ?? input.routeKey,
    ...(input.projectId ? { projectId: input.projectId } : {}),
  });
  useAppStore.getState().setCredits({
    balance: response.balance,
    expiresAt: response.expiresAt,
  });
  return response;
}

export function resolveProjectFlowCreditSpendErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.code === "INSUFFICIENT_CREDIT") {
      return "积分不足，请先充值或联系管理员。";
    }
    if (error.code === "CREDIT_EXPIRED") {
      return "积分已过期，请联系管理员刷新额度。";
    }
    return error.message;
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

/** 积分余额预检查：返回最新余额是否足够支付指定金额 */
export async function checkCreditsBalance(token: string | null, requiredAmount: number): Promise<{ sufficient: boolean; balance: number }> {
  if (!token) {
    throw new Error("登录状态已失效，请重新登录后重试。");
  }
  const account = await backendApi.loadCredits(token);
  const balance = account.balance ?? 0;
  useAppStore.getState().setCredits({ balance, expiresAt: 0 });
  return { sufficient: balance >= requiredAmount, balance };
}
