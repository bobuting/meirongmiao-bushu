import { ProviderCallMode } from "../contracts/types.js";

/**
 * 判断是否使用豆包协议
 * 基于 callMode 枚举值判断
 */
export function isDoubaoProvider(callMode: string): boolean {
  return callMode === ProviderCallMode.DOUBAO_SEEDANCE_VIDEO_YUNWU;
}

export function buildJimengVideoEndpointCandidates(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/+$/, "");
  const lowerBase = base.toLowerCase();
  const stripsToRoot = [
    "/api/v1/chat/completions",
    "/v1/chat/completions",
    "/chat/completions",
    "/api/v1/videos/generations",
    "/v1/videos/generations",
    "/videos/generations",
    "/api/v1/video/generations",
    "/v1/video/generations",
    "/video/generations",
  ];
  const asRoot = (() => {
    const knownSuffixes = [
      "/api/v1/videos/generations",
      "/v1/videos/generations",
      "/videos/generations",
      "/api/v1/video/generations",
      "/v1/video/generations",
      "/video/generations",
      "/api/v1/video/create",
      "/v1/video/create",
      "/video/create",
      "/volc/v1/contents/generations/tasks",
      ...stripsToRoot,
    ];
    const matched = knownSuffixes.find((suffix) => lowerBase.endsWith(suffix));
    if (!matched) {
      return base;
    }
    return base.slice(0, Math.max(0, base.length - matched.length)).replace(/\/+$/, "");
  })();
  const candidates = new Set<string>();
  const fullEndpointPattern = /\/(videos\/generations|video\/generations|video\/create|volc\/v1\/contents\/generations\/tasks)$/i;
  const generationSuffixes = [
    "/api/v1/videos/generations",
    "/v1/videos/generations",
    "/videos/generations",
    "/api/v1/video/generations",
    "/v1/video/generations",
    "/video/generations",
  ];
  const legacyCreateSuffixes = ["/api/v1/video/create", "/v1/video/create", "/video/create"];
  const suffixes = [...generationSuffixes, ...legacyCreateSuffixes];
  const appendEndpoint = (rootRaw: string, suffix: string) => {
    const root = rootRaw.replace(/\/+$/, "");
    const lowerRoot = root.toLowerCase();
    if (lowerRoot.endsWith("/api/v1") && suffix.toLowerCase().startsWith("/api/v1/")) {
      candidates.add(`${root}${suffix.slice("/api/v1".length)}`);
      return;
    }
    if (lowerRoot.endsWith("/v1") && suffix.toLowerCase().startsWith("/v1/")) {
      candidates.add(`${root}${suffix.slice("/v1".length)}`);
      return;
    }
    candidates.add(`${root}${suffix}`);
  };
  if (fullEndpointPattern.test(base)) {
    candidates.add(base);
  }
  const roots = stripsToRoot.some((suffix) => lowerBase.endsWith(suffix)) ? [asRoot] : [base, asRoot];
  for (const root of roots) {
    if (!root) {
      continue;
    }
    for (const suffix of suffixes) {
      appendEndpoint(root, suffix);
    }
  }
  return [...candidates];
}

export function buildJimengVideoQueryEndpointCandidates(baseUrl: string, taskId: string): string[] {
  const safeTaskId = encodeURIComponent(taskId.trim());
  if (!safeTaskId) {
    return [];
  }
  const base = baseUrl.replace(/\/+$/, "");
  const lowerBase = base.toLowerCase();
  const stripsToRoot = [
    "/api/v1/chat/completions",
    "/v1/chat/completions",
    "/chat/completions",
    "/api/v1/videos/generations",
    "/v1/videos/generations",
    "/videos/generations",
    "/api/v1/video/generations",
    "/v1/video/generations",
    "/video/generations",
    "/api/v1/video/create",
    "/v1/video/create",
    "/video/create",
    "/api/v1/video/query",
    "/v1/video/query",
    "/video/query",
    "/volc/v1/contents/generations/tasks",
  ];
  const asRoot = (() => {
    const matched = stripsToRoot.find((suffix) => lowerBase.endsWith(suffix));
    if (!matched) {
      return base;
    }
    return base.slice(0, Math.max(0, base.length - matched.length)).replace(/\/+$/, "");
  })();
  const candidates = new Set<string>();
  const suffixes = [
    `/api/v1/video/query?id=${safeTaskId}`,
    `/v1/video/query?id=${safeTaskId}`,
    `/video/query?id=${safeTaskId}`,
    `/api/v1/videos/query?id=${safeTaskId}`,
    `/v1/videos/query?id=${safeTaskId}`,
    `/videos/query?id=${safeTaskId}`,
  ];
  const appendEndpoint = (rootRaw: string, suffix: string) => {
    const root = rootRaw.replace(/\/+$/, "");
    const lowerRoot = root.toLowerCase();
    if (lowerRoot.endsWith("/api/v1") && suffix.toLowerCase().startsWith("/api/v1/")) {
      candidates.add(`${root}${suffix.slice("/api/v1".length)}`);
      return;
    }
    if (lowerRoot.endsWith("/v1") && suffix.toLowerCase().startsWith("/v1/")) {
      candidates.add(`${root}${suffix.slice("/v1".length)}`);
      return;
    }
    candidates.add(`${root}${suffix}`);
  };
  for (const root of [base, asRoot]) {
    if (!root) {
      continue;
    }
    for (const suffix of suffixes) {
      appendEndpoint(root, suffix);
    }
  }
  return [...candidates];
}

function resolveBaseRootsForVolcVideo(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/+$/, "");
  const lowerBase = base.toLowerCase();
  const knownSuffixes = [
    "/api/v1/chat/completions",
    "/v1/chat/completions",
    "/chat/completions",
    "/api/v1/videos/generations",
    "/v1/videos/generations",
    "/videos/generations",
    "/api/v1/video/generations",
    "/v1/video/generations",
    "/video/generations",
    "/api/v1/video/create",
    "/v1/video/create",
    "/video/create",
    "/volc/v1/contents/generations/tasks",
  ];
  const matched = knownSuffixes.find((suffix) => lowerBase.endsWith(suffix));
  const trimmedBase = matched
    ? base.slice(0, Math.max(0, base.length - matched.length)).replace(/\/+$/, "")
    : base;
  const roots = new Set<string>();
  if (base) {
    roots.add(base);
  }
  if (trimmedBase) {
    roots.add(trimmedBase);
  }
  return [...roots];
}

export function buildDoubaoVolcVideoCreateEndpointCandidates(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/+$/, "");
  const lowerBase = base.toLowerCase();
  const candidates = new Set<string>();
  const path = "/volc/v1/contents/generations/tasks";
  if (lowerBase.endsWith(path)) {
    candidates.add(base);
  }
  for (const root of resolveBaseRootsForVolcVideo(baseUrl)) {
    const normalizedRoot = root.replace(/\/+$/, "");
    if (!normalizedRoot) {
      continue;
    }
    candidates.add(`${normalizedRoot}${path}`);
  }
  return [...candidates];
}

export function buildDoubaoVolcVideoQueryEndpointCandidates(baseUrl: string, taskId: string): string[] {
  const safeTaskId = encodeURIComponent(taskId.trim());
  if (!safeTaskId) {
    return [];
  }
  const base = baseUrl.replace(/\/+$/, "");
  const lowerBase = base.toLowerCase();
  const createPath = "/volc/v1/contents/generations/tasks";
  const queryPath = `${createPath}/${safeTaskId}`;
  const candidates = new Set<string>();
  if (lowerBase.includes(createPath)) {
    candidates.add(base.replace(new RegExp(`${createPath}.*$`, "i"), queryPath));
  }
  for (const root of resolveBaseRootsForVolcVideo(baseUrl)) {
    const normalizedRoot = root.replace(/\/+$/, "");
    if (!normalizedRoot) {
      continue;
    }
    candidates.add(`${normalizedRoot}${queryPath}`);
  }
  return [...candidates];
}
