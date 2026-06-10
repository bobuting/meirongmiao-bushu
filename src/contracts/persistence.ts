import type {
  AppConfig,
  CreditAccount,
  DeadLetter,
  GarmentAsset,
  LibraryCharacter,
  LibraryScript,
  LibraryScriptVersion,
  OutfitPlan,
  Project,
  ProviderConfig,
  ProviderRoutingPolicy,
  ProviderSecret,
  PublicResource,
  ReviewRequest,
  ReverseAttempt,
  ReverseTrace,
  ReverseTask,
  ScriptVersion,
  Session,
  SourceCredential,
  StoryboardFrame,
  Theme,
  TrendEntry,
  TrendSyncJob,
  UploadAsset,
  User,
  UserThemePreference,
  VideoMusic,
  VideoJob,
} from "./types.js";
import type { ReverseStoryboardLibraryItem } from "./reverse-storyboard-report.js";
import type { ReverseStoryboardLibraryVersionRecord } from "./reverse-storyboard-library-api.js";
import type {
  SmartStoryboardLibraryItem,
  SmartStoryboardLibraryVersionRecord,
} from "./smart-storyboard-library-api.js";
import type { ModelPreset } from "./model-preset-contract.js";

export type PersistenceDriver = "postgres";

export interface IUserPersistenceRepository {
  loadAll(): Promise<User[]>;
  replaceAll(users: readonly User[]): Promise<void>;
}

export interface IProjectPersistenceRepository {
  loadAll(): Promise<Project[]>;
  replaceAll(projects: readonly Project[]): Promise<void>;
}

export interface IScriptPersistenceRepository {
  loadAll(): Promise<ScriptVersion[]>;
  replaceAll(scripts: readonly ScriptVersion[]): Promise<void>;
}

export interface IConfigPersistenceRepository {
  load(): Promise<AppConfig>;
  save(config: AppConfig): Promise<void>;
}

export interface IStateSnapshot {
  users: User[];
  sessions: Session[];
  projects: Project[];
  assets: UploadAsset[];
  outfitPlans: OutfitPlan[];
  scripts: ScriptVersion[];
  storyboardFrames: StoryboardFrame[];
  videoJobs: VideoJob[];
  reverseTasks: ReverseTask[];
  reverseAttempts: ReverseAttempt[];
  reverseTraces: ReverseTrace[];
  sourceCredentials: SourceCredential[];
  trendEntries: TrendEntry[];
  trendSyncJobs: TrendSyncJob[];
  reviewRequests: ReviewRequest[];
  publicResources: PublicResource[];
  credits: CreditAccount[];
  deadLetters: DeadLetter[];
  garmentAssets: GarmentAsset[];
  videoMusics: VideoMusic[];
  libraryCharacters: LibraryCharacter[];
  libraryScripts: LibraryScript[];
  libraryScriptVersions: LibraryScriptVersion[];
  reverseStoryboardLibrary: ReverseStoryboardLibraryItem[];
  reverseStoryboardLibraryVersions: ReverseStoryboardLibraryVersionRecord[];
  smartStoryboardLibrary?: SmartStoryboardLibraryItem[];
  smartStoryboardLibraryVersions?: SmartStoryboardLibraryVersionRecord[];
  providers: ProviderConfig[];
  providerSecrets: ProviderSecret[];
  providerPolicies: ProviderRoutingPolicy[];
  modelPresets: ModelPreset[];
  themes: Theme[];
  userThemePreferences: UserThemePreference[];
  config: AppConfig;
}

export interface IStateSnapshotPersistenceRepository {
  load(): Promise<IStateSnapshot | null>;
  save(snapshot: IStateSnapshot): Promise<void>;
}

export interface IM5PersistenceAdapter {
  readonly driver: PersistenceDriver;
  readonly users: IUserPersistenceRepository;
  readonly projects: IProjectPersistenceRepository;
  readonly scripts: IScriptPersistenceRepository;
  readonly config: IConfigPersistenceRepository;
  readonly snapshot: IStateSnapshotPersistenceRepository;
  initialize(): Promise<void>;
  close(): Promise<void>;
}
