import type { FastifyRequest } from "fastify";
import type { AppContext } from "../core/app-context.js";
import type { User } from "../contracts/types.js";
import type { AppShellExtraRouteRegistrar, AppShellThinEntryHandlers } from "./app-shell-thin-entry.js";
import { createThemeRouteHandlersWithContext, createThemeAdminRouteHandlersWithContext } from "./theme-routes.js";
import { createFissionVideoRouteHandlersWithContext } from "./fission-video-routes.js";
import { createSquareTemplateRouteHandlersWithContext } from "./square-template-routes.js";
import { createStorageProxyRouteHandlersWithContext } from "./storage-proxy-routes.js";

export interface AppShellHandlersBundle
  extends Pick<
    AppShellThinEntryHandlers,
    "theme" | "themeAdmin" | "fissionVideo" | "squareTemplates" | "storageProxy"
  > {
  readonly extraRegistrars?: readonly AppShellExtraRouteRegistrar[];
}

export function createAppShellHandlers(
  ctx: AppContext,
  requireUser: (ctx: AppContext, request: FastifyRequest) => Promise<User>,
  requireAdmin: (ctx: AppContext, request: FastifyRequest) => Promise<User>,
): AppShellHandlersBundle {
  return {
    theme: createThemeRouteHandlersWithContext(ctx, requireUser),
    themeAdmin: createThemeAdminRouteHandlersWithContext(ctx, requireAdmin),
    fissionVideo: createFissionVideoRouteHandlersWithContext(ctx, requireUser),
    squareTemplates: createSquareTemplateRouteHandlersWithContext(ctx, requireUser),
    storageProxy: createStorageProxyRouteHandlersWithContext(ctx, requireUser),
  };
}