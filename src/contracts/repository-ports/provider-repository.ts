/**
 * Provider 仓库端口
 */

import type { Provider, ProviderSecret, ProviderRoutingPolicy } from "../types.js";

/** Provider 仓库端口 */
export interface IProviderRepository {
  findById(id: string): Promise<Provider | null>;
  findByVendor(vendor: string): Promise<Provider[]>;
  list(): Promise<Provider[]>;
  upsert(provider: Provider): Promise<void>;
  delete(id: string): Promise<void>;
}

/** Provider Secret 仓库端口 */
export interface IProviderSecretRepository {
  findById(id: string): Promise<ProviderSecret | null>;
  findByProviderId(providerId: string): Promise<ProviderSecret | null>;
  upsert(secret: ProviderSecret): Promise<void>;
  delete(id: string): Promise<void>;
}

/** Provider Policy 仓库端口 */
export interface IProviderPolicyRepository {
  findById(id: string): Promise<ProviderRoutingPolicy | null>;
  findByRouteKey(routeKey: string): Promise<ProviderRoutingPolicy[]>;
  list(): Promise<ProviderRoutingPolicy[]>;
  upsert(policy: ProviderRoutingPolicy): Promise<void>;
  delete(id: string): Promise<void>;
}