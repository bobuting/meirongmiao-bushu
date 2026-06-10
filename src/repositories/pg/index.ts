/**
 * PostgreSQL 仓库工厂
 */

import type { Pool, PoolClient } from "pg";
import { getLogger } from "../../core/logger/index.js";

const logger = getLogger("repository");
import { PgUserRepository, PgSessionRepository } from "./user-pg-repository.js";
import { PgProjectRepository } from "./project-pg-repository.js";
import { PgProviderRepository, PgProviderSecretRepository, PgProviderPolicyRepository } from "./provider-pg-repository.js";
import { PgCreditRepository } from "./credit-pg-repository.js";
import { PgCreditFreezeRepository } from "./credit-freeze-pg-repository.js";
import { PgCreditPricingRepository } from "./credit-pricing-pg-repository.js";
import { PgScriptVersionRepository } from "./script-storyboard-pg-repository.js";
import { PgReverseTaskRepository, PgReverseAttemptRepository, PgReverseTraceRepository, PgSourceCredentialRepository } from "./reverse-pg-repository.js";
import { PgTrendEntryRepository, PgTrendSyncJobRepository } from "./trend-pg-repository.js";
import {
  PgLibraryCharacterRepository,
  PgLibraryScriptRepository,
  PgLibraryScriptVersionRepository,
  PgReverseStoryboardLibraryRepository,
  PgReverseStoryboardLibraryVersionRepository,
  PgSmartStoryboardLibraryRepository,
  PgSmartStoryboardLibraryVersionRepository,
} from "./library-pg-repository.js";
import { PgThemeRepository, PgUserThemePreferenceRepository } from "./theme-pg-repository.js";
import { PgReviewRequestRepository, PgPublicResourceRepository } from "./review-pg-repository.js";
import { PgConfigRepository, PgDeadLetterRepository, PgVideoMusicRepository } from "./system-pg-repository.js";
import { PgAssetRepository, PgOutfitPlanRepository, PgProjectOutfitPlanAssocRepository } from "./asset-pg-repository.js";
import { PgCharacterFiveViewRepository } from "./character-five-view-pg-repository.js";
import { PgFunctionalRouteRepository } from "./functional-route-pg-repository.js";
import { PgShotBreakdownRepository } from "./shot-breakdown-pg-repository.js";
import { PgScriptDataRepository } from "./script-data-pg-repository.js";
import { PgSoftDeletableRepository } from "./soft-deletable-repository.js";
import { PgUserSquarePreferenceRepository } from "./user-square-preference-pg-repository.js";
import { PgSquareBehaviorLogRepository } from "./square-behavior-log-pg-repository.js";
import { PgGarmentAssetRepository } from "./garment-asset-pg-repository.js";
import { PgSquareUserWorkRepository } from "./square-user-work-pg-repository.js";
import { PgSquarePublishRequestRepository } from "./square-publish-request-pg-repository.js";
import { PgErrorLogRepository } from "./error-log-pg-repository.js";
import { PgUserScriptAssocRepository } from "./user-script-assoc-pg-repository.js";
import { PgAnnouncementRepository } from "./announcement-pg-repository.js";
import { PgStep4VideoSceneRepository } from "./step4-video-scene-pg-repository.js";
import { PgStep4PromptRefinementRepository } from "./step4-prompt-refinement-pg-repository.js";
import { PgModelPhotoRepository } from "./model-photo-pg-repository.js";
import { PgImageProjectExtRepository } from "./image-project-ext-pg-repository.js";
import { PgLongImageGenerationRepository } from "./long-image-generation-pg-repository.js";
import { PgPageSectionRepository } from "./page-section-pg-repository.js";
import { PgSectionVersionRepository } from "./section-version-pg-repository.js";
import { PgFileRegistryRepository } from "./file-registry-pg-repository.js";
import { PgProjectCharacterRepository } from "./project-character-pg-repository.js";
import { PgProjectGarmentAssocRepository } from "./project-garment-assoc-pg-repository.js";
import { PgProjectVideoMusicRepository } from "./project-video-music-pg-repository.js";
import { PgBusinessConfigRepository } from "./business-config-pg-repository.js";
import { PgRoleDirectionCardsRepository } from "./role-direction-cards-pg-repository.js";
import { PgOutfitChangeProjectRepository } from "./outfit-change-project-pg-repository.js";
import { PgSegmentVideoRepository } from "./segment-video-pg-repository.js";
import { PgVideoProjectBusinessDataRepository } from "./video-project-business-data-pg-repository.js";
import { PgAsyncJobRepository } from "./async-job-pg-repository.js";
import { PgFinalVideoRepository } from "./final-video-pg-repository.js";
import { PgFissionVideoStatusRepository } from "./fission-video-status-pg-repository.js";
import { PgFissionTaskItemRepository } from "./fission-task-item-pg-repository.js";
import { PgFissionVideoRepository } from "./fission-video-pg-repository.js";
import { PgFissionStoryboardRepository } from "./fission-storyboard-pg-repository.js";
import { PgFissionVideosMirrorRepository } from "./fission-videos-mirror-pg-repository.js";
import { PgAdminOperationLogRepository } from "./admin-operation-log-pg-repository.js";
import { PgProviderCallAuditRepository } from "./provider-call-audit-pg-repository.js";
import { PgPromptCallLogRepository } from "./prompt-call-log-pg-repository.js";
import { PgSystemJobRepository } from "./system-job-pg-repository.js";
import { PgStep3FrameImageRepository } from "./step3-frame-image-pg-repository.js";
import { PgMirrorVideoRepository } from "./mirror-video-pg-repository.js";
import { PgAuditLogRepository } from "./audit-log-pg-repository.js";
import { PgSquareTemplateRepository } from "./square-template-pg-repository.js";
import { PgHotTrendAssetRepository } from "./hot-trend-asset-pg-repository.js";
import { PgHotTrendDailyReportRepository } from "./hot-trend-daily-report-pg-repository.js";
import { PgHotTrendSyncLogRepository } from "./hot-trend-sync-log-pg-repository.js";
import { PgHotTrendEffectTrackingRepository } from "./hot-trend-effect-tracking-pg-repository.js";
import { PgPromptEvolutionProposalRepository } from "./prompt-evolution-pg-repository.js";
import { PgEmotionArchetypeLibraryRepository, PgEmotionArchetypeRunLogRepository } from "./emotion-archetype-pg-repository.js";
import { PgScriptQualityScoreRepository } from "./script-quality-score-pg-repository.js";
import { PgPromptVersionMetricsRepository } from "./prompt-version-metrics-pg-repository.js";
import { PgSquareCreatorTargetRepository } from "./square-creator-target-pg-repository.js";
import { PgSquareDiscoveredVideoRepository } from "./square-discovered-video-pg-repository.js";
import { PgSquareExecutionLogRepository } from "./square-execution-log-pg-repository.js";
import { PgExtTokenRepository } from "./ext-token-pg-repository.js";
import { PgSceneLibraryUpdateLogRepository } from "./scene-library-update-log-pg-repository.js";
import { PgSceneLibraryRepository } from "./scene-library-pg-repository.js";
import { PgAestheticUpdateLogRepository } from "./aesthetic-update-log-pg-repository.js";
import { PgAestheticLibraryRepository } from "./aesthetic-library-pg-repository.js";
import { PgExtDouyinPublishJobRepository } from "./ext-douyin-publish-job-pg-repository.js";
import { PgStepPromptRepository } from "./step-prompt-pg-repository.js";
import { PgVideoScriptAssocRepository } from "./video-script-assoc-pg-repository.js";
export type { RoleDirectionCardsRecord } from "./role-direction-cards-pg-repository.js";
export type { Step4VideoSceneRecord } from "./step4-video-scene-pg-repository.js";
export type { Step4PromptRefinementRecord, CreatePromptRefinementInput } from "./step4-prompt-refinement-pg-repository.js";
export { PgSoftDeletableRepository } from "./soft-deletable-repository.js";
export type { SoftDeleteQueryOptions } from "./soft-deletable-repository.js";

/** PG 仓库集合 */
export interface PgRepositoryCollection {
  users: PgUserRepository;
  sessions: PgSessionRepository;
  projects: PgProjectRepository;
  providers: PgProviderRepository;
  providerSecrets: PgProviderSecretRepository;
  providerPolicies: PgProviderPolicyRepository;
  credits: PgCreditRepository;
  creditFreezes: PgCreditFreezeRepository;
  creditPricing: PgCreditPricingRepository;
  scripts: PgScriptVersionRepository;
  reverseTasks: PgReverseTaskRepository;
  reverseAttempts: PgReverseAttemptRepository;
  reverseTraces: PgReverseTraceRepository;
  sourceCredentials: PgSourceCredentialRepository;
  trendEntries: PgTrendEntryRepository;
  trendSyncJobs: PgTrendSyncJobRepository;
  libraryCharacters: PgLibraryCharacterRepository;
  libraryScripts: PgLibraryScriptRepository;
  libraryScriptVersions: PgLibraryScriptVersionRepository;
  reverseStoryboardLibrary: PgReverseStoryboardLibraryRepository;
  reverseStoryboardLibraryVersions: PgReverseStoryboardLibraryVersionRepository;
  smartStoryboardLibrary: PgSmartStoryboardLibraryRepository;
  smartStoryboardLibraryVersions: PgSmartStoryboardLibraryVersionRepository;
  themes: PgThemeRepository;
  userThemePreferences: PgUserThemePreferenceRepository;
  reviewRequests: PgReviewRequestRepository;
  publicResources: PgPublicResourceRepository;
  config: PgConfigRepository;
  deadLetters: PgDeadLetterRepository;
  videoMusics: PgVideoMusicRepository;
  assets: PgAssetRepository;
  outfitPlans: PgOutfitPlanRepository;
  projectOutfitPlanAssocs: PgProjectOutfitPlanAssocRepository;
  characterFiveViews: PgCharacterFiveViewRepository;
  functionalRoutes: PgFunctionalRouteRepository;
  shotBreakdowns: PgShotBreakdownRepository;
  scriptData: PgScriptDataRepository;
  userSquarePreferences: PgUserSquarePreferenceRepository;
  squareBehaviorLogs: PgSquareBehaviorLogRepository;
  garmentAssets: PgGarmentAssetRepository;
  squareUserWorks: PgSquareUserWorkRepository;
  squarePublishRequests: PgSquarePublishRequestRepository;
  errorLogs: PgErrorLogRepository;
  userScriptAssocs: PgUserScriptAssocRepository;
  announcements: PgAnnouncementRepository;
  step4VideoScenes: PgStep4VideoSceneRepository;
  step4PromptRefinements: PgStep4PromptRefinementRepository;
  modelPhotos: PgModelPhotoRepository;
  imageProjectExt: PgImageProjectExtRepository;
  longImageGeneration: PgLongImageGenerationRepository;
  pageSections: PgPageSectionRepository;
  sectionVersions: PgSectionVersionRepository;
  fileRegistry: PgFileRegistryRepository;
  projectCharacters: PgProjectCharacterRepository;
  projectGarmentAssocs: PgProjectGarmentAssocRepository;
  projectVideoMusics: PgProjectVideoMusicRepository;
  businessConfigs: PgBusinessConfigRepository;
  roleDirectionCards: PgRoleDirectionCardsRepository;
  outfitChangeProjects: PgOutfitChangeProjectRepository;
  segmentVideos: PgSegmentVideoRepository;
  videoProjectBusinessData: PgVideoProjectBusinessDataRepository;
  asyncJobs: PgAsyncJobRepository;
  finalVideos: PgFinalVideoRepository;
  fissionVideoStatus: PgFissionVideoStatusRepository;
  fissionTaskItems: PgFissionTaskItemRepository;
  fissionVideos: PgFissionVideoRepository;
  fissionStoryboards: PgFissionStoryboardRepository;
  fissionVideosMirror: PgFissionVideosMirrorRepository;
  adminOperationLogs: PgAdminOperationLogRepository;
  providerCallAudits: PgProviderCallAuditRepository;
  promptCallLogs: PgPromptCallLogRepository;
  systemJobs: PgSystemJobRepository;
  step3FrameImages: PgStep3FrameImageRepository;
  mirrorVideos: PgMirrorVideoRepository;
  auditLogs: PgAuditLogRepository;
  squareTemplates: PgSquareTemplateRepository;
  hotTrendAssets: PgHotTrendAssetRepository;
  hotTrendDailyReports: PgHotTrendDailyReportRepository;
  hotTrendSyncLogs: PgHotTrendSyncLogRepository;
  hotTrendEffectTracking: PgHotTrendEffectTrackingRepository;
  promptEvolutionProposals: PgPromptEvolutionProposalRepository;
  emotionArchetypes: PgEmotionArchetypeLibraryRepository;
  emotionArchetypeRunLogs: PgEmotionArchetypeRunLogRepository;
  scriptQualityScores: PgScriptQualityScoreRepository;
  promptVersionMetrics: PgPromptVersionMetricsRepository;
  squareCreatorTargets: PgSquareCreatorTargetRepository;
  squareDiscoveredVideos: PgSquareDiscoveredVideoRepository;
  squareExecutionLogs: PgSquareExecutionLogRepository;
  extTokens: PgExtTokenRepository;
  sceneLibraryUpdateLogs: PgSceneLibraryUpdateLogRepository;
  sceneLibrary: PgSceneLibraryRepository;
  aestheticUpdateLogs: PgAestheticUpdateLogRepository;
  aestheticLibrary: PgAestheticLibraryRepository;
  extDouyinPublishJobs: PgExtDouyinPublishJobRepository;
  stepPrompts: PgStepPromptRepository;
  videoScriptAssocs: PgVideoScriptAssocRepository;
  withTransaction: <T>(fn: (txRepos: PgRepositoryCollection) => Promise<T>) => Promise<T>;
}

/** 创建 PG 仓库集合 */
export function createPgRepositories(pool: Pool): PgRepositoryCollection {
  const repos = {
    users: new PgUserRepository(pool),
    sessions: new PgSessionRepository(pool),
    projects: new PgProjectRepository(pool),
    providers: new PgProviderRepository(pool),
    providerSecrets: new PgProviderSecretRepository(pool),
    providerPolicies: new PgProviderPolicyRepository(pool),
    credits: new PgCreditRepository(pool),
    creditFreezes: new PgCreditFreezeRepository(pool),
    creditPricing: new PgCreditPricingRepository(pool),
    scripts: new PgScriptVersionRepository(pool),
    reverseTasks: new PgReverseTaskRepository(pool),
    reverseAttempts: new PgReverseAttemptRepository(pool),
    reverseTraces: new PgReverseTraceRepository(pool),
    sourceCredentials: new PgSourceCredentialRepository(pool),
    trendEntries: new PgTrendEntryRepository(pool),
    trendSyncJobs: new PgTrendSyncJobRepository(pool),
    libraryCharacters: new PgLibraryCharacterRepository(pool),
    libraryScripts: new PgLibraryScriptRepository(pool),
    libraryScriptVersions: new PgLibraryScriptVersionRepository(pool),
    reverseStoryboardLibrary: new PgReverseStoryboardLibraryRepository(pool),
    reverseStoryboardLibraryVersions: new PgReverseStoryboardLibraryVersionRepository(pool),
    smartStoryboardLibrary: new PgSmartStoryboardLibraryRepository(pool),
    smartStoryboardLibraryVersions: new PgSmartStoryboardLibraryVersionRepository(pool),
    themes: new PgThemeRepository(pool),
    userThemePreferences: new PgUserThemePreferenceRepository(pool),
    reviewRequests: new PgReviewRequestRepository(pool),
    publicResources: new PgPublicResourceRepository(pool),
    config: new PgConfigRepository(pool),
    deadLetters: new PgDeadLetterRepository(pool),
    videoMusics: new PgVideoMusicRepository(pool),
    assets: new PgAssetRepository(pool),
    outfitPlans: new PgOutfitPlanRepository(pool),
    projectOutfitPlanAssocs: new PgProjectOutfitPlanAssocRepository(pool),
    characterFiveViews: new PgCharacterFiveViewRepository(pool),
    functionalRoutes: new PgFunctionalRouteRepository(pool),
    shotBreakdowns: new PgShotBreakdownRepository(pool),
    scriptData: new PgScriptDataRepository(pool),
    userSquarePreferences: new PgUserSquarePreferenceRepository(pool),
    squareBehaviorLogs: new PgSquareBehaviorLogRepository(pool),
    garmentAssets: new PgGarmentAssetRepository(pool),
    squareUserWorks: new PgSquareUserWorkRepository(pool),
    squarePublishRequests: new PgSquarePublishRequestRepository(pool),
    errorLogs: new PgErrorLogRepository(pool),
    userScriptAssocs: new PgUserScriptAssocRepository(pool),
    announcements: new PgAnnouncementRepository(pool),
    step4VideoScenes: new PgStep4VideoSceneRepository(pool),
    step4PromptRefinements: new PgStep4PromptRefinementRepository(pool),
    modelPhotos: new PgModelPhotoRepository(pool),
    imageProjectExt: new PgImageProjectExtRepository(pool),
    longImageGeneration: new PgLongImageGenerationRepository(pool),
    pageSections: new PgPageSectionRepository(pool),
    sectionVersions: new PgSectionVersionRepository(pool),
    fileRegistry: new PgFileRegistryRepository(pool),
    projectCharacters: new PgProjectCharacterRepository(pool),
    projectGarmentAssocs: new PgProjectGarmentAssocRepository(pool),
    projectVideoMusics: new PgProjectVideoMusicRepository(pool),
    businessConfigs: new PgBusinessConfigRepository(pool),
    roleDirectionCards: new PgRoleDirectionCardsRepository(pool),
    outfitChangeProjects: new PgOutfitChangeProjectRepository(pool),
    segmentVideos: new PgSegmentVideoRepository(pool),
    videoProjectBusinessData: new PgVideoProjectBusinessDataRepository(pool),
    asyncJobs: new PgAsyncJobRepository(pool),
    finalVideos: new PgFinalVideoRepository(pool),
    fissionVideoStatus: new PgFissionVideoStatusRepository(pool),
    fissionTaskItems: new PgFissionTaskItemRepository(pool),
    fissionVideos: new PgFissionVideoRepository(pool),
    fissionStoryboards: new PgFissionStoryboardRepository(pool),
    fissionVideosMirror: new PgFissionVideosMirrorRepository(pool),
    adminOperationLogs: new PgAdminOperationLogRepository(pool),
    providerCallAudits: new PgProviderCallAuditRepository(pool),
    promptCallLogs: new PgPromptCallLogRepository(pool),
    systemJobs: new PgSystemJobRepository(pool),
    step3FrameImages: new PgStep3FrameImageRepository(pool),
    mirrorVideos: new PgMirrorVideoRepository(pool),
    auditLogs: new PgAuditLogRepository(pool),
    squareTemplates: new PgSquareTemplateRepository(pool),
    hotTrendAssets: new PgHotTrendAssetRepository(pool),
    hotTrendDailyReports: new PgHotTrendDailyReportRepository(pool),
    hotTrendSyncLogs: new PgHotTrendSyncLogRepository(pool),
    hotTrendEffectTracking: new PgHotTrendEffectTrackingRepository(pool),
    promptEvolutionProposals: new PgPromptEvolutionProposalRepository(pool),
    emotionArchetypes: new PgEmotionArchetypeLibraryRepository(pool),
    emotionArchetypeRunLogs: new PgEmotionArchetypeRunLogRepository(pool),
    scriptQualityScores: new PgScriptQualityScoreRepository(pool),
    promptVersionMetrics: new PgPromptVersionMetricsRepository(pool),
    squareCreatorTargets: new PgSquareCreatorTargetRepository(pool),
    squareDiscoveredVideos: new PgSquareDiscoveredVideoRepository(pool),
    squareExecutionLogs: new PgSquareExecutionLogRepository(pool),
    extTokens: new PgExtTokenRepository(pool),
    sceneLibraryUpdateLogs: new PgSceneLibraryUpdateLogRepository(pool),
    sceneLibrary: new PgSceneLibraryRepository(pool),
    aestheticUpdateLogs: new PgAestheticUpdateLogRepository(pool),
    aestheticLibrary: new PgAestheticLibraryRepository(pool),
    extDouyinPublishJobs: new PgExtDouyinPublishJobRepository(pool),
    stepPrompts: new PgStepPromptRepository(pool),
    videoScriptAssocs: new PgVideoScriptAssocRepository(pool),
  };

  return {
    ...repos,
    withTransaction: async <T>(fn: (txRepos: PgRepositoryCollection) => Promise<T>): Promise<T> => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // 创建事务版本的仓库
        const txRepos = createPgRepositoriesFromClient(pool, client);
        const result = await fn(txRepos);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        logger.error(error instanceof Error ? error : new Error(String(error)), "事务执行失败，已回滚");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

/** 从 client 创建事务仓库 */
function createPgRepositoriesFromClient(pool: Pool, client: PoolClient): PgRepositoryCollection {
  return {
    users: new PgUserRepository(pool, client),
    sessions: new PgSessionRepository(pool, client),
    projects: new PgProjectRepository(pool, client),
    providers: new PgProviderRepository(pool, client),
    providerSecrets: new PgProviderSecretRepository(pool, client),
    providerPolicies: new PgProviderPolicyRepository(pool, client),
    credits: new PgCreditRepository(pool, client),
    creditFreezes: new PgCreditFreezeRepository(pool, client),
    creditPricing: new PgCreditPricingRepository(pool, client),
    scripts: new PgScriptVersionRepository(pool, client),
    reverseTasks: new PgReverseTaskRepository(pool, client),
    reverseAttempts: new PgReverseAttemptRepository(pool, client),
    reverseTraces: new PgReverseTraceRepository(pool, client),
    sourceCredentials: new PgSourceCredentialRepository(pool, client),
    trendEntries: new PgTrendEntryRepository(pool, client),
    trendSyncJobs: new PgTrendSyncJobRepository(pool, client),
    libraryCharacters: new PgLibraryCharacterRepository(pool, client),
    libraryScripts: new PgLibraryScriptRepository(pool, client),
    libraryScriptVersions: new PgLibraryScriptVersionRepository(pool, client),
    reverseStoryboardLibrary: new PgReverseStoryboardLibraryRepository(pool, client),
    reverseStoryboardLibraryVersions: new PgReverseStoryboardLibraryVersionRepository(pool, client),
    smartStoryboardLibrary: new PgSmartStoryboardLibraryRepository(pool, client),
    smartStoryboardLibraryVersions: new PgSmartStoryboardLibraryVersionRepository(pool, client),
    themes: new PgThemeRepository(pool, client),
    userThemePreferences: new PgUserThemePreferenceRepository(pool, client),
    reviewRequests: new PgReviewRequestRepository(pool, client),
    publicResources: new PgPublicResourceRepository(pool, client),
    config: new PgConfigRepository(pool, client),
    deadLetters: new PgDeadLetterRepository(pool, client),
    videoMusics: new PgVideoMusicRepository(pool, client),
    assets: new PgAssetRepository(pool, client),
    outfitPlans: new PgOutfitPlanRepository(pool, client),
    projectOutfitPlanAssocs: new PgProjectOutfitPlanAssocRepository(pool, client),
    characterFiveViews: new PgCharacterFiveViewRepository(pool, client),
    functionalRoutes: new PgFunctionalRouteRepository(pool, client),
    shotBreakdowns: new PgShotBreakdownRepository(pool, client),
    scriptData: new PgScriptDataRepository(pool, client),
    userSquarePreferences: new PgUserSquarePreferenceRepository(pool, client),
    squareBehaviorLogs: new PgSquareBehaviorLogRepository(pool, client),
    garmentAssets: new PgGarmentAssetRepository(pool, client),
    squareUserWorks: new PgSquareUserWorkRepository(pool, client),
    squarePublishRequests: new PgSquarePublishRequestRepository(pool, client),
    errorLogs: new PgErrorLogRepository(pool, client),
    userScriptAssocs: new PgUserScriptAssocRepository(pool, client),
    announcements: new PgAnnouncementRepository(pool, client),
    step4VideoScenes: new PgStep4VideoSceneRepository(pool, client),
    step4PromptRefinements: new PgStep4PromptRefinementRepository(pool, client),
    modelPhotos: new PgModelPhotoRepository(pool, client),
    imageProjectExt: new PgImageProjectExtRepository(pool, client),
    longImageGeneration: new PgLongImageGenerationRepository(pool, client),
    pageSections: new PgPageSectionRepository(pool, client),
    sectionVersions: new PgSectionVersionRepository(pool, client),
    fileRegistry: new PgFileRegistryRepository(pool, client),
    projectCharacters: new PgProjectCharacterRepository(pool, client),
    projectGarmentAssocs: new PgProjectGarmentAssocRepository(pool, client),
    projectVideoMusics: new PgProjectVideoMusicRepository(pool, client),
    businessConfigs: new PgBusinessConfigRepository(pool, client),
    roleDirectionCards: new PgRoleDirectionCardsRepository(pool, client),
    outfitChangeProjects: new PgOutfitChangeProjectRepository(pool, client),
    segmentVideos: new PgSegmentVideoRepository(pool, client),
    videoProjectBusinessData: new PgVideoProjectBusinessDataRepository(pool, client),
    asyncJobs: new PgAsyncJobRepository(pool, client),
    finalVideos: new PgFinalVideoRepository(pool, client),
    fissionVideoStatus: new PgFissionVideoStatusRepository(pool, client),
    fissionTaskItems: new PgFissionTaskItemRepository(pool, client),
    fissionVideos: new PgFissionVideoRepository(pool, client),
    fissionStoryboards: new PgFissionStoryboardRepository(pool, client),
    fissionVideosMirror: new PgFissionVideosMirrorRepository(pool, client),
    adminOperationLogs: new PgAdminOperationLogRepository(pool, client),
    providerCallAudits: new PgProviderCallAuditRepository(pool, client),
    promptCallLogs: new PgPromptCallLogRepository(pool, client),
    systemJobs: new PgSystemJobRepository(pool, client),
    step3FrameImages: new PgStep3FrameImageRepository(pool, client),
    mirrorVideos: new PgMirrorVideoRepository(pool, client),
    auditLogs: new PgAuditLogRepository(pool, client),
    squareTemplates: new PgSquareTemplateRepository(pool, client),
    hotTrendAssets: new PgHotTrendAssetRepository(pool, client),
    hotTrendDailyReports: new PgHotTrendDailyReportRepository(pool, client),
    hotTrendSyncLogs: new PgHotTrendSyncLogRepository(pool, client),
    promptEvolutionProposals: new PgPromptEvolutionProposalRepository(pool, client),
    hotTrendEffectTracking: new PgHotTrendEffectTrackingRepository(pool, client),
    emotionArchetypes: new PgEmotionArchetypeLibraryRepository(pool, client),
    emotionArchetypeRunLogs: new PgEmotionArchetypeRunLogRepository(pool, client),
    scriptQualityScores: new PgScriptQualityScoreRepository(pool, client),
    promptVersionMetrics: new PgPromptVersionMetricsRepository(pool, client),
    squareCreatorTargets: new PgSquareCreatorTargetRepository(pool, client),
    squareDiscoveredVideos: new PgSquareDiscoveredVideoRepository(pool, client),
    squareExecutionLogs: new PgSquareExecutionLogRepository(pool, client),
    extTokens: new PgExtTokenRepository(pool, client),
    sceneLibraryUpdateLogs: new PgSceneLibraryUpdateLogRepository(pool, client),
    sceneLibrary: new PgSceneLibraryRepository(pool, client),
    aestheticUpdateLogs: new PgAestheticUpdateLogRepository(pool, client),
    aestheticLibrary: new PgAestheticLibraryRepository(pool, client),
    extDouyinPublishJobs: new PgExtDouyinPublishJobRepository(pool, client),
    stepPrompts: new PgStepPromptRepository(pool, client),
    videoScriptAssocs: new PgVideoScriptAssocRepository(pool, client),
    withTransaction: async <T>(fn: (txRepos: PgRepositoryCollection) => Promise<T>) => fn(createPgRepositoriesFromClient(pool, client)),
  };
}

// 导出用户广场偏好仓库及类型
export {
  PgUserSquarePreferenceRepository,
  type UserSquarePreference,
  type CategoryWeights,
  type SourceWeights,
  type BehaviorStats,
  DEFAULT_CATEGORY_WEIGHTS,
  DEFAULT_SOURCE_WEIGHTS,
  DEFAULT_BEHAVIOR_STATS,
} from "./user-square-preference-pg-repository.js";

// 导出广场行为日志仓库及类型
export {
  PgSquareBehaviorLogRepository,
  type SquareBehaviorLog,
  type ItemType,
  type BehaviorType,
} from "./square-behavior-log-pg-repository.js";

// 导出用户作品仓库及类型
export {
  PgSquareUserWorkRepository,
  type SquareUserWork,
} from "./square-user-work-pg-repository.js";

// 导出发布请求仓库及类型
export {
  PgSquarePublishRequestRepository,
  type SquarePublishRequest,
  type PublishRequestStatus,
} from "./square-publish-request-pg-repository.js";

// 导出错误日志仓库及类型
export {
  PgErrorLogRepository,
} from "./error-log-pg-repository.js";

// 导出公告仓库
export {
  PgAnnouncementRepository,
} from "./announcement-pg-repository.js";

// 导出分镜视频仓库及类型
export {
  PgSegmentVideoRepository,
  type SegmentVideoRecord,
  type ISegmentVideoRepository,
} from "./segment-video-pg-repository.js";

// 导出积分定价仓库及类型
export {
  PgCreditPricingRepository,
  type CreditPricingRecord,
  type CreditPricingHistoryRecord,
  type ICreditPricingRepository,
} from "./credit-pricing-pg-repository.js";