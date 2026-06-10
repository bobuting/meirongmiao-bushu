import { sanitizeUrlField } from "./contracts/media-url-safety.js";

export type StoryboardGenerationMode = "text_to_image" | "image_to_image";

export interface StoryboardSceneRefInput {
  readonly sceneImageUrl?: string | null;
}

export interface SanitizedStoryboardSceneRef {
  readonly sceneImageUrl: string | null;
  readonly mode: StoryboardGenerationMode;
  readonly images?: readonly string[];
}

export interface StoryboardGenerateFrameInput extends Record<string, unknown> {
  readonly sceneImageUrl?: string | null;
}

export interface StoryboardGenerateRequestInput extends Record<string, unknown> {
  readonly frames?: readonly StoryboardGenerateFrameInput[];
}

export function resolveStoryboardSceneRef(value: unknown): SanitizedStoryboardSceneRef {
  const sceneImageUrl = sanitizeUrlField(value);
  if (!sceneImageUrl) {
    return {
      sceneImageUrl: null,
      mode: "text_to_image",
    };
  }
  return {
    sceneImageUrl,
    mode: "image_to_image",
    images: [sceneImageUrl],
  };
}

export function sanitizeStoryboardGenerateFrames<T extends StoryboardGenerateFrameInput>(
  frames: readonly T[] | null | undefined,
): T[] {
  if (!Array.isArray(frames)) {
    return [];
  }
  return frames.map((frame) => ({
    ...frame,
    sceneImageUrl: resolveStoryboardSceneRef(frame.sceneImageUrl).sceneImageUrl,
  }));
}

export function sanitizeStoryboardGeneratePayload<T extends StoryboardGenerateRequestInput>(payload: T): T {
  if (!Array.isArray(payload.frames)) {
    return payload;
  }
  return {
    ...payload,
    frames: sanitizeStoryboardGenerateFrames(payload.frames),
  };
}
