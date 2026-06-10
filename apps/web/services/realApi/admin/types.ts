/**
 * 管理后台 API 类型定义
 */

import type { ProviderRouteKey } from "../../backendApi.types";
import type { ProviderCallMode } from "@contracts/types";
import type { CharacterWorkflowSystemSettings } from "@contracts/character-workflow-system-settings";

// ==================== 配置相关 ====================

/** 管理配置 */
export interface AdminConfig {
  lockoutAttempts: number;
  lockoutMinutes: number;
  scriptMaxDurationSec: number;
  mockCreditDefault: number;
  creditValidityDays: number;
  providerErrorLogRetentionDays: number;
  reverseFetchStageOrder: string;
  reverseExternalApiPriority: string;
  apifyReverseApiUrl: string;
  apifyReverseApiToken: string;
  tikhubVideoHotApiUrl: string;
  tikhubRealtimeHotApiUrl: string;
  tikhubReverseApiUrl: string;
  tikhubApiToken: string;
  anytocopyReverseApiUrl: string;
  anytocopyReverseApiToken: string;
  anytocopyEnabled: boolean;
  douhotVideoHotApiUrl: string;
  douyinHotHubRealtimeUrl: string;
  hotTrendRealtimeTopN: number;
  hotTrendVideoTopN: number;
  hotTrendRealtimeSyncIntervalHours: number;
  hotTrendVideoSyncIntervalHours: number;
  hotTrendVideoDateWindowHours: number;
  hotTrendPromptVersion: string;
  adminLlmDebugBubbleEnabled: boolean;
}

export type AdminConfigPatch = Partial<AdminConfig>;

/** RouteKey 积分成本配置 */
export interface RouteKeyCreditCostItem {
  key: string;
  cost: number | null;
  description: string;
}

export interface RouteKeyCreditCostsResponse {
  success: boolean;
  data: {
    allKeys: RouteKeyCreditCostItem[];
    configuredKeys: RouteKeyCreditCostItem[];
  };
}

// ==================== 用户相关 ====================

export interface AdminUser {
  id: string;
  email: string;
  role: "admin" | "user";
  createdAt: number;
  failedAttempts: number;
  lockUntil: number | null;
  creditBalance: number;
  creditExpiresAt: number;
  companyName?: string;
}

export interface AdminCreateUserPayload {
  email: string;
  password: string;
  role?: "admin" | "user";
  companyName?: string;
  initialCredits?: number;
}

export interface AdminUpdateUserPayload {
  email?: string;
  role?: "admin" | "user";
  password?: string;
  companyName?: string;
}

export interface AdminImportUsersPayload {
  items: Array<{ email: string; password: string; role?: "admin" | "user" }>;
}

export interface AdminImportUsersResult {
  created: Array<{ email: string; id: string }>;
  failed: Array<{ email: string; reason: string }>;
  total: number;
}

// ==================== 脚本相关 ====================

export interface AdminScript {
  id: string;
  title: string;
  tags: string[];
  content: string;
  ownerId: string;
  ownerEmail: string;
  date: number;
  status: string;
}

export interface AdminScriptWithVersion extends AdminScript {
  currentVersion: number;
}

export interface AdminHotTrendScript extends AdminScriptWithVersion {
  trendType: "realtime" | "video" | "";
  reason: string;
  sourceUrl?: string | null;
  rank?: number | null;
  suitability?: string;
  humanPresence?: string;
  hotTrendLabels?: Record<string, unknown>;
}

export interface AdminHotTrendScriptsResponse {
  scripts: AdminHotTrendScript[];
  total: number;
  page: number;
  pageSize: number;
  realtimeTotal: number;
  videoTotal: number;
  intervalMs?: number;
  intervalMsByType?: {
    realtime: number;
    video: number;
  };
}

export interface AdminHotTrendSyncLog {
  id: string;
  triggerType: string;
  trendType: string;
  status: string;
  source: string | null;
  topicCount: number;
  durationMs: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}

export interface AdminHotTrendDailyReport {
  id: number;
  report_date: string;
  platform_sources: string[];
  hotspot_count: number;
  platform_distribution: Record<string, number>;
  core_trends: string[];
  outfit_angles: string[];
  emotion_atmosphere: string[];
  avoid_topics: string[];
  creative_suggestions: string[];
  created_at: string;
  updated_at: string;
}

// ==================== Provider 相关 ====================

export interface AdminProvider {
  id: string;
  name: string;
  type: string;
  vendor: string;
  baseUrl: string;
  model: string;
  callMode: ProviderCallMode;
  enabled: boolean;
  createdAt: number;
  hasSecret: boolean;
  maskedSecret: string | null;
}

export interface AdminProviderPolicy {
  id: string;
  routeKey: string;
  type: string;
  primaryProviderId: string;
  fallbackProviderIds: string[];
  timeoutMs: number;
  retryCount: number;
  enabled: boolean;
  description: string;
  sortOrder: number;
  updatedAt: number;
}

export interface AdminProviderAudit {
  id: string;
  providerId: string;
  routeKey: string;
  requestId: string | null;
  status: string;
  latencyMs: number;
  createdAt: number;
  requestSummary: string | null;
  responseSummary: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  callContext: string | null;
  messagesJson: string | null;
  queryParamsJson: string | null;
  actualModel: string | null;
  providerVendor: string | null;
  providerBaseUrl: string | null;
  actualEndpoint: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  ttftMs: number | null;
  projectId: string | null;
  userId: string | null;
  attemptsJson: string | null;
  requestHeadersJson: string | null;
  requestBodyJson: string | null;
  callMode: string | null;
}

// ==================== 功能路由相关 ====================

export interface AdminFunctionalRoute {
  type: string;
  label: string;
  description: string;
  supported: boolean;
  providerId: string | null;
  providerName: string | null;
  providerVendor: string | null;
  providerModel: string | null;
  fallbackProviderIds: string[];
  enabled: boolean;
}

// ==================== 日志相关 ====================

export interface AdminErrorLog {
  id: string;
  errorCode: string;
  errorMessage: string;
  errorStack: string;
  severity: string;
  apiPath: string;
  sourceModule: string;
  inputParams: Record<string, unknown>;
  createdAt: number;
}

export interface AdminCallAudit {
  id: string;
  providerId: string;
  routeKey: string;
  status: string;
  latencyMs: number;
  cost: number;
  createdAt: number;
  errorMessage: string | null;
  actualModel: string | null;
  providerVendor: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  projectId: string | null;
  messagesJson: string | null;
  callContext: string | null;
}

export interface AdminAuditLog {
  id: string;
  actorUserId: string;
  userName?: string;
  userId?: string;
  action: string;
  targetType: string;
  targetId: string;
  resourceType?: string;
  resourceId?: string;
  createdAt: number;
}

// ==================== 脚本管理相关 ====================

export interface AdminScriptItem {
  id: string;
  projectId: string | null;
  userId: string | null;
  title: string | null;
  content: string;
  type: number | null;
  sourceType: string | null;
  videoStyle: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface AdminScriptScore {
  id: string;
  scriptDataId: string;
  strategy: string;
  score: number;
  viewerScore: number | null;
  directorScore: number | null;
  strategistScore: number | null;
  ruleBasedScore: number | null;
  scoringMethod: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  scoreSpread: number | null;
  createdAt: number;
}

// ==================== 任务管理相关 ====================

export interface AdminSystemJob {
  id: string;
  jobType: string;
  input: Record<string, unknown>;
  status: string;
  priority: number;
  retryCount: number;
  maxRetries: number;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  scheduledAt: number | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface AdminUserJob {
  id: string;
  userId: string | null;
  projectId: string | null;
  jobType: string;
  status: string;
  stage: string | null;
  progress: number | null;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
  visibleToUser: boolean;
  createdAt: number;
  updatedAt: number;
}

// ==================== 项目管理相关 ====================

export interface AdminProjectListItem {
  id: string;
  title: string;
  projectKind: string;
  status: string;
  currentStep: number;
  totalSteps: number;
  companyName: string;
  userId: string;
  userEmail: string;
  createdAt: number;
  updatedAt: number;
  thumbnail: string;
  publishTitle?: string;
  exportUrl?: string;
  views?: number;
}

export interface AdminProjectDetail {
  basicInfo: {
    id: string;
    title: string;
    projectKind: string;
    status: string;
    currentStep: number;
    companyName: string;
    userId: string;
    userEmail: string;
    createdAt: number;
    updatedAt: number;
    coverImageUrl: string;
    garmentImageUrl: string;
    publishTitle: string;
    reverseScriptId: string | null;
  };
  characters: Array<{
    id: string;
    libraryCharacterId: string;
    name: string;
    thumbnailUrl: string | null;
    isSelected: boolean;
    sourceType: 'generated' | 'library';
    role: 'main' | 'secondary';
    fiveViewUrls: string[];
  }>;
  tasks: Array<{
    id: string;
    job_type: string;
    status: string;
    error: string | null;
    created_at: number;
    updated_at: number;
  }>;
  resourceConsumption: {
    llmCalls: number;
    imageGenerations: number;
    videoGenerations: number;
    creditConsumption: number;
  };
  step1Data: {
    garments: Array<{
      id: string;
      garmentAssetId: string | null;
      name: string | null;
      category: string | null;
      imageUrl: string;
      subImageUrls: string[];
      flatLayImageUrl: string | null;
    }>;
    outfitPlans: Array<{
      id: string;
      title: string;
      reason: string;
      assetIds: string[];
      selected: boolean;
    }>;
  };
  step2Data: {
    rolePreset: {
      title: string;
      imageUrl: string;
      gender: string | null;
      age: number | null;
      styleWords: string[] | null;
      ethnicityOrRegion: string | null;
    } | null;
    characterViews: Array<{
      image_url: string;
    }>;
  };
  step3Data: {
    script: {
      id: string;
      title: string;
      summary: string;
      durationSeconds: number;
      primaryEmotion: string;
      theme: string;
      videoStyle: string;
      isConfirmed: boolean;
      isSelected: boolean;
      strategyType: string;
      source: string | null;
      sourceType: string | null;
      sourceOssUrl: string | null;
      content: string | null;
      createdAt: number;
    } | null;
    scriptHistory: Array<{
      id: string;
      title: string;
      summary: string;
      durationSeconds: number;
      primaryEmotion: string;
      theme: string;
      videoStyle: string;
      isConfirmed: boolean;
      isSelected: boolean;
      strategyType: string;
      source: string | null;
      sourceType: string | null;
      sourceOssUrl: string | null;
      createdAt: number;
    }>;
    storyboards: Array<{
      id: string;
      frameIndex: number;
      selectedImageUrl: string;
      referenceImageUrls: string[];
      batches: unknown;
      prompt: string | null;
      imagePrompt: string | null;
      status: string;
    }>;
    shotBreakdowns: Array<{
      id: string;
      shotIndex: number;
      shotType: string;
      shotDescription: string;
      durationSeconds: number;
      visualJson: unknown;
      subjectsJson: unknown;
      textElementsJson: unknown;
    }>;
    modelPhotos: Array<{
      id: string;
      imageUrl: string;
      poseLabel: string;
      bgLabel: string;
      isSelected: boolean;
      status: string;
      errorMessage: string | null;
      sortOrder: number;
    }>;
  };
  step4Data: {
    clipVideos: Array<{
      id: string;
      sceneIndex: number;
      clipUrl: string;
      variantUrls: string[];
      clipStatus: string;
      errorMessage: string | null;
      selectedIndex: number;
      clipGeneration: number;
      clipPrompt: string | null;
      createdAt: number;
    }>;
    finalVideo: {
      id: string;
      videoUrl: string;
      durationSec: number;
      coverImageUrl: string;
      backgroundMusicUrl: string;
      createdAt: number;
    } | null;
    finalVideoHistory: Array<{
      id: string;
      videoUrl: string;
      durationSec: number;
      coverImageUrl: string;
      createdAt: number;
    }>;
    pageSections: Array<{
      id: string;
      sectionKey: string;
      sectionType: string;
      title: string;
      goal: string | null;
      copy: string | null;
      status: string;
      imageUrl: string;
      sortOrder: number;
    }>;
  };
  step5Data: {
    publishRecords: Array<{
      id: string;
      publishTitle: string;
      publishUrl: string;
      createdAt: number;
      reviewStatus: string;
    }>;
    finalVideos: Array<{
      id: string;
      videoUrl: string;
      durationSec: number;
      coverImageUrl: string;
      videoType: string;
      createdAt: number;
    }>;
  };
  step6Data: {
    fissionStatus: {
      id: string;
      status: string;
      createdAt: number;
    } | null;
    taskItems: Array<{
      id: string;
      taskType: string;
      itemIndex: number;
      imageUrl: string;
      imageStatus: string;
      videoUrl: string;
      videoStatus: string;
      imageErrorMessage: string;
      videoErrorMessage: string;
    }>;
    fissionVideos: Array<{
      id: string;
      fissionType: string;
      videoPath: string;
      thumbnailUrl: string;
      status: string;
      createdAt: number;
    }>;
  };
}

// ==================== 积分相关 ====================

export interface AdminCreditAuditItem {
  id: string;
  userId: string;
  userEmail: string;
  actorEmail: string;
  activity: string;
  success: boolean;
  chargeAmount: number;
  delta: number;
  createdAt: number;
  label: string;
  projectId: string | null;
}

// ==================== API 接口定义 ====================

export interface RealAdminApi {
  // 配置管理
  adminConfigGet(token: string): Promise<AdminConfig>;
  adminConfigPatch(token: string, payload: AdminConfigPatch): Promise<AdminConfig>;
  adminRouteKeyCreditCostsGet(token: string): Promise<RouteKeyCreditCostsResponse>;
  adminRouteKeyCreditCostUpdate(token: string, key: string, cost: number): Promise<{ success: boolean; data: { key: string; cost: number } }>;
  adminRouteKeyCreditCostDelete(token: string, key: string): Promise<{ success: boolean; message: string }>;
  adminCharacterWorkflowSystemSettingsGet(token: string): Promise<CharacterWorkflowSystemSettings>;

  // 用户管理
  adminUsers(token: string): Promise<{ users: AdminUser[] }>;
  adminCreateUser(token: string, payload: AdminCreateUserPayload): Promise<AdminUser>;
  adminUpdateUser(token: string, userId: string, payload: AdminUpdateUserPayload): Promise<AdminUser>;
  adminDeleteUser(token: string, userId: string): Promise<{ ok: boolean }>;
  adminImportUsers(token: string, payload: AdminImportUsersPayload): Promise<AdminImportUsersResult>;
  adminExportUsers(token: string): Promise<{ users: Array<{ id: string; email: string; role: "admin" | "user"; createdAt: number }> }>;
  adminSetUserLock(token: string, userId: string, locked: boolean): Promise<{ ok: boolean }>;
  adminAdjustUserCredits(token: string, userId: string, payload: { delta: number; reason?: string }): Promise<{ balance: number }>;
  adminCreditAudits(token: string, limit?: number, offset?: number, filters?: { userEmail?: string; projectId?: string; activity?: string }): Promise<{ items: AdminCreditAuditItem[]; total: number }>;

  // 脚本管理
  adminScripts(token: string, params?: { page?: number; pageSize?: number }): Promise<{ scripts: AdminScript[]; pagination: { page: number; pageSize: number; total: number } }>;
  adminCreateScript(token: string, payload: { title: string; content: string; tags?: string[]; ownerEmail?: string }): Promise<AdminScriptWithVersion>;
  adminUpdateScript(token: string, scriptId: string, payload: Partial<{ title: string; content: string; tags: string[] }>): Promise<AdminScriptWithVersion>;
  adminDeleteScript(token: string, scriptId: string): Promise<{ ok: boolean }>;
  adminImportScripts(token: string, payload: { items: Array<{ projectId: string; basicInfo: string; roleTable?: string; outfitTable?: string; storyboard?: string }> }): Promise<{ created: Array<{ id: string; projectId: string }>; failed: Array<{ projectId: string; reason: string }>; total: number }>;
  adminExportScripts(token: string): Promise<{ scripts: Array<{ id: string; projectId: string; version: number; payload: { basicInfo: string }; createdAt: number }> }>;

  // 热点脚本
  adminHotTrendScripts(token: string, options?: { trendType?: "realtime" | "video"; page?: number; pageSize?: number }): Promise<AdminHotTrendScriptsResponse>;
  adminSyncHotTrendScripts(token: string, payload?: { force?: boolean; type?: "realtime" | "video" | "all" }): Promise<{ synced: Array<{ type: "realtime" | "video"; syncedAt: number; nextSyncAt: number; topicCount: number; updatedAt: string | null }> }>;
  adminUpsertHotTrendScript(token: string, payload: { title: string; content: string; tags?: string[]; ownerEmail?: string; trendType?: "realtime" | "video"; reason?: string }): Promise<AdminHotTrendScript & { deduped: boolean }>;
  adminUpdateHotTrendScript(token: string, scriptId: string, payload: Partial<{ title: string; content: string; tags: string[]; trendType: "realtime" | "video"; reason: string }>): Promise<AdminHotTrendScript & { deduped: boolean }>;
  adminDeleteHotTrendScript(token: string, scriptId: string): Promise<{ ok: boolean }>;
  adminHotTrendSyncLogs(token: string, params?: { page?: number; limit?: number; triggerType?: "scheduled" | "manual"; trendType?: "realtime" | "video"; status?: "running" | "success" | "failed" }): Promise<{ items: AdminHotTrendSyncLog[]; total: number; page: number; limit: number }>;
  adminHotTrendDailyReports(token: string, params?: { page?: number; limit?: number }): Promise<{ items: AdminHotTrendDailyReport[]; total: number; page: number; limit: number }>;
  adminHotTrendDailyReportDetail(token: string, reportDate: string): Promise<Record<string, unknown>>;

  // Provider 管理
  adminProviders(token: string): Promise<{ providers: AdminProvider[]; typeModels: Record<string, { value: string; label: string }[]> }>;
  adminCreateProvider(token: string, payload: { name: string; type: string; vendor: string; baseUrl: string; model: string; callMode?: ProviderCallMode; accessKey?: string | null; remark?: string | null; enabled?: boolean; secret?: string; options?: { geminiGroundingEnabled?: boolean; geminiFallbackModels?: string[] } }): Promise<{ id: string; name: string; maskedSecret?: string }>;
  adminUpdateProvider(token: string, providerId: string, payload: Partial<{ name: string; vendor: string; baseUrl: string; model: string; callMode: ProviderCallMode; accessKey: string | null; remark: string | null; enabled: boolean; secret: string; options: { geminiGroundingEnabled?: boolean; geminiFallbackModels?: string[] } }>): Promise<{ id: string; name: string; maskedSecret?: string }>;
  adminDeleteProvider(token: string, providerId: string): Promise<{ ok: boolean }>;
  adminUpdateProviderSecret(token: string, providerId: string, secret: string): Promise<{ ok: boolean }>;
  adminTestProviderConnectivity(token: string, providerId: string, payload?: { routeKey?: ProviderRouteKey; transportMode?: "auto" | "gemini" | "openai" }): Promise<{ ok: boolean; providerId: string; routeKey: ProviderRouteKey; transportMode: string; sample: string }>;

  // Provider Policy 管理
  adminProviderPolicies(token: string): Promise<{ policies: AdminProviderPolicy[] }>;
  adminCreateProviderPolicy(token: string, payload: { routeKey: string; type: string; primaryProviderId: string; fallbackProviderIds?: string[]; timeoutMs?: number; retryCount?: number; enabled?: boolean; description?: string }): Promise<{ id: string }>;
  adminUpdateProviderPolicy(token: string, policyId: string, payload: Partial<{ routeKey: string; type: string; primaryProviderId: string; fallbackProviderIds: string[]; timeoutMs: number; retryCount: number; enabled: boolean; description: string; sortOrder: number }>): Promise<{ id: string }>;
  adminDeleteProviderPolicy(token: string, policyId: string): Promise<{ ok: boolean }>;
  adminTestProviderPolicy(token: string, policyId: string, payload?: { userInput?: string; videoUrl?: string }): Promise<{ ok: boolean; policyId: string; type: string; sample: string; latencyMs: number }>;
  adminProviderAudits(token: string, limit?: number): Promise<{ audits: AdminProviderAudit[] }>;
  adminProviderAuditDetail(token: string, id: string): Promise<{ audit: AdminProviderAudit }>;
  adminClearProviderAudits(token: string): Promise<{ ok: boolean }>;
  adminClearTasks(token: string): Promise<{ ok: boolean; stoppedCount: number; deletedCount: number }>;

  // 功能路由配置
  adminFunctionalRoutes(token: string): Promise<{ routes: AdminFunctionalRoute[] }>;
  adminSetFunctionalRoute(token: string, type: string, payload: { providerId: string; fallbackProviderIds?: string[]; enabled?: boolean }): Promise<{ id: string; type: string; providerId: string; fallbackProviderIds: string[]; enabled: boolean; createdAt: number; updatedAt: number }>;
  adminBatchSetFunctionalRoutes(token: string, payload: { routes: Array<{ type: string; providerId: string; fallbackProviderIds?: string[]; enabled?: boolean }> }): Promise<{ routes: Array<{ id: string; type: string; providerId: string; fallbackProviderIds: string[]; enabled: boolean; createdAt: number; updatedAt: number }> }>;
  adminDeleteFunctionalRoute(token: string, type: string): Promise<{ ok: boolean }>;

  // 能力实验室
  adminCapabilityLabText(token: string, payload: { prompt: string; provider?: string }): Promise<{ result: string }>;
  adminCapabilityLabImageInsight(token: string, payload: { imageUrl: string; prompt?: string }): Promise<{ insight: string }>;
  adminCapabilityLabImageGenerate(token: string, payload: { prompt: string; provider?: string }): Promise<{ imageUrl: string }>;
  adminCapabilityLabVideoGenerate(token: string, payload: { prompt: string }): Promise<{ videoUrl: string }>;
  adminCapabilityLabReverseFetch(token: string, payload: { url: string }): Promise<{ videoUrl: string | null; transcript: string | null; error: string | null }>;
  adminCapabilityLabVideoReverse(token: string, payload: { videoUrl: string }): Promise<{ script: string | null; storyboard: unknown | null; error: string | null }>;
  adminCapabilityLabVideoReverseUpload(token: string, payload: { file: File }): Promise<{ script: string | null; storyboard: unknown | null; error: string | null }>;

  // 审核管理
  adminReviews(token: string): Promise<{ reviews: Array<{ id: string; resourceId: string; squareCategory: "男装" | "女装" | "男童装" | "女童装" | null; status: "pending" | "approved" | "rejected" | "needs_changes"; published: boolean; authorEmail: string }> }>;
  adminReviewAction(token: string, reviewId: string, status: "approved" | "rejected"): Promise<{ ok: boolean }>;
  adminConfirmPublish(token: string, reviewId: string): Promise<{ ok: boolean }>;

  // 热点资源管理
  adminDeleteHotTrendAssets(token: string, scriptIds: string[]): Promise<{ ok: boolean }>;
  adminReverseHotTrendAssetToSmartStoryboard(token: string, scriptId: string): Promise<{ ok: boolean }>;
  adminPruneUnlinkedVideoHotTrendAssets(token: string, payload?: { rebuildLinked?: boolean }): Promise<{ deleted: number }>;
  adminRelabelHotTrendAssets(token: string, payload: { scriptIds: string[] }): Promise<{ updated: number }>;
  adminUpdateSmartStoryboard(token: string, itemId: string, payload: { tags?: string[]; notes?: string }): Promise<{ ok: boolean }>;
  adminDeleteSmartStoryboards(token: string, itemIds: string[]): Promise<{ ok: boolean }>;

  // UI 设置
  reverseUiSettingsGet(token: string): Promise<{ copyModuleHidden: boolean; pasteEnabled: boolean }>;

  // 日志管理
  errorLogsList(token: string, filters: { page?: number; pageSize?: number; startDate?: number; endDate?: number; keyword?: string; severity?: string; errorCode?: string }): Promise<{ items: AdminErrorLog[]; page: number; pageSize: number }>;
  errorLogDetail(token: string, id: string): Promise<AdminErrorLog>;
  errorLogsStatsByCode(token: string, startDate: number, endDate: number, severity?: string): Promise<Array<{ errorCode: string; count: number }>>;
  errorLogsStatsByDate(token: string, startDate: number, endDate: number, severity?: string): Promise<Array<{ date: string; count: number }>>;
  callAuditsList(token: string, filters: { page?: number; pageSize?: number; startDate?: number; endDate?: number; provider?: string; projectId?: string }): Promise<{ items: AdminCallAudit[]; total: number; page: number; pageSize: number }>;
  callAuditsStats(token: string, startDate?: number, endDate?: number, projectId?: string): Promise<{ total: number; successCount: number; successRate: number; avgLatency: number; totalCost: number }>;
  callAuditDetail(token: string, id: string): Promise<Record<string, unknown>>;
  auditLogsList(token: string, filters: { page?: number; pageSize?: number; startDate?: number; endDate?: number; userId?: string; keyword?: string }): Promise<{ items: AdminAuditLog[]; total: number; page: number; pageSize: number }>;
  auditLogDetail(token: string, id: string): Promise<Record<string, unknown>>;
  logsExport(token: string, payload: { type: "error" | "llm" | "audit"; filters: { startDate?: number; endDate?: number; keyword?: string; severity?: string; errorCode?: string; provider?: string; userId?: string }; format: "csv" | "json" }): Promise<void>;

  // 脚本管理（新版）
  adminGetScripts(token: string, params: { page?: number; pageSize?: number; strategy?: string; hasScore?: boolean; search?: string }): Promise<{ items: AdminScriptItem[]; total: number; scoresMap: Record<string, AdminScriptScore> }>;
  adminGetScriptQualityScore(token: string, scriptId: string): Promise<AdminScriptScore | null>;
  adminGetScriptStats(token: string): Promise<{ strategyStats: Array<{ strategy: string; avgScore: number; count: number }>; overallStats: { totalScripts: number; passedScripts: number; avgScore: number } }>;

  // 任务管理
  adminGetSchedulerConfig(token: string): Promise<{ scoringDaemonEnabled: boolean; evolutionEnabled: boolean }>;
  adminUpdateSchedulerConfig(token: string, config: { scoringDaemonEnabled?: boolean; evolutionEnabled?: boolean }): Promise<{ scoringDaemonEnabled: boolean; evolutionEnabled: boolean }>;
  adminGetSystemJobs(token: string, params?: { jobType?: string; status?: string; page?: number; pageSize?: number }): Promise<{ items: AdminSystemJob[]; total: number; stats: Record<string, number> }>;
  adminGetUserJobs(token: string, params?: { jobType?: string; status?: string; page?: number; pageSize?: number }): Promise<{ items: AdminUserJob[]; total: number; stats: Record<string, number> }>;

  // 项目管理
  listAdminProjects(token: string, params?: { projectKind?: "video" | "image" | "reverse" | "outfit_change"; status?: string; companyName?: string; anomalyType?: "stuck" | "failed_task" | "slow_step"; userId?: string; garmentCategory?: "top" | "bottom" | "shoes" | "accessory" | "suit" | "dress" | "outer"; timeRange?: "today" | "7days" | "30days"; search?: string; page?: number; pageSize?: number }): Promise<{ projects: AdminProjectListItem[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }>;
  getAdminProjectDetail(token: string, projectId: string): Promise<AdminProjectDetail>;
  getAdminProjectScriptsRaw(token: string, projectId: string): Promise<{ scripts: Array<{ scriptId: string; title: string; isSelected: boolean; isConfirmed: boolean; strategyType: string; createdAt: number; payload: Record<string, unknown>; shotPrompts: Record<string, unknown> | null }> }>;
  // 源脚本返回与普通脚本相同格式
  getAdminReverseScript(token: string, scriptId: string): Promise<{ scriptId: string; title: string; isSelected: boolean; isConfirmed: boolean; strategyType: string; createdAt: number; payload: Record<string, unknown>; shotPrompts: Record<string, unknown> | null; sourceType?: string; sourceOssUrl?: string | null }>;
  listAdminCompanies(token: string): Promise<{ companies: string[] }>;
  getAdminAnomalies(token: string): Promise<{ failed: number; stuck: number; slowStep: number }>;
  performAdminOperation(token: string, projectId: string, payload: { operationType: "unlock_script" | "unlock_character" | "unlock_outfit" | "reset_step" | "retry_task" | "force_complete" | "delete_project"; reason: string; targetStep?: number; taskId?: string; preview?: boolean }): Promise<{ success: boolean; message: string }>;
  exportAdminProjects(token: string, filters?: { projectKind?: "video" | "image" | "reverse" | "outfit_change"; status?: string; companyName?: string; anomalyType?: "stuck" | "failed_task" | "slow_step"; userId?: string; garmentCategory?: "top" | "bottom" | "shoes" | "accessory" | "suit" | "dress" | "outer"; timeRange?: "today" | "7days" | "30days"; search?: string }): Promise<void>;

  // 项目迁移
  migrateProjectPreview(token: string, projectId: string): Promise<import("../../backendApi.types").MigratePreviewResponse>;
  migrateProjectExecute(token: string, projectId: string): Promise<import("../../backendApi.types").MigrateExecuteResponse>;
}
