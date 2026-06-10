/**
 * 功能路由服务
 * 管理 3 种功能类型的模型路由配置（文本、图像、视频）
 */

import type { FunctionalRoute, FunctionalRouteType, CreateFunctionalRouteInput, UpdateFunctionalRouteInput, FunctionalRouteDto, FUNCTIONAL_ROUTE_TYPES, FUNCTIONAL_ROUTE_TYPE_META } from "../contracts/functional-route-contract.js";
import type { User } from "../contracts/types.js";
import type { IAuditStore } from "../persistence/audit-store.js";
import type { IFunctionalRouteRepository } from "../repositories/pg/functional-route-pg-repository.js";
import type { IProviderRepository } from "../contracts/repository-ports/provider-repository.js";
import { assertCondition } from "../core/errors.js";

// 权限检查：仅管理员可操作
function requireAdmin(user: User): void {
  assertCondition(user.role === "admin", 403, "FORBIDDEN", "Admin only");
}

export interface FunctionalRouteServiceDeps {
  functionalRoutes: IFunctionalRouteRepository;
  providers: IProviderRepository;
  auditStore: IAuditStore;
  clock: { now: () => number; generateId: () => string };
}

export class FunctionalRouteService {
  constructor(
    private readonly deps: FunctionalRouteServiceDeps,
  ) {}

  /**
   * 获取所有功能路由配置（包含 Provider 详情）
   */
  async listRoutes(actor: User): Promise<FunctionalRouteDto[]> {
    requireAdmin(actor);

    const routes = await this.deps.functionalRoutes.list();
    const providers = await this.deps.providers.list();
    const providerMap = new Map(providers.map((p) => [p.id, p]));

    // 返回所有 3 种功能类型的配置（包括未配置的）
    const allTypes: FunctionalRouteType[] = ["text", "image", "video"];

    const meta: Record<FunctionalRouteType, { label: string; description: string; supported: boolean }> = {
      text: { label: "文本模型", description: "纯文本、图片理解、视频理解等文本生成能力", supported: true },
      image: { label: "图像模型", description: "文生图、图生图等图像生成能力", supported: true },
      video: { label: "视频模型", description: "文生视频、图生视频等视频生成能力", supported: true },
    };

    return allTypes.map((type) => {
      const route = routes.find((r) => r.type === type);
      const provider = route ? providerMap.get(route.providerId) : null;

      return {
        type,
        label: meta[type].label,
        description: meta[type].description,
        supported: meta[type].supported,
        providerId: route?.providerId ?? null,
        providerName: provider?.name ?? null,
        providerVendor: provider?.vendor ?? null,
        providerModel: provider?.model ?? null,
        fallbackProviderIds: route?.fallbackProviderIds ?? [],
        enabled: route?.enabled ?? true,
      };
    });
  }

  /**
   * 获取单个功能路由配置
   */
  async getRoute(actor: User, type: FunctionalRouteType): Promise<FunctionalRouteDto | null> {
    requireAdmin(actor);

    const route = await this.deps.functionalRoutes.findByType(type);
    if (!route) {
      return null;
    }

    const provider = await this.deps.providers.findById(route.providerId);

    const meta: Record<FunctionalRouteType, { label: string; description: string; supported: boolean }> = {
      text: { label: "文本模型", description: "纯文本、图片理解、视频理解等文本生成能力", supported: true },
      image: { label: "图像模型", description: "文生图、图生图等图像生成能力", supported: true },
      video: { label: "视频模型", description: "文生视频、图生视频等视频生成能力", supported: true },
    };

    return {
      type: route.type,
      label: meta[route.type].label,
      description: meta[route.type].description,
      supported: meta[route.type].supported,
      providerId: route.providerId,
      providerName: provider?.name ?? null,
      providerVendor: provider?.vendor ?? null,
      providerModel: provider?.model ?? null,
      fallbackProviderIds: route.fallbackProviderIds,
      enabled: route.enabled,
    };
  }

  /**
   * 设置功能路由配置（创建或更新）
   */
  async setRoute(actor: User, input: CreateFunctionalRouteInput): Promise<FunctionalRoute> {
    requireAdmin(actor);

    // 验证 Provider 存在且已启用
    const provider = await this.deps.providers.findById(input.providerId);
    assertCondition(Boolean(provider), 404, "PROVIDER_NOT_FOUND", "Provider not found");
    assertCondition(provider!.enabled, 400, "PROVIDER_DISABLED", "Provider is disabled");

    const now = this.deps.clock.now();
    const existing = await this.deps.functionalRoutes.findByType(input.type);

    let route: FunctionalRoute;

    if (existing) {
      // 更新现有配置
      route = {
        ...existing,
        providerId: input.providerId,
        fallbackProviderIds: input.fallbackProviderIds ?? existing.fallbackProviderIds,
        enabled: input.enabled ?? existing.enabled,
        updatedAt: now,
      };
    } else {
      // 创建新配置
      route = {
        id: this.deps.clock.generateId(),
        type: input.type,
        providerId: input.providerId,
        fallbackProviderIds: input.fallbackProviderIds ?? [],
        enabled: input.enabled ?? true,
        createdAt: now,
        updatedAt: now,
      };
    }

    await this.deps.functionalRoutes.upsert(route);

    // 记录审计日志
    this.deps.auditStore.insertAuditLog({
      id: this.deps.clock.generateId(),
      actorUserId: actor.id,
      action: existing ? "functional_route_updated" : "functional_route_created",
      targetId: route.id,
      meta: {
        type: route.type,
        providerId: route.providerId,
      },
      createdAt: now,
    });

    return route;
  }

  /**
   * 批量设置功能路由配置
   */
  async setRoutes(actor: User, inputs: CreateFunctionalRouteInput[]): Promise<FunctionalRoute[]> {
    requireAdmin(actor);

    const results: FunctionalRoute[] = [];
    for (const input of inputs) {
      const route = await this.setRoute(actor, input);
      results.push(route);
    }
    return results;
  }

  /**
   * 删除功能路由配置（重置为未配置状态）
   */
  async deleteRoute(actor: User, type: FunctionalRouteType): Promise<void> {
    requireAdmin(actor);

    const route = await this.deps.functionalRoutes.findByType(type);
    if (!route) {
      return; // 不存在则直接返回
    }

    await this.deps.functionalRoutes.delete(route.id);

    // 记录审计日志
    this.deps.auditStore.insertAuditLog({
      id: this.deps.clock.generateId(),
      actorUserId: actor.id,
      action: "functional_route_deleted",
      targetId: route.id,
      meta: {
        type: route.type,
      },
      createdAt: this.deps.clock.now(),
    });
  }

  /**
   * 根据功能类型解析 Provider
   * 用于实际业务调用时获取配置的 Provider
   */
  async resolveProvider(type: FunctionalRouteType): Promise<{
    providerId: string;
    fallbackProviderIds: string[];
  } | null> {
    const route = await this.deps.functionalRoutes.findByType(type);
    if (!route || !route.enabled) {
      return null;
    }

    // 验证 Provider 是否仍然可用
    const provider = await this.deps.providers.findById(route.providerId);
    if (!provider || !provider.enabled) {
      return null;
    }

    return {
      providerId: route.providerId,
      fallbackProviderIds: route.fallbackProviderIds,
    };
  }
}
