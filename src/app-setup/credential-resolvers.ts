/**
 * Credential 解析器模块
 *
 * 负责解析各种 API token 和 endpoint 配置，包括：
 * - TikHub token 解析（用户级、系统级、provider级）
 * - Douhot endpoint 解析
 * - Source credential 查询
 */
import type { AppContext } from "../core/app-context.js";
import { decryptSecret } from "../core/security.js";
import type { SourceCredentialScope } from "../contracts/types.js";

/**
 * 系统级 credential 用户 ID（用于 hot trend 同步）
 */
export const HOT_TREND_SYSTEM_CREDENTIAL_USER_ID = "__system__";

/**
 * 解析最新有效的 source credential secret
 *
 * @param ctx 应用上下文
 * @param scope credential scope
 * @param provider provider 名称（可选）
 * @returns 解密后的 secret 值，或 null
 */
export async function resolveLatestSourceCredentialSecret(
  ctx: AppContext,
  scope: SourceCredentialScope,
  provider?: string,
): Promise<string | null> {
  const providerValue = provider?.trim().toLowerCase();
  const now = ctx.clock.now();
  const candidates = [...await ctx.repos.sourceCredentials.list()]
    .filter((item) => item.scope === scope)
    .filter((item) => item.revokedAt === null)
    .filter((item) => item.expiresAt === null || item.expiresAt > now)
    .filter((item) => (providerValue ? item.provider === providerValue : true))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  for (const item of candidates) {
    try {
      const value = decryptSecret(item.cipherText).trim();
      if (value.length > 0) {
        return value;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * 解析 TikHub provider secret
 *
 * 从 provider secrets 表中查找 TikHub 相关的 secret。
 *
 * @param ctx 应用上下文
 * @returns 解密后的 secret 值，或 null
 */
export async function resolveTikHubProviderSecret(
  ctx: AppContext,
): Promise<string | null> {
  const providers = [...await ctx.repos.providers.list()]
    .filter((item) => item.enabled)
    .filter((item) => {
      const signature = `${item.name} ${item.vendor} ${item.baseUrl}`.toLowerCase();
      return signature.includes("tikhub");
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);

  for (const provider of providers) {
    const secret = await ctx.repos.providerSecrets.findByProviderId(provider.id);
    if (!secret) {
      continue;
    }
    try {
      const value = decryptSecret(secret.cipherText).trim();
      if (value.length > 0) {
        return value;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * 为指定用户解析 TikHub token
 *
 * 优先级：用户级 scoped > 用户级 generic > null
 *
 * @param credentialService credential 服务
 * @param userId 用户 ID
 * @returns TikHub token，或 null
 */
export async function resolveTikHubTokenForUser(
  credentialService: { resolveActiveSecret: (userId: string, scope: SourceCredentialScope, provider?: string) => Promise<string | null> },
  userId: string,
): Promise<string | null> {
  const providerScoped = (await credentialService.resolveActiveSecret(userId, "external_api", "tikhub"))?.trim();
  if (providerScoped) {
    return providerScoped;
  }
  const genericScoped = (await credentialService.resolveActiveSecret(userId, "external_api"))?.trim();
  if (genericScoped) {
    return genericScoped;
  }
  return null;
}

/**
 * Credential resolver 依赖接口
 */
export interface CredentialResolverDeps {
  ctx: AppContext;
  credentialService: { resolveActiveSecret: (userId: string, scope: SourceCredentialScope, provider?: string) => Promise<string | null> };
  runtimeConfig: {
    reverse: {
      tikhubApiToken?: string | null;
    };
  };
}

/**
 * 为 hot trends 解析 TikHub token
 *
 * 优先级：
 * 1. 配置文件中的 tikhubApiToken
 * 2. 环境变量中的 tikhubApiToken
 * 3. 系统级 credential
 * 4. 用户级 credential（最新）
 * 5. generic credential（最新）
 * 6. provider secret
 *
 * @param deps 依赖参数
 * @returns TikHub token，或 null
 */
export async function resolveTikHubTokenForHotTrends(
  deps: CredentialResolverDeps,
): Promise<string | null> {
  const { ctx, credentialService, runtimeConfig } = deps;

  // 1. 配置文件中的 token
  const configured = ctx.configService.get().tikhubApiToken?.trim();
  if (configured) {
    return configured;
  }

  // 2. 环境变量中的 token
  const envToken = runtimeConfig.reverse.tikhubApiToken?.trim();
  if (envToken) {
    return envToken;
  }

  // 3. 系统级 credential
  const sharedCredential =
    (await credentialService.resolveActiveSecret(HOT_TREND_SYSTEM_CREDENTIAL_USER_ID, "external_api", "tikhub")) ?? (await credentialService.resolveActiveSecret(HOT_TREND_SYSTEM_CREDENTIAL_USER_ID, "external_api"));
  const normalizedShared = sharedCredential?.trim() ?? "";
  if (normalizedShared.length > 0) {
    return normalizedShared;
  }

  // 4. 用户级 credential（最新）
  const latestUserCredential = await resolveLatestSourceCredentialSecret(ctx, "external_api", "tikhub");
  if (latestUserCredential) {
    return latestUserCredential;
  }

  // 5. generic credential（最新）
  const latestGenericCredential = await resolveLatestSourceCredentialSecret(ctx, "external_api");
  if (latestGenericCredential) {
    return latestGenericCredential;
  }

  // 6. provider secret
  const providerSecret = await resolveTikHubProviderSecret(ctx);
  if (providerSecret) {
    return providerSecret;
  }

  return null;
}

/**
 * 解析 Douhot endpoint
 *
 * 从配置中获取 Douhot video hot API URL，过滤无效的 legacy 配置。
 *
 * @param ctx 应用上下文
 * @returns Douhot endpoint URL，或 undefined
 */
export function resolveDouhotEndpointForHotTrends(
  ctx: AppContext,
): string | undefined {
  const configured = ctx.configService.get().douhotVideoHotApiUrl?.trim();
  if (!configured) {
    return undefined;
  }
  // Legacy dashboard config accidentally pointed to a web page path.
  if (/\/square\/hotspot(?:\/)?$/i.test(configured)) {
    return undefined;
  }
  return configured;
}