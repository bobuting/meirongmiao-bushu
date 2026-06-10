import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { createRouteRegistrarRegistry } from "./index.js";
import type { ProjectFlowRouteHandlers } from "./project-flow-routes.js";
import { registerProjectFlowRoutes } from "./project-flow-routes.js";
import type { ReverseSquareRouteHandlers } from "./reverse-square-routes.js";
import { registerReverseSquareRoutes, registerReverseContextRoutes } from "./reverse-square-routes.js";
import { registerAsyncJobRoutes } from "./async-job-routes.js";
import { registerSSERoutes } from "./sse-routes.js";
import type {
  AdminProviderRouteHandlers,
} from "./admin-library-provider-routes.js";
import {
  registerAdminProviderRoutes,
} from "./admin-library-provider-routes.js";
import type { ThemeRouteHandlers, ThemeAdminRouteHandlers } from "./theme-routes.js";
import { registerThemeRoutes, registerThemeAdminRoutes } from "./theme-routes.js";
import type { VideoMusicRouteHandlers } from "./video-music-routes.js";
import { registerVideoMusicRoutes } from "./video-music-routes.js";
import type { FissionVideoRouteHandlers } from "./fission-video-routes.js";
import { registerFissionVideoRoutes } from "./fission-video-routes.js";
import { fissionStoryboardRouteRegistrar } from "./fission-storyboard-routes.js";
import type { SquareTemplateRouteHandlers } from "./square-template-routes.js";
import { registerSquareTemplateRoutes } from "./square-template-routes.js";
import { registerSquareAggregateRoutes } from "./square-aggregate-routes.js";
import { imageProjectRouteRegistrar } from "./image-project/index.js";
import type { StorageProxyRouteHandlers } from "./storage-proxy-routes.js";
import { registerStorageProxyRoutes } from "./storage-proxy-routes.js";

export const APP_SHELL_THIN_ENTRY_CONTRACT_VERSION = "AT28-13.v2";

export interface AppShellExtraRouteRegistrar {
  readonly id: string;
  readonly register: (app: FastifyInstance, ctx: AppContext) => void | Promise<void>;
}

/** 广场视频 URL 解析器（TikHub/Apify orchestrator） */
export interface SquareVideoUrlResolver {
  buildSquareTrendVideoResolveOrchestrator: () => {
    execute: (input: { userId: string; projectId: string; url: string }) => Promise<{
      success: boolean;
      resolvedVideoUrl: string | null;
      traceId: string;
      finalStage: string | null;
      attempts: Array<{
        stage: string;
        provider: string;
        status: "success" | "failed";
        reasonCode: string;
        detail: string | null;
      }>;
    }>;
  };
}

export interface AppShellThinEntryHandlers {
  readonly projectFlow: ProjectFlowRouteHandlers;
  readonly reverseSquare: ReverseSquareRouteHandlers;
  readonly adminProviders: AdminProviderRouteHandlers;
  readonly theme?: ThemeRouteHandlers;
  readonly themeAdmin?: ThemeAdminRouteHandlers;
  readonly videoMusic?: VideoMusicRouteHandlers;
  readonly fissionVideo?: FissionVideoRouteHandlers;
  readonly extraRegistrars?: readonly AppShellExtraRouteRegistrar[];
  readonly squareTemplates?: SquareTemplateRouteHandlers;
  readonly squareVideoUrlResolver?: SquareVideoUrlResolver;
  readonly storageProxy?: StorageProxyRouteHandlers;
}

export function registerAppShellThinEntry(
  app: FastifyInstance,
  ctx: AppContext,
  handlers: AppShellThinEntryHandlers,
): void {
  const registry = createRouteRegistrarRegistry([
    {
      id: "project_flow_routes",
      register: (targetApp) => {
        registerProjectFlowRoutes(targetApp, handlers.projectFlow);
      },
    },
    {
      id: "reverse_square_routes",
      register: (targetApp) => {
        registerReverseSquareRoutes(targetApp, handlers.reverseSquare);
      },
    },
    {
      id: "admin_library_provider_routes",
      register: (targetApp) => {
        registerAdminProviderRoutes(targetApp, handlers.adminProviders);
      },
    },
    {
      id: "theme_routes",
      register: (targetApp) => {
        if (handlers.theme) {
          registerThemeRoutes(targetApp, handlers.theme);
        }
        if (handlers.themeAdmin) {
          registerThemeAdminRoutes(targetApp, handlers.themeAdmin);
        }
      },
    },
    {
      id: "video_music_routes",
      register: (targetApp, targetCtx) => {
        if (handlers.videoMusic) {
          registerVideoMusicRoutes(targetApp, targetCtx, handlers.videoMusic);
        }
      },
    },
    {
      id: "fission_video_routes",
      register: (targetApp) => {
        if (handlers.fissionVideo) {
          registerFissionVideoRoutes(targetApp, handlers.fissionVideo);
        }
      },
    },
    fissionStoryboardRouteRegistrar,
    {
      id: "square_template_routes",
      register: (targetApp) => {
        if (handlers.squareTemplates) {
          registerSquareTemplateRoutes(targetApp, handlers.squareTemplates);
        }
      },
    },
    {
      id: "square_aggregate_routes",
      register: (targetApp, targetCtx) => {
        registerSquareAggregateRoutes(targetApp, targetCtx);
      },
    },
    imageProjectRouteRegistrar,
    {
      id: "async_job_routes",
      register: (targetApp, targetCtx) => {
        if (targetCtx) {
          registerAsyncJobRoutes(targetApp, targetCtx);
          registerSSERoutes(targetApp, targetCtx);
        }
      },
    },
    {
      id: "storage_proxy_routes",
      register: (targetApp, targetCtx) => {
        if (handlers.storageProxy) {
          registerStorageProxyRoutes(targetApp, handlers.storageProxy);
        }
      },
    },
  ]);

  registry.project_flow_routes.register(app, ctx);
  registry.reverse_square_routes.register(app, ctx);
  registerReverseContextRoutes(app, ctx, handlers.squareVideoUrlResolver);
  registry.async_job_routes.register(app, ctx);
  registry.admin_library_provider_routes.register(app, ctx);
  registry.theme_routes.register(app, ctx);
  registry.video_music_routes.register(app, ctx);
  registry.fission_video_routes.register(app, ctx);
  registry.square_template_routes.register(app, ctx);
  registry.square_aggregate_routes.register(app, ctx);
  registry.image_project_routes.register(app, ctx);
  registry.storage_proxy_routes.register(app, ctx);
  const reservedRegistrarIds = new Set([
    "project_flow_routes",
    "reverse_square_routes",
    "admin_library_provider_routes",
    "theme_routes",
    "video_music_routes",
    "fission_video_routes",
    "square_template_routes",
    "square_aggregate_routes",
    "image_project_routes",
    "storage_proxy_routes",
  ]);
  const registeredExtraIds = new Set<string>();
  for (const registrar of handlers.extraRegistrars ?? []) {
    if (reservedRegistrarIds.has(registrar.id)) {
      throw new Error(`extra registrar id conflicts with shell slot: ${registrar.id}`);
    }
    if (registeredExtraIds.has(registrar.id)) {
      throw new Error(`duplicate extra registrar id: ${registrar.id}`);
    }
    registeredExtraIds.add(registrar.id);
    registrar.register(app, ctx);
  }
}
