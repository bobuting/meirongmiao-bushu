import { join, resolve } from "node:path";
import { isAllowedRuntimeDataPublicAssetPath } from "./runtime-data-public-assets.js";

function normalizeRuntimeDataPath(input: string): string {
  return input
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^data\/+/, "");
}

export function resolveRuntimeDataPublicAssetFilePath(projectRootDir: string, input: string): string | null {
  const normalized = normalizeRuntimeDataPath(input);
  if (!isAllowedRuntimeDataPublicAssetPath(normalized)) {
    return null;
  }
  const dataRoot = resolve(join(projectRootDir, "data"));
  const filePath = resolve(join(dataRoot, normalized));
  if (!filePath.startsWith(dataRoot)) {
    return null;
  }
  return filePath;
}
