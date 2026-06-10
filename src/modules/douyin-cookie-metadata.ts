import { existsSync, readFileSync, writeFileSync } from "node:fs";

export type DouyinCookieAuthSource = "import" | "qr" | "remote";

export interface DouyinCookieMetadata {
  source: DouyinCookieAuthSource;
  status: "pending" | "authenticated";
  verifiedAt: number | null;
  updatedAt: number;
}

const AUTH_COOKIE_NAMES = new Set(["sessionid", "sessionid_ss", "sid_guard", "passport_auth_status"]);

export function getDouyinCookieMetaPath(cookiePath: string): string {
  return cookiePath.replace(/\.json$/i, ".meta.json");
}

export function readDouyinCookieMetadata(cookiePath: string): DouyinCookieMetadata | null {
  const metaPath = getDouyinCookieMetaPath(cookiePath);
  if (!existsSync(metaPath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(metaPath, "utf8")) as Record<string, unknown>;
    const sourceRaw = String(parsed.source ?? "").trim();
    const statusRaw = String(parsed.status ?? "").trim();
    const updatedAtRaw = Number(parsed.updatedAt);
    const verifiedAtRaw = Number(parsed.verifiedAt);
    const source: DouyinCookieAuthSource =
      sourceRaw === "qr" || sourceRaw === "remote" || sourceRaw === "import" ? sourceRaw : "import";
    const status: DouyinCookieMetadata["status"] =
      statusRaw === "authenticated" ? "authenticated" : "pending";
    return {
      source,
      status,
      verifiedAt: Number.isFinite(verifiedAtRaw) && verifiedAtRaw > 0 ? Math.floor(verifiedAtRaw) : null,
      updatedAt: Number.isFinite(updatedAtRaw) && updatedAtRaw > 0 ? Math.floor(updatedAtRaw) : Date.now(),
    };
  } catch {
    return null;
  }
}

export function writeDouyinCookieMetadata(
  cookiePath: string,
  metadata: Omit<DouyinCookieMetadata, "updatedAt"> & { updatedAt?: number },
): void {
  const payload: DouyinCookieMetadata = {
    ...metadata,
    updatedAt: metadata.updatedAt ?? Date.now(),
  };
  writeFileSync(getDouyinCookieMetaPath(cookiePath), JSON.stringify(payload, null, 2));
}

export function inferDouyinCookieExpiry(cookiePath: string): number | null {
  if (!existsSync(cookiePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(cookiePath, "utf8")) as {
      cookies?: Array<{ name?: unknown; expires?: unknown }>;
    };
    const cookies = Array.isArray(parsed.cookies) ? parsed.cookies : [];
    const authExpiries = cookies
      .filter((cookie) => AUTH_COOKIE_NAMES.has(String(cookie?.name ?? "").trim()))
      .map((cookie) => Number(cookie?.expires))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.floor(value * 1000));
    if (authExpiries.length > 0) {
      return Math.min(...authExpiries);
    }
    const allExpiries = cookies
      .map((cookie) => Number(cookie?.expires))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.floor(value * 1000));
    return allExpiries.length > 0 ? Math.min(...allExpiries) : null;
  } catch {
    return null;
  }
}
