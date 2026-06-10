import type { FastifyInstance, RouteHandlerMethod } from "fastify";

export interface ProjectFlowRouteHandlers {
  readonly createProject: RouteHandlerMethod;
  readonly renameProject: RouteHandlerMethod;
  readonly saveWorkflowState: RouteHandlerMethod;
  readonly getResumeSnapshot: RouteHandlerMethod;
  readonly getStep1Garments: RouteHandlerMethod;
  readonly getOutfitPlans: RouteHandlerMethod;
  readonly getStep1State: RouteHandlerMethod;
  readonly getProjectContext: RouteHandlerMethod;
  readonly deleteProject: RouteHandlerMethod;
  readonly uploadAssets: RouteHandlerMethod;
  readonly getDouyinPublishStatus: RouteHandlerMethod;
  readonly getDouyinAuthStatus: RouteHandlerMethod;
  readonly getDouyinRemoteLoginStatus: RouteHandlerMethod;
  readonly generateDouyinQRCode: RouteHandlerMethod;
  readonly checkDouyinScanStatus: RouteHandlerMethod;
  readonly clearDouyinCookie: RouteHandlerMethod;
  readonly createDouyinRemoteSession: RouteHandlerMethod;
  readonly getDouyinRemoteSession: RouteHandlerMethod;
  readonly closeDouyinRemoteSession: RouteHandlerMethod;
  readonly publishToDouyin: RouteHandlerMethod;
  readonly getPublishJob: RouteHandlerMethod;
  readonly getPublishJobs: RouteHandlerMethod;
  readonly getPublishStagingScreenshot: RouteHandlerMethod;
  readonly updateRoleDirection: RouteHandlerMethod;
}

export function registerProjectFlowRoutes(
  app: FastifyInstance,
  handlers: ProjectFlowRouteHandlers,
): void {
  app.post("/projects", handlers.createProject);
  app.patch("/projects/:projectId", handlers.renameProject);
  app.post("/projects/:projectId/workflow-state", handlers.saveWorkflowState);
  app.get("/projects/:projectId/resume-snapshot", handlers.getResumeSnapshot);
  app.get("/projects/:projectId/garments", handlers.getStep1Garments);
  app.get("/projects/:projectId/outfit-plans", handlers.getOutfitPlans);
  app.get("/projects/:projectId/step1-state", handlers.getStep1State);
  app.get("/projects/:projectId/context", handlers.getProjectContext);
  app.delete("/projects/:projectId", handlers.deleteProject);
  app.post("/projects/:projectId/uploads", handlers.uploadAssets);
  app.get("/douyin-publish/status", handlers.getDouyinPublishStatus);
  app.get("/douyin/auth/status", handlers.getDouyinAuthStatus);
  app.get("/douyin/auth/remote-login/status", handlers.getDouyinRemoteLoginStatus);
  app.post("/douyin/auth/qr-code", handlers.generateDouyinQRCode);
  app.get("/douyin/auth/status/:sessionId", handlers.checkDouyinScanStatus);
  app.delete("/douyin/auth/cookie", handlers.clearDouyinCookie);
  app.post("/douyin/auth/remote-session", handlers.createDouyinRemoteSession);
  app.get("/douyin/auth/remote-session/:sessionId", handlers.getDouyinRemoteSession);
  app.delete("/douyin/auth/remote-session/:sessionId", handlers.closeDouyinRemoteSession);
  app.post("/projects/:projectId/publish-to-douyin", handlers.publishToDouyin);
  app.get("/projects/:projectId/publish-jobs/:jobId", handlers.getPublishJob);
  app.get("/projects/:projectId/publish-jobs", handlers.getPublishJobs);
  app.get("/publish-staging/:filename", handlers.getPublishStagingScreenshot);
  app.put("/projects/:projectId/role-direction", handlers.updateRoleDirection);
}
