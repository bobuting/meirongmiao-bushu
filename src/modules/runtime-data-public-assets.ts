export const RUNTIME_DATA_PUBLIC_ASSET_PREFIX = "/data";

const RUNTIME_DATA_ALLOWED_EXACT = new Set(["loading.mp4", "loading_contact_sheet.jpg"]);
const RUNTIME_DATA_ALLOWED_PREFIXES = ["step1-role-avatar-slices/", "square-template-covers/"] as const;

function normalizeRuntimeDataPath(input: string): string {
  return input
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^data\/+/, "");
}

export function buildRuntimeDataPublicUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }
  if (/^(?:https?:|data:|blob:)/i.test(trimmed) || trimmed.startsWith("/")) {
    return trimmed;
  }
  const normalized = normalizeRuntimeDataPath(trimmed);
  return normalized ? `${RUNTIME_DATA_PUBLIC_ASSET_PREFIX}/${normalized}` : "";
}

export function isAllowedRuntimeDataPublicAssetPath(input: string): boolean {
  const normalized = normalizeRuntimeDataPath(input);
  if (!normalized) {
    return false;
  }
  if (RUNTIME_DATA_ALLOWED_EXACT.has(normalized)) {
    return true;
  }
  return RUNTIME_DATA_ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}
