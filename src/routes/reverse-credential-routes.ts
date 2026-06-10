/**
 * 反推凭据管理路由
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { SourceCredentialScope } from "../contracts/types.js";
import { AppError } from "../core/errors.js";
import { requireUser } from "../services/auth/route-guards.js";
import type { SourceCredentialService } from "../modules/douyin-integration-service.js";

export interface ReverseCredentialRouteDeps {
  readonly credentialService: SourceCredentialService;
}

export function registerReverseCredentialRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  deps: ReverseCredentialRouteDeps,
): void {
  const credentialService = deps.credentialService;

  app.post("/reverse/credentials", async (request) => {
    const user = await requireUser(ctx, request);
    const body = request.body as {
      scope: SourceCredentialScope;
      provider?: string;
      secret: string;
      expiresAt?: number | null;
      shared?: boolean;
    };
    if (!body.scope || !body.secret?.trim()) {
      throw new AppError(400, "CREDENTIAL_INPUT_REQUIRED", "scope and secret are required");
    }
    if (body.shared && user.role !== "admin") {
      throw new AppError(403, "FORBIDDEN", "Only admin can set shared credentials");
    }
    const credential = await credentialService.upsert({
      userId: user.id,
      scope: body.scope,
      provider: body.provider ?? body.scope,
      secret: body.secret,
      expiresAt: body.expiresAt ?? null,
      shared: body.shared ?? false,
    });
    return {
      id: credential.id,
      userId: credential.userId,
      scope: credential.scope,
      provider: credential.provider,
      maskedValue: credential.maskedValue,
      expiresAt: credential.expiresAt,
      revokedAt: credential.revokedAt,
      updatedAt: credential.updatedAt,
    };
  });

  app.get("/reverse/credentials", async (request) => {
    const user = await requireUser(ctx, request);
    const items = (await credentialService.listForUser(user.id)).map((item) => ({
      id: item.id,
      userId: item.userId,
      scope: item.scope,
      provider: item.provider,
      maskedValue: item.maskedValue,
      expiresAt: item.expiresAt,
      revokedAt: item.revokedAt,
      updatedAt: item.updatedAt,
    }));
    return { items };
  });

  app.delete("/reverse/credentials/:credentialId", async (request) => {
    const user = await requireUser(ctx, request);
    const params = request.params as { credentialId: string };
    const current = await ctx.repos.sourceCredentials.findById(params.credentialId);
    if (!current) {
      throw new AppError(404, "CREDENTIAL_NOT_FOUND", "Source credential not found");
    }
    if (user.role !== "admin" && current.userId !== user.id) {
      throw new AppError(403, "FORBIDDEN", "Credential owner only");
    }
    const revoked = await credentialService.revoke(user.id, params.credentialId);
    return {
      id: revoked.id,
      scope: revoked.scope,
      provider: revoked.provider,
      revokedAt: revoked.revokedAt,
    };
  });
}
