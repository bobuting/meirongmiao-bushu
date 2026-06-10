export interface User {
  id: string;
  name: string;
  avatar: string;
  email: string;
  role: 'admin' | 'user';
  plan: 'pro' | 'basic';
}

export interface Project {
  id: string;
  title: string;
  thumbnail: string;
  status: 'draft' | 'processing' | 'completed';
  projectKind?: 'image' | 'video' | 'reverse' | 'outfit_change';
  resumeStatus?: string;
  lastVisitedStep?: number;
  lastReverseTaskId?: string | null;
  lastReverseScriptVersionId?: string | null;
  lastReverseLibraryScriptId?: string | null;
  type: string;
  duration?: string;
  aspectRatio?: string;
  createdAt: string;
  updatedAt: string; // 最后修改时间
  views?: number;
  exportUrl?: string | null; // 原视频地址，用于判断是否可以裂变
  /** 换装项目源视频 URL（合成前用于播放预览） */
  sourceVideoUrl?: string | null;
  /** 服饰主图 URL */
  garmentImageUrl?: string | null;
}

export interface VideoAsset {
  id: string;
  name: string;
  mainImageUrl: string;
  subImageUrl1?: string | null;
  subImageUrl2?: string | null;
  subImageUrl3?: string | null;
  flatLayImageUrl?: string | null;
  type: 'video' | 'image';
  category: 'top' | 'bottom' | 'shoes' | 'accessory' | 'outfit' | 'suit' | 'dress' | 'outer';
  description?: string;
  classification?: {
    category: string;
    confidence: number;
    viewLabel: string;
    reason: string | null;
  } | null;
  // 服饰详细属性
  clothingAttrs?: {
    mainColor?: string | null;
    material?: string | null;
    pattern?: string | null;
    fit?: string | null;
    length?: string | null;
    neckline?: string | null;
    sleeve?: string | null;
    style?: string | null;
    occasion?: string | null;
  } | null;
  tags?: string[];
  url?: string;
  // 变体关联
  variantGroupId?: string | null;
  variantColor?: string | null;
  isPrimaryVariant?: boolean;
}

export interface ReviewTask {
  id: string;
  videoId: string;
  videoUrl: string;
  title: string;
  author: string;
  authorHandle: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected' | 'revision';
  aiScore: {
    nsfw: number;
    copyright: number;
    violence: number;
  };
  metadata: {
    model: string;
    seed: string;
    cost: number;
    prompt: string;
  };
}

export interface ScriptSegment {
  time: string;
  title: string;
  content: string;
  visualCue: string;
}

export interface AiModel {
  id: string;
  name: string;
  image: string;
  tags: string[];
  type: 'real' | 'anime' | '3d';
}

export type CharacterType = 'basic' | 'image' | 'video';
export type CharacterStatus = 'processing' | 'ready';
export type CharacterViewKey = 'front' | 'left' | 'right' | 'back' | 'closeup';
export type CharacterViewState = 'pending' | 'generating' | 'ready' | 'failed';

export interface CharacterViewDraft {
  key: CharacterViewKey;
  label: string;
  prompt: string;
  referenceImages?: string[];
  ratio?: '1:1' | '3:4' | '9:16' | '16:9';
  resolution?: '1k' | '2k' | '4k';
  status: CharacterViewState;
  candidates: string[];
  selectedImageUrl: string | null;
  confirmed: boolean;
  errorMessage: string | null;
  logs: string[];
  updatedAt: number;
}

export interface CharacterViewSession {
  status: 'idle' | 'running' | 'completed';
  total: number;
  generated: number;
  confirmed: number;
  startedAt: number;
  updatedAt: number;
  logs: string[];
  views: CharacterViewDraft[];
}

export interface Character {
  id: string;
  name: string;
  thumbnail: string;
  type: CharacterType;
  tags: string[];
  status: CharacterStatus;
  /** @deprecated 使用 fiveViewOssImageUrl 代替 */
  views?: string[];
  fiveViewOssImageUrl?: string | null;
  viewSession?: CharacterViewSession | null;
  videoPreview?: string;
  createdAt: string;
}

export type ThemeCategory = "tech" | "ecommerce" | "fashion" | "kids" | "custom";

export interface ThemeColors {
  primary: string;
  primaryHover: string;
  primaryActive: string;
  primaryLight: string;
  accent: string;
  accentHover: string;
  accentActive: string;
  secondary: string;
  background: string;
  backgroundWarm: string;
  surface: string;
  text: {
    primary: string;
    secondary: string;
    muted: string;
  };
  border: string;
  borderFocus: string;
}

export interface ThemeGradients {
  primary: string;
  primaryHover: string;
  primaryActive: string;
}

export interface ThemeFonts {
  main: string;
  display: string;
}

export interface ThemeAnimations {
  transitionSpeed: string;
  hoverTransform: string;
}

export interface ThemeConfig {
  colors: ThemeColors;
  gradients: ThemeGradients;
  fonts: ThemeFonts;
  animations: ThemeAnimations;
}

export interface Theme {
  id: string;
  name: string;
  displayName: string;
  category: ThemeCategory;
  isSystem: boolean;
  isEnabled: boolean;
  config: ThemeConfig;
  logoUrl?: string;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserThemePreference {
  userId: string;
  themeId: string;
  systemName: string;
  customConfig?: Partial<ThemeConfig>;
  customLogoUrl?: string;
  updatedAt: number;
  theme: Theme;
}

export interface RuntimeThemeState {
  theme: Theme;
  systemName: string;
  logoUrl: string;
  effectiveConfig: ThemeConfig;
  customConfig?: Partial<ThemeConfig>;
  customLogoUrl?: string;
}
