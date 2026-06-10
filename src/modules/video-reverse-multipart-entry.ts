import "@fastify/multipart";
import type { FastifyRequest } from "fastify";
import type { VideoReverseAnalysisInput } from "../contracts/video-reverse-analysis.js";
import { validateVideoReverseAnalysisInput } from "../contracts/video-reverse-analysis.js";
import {
  parseVideoReverseMultipartRuntime,
  validateVideoReverseMultipartEnvelope,
} from "../contracts/video-reverse-multipart-entry.js";

export interface VideoReverseMultipartFieldPart {
  readonly type: "field";
  readonly fieldname: string;
  readonly value: unknown;
}

export interface VideoReverseMultipartFilePart {
  readonly type: "file";
  readonly fieldname: string;
  readonly filename?: string;
  readonly mimetype?: string;
  readonly toBuffer: () => Promise<Buffer>;
}

export type VideoReverseMultipartPart = VideoReverseMultipartFieldPart | VideoReverseMultipartFilePart;

export interface ParsedVideoReverseMultipartEntry {
  readonly normalizedInput: Extract<VideoReverseAnalysisInput, { sourceType: "upload_file" }>;
}

export type ParseVideoReverseMultipartResult =
  | {
      readonly ok: true;
      readonly value: ParsedVideoReverseMultipartEntry;
    }
  | {
      readonly ok: false;
      readonly issues: readonly { field: string; message: string }[];
    };

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function parseVideoReverseMultipartParts(
  parts: AsyncIterable<VideoReverseMultipartPart>,
): Promise<ParseVideoReverseMultipartResult> {
  let userGoal = "";
  let locale: string | undefined;
  let runtimeRaw = "";
  let fileFieldName: string | undefined;
  let fileName: string | undefined;
  let mimeType: string | undefined;
  let fileBuffer: Buffer | null = null;
  const textFields: string[] = [];

  for await (const part of parts) {
    if (part.type === "file") {
      if (fileFieldName) {
        return {
          ok: false,
          issues: [
            {
              field: part.fieldname,
              message: "multipart upload must use the video field name",
            },
          ],
        };
      }
      fileFieldName = part.fieldname;
      fileName = normalizeString(part.filename);
      mimeType = normalizeString(part.mimetype);
      fileBuffer = await part.toBuffer();
      continue;
    }

    const fieldName = part.fieldname;
    textFields.push(fieldName);
    const value = String(part.value ?? "");
    if (fieldName === "userGoal") {
      userGoal = value;
    } else if (fieldName === "locale") {
      locale = normalizeString(value);
    } else if (fieldName === "runtime") {
      runtimeRaw = value;
    }
  }

  const envelopeIssues = validateVideoReverseMultipartEnvelope({
    fileFieldName,
    fileName,
    mimeType,
    sizeBytes: fileBuffer?.byteLength,
    textFields,
    runtimeRaw,
  });
  if (envelopeIssues.length > 0) {
    return {
      ok: false,
      issues: envelopeIssues.map((issue) => ({
        field: issue.field,
        message: issue.message,
      })),
    };
  }

  const runtimeResult = parseVideoReverseMultipartRuntime(runtimeRaw);
  if (!runtimeResult.ok || !fileBuffer) {
    return {
      ok: false,
      issues: [
        {
          field: "runtime",
          message: runtimeResult.ok ? "multipart upload requires a file field named video" : runtimeResult.error,
        },
      ],
    };
  }

  const validation = validateVideoReverseAnalysisInput({
    sourceType: "upload_file",
    userGoal,
    locale,
    videoBase64: fileBuffer.toString("base64"),
    mimeType,
    filename: fileName,
    runtime: runtimeResult.value,
  });

  if (!validation.ok || !validation.normalizedInput) {
    return {
      ok: false,
      issues: validation.issues.map((issue) => ({
        field: issue.field ?? "request",
        message: issue.message,
      })),
    };
  }

  return {
    ok: true,
    value: {
      normalizedInput: validation.normalizedInput as Extract<VideoReverseAnalysisInput, { sourceType: "upload_file" }>,
    },
  };
}

export async function parseVideoReverseMultipartRequest(
  request: FastifyRequest,
): Promise<ParseVideoReverseMultipartResult> {
  return await parseVideoReverseMultipartParts(request.parts() as AsyncIterable<VideoReverseMultipartPart>);
}
