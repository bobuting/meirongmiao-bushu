import { describe, expect, it } from "vitest";
import type { FastifyInstance, RouteHandlerMethod } from "fastify";
import type { AppContext } from "../src/core/app-context.js";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import {
  APP_SHELL_THIN_ENTRY_CONTRACT_VERSION,
  registerAppShellThinEntry,
} from "../src/routes/app-shell-thin-entry.js";

interface RegisteredRoute {
  method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  path: string;
}

function createHandler(): RouteHandlerMethod {
  return async () => ({ ok: true });
}

function createMockFastify(registered: RegisteredRoute[]): FastifyInstance {
  const push =
    (method: RegisteredRoute["method"]) =>
    (path: string, _handler: RouteHandlerMethod): void => {
      registered.push({ method, path });
    };
  return {
    get: push("GET"),
    post: push("POST"),
    patch: push("PATCH"),
    delete: push("DELETE"),
    put: push("PUT"),
  } as unknown as FastifyInstance;
}

const minimalCtx = {
  store: {
    config: DEFAULT_CONFIG,
  },
} as AppContext;

describe("AT28-13 app shell thin entry", () => {
  it("registers project/reverse/admin+library route slices through a single shell entry", () => {
    const registered: RegisteredRoute[] = [];
    const app = createMockFastify(registered);

    registerAppShellThinEntry(app, minimalCtx, {
      projectFlow: {
        createProject: createHandler(),
        renameProject: createHandler(),
        saveWorkflowState: createHandler(),
        getResumeSnapshot: createHandler(),
        getStep1Garments: createHandler(),
        getOutfitPlans: createHandler(),
        getStep1State: createHandler(),
        deleteProject: createHandler(),
        uploadAssets: createHandler(),
      },
      reverseSquare: {
        reverseParseV2Start: createHandler(),
        reverseParseV2Job: createHandler(),
        reverseParseV2: createHandler(),
        reverseParse: createHandler(),
        squareResources: createHandler(),
        squareTrends: createHandler(),
      },
      libraryAssets: {
        listAssets: createHandler(),
        createAsset: createHandler(),
        updateAsset: createHandler(),
        deleteAsset: createHandler(),
      },
      adminProviders: {
        listProviders: createHandler(),
        createProvider: createHandler(),
        updateProvider: createHandler(),
        deleteProvider: createHandler(),
        upsertProviderSecret: createHandler(),
      },
    });

    expect(APP_SHELL_THIN_ENTRY_CONTRACT_VERSION).toBe("AT28-13.v2");
    expect(registered.length).toBeGreaterThanOrEqual(23);
    expect(registered).toEqual(
      expect.arrayContaining([
        { method: "POST", path: "/projects" },
        { method: "PATCH", path: "/projects/:projectId" },
        { method: "POST", path: "/projects/:projectId/workflow-state" },
        { method: "GET", path: "/projects/:projectId/resume-snapshot" },
        { method: "DELETE", path: "/projects/:projectId" },
        { method: "POST", path: "/projects/:projectId/uploads" },
        { method: "PATCH", path: "/projects/:projectId/uploads/:assetId" },
        { method: "POST", path: "/reverse/parse-v2/jobs" },
        { method: "GET", path: "/reverse/parse-v2/jobs/:jobId" },
        { method: "POST", path: "/reverse/parse-v2" },
        { method: "POST", path: "/reverse/parse" },
        { method: "GET", path: "/square/resources" },
        { method: "GET", path: "/square/trends" },
        { method: "GET", path: "/library/assets" },
        { method: "POST", path: "/library/assets" },
        { method: "PATCH", path: "/library/assets/:assetId" },
        { method: "DELETE", path: "/library/assets/:assetId" },
        { method: "GET", path: "/admin/providers" },
        { method: "POST", path: "/admin/providers" },
        { method: "PATCH", path: "/admin/providers/:providerId" },
        { method: "DELETE", path: "/admin/providers/:providerId" },
        { method: "PUT", path: "/admin/providers/:providerId/secret" },
      ]),
    );
  });

  it("still keeps the optional shell slots available before extra registrars run", () => {
    const registered: RegisteredRoute[] = [];
    const app = createMockFastify(registered);

    registerAppShellThinEntry(app, minimalCtx, {
      projectFlow: {
        createProject: createHandler(),
        renameProject: createHandler(),
        saveWorkflowState: createHandler(),
        getResumeSnapshot: createHandler(),
        getStep1Garments: createHandler(),
        getOutfitPlans: createHandler(),
        getStep1State: createHandler(),
        deleteProject: createHandler(),
        uploadAssets: createHandler(),
      },
      reverseSquare: {
        reverseParseV2Start: createHandler(),
        reverseParseV2Job: createHandler(),
        reverseParseV2: createHandler(),
        reverseParse: createHandler(),
        squareResources: createHandler(),
        squareTrends: createHandler(),
      },
      libraryAssets: {
        listAssets: createHandler(),
        createAsset: createHandler(),
        updateAsset: createHandler(),
        deleteAsset: createHandler(),
      },
      adminProviders: {
        listProviders: createHandler(),
        createProvider: createHandler(),
        updateProvider: createHandler(),
        deleteProvider: createHandler(),
        upsertProviderSecret: createHandler(),
      },
      theme: {
        listThemes: createHandler(),
        getCurrentUserTheme: createHandler(),
        setCurrentUserTheme: createHandler(),
      },
      themeAdmin: {
        listThemes: createHandler(),
        getTheme: createHandler(),
        createTheme: createHandler(),
        updateTheme: createHandler(),
        deleteTheme: createHandler(),
        duplicateTheme: createHandler(),
        getThemeStats: createHandler(),
      },
      videoMusic: {
        __ctx: minimalCtx,
        __requireUser: (() => ({ id: "user-1" })) as never,
      },
      fissionVideo: {
        getStoryboards: createHandler(),
        listFissionVideos: createHandler(),
        createFissionVideo: createHandler(),
        deleteFissionVideo: createHandler(),
        uploadFissionVideo: createHandler(),
        uploadComVideo: createHandler(),
        uploadMirrorVideos: createHandler(),
        getMirrorVideoStatus: createHandler(),
        createImageToVideo: createHandler(),
        processStoryboard: createHandler(),
        listFissionVideoStatus: createHandler(),
        getFissionVideoStatus: createHandler(),
        createFissionVideoStatus: createHandler(),
        updateFissionVideoStatus: createHandler(),
        deleteFissionVideoStatus: createHandler(),
        listFissionStoryboard: createHandler(),
        getFissionStoryboard: createHandler(),
        createFissionStoryboard: createHandler(),
        updateFissionStoryboard: createHandler(),
        deleteFissionStoryboard: createHandler(),
        batchCreateFissionStoryboard: createHandler(),
        deleteAllByProjectId: createHandler(),
        saveCombination: createHandler(),
        listCombinations: createHandler(),
        updateCombination: createHandler(),
        deleteCombination: createHandler(),
        generateMirrorVideos: createHandler(),
        getProjectVideoMusic: createHandler(),
      },
      fissionStoryboard: {
        generateStoryboard: createHandler(),
        listStoryboardTask: createHandler(),
      },
      extraRegistrars: [
        {
          id: "custom_shell",
          register: (targetApp) => targetApp.get("/custom-shell", createHandler()),
        },
      ],
    });

    expect(registered).toEqual(
      expect.arrayContaining([
        { method: "GET", path: "/api/themes" },
        { method: "GET", path: "/api/video-music" },
        { method: "GET", path: "/api/fission/videos" },
        { method: "POST", path: "/api/fission/storyboard/new-story" },
        { method: "GET", path: "/custom-shell" },
      ]),
    );
    expect(registered.at(-1)).toEqual({ method: "GET", path: "/custom-shell" });
  });

  it("rejects duplicate or reserved extra registrar ids", () => {
    const app = createMockFastify([]);
    const baseHandlers = {
      projectFlow: {
        createProject: createHandler(),
        renameProject: createHandler(),
        saveWorkflowState: createHandler(),
        getResumeSnapshot: createHandler(),
        getStep1Garments: createHandler(),
        getOutfitPlans: createHandler(),
        getStep1State: createHandler(),
        deleteProject: createHandler(),
        uploadAssets: createHandler(),
      },
      reverseSquare: {
        reverseParseV2Start: createHandler(),
        reverseParseV2Job: createHandler(),
        reverseParseV2: createHandler(),
        reverseParse: createHandler(),
        squareResources: createHandler(),
        squareTrends: createHandler(),
      },
      libraryAssets: {
        listAssets: createHandler(),
        createAsset: createHandler(),
        updateAsset: createHandler(),
        deleteAsset: createHandler(),
      },
      adminProviders: {
        listProviders: createHandler(),
        createProvider: createHandler(),
        updateProvider: createHandler(),
        deleteProvider: createHandler(),
        upsertProviderSecret: createHandler(),
      },
    };

    expect(() =>
      registerAppShellThinEntry(app, minimalCtx, {
        ...baseHandlers,
        extraRegistrars: [
          { id: "custom_shell", register: () => undefined },
          { id: "custom_shell", register: () => undefined },
        ],
      }),
    ).toThrow("duplicate extra registrar id: custom_shell");

    expect(() =>
      registerAppShellThinEntry(app, minimalCtx, {
        ...baseHandlers,
        extraRegistrars: [{ id: "project_flow_routes", register: () => undefined }],
      }),
    ).toThrow("extra registrar id conflicts with shell slot: project_flow_routes");

    expect(() =>
      registerAppShellThinEntry(app, minimalCtx, {
        ...baseHandlers,
        extraRegistrars: [{ id: "theme_routes", register: () => undefined }],
      }),
    ).toThrow("extra registrar id conflicts with shell slot: theme_routes");
  });
});
