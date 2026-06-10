import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/ui/Button";
import { backendApi } from "../../services/backendApi";
import { useAppStore } from "../../store/useAppStore";
import { getApiCallLog, getApiCallSeq, type ApiCallRecord } from "../../services/backendApi.request";
import { extractImageUrlsFromJson, parseUrls } from "../../utils/imageUrlParser";
import { getOssThumbnailUrl, getOssVideoSnapshotUrl } from "../../utils/ossImage";
import { useToast } from "../../components/ui/Toast";

// ============================================================================
// 类型定义
// ============================================================================

interface AuditItem {
  id: string;
  providerId: string;
  routeKey: string;
  requestId: string | null;
  status: string;
  latencyMs: number;
  createdAt: number;
  requestSummary: string | null;
  responseSummary: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  callContext: string | null;
  queryParamsJson: string | null;
  actualModel: string | null;
  providerVendor: string | null;
  providerBaseUrl: string | null;
  actualEndpoint: string | null;
  requestHeadersJson: string | null;
  requestBodyJson: string | null;
  callMode: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  ttftMs: number | null;
  projectId: string | null;
  userId: string | null;
  attemptsJson: string | null;
  messagesJson: string | null;
}

type TabType = "audit" | "call" | "error";

// ============================================================================
// 工具函数
// ============================================================================

const parseCallContext = (callContext: string | null) => {
  if (!callContext) return { business: null, stack: null };
  const lines = callContext.split("\n");
  const business = lines.find((l) => l.startsWith("业务场景:"))?.replace("业务场景:", "").trim() ?? null;
  const stackLines = lines.filter((l) => !l.startsWith("业务场景:") && !l.startsWith("代码位置:"));
  const stack = stackLines.join("\n").replace("调用栈:", "").trim() || null;
  return { business, stack };
};

const parseJsonSafe = <T = unknown>(json: string | null): T | null => {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
};

const parseRequestBody = (json: string | null) => {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed === "string") {
      try { return JSON.parse(parsed); } catch { return parsed; }
    }
    return parsed;
  } catch { return json; }
};

/**
 * 解析 requestSummary（结构化 key=value 格式）
 * 格式：后端以 "key=value; key=value" 构建每个字段
 * 解析时先按 "; " 分隔，再按首个 "=" 切分 key/value
 */
const parseRequestSummary = (summary: string | null) => {
  if (!summary) return { system: null, user: null, prompt: null, images: null, params: null, context: null, hasMedia: null };

  // 按 "; " 分隔提取 key=value 对
  const pairs = new Map<string, string>();
  let remaining = summary;
  while (remaining.length > 0) {
    // 已知的 key 前缀，按长度降序匹配避免歧义
    const knownKeys = ["hasMedia", "images", "params", "system", "context", "prompt", "user"];
    let matched = false;
    for (const key of knownKeys) {
      const prefix = `${key}=`;
      if (remaining.startsWith(prefix)) {
        const valueStart = prefix.length;
        // 查找下一个 "; key=" 边界
        let valueEnd = remaining.length;
        for (const nextKey of knownKeys) {
          if (nextKey === key) continue;
          const sep = `; ${nextKey}=`;
          const sepIdx = remaining.indexOf(sep, valueStart);
          if (sepIdx !== -1 && sepIdx < valueEnd) {
            valueEnd = sepIdx;
          }
        }
        pairs.set(key, remaining.slice(valueStart, valueEnd).trim());
        remaining = remaining.slice(valueEnd);
        // 跳过 "; " 分隔符
        if (remaining.startsWith("; ")) remaining = remaining.slice(2);
        matched = true;
        break;
      }
    }
    if (!matched) break;
  }

  // 如果完全没有匹配到任何 key，把整个内容作为 context
  if (pairs.size === 0) {
    const hasMediaMatch = summary.match(/hasMedia=(image|video)/);
    return { system: null, user: null, prompt: null, images: null, params: null, context: summary, hasMedia: hasMediaMatch ? (hasMediaMatch[1] as "image" | "video") : null };
  }

  return {
    system: pairs.get("system") ?? null,
    user: pairs.get("user") ?? null,
    prompt: pairs.get("prompt") ?? null,
    images: pairs.get("images") ?? null,
    params: pairs.get("params") ?? null,
    context: pairs.get("context") ?? null,
    hasMedia: pairs.get("hasMedia") ? (pairs.get("hasMedia") as "image" | "video") : null,
  };
};

// 解析 responseSummary
const parseResponseSummary = (summary: string | null | undefined) => {
  if (!summary || typeof summary !== "string") return { payload: null, text: null, trace: null };
  const trimmed = summary.trim();
  if (!trimmed) return { payload: null, text: null, trace: null };

  if (trimmed.startsWith("payload=")) {
    const payloadContent = trimmed.slice(8);
    try { return { payload: JSON.parse(payloadContent), text: null, trace: null }; }
    catch { return { payload: null, text: payloadContent, trace: null }; }
  }

  const traceMatch = trimmed.match(/(?:trace|firstTrace)=([^;]+)/);
  const trace = traceMatch?.[1]?.trim() || null;

  let textContent: string | null = null;
  const firstTextIdx = trimmed.indexOf("firstText=");
  if (firstTextIdx !== -1) {
    const afterFirstText = trimmed.slice(firstTextIdx + 10);
    const repairTextIdx = afterFirstText.indexOf("; repairText=");
    textContent = (repairTextIdx !== -1) ? afterFirstText.slice(0, repairTextIdx).trim() : afterFirstText.trim();
  }
  if (!textContent) {
    const textIdx = trimmed.indexOf("text=");
    if (textIdx !== -1) textContent = trimmed.slice(textIdx + 5).trim();
  }

  const repairTextIdx = trimmed.indexOf("repairText=");
  if (repairTextIdx !== -1) {
    const repairText = trimmed.slice(repairTextIdx + 11).trim();
    if (textContent) textContent = `${textContent}\n\n--- 修复后的响应 ---\n${repairText}`;
  }

  if (textContent) return { payload: null, text: textContent, trace };
  return { payload: null, text: trimmed, trace: null };
};

/** 解析 messagesJson 中的媒体信息（视频 URL、参考图等） */
const parseMediaMessages = (json: string | null) => {
  if (!json) return null;
  try {
    const messages = JSON.parse(json);
    if (!Array.isArray(messages)) return null;

    const videoUrl = messages.find((m: { role: string }) => m.role === "video_url")?.content ?? null;
    const refRaw = messages.find((m: { role: string }) => m.role === "reference_images" || m.role === "images")?.content ?? null;
    let referenceImages: string[] | null = null;
    if (refRaw) {
      try {
        const parsed = JSON.parse(refRaw);
        referenceImages = Array.isArray(parsed) ? parsed : [refRaw];
      } catch {
        referenceImages = [refRaw];
      }
    }

    if (!videoUrl && !referenceImages) return null;
    return { videoUrl, referenceImages };
  } catch {
    return null;
  }
};

/** 从文本中提取视频 URL */
const extractVideoUrlsFromText = (text: string): string[] => {
  const urlPattern = /(https?:\/\/[^\s"'`<>\[\]\{\}\)]+)/gi;
  const urls: string[] = [];
  let match;
  while ((match = urlPattern.exec(text)) !== null) {
    const url = match[1].trim().replace(/[,\s;]+$/, '');
    if (/\.(mp4|mov|avi|webm|mkv|flv|wmv|m4v|3gp)(\?|$)/i.test(url)) {
      urls.push(url);
    }
  }
  return [...new Set(urls)];
};

/** 从 JSON 对象中递归提取视频 URL */
const extractVideoUrlsFromJson = (value: unknown): string[] => {
  if (typeof value === 'string') return extractVideoUrlsFromText(value);
  if (Array.isArray(value)) return value.flatMap(extractVideoUrlsFromJson);
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(extractVideoUrlsFromJson);
  return [];
};

// 时间格式化
const formatTime = (ts: number) => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// ============================================================================
// Body 图片预览弹窗
// ============================================================================

const BodyImagePreviewModal: React.FC<{ urls: string[]; onClose: () => void }> = ({ urls, onClose }) => {
  const [previewIdx, setPreviewIdx] = useState(-1);

  const loadedUrls = urls.filter((url) => {
    try { return /\.(jpg|jpeg|png|gif|webp|svg|bmp|avif|tiff|tif)(\?|$)/i.test(new URL(url).pathname); }
    catch { return true; }
  });

  return (
    <div className="fixed inset-0 z-[10000] bg-black/30" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full max-w-[480px] overflow-y-auto border-l border-gray-200 bg-white p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">
            Body 图片 ({loadedUrls.length} 张)
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <span className="material-icons-round">close</span>
          </button>
        </div>

        {/* 缩略图网格 */}
        <div className="grid grid-cols-2 gap-3">
          {loadedUrls.map((url, idx) => (
            <div
              key={url + idx}
              className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden cursor-pointer hover:shadow-md transition-shadow group"
              onClick={() => setPreviewIdx(idx)}
            >
              <div className="relative h-32 flex items-center justify-center bg-white overflow-hidden">
                <img
                  src={getOssThumbnailUrl(url, 300, 80)}
                  alt={`图片 ${idx + 1}`}
                  className="max-w-full max-h-32 object-contain transition-transform group-hover:scale-[1.03]"
                />
                <span className="absolute top-1.5 left-1.5 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm">
                  {idx + 1}/{loadedUrls.length}
                </span>
              </div>
              <div className="p-1.5">
                <div className="text-[10px] text-gray-500 truncate" title={url}>
                  {url.split("/").pop() ?? url}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 大图预览 */}
        {previewIdx >= 0 && previewIdx < loadedUrls.length && (
          <div
            className="fixed inset-0 z-[10001] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setPreviewIdx(-1)}
          >
            <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setPreviewIdx(-1)}
                className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white/90 text-gray-700 hover:bg-white shadow-lg flex items-center justify-center transition-all z-10"
              >
                <span className="material-icons-round text-sm">close</span>
              </button>
              {loadedUrls.length > 1 && (
                <>
                  <button
                    onClick={() => setPreviewIdx((i) => (i - 1 < 0 ? loadedUrls.length - 1 : i - 1))}
                    className="absolute -left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 text-gray-700 hover:bg-white shadow-lg flex items-center justify-center transition-all z-10"
                  >
                    <span className="material-icons-round">chevron_left</span>
                  </button>
                  <button
                    onClick={() => setPreviewIdx((i) => (i + 1 >= loadedUrls.length ? 0 : i + 1))}
                    className="absolute -right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 text-gray-700 hover:bg-white shadow-lg flex items-center justify-center transition-all z-10"
                  >
                    <span className="material-icons-round">chevron_right</span>
                  </button>
                </>
              )}
              <img
                src={loadedUrls[previewIdx]}
                alt={`图片 ${previewIdx + 1}`}
                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4 rounded-b-lg flex items-center justify-between">
                <p className="text-white/90 text-sm truncate flex-1">{loadedUrls[previewIdx].split("/").pop()}</p>
                {loadedUrls.length > 1 && (
                  <span className="text-white/70 text-xs ml-3 shrink-0">{previewIdx + 1} / {loadedUrls.length}</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 响应媒体预览弹窗（图片 + 视频）
// ============================================================================

type MediaItem = { url: string; type: "image" | "video" };

const MediaPreviewModal: React.FC<{ items: MediaItem[]; onClose: () => void }> = ({ items, onClose }) => {
  const [previewIdx, setPreviewIdx] = useState(-1);

  if (items.length === 0) return null;

  const imageCount = items.filter((i) => i.type === "image").length;
  const videoCount = items.filter((i) => i.type === "video").length;
  const title = [
    imageCount > 0 ? `${imageCount} 张图片` : "",
    videoCount > 0 ? `${videoCount} 个视频` : "",
  ].filter(Boolean).join("，");

  return (
    <div className="fixed inset-0 z-[10000] bg-black/30" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full max-w-[480px] overflow-y-auto border-l border-gray-200 bg-white p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">响应媒体预览 ({title})</h3>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <span className="material-icons-round">close</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {items.map((item, idx) => (
            <div
              key={item.url + idx}
              className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden cursor-pointer hover:shadow-md transition-shadow group"
              onClick={() => setPreviewIdx(idx)}
            >
              <div className="relative h-32 flex items-center justify-center bg-white overflow-hidden">
                {item.type === "image" ? (
                  <img src={getOssThumbnailUrl(item.url, 300, 80)} alt={`图片 ${idx + 1}`} className="max-w-full max-h-32 object-contain transition-transform group-hover:scale-[1.03]" />
                ) : (
                  <div className="relative w-full h-full flex items-center justify-center bg-gray-900">
                    <img src={getOssVideoSnapshotUrl(item.url, 0, 300)} alt={`视频 ${idx + 1}`} className="max-w-full max-h-32 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="material-icons-round text-white text-3xl drop-shadow-lg">play_circle</span>
                    </div>
                  </div>
                )}
                <span className="absolute top-1.5 left-1.5 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm flex items-center gap-1">
                  <span className="material-icons-round text-[10px]">{item.type === "image" ? "image" : "videocam"}</span>
                  {idx + 1}/{items.length}
                </span>
              </div>
              <div className="p-1.5">
                <div className="text-[10px] text-gray-500 truncate" title={item.url}>{item.url.split("/").pop() ?? item.url}</div>
              </div>
            </div>
          ))}
        </div>

        {previewIdx >= 0 && previewIdx < items.length && (
          <div className="fixed inset-0 z-[10001] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setPreviewIdx(-1)}>
            <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setPreviewIdx(-1)} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white/90 text-gray-700 hover:bg-white shadow-lg flex items-center justify-center transition-all z-10">
                <span className="material-icons-round text-sm">close</span>
              </button>
              {items.length > 1 && (
                <>
                  <button onClick={() => setPreviewIdx((i) => (i - 1 < 0 ? items.length - 1 : i - 1))} className="absolute -left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 text-gray-700 hover:bg-white shadow-lg flex items-center justify-center transition-all z-10">
                    <span className="material-icons-round">chevron_left</span>
                  </button>
                  <button onClick={() => setPreviewIdx((i) => (i + 1 >= items.length ? 0 : i + 1))} className="absolute -right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 text-gray-700 hover:bg-white shadow-lg flex items-center justify-center transition-all z-10">
                    <span className="material-icons-round">chevron_right</span>
                  </button>
                </>
              )}
              {items[previewIdx].type === "image" ? (
                <img src={items[previewIdx].url} alt={`图片 ${previewIdx + 1}`} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
              ) : (
                <video src={items[previewIdx].url} controls autoPlay className="max-w-full max-h-[85vh] rounded-lg shadow-2xl" />
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4 rounded-b-lg flex items-center justify-between">
                <p className="text-white/90 text-sm truncate flex-1">{items[previewIdx].url.split("/").pop()}</p>
                {items.length > 1 && <span className="text-white/70 text-xs ml-3 shrink-0">{previewIdx + 1} / {items.length}</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 审计记录卡片
// ============================================================================

// ============================================================================
// 基于 requestId 的 Submit-Query 配对
// ============================================================================

/**
 * 将审计记录按 requestId 分组（requestId 以 "pair-" 开头的为配对任务）
 * 返回：统一排序后的列表项（pair 或 single）
 */
function groupPairedAudits(audits: AuditItem[]): Array<
  | { type: 'pair'; requestId: string; submit: AuditItem; query?: AuditItem; createdAt: number }
  | { type: 'single'; audit: AuditItem; createdAt: number }
> {
  const singles: AuditItem[] = [];
  const pairMap = new Map<string, { submit?: AuditItem; query?: AuditItem }>();

  for (const audit of audits) {
    const rid = audit.requestId;
    if (!rid || !rid.startsWith("pair-")) {
      singles.push(audit);
      continue;
    }

    // 根据业务场景判断 submit vs query
    const ctx = (parseCallContext(audit.callContext).business ?? "").toLowerCase();
    const isQuery = ctx.includes("查询") || ctx.includes("query") || ctx.includes("轮询");

    const existing = pairMap.get(rid);
    if (!existing) {
      pairMap.set(rid, { submit: isQuery ? undefined : audit, query: isQuery ? audit : undefined });
    } else if (isQuery && !existing.query) {
      existing.query = audit;
    } else if (isQuery && existing.query) {
      // 重复 Query 记录：取最新的覆盖，旧的丢弃
      if (audit.createdAt > existing.query.createdAt) {
        existing.query = audit;
      }
    } else if (!isQuery && !existing.submit) {
      existing.submit = audit;
    } else if (!isQuery && existing.submit) {
      // 重复 Submit 记录：取最新的覆盖
      if (audit.createdAt > existing.submit.createdAt) {
        existing.submit = audit;
      }
    }
  }

  // 构建统一列表
  const items: Array<
    | { type: 'pair'; requestId: string; submit: AuditItem; query?: AuditItem; createdAt: number }
    | { type: 'single'; audit: AuditItem; createdAt: number }
  > = [];

  // 配对组（完整 pair）
  for (const [requestId, group] of pairMap) {
    if (group.submit && group.query) {
      items.push({ type: 'pair', requestId, submit: group.submit, query: group.query, createdAt: group.submit.createdAt });
    } else if (group.submit) {
      items.push({ type: 'single', audit: group.submit, createdAt: group.submit.createdAt });
    } else if (group.query) {
      items.push({ type: 'single', audit: group.query, createdAt: group.query.createdAt });
    }
  }

  // 独立的非配对记录
  for (const audit of singles) {
    items.push({ type: 'single', audit, createdAt: audit.createdAt });
  }

  // 统一按 createdAt 倒序排序（最新在前）
  items.sort((a, b) => b.createdAt - a.createdAt);

  return items;
}


// ============================================================================
// 审计记录卡片
// ============================================================================

/** 从审计记录中提取 poll 次数（后端格式："(第N次轮询)"） */
function extractPollCount(audit: AuditItem): number | null {
  const msg = audit.messagesJson ?? audit.responseSummary ?? audit.requestSummary ?? "";
  const match = typeof msg === "string" ? msg.match(/第(\d+)次轮询/) : null;
  return match ? Number(match[1]) : null;
}

const AuditCard: React.FC<{ audit: AuditItem; token: string; pairedStage?: "submit" | "query" | null; pollCount?: number | null }> = ({ audit, token, pairedStage, pollCount }) => {
  const toast = useToast();
  const parsed = parseRequestSummary(audit.requestSummary);
  const response = parseResponseSummary(audit.responseSummary);
  const callContextInfo = parseCallContext(audit.callContext);
  const queryParamsInfo = parseJsonSafe<Record<string, unknown>>(audit.queryParamsJson);

  // 展开详情时按需加载完整审计记录（含大 JSON 字段）
  const [detailExpanded, setDetailExpanded] = useState(false);
  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ["admin-provider-audit-detail", token, audit.id],
    queryFn: async () => {
      const res = await backendApi.adminProviderAuditDetail(token, audit.id);
      return res.audit as unknown as AuditItem;
    },
    enabled: detailExpanded && Boolean(token),
    staleTime: 60_000,
  });

  // 大字段只在详情加载后解析
  const fullAudit = detailData ?? audit;
  const requestHeadersInfo = detailData ? parseJsonSafe(detailData.requestHeadersJson) : null;
  const requestBodyInfo = detailData ? parseRequestBody(detailData.requestBodyJson) : null;
  const attemptsInfo = detailData ? parseJsonSafe<unknown[]>(detailData.attemptsJson) : null;
  const mediaMessagesInfo = detailData ? parseMediaMessages(detailData.messagesJson) : null;

  // 复制到剪贴板
  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label}已复制到剪贴板`);
    } catch (err) {
      toast.error("复制失败");
    }
  };

  // Body 图片提取
  const bodyImageUrls = useMemo(() => {
    if (!requestBodyInfo || typeof requestBodyInfo !== "object") return [];
    return extractImageUrlsFromJson(requestBodyInfo);
  }, [requestBodyInfo]);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);

  // LLM 响应媒体提取（图片 + 视频）
  const responseMediaItems = useMemo(() => {
    const items: MediaItem[] = [];
    // 从文本响应中提取（视频优先，避免 parseUrls 逐行解析误将视频 URL 归类为图片）
    if (response.text) {
      items.push(...extractVideoUrlsFromText(response.text).map((url) => ({ url, type: "video" as const })));
      items.push(...parseUrls(response.text).map((url) => ({ url, type: "image" as const })));
    }
    // 从 JSON 响应中提取
    if (response.payload) {
      items.push(...extractVideoUrlsFromJson(response.payload).map((url) => ({ url, type: "video" as const })));
      items.push(...extractImageUrlsFromJson(response.payload).map((url) => ({ url, type: "image" as const })));
    }
    // 去重（同 URL 只保留首次出现的类型，视频优先）
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  }, [response.text, response.payload]);
  const [responsePreviewOpen, setResponsePreviewOpen] = useState(false);

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="font-semibold text-gray-900">{audit.providerId}</div>
          {/* 配对任务阶段标签 */}
          {pairedStage && (
            <span className={`rounded px-2 py-0.5 font-semibold text-xs ${
              pairedStage === "submit"
                ? "bg-purple-100 text-purple-700 border border-purple-200"
                : "bg-cyan-100 text-cyan-700 border border-cyan-200"
            }`}>
              {pairedStage === "submit" ? "提交" : "查询"}{pollCount != null ? ` · 第${pollCount}次轮询` : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {parsed.hasMedia && (
            <span className="rounded bg-purple-100 px-2 py-0.5 font-semibold text-purple-700 flex items-center gap-1">
              <span className="material-icons-round text-sm">
                {parsed.hasMedia === "video" ? "videocam" : "image"}
              </span>
              {parsed.hasMedia === "video" ? "视频" : "图片"}
            </span>
          )}
          <span className={`rounded px-2 py-0.5 font-semibold ${
            audit.status === "success" ? "bg-green-100 text-green-700"
              : audit.status === "timeout" ? "bg-yellow-100 text-yellow-700"
                : "bg-red-100 text-red-700"
          }`}>
            {audit.status}
          </span>
        </div>
      </div>
      <div className="mt-1 text-[11px] text-gray-500">
        <span className="font-semibold text-gray-700">{audit.routeKey}</span>

        · {new Date(audit.createdAt).toLocaleString()} · {(audit.latencyMs / 1000).toFixed(1)}s
      </div>

      {/* 调用位置 */}
      <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2">
        <div className="mb-1 font-semibold text-amber-800">调用位置</div>
        <div className="text-[11px] text-amber-700">
          <span className="font-medium">业务场景：</span>
          <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 font-mono font-medium text-amber-800">
            {callContextInfo.business ?? audit.routeKey}
          </span>
        </div>
        {audit.actualEndpoint ? (
          <div className="text-[11px] text-amber-700 mt-1">
            <span className="font-medium">API 地址：</span>
            <a href={audit.actualEndpoint} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{audit.actualEndpoint}</a>
          </div>
        ) : (
          <div className="text-[11px] text-gray-400 italic mt-1">API 地址：未记录</div>
        )}
        {queryParamsInfo && (
          <details className="mt-1">
            <summary className="cursor-pointer text-[11px] text-amber-600 hover:text-amber-800">Query 参数 ({Object.keys(queryParamsInfo).length} 个)</summary>
            <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] text-amber-600">{JSON.stringify(queryParamsInfo, null, 2)}</pre>
          </details>
        )}
        {callContextInfo.stack && (
          <details className="mt-1">
            <summary className="cursor-pointer text-[11px] text-amber-600 hover:text-amber-800">展开调用栈</summary>
            <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] text-amber-600">{callContextInfo.stack}</pre>
          </details>
        )}
      </div>

      {/* ====== 详情区域（按需加载） ====== */}
      {!detailExpanded ? (
        <button
          type="button"
          onClick={() => setDetailExpanded(true)}
          className="mt-2 w-full rounded border border-dashed border-gray-300 py-1.5 text-[11px] text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          展开详情
        </button>
      ) : detailLoading ? (
        <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-2 text-[11px] text-gray-400 text-center">加载详情中...</div>
      ) : (
      <>
      {/* Headers */}
      <details className="mt-2 rounded border border-indigo-200 bg-indigo-50">
        <summary className="cursor-pointer p-2 font-semibold text-indigo-700 hover:bg-indigo-100">
          Headers {requestHeadersInfo ? `(${Object.keys(requestHeadersInfo).length} 个)` : "(未记录)"}
        </summary>
        <div className="p-2 pt-0">
          {requestHeadersInfo ? (
            <pre className="whitespace-pre-wrap break-all text-[11px] text-indigo-600">{JSON.stringify(requestHeadersInfo, null, 2)}</pre>
          ) : (
            <div className="text-[11px] text-gray-400 italic">未记录</div>
          )}
        </div>
      </details>

      {/* Body */}
      <details className="mt-2 rounded border border-cyan-200 bg-cyan-50">
        <summary className="cursor-pointer p-2 font-semibold text-cyan-700 hover:bg-cyan-100 flex items-center justify-between">
          <span>Body {requestBodyInfo ? (typeof requestBodyInfo === "object" ? `(${Object.keys(requestBodyInfo).length} 个字段)` : "") : "(未记录)"}</span>
          <div className="flex items-center gap-1">
            {requestBodyInfo && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const text = typeof requestBodyInfo === "object" ? JSON.stringify(requestBodyInfo, null, 2) : requestBodyInfo;
                  handleCopy(text, "Body");
                }}
                className="rounded p-1 hover:bg-cyan-200 transition-colors"
                title="复制 Body 内容"
              >
                <span className="material-icons-round text-sm text-cyan-800">content_copy</span>
              </button>
            )}
            {bodyImageUrls.length > 0 && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setImagePreviewOpen(true); }}
                className="flex items-center gap-1 rounded px-2 py-0.5 bg-cyan-100 text-cyan-800 hover:bg-cyan-200 transition-colors text-[11px]"
                title={`查看 Body 中的 ${bodyImageUrls.length} 张图片`}
              >
                <span className="material-icons-round text-sm">image</span>
                {bodyImageUrls.length} 张图片
              </button>
            )}
          </div>
        </summary>
        <div className="p-2 pt-0">
          {requestBodyInfo ? (
            <pre className="whitespace-pre-wrap break-all text-[11px] text-cyan-600">
              {typeof requestBodyInfo === "object" ? JSON.stringify(requestBodyInfo, null, 2) : requestBodyInfo}
            </pre>
          ) : (
            <div className="text-[11px] text-gray-400 italic">未记录</div>
          )}
        </div>
      </details>

      {/* Body 图片预览弹窗 */}
      {imagePreviewOpen && bodyImageUrls.length > 0 && (
        <BodyImagePreviewModal
          urls={bodyImageUrls}
          onClose={() => setImagePreviewOpen(false)}
        />
      )}

      {/* 基本信息 */}
      {(audit.providerVendor || audit.actualModel || audit.callMode || audit.ttftMs || audit.inputTokens || audit.outputTokens) && (
        <div className="mt-2 rounded border border-gray-200 bg-white p-2">
          <div className="mb-1 font-semibold text-gray-700">基本信息</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-gray-600">
            {audit.providerVendor && <div><span className="font-medium text-gray-500">Provider：</span>{audit.providerVendor}</div>}
            {audit.callMode && <div><span className="font-medium text-gray-500">CallMode：</span><span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-blue-700">{audit.callMode}</span></div>}
            {audit.actualModel && <div><span className="font-medium text-gray-500">Model：</span>{audit.actualModel}</div>}
            {audit.ttftMs != null && <div><span className="font-medium text-gray-500">TTFT：</span>{audit.ttftMs}ms</div>}
            {audit.inputTokens != null && <div><span className="font-medium text-gray-500">输入 Tokens：</span>{audit.inputTokens}</div>}
            {audit.outputTokens != null && <div><span className="font-medium text-gray-500">输出 Tokens：</span>{audit.outputTokens}</div>}
          </div>
        </div>
      )}

      {/* 重试链路 */}
      {attemptsInfo && Array.isArray(attemptsInfo) && attemptsInfo.length > 0 && (
        <div className="mt-2 rounded border border-orange-200 bg-orange-50 p-2">
          <div className="mb-1 font-semibold text-orange-800">重试链路 ({attemptsInfo.length} 次)</div>
          <div className="space-y-2">
            {(attemptsInfo as Array<{
              sequence?: number; providerId?: string; model?: string;
              paramsSummary?: string; status?: string; latencyMs?: number;
              errorCode?: string; errorMessage?: string | null; fallbackReason?: string;
            }>).map((attempt, idx) => (
              <div key={idx} className="text-[11px] text-orange-700 border-b border-orange-100 pb-2 last:border-b-0 last:pb-0">
                <div className="flex items-start gap-2">
                  <span className="font-mono text-orange-500 shrink-0">#{attempt.sequence ?? idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{attempt.providerId || "unknown"}</span>
                      {attempt.model && <span className="text-orange-600">({attempt.model})</span>}
                      <span className={`rounded px-1 shrink-0 ${
                        attempt.status === "success" ? "bg-green-100 text-green-600"
                          : attempt.status === "timeout" ? "bg-yellow-100 text-yellow-600"
                            : attempt.status === "error" ? "bg-red-100 text-red-600"
                              : "bg-gray-100 text-gray-600"
                      }`}>{attempt.status}</span>
                      {attempt.latencyMs !== undefined && <span className="text-orange-500">{attempt.latencyMs}ms</span>}
                    </div>
                    {attempt.paramsSummary && <div className="mt-0.5 text-orange-500 text-[10px]">参数: {attempt.paramsSummary}</div>}
                    {attempt.errorCode && (
                      <div className="mt-0.5">
                        <span className="font-mono text-red-500">[{attempt.errorCode}]</span>
                        {attempt.errorMessage && <span className="ml-1 text-orange-400">{attempt.errorMessage}</span>}
                      </div>
                    )}
                    {attempt.fallbackReason && <div className="mt-0.5 text-orange-500 text-[10px] italic">{attempt.fallbackReason}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 视频 URL（来自 messagesJson） */}
      {mediaMessagesInfo?.videoUrl && (
        <div className="mt-2 rounded border border-teal-200 bg-teal-50 p-2">
          <div className="mb-1 font-semibold text-teal-800 flex items-center gap-1">
            <span className="material-icons-round text-sm">videocam</span>
            视频 URL
          </div>
          <a href={mediaMessagesInfo.videoUrl} target="_blank" rel="noopener noreferrer"
            className="text-[11px] text-blue-600 hover:underline break-all">{mediaMessagesInfo.videoUrl}</a>
        </div>
      )}
      </>
      )}
      {/* ====== 详情区域结束 ====== */}

      {/* Query 参数 */}
      {queryParamsInfo && (
        <details className="mt-2 rounded border border-gray-200 bg-white">
          <summary className="cursor-pointer p-2 font-semibold text-gray-700 hover:bg-gray-50">Query 参数</summary>
          <div className="p-2 pt-0">
            <pre className="whitespace-pre-wrap break-all text-[11px] text-gray-600">{JSON.stringify(queryParamsInfo, null, 2)}</pre>
          </div>
        </details>
      )}

      {/* 上下文 */}
      {parsed.context && (
        <div className="mt-2 rounded border border-gray-200 bg-gray-100 p-2">
          <div className="mb-1 font-semibold text-gray-700">上下文</div>
          <pre className="whitespace-pre-wrap break-all text-[11px] text-gray-600">{parsed.context}</pre>
        </div>
      )}

      {/* 调试追踪 */}
      {response.trace && (
        <div className="mt-2 rounded border border-gray-200 bg-gray-100 p-2">
          <div className="mb-1 font-semibold text-gray-700">调试追踪</div>
          <pre className="whitespace-pre-wrap break-all text-[11px] text-gray-600">{response.trace}</pre>
        </div>
      )}

      {/* 响应文本 */}
      {response.text && (
        <div className="mt-2 rounded border border-green-200 bg-green-50 p-2">
          <div className="mb-1 flex items-center justify-between">
            <div className="font-semibold text-green-800">LLM 响应</div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleCopy(response.text!, "LLM 响应")}
                className="rounded p-1 hover:bg-green-200 transition-colors"
                title="复制 LLM 响应"
              >
                <span className="material-icons-round text-sm text-green-800">content_copy</span>
              </button>
              {responseMediaItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setResponsePreviewOpen(true)}
                  className="flex items-center gap-1 rounded px-2 py-0.5 bg-green-100 text-green-800 hover:bg-green-200 transition-colors text-[11px]"
                  title={`预览响应中的 ${responseMediaItems.length} 个媒体`}
                >
                  <span className="material-icons-round text-sm">perm_media</span>
                  {responseMediaItems.length} 个媒体
                </button>
              )}
            </div>
          </div>
          <pre className="whitespace-pre-wrap break-all text-[11px] text-green-700 max-h-96 overflow-y-auto">{response.text}</pre>
        </div>
      )}

      {/* 响应 JSON */}
      {response.payload && (
        <div className="mt-2 rounded border border-green-200 bg-green-50 p-2">
          <div className="mb-1 flex items-center justify-between">
            <div className="font-semibold text-green-800">LLM 响应 (JSON)</div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleCopy(JSON.stringify(response.payload, null, 2), "LLM 响应 JSON")}
                className="rounded p-1 hover:bg-green-200 transition-colors"
                title="复制 LLM 响应 JSON"
              >
                <span className="material-icons-round text-sm text-green-800">content_copy</span>
              </button>
              {responseMediaItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setResponsePreviewOpen(true)}
                  className="flex items-center gap-1 rounded px-2 py-0.5 bg-green-100 text-green-800 hover:bg-green-200 transition-colors text-[11px]"
                  title={`预览响应中的 ${responseMediaItems.length} 个媒体`}
                >
                  <span className="material-icons-round text-sm">perm_media</span>
                  {responseMediaItems.length} 个媒体
                </button>
              )}
            </div>
          </div>
          <pre className="whitespace-pre-wrap break-all text-[11px] text-green-700 max-h-96 overflow-y-auto">{JSON.stringify(response.payload, null, 2)}</pre>
        </div>
      )}

      {/* 原始响应摘要 fallback */}
      {!response.text && !response.payload && !response.trace && audit.responseSummary && (
        <div className="mt-2 rounded border border-gray-200 bg-white p-2">
          <div className="mb-1 font-semibold text-gray-700">响应摘要</div>
          <pre className="whitespace-pre-wrap break-all text-[11px] text-gray-600">{audit.responseSummary}</pre>
        </div>
      )}

      {/* 原始请求摘要 fallback */}
      {!parsed.system && !parsed.user && !parsed.prompt && !parsed.context && !parsed.images && !parsed.params && audit.requestSummary && (
        <div className="mt-2 rounded border border-gray-200 bg-white p-2">
          <div className="mb-1 font-semibold text-gray-700">请求摘要</div>
          <pre className="whitespace-pre-wrap break-all text-[11px] text-gray-600">{audit.requestSummary}</pre>
        </div>
      )}

      {/* 无响应 */}
      {!response.text && !response.payload && !response.trace && !audit.responseSummary && (
        <div className="mt-2 rounded border border-gray-200 bg-gray-100 p-2 text-gray-500">暂无响应记录</div>
      )}

      {/* 错误 */}
      {audit.errorCode && (
        <div className="mt-2 rounded border border-red-200 bg-red-50 p-2">
          <div className="mb-1 font-semibold text-red-800">错误信息</div>
          <div className="text-[11px] text-red-700">
            <span className="font-mono">{audit.errorCode}</span>
            {audit.errorMessage && <span className="ml-2">{audit.errorMessage}</span>}
          </div>
        </div>
      )}

      {/* LLM 响应媒体预览弹窗（放在最外层，确保始终可渲染） */}
      {responsePreviewOpen && responseMediaItems.length > 0 && (
        <MediaPreviewModal
          items={responseMediaItems}
          onClose={() => setResponsePreviewOpen(false)}
        />
      )}
    </div>
  );
};

// ============================================================================
// 接口调用 Tab（前端 → 后端 API 调用记录）
// ============================================================================

const ApiCallPanel: React.FC = () => {
  const [seq, setSeq] = useState(getApiCallSeq());

  // 定时刷新：轮询 seq 变化
  useQuery({
    queryKey: ["api-call-log-poll", seq],
    queryFn: async () => {
      const newSeq = getApiCallSeq();
      if (newSeq !== seq) setSeq(newSeq);
      return newSeq;
    },
    refetchInterval: 2000,
  });

  const records = getApiCallLog();

  if (records.length === 0) {
    return (
      <div className="rounded border border-dashed border-gray-300 px-3 py-6 text-center text-xs text-gray-500">
        暂无接口调用记录，操作页面后自动捕获。
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-500">最近 {records.length} 条调用</span>
      </div>
      {[...records].reverse().map((record) => (
        <ApiCallCard key={record.id} record={record} />
      ))}
    </div>
  );
};

const ApiCallCard: React.FC<{ record: ApiCallRecord }> = ({ record }) => {
  const [expanded, setExpanded] = useState(false);

  const methodColor: Record<string, string> = {
    GET: "bg-blue-100 text-blue-700",
    POST: "bg-green-100 text-green-700",
    PUT: "bg-yellow-100 text-yellow-700",
    PATCH: "bg-yellow-100 text-yellow-700",
    DELETE: "bg-red-100 text-red-700",
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 text-xs">
      {/* 头部：方法 + 路径 + 状态 + 耗时 */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-2.5 text-left hover:bg-gray-100 transition-colors"
      >
        <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono font-semibold text-[10px] ${methodColor[record.method] ?? "bg-gray-100 text-gray-700"}`}>
          {record.method}
        </span>
        <span className="flex-1 min-w-0 truncate font-mono text-gray-800" title={record.path}>
          {record.path}
        </span>
        {record.status !== null ? (
          <span className={`shrink-0 rounded px-1.5 py-0.5 font-semibold ${
            record.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          }`}>
            {record.status}
          </span>
        ) : (
          <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-700">ERR</span>
        )}
        <span className="shrink-0 text-[10px] text-gray-400">{record.durationMs}ms</span>
        <span className={`material-icons-round text-sm text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}>expand_more</span>
      </button>

      {/* 错误摘要 */}
      {record.errorMessage && !expanded && (
        <div className="px-2.5 pb-2 text-[10px] text-red-600 truncate">{record.errorMessage}</div>
      )}

      {/* 展开详情 */}
      {expanded && (
        <div className="border-t border-gray-200 p-2.5 space-y-2">
          <div className="flex items-center gap-3 text-[10px] text-gray-500">
            <span>{formatTime(record.timestamp)}</span>
            <span>耗时 {record.durationMs}ms</span>
          </div>

          {/* 请求体 */}
          {record.requestBody && (
            <div>
              <div className="mb-1 font-semibold text-cyan-700 text-[11px]">请求体</div>
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-all rounded bg-cyan-50 p-2 text-[10px] text-cyan-700">{record.requestBody}</pre>
            </div>
          )}

          {/* 响应体 */}
          {record.responseBody && (
            <div>
              <div className="mb-1 font-semibold text-green-700 text-[11px]">响应体</div>
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-all rounded bg-green-50 p-2 text-[10px] text-green-700">{record.responseBody}</pre>
            </div>
          )}

          {/* 错误 */}
          {record.errorCode && (
            <div>
              <div className="mb-1 font-semibold text-red-700 text-[11px]">错误</div>
              <div className="rounded bg-red-50 p-2 text-[10px] text-red-700">
                <span className="font-mono">[{record.errorCode}]</span>
                {record.errorMessage && <span className="ml-1">{record.errorMessage}</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 错误日志 Tab
// ============================================================================

const ErrorLogPanel: React.FC<{ token: string }> = ({ token }) => {
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // 今日零点的时间戳（毫秒）
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["error-logs-bubble", token, page, todayStart],
    queryFn: () => backendApi.errorLogsList(token, { page, pageSize, startDate: todayStart }),
  });

  const items = data?.items ?? [];

  const severityColor = (severity: string) => {
    if (severity === "critical") return "bg-red-100 text-red-700";
    if (severity === "error") return "bg-orange-100 text-orange-700";
    return "bg-yellow-100 text-yellow-700";
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={() => void refetch()}>刷新</Button>
        <span className="text-[11px] text-gray-500">第 {page} 页</span>
      </div>

      {isLoading ? (
        <div className="py-6 text-center text-xs text-gray-400">加载中...</div>
      ) : items.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 px-3 py-4 text-xs text-gray-500">暂无错误日志</div>
      ) : (
        <>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono font-semibold ${severityColor(item.severity)}`}>
                      {item.severity}
                    </span>
                    <span className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-red-700 shrink-0">{item.errorCode}</span>
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0">{formatTime(item.createdAt)}</span>
                </div>
                <div className="mt-1.5 text-[11px] text-gray-700 break-all line-clamp-2">{item.errorMessage}</div>
                {item.apiPath && (
                  <div className="mt-1 text-[10px] text-gray-500">
                    <span className="font-medium">API：</span>{item.apiPath}
                  </div>
                )}
                {item.sourceModule && (
                  <div className="text-[10px] text-gray-500">
                    <span className="font-medium">模块：</span>{item.sourceModule}
                  </div>
                )}
                {item.errorStack && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[10px] text-blue-600 hover:text-blue-800">展开堆栈</summary>
                    <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-all rounded bg-white p-2 text-[10px] text-gray-600">{item.errorStack}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>

          {/* 分页 */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-gray-500">第 {page} 页</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded border border-gray-200 px-3 py-1 text-[11px] hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >上一页</button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={items.length < pageSize}
                className="rounded border border-gray-200 px-3 py-1 text-[11px] hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >下一页</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ============================================================================
// 主组件
// ============================================================================

export const LlmDebugBubble: React.FC = () => {
  const token = useAppStore((state) => state.token);
  const currentUser = useAppStore((state) => state.currentUser);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("audit");
  const [routeKeyFilter, setRouteKeyFilter] = useState<string>("all");
  const isAdmin = currentUser?.role === "admin";

  const configQuery = useQuery({
    queryKey: ["admin-config", token],
    queryFn: async () => backendApi.adminConfigGet(token as string),
    enabled: isAdmin && Boolean(token),
    staleTime: 60_000,
  });

  const auditsQuery = useQuery({
    queryKey: ["admin-provider-audits", token, 40],
    queryFn: async () => backendApi.adminProviderAudits(token as string, 40),
    enabled: isAdmin && Boolean(token) && (configQuery.data?.adminLlmDebugBubbleEnabled ?? true),
    refetchInterval: drawerOpen ? 15_000 : false,
  });

  // 过滤后的审计记录（仅按业务场景过滤）
  const audits = useMemo(() => {
    const raw = auditsQuery.data?.audits ?? [];
    return raw.filter((audit) => {
      if (routeKeyFilter !== "all" && audit.routeKey !== routeKeyFilter) return false;
      return true;
    }).slice(0, 20);
  }, [auditsQuery.data?.audits, routeKeyFilter]);

  // 按 requestId 分组并统一排序
  const auditItems = useMemo(() => groupPairedAudits(audits as unknown as AuditItem[]), [audits]);

  // 业务场景选项
  const routeKeyOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const audit of auditsQuery.data?.audits ?? []) {
      if (audit.routeKey) keys.add(audit.routeKey);
    }
    return [...keys].sort();
  }, [auditsQuery.data?.audits]);

  if (!isAdmin) return null;
  if (!(configQuery.data?.adminLlmDebugBubbleEnabled ?? true)) return null;

  const tabs: { key: TabType; label: string }[] = [
    { key: "audit", label: "审计记录" },
    { key: "call", label: "接口调用" },
    { key: "error", label: "错误日志" },
  ];

  return (
    <>
      {/* 触发按钮 */}
      <button
        type="button"
        data-testid="project-debug-bubble-trigger"
        onClick={() => setDrawerOpen(true)}
        className="fixed right-4 top-1/3 z-[9999] -translate-y-1/2 rounded-full border border-blue-200 bg-white p-3 text-blue-600 shadow-lg shadow-blue-100 hover:bg-blue-50"
        title="打开调试气泡"
      >
        <span className="material-icons-round text-lg">tips_and_updates</span>
      </button>

      {drawerOpen && (
        <div className="fixed inset-0 z-[9999] flex">
          <div className="flex-1 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <div
            className="h-full w-full max-w-[560px] overflow-y-auto overflow-x-hidden border-l border-gray-200 bg-white p-4 shadow-2xl"
            data-testid="project-debug-bubble-drawer"
          >
            {/* 标题栏 */}
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">调试气泡</h3>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
              >
                <span className="material-icons-round">close</span>
              </button>
            </div>

            {/* Tab 切换 */}
            <div className="mb-3 flex gap-1 rounded-lg bg-gray-100 p-1">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeTab === tab.key
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 审计记录 Tab */}
            {activeTab === "audit" && (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" onClick={() => void auditsQuery.refetch()} disabled={auditsQuery.isFetching}>{auditsQuery.isFetching ? "加载中..." : "刷新"}</Button>
                    <select
                      value={routeKeyFilter}
                      onChange={(e) => setRouteKeyFilter(e.target.value)}
                      className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:border-blue-300"
                    >
                      <option value="all">全部场景</option>
                      {routeKeyOptions.map((key) => (
                        <option key={key} value={key}>{key}</option>
                      ))}
                    </select>
                  </div>
                  <span className="text-xs text-gray-500">最近 {audits.length} 条</span>
                </div>

                <div className="space-y-3">
                  {/* 统一按时间排序显示 */}
                  {auditItems.map((item) => {
                    if (item.type === 'pair') {
                      return (
                        <div key={item.requestId} className="rounded-lg border border-blue-200 bg-blue-50/30 overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border-b border-blue-200 text-[11px]">
                            <span className="material-icons-round text-sm text-blue-500">link</span>
                            <span className="font-semibold text-blue-700">配对任务</span>
                            <span className="text-blue-400 font-mono">{item.requestId}</span>
                            {item.query && item.submit.status === "success" && item.query.status === "success" &&
                              item.query.responseSummary && !item.query.responseSummary.includes("等待下次查询") && (
                              <span className="ml-auto font-semibold text-green-700">
                                总耗时 {((item.query.createdAt + item.query.latencyMs - item.submit.createdAt) / 1000).toFixed(1)}s
                              </span>
                            )}
                          </div>
                          <div className="space-y-2 p-2">
                            <AuditCard audit={item.submit} token={token!} pairedStage="submit" />
                            {item.query && <AuditCard audit={item.query} token={token!} pairedStage="query" pollCount={extractPollCount(item.query)} />}
                          </div>
                        </div>
                      );
                    } else {
                      return <AuditCard key={item.audit.id} audit={item.audit} token={token!} />;
                    }
                  })}
                  {audits.length === 0 && (
                    <div className="rounded border border-dashed border-gray-300 px-3 py-4 text-xs text-gray-500">
                      暂无审计记录，先触发一次脚本/反推/Step1 搜图 grounding 请求。
                    </div>
                  )}
                </div>
              </>
            )}

            {/* 接口调用 Tab */}
            {activeTab === "call" && <ApiCallPanel />}

            {/* 错误日志 Tab */}
            {activeTab === "error" && <ErrorLogPanel token={token!} />}
          </div>
        </div>
      )}
    </>
  );
};
