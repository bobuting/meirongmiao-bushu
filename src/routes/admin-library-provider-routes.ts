import type { FastifyInstance, RouteHandlerMethod } from "fastify";

export interface AdminProviderRouteHandlers {
  readonly listProviders: RouteHandlerMethod;
  readonly createProvider: RouteHandlerMethod;
  readonly updateProvider: RouteHandlerMethod;
  readonly deleteProvider: RouteHandlerMethod;
  readonly upsertProviderSecret: RouteHandlerMethod;
}

export function registerAdminProviderRoutes(
  app: FastifyInstance,
  handlers: AdminProviderRouteHandlers,
): void {
  app.get("/admin/providers", handlers.listProviders);
  app.post("/admin/providers", handlers.createProvider);
  app.patch("/admin/providers/:providerId", handlers.updateProvider);
  app.delete("/admin/providers/:providerId", handlers.deleteProvider);
  app.put("/admin/providers/:providerId/secret", handlers.upsertProviderSecret);
}
