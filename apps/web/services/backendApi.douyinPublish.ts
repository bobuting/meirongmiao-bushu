import type { ApiMethodName, BackendApi } from "./backendApi";

export type DouyinPublishApiMethodName =
  | "publishToDouyin"
  | "getDouyinPublishStatus"
  | "getDouyinAuthStatus"
  | "getDouyinRemoteLoginStatus"
  | "generateDouyinQRCode"
  | "checkDouyinScanStatus"
  | "createDouyinRemoteSession"
  | "getDouyinRemoteSession"
  | "closeDouyinRemoteSession"
  | "clearDouyinCookie"
  | "getPublishJob"
  | "getPublishJobs";

export interface RouteApiCallInvoker {
  <K extends ApiMethodName>(
    methodName: K,
    args: Parameters<BackendApi[K]>,
  ): Promise<Awaited<ReturnType<BackendApi[K]>>>;
}

export const DOUYIN_PUBLISH_API_METHODS: readonly DouyinPublishApiMethodName[] = [
  "publishToDouyin",
  "getDouyinPublishStatus",
  "getDouyinAuthStatus",
  "getDouyinRemoteLoginStatus",
  "generateDouyinQRCode",
  "checkDouyinScanStatus",
  "createDouyinRemoteSession",
  "getDouyinRemoteSession",
  "closeDouyinRemoteSession",
  "clearDouyinCookie",
  "getPublishJob",
  "getPublishJobs",
] as const;

export function createDouyinPublishBackendApi(
  routeApiCall: RouteApiCallInvoker,
): Pick<BackendApi, DouyinPublishApiMethodName> {
  return {
    publishToDouyin: (...args) => routeApiCall("publishToDouyin", args),
    getDouyinPublishStatus: (...args) => routeApiCall("getDouyinPublishStatus", args),
    getDouyinAuthStatus: (...args) => routeApiCall("getDouyinAuthStatus", args),
    getDouyinRemoteLoginStatus: (...args) => routeApiCall("getDouyinRemoteLoginStatus", args),
    generateDouyinQRCode: (...args) => routeApiCall("generateDouyinQRCode", args),
    checkDouyinScanStatus: (...args) => routeApiCall("checkDouyinScanStatus", args),
    createDouyinRemoteSession: (...args) => routeApiCall("createDouyinRemoteSession", args),
    getDouyinRemoteSession: (...args) => routeApiCall("getDouyinRemoteSession", args),
    closeDouyinRemoteSession: (...args) => routeApiCall("closeDouyinRemoteSession", args),
    clearDouyinCookie: (...args) => routeApiCall("clearDouyinCookie", args),
    getPublishJob: (...args) => routeApiCall("getPublishJob", args),
    getPublishJobs: (...args) => routeApiCall("getPublishJobs", args),
  };
}
