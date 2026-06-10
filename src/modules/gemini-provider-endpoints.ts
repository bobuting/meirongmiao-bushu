export interface GeminiEndpointProviderInput {
  vendor: string;
  baseUrl: string;
}

export interface GeminiEndpointCandidate {
  url: string;
  headers: Record<string, string>;
}

function isYunwuGeminiProviderSource(provider: GeminiEndpointProviderInput): boolean {
  const vendor = provider.vendor.trim().toLowerCase();
  const base = provider.baseUrl.trim().toLowerCase();
  return vendor.includes("yunwu") || base.includes("yunwu.ai");
}

export function buildGeminiEndpointCandidates(
  provider: GeminiEndpointProviderInput,
  model: string,
  apiKey: string,
): GeminiEndpointCandidate[] {
  const base = provider.baseUrl.replace(/\/+$/, "");
  const encodedModel = encodeURIComponent(model);
  const candidates: GeminiEndpointCandidate[] = [];
  const push = (url: string, headers: Record<string, string>) => {
    if (!candidates.some((item) => item.url === url)) {
      candidates.push({ url, headers });
    }
  };

  // Google 官方 API
  if (/generativelanguage\.googleapis\.com/i.test(base)) {
    const versionedBase = /\/v\d+(?:beta)?$/i.test(base) ? base : `${base}/v1beta`;
    push(
      `${versionedBase}/models/${encodedModel}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {},
    );
    return candidates;
  }

  // 云雾 API：只使用 v1beta，同时传 key 参数和 Bearer header
  if (isYunwuGeminiProviderSource(provider)) {
    const bearerHeader = { Authorization: `Bearer ${apiKey}` };
    push(`${base}/v1beta/models/${encodedModel}:generateContent?key=${encodeURIComponent(apiKey)}`, bearerHeader);
    return candidates;
  }

  // 其他第三方
  const bearer = { Authorization: `Bearer ${apiKey}` };
  if (!/\/v\d+(?:beta)?(?:\/|$)/i.test(base)) {
    push(`${base}/v1beta/models/${encodedModel}:generateContent`, bearer);
  }
  if (/\/models$/i.test(base)) {
    push(`${base}/${encodedModel}:generateContent`, bearer);
  } else {
    push(`${base}/models/${encodedModel}:generateContent`, bearer);
  }
  return candidates;
}
