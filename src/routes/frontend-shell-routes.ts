import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { AppError } from "../core/errors.js";

const ROOT_STATIC_FILE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".ico",
  ".txt",
  ".json",
  ".woff",
  ".woff2",
  ".ttf",
]);

export interface FrontendShellStaticResolution {
  filePath: string | null;
  serveSpaShell: boolean;
}

function isValidSingleSegmentPath(value: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(value);
}

function hasStaticExtension(value: string): boolean {
  return ROOT_STATIC_FILE_EXTENSIONS.has(extname(value).toLowerCase());
}

function resolveRootStaticFile(activeWebRoot: string, publicRoot: string, staticFile: string): string | null {
  const normalized = staticFile.replace(/^\/+/, "");
  if (!isValidSingleSegmentPath(normalized) || !hasStaticExtension(normalized)) {
    return null;
  }
  const activeRoot = resolve(activeWebRoot);
  const activeFilePath = resolve(join(activeRoot, normalized));
  if (activeFilePath.startsWith(activeRoot) && existsSync(activeFilePath)) {
    return activeFilePath;
  }
  const fallbackRoot = resolve(publicRoot);
  const fallbackFilePath = resolve(join(fallbackRoot, normalized));
  if (fallbackFilePath.startsWith(fallbackRoot) && existsSync(fallbackFilePath)) {
    return fallbackFilePath;
  }
  return null;
}

export function resolveFrontendShellStaticRequest(input: {
  activeWebRoot: string;
  publicRoot: string;
  staticFile: string;
}): FrontendShellStaticResolution {
  const normalized = input.staticFile.replace(/^\/+/, "").trim();
  const filePath = resolveRootStaticFile(input.activeWebRoot, input.publicRoot, normalized);
  if (filePath) {
    return { filePath, serveSpaShell: false };
  }
  if (!normalized.includes("/") && !normalized.includes("\\") && !normalized.includes("..") && !hasStaticExtension(normalized)) {
    return { filePath: null, serveSpaShell: true };
  }
  return { filePath: null, serveSpaShell: false };
}

export function shouldServeFrontendShellPath(pathname: string): boolean {
  const normalized = String(pathname ?? "").split("?")[0].trim();
  if (!normalized || normalized === "/") {
    return true;
  }
  if (!normalized.startsWith("/")) {
    return false;
  }
  if (
    normalized.startsWith("/neirongmiao/api") ||
    normalized.startsWith("/assets/") ||
    normalized.startsWith("/data/") ||
    normalized.startsWith("/video-music/")
  ) {
    return false;
  }
  return !hasStaticExtension(normalized);
}

export async function sendFrontendShellHtml(reply: { type: (value: string) => { send: (body: string) => unknown } }, activeWebRoot: string) {
  const indexPath = join(activeWebRoot, "index.html");
  if (!existsSync(indexPath)) {
    throw new AppError(404, "NOT_FOUND", "Frontend shell index not found");
  }
  const html = await readFile(indexPath, "utf8");
  return reply.type("text/html; charset=utf-8").send(html);
}

export function registerFrontendShellFallbackRoutes(
  app: FastifyInstance,
  options: {
    activeWebRoot: string;
  },
): void {
  app.get("/*", async (request, reply) => {
    if (!shouldServeFrontendShellPath(request.url)) {
      throw new AppError(404, "NOT_FOUND", "Static file not found");
    }
    return sendFrontendShellHtml(reply, options.activeWebRoot);
  });
}
