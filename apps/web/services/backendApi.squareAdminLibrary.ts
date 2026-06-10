import { ApiError, type BackendApi } from "./backendApi";
import type { RouteApiCallInvoker } from "./backendApi.projectReverse";
import {
  buildStep1NonClothingUploadMessage,
  shouldBlockStep1UploadByClassification,
} from "./step1ClothingUploadGuard";

export type SquareAdminLibraryApiMethodName =
  | "adminReviewAction"
  | "adminConfirmPublish"
  | "squareResources"
  | "squareResolveVideoUrl"
  | "squareTemplateGetScript"
  | "squareTemplateLinkScript"
  | "adminConfigGet"
  | "adminConfigPatch"
  | "adminRouteKeyCreditCostsGet"
  | "adminRouteKeyCreditCostUpdate"
  | "adminRouteKeyCreditCostDelete"
  | "adminReviews"
  | "adminUsers"
  | "adminCreateUser"
  | "adminUpdateUser"
  | "adminDeleteUser"
  | "adminImportUsers"
  | "adminExportUsers"
  | "adminScripts"
  | "adminCreateScript"
  | "adminUpdateScript"
  | "adminDeleteScript"
  | "adminImportScripts"
  | "adminExportScripts"
  | "adminHotTrendScripts"
  | "adminSyncHotTrendScripts"
  | "adminUpsertHotTrendScript"
  | "adminUpdateHotTrendScript"
  | "adminDeleteHotTrendScript"
  | "adminHotTrendSyncLogs"
  | "adminHotTrendDailyReports"
  | "adminHotTrendDailyReportDetail"
  | "adminSetUserLock"
  | "adminAdjustUserCredits"
  | "adminProviders"
  | "adminCreateProvider"
  | "adminUpdateProvider"
  | "adminDeleteProvider"
  | "adminUpdateProviderSecret"
  | "adminTestProviderConnectivity"
  | "adminProviderPolicies"
  | "adminCreateProviderPolicy"
  | "adminUpdateProviderPolicy"
  | "adminDeleteProviderPolicy"
  | "adminProviderAudits"
  | "adminProviderAuditDetail"
  | "adminClearProviderAudits"
  | "adminCapabilityLabText"
  | "adminCapabilityLabImageInsight"
  | "adminCapabilityLabImageGenerate"
  | "adminCapabilityLabVideoGenerate"
  | "adminCapabilityLabReverseFetch"
  | "adminCapabilityLabVideoReverse"
  | "adminCapabilityLabVideoReverseUpload"
  | "classifyLibraryAssetImage"
  | "getStsCredential"
  | "signUploadUrl"
  | "deleteOssFile"
  | "listLibraryCharacters"
  | "createLibraryCharacter"
  | "updateLibraryCharacter"
  | "deleteLibraryCharacter"
  | "listMyLibraryScripts"
  | "listMyLibraryStoryboards"
  | "adminSmartStoryboardLibrary"
  | "listLibraryScripts"
  | "createLibraryScript"
  | "deleteLibraryScript"
  | "deleteLibraryScripts"
  // 注意：updateLibraryScript、listLibraryScriptVersions、rollbackLibraryScript 已移除
  | "listReverseStoryboardLibrary"
  | "updateReverseStoryboardLibrary"
  | "deleteReverseStoryboardLibrary";

export const SQUARE_ADMIN_LIBRARY_API_METHODS: readonly SquareAdminLibraryApiMethodName[] = [
  "adminReviewAction",
  "adminConfirmPublish",
  "squareResources",
  "squareResolveVideoUrl",
  "squareTemplateGetScript",
  "squareTemplateLinkScript",
  "adminConfigGet",
  "adminConfigPatch",
  "adminRouteKeyCreditCostsGet",
  "adminRouteKeyCreditCostUpdate",
  "adminRouteKeyCreditCostDelete",
  "adminReviews",
  "adminUsers",
  "adminCreateUser",
  "adminUpdateUser",
  "adminDeleteUser",
  "adminImportUsers",
  "adminExportUsers",
  "adminScripts",
  "adminCreateScript",
  "adminUpdateScript",
  "adminDeleteScript",
  "adminImportScripts",
  "adminExportScripts",
  "adminHotTrendScripts",
  "adminSyncHotTrendScripts",
  "adminUpsertHotTrendScript",
  "adminUpdateHotTrendScript",
  "adminDeleteHotTrendScript",
  "adminHotTrendSyncLogs",
  "adminHotTrendDailyReports",
  "adminHotTrendDailyReportDetail",
  "adminSetUserLock",
  "adminAdjustUserCredits",
  "adminProviders",
  "adminCreateProvider",
  "adminUpdateProvider",
  "adminDeleteProvider",
  "adminUpdateProviderSecret",
  "adminTestProviderConnectivity",
  "adminProviderPolicies",
  "adminCreateProviderPolicy",
  "adminUpdateProviderPolicy",
  "adminDeleteProviderPolicy",
  "adminProviderAudits",
  "adminProviderAuditDetail",
  "adminClearProviderAudits",
  "adminCapabilityLabText",
  "adminCapabilityLabImageInsight",
  "adminCapabilityLabImageGenerate",
  "adminCapabilityLabVideoGenerate",
  "adminCapabilityLabReverseFetch",
  "adminCapabilityLabVideoReverse",
  "adminCapabilityLabVideoReverseUpload",
  "classifyLibraryAssetImage",
  "getStsCredential",
  "signUploadUrl",
  "deleteOssFile",
  "listLibraryCharacters",
  "createLibraryCharacter",
  "updateLibraryCharacter",
  "deleteLibraryCharacter",
  "listMyLibraryScripts",
  "listMyLibraryStoryboards",
  "adminSmartStoryboardLibrary",
  "listLibraryScripts",
  "createLibraryScript",
  "deleteLibraryScript",
  "deleteLibraryScripts",
  // 注意：以下方法已移除（新 API 不支持）：updateLibraryScript、listLibraryScriptVersions、rollbackLibraryScript
  "listReverseStoryboardLibrary",
  "updateReverseStoryboardLibrary",
  "deleteReverseStoryboardLibrary",
] as const;

export function createSquareAdminLibraryBackendApi(
  routeApiCall: RouteApiCallInvoker,
): Pick<BackendApi, SquareAdminLibraryApiMethodName> {
  return {
    adminReviewAction: (...args) => routeApiCall("adminReviewAction", args),
    adminConfirmPublish: (...args) => routeApiCall("adminConfirmPublish", args),
    squareResources: (...args) => routeApiCall("squareResources", args),
    squareResolveVideoUrl: (...args) => routeApiCall("squareResolveVideoUrl", args),
    squareTemplateGetScript: (...args) => routeApiCall("squareTemplateGetScript", args),
    squareTemplateLinkScript: (...args) => routeApiCall("squareTemplateLinkScript", args),
    adminConfigGet: (...args) => routeApiCall("adminConfigGet", args),
    adminConfigPatch: (...args) => routeApiCall("adminConfigPatch", args),
    adminRouteKeyCreditCostsGet: (...args) => routeApiCall("adminRouteKeyCreditCostsGet", args),
    adminRouteKeyCreditCostUpdate: (...args) => routeApiCall("adminRouteKeyCreditCostUpdate", args),
    adminRouteKeyCreditCostDelete: (...args) => routeApiCall("adminRouteKeyCreditCostDelete", args),
    adminReviews: (...args) => routeApiCall("adminReviews", args),
    adminUsers: (...args) => routeApiCall("adminUsers", args),
    adminCreateUser: (...args) => routeApiCall("adminCreateUser", args),
    adminUpdateUser: (...args) => routeApiCall("adminUpdateUser", args),
    adminDeleteUser: (...args) => routeApiCall("adminDeleteUser", args),
    adminImportUsers: (...args) => routeApiCall("adminImportUsers", args),
    adminExportUsers: (...args) => routeApiCall("adminExportUsers", args),
    adminScripts: (...args) => routeApiCall("adminScripts", args),
    adminCreateScript: (...args) => routeApiCall("adminCreateScript", args),
    adminUpdateScript: (...args) => routeApiCall("adminUpdateScript", args),
    adminDeleteScript: (...args) => routeApiCall("adminDeleteScript", args),
    adminImportScripts: (...args) => routeApiCall("adminImportScripts", args),
    adminExportScripts: (...args) => routeApiCall("adminExportScripts", args),
    adminHotTrendScripts: (...args) => routeApiCall("adminHotTrendScripts", args),
    adminSyncHotTrendScripts: (...args) => routeApiCall("adminSyncHotTrendScripts", args),
    adminUpsertHotTrendScript: (...args) => routeApiCall("adminUpsertHotTrendScript", args),
    adminUpdateHotTrendScript: (...args) => routeApiCall("adminUpdateHotTrendScript", args),
    adminDeleteHotTrendScript: (...args) => routeApiCall("adminDeleteHotTrendScript", args),
    adminHotTrendSyncLogs: (...args) => routeApiCall("adminHotTrendSyncLogs", args),
    adminHotTrendDailyReports: (...args) => routeApiCall("adminHotTrendDailyReports", args),
    adminHotTrendDailyReportDetail: (...args) => routeApiCall("adminHotTrendDailyReportDetail", args),
    adminSetUserLock: (...args) => routeApiCall("adminSetUserLock", args),
    adminAdjustUserCredits: (...args) => routeApiCall("adminAdjustUserCredits", args),
    adminProviders: (...args) => routeApiCall("adminProviders", args),
    adminCreateProvider: (...args) => routeApiCall("adminCreateProvider", args),
    adminUpdateProvider: (...args) => routeApiCall("adminUpdateProvider", args),
    adminDeleteProvider: (...args) => routeApiCall("adminDeleteProvider", args),
    adminUpdateProviderSecret: (...args) => routeApiCall("adminUpdateProviderSecret", args),
    adminTestProviderConnectivity: (...args) => routeApiCall("adminTestProviderConnectivity", args),
    adminProviderPolicies: (...args) => routeApiCall("adminProviderPolicies", args),
    adminCreateProviderPolicy: (...args) => routeApiCall("adminCreateProviderPolicy", args),
    adminUpdateProviderPolicy: (...args) => routeApiCall("adminUpdateProviderPolicy", args),
    adminDeleteProviderPolicy: (...args) => routeApiCall("adminDeleteProviderPolicy", args),
    adminProviderAudits: (...args) => routeApiCall("adminProviderAudits", args),
    adminProviderAuditDetail: (...args) => routeApiCall("adminProviderAuditDetail", args),
    adminClearProviderAudits: (...args) => routeApiCall("adminClearProviderAudits", args),
    adminCapabilityLabText: (...args) => routeApiCall("adminCapabilityLabText", args),
    adminCapabilityLabImageInsight: (...args) => routeApiCall("adminCapabilityLabImageInsight", args),
    adminCapabilityLabImageGenerate: (...args) => routeApiCall("adminCapabilityLabImageGenerate", args),
    adminCapabilityLabVideoGenerate: (...args) => routeApiCall("adminCapabilityLabVideoGenerate", args),
    adminCapabilityLabReverseFetch: (...args) => routeApiCall("adminCapabilityLabReverseFetch", args),
    adminCapabilityLabVideoReverse: (...args) => routeApiCall("adminCapabilityLabVideoReverse", args),
    adminCapabilityLabVideoReverseUpload: (...args) => routeApiCall("adminCapabilityLabVideoReverseUpload", args),
    classifyLibraryAssetImage: (...args) => routeApiCall("classifyLibraryAssetImage", args),
    getStsCredential: (...args) => routeApiCall("getStsCredential", args),
    signUploadUrl: (...args) => routeApiCall("signUploadUrl", args),
    deleteOssFile: (...args) => routeApiCall("deleteOssFile", args),
    listLibraryCharacters: (...args) => routeApiCall("listLibraryCharacters", args),
    createLibraryCharacter: (...args) => routeApiCall("createLibraryCharacter", args),
    updateLibraryCharacter: (...args) => routeApiCall("updateLibraryCharacter", args),
    deleteLibraryCharacter: (...args) => routeApiCall("deleteLibraryCharacter", args),
    listMyLibraryScripts: (...args) => routeApiCall("listMyLibraryScripts", args),
    listMyLibraryStoryboards: (...args) => routeApiCall("listMyLibraryStoryboards", args),
    adminSmartStoryboardLibrary: (...args) => routeApiCall("adminSmartStoryboardLibrary", args),
    listLibraryScripts: (...args) => routeApiCall("listLibraryScripts", args),
    createLibraryScript: (...args) => routeApiCall("createLibraryScript", args),
    // 注意：updateLibraryScript、listLibraryScriptVersions、rollbackLibraryScript 已移除
    deleteLibraryScript: (...args) => routeApiCall("deleteLibraryScript", args),
    deleteLibraryScripts: (...args) => routeApiCall("deleteLibraryScripts", args),
    listReverseStoryboardLibrary: (...args) => routeApiCall("listReverseStoryboardLibrary", args),
    updateReverseStoryboardLibrary: (...args) => routeApiCall("updateReverseStoryboardLibrary", args),
    deleteReverseStoryboardLibrary: (...args) => routeApiCall("deleteReverseStoryboardLibrary", args),
  };
}


