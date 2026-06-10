import type { Gender } from "./avatar-nine-grid-contract";

export const STEP1_ROLE_AVATAR_SLICE_CONTRACT_VERSION = "AT35-14.v1";
export const STEP1_ROLE_AVATAR_SLICE_ASSET_ROOT = "data/step1-role-avatar-slices";
export const STEP1_ROLE_AVATAR_SLICE_COUNT_PER_GENDER = 9;
export const STEP1_ROLE_AVATAR_SELECTION_FALLBACK_GENDER: Gender = "female";

export interface Step1RoleAvatarSliceAsset {
  assetId: string;
  gender: Gender;
  sourceSheet: string;
  sourceSlotIndex: number;
  assetIndex: number;
  fileName: string;
  assetPath: string;
}

export interface Step1RoleAvatarSliceBucket {
  gender: Gender;
  sourceSheet: string;
  assetDirectory: string;
  filePrefix: "boys" | "girls";
  assets: Step1RoleAvatarSliceAsset[];
}

export interface Step1RoleAvatarSelectionPolicy {
  strategy: "bucket-seeded-random";
  uniqueBeforeRepeat: boolean;
  overflowMode: "repeat-when-overflow";
  fallbackGender: Gender;
}

export interface Step1RoleAvatarSliceContract {
  version: string;
  assetRoot: string;
  offlinePipeline: "ffmpeg-or-equivalent";
  totalAssets: number;
  slicesPerGender: number;
  buckets: Step1RoleAvatarSliceBucket[];
  selectionPolicy: Step1RoleAvatarSelectionPolicy;
}

export interface Step1RoleAvatarSelectionParams {
  rawGender: string | null | undefined;
  requestedCount: number;
  seed: string;
}

function buildBucket(gender: Gender): Step1RoleAvatarSliceBucket {
  const filePrefix = gender === "male" ? "boys" : "girls";
  const sourceSheet = `data/${filePrefix}.jpeg`;
  const assetDirectory = `${STEP1_ROLE_AVATAR_SLICE_ASSET_ROOT}/${gender}`;
  const assets = Array.from({ length: STEP1_ROLE_AVATAR_SLICE_COUNT_PER_GENDER }, (_, index) => {
    const assetIndex = index + 1;
    const suffix = String(assetIndex).padStart(2, "0");
    const fileName = `${filePrefix}-${suffix}.png`;
    return {
      assetId: `${gender}-${suffix}`,
      gender,
      sourceSheet,
      sourceSlotIndex: index,
      assetIndex,
      fileName,
      assetPath: `${assetDirectory}/${fileName}`,
    } satisfies Step1RoleAvatarSliceAsset;
  });

  return {
    gender,
    sourceSheet,
    assetDirectory,
    filePrefix,
    assets,
  };
}

export const STEP1_ROLE_AVATAR_SLICE_BUCKETS: readonly Step1RoleAvatarSliceBucket[] = [
  buildBucket("male"),
  buildBucket("female"),
] as const;

export const STEP1_ROLE_AVATAR_SLICE_INVARIANTS = [
  "boys.jpeg and girls.jpeg must be sliced into exactly 18 runtime-ready avatar images, nine assets per gender bucket.",
  "Offline slicing can use ffmpeg or an equivalent local pipeline, but the output paths and filenames must stay stable once published.",
  "Runtime avatar selection stays inside the resolved gender bucket and falls back to female when gender is missing or unsupported.",
  "A seeded random order must avoid repeats until the bucket is exhausted, then continue with repeat-when-overflow reuse from the same shuffled order.",
] as const;

export function resolveStep1RoleAvatarBucketGender(rawGender: string | null | undefined): Gender {
  const normalized = String(rawGender ?? "").trim().toLowerCase();
  if (normalized === "male") {
    return "male";
  }
  if (normalized === "female") {
    return "female";
  }
  return STEP1_ROLE_AVATAR_SELECTION_FALLBACK_GENDER;
}

function scoreAsset(seed: string, assetId: string): number {
  const raw = `${seed}::${assetId}`;
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 33 + raw.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function resolveStep1RoleAvatarSliceContract(): Step1RoleAvatarSliceContract {
  return {
    version: STEP1_ROLE_AVATAR_SLICE_CONTRACT_VERSION,
    assetRoot: STEP1_ROLE_AVATAR_SLICE_ASSET_ROOT,
    offlinePipeline: "ffmpeg-or-equivalent",
    totalAssets: STEP1_ROLE_AVATAR_SLICE_BUCKETS.reduce((sum, bucket) => sum + bucket.assets.length, 0),
    slicesPerGender: STEP1_ROLE_AVATAR_SLICE_COUNT_PER_GENDER,
    buckets: STEP1_ROLE_AVATAR_SLICE_BUCKETS.map((bucket) => ({
      ...bucket,
      assets: bucket.assets.map((asset) => ({ ...asset })),
    })),
    selectionPolicy: {
      strategy: "bucket-seeded-random",
      uniqueBeforeRepeat: true,
      overflowMode: "repeat-when-overflow",
      fallbackGender: STEP1_ROLE_AVATAR_SELECTION_FALLBACK_GENDER,
    },
  };
}

export function selectStep1RoleAvatarSlices(params: Step1RoleAvatarSelectionParams): Step1RoleAvatarSliceAsset[] {
  const requestedCount = Math.max(0, Math.floor(params.requestedCount));
  if (requestedCount === 0) {
    return [];
  }

  const gender = resolveStep1RoleAvatarBucketGender(params.rawGender);
  const bucket = STEP1_ROLE_AVATAR_SLICE_BUCKETS.find((item) => item.gender === gender);
  if (!bucket) {
    throw new Error(`missing role avatar slice bucket for gender=${gender}`);
  }

  const orderedAssets = [...bucket.assets].sort((left, right) => {
    const scoreDiff = scoreAsset(params.seed, left.assetId) - scoreAsset(params.seed, right.assetId);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return left.assetIndex - right.assetIndex;
  });

  return Array.from({ length: requestedCount }, (_, index) => {
    const asset = orderedAssets[index % orderedAssets.length];
    return {
      ...asset,
    };
  });
}
