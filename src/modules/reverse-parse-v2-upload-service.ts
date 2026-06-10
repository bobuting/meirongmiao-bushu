import type { FastifyRequest } from "fastify";
import type { VideoReverseAnalysisServicePort } from "../contracts/video-reverse-analysis-service.js";
import type { VideoReverseAnalysisInput } from "../contracts/video-reverse-analysis.js";
import { parseVideoReverseMultipartRequest } from "./video-reverse-multipart-entry.js";
import { buildReverseStoryboardPanelViewModel } from "./reverse-storyboard-report-mapper.js";
import { buildReverseVideoUrlPayload } from "./video-reverse-url-entry.js";

export interface ParsedReverseParseV2UploadStartRequest {
  readonly projectId: string | null;
  readonly inputMode: "upload_file";
  readonly input: string;
  readonly normalizedInput: Extract<VideoReverseAnalysisInput, { sourceType: "upload_file" }>;
}

export interface ReverseParseV2UploadScriptHints {
  readonly source: "upload_file";
  readonly overviews: string[];
  readonly itemCount: number;
  readonly primaryItem: {
    readonly url: null;
    readonly title: string;
    readonly videoUrl: null;
    readonly audioUrl: null;
    readonly createTime: null;
    readonly playCount: null;
    readonly commentCount: null;
    readonly diggCount: null;
    readonly shareCount: null;
    readonly collectCount: null;
    readonly recommendCount: null;
    readonly nickname: null;
    readonly duration: null;
    readonly scriptText: string;
  };
}

export interface ReverseParseV2UploadRunResult {
  readonly response: Record<string, unknown>;
  readonly payload: ReturnType<typeof buildReverseVideoUrlPayload>;
  readonly storyboardPanel: ReturnType<typeof buildReverseStoryboardPanelViewModel>;
  readonly scriptHints: ReverseParseV2UploadScriptHints;
}

export async function parseReverseParseV2UploadStartRequest(
  request: FastifyRequest,
): Promise<
  | {
      readonly ok: true;
      readonly value: ParsedReverseParseV2UploadStartRequest;
    }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
    }
> {
  const multipartParse = await parseVideoReverseMultipartRequest(request);
  if (!multipartParse.ok) {
    return {
      ok: false,
      code: "INPUT_INVALID",
      message: multipartParse.issues[0]?.message ?? "video reverse multipart request is invalid",
    };
  }

  const query = (request.query as { projectId?: string } | undefined) ?? {};
  const projectId = typeof query.projectId === "string" && query.projectId.trim().length > 0
    ? query.projectId.trim()
    : null;
  const normalizedInput = multipartParse.value.normalizedInput;
  const fallbackName = normalizedInput.filename?.trim() || "uploaded-video";

  return {
    ok: true,
    value: {
      projectId,
      inputMode: "upload_file",
      input: fallbackName,
      normalizedInput,
    },
  };
}

export async function runReverseParseV2Upload(
  analysisService: VideoReverseAnalysisServicePort,
  payload: ParsedReverseParseV2UploadStartRequest,
): Promise<ReverseParseV2UploadRunResult> {
  const multimodalResult = await analysisService.run(payload.normalizedInput);
  const overviewText = multimodalResult.result.trim();
  const reversePayload = buildReverseVideoUrlPayload(overviewText);
  const storyboardPanel = buildReverseStoryboardPanelViewModel({
    sourceType: "upload_file",
    filename: payload.normalizedInput.filename ?? payload.input,
    mimeType: multimodalResult.videoMeta.mimeType,
    duration: null,
    rawMarkdown: overviewText,
    diagnostics: multimodalResult.diagnostics,
    raw: multimodalResult.raw,
  });
  const primaryItem = {
    url: null,
    title: payload.normalizedInput.filename ?? payload.input,
    videoUrl: null,
    audioUrl: null,
    createTime: null,
    playCount: null,
    commentCount: null,
    diggCount: null,
    shareCount: null,
    collectCount: null,
    recommendCount: null,
    nickname: null,
    duration: null,
    scriptText: overviewText,
  };
  const scriptHints: ReverseParseV2UploadScriptHints = {
    source: "upload_file",
    overviews: overviewText.length > 0 ? [overviewText] : [],
    itemCount: overviewText.length > 0 ? 1 : 0,
    primaryItem,
  };

  return {
    response: {
      id: null,
      projectId: payload.projectId,
      input: payload.input,
      status: "success",
      scriptVersionId: null,
      libraryScriptId: null,
      reverseStoryboardLibraryId: null,
      libraryScript: null,
      resolvedVideoUrl: null,
      fallback: false,
      code: undefined,
      message: "upload reverse parsed",
      inputMode: "upload_file",
      scriptHints,
      storyboardPanel,
    },
    payload: reversePayload,
    storyboardPanel,
    scriptHints,
  };
}
