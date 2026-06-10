export const FRONTEND_API_DOMAIN_CONTRACT_VERSION = "AT28-14.v1";

export type FrontendApiDomainId =
  | "auth_account"
  | "project_flow"
  | "video_pipeline"
  | "reverse_square"
  | "admin_console"
  | "library_assets"
  | "library_characters"
  | "library_scripts"
  | "reverse_storyboard_library";

export interface FrontendApiDomainContractEntry {
  readonly domainId: FrontendApiDomainId;
  readonly description: string;
  readonly requiredMethods: readonly string[];
}

export const FRONTEND_API_DOMAIN_CONTRACT: readonly FrontendApiDomainContractEntry[] = [
  {
    domainId: "auth_account",
    description: "Authentication/profile account operations and user-side credit/script profile reads.",
    requiredMethods: ["register", "login", "loadCredits", "loadPrivateScripts", "changePassword"],
  },
  {
    domainId: "project_flow",
    description: "Step1-Step4 project workflow operations and project lifecycle APIs.",
    requiredMethods: [
      "createProject",
      "projectResumeSnapshot",
      "step1ClassifyImage",
      "step1RemoveBg",
      "recommendOutfits",
      "generateScript",
      "generateStoryboard",
      "generateStoryboardSceneReferences",
      "step3CandidateSelect",
      "step3CandidateConfirm",
    ],
  },
  {
    domainId: "video_pipeline",
    description: "Step4-Step5 video job orchestration and export APIs.",
    requiredMethods: [
      "createVideoJob",
      "listVideoJobs",
      "getVideoJob",
      "listVideoMusic",
      "syncVideoMusic",
      "uploadVideoMusic",
      "createVideoMusic",
      "updateVideoMusic",
      "deleteVideoMusic",
      "analyzeVideoMusicAtmosphere",
      "matchVideoMusicByScript",
      "exportVideo",
      "publishToDouyin",
      "getPublishJob",
    ],
  },
  {
    domainId: "reverse_square",
    description: "Reverse parse and square trend-side APIs.",
    requiredMethods: ["reverseParse", "reverseParseV2", "squareTrends", "hotTrendScriptAssets"],
  },
  {
    domainId: "admin_console",
    description: "Admin-side users/scripts/providers/system-settings/capability-lab APIs.",
    requiredMethods: [
      "adminCharacterWorkflowSystemSettingsGet",
      "adminConfigGet",
      "adminUsers",
      "adminScripts",
      "adminProviders",
      "adminProviderAudits",
      "adminCapabilityLabText",
    ],
  },
  {
    domainId: "library_assets",
    description: "Library asset classification and STS credential APIs.",
    requiredMethods: ["classifyLibraryAssetImage", "getStsCredential"],
  },
  {
    domainId: "library_characters",
    description: "Library character CRUD and multi-view generation/regeneration APIs.",
    requiredMethods: [
      "listLibraryCharacters",
      "createLibraryCharacter",
      "updateLibraryCharacter",
    ],
  },
  {
    domainId: "library_scripts",
    description: "Library script CRUD APIs (no version management).",
    requiredMethods: [
      "listLibraryScripts",
      "createLibraryScript",
      "deleteLibraryScript",
    ],
  },
  {
    domainId: "reverse_storyboard_library",
    description: "Dedicated reverse storyboard library APIs.",
    requiredMethods: [
      "listReverseStoryboardLibrary",
      "updateReverseStoryboardLibrary",
      "deleteReverseStoryboardLibrary",
    ],
  },
] as const;

const EXACT_METHOD_DOMAIN: Readonly<Record<string, FrontendApiDomainId>> = {
  register: "auth_account",
  login: "auth_account",
  loadCredits: "auth_account",
  creditPricing: "auth_account",
  spendCredits: "auth_account",
  creditHistory: "auth_account",
  loadPrivateScripts: "auth_account",
  changePassword: "auth_account",
  createProject: "project_flow",
  updateProject: "project_flow",
  saveProjectWorkflowState: "project_flow",
  projectResumeSnapshot: "project_flow",
  deleteProject: "project_flow",
  uploadAssets: "project_flow",
  step1ClassifyImage: "project_flow",
  step1RemoveBg: "project_flow",
  recommendOutfits: "project_flow",
  optimizeOutfitAnalysis: "project_flow",
  selectOutfit: "project_flow",
  unselectOutfit: "project_flow",
  listProjectCharacters: "project_flow",
  addProjectCharacter: "project_flow",
  selectProjectCharacter: "project_flow",
  removeProjectCharacter: "project_flow",
  listPresets: "project_flow",
  generateScriptDraft: "project_flow",
  generateScript: "project_flow",
  optimizeScript: "project_flow",
  editScript: "project_flow",
  latestProjectScript: "project_flow",
  generateStoryboard: "project_flow",
  selectStoryboardVariant: "project_flow",
  syncStoryboardLayout: "project_flow",
  generateStoryboardSceneReferences: "project_flow",
  step3CandidateSelect: "project_flow",
  step3CandidateConfirm: "project_flow",
  persistStoryboardAssets: "project_flow",
  generateStoryboardVideoPrompts: "project_flow",
  optimizeStoryboardPrompt: "project_flow",
  translateStoryboardPrompt: "project_flow",
  resolveStep2FixedTemplateParameterVariants: "project_flow",
  createVideoJob: "video_pipeline",
  listVideoJobs: "video_pipeline",
  completeVideoJob: "video_pipeline",
  getVideoJob: "video_pipeline",
  listVideoMusic: "video_pipeline",
  getVideoMusic: "video_pipeline",
  syncVideoMusic: "video_pipeline",
  uploadVideoMusic: "video_pipeline",
  createVideoMusic: "video_pipeline",
  updateVideoMusic: "video_pipeline",
  deleteVideoMusic: "video_pipeline",
  analyzeVideoMusicAtmosphere: "video_pipeline",
  matchVideoMusicByScript: "video_pipeline",
  exportVideo: "video_pipeline",
  publishToDouyin: "video_pipeline",
  getDouyinPublishStatus: "video_pipeline",
  getDouyinAuthStatus: "video_pipeline",
  getDouyinRemoteLoginStatus: "video_pipeline",
  generateDouyinQRCode: "video_pipeline",
  checkDouyinScanStatus: "video_pipeline",
  createDouyinRemoteSession: "video_pipeline",
  getDouyinRemoteSession: "video_pipeline",
  closeDouyinRemoteSession: "video_pipeline",
  clearDouyinCookie: "video_pipeline",
  getPublishJob: "video_pipeline",
  getPublishJobs: "video_pipeline",
  reverseParse: "reverse_square",
  reverseParseV2: "reverse_square",
  startReverseParseV2Job: "reverse_square",
  getReverseParseV2Job: "reverse_square",
  squareResources: "reverse_square",
  squareTrends: "reverse_square",
  squareResolveVideoUrl: "reverse_square",
  hotTrendScriptAssets: "reverse_square",
  reverseHotTrendAssetToLibrary: "reverse_square",
  reverseUiSettingsGet: "reverse_square",
  step3CandidateAdminUnlock: "admin_console",
  submitReview: "project_flow",
  myProjects: "project_flow",
  classifyLibraryAssetImage: "library_assets",
  getStsCredential: "library_assets",
  listLibraryCharacters: "library_characters",
  createLibraryCharacter: "library_characters",
  updateLibraryCharacter: "library_characters",
  deleteLibraryCharacter: "library_characters",
  listLibraryScripts: "library_scripts",
  createLibraryScript: "library_scripts",
  // 注意：以下方法已移除（新 API 不支持）：updateLibraryScript、listLibraryScriptVersions、rollbackLibraryScript
  deleteLibraryScript: "library_scripts",
  deleteLibraryScripts: "library_scripts",
  listMyLibraryScripts: "library_scripts",
  listMyLibraryStoryboards: "reverse_storyboard_library",
  listReverseStoryboardLibrary: "reverse_storyboard_library",
  updateReverseStoryboardLibrary: "reverse_storyboard_library",
  deleteReverseStoryboardLibrary: "reverse_storyboard_library",
  deleteReverseStoryboardLibraryBatch: "reverse_storyboard_library",
};

const PREFIX_METHOD_DOMAIN: ReadonlyArray<readonly [prefix: string, domainId: FrontendApiDomainId]> = [
  ["admin", "admin_console"],
] as const;

export function resolveFrontendApiDomain(methodName: string): FrontendApiDomainId | null {
  const explicit = EXACT_METHOD_DOMAIN[methodName];
  if (explicit) {
    return explicit;
  }
  for (const [prefix, domainId] of PREFIX_METHOD_DOMAIN) {
    if (methodName.startsWith(prefix)) {
      return domainId;
    }
  }
  return null;
}

export function classifyFrontendApiMethods(methodNames: readonly string[]): {
  mapped: Readonly<Record<string, FrontendApiDomainId>>;
  grouped: Readonly<Record<FrontendApiDomainId, string[]>>;
  unclassified: string[];
} {
  const grouped: Record<FrontendApiDomainId, string[]> = {
    auth_account: [],
    project_flow: [],
    video_pipeline: [],
    reverse_square: [],
    admin_console: [],
    library_assets: [],
    library_characters: [],
    library_scripts: [],
    reverse_storyboard_library: [],
  };
  const mapped: Record<string, FrontendApiDomainId> = {};
  const unclassified: string[] = [];
  for (const methodName of methodNames) {
    const domain = resolveFrontendApiDomain(methodName);
    if (!domain) {
      unclassified.push(methodName);
      continue;
    }
    mapped[methodName] = domain;
    grouped[domain].push(methodName);
  }
  for (const key of Object.keys(grouped) as FrontendApiDomainId[]) {
    grouped[key].sort((a, b) => a.localeCompare(b));
  }
  return { mapped, grouped, unclassified: [...new Set(unclassified)].sort((a, b) => a.localeCompare(b)) };
}

export function assertFrontendApiDomainContract(methodNames?: readonly string[]): {
  version: string;
  domainCount: number;
  requiredMethodCount: number;
  mappedMethodCount: number;
  unclassifiedCount: number;
} {
  const seenRequired = new Set<string>();
  for (const entry of FRONTEND_API_DOMAIN_CONTRACT) {
    if (entry.requiredMethods.length < 1) {
      throw new Error(`frontend api domain ${entry.domainId} missing required methods`);
    }
    for (const methodName of entry.requiredMethods) {
      if (seenRequired.has(methodName)) {
        throw new Error(`duplicate required method in frontend api contract: ${methodName}`);
      }
      seenRequired.add(methodName);
      const resolved = resolveFrontendApiDomain(methodName);
      if (resolved !== entry.domainId) {
        throw new Error(
          `required method ${methodName} expected domain=${entry.domainId} but resolved=${String(resolved)}`,
        );
      }
    }
  }

  const methods = methodNames ?? [];
  const classified = classifyFrontendApiMethods(methods);
  if (methods.length > 0 && classified.unclassified.length > 0) {
    throw new Error(`unclassified backendApi methods: ${classified.unclassified.join(", ")}`);
  }

  return {
    version: FRONTEND_API_DOMAIN_CONTRACT_VERSION,
    domainCount: FRONTEND_API_DOMAIN_CONTRACT.length,
    requiredMethodCount: seenRequired.size,
    mappedMethodCount: Object.keys(classified.mapped).length,
    unclassifiedCount: classified.unclassified.length,
  };
}
