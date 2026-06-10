# Graph Report - /Users/Abner/HCode/neirongmiao  (2026-04-08)

## Corpus Check
- Large corpus: 952 files · ~2,347,121 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 6996 nodes · 11924 edges · 509 communities detected
- Extraction: 59% EXTRACTED · 41% INFERRED · 0% AMBIGUOUS · INFERRED: 4887 edges (avg confidence: 0.5)
- Token cost: 45,000 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `nE` - 110 edges
2. `Jr()` - 52 edges
3. `zE()` - 43 edges
4. `lE` - 41 edges
5. `Js()` - 38 edges
6. `js()` - 36 edges
7. `ScriptGenerator` - 32 edges
8. `n()` - 31 edges
9. `setFeedback()` - 24 edges
10. `createProgram()` - 24 edges

## Surprising Connections (you probably didn't know these)
- `NeiRongMiao` --uses--> `Yunwu API`  [EXTRACTED]
  README.md → CLAUDE.md
- `app.ts Constraint` --rationale_for--> `AppShell Extension Registration`  [EXTRACTED]
  memory/feedback-app-ts-constraint.md → docs/64.AppShell扩展注册口接入说明-2026-03-25.md
- `isSupportedVideoReverseMultipartFileName()` --calls--> `normalizeString()`  [INFERRED]
  src/contracts/video-reverse-multipart-entry.ts → src/modules/video-reverse-multipart-entry.ts
- `isSupportedVideoReverseMultipartMimeType()` --calls--> `normalizeString()`  [INFERRED]
  src/contracts/video-reverse-multipart-entry.ts → src/modules/video-reverse-multipart-entry.ts
- `validateVideoReverseMultipartEnvelope()` --calls--> `normalizeString()`  [INFERRED]
  src/contracts/video-reverse-multipart-entry.ts → src/modules/video-reverse-multipart-entry.ts

## Hyperedges (group relationships)
- **Frontend Testing Framework** — frontend_testing, vitest, playwright, test_layers [EXTRACTED 1.00]
- **Male Avatar Selection Set** — boys01_male_avatar, male_avatar_category [EXTRACTED 1.00]
- **Step3 LLM Prompt Chain** — hotspot_analyzer_prompt, script_creator_prompt, video_rewriter_prompt, shot_engineer_prompt [INFERRED 0.85]

## Communities

### Community 0 - "Prompt Management Panel"
Cohesion: 0.01
Nodes (418): _0(), _1(), _A(), a0(), a1(), a2(), aa(), ab() (+410 more)

### Community 1 - "Core App & Admin"
Cohesion: 0.01
Nodes (151): handleMainFileChange(), handleOtherFileChange(), registerObjectUrl(), buildReverseParseV2JobStartPath(), startReverseParseV2JobRequest(), ApiError, addCustomTag(), handleKeyDown() (+143 more)

### Community 2 - "Asset Library UI"
Cohesion: 0.01
Nodes (143): be(), v(), br(), De(), tt(), Xs(), Ys(), Zs() (+135 more)

### Community 3 - "Button & UI Components"
Cohesion: 0.01
Nodes (115): ensurePreviewWorkspace(), handleGenerateAllStyledViews(), handleRegenerateStyledView(), handleRegenerateStyledViewBySlot(), handleSelectModel(), handleStep2V2RegenerateCandidate(), hydratePreviewWorkspace(), markBackgroundTaskCompleted() (+107 more)

### Community 4 - "Step3 Batch Controls"
Cohesion: 0.01
Nodes (102): classifyMediaUrl(), hasEmbeddedWhitespace(), isDataUrl(), isObjectStorageUrl(), isRemoteUrl(), normalizeUrlCandidate(), sanitizeUrlField(), appendLibraryMirrorScript() (+94 more)

### Community 5 - "Assets Module"
Cohesion: 0.02
Nodes (76): handleReplaceOutfitItem(), resolveOutfitSlotCandidates(), expectBooleanField(), expectPromptModeField(), expectRoleDirectionCount(), normalizeCharacterWorkflowSystemSettingsInput(), ensureProjectId(), handleGenerate() (+68 more)

### Community 6 - "App Shell Tests"
Cohesion: 0.02
Nodes (38): buildExportMusicMixArgs(), clamp(), normalizeExportMusicMixOptions(), round3(), createMockProjectRepository(), createMockRepositories(), createMockSessionRepository(), createMockTrendEntryRepository() (+30 more)

### Community 7 - "Step3 Workspace Route"
Cohesion: 0.03
Nodes (98): $a(), An(), Ba(), bi(), bn(), Ca(), Cn(), co() (+90 more)

### Community 8 - "Prompt Panel Functions"
Cohesion: 0.06
Nodes (6): _b(), mn(), nE, _r(), Wt(), xd()

### Community 9 - "WebAV Video Engine"
Cohesion: 0.03
Nodes (53): an(), bn(), br(), ci(), cn(), cr(), Di(), dr() (+45 more)

### Community 10 - "Step3 Script Contracts"
Cohesion: 0.03
Nodes (52): assertNonEmptyString(), normalizeStep3StructuredScriptCard(), cleanupSectionValue(), normalizeLine(), pickSceneSettings(), pickSectionValue(), removeBulletPrefix(), resolveStep3ScriptBasicInfo() (+44 more)

### Community 11 - "Vendor Utilities"
Cohesion: 0.05
Nodes (73): A(), ae(), an(), At(), B(), B0(), be(), bn() (+65 more)

### Community 12 - "Reverse Storyboard"
Cohesion: 0.03
Nodes (48): normalizeOptionalText(), pickFirstParagraph(), resolveReverseStoryboardPrimaryTopic(), resolveReverseStoryboardPrimaryTopicFromPanel(), splitParagraphs(), buildReversePendingJobRecord(), normalizePendingJobRecord(), normalizeSourceHash() (+40 more)

### Community 13 - "Video Merge Logic"
Cohesion: 0.05
Nodes (26): At, bt, Ct, dt, Et, ft, gt, ht (+18 more)

### Community 14 - "Route Index Handlers"
Cohesion: 0.04
Nodes (47): a(), ae(), Ar(), As(), at(), bs(), cs(), Da() (+39 more)

### Community 15 - "Douyin Integration"
Cohesion: 0.05
Nodes (41): buildReverseExternalApiConfig(), buildTrendTopicIdentity(), collectTrendTopicIdCandidates(), createDefaultReverseFetchAdapters(), CustomCookieAdapter, DouhotAdapter, ExternalApiAdapter, extractTikHubCacheUrl() (+33 more)

### Community 16 - "Vendor React Bundle"
Cohesion: 0.07
Nodes (58): ac(), Ad(), Ai(), ap(), Bd(), Bi(), cd(), Cp() (+50 more)

### Community 17 - "Step1 Shared Components"
Cohesion: 0.06
Nodes (50): A(), ae(), At(), Be(), ce(), Ct(), De(), Dt() (+42 more)

### Community 18 - "Step2 Quick Create Modal"
Cohesion: 0.06
Nodes (51): A(), ae(), B(), bt(), C(), ct(), de(), dt() (+43 more)

### Community 19 - "Base Video Transitions"
Cohesion: 0.08
Nodes (28): ActionMatchTransition, BlindsTransition, CausalTransition, createProgram(), createShader(), createTexture(), CrossDissolveTransition, CutTransition (+20 more)

### Community 20 - "Project Flow Logic"
Cohesion: 0.04
Nodes (28): As(), Bs(), ce(), Ds(), en(), Es(), Fs(), Hs() (+20 more)

### Community 21 - "Square Module"
Cohesion: 0.04
Nodes (15): downloadSingleVideo(), extractFilename(), checkVideoMergeSupport(), getFrameAsBitmap(), getVideoMeta(), isWebCodecsSupported(), mergeVideosWithTransitions(), setupSpriteRect() (+7 more)

### Community 22 - "Hot Trend Service"
Cohesion: 0.06
Nodes (42): assertStringArray(), compileBlacklistPattern(), escapeForRegex(), normalizeHiddenPromptCleaningPolicy(), sanitizeHiddenPrompt(), normalizeOptionalString(), normalizeStep1CleanHiddenPromptInput(), assertNonEmptyPrompt() (+34 more)

### Community 23 - "LLM Transport"
Cohesion: 0.06
Nodes (32): clearFeedback(), copyAuditError(), handleClearProviderAudits(), handleCreateScript(), handleCreateUser(), handleDeleteHotTrendScript(), handleDeleteProvider(), handleDeleteScript() (+24 more)

### Community 24 - "Prompt System"
Cohesion: 0.06
Nodes (42): ar(), At(), be(), Bt(), C(), cr(), er(), fe() (+34 more)

### Community 25 - "Video Step Modules"
Cohesion: 0.05
Nodes (19): normalizeStep4SceneVariantsByScene(), normalizeStep4SelectedVariantByScene(), resolveStep4SceneIndexFromKey(), assertNullableString(), assertStringArray(), assertWorkspaceId(), fail(), normalizeFrameEntry() (+11 more)

### Community 26 - "Repository Layer"
Cohesion: 0.05
Nodes (7): PgLibraryCharacterRepository, PgLibraryScriptRepository, PgLibraryScriptVersionRepository, PgReverseStoryboardLibraryRepository, PgReverseStoryboardLibraryVersionRepository, PgSmartStoryboardLibraryRepository, PgSmartStoryboardLibraryVersionRepository

### Community 27 - "Auth & Guards"
Cohesion: 0.09
Nodes (26): appendSessionLog(), appendViewLog(), buildCharacterViewStoragePrefix(), collectSessionImagePool(), createCharacterViewSession(), ensureFiveViews(), extractPersistedSourceDigestIdentity(), findFiveViewDefinition() (+18 more)

### Community 28 - "Error Handling"
Cohesion: 0.07
Nodes (19): createPendingRouteAudit(), dedupeModelCandidates(), isYunwuProviderSource(), recordRouteAudit(), resolveGeminiModelCandidates(), resolveModelFallbackOrder(), resolveProviderTimeoutMs(), resolveRouteProvider() (+11 more)

### Community 29 - "Storage Adapters"
Cohesion: 0.11
Nodes (34): buildAuthHeaderCandidates(), buildGeminiImageParts(), buildGeminiImagePromptWithConstraints(), compactUnknownText(), dedupeModelCandidates(), extractGeminiImageDataUrls(), extractImageUrlsFromProviderResponse(), extractProviderErrorMessage() (+26 more)

### Community 30 - "Community 30"
Cohesion: 0.09
Nodes (6): hashJson(), mapCallAuditRow(), MemoryAuditStore, nrmTable(), PgAuditStore, UpgradableAuditStore

### Community 31 - "Community 31"
Cohesion: 0.12
Nodes (2): FissionStoryboardSubService, FissionVideoStatusService

### Community 32 - "Community 32"
Cohesion: 0.12
Nodes (1): ScriptGenerator

### Community 33 - "Community 33"
Cohesion: 0.14
Nodes (27): A(), B(), C(), d(), ee(), F(), fe(), g() (+19 more)

### Community 34 - "Community 34"
Cohesion: 0.12
Nodes (26): main(), _output_error(), check_status(), click_scan_login_if_needed(), detect_confirmed(), detect_scanned(), generate_qr(), has_any_visible_text() (+18 more)

### Community 35 - "Community 35"
Cohesion: 0.14
Nodes (28): buildAuthHeaderCandidates(), buildDoubaoVideoPromptWithFlags(), callVideoGenerationApi(), extractTaskIdFromDoubaoResponse(), extractTaskIdFromResponse(), extractTaskIdFromVeoResponse(), extractVideoUrlsFromDoubaoResponse(), extractVideoUrlsFromResponse() (+20 more)

### Community 36 - "Community 36"
Cohesion: 0.08
Nodes (6): matchesHotTrendTypeTag(), parseHotHubSection(), parseHotTrendSourceUrl(), resolveHotHubSectionHeader(), resolveHotTrendAssetSourceUrl(), resolveHotTrendTypeFromTags()

### Community 37 - "Community 37"
Cohesion: 0.1
Nodes (9): _a(), je(), Ma(), Oe(), Pa(), Ra(), Re(), St() (+1 more)

### Community 38 - "Community 38"
Cohesion: 0.1
Nodes (8): ProjectFlowRouteBoundary, buildStep3WorkspaceNavigationSnapshot(), toOptionalNumber(), toOptionalString(), buildStep3WorkspacePreviewParameterSnapshot(), toOptionalString(), buildStep3WorkspaceSeedSnapshot(), toArrayLength()

### Community 39 - "Community 39"
Cohesion: 0.08
Nodes (4): PgReverseAttemptRepository, PgReverseTaskRepository, PgReverseTraceRepository, PgSourceCredentialRepository

### Community 40 - "Community 40"
Cohesion: 0.15
Nodes (8): collectFilesRecursively(), normalizeProviderOptions(), pad2(), parseSlotTimestampFromFilePath(), ProviderAdminService, requireAdmin(), resolveProviderErrorLogRoot(), sortPolicies()

### Community 41 - "Community 41"
Cohesion: 0.18
Nodes (2): DouyinAuthService, normalizeDirectory()

### Community 42 - "Community 42"
Cohesion: 0.11
Nodes (10): co(), et(), fo(), io(), lo(), ot(), So(), To() (+2 more)

### Community 43 - "Community 43"
Cohesion: 0.14
Nodes (5): AliOssStorageAdapter, LocalObjectStorageAdapter, normalizeObjectKey(), S3ObjectStorageAdapter, SupabaseObjectStorageAdapter

### Community 44 - "Community 44"
Cohesion: 0.1
Nodes (7): kr(), mr(), pr(), $t(), tr(), ur(), Zs()

### Community 45 - "Community 45"
Cohesion: 0.09
Nodes (3): PgProviderPolicyRepository, PgProviderRepository, PgProviderSecretRepository

### Community 46 - "Community 46"
Cohesion: 0.19
Nodes (9): createSeededRng(), deriveSeedFromPaths(), execute(), FissionExportService, isHttpUrl(), normalizeClipVideoUrls(), resolveVideoExtension(), round3() (+1 more)

### Community 47 - "Community 47"
Cohesion: 0.17
Nodes (20): buildOutfitAnalysisCacheKey(), buildOutfitConcreteGuidance(), cloneOutfitAnalysisResult(), enrichOutfitAnalysisCard(), ensureAnalysisContainsConcreteCombination(), extractOutfitCategoryValueFromAnalysis(), getOutfitCategoryFallbackLabel(), isLikelyAssetFilename() (+12 more)

### Community 48 - "Community 48"
Cohesion: 0.14
Nodes (5): DouyinPublishService, isHttpUrl(), normalizeDirectory(), normalizeOptionalPath(), resolveMediaExtension()

### Community 49 - "Community 49"
Cohesion: 0.15
Nodes (17): buildDoubaoVideoPromptWithFlags(), buildVeoVideoCreateEndpointCandidates(), buildVeoVideoQueryEndpointCandidates(), extractProviderErrorMessage(), extractVideoTaskIdFromProviderResponse(), extractVideoUrlsFromProviderResponse(), isDataImageUrl(), isHttpUrl() (+9 more)

### Community 50 - "Community 50"
Cohesion: 0.11
Nodes (10): createModuleDoc(), exportSwagger(), extractPathsByTags(), buildInputSnapshot(), buildUserPrompt(), generateShotPrompts(), loadPromptTemplate(), parseShotPromptsJson() (+2 more)

### Community 51 - "Community 51"
Cohesion: 0.13
Nodes (13): buildDouhotAdapter(), buildTikHubRealtimeAdapter(), buildTikHubVideoAdapter(), calculateNextHotTrendRunTime(), resolveDouhotEndpointForHotTrends(), resolveHotTrendRealtimeSyncIntervalHours(), resolveHotTrendSyncIntervalMs(), resolveHotTrendVideoDateWindowHours() (+5 more)

### Community 52 - "Community 52"
Cohesion: 0.18
Nodes (20): analyzeVideoMusicAtmospheres(), buildMetadataAtmosphereText(), buildMusicPublicUrl(), createVideoMusicEntry(), deleteVideoMusicEntry(), ensureDefaultVideoMusicLibrary(), extractRemoteMusicItems(), findVideoMusicByTitle() (+12 more)

### Community 53 - "Community 53"
Cohesion: 0.15
Nodes (17): createTransitionInfo(), execute(), fetchAndSaveVideo(), generateFissionVideoPath(), generateMirrorVideoPath(), getVideoDuration(), isHttpUrl(), mergeVideos() (+9 more)

### Community 54 - "Community 54"
Cohesion: 0.09
Nodes (0): 

### Community 55 - "Community 55"
Cohesion: 0.3
Nodes (8): assertAdmin(), cloneItem(), cloneRelationRef(), cloneSourceRef(), cloneVersion(), normalizeOptionalText(), normalizeTags(), SmartStoryboardLibraryService

### Community 56 - "Community 56"
Cohesion: 0.13
Nodes (3): CreditCleanupAdapter, DeletedDataCleanupService, ProviderSecretCleanupAdapter

### Community 57 - "Community 57"
Cohesion: 0.2
Nodes (2): PromptService, table()

### Community 58 - "Community 58"
Cohesion: 0.15
Nodes (11): buildScriptGenerationVariables(), createFallbackScript(), createFallbackScripts(), fixGenderInconsistency(), generateScripts(), generateUuid(), getCurrentSeason(), getDiversificationCombinations() (+3 more)

### Community 59 - "Community 59"
Cohesion: 0.24
Nodes (14): a(), b(), C(), f(), H(), l(), m(), O() (+6 more)

### Community 60 - "Community 60"
Cohesion: 0.18
Nodes (12): assertCellSize(), assertCropRule(), assertGender(), assertGridSize(), assertNonEmptyString(), assertNumberInRange(), assertPositiveInt(), assertSlotOrder() (+4 more)

### Community 61 - "Community 61"
Cohesion: 0.13
Nodes (2): PgScriptVersionRepository, PgStoryboardFrameRepository

### Community 62 - "Community 62"
Cohesion: 0.22
Nodes (2): DouyinRemoteLoginService, normalizeDirectory()

### Community 63 - "Community 63"
Cohesion: 0.15
Nodes (2): ThemeAdminService, ThemeService

### Community 64 - "Community 64"
Cohesion: 0.21
Nodes (7): createConsoleCompatibleLogger(), createModuleLogger(), maskSensitiveValue(), PinoLoggerWrapper, redactObject(), resolveLogLevel(), shouldPrettyPrint()

### Community 65 - "Community 65"
Cohesion: 0.29
Nodes (5): cloneLibraryItem(), cloneLibraryVersion(), normalizeOptionalText(), normalizeTags(), ReverseStoryboardLibraryService

### Community 66 - "Community 66"
Cohesion: 0.14
Nodes (2): PgProjectRepository, PgWorkflowStateRepository

### Community 67 - "Community 67"
Cohesion: 0.12
Nodes (3): PgConfigRepository, PgDeadLetterRepository, PgVideoMusicRepository

### Community 68 - "Community 68"
Cohesion: 0.25
Nodes (14): buildReverseStoryboardPanelViewModel(), cloneReverseStoryboardPanelViewModel(), cloneReverseStoryboardReport(), createMutableFrameDraft(), finalizeFrameDraft(), mapRawReverseStoryboardReport(), normalizeMarkdownTableCells(), normalizeText() (+6 more)

### Community 69 - "Community 69"
Cohesion: 0.28
Nodes (3): kb(), qb(), Xb()

### Community 70 - "Community 70"
Cohesion: 0.14
Nodes (2): PgPublicResourceRepository, PgReviewRequestRepository

### Community 71 - "Community 71"
Cohesion: 0.15
Nodes (2): PgAssetRepository, PgOutfitPlanRepository

### Community 72 - "Community 72"
Cohesion: 0.14
Nodes (2): PgSessionRepository, PgUserRepository

### Community 73 - "Community 73"
Cohesion: 0.21
Nodes (9): buildCharacterViewStoragePrefix(), createCharacterViewSession(), hydrateCharacterViewSessionCandidatesFromStorage(), mergeCandidatesUnique(), normalizeImageIdentity(), normalizeStorageEntityName(), pickLatestCandidate(), resolveDressedupProjectIdFromCharacterTags() (+1 more)

### Community 74 - "Community 74"
Cohesion: 0.18
Nodes (6): buildReverseCenterScriptTitle(), buildReverseMirrorScriptContent(), buildReverseMirrorScriptTitle(), createReverseCenterScript(), ensureReverseScriptMirror(), findReverseMirrorByScriptVersion()

### Community 75 - "Community 75"
Cohesion: 0.15
Nodes (3): MyLibraryService, resolveStoryboardCategory(), shouldIncludeStoryboardInMyLibrary()

### Community 76 - "Community 76"
Cohesion: 0.21
Nodes (7): clampHotTrendStep3DurationSec(), normalizeHotTrendHumanPresence(), normalizeHotTrendInsights(), normalizeHotTrendLabels(), normalizeHotTrendSceneSettings(), normalizeHotTrendStoryboardSegments(), toHotTrendSceneSettingsArray()

### Community 77 - "Community 77"
Cohesion: 0.24
Nodes (1): FissionVideoService

### Community 78 - "Community 78"
Cohesion: 0.32
Nodes (11): b(), c(), f(), g(), h(), I(), o(), p() (+3 more)

### Community 79 - "Community 79"
Cohesion: 0.31
Nodes (11): buildStep3SceneReinforcePromptDraft(), pickVisualPromptSource(), stripVisualPrefix(), trimText(), buildSceneReferencePrompt(), compactText(), containsAnyToken(), pickFirstToken() (+3 more)

### Community 80 - "Community 80"
Cohesion: 0.17
Nodes (2): PgThemeRepository, PgUserThemePreferenceRepository

### Community 81 - "Community 81"
Cohesion: 0.15
Nodes (1): PgUserScriptAssocRepository

### Community 82 - "Community 82"
Cohesion: 0.17
Nodes (2): findOneWhere(), findWhere()

### Community 83 - "Community 83"
Cohesion: 0.18
Nodes (4): createVideoJobRuntime(), DisabledVideoJobRuntime, InMemoryVideoJobRuntime, resolveInterval()

### Community 84 - "Community 84"
Cohesion: 0.23
Nodes (1): SquareAggregateService

### Community 85 - "Community 85"
Cohesion: 0.27
Nodes (10): buildModelProtocolDiffMarkdown(), classifyProtocolLayer(), detectExpectedProtocol(), extractEndpoint(), generateModelProtocolDiffReport(), isProtocolMismatch(), parseAuditRecord(), readProtocolAuditRecords() (+2 more)

### Community 86 - "Community 86"
Cohesion: 0.22
Nodes (7): convertScriptResultToSnapshotItem(), convertStoryboardSegmentsNew(), createDefaultQualityCheckReport(), extractClimaxDesignFromSegments(), extractMatchReasons(), generateSnapshotId(), stage6_formatOutput()

### Community 87 - "Community 87"
Cohesion: 0.28
Nodes (1): FissionStoryboardService

### Community 88 - "Community 88"
Cohesion: 0.28
Nodes (11): buildGeminiImagePromptWithConstraints(), createImageDebugRecord(), extractGeminiImageDataUrls(), finalizeImageDebugError(), finalizeImageDebugSuccess(), getJsonWithTimeout(), requestGeminiImageUrls(), requestGenericJimengImageUrlsInternal() (+3 more)

### Community 89 - "Community 89"
Cohesion: 0.24
Nodes (7): getVideoGenerationConfig(), getVideoJobExecutorConfig(), getVideoPollingConfig(), getVideoRetryConfig(), parseBoolEnv(), parseIntEnv(), parseStringEnv()

### Community 90 - "Community 90"
Cohesion: 0.17
Nodes (0): 

### Community 91 - "Community 91"
Cohesion: 0.17
Nodes (2): PgFissionResultRepository, PgVideoJobRepository

### Community 92 - "Community 92"
Cohesion: 0.18
Nodes (1): PgScriptDataRepository

### Community 93 - "Community 93"
Cohesion: 0.26
Nodes (2): ModelPresetService, requireAdmin()

### Community 94 - "Community 94"
Cohesion: 0.27
Nodes (2): InMemoryProviderExecutionLimiter, normalizeRequestId()

### Community 95 - "Community 95"
Cohesion: 0.27
Nodes (8): buildHotTrendSceneSettings(), buildHotTrendStoryboardMarkdown(), buildHotTrendStructuredAsset(), extractStoryboardSegmentsFromReverseContext(), inferStoryMainScene(), inferStoryTime(), inferStoryWeather(), stripHotTrendMetadata()

### Community 96 - "Community 96"
Cohesion: 0.32
Nodes (11): buildLibraryScriptSnapshot(), buildReadableContent(), convertToSnapshotItem(), convertToStoryboardSegments(), createEmptyLibrarySnapshot(), estimateDuration(), extractAtmosphere(), extractLabels() (+3 more)

### Community 97 - "Community 97"
Cohesion: 0.3
Nodes (11): buildReadableContent(), buildVideoScriptSnapshot(), convertToSnapshotItem(), convertToStoryboardSegments(), createEmptyVideoSnapshot(), estimateDuration(), extractAtmosphere(), extractLabels() (+3 more)

### Community 98 - "Community 98"
Cohesion: 0.21
Nodes (2): Unified Script Library, UnifiedScriptService

### Community 99 - "Community 99"
Cohesion: 0.18
Nodes (1): PgCreditRepository

### Community 100 - "Community 100"
Cohesion: 0.22
Nodes (3): findOneWhere(), findWhere(), list()

### Community 101 - "Community 101"
Cohesion: 0.25
Nodes (1): SquareTemplateService

### Community 102 - "Community 102"
Cohesion: 0.31
Nodes (3): DouyinPublishHistoryStore, normalizeStorePath(), sortJobs()

### Community 103 - "Community 103"
Cohesion: 0.36
Nodes (9): collectAnchorWords(), collectFallbackDescriptors(), collectRawSourceText(), compactText(), containsCjk(), mapStep1RolePresetToEnglishCoreFeatures(), normalizeRegion(), resolvePhysicalDescriptors() (+1 more)

### Community 104 - "Community 104"
Cohesion: 0.29
Nodes (7): clonePlainRecordForStartupNormalization(), normalizeInlineMediaUrlsInStore(), normalizeProjectWorkflowStateMediaUrls(), normalizeStoryboardFrameRecordMediaUrls(), readPlainRecordFieldForStartupNormalization(), recomputeCharacterViewSession(), syncCharacterViewsFromSession()

### Community 105 - "Community 105"
Cohesion: 0.33
Nodes (8): buildHotTrendStoryboardSegmentsFromScriptText(), compactHotTrendTextLine(), mergeShortHotTrendNarrationBlocks(), normalizeHotTrendNarrationLine(), sanitizeHotTrendNarrativeText(), shouldSkipHotTrendNarrationLine(), splitHotTrendNarrationSentences(), summarizeHotTrendAuditSnippet()

### Community 106 - "Community 106"
Cohesion: 0.29
Nodes (7): buildStoragePath(), uploadFile(), uploadFissionVideo(), uploadMirrorVideo(), uploadStoryboardImage(), uploadStoryboardVideo(), uploadThumbnail()

### Community 107 - "Community 107"
Cohesion: 0.22
Nodes (4): buildGeminiImageParts(), isGeminiProvider(), resolveGeminiImageInlineData(), shouldUseGeminiVideoReverseTransport()

### Community 108 - "Community 108"
Cohesion: 0.29
Nodes (7): requestLlmPlainText(), requestLlmPlainTextWithMetadata(), requestLlmScriptPayload(), requestLlmScriptPayloadLenient(), requestLlmScriptPayloadStrict(), requestLlmStoryboardPromptFrames(), withDebugRecording()

### Community 109 - "Community 109"
Cohesion: 0.38
Nodes (8): A(), b(), ce(), de(), le(), me(), ne(), z()

### Community 110 - "Community 110"
Cohesion: 0.33
Nodes (7): normalizeProviderRoutePolicyConfigDto(), parseBooleanWithFallback(), parseFallbackProviderIds(), parseFunctionalKey(), parseIntWithMin(), parseNonEmptyString(), parseProviderRouteKey()

### Community 111 - "Community 111"
Cohesion: 0.24
Nodes (1): DeletedDataCleanupScheduler

### Community 112 - "Community 112"
Cohesion: 0.33
Nodes (7): buildAuthHeaderCandidates(), isProxyPlatform(), maskHeaderValue(), parseSecretCandidates(), resolveJimengRegionCandidates(), sanitizeHeaders(), toBearerToken()

### Community 113 - "Community 113"
Cohesion: 0.2
Nodes (1): PgSquarePublishRequestRepository

### Community 114 - "Community 114"
Cohesion: 0.24
Nodes (1): PgCharacterFiveViewRepository

### Community 115 - "Community 115"
Cohesion: 0.2
Nodes (1): PgErrorLogRepository

### Community 116 - "Community 116"
Cohesion: 0.36
Nodes (1): SquareBehaviorService

### Community 117 - "Community 117"
Cohesion: 0.22
Nodes (2): PublishService, PublishServiceError

### Community 118 - "Community 118"
Cohesion: 0.33
Nodes (2): FunctionalRouteService, requireAdmin()

### Community 119 - "Community 119"
Cohesion: 0.38
Nodes (8): buildAllInOneProjectFolder(), buildDressedupProjectFolder(), buildLegacyDressedupReadStoragePrefix(), buildStep2DressedupAllInOneSlotStoragePrefix(), buildStep2DressedupWriteStoragePrefix(), listStep2DressedupReadableStoragePrefixes(), normalizeStorageEntityName(), toStep2AllInOneSlotFolder()

### Community 120 - "Community 120"
Cohesion: 0.33
Nodes (7): buildModelAuditMarkdown(), generateModelAuditReport(), parseProviderAuditRecord(), readAuditRecords(), toIsoTimestamp(), toNullableString(), toNumber()

### Community 121 - "Community 121"
Cohesion: 0.42
Nodes (9): buildStep1ImageClassificationHeuristic(), normalizeStep1ImageClassificationCategory(), normalizeStep1ImageClassificationCategoryForTarget(), normalizeStep1ImageClassificationConfidence(), normalizeStep1ImageClassificationFromLlm(), normalizeStep1ImageClassificationViewLabel(), normalizeStep1ImageClassificationViewLabelForTarget(), requestStep1ImageClassification() (+1 more)

### Community 122 - "Community 122"
Cohesion: 0.27
Nodes (1): ProjectService

### Community 123 - "Community 123"
Cohesion: 0.29
Nodes (2): CharacterLibraryService, mockViews()

### Community 124 - "Community 124"
Cohesion: 0.24
Nodes (4): inferHotTrendSuitability(), isHotTrendCautiousOrRejectedInsight(), isVideoHotTrendInsightEligibleForGeneration(), scoreHotTrendFashionSoftAdAffinity()

### Community 125 - "Community 125"
Cohesion: 0.33
Nodes (2): PromptLogService, table()

### Community 126 - "Community 126"
Cohesion: 0.36
Nodes (1): MirrorVideoService

### Community 127 - "Community 127"
Cohesion: 0.24
Nodes (1): FissionNewStoryOrchestrator

### Community 128 - "Community 128"
Cohesion: 0.22
Nodes (2): buildProjectStepState(), pickProjectStepState()

### Community 129 - "Community 129"
Cohesion: 0.29
Nodes (1): ErrorLogQueue

### Community 130 - "Community 130"
Cohesion: 0.42
Nodes (8): createMockLibraryScript(), createMockProject(), createMockSession(), createMockTrendEntry(), createMockTrendSyncJob(), createMockUser(), createMockWorkflowState(), generateId()

### Community 131 - "Community 131"
Cohesion: 0.44
Nodes (7): b(), d(), h(), i(), m(), p(), s()

### Community 132 - "Community 132"
Cohesion: 0.22
Nodes (0): 

### Community 133 - "Community 133"
Cohesion: 0.47
Nodes (8): isSupportedVideoReverseMultipartFileName(), isSupportedVideoReverseMultipartMimeType(), isVideoReverseMultipartTextField(), normalizeString(), parseVideoReverseMultipartParts(), parseVideoReverseMultipartRequest(), parseVideoReverseMultipartRuntime(), validateVideoReverseMultipartEnvelope()

### Community 134 - "Community 134"
Cohesion: 0.44
Nodes (8): createEmptyProjectBackgroundGenerationTaskState(), normalizeError(), normalizeNullableString(), normalizePhase(), normalizeProgress(), normalizeProjectBackgroundGenerationTaskState(), normalizeResultRefs(), normalizeTimestamp()

### Community 135 - "Community 135"
Cohesion: 0.22
Nodes (1): PgProjectGarmentAssocRepository

### Community 136 - "Community 136"
Cohesion: 0.22
Nodes (1): PgSquareBehaviorLogRepository

### Community 137 - "Community 137"
Cohesion: 0.22
Nodes (2): PgTrendEntryRepository, PgTrendSyncJobRepository

### Community 138 - "Community 138"
Cohesion: 0.22
Nodes (1): PgUserSquarePreferenceRepository

### Community 139 - "Community 139"
Cohesion: 0.33
Nodes (1): UserPreferenceService

### Community 140 - "Community 140"
Cohesion: 0.31
Nodes (2): IDataSourceAdapter, RecommendationService

### Community 141 - "Community 141"
Cohesion: 0.22
Nodes (1): AuthService

### Community 142 - "Community 142"
Cohesion: 0.36
Nodes (6): buildUserInput(), ensureVideoInfo(), estimateTotalDuration(), mergeWithOriginal(), parseLLMResponse(), rewriteSingleScript()

### Community 143 - "Community 143"
Cohesion: 0.36
Nodes (8): clamp(), downloadAndUploadVideoMusic(), downloadVideoMusicFile(), ensureWaveToneFile(), generateWaveToneBuffer(), uploadVideoMusicToStorage(), uploadWaveToneToStorage(), writeVideoMusicFile()

### Community 144 - "Community 144"
Cohesion: 0.39
Nodes (6): checkPromptExists(), formatVariablesAsUserPrompt(), getPromptContent(), getPromptService(), parsePromptSections(), tryGetPromptContent()

### Community 145 - "Community 145"
Cohesion: 0.36
Nodes (6): buildStoryPrompt(), callMultimodalLlm(), formatCharacterInfo(), generateNewStory(), parseStoryResponse(), toBearerToken()

### Community 146 - "Community 146"
Cohesion: 0.31
Nodes (4): buildCallContext(), captureCallStack(), createLlmDebugRecord(), truncateJson()

### Community 147 - "Community 147"
Cohesion: 0.47
Nodes (8): guessImageExtension(), guessVideoExtension(), isObjectStoragePublicUrl(), normalizeObjectStoragePublicBase(), persistImageSourceToStorage(), persistVideoSourceToStorage(), readImageBytesFromSource(), resolveVideoContentType()

### Community 148 - "Community 148"
Cohesion: 0.39
Nodes (7): fetchImageInlineData(), guessImageMimeType(), isSupportedLlmImageUrl(), parseImageDataUrl(), readLocalImageInlineData(), resolveLocalImageFilePath(), resolveServerRelativeImageUrl()

### Community 149 - "Community 149"
Cohesion: 0.22
Nodes (9): ChatGPT, Claude, Fastify 5, Gemini, NeiRongMiao, PostgreSQL, React 18, Six-Step Workflow (+1 more)

### Community 150 - "Community 150"
Cohesion: 0.29
Nodes (2): clearAllTestTables(), clearTables()

### Community 151 - "Community 151"
Cohesion: 0.43
Nodes (6): sanitizeWorkflowStateCharacterReferences(), sanitizeWorkflowStatePreviewCandidatesByFrame(), sanitizeWorkflowStatePreviewJobsByFrame(), sanitizeWorkflowStateProjectData(), sanitizeWorkflowStateSceneReferences(), sanitizeWorkflowStateScriptSegments()

### Community 152 - "Community 152"
Cohesion: 0.36
Nodes (1): TrackedMap

### Community 153 - "Community 153"
Cohesion: 0.43
Nodes (6): readBoolean(), readInteger(), readString(), readStringAlias(), resolveRuntimeAppConfig(), resolveRuntimeConfig()

### Community 154 - "Community 154"
Cohesion: 0.57
Nodes (7): hasTarget(), includesMarker(), normalizeHost(), normalizeText(), resolveEndpointByPolicy(), resolveResourceUrlByPolicy(), resolveRuntimePolicyScope()

### Community 155 - "Community 155"
Cohesion: 0.39
Nodes (6): buildClothingDenylistSet(), buildPromptNoiseDenylistSet(), cleanseOverallImpression(), cleanseStyleWords(), containsDenyToken(), mapRolePresetBundleToCards()

### Community 156 - "Community 156"
Cohesion: 0.46
Nodes (6): assertNonEmptyString(), assertNonNegativeInteger(), normalizeStep3CandidateAdminUnlockRequest(), normalizeStep3CandidateConfirmRequest(), normalizeStep3CandidateRewriteApplyRequest(), normalizeStep3CandidateSelectRequest()

### Community 157 - "Community 157"
Cohesion: 0.43
Nodes (6): assertProviderExecutionGovernanceContract(), clamp(), createProviderRouteAuditRecord(), normalizeFiniteInteger(), normalizeProviderExecutionGovernanceConfig(), normalizeSummary()

### Community 158 - "Community 158"
Cohesion: 0.25
Nodes (1): PgGarmentAssetRepository

### Community 159 - "Community 159"
Cohesion: 0.25
Nodes (1): PgShotBreakdownRepository

### Community 160 - "Community 160"
Cohesion: 0.25
Nodes (0): 

### Community 161 - "Community 161"
Cohesion: 0.43
Nodes (7): buildInputParams(), isStaticResourceRequest(), registerAppErrorHandler(), registerAppRuntimeHooks(), registerCorsHook(), sanitizeInputParams(), truncateParams()

### Community 162 - "Community 162"
Cohesion: 0.25
Nodes (1): RecommendConfigService

### Community 163 - "Community 163"
Cohesion: 0.29
Nodes (1): OssService

### Community 164 - "Community 164"
Cohesion: 0.32
Nodes (1): AssetLibraryService

### Community 165 - "Community 165"
Cohesion: 0.39
Nodes (1): ScriptService

### Community 166 - "Community 166"
Cohesion: 0.29
Nodes (1): BridgeProcessManager

### Community 167 - "Community 167"
Cohesion: 0.32
Nodes (3): buildHotTrendExpansionPromptContext(), requestHotTrendStageInsights(), runHotTrendExpansionStage()

### Community 168 - "Community 168"
Cohesion: 0.39
Nodes (5): buildOutfitContextSummary(), buildStep2StylingWarnings(), readOutfitSummaryFromWorkflowState(), requireStep2StylingInputs(), resolveSelectedOutfitImageUrls()

### Community 169 - "Community 169"
Cohesion: 0.43
Nodes (7): buildStoredHotTrendFallback(), buildVideoSyncDeps(), enforceVideoHotTrendTopicFloor(), resolveVideoHotTrendFallbackStrategy(), syncHotTrendAssets(), syncRealtimeHotTrendAssets(), syncVideoHotTrendAssets()

### Community 170 - "Community 170"
Cohesion: 0.25
Nodes (0): 

### Community 171 - "Community 171"
Cohesion: 0.46
Nodes (6): createEmptySnapshot(), generateRealtimeScriptsSnapshot(), generateSnapshotId(), generateVideoScriptsSnapshot(), loadLibraryScriptsSnapshot(), mergeStep3Snapshots()

### Community 172 - "Community 172"
Cohesion: 0.25
Nodes (0): 

### Community 173 - "Community 173"
Cohesion: 0.43
Nodes (5): hasStaticExtension(), isValidSingleSegmentPath(), resolveFrontendShellStaticRequest(), resolveRootStaticFile(), shouldServeFrontendShellPath()

### Community 174 - "Community 174"
Cohesion: 0.39
Nodes (5): buildReverseScriptBasicInfo(), buildReverseScriptFallbackPayload(), buildReverseScriptPrompt(), buildReverseScriptSeed(), normalizeReverseOverviews()

### Community 175 - "Community 175"
Cohesion: 0.32
Nodes (1): ErrorLogService

### Community 176 - "Community 176"
Cohesion: 0.29
Nodes (0): 

### Community 177 - "Community 177"
Cohesion: 0.43
Nodes (5): decryptSecret(), encryptSecret(), hashPassword(), secretKey(), verifyPassword()

### Community 178 - "Community 178"
Cohesion: 0.48
Nodes (5): clampTopN(), mergeTrendRecommendationConfigForHotReload(), normalizeStringArray(), normalizeThresholds(), normalizeTrendRecommendationConfig()

### Community 179 - "Community 179"
Cohesion: 0.29
Nodes (0): 

### Community 180 - "Community 180"
Cohesion: 0.57
Nodes (6): isTechnicalHotTrendTag(), mapLabelTag(), mapSourceTag(), mapSuitabilityTag(), normalizeTextTag(), sanitizeHotTrendTagsForDisplay()

### Community 181 - "Community 181"
Cohesion: 0.33
Nodes (1): ErrorLogCleanupScheduler

### Community 182 - "Community 182"
Cohesion: 0.29
Nodes (1): PgCharacterPreviewRepository

### Community 183 - "Community 183"
Cohesion: 0.29
Nodes (1): PgSquareUserWorkRepository

### Community 184 - "Community 184"
Cohesion: 0.29
Nodes (1): PgFunctionalRouteRepository

### Community 185 - "Community 185"
Cohesion: 0.29
Nodes (1): StoryboardService

### Community 186 - "Community 186"
Cohesion: 0.43
Nodes (2): requireAdmin(), UserAdminService

### Community 187 - "Community 187"
Cohesion: 0.52
Nodes (6): buildOutfitAnalysisPlaceholders(), buildOutfitRecommendationSnapshot(), listOutfitPlansByProject(), normalizeOutfitPlans(), resolveMaxOutfitAnalysisCards(), runOutfitRecommendationTask()

### Community 188 - "Community 188"
Cohesion: 0.29
Nodes (1): VideoJobService

### Community 189 - "Community 189"
Cohesion: 0.43
Nodes (1): ReviewService

### Community 190 - "Community 190"
Cohesion: 0.38
Nodes (2): AdminConfigService, isPositiveInteger()

### Community 191 - "Community 191"
Cohesion: 0.33
Nodes (2): normalizeHotTrendDouyinSourceUrl(), resolveVideoSourceUrl()

### Community 192 - "Community 192"
Cohesion: 0.29
Nodes (0): 

### Community 193 - "Community 193"
Cohesion: 0.48
Nodes (5): generateId(), getLatestStepPrompt(), getStepPromptsByProject(), saveStepPrompt(), table()

### Community 194 - "Community 194"
Cohesion: 0.43
Nodes (4): ensureLogDir(), formatDateTimeForFilename(), getLogConfig(), saveLlmLog()

### Community 195 - "Community 195"
Cohesion: 0.52
Nodes (6): analyzeCharacter(), buildCharacterAnalysisVariables(), buildOutfitSection(), createFallbackCharacterAnalysisReport(), getCurrentSeason(), parseCharacterAnalysisResponse()

### Community 196 - "Community 196"
Cohesion: 0.33
Nodes (2): createS3StorageFromEnv(), readOptionalBoolean()

### Community 197 - "Community 197"
Cohesion: 0.33
Nodes (1): NrmScriptRepository

### Community 198 - "Community 198"
Cohesion: 0.29
Nodes (0): 

### Community 199 - "Community 199"
Cohesion: 0.33
Nodes (2): normalizeDouyinReverseInputUrl(), pickReverseUrlCandidate()

### Community 200 - "Community 200"
Cohesion: 0.33
Nodes (0): 

### Community 201 - "Community 201"
Cohesion: 0.33
Nodes (0): 

### Community 202 - "Community 202"
Cohesion: 0.53
Nodes (4): buildBaseStep2PromptParameterVariants(), collapseWhitespace(), mergeStep2LlmPromptParameterVariants(), normalizeLlmCandidates()

### Community 203 - "Community 203"
Cohesion: 0.4
Nodes (2): assertStep2MinimalSeamContract(), getStep2MinimalSeamEntry()

### Community 204 - "Community 204"
Cohesion: 0.6
Nodes (4): normalizeStep1RemoveBgRequest(), normalizeViewIndex(), toNullableString(), toTrimmedString()

### Community 205 - "Community 205"
Cohesion: 0.47
Nodes (3): compactToken(), isStep1RolePresetTitleLike(), normalizeStep1RolePresetRegion()

### Community 206 - "Community 206"
Cohesion: 0.67
Nodes (4): clamp(), computeSyntheticPendingPercent(), normalizeBackendProgress(), resolveStep2CandidateRuntimeState()

### Community 207 - "Community 207"
Cohesion: 0.33
Nodes (0): 

### Community 208 - "Community 208"
Cohesion: 0.33
Nodes (1): TemplateAdapter

### Community 209 - "Community 209"
Cohesion: 0.4
Nodes (1): HotTrendAdapter

### Community 210 - "Community 210"
Cohesion: 0.33
Nodes (1): UserWorkAdapter

### Community 211 - "Community 211"
Cohesion: 0.47
Nodes (1): VideoMusicService

### Community 212 - "Community 212"
Cohesion: 0.47
Nodes (1): ReverseService

### Community 213 - "Community 213"
Cohesion: 0.53
Nodes (5): clamp01(), clampTopN(), normalizeHotTrendSoftAdScoreToUnit(), selectRealtimeTopNAndRecommendedTopics(), selectTopNAndRecommendedTopics()

### Community 214 - "Community 214"
Cohesion: 0.47
Nodes (3): buildSideAlignmentMarkdown(), buildSideAlignmentRows(), generateSideAlignmentAudit()

### Community 215 - "Community 215"
Cohesion: 0.47
Nodes (4): normalizeLlmSingleImageOutfitResult(), normalizeVideoPromptFrames(), requestLlmSingleImageOutfit(), requestLlmVideoPromptFrames()

### Community 216 - "Community 216"
Cohesion: 0.33
Nodes (1): CharacterService

### Community 217 - "Community 217"
Cohesion: 0.4
Nodes (2): hydrateCharacterViewSessionCandidatesFromStorage(), resolveDressedupProjectIdFromCharacterTags()

### Community 218 - "Community 218"
Cohesion: 0.67
Nodes (5): buildReverseStoryboardLibraryCreateInput(), firstNonEmptyText(), normalizeOptionalText(), normalizeTagList(), truncateText()

### Community 219 - "Community 219"
Cohesion: 0.4
Nodes (1): CreditService

### Community 220 - "Community 220"
Cohesion: 0.47
Nodes (3): buildDoubaoVolcVideoCreateEndpointCandidates(), buildDoubaoVolcVideoQueryEndpointCandidates(), resolveBaseRootsForVolcVideo()

### Community 221 - "Community 221"
Cohesion: 0.6
Nodes (4): isRetryableVideoHotTrendBatchReverseError(), normalizeCode(), normalizeMessage(), runVideoHotTrendBatchReverseWithRetry()

### Community 222 - "Community 222"
Cohesion: 0.33
Nodes (0): 

### Community 223 - "Community 223"
Cohesion: 0.53
Nodes (4): buildHotTrendAssetTags(), buildHotTrendStructuredAsset(), buildRealtimeHotTrendAsset(), buildRealtimeHotTrendAssetTags()

### Community 224 - "Community 224"
Cohesion: 0.6
Nodes (5): analyzeHotspots(), buildHotspotAnalysisVariables(), createEmptyHotspotAnalysisReport(), createFallbackHotspotAnalysisReport(), parseHotspotAnalysisResponse()

### Community 225 - "Community 225"
Cohesion: 0.6
Nodes (5): extractCharacterPreview(), extractHotspots(), extractMatchingReference(), stage1_parseInput(), validateInputCompleteness()

### Community 226 - "Community 226"
Cohesion: 0.33
Nodes (0): 

### Community 227 - "Community 227"
Cohesion: 0.6
Nodes (5): buildReverseScriptBasicInfo(), buildReverseScriptFallbackPayload(), buildReverseScriptPrompt(), buildReverseScriptSeed(), normalizeReverseOverviews()

### Community 228 - "Community 228"
Cohesion: 0.33
Nodes (0): 

### Community 229 - "Community 229"
Cohesion: 0.4
Nodes (1): AppConfigService

### Community 230 - "Community 230"
Cohesion: 0.53
Nodes (4): contentTypeByExtension(), resolveBinaryContentType(), resolveImageContentType(), sniffContentTypeFromBytes()

### Community 231 - "Community 231"
Cohesion: 0.6
Nodes (3): b(), m(), p()

### Community 232 - "Community 232"
Cohesion: 0.6
Nodes (4): applySnapshotRetentionPolicy(), evaluateWorkflowStateSizeBudget(), measureSerializedBytes(), resolveRetentionTimestamp()

### Community 233 - "Community 233"
Cohesion: 0.4
Nodes (0): 

### Community 234 - "Community 234"
Cohesion: 0.5
Nodes (2): assertNonNegativeInteger(), evaluateStep3CandidateSnapshotCreationGuard()

### Community 235 - "Community 235"
Cohesion: 0.6
Nodes (3): cleanText(), firstNonEmptyLine(), resolveStep3PrimaryTitle()

### Community 236 - "Community 236"
Cohesion: 0.4
Nodes (0): 

### Community 237 - "Community 237"
Cohesion: 0.6
Nodes (3): isHealthResponseContractCompatible(), isProviderAuditRecordContractCompatible(), isRecord()

### Community 238 - "Community 238"
Cohesion: 0.6
Nodes (3): isNullableString(), isProjectStepSnapshotEnvelope(), isStringArray()

### Community 239 - "Community 239"
Cohesion: 0.6
Nodes (3): createStep2StaggeredBatchPlan(), normalizePositiveInteger(), normalizeStringList()

### Community 240 - "Community 240"
Cohesion: 0.7
Nodes (4): assertBootstrapSecurityConfigContract(), hasConfiguredValue(), isDevBootstrapDefault(), parseEnvExample()

### Community 241 - "Community 241"
Cohesion: 0.6
Nodes (3): clamp(), computeCandidateProgress(), enforceMonotonicProgress()

### Community 242 - "Community 242"
Cohesion: 0.6
Nodes (3): getDouyinCookieMetaPath(), readDouyinCookieMetadata(), writeDouyinCookieMetadata()

### Community 243 - "Community 243"
Cohesion: 0.4
Nodes (1): UploadService

### Community 244 - "Community 244"
Cohesion: 0.6
Nodes (3): buildOpsApiGovernanceBaselineReport(), summarizeProviderAuditGovernance(), summarizeTrendCacheGovernance()

### Community 245 - "Community 245"
Cohesion: 0.5
Nodes (2): buildReverseVideoUrlPayload(), normalizeText()

### Community 246 - "Community 246"
Cohesion: 0.4
Nodes (0): 

### Community 247 - "Community 247"
Cohesion: 0.7
Nodes (4): buildPortraitCheckHeuristic(), normalizeGender(), normalizePortraitCheckFromLlm(), requestPortraitCheck()

### Community 248 - "Community 248"
Cohesion: 0.8
Nodes (4): buildStep2Phase1OutfitBridge(), findAnalysisCard(), looksEnglishPrompt(), normalizeText()

### Community 249 - "Community 249"
Cohesion: 0.6
Nodes (3): assertSafeStoryboardFrameUrl(), dedupeSafeUrls(), normalizeStoryboardFrameMediaUrls()

### Community 250 - "Community 250"
Cohesion: 0.4
Nodes (1): OutfitService

### Community 251 - "Community 251"
Cohesion: 0.6
Nodes (3): evaluateSideDirectIntegrationDecision(), toLatency(), toRate()

### Community 252 - "Community 252"
Cohesion: 0.5
Nodes (1): SquareService

### Community 253 - "Community 253"
Cohesion: 0.4
Nodes (0): 

### Community 254 - "Community 254"
Cohesion: 0.9
Nodes (4): createLlmDeps(), executeStage4And5WithRetry(), generateStep3Scripts(), generateStep3ScriptsSnapshot()

### Community 255 - "Community 255"
Cohesion: 0.4
Nodes (0): 

### Community 256 - "Community 256"
Cohesion: 0.6
Nodes (3): analyzeMusicMetadataAtmospheres(), analyzeScriptAtmospheres(), normalizeText()

### Community 257 - "Community 257"
Cohesion: 0.7
Nodes (4): normalizePublicBaseUrl(), parseVideoMusicAtmosphereList(), resolveVideoMusicConfig(), uniqueNonEmpty()

### Community 258 - "Community 258"
Cohesion: 0.4
Nodes (0): 

### Community 259 - "Community 259"
Cohesion: 0.4
Nodes (0): 

### Community 260 - "Community 260"
Cohesion: 0.4
Nodes (0): 

### Community 261 - "Community 261"
Cohesion: 0.5
Nodes (2): getSquareTemplateConfig(), registerSquareTemplateStaticFiles()

### Community 262 - "Community 262"
Cohesion: 0.5
Nodes (2): isPlaceholderScriptContent(), unwrapQuotedText()

### Community 263 - "Community 263"
Cohesion: 0.5
Nodes (0): 

### Community 264 - "Community 264"
Cohesion: 0.83
Nodes (3): d(), i(), r()

### Community 265 - "Community 265"
Cohesion: 0.5
Nodes (0): 

### Community 266 - "Community 266"
Cohesion: 0.5
Nodes (1): AppError

### Community 267 - "Community 267"
Cohesion: 0.67
Nodes (2): normalizeStoryboardVideoPromptFrame(), trimText()

### Community 268 - "Community 268"
Cohesion: 0.5
Nodes (0): 

### Community 269 - "Community 269"
Cohesion: 0.5
Nodes (0): 

### Community 270 - "Community 270"
Cohesion: 1.0
Nodes (3): assertFrontendApiDomainContract(), classifyFrontendApiMethods(), resolveFrontendApiDomain()

### Community 271 - "Community 271"
Cohesion: 0.67
Nodes (2): compactUnknownText(), formatLlmDebugTrace()

### Community 272 - "Community 272"
Cohesion: 0.83
Nodes (3): createObjectStorageAdapter(), readOptionalBoolean(), resolveObjectStorageLocalRoot()

### Community 273 - "Community 273"
Cohesion: 0.5
Nodes (0): 

### Community 274 - "Community 274"
Cohesion: 0.83
Nodes (3): buildModelEndpointProbeMarkdown(), compact(), keyOf()

### Community 275 - "Community 275"
Cohesion: 0.83
Nodes (3): buildHotTrendRawDumpMarkdown(), formatEpoch(), renderSection()

### Community 276 - "Community 276"
Cohesion: 0.83
Nodes (3): buildRuntimeDataPublicUrl(), isAllowedRuntimeDataPublicAssetPath(), normalizeRuntimeDataPath()

### Community 277 - "Community 277"
Cohesion: 0.83
Nodes (3): buildGeminiEndpointCandidates(), isYunwuGeminiProviderSource(), stripBaseUrlSuffix()

### Community 278 - "Community 278"
Cohesion: 0.5
Nodes (0): 

### Community 279 - "Community 279"
Cohesion: 0.83
Nodes (3): buildStep4BackendFrameGenerationRequest(), normalizeStep4StoredFrameGenerationInput(), trimText()

### Community 280 - "Community 280"
Cohesion: 0.5
Nodes (0): 

### Community 281 - "Community 281"
Cohesion: 0.5
Nodes (0): 

### Community 282 - "Community 282"
Cohesion: 0.5
Nodes (0): 

### Community 283 - "Community 283"
Cohesion: 0.67
Nodes (2): createEmptyCharacterAnalysisReport(), getCurrentSeason()

### Community 284 - "Community 284"
Cohesion: 0.5
Nodes (0): 

### Community 285 - "Community 285"
Cohesion: 0.83
Nodes (3): buildCacheKey(), createEmptyHotspotAnalysisReport(), stage2_analyzeHotspots()

### Community 286 - "Community 286"
Cohesion: 0.83
Nodes (3): buildRewriteInput(), parseLLMResponse(), rewriteLibraryScriptWithLLM()

### Community 287 - "Community 287"
Cohesion: 0.5
Nodes (0): 

### Community 288 - "Community 288"
Cohesion: 0.67
Nodes (2): generateImageToVideoVideos(), generateSingleImageVideo()

### Community 289 - "Community 289"
Cohesion: 0.5
Nodes (0): 

### Community 290 - "Community 290"
Cohesion: 0.67
Nodes (2): buildProjectStepState(), pickProjectStepState()

### Community 291 - "Community 291"
Cohesion: 0.67
Nodes (2): createCharacterFiveViewHandlers(), registerCharacterFiveViewRoutes()

### Community 292 - "Community 292"
Cohesion: 0.67
Nodes (2): createGarmentAssetHandlers(), registerGarmentAssetRoutes()

### Community 293 - "Community 293"
Cohesion: 0.67
Nodes (2): buildStsCredentialResponse(), getStsCredentialRoute()

### Community 294 - "Community 294"
Cohesion: 0.5
Nodes (0): 

### Community 295 - "Community 295"
Cohesion: 0.83
Nodes (3): getBearerToken(), requireAdmin(), requireUser()

### Community 296 - "Community 296"
Cohesion: 0.67
Nodes (0): 

### Community 297 - "Community 297"
Cohesion: 0.67
Nodes (0): 

### Community 298 - "Community 298"
Cohesion: 0.67
Nodes (2): OSS, STS

### Community 299 - "Community 299"
Cohesion: 0.67
Nodes (0): 

### Community 300 - "Community 300"
Cohesion: 1.0
Nodes (2): buildStep1CardTestId(), isStep1SelectableCardDomContract()

### Community 301 - "Community 301"
Cohesion: 1.0
Nodes (2): assertRuntimePlaceholderPolicyContract(), uniqueCount()

### Community 302 - "Community 302"
Cohesion: 1.0
Nodes (2): assertEnvAliasShape(), assertRuntimeConfigInjectionContract()

### Community 303 - "Community 303"
Cohesion: 0.67
Nodes (0): 

### Community 304 - "Community 304"
Cohesion: 1.0
Nodes (2): isFunctionalKey(), parseFunctionalKey()

### Community 305 - "Community 305"
Cohesion: 1.0
Nodes (2): normalizeProjectFlowStep(), resolveProjectLastStep()

### Community 306 - "Community 306"
Cohesion: 0.67
Nodes (0): 

### Community 307 - "Community 307"
Cohesion: 1.0
Nodes (2): compressVideoForLlm(), executeCommand()

### Community 308 - "Community 308"
Cohesion: 0.67
Nodes (0): 

### Community 309 - "Community 309"
Cohesion: 0.67
Nodes (0): 

### Community 310 - "Community 310"
Cohesion: 0.67
Nodes (0): 

### Community 311 - "Community 311"
Cohesion: 1.0
Nodes (2): createOssAdapterFromConfig(), hasValidOssConfig()

### Community 312 - "Community 312"
Cohesion: 1.0
Nodes (2): buildStep1ImageClothingGuardResponse(), isStep1ClothingClassificationCategory()

### Community 313 - "Community 313"
Cohesion: 1.0
Nodes (2): pickOutfitAnalysisSeedAssets(), rankOutfitAnalysisSeedAssets()

### Community 314 - "Community 314"
Cohesion: 1.0
Nodes (2): buildRoleDirectionPrompt(), runStep1RoleDirectionGeneration()

### Community 315 - "Community 315"
Cohesion: 1.0
Nodes (2): normalizeRuntimeDataPath(), resolveRuntimeDataPublicAssetFilePath()

### Community 316 - "Community 316"
Cohesion: 1.0
Nodes (2): buildUrlReverseAuditMarkdown(), truncate()

### Community 317 - "Community 317"
Cohesion: 0.67
Nodes (0): 

### Community 318 - "Community 318"
Cohesion: 0.67
Nodes (0): 

### Community 319 - "Community 319"
Cohesion: 0.67
Nodes (0): 

### Community 320 - "Community 320"
Cohesion: 0.67
Nodes (0): 

### Community 321 - "Community 321"
Cohesion: 1.0
Nodes (2): generateSingleVideo(), generateStoryboardVideos()

### Community 322 - "Community 322"
Cohesion: 0.67
Nodes (0): 

### Community 323 - "Community 323"
Cohesion: 0.67
Nodes (0): 

### Community 324 - "Community 324"
Cohesion: 0.67
Nodes (0): 

### Community 325 - "Community 325"
Cohesion: 0.67
Nodes (0): 

### Community 326 - "Community 326"
Cohesion: 1.0
Nodes (2): createProjectGarmentAssocHandlers(), registerProjectGarmentAssocRoutes()

### Community 327 - "Community 327"
Cohesion: 0.67
Nodes (0): 

### Community 328 - "Community 328"
Cohesion: 0.67
Nodes (0): 

### Community 329 - "Community 329"
Cohesion: 0.67
Nodes (0): 

### Community 330 - "Community 330"
Cohesion: 0.67
Nodes (0): 

### Community 331 - "Community 331"
Cohesion: 0.67
Nodes (0): 

### Community 332 - "Community 332"
Cohesion: 0.67
Nodes (0): 

### Community 333 - "Community 333"
Cohesion: 0.67
Nodes (3): 热点深度分析器提示词, 短视频脚本创作提示词, 分镜提示词工程师提示词

### Community 334 - "Community 334"
Cohesion: 0.67
Nodes (3): Male Avatar 01, Male Avatar Category, Step1 Role Selection UI

### Community 335 - "Community 335"
Cohesion: 2.0
Nodes (0): 

### Community 336 - "Community 336"
Cohesion: 1.0
Nodes (0): 

### Community 337 - "Community 337"
Cohesion: 1.0
Nodes (0): 

### Community 338 - "Community 338"
Cohesion: 1.0
Nodes (0): 

### Community 339 - "Community 339"
Cohesion: 1.0
Nodes (0): 

### Community 340 - "Community 340"
Cohesion: 1.0
Nodes (0): 

### Community 341 - "Community 341"
Cohesion: 1.0
Nodes (0): 

### Community 342 - "Community 342"
Cohesion: 1.0
Nodes (0): 

### Community 343 - "Community 343"
Cohesion: 1.0
Nodes (0): 

### Community 344 - "Community 344"
Cohesion: 1.0
Nodes (0): 

### Community 345 - "Community 345"
Cohesion: 1.0
Nodes (0): 

### Community 346 - "Community 346"
Cohesion: 1.0
Nodes (0): 

### Community 347 - "Community 347"
Cohesion: 1.0
Nodes (0): 

### Community 348 - "Community 348"
Cohesion: 1.0
Nodes (0): 

### Community 349 - "Community 349"
Cohesion: 1.0
Nodes (0): 

### Community 350 - "Community 350"
Cohesion: 1.0
Nodes (0): 

### Community 351 - "Community 351"
Cohesion: 1.0
Nodes (0): 

### Community 352 - "Community 352"
Cohesion: 1.0
Nodes (0): 

### Community 353 - "Community 353"
Cohesion: 1.0
Nodes (0): 

### Community 354 - "Community 354"
Cohesion: 1.0
Nodes (0): 

### Community 355 - "Community 355"
Cohesion: 1.0
Nodes (0): 

### Community 356 - "Community 356"
Cohesion: 1.0
Nodes (0): 

### Community 357 - "Community 357"
Cohesion: 1.0
Nodes (0): 

### Community 358 - "Community 358"
Cohesion: 1.0
Nodes (0): 

### Community 359 - "Community 359"
Cohesion: 1.0
Nodes (0): 

### Community 360 - "Community 360"
Cohesion: 1.0
Nodes (0): 

### Community 361 - "Community 361"
Cohesion: 1.0
Nodes (0): 

### Community 362 - "Community 362"
Cohesion: 1.0
Nodes (0): 

### Community 363 - "Community 363"
Cohesion: 1.0
Nodes (0): 

### Community 364 - "Community 364"
Cohesion: 1.0
Nodes (0): 

### Community 365 - "Community 365"
Cohesion: 1.0
Nodes (0): 

### Community 366 - "Community 366"
Cohesion: 1.0
Nodes (0): 

### Community 367 - "Community 367"
Cohesion: 1.0
Nodes (0): 

### Community 368 - "Community 368"
Cohesion: 1.0
Nodes (0): 

### Community 369 - "Community 369"
Cohesion: 1.0
Nodes (0): 

### Community 370 - "Community 370"
Cohesion: 1.0
Nodes (0): 

### Community 371 - "Community 371"
Cohesion: 1.0
Nodes (0): 

### Community 372 - "Community 372"
Cohesion: 1.0
Nodes (0): 

### Community 373 - "Community 373"
Cohesion: 1.0
Nodes (0): 

### Community 374 - "Community 374"
Cohesion: 1.0
Nodes (0): 

### Community 375 - "Community 375"
Cohesion: 1.0
Nodes (0): 

### Community 376 - "Community 376"
Cohesion: 1.0
Nodes (0): 

### Community 377 - "Community 377"
Cohesion: 1.0
Nodes (0): 

### Community 378 - "Community 378"
Cohesion: 1.0
Nodes (0): 

### Community 379 - "Community 379"
Cohesion: 1.0
Nodes (0): 

### Community 380 - "Community 380"
Cohesion: 1.0
Nodes (0): 

### Community 381 - "Community 381"
Cohesion: 1.0
Nodes (0): 

### Community 382 - "Community 382"
Cohesion: 1.0
Nodes (0): 

### Community 383 - "Community 383"
Cohesion: 1.0
Nodes (0): 

### Community 384 - "Community 384"
Cohesion: 1.0
Nodes (0): 

### Community 385 - "Community 385"
Cohesion: 1.0
Nodes (0): 

### Community 386 - "Community 386"
Cohesion: 1.0
Nodes (0): 

### Community 387 - "Community 387"
Cohesion: 1.0
Nodes (0): 

### Community 388 - "Community 388"
Cohesion: 1.0
Nodes (0): 

### Community 389 - "Community 389"
Cohesion: 1.0
Nodes (0): 

### Community 390 - "Community 390"
Cohesion: 1.0
Nodes (0): 

### Community 391 - "Community 391"
Cohesion: 1.0
Nodes (0): 

### Community 392 - "Community 392"
Cohesion: 1.0
Nodes (0): 

### Community 393 - "Community 393"
Cohesion: 1.0
Nodes (0): 

### Community 394 - "Community 394"
Cohesion: 1.0
Nodes (0): 

### Community 395 - "Community 395"
Cohesion: 1.0
Nodes (0): 

### Community 396 - "Community 396"
Cohesion: 1.0
Nodes (0): 

### Community 397 - "Community 397"
Cohesion: 1.0
Nodes (0): 

### Community 398 - "Community 398"
Cohesion: 1.0
Nodes (0): 

### Community 399 - "Community 399"
Cohesion: 1.0
Nodes (0): 

### Community 400 - "Community 400"
Cohesion: 1.0
Nodes (0): 

### Community 401 - "Community 401"
Cohesion: 1.0
Nodes (0): 

### Community 402 - "Community 402"
Cohesion: 1.0
Nodes (0): 

### Community 403 - "Community 403"
Cohesion: 1.0
Nodes (0): 

### Community 404 - "Community 404"
Cohesion: 1.0
Nodes (0): 

### Community 405 - "Community 405"
Cohesion: 1.0
Nodes (0): 

### Community 406 - "Community 406"
Cohesion: 1.0
Nodes (0): 

### Community 407 - "Community 407"
Cohesion: 1.0
Nodes (0): 

### Community 408 - "Community 408"
Cohesion: 1.0
Nodes (0): 

### Community 409 - "Community 409"
Cohesion: 1.0
Nodes (0): 

### Community 410 - "Community 410"
Cohesion: 1.0
Nodes (0): 

### Community 411 - "Community 411"
Cohesion: 1.0
Nodes (0): 

### Community 412 - "Community 412"
Cohesion: 1.0
Nodes (0): 

### Community 413 - "Community 413"
Cohesion: 1.0
Nodes (0): 

### Community 414 - "Community 414"
Cohesion: 1.0
Nodes (0): 

### Community 415 - "Community 415"
Cohesion: 1.0
Nodes (0): 

### Community 416 - "Community 416"
Cohesion: 1.0
Nodes (0): 

### Community 417 - "Community 417"
Cohesion: 1.0
Nodes (0): 

### Community 418 - "Community 418"
Cohesion: 1.0
Nodes (0): 

### Community 419 - "Community 419"
Cohesion: 1.0
Nodes (0): 

### Community 420 - "Community 420"
Cohesion: 1.0
Nodes (0): 

### Community 421 - "Community 421"
Cohesion: 1.0
Nodes (2): app.ts Constraint, AppShell Extension Registration

### Community 422 - "Community 422"
Cohesion: 1.0
Nodes (2): Garment Asset Merge Plan, nrm_garment_assets Table

### Community 423 - "Community 423"
Cohesion: 1.0
Nodes (2): Female Avatar Category, Female Avatar 01

### Community 424 - "Community 424"
Cohesion: 1.0
Nodes (0): 

### Community 425 - "Community 425"
Cohesion: 1.0
Nodes (0): 

### Community 426 - "Community 426"
Cohesion: 1.0
Nodes (0): 

### Community 427 - "Community 427"
Cohesion: 1.0
Nodes (0): 

### Community 428 - "Community 428"
Cohesion: 1.0
Nodes (0): 

### Community 429 - "Community 429"
Cohesion: 1.0
Nodes (0): 

### Community 430 - "Community 430"
Cohesion: 1.0
Nodes (0): 

### Community 431 - "Community 431"
Cohesion: 1.0
Nodes (0): 

### Community 432 - "Community 432"
Cohesion: 1.0
Nodes (0): 

### Community 433 - "Community 433"
Cohesion: 1.0
Nodes (0): 

### Community 434 - "Community 434"
Cohesion: 1.0
Nodes (0): 

### Community 435 - "Community 435"
Cohesion: 1.0
Nodes (0): 

### Community 436 - "Community 436"
Cohesion: 1.0
Nodes (0): 

### Community 437 - "Community 437"
Cohesion: 1.0
Nodes (0): 

### Community 438 - "Community 438"
Cohesion: 1.0
Nodes (0): 

### Community 439 - "Community 439"
Cohesion: 1.0
Nodes (0): 

### Community 440 - "Community 440"
Cohesion: 1.0
Nodes (0): 

### Community 441 - "Community 441"
Cohesion: 1.0
Nodes (0): 

### Community 442 - "Community 442"
Cohesion: 1.0
Nodes (0): 

### Community 443 - "Community 443"
Cohesion: 1.0
Nodes (0): 

### Community 444 - "Community 444"
Cohesion: 1.0
Nodes (0): 

### Community 445 - "Community 445"
Cohesion: 1.0
Nodes (0): 

### Community 446 - "Community 446"
Cohesion: 1.0
Nodes (0): 

### Community 447 - "Community 447"
Cohesion: 1.0
Nodes (0): 

### Community 448 - "Community 448"
Cohesion: 1.0
Nodes (0): 

### Community 449 - "Community 449"
Cohesion: 1.0
Nodes (0): 

### Community 450 - "Community 450"
Cohesion: 1.0
Nodes (0): 

### Community 451 - "Community 451"
Cohesion: 1.0
Nodes (0): 

### Community 452 - "Community 452"
Cohesion: 1.0
Nodes (0): 

### Community 453 - "Community 453"
Cohesion: 1.0
Nodes (0): 

### Community 454 - "Community 454"
Cohesion: 1.0
Nodes (0): 

### Community 455 - "Community 455"
Cohesion: 1.0
Nodes (0): 

### Community 456 - "Community 456"
Cohesion: 1.0
Nodes (0): 

### Community 457 - "Community 457"
Cohesion: 1.0
Nodes (0): 

### Community 458 - "Community 458"
Cohesion: 1.0
Nodes (0): 

### Community 459 - "Community 459"
Cohesion: 1.0
Nodes (0): 

### Community 460 - "Community 460"
Cohesion: 1.0
Nodes (0): 

### Community 461 - "Community 461"
Cohesion: 1.0
Nodes (0): 

### Community 462 - "Community 462"
Cohesion: 1.0
Nodes (0): 

### Community 463 - "Community 463"
Cohesion: 1.0
Nodes (0): 

### Community 464 - "Community 464"
Cohesion: 1.0
Nodes (0): 

### Community 465 - "Community 465"
Cohesion: 1.0
Nodes (0): 

### Community 466 - "Community 466"
Cohesion: 1.0
Nodes (0): 

### Community 467 - "Community 467"
Cohesion: 1.0
Nodes (0): 

### Community 468 - "Community 468"
Cohesion: 1.0
Nodes (0): 

### Community 469 - "Community 469"
Cohesion: 1.0
Nodes (0): 

### Community 470 - "Community 470"
Cohesion: 1.0
Nodes (0): 

### Community 471 - "Community 471"
Cohesion: 1.0
Nodes (0): 

### Community 472 - "Community 472"
Cohesion: 1.0
Nodes (0): 

### Community 473 - "Community 473"
Cohesion: 1.0
Nodes (0): 

### Community 474 - "Community 474"
Cohesion: 1.0
Nodes (0): 

### Community 475 - "Community 475"
Cohesion: 1.0
Nodes (0): 

### Community 476 - "Community 476"
Cohesion: 1.0
Nodes (1): Repository Pattern

### Community 477 - "Community 477"
Cohesion: 1.0
Nodes (1): nrm_ Table Prefix

### Community 478 - "Community 478"
Cohesion: 1.0
Nodes (1): Prompt Markdown Format

### Community 479 - "Community 479"
Cohesion: 1.0
Nodes (1): Frozen Registrars

### Community 480 - "Community 480"
Cohesion: 1.0
Nodes (1): extraRegistrars Mechanism

### Community 481 - "Community 481"
Cohesion: 1.0
Nodes (1): nrm_project_garment_assoc Table

### Community 482 - "Community 482"
Cohesion: 1.0
Nodes (1): nrm_script_data Table

### Community 483 - "Community 483"
Cohesion: 1.0
Nodes (1): Frontend Automation Testing

### Community 484 - "Community 484"
Cohesion: 1.0
Nodes (1): Playwright

### Community 485 - "Community 485"
Cohesion: 1.0
Nodes (1): Douyin Publish Integration

### Community 486 - "Community 486"
Cohesion: 1.0
Nodes (1): Python Bridge Script

### Community 487 - "Community 487"
Cohesion: 1.0
Nodes (1): DouYinVideo Class

### Community 488 - "Community 488"
Cohesion: 1.0
Nodes (1): social-auto-upload

### Community 489 - "Community 489"
Cohesion: 1.0
Nodes (1): nrm_error_logs Table

### Community 490 - "Community 490"
Cohesion: 1.0
Nodes (1): TypeScript 5.9

### Community 491 - "Community 491"
Cohesion: 1.0
Nodes (1): Vite 6

### Community 492 - "Community 492"
Cohesion: 1.0
Nodes (1): Contract-based Type Definitions

### Community 493 - "Community 493"
Cohesion: 1.0
Nodes (1): Soft Delete Pattern

### Community 494 - "Community 494"
Cohesion: 1.0
Nodes (1): Route Registration Pattern

### Community 495 - "Community 495"
Cohesion: 1.0
Nodes (1): Service-oriented Modules

### Community 496 - "Community 496"
Cohesion: 1.0
Nodes (1): LLM Error Handling Principle

### Community 497 - "Community 497"
Cohesion: 1.0
Nodes (1): No Degradation Handling Principle

### Community 498 - "Community 498"
Cohesion: 1.0
Nodes (1): GarmentAssetRepository

### Community 499 - "Community 499"
Cohesion: 1.0
Nodes (1): ProjectGarmentAssocRepository

### Community 500 - "Community 500"
Cohesion: 1.0
Nodes (1): Test Layers (L0-L5)

### Community 501 - "Community 501"
Cohesion: 1.0
Nodes (1): useProjectPersistence Hook

### Community 502 - "Community 502"
Cohesion: 1.0
Nodes (1): SaveStatusIndicator组件

### Community 503 - "Community 503"
Cohesion: 1.0
Nodes (1): 混合自动保存机制

### Community 504 - "Community 504"
Cohesion: 1.0
Nodes (1): 分镜脚本角色改写器提示词

### Community 505 - "Community 505"
Cohesion: 1.0
Nodes (1): Website Favicon/Icon

### Community 506 - "Community 506"
Cohesion: 1.0
Nodes (1): Brand Logo

### Community 507 - "Community 507"
Cohesion: 1.0
Nodes (1): Login Page Background

### Community 508 - "Community 508"
Cohesion: 1.0
Nodes (1): Step 2 Progress Loading Poster

## Knowledge Gaps
- **54 isolated node(s):** `C5: Shared compatibility layer for social-auto-upload.  Handles:   - sys.path in`, `Add social-auto-upload to sys.path and inject a compatible `conf` module.      C`, `STS`, `OSS`, `Six-Step Workflow` (+49 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 335`** (2 nodes): `step2-left-panel-master-prompt-editor-q8ZlDCN-.js`, `a()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 336`** (2 nodes): `vite.config.ts`, `excludeBackendModules()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 337`** (2 nodes): `AttachmentIconButton.tsx`, `AttachmentIconButton()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 338`** (2 nodes): `step1RoleConfirmDirectEnter.ts`, `resolveStep1RoleConfirmDirectEnter()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 339`** (2 nodes): `step5LegacyRouteBridge.ts`, `resolveStep5LegacyRouteTarget()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 340`** (2 nodes): `reverseStoryboardSuccessPlan.ts`, `buildReverseStoryboardSuccessPlan()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 341`** (2 nodes): `backendApi.step3ScriptGeneration.ts`, `requestStep3ScriptGeneration()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 342`** (2 nodes): `hot-trend.ts`, `hotTrendScriptCandidates()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 343`** (2 nodes): `server-graceful-shutdown.ts`, `registerGracefulShutdownHandlers()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 344`** (2 nodes): `server.ts`, `main()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 345`** (2 nodes): `app-context.ts`, `createAppContext()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 346`** (2 nodes): `setup-swagger.ts`, `setupSwagger()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 347`** (2 nodes): `preview-isolation-persistence-compat-contract.ts`, `assertPreviewIsolationPersistenceCompat()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 348`** (2 nodes): `douyin-integration-split-contract.ts`, `assertDouyinIntegrationSplitContract()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 349`** (2 nodes): `admin-ia-image-center-contract.ts`, `assertAdminIaImageCenterContract()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 350`** (2 nodes): `outfit-analysis-request.ts`, `isOutfitRecommendationSelectionContract()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 351`** (2 nodes): `step2-layout.ts`, `isStep2LayoutContractShape()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 352`** (2 nodes): `llm-debug-bubble.ts`, `isLlmDebugBubbleSnapshot()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 353`** (2 nodes): `step1-selection.ts`, `isStep1SelectionContractState()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 354`** (2 nodes): `all-in-one-five-view-generation-contract.ts`, `assertAllInOneFiveViewContract()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 355`** (2 nodes): `step2-copy-cleanup-contract.ts`, `assertStep2CopyCleanupContract()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 356`** (2 nodes): `preview-isolation-doublezoom-contract.ts`, `assertPreviewIsolationDoubleZoom()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 357`** (2 nodes): `hot-trend-fetch-config.ts`, `isHotTrendRuntimeConfigCompliant()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 358`** (2 nodes): `hash-util.ts`, `hashJsonString()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 359`** (2 nodes): `prompt-persistence.ts`, `withPromptTransaction()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 360`** (2 nodes): `hot-trend-db-operations.ts`, `createHotTrendDbOperations()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 361`** (2 nodes): `setup-core.ts`, `setupCore()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 362`** (2 nodes): `setup-hot-trend.ts`, `setupHotTrend()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 363`** (2 nodes): `setup-error-log.ts`, `setupErrorLog()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 364`** (2 nodes): `setup-routes.ts`, `setupRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 365`** (2 nodes): `setup-hot-trend-sync-engine.ts`, `createHotTrendSyncEngineSetup()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 366`** (2 nodes): `setup-outfit.ts`, `setupOutfit()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 367`** (2 nodes): `review-publish-request.ts`, `normalizeReviewPublishRequestPayload()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 368`** (2 nodes): `hot-trend-sync.ts`, `createHotTrendSyncEngine()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 369`** (2 nodes): `character-five-view-generation-service.ts`, `generateCharacterFiveView()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 370`** (2 nodes): `trend-topic-normalizer.ts`, `shouldSelectVideoHotTrendBatchReverseCandidate()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 371`** (2 nodes): `side-capability-smoke-report.ts`, `buildSideCapabilitySmokeMarkdown()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 372`** (2 nodes): `video-url-resolver.ts`, `createVideoUrlResolver()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 373`** (2 nodes): `step4-initial-generation-route-bridge.ts`, `normalizeStep4InitialGenerationRouteFrame()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 374`** (2 nodes): `adapter-factory.ts`, `createAdapterFactory()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 375`** (2 nodes): `fetch.ts`, `fetchDouyinHotHubTrends()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 376`** (2 nodes): `step1-context-extractor.ts`, `extractStep1Context()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 377`** (2 nodes): `stage4-script-creator.ts`, `stage4_createScripts()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 378`** (2 nodes): `library-filter.ts`, `filterLibraryScripts()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 379`** (2 nodes): `library-fetcher.ts`, `fetchLibraryScriptsFromSource()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 380`** (2 nodes): `source-fetcher.ts`, `fetchVideoScriptsFromSource()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 381`** (2 nodes): `prompt.ts`, `buildVideoStoryboardPrompt()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 382`** (2 nodes): `single-reverse-service.ts`, `runSingleVideoLlmReverse()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 383`** (2 nodes): `fission-video-config.ts`, `calculateProgress()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 384`** (2 nodes): `normalize-output.ts`, `normalizeLlmReverseOutput()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 385`** (2 nodes): `batch-reverse-adapter.ts`, `createBatchReverseAdapter()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 386`** (2 nodes): `unified-reverse-core.ts`, `runCoreReversePipeline()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 387`** (2 nodes): `step3-candidate-helpers.ts`, `createStep3Helpers()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 388`** (2 nodes): `admin-deleted-data-handlers.ts`, `createAdminDeletedDataHandlers()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 389`** (2 nodes): `square-routes.ts`, `registerSquareRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 390`** (2 nodes): `square-publish-routes.ts`, `registerSquarePublishRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 391`** (2 nodes): `square-aggregate-routes.ts`, `registerSquareAggregateRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 392`** (2 nodes): `app-shell-thin-entry.ts`, `registerAppShellThinEntry()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 393`** (2 nodes): `script-routes.ts`, `registerScriptRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 394`** (2 nodes): `admin-deleted-data-routes.ts`, `registerAdminDeletedDataRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 395`** (2 nodes): `app-shell-handlers.ts`, `createAppShellHandlers()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 396`** (2 nodes): `auth-routes.ts`, `registerAuthRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 397`** (2 nodes): `library-routes.ts`, `registerLibraryRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 398`** (2 nodes): `video-api-routes.ts`, `registerVideoApiRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 399`** (2 nodes): `prompt-routes.ts`, `registerPromptRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 400`** (2 nodes): `admin-model-preset-routes.ts`, `registerAdminModelPresetRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 401`** (2 nodes): `review-routes.ts`, `registerReviewRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 402`** (2 nodes): `my-library-routes.ts`, `registerMyLibraryRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 403`** (2 nodes): `project-export-route.ts`, `handleProjectExportRoute()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 404`** (2 nodes): `user-routes.ts`, `registerUserRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 405`** (2 nodes): `admin-helpers.ts`, `toAdminScriptItem()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 406`** (2 nodes): `square-admin-routes.ts`, `registerSquareAdminRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 407`** (2 nodes): `project-route-deps.ts`, `buildProjectRouteDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 408`** (2 nodes): `admin-library-provider-routes.ts`, `registerAdminProviderRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 409`** (2 nodes): `project-flow-routes.ts`, `registerProjectFlowRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 410`** (2 nodes): `api-registration.ts`, `registerApiRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 411`** (2 nodes): `admin-routes.ts`, `registerAdminRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 412`** (2 nodes): `admin-functional-route-routes.ts`, `registerFunctionalRouteRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 413`** (2 nodes): `static-routes.ts`, `registerStaticRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 414`** (2 nodes): `error-log-routes.ts`, `registerErrorLogRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 415`** (2 nodes): `capability-lab-routes.ts`, `registerAdminCapabilityLabRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 416`** (2 nodes): `provider-routes.ts`, `registerAdminProviderRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 417`** (2 nodes): `credit-audits-route.ts`, `registerAdminCreditAuditsRoute()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 418`** (2 nodes): `users-routes.ts`, `registerAdminUsersRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 419`** (2 nodes): `llm-prompt-rewrite.ts`, `requestLlmPromptRewrite()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 420`** (2 nodes): `llm-outfit-optimize.ts`, `requestLlmOptimizeOutfitPrompt()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 421`** (2 nodes): `app.ts Constraint`, `AppShell Extension Registration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 422`** (2 nodes): `Garment Asset Merge Plan`, `nrm_garment_assets Table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 423`** (2 nodes): `Female Avatar Category`, `Female Avatar 01`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 424`** (1 nodes): `safeBottomPadding-BjdHPxsp.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 425`** (1 nodes): `projectFlowMediaLayerGuard-Bh1uacEC.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 426`** (1 nodes): `backendApi.step3SimpleBatchControl.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 427`** (1 nodes): `app-exports.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 428`** (1 nodes): `recommendation-adapter-contract.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 429`** (1 nodes): `douyin-integration.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 430`** (1 nodes): `error-log-contract.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 431`** (1 nodes): `llm-types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 432`** (1 nodes): `shot-prompt-engineer-contract.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 433`** (1 nodes): `douyin-publish-contract.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 434`** (1 nodes): `provider-route-contract.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 435`** (1 nodes): `video-hot-trend-sync-contract.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 436`** (1 nodes): `realtime-hot-trend-sync-contract.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 437`** (1 nodes): `douyin-publish-history-contract.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 438`** (1 nodes): `fastify.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 439`** (1 nodes): `prompt-template-contract.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 440`** (1 nodes): `repository-port-narrowing.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 441`** (1 nodes): `hot-trend-constants.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 442`** (1 nodes): `persistence.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 443`** (1 nodes): `douyin-auth-contract.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 444`** (1 nodes): `services.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 445`** (1 nodes): `hot-trend-base.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 446`** (1 nodes): `object-storage.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 447`** (1 nodes): `trend-repository.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 448`** (1 nodes): `script-repository.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 449`** (1 nodes): `system-repository.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 450`** (1 nodes): `garment-repository.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 451`** (1 nodes): `character-repository.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 452`** (1 nodes): `video-job-repository.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 453`** (1 nodes): `project-repository.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 454`** (1 nodes): `review-repository.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 455`** (1 nodes): `reverse-repository.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 456`** (1 nodes): `common.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 457`** (1 nodes): `user-repository.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 458`** (1 nodes): `credit-repository.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 459`** (1 nodes): `library-repository.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 460`** (1 nodes): `storyboard-repository.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 461`** (1 nodes): `provider-repository.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 462`** (1 nodes): `theme-repository.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 463`** (1 nodes): `asset-repository.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 464`** (1 nodes): `recommend-config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 465`** (1 nodes): `square-template-paths.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 466`** (1 nodes): `shared_dict.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 467`** (1 nodes): `app-services.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 468`** (1 nodes): `external-api-resolver.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 469`** (1 nodes): `orchestrator.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 470`** (1 nodes): `reverse-fetch-adapters.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 471`** (1 nodes): `step-prompt.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 472`** (1 nodes): `deps.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 473`** (1 nodes): `unified-reverse-deps.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 474`** (1 nodes): `square-route-adapter.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 475`** (1 nodes): `project-route-shared.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 476`** (1 nodes): `Repository Pattern`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 477`** (1 nodes): `nrm_ Table Prefix`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 478`** (1 nodes): `Prompt Markdown Format`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 479`** (1 nodes): `Frozen Registrars`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 480`** (1 nodes): `extraRegistrars Mechanism`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 481`** (1 nodes): `nrm_project_garment_assoc Table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 482`** (1 nodes): `nrm_script_data Table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 483`** (1 nodes): `Frontend Automation Testing`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 484`** (1 nodes): `Playwright`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 485`** (1 nodes): `Douyin Publish Integration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 486`** (1 nodes): `Python Bridge Script`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 487`** (1 nodes): `DouYinVideo Class`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 488`** (1 nodes): `social-auto-upload`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 489`** (1 nodes): `nrm_error_logs Table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 490`** (1 nodes): `TypeScript 5.9`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 491`** (1 nodes): `Vite 6`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 492`** (1 nodes): `Contract-based Type Definitions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 493`** (1 nodes): `Soft Delete Pattern`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 494`** (1 nodes): `Route Registration Pattern`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 495`** (1 nodes): `Service-oriented Modules`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 496`** (1 nodes): `LLM Error Handling Principle`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 497`** (1 nodes): `No Degradation Handling Principle`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 498`** (1 nodes): `GarmentAssetRepository`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 499`** (1 nodes): `ProjectGarmentAssocRepository`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 500`** (1 nodes): `Test Layers (L0-L5)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 501`** (1 nodes): `useProjectPersistence Hook`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 502`** (1 nodes): `SaveStatusIndicator组件`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 503`** (1 nodes): `混合自动保存机制`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 504`** (1 nodes): `分镜脚本角色改写器提示词`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 505`** (1 nodes): `Website Favicon/Icon`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 506`** (1 nodes): `Brand Logo`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 507`** (1 nodes): `Login Page Background`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 508`** (1 nodes): `Step 2 Progress Loading Poster`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `js()` connect `Asset Library UI` to `Prompt Management Panel`, `Community 37`, `Step3 Workspace Route`, `Community 44`, `Route Index Handlers`, `Step1 Shared Components`, `Step2 Quick Create Modal`, `Project Flow Logic`, `Prompt System`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `Js()` connect `Asset Library UI` to `Prompt Management Panel`, `Community 37`, `Step3 Workspace Route`, `Community 42`, `Community 44`, `Community 109`, `Route Index Handlers`, `Step1 Shared Components`, `Step2 Quick Create Modal`, `Project Flow Logic`, `Prompt System`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `nE` connect `Prompt Panel Functions` to `Prompt Management Panel`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `nE` (e.g. with `ph()` and `l1()`) actually correct?**
  _`nE` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `Jr()` (e.g. with `sm()` and `om()`) actually correct?**
  _`Jr()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 42 inferred relationships involving `zE()` (e.g. with `._startTagOutsideForeignContent()` and `._endTagOutsideForeignContent()`) actually correct?**
  _`zE()` has 42 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `lE` (e.g. with `.shortenToLength()` and `._isSpecialElement()`) actually correct?**
  _`lE` has 4 INFERRED edges - model-reasoned connections that need verification._