import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";

export const APP_ROUTE_REGISTRATION_SHELL_CONTRACT_VERSION = "AT28-10.v1";

export const APP_ROUTE_REGISTRAR_IDS = [
  "project_flow_routes",
  "reverse_square_routes",
  "async_job_routes",
  "admin_library_provider_routes",
  "theme_routes",
  "video_music_routes",
  "fission_video_routes",
  "fission_storyboard_routes",
  "square_template_routes",
  "square_aggregate_routes",
  "image_project_routes",
  "storage_proxy_routes",
] as const;

export type AppRouteRegistrarId = (typeof APP_ROUTE_REGISTRAR_IDS)[number];

export type AppRouteSmokeMethod = "GET" | "POST";

export type AppRouteSmokeAuthScope = "public" | "user" | "admin";

export interface RouteRegistrar {
  readonly id: AppRouteRegistrarId;
  readonly register: (app: FastifyInstance, ctx: AppContext) => void | Promise<void>;
}

export interface AppRouteSmokeCase {
  readonly registrarId: AppRouteRegistrarId;
  readonly method: AppRouteSmokeMethod;
  readonly path: string;
  readonly authScope: AppRouteSmokeAuthScope;
  readonly expectedStatus: number;
}

export const APP_ROUTE_REGISTRATION_SMOKE_PLAN: readonly AppRouteSmokeCase[] = [
  {
    registrarId: "project_flow_routes",
    method: "GET",
    path: "/health",
    authScope: "public",
    expectedStatus: 200,
  },
  {
    registrarId: "project_flow_routes",
    method: "POST",
    path: "/projects",
    authScope: "user",
    expectedStatus: 200,
  },
  {
    registrarId: "reverse_square_routes",
    method: "GET",
    path: "/square/resources",
    authScope: "public",
    expectedStatus: 200,
  },
  {
    registrarId: "async_job_routes",
    method: "GET",
    path: "/async-jobs/my",
    authScope: "user",
    expectedStatus: 200,
  },
  {
    registrarId: "admin_library_provider_routes",
    method: "GET",
    path: "/admin/providers",
    authScope: "admin",
    expectedStatus: 200,
  },
  {
    registrarId: "square_template_routes",
    method: "GET",
    path: "/api/square-templates",
    authScope: "public",
    expectedStatus: 200,
  },
  {
    registrarId: "square_aggregate_routes",
    method: "GET",
    path: "/square/aggregate",
    authScope: "public",
    expectedStatus: 200,
  },
  {
    registrarId: "square_aggregate_routes",
    method: "POST",
    path: "/square/track-behavior",
    authScope: "user",
    expectedStatus: 200,
  },
  {
    registrarId: "image_project_routes",
    method: "POST",
    path: "/projects",
    authScope: "user",
    expectedStatus: 200,
  },
  {
    registrarId: "storage_proxy_routes",
    method: "GET",
    path: "/storage/proxy/projects/test",
    authScope: "user",
    expectedStatus: 200,
  },
];

export function createRouteRegistrarRegistry(
  registrars: readonly RouteRegistrar[],
): Record<AppRouteRegistrarId, RouteRegistrar> {
  const map = new Map<AppRouteRegistrarId, RouteRegistrar>();
  for (const registrar of registrars) {
    if (map.has(registrar.id)) {
      throw new Error(`duplicate registrar id: ${registrar.id}`);
    }
    map.set(registrar.id, registrar);
  }

  for (const id of APP_ROUTE_REGISTRAR_IDS) {
    if (!map.has(id)) {
      throw new Error(`missing registrar id: ${id}`);
    }
  }

  return {
    project_flow_routes: map.get("project_flow_routes") as RouteRegistrar,
    reverse_square_routes: map.get("reverse_square_routes") as RouteRegistrar,
    async_job_routes: map.get("async_job_routes") as RouteRegistrar,
    admin_library_provider_routes: map.get("admin_library_provider_routes") as RouteRegistrar,
    theme_routes: map.get("theme_routes") as RouteRegistrar,
    video_music_routes: map.get("video_music_routes") as RouteRegistrar,
    fission_video_routes: map.get("fission_video_routes") as RouteRegistrar,
    fission_storyboard_routes: map.get("fission_storyboard_routes") as RouteRegistrar,
    square_template_routes: map.get("square_template_routes") as RouteRegistrar,
    square_aggregate_routes: map.get("square_aggregate_routes") as RouteRegistrar,
    image_project_routes: map.get("image_project_routes") as RouteRegistrar,
    storage_proxy_routes: map.get("storage_proxy_routes") as RouteRegistrar,
  };
}

export function assertAppRouteRegistrationShellContract(): {
  version: string;
  registrarCount: number;
  smokeCaseCount: number;
} {
  const uniqueRegistrarIds = new Set(APP_ROUTE_REGISTRAR_IDS);
  if (uniqueRegistrarIds.size !== APP_ROUTE_REGISTRAR_IDS.length) {
    throw new Error("registrar ids must remain unique");
  }

  if (APP_ROUTE_REGISTRATION_SMOKE_PLAN.length < APP_ROUTE_REGISTRAR_IDS.length) {
    throw new Error("smoke plan must cover every registrar domain");
  }

  const smokeCoverage = new Set(APP_ROUTE_REGISTRATION_SMOKE_PLAN.map((item) => item.registrarId));
  for (const registrarId of APP_ROUTE_REGISTRAR_IDS) {
    if (!smokeCoverage.has(registrarId)) {
      throw new Error(`smoke plan missing registrar coverage: ${registrarId}`);
    }
  }

  return {
    version: APP_ROUTE_REGISTRATION_SHELL_CONTRACT_VERSION,
    registrarCount: APP_ROUTE_REGISTRAR_IDS.length,
    smokeCaseCount: APP_ROUTE_REGISTRATION_SMOKE_PLAN.length,
  };
}

