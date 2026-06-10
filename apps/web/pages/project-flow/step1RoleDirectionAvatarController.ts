import {
  resolveStep1RoleAvatarBucketGender,
  selectStep1RoleAvatarSlices,
  type Step1RoleAvatarSliceAsset,
} from "../../../../src/contracts/step1-role-avatar-slice-contract";

type AvatarGridGender = Step1RoleAvatarSliceAsset["gender"];
const DEFAULT_ROLE_DIRECTION_AVATAR_SEED = "step1-role-direction-runtime";

// OSS 公开访问基础 URL（角色头像切片）
const ROLE_AVATAR_SLICE_OSS_BASE_URL = "https://bbt-neirongmiao-v1.oss-cn-hangzhou.aliyuncs.com/storage/media/role";

export function isLikelyRolePortraitUrl(url: string | null): boolean {
  if (!url) {
    return false;
  }
  const normalized = url.trim().toLowerCase();
  if (normalized.length < 1) {
    return false;
  }
  const roleHints = [
    "character",
    "avatar",
    "portrait",
    "person",
    "role",
    "fiveview",
    "five-view",
    "allinone",
    "all-in-one",
    "5view",
    "%e4%ba%94%e8%a7%86%e5%9b%be",
    "%e4%b9%9d%e5%ae%ab%e6%a0%bc",
  ];
  return roleHints.some((hint) => normalized.includes(hint));
}

export function resolveRoleDirectionAvatarGender(rawGender: string | null | undefined): AvatarGridGender {
  return resolveStep1RoleAvatarBucketGender(rawGender);
}

export function resolveRoleDirectionAvatarRenderModel(
  index: number,
  rawGender: string | null | undefined,
  preferredPortraitUrl?: string | null,
): {
  gender: AvatarGridGender;
  assetId: string;
  imageUrl: string;
  fileName: string;
  sourceSheet: string;
} {
  const portraitUrl = typeof preferredPortraitUrl === "string" ? preferredPortraitUrl.trim() : "";
  if (isLikelyRolePortraitUrl(portraitUrl)) {
    const gender = resolveStep1RoleAvatarBucketGender(rawGender);
    return {
      gender,
      assetId: `external-role-portrait-${Math.max(1, Math.floor(index) + 1)}`,
      imageUrl: portraitUrl,
      fileName: portraitUrl.split("/").pop() || "external-role-portrait",
      sourceSheet: "external-role-portrait",
    };
  }
  const requestedCount = Math.max(1, Math.floor(index) + 1);
  const assets = selectStep1RoleAvatarSlices({
    rawGender,
    requestedCount,
    seed: DEFAULT_ROLE_DIRECTION_AVATAR_SEED,
  });
  const asset = assets[requestedCount - 1];
  if (!asset) {
    throw new Error("role direction avatar slices must return at least one asset");
  }
  return {
    gender: asset.gender,
    assetId: asset.assetId,
    imageUrl: `${ROLE_AVATAR_SLICE_OSS_BASE_URL}/${asset.gender}/${asset.fileName}`,
    fileName: asset.fileName,
    sourceSheet: asset.sourceSheet,
  };
}
