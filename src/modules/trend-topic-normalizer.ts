export {
  mapDouhotEntryToTrendTopic,
  resolveReverseFetchStageOrder,
} from "./douyin-integration-service.js";

export interface VideoHotTrendBatchReverseCandidate {
  rank: number;
  topX: number;
  suitability: "high" | "medium" | "low" | null;
  sourceUrl: string | null;
  labels: string[];
}

export function shouldSelectVideoHotTrendBatchReverseCandidate(
  candidate: VideoHotTrendBatchReverseCandidate,
): boolean {
  if (!Number.isInteger(candidate.rank) || candidate.rank < 1) {
    return false;
  }
  if (!Number.isInteger(candidate.topX) || candidate.topX < 1) {
    return false;
  }
  if (candidate.rank > candidate.topX) {
    return false;
  }
  if (candidate.suitability === "low" || candidate.suitability === null) {
    return false;
  }
  if (!candidate.sourceUrl || candidate.sourceUrl.trim().length < 1) {
    return false;
  }
  return candidate.labels.some((label) => String(label ?? "").trim().length > 0);
}
