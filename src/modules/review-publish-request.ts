import {
  normalizeSquarePublishCategory,
  type SquarePublishCategory,
} from "../contracts/square-publish-category.js";

export interface ReviewPublishRequestPayload {
  resourceType: "reverse_script";
  resourceId: string;
  squareCategory: SquarePublishCategory | null;
}

export function normalizeReviewPublishRequestPayload(input: unknown): ReviewPublishRequestPayload {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("review publish request must be an object");
  }
  const record = input as Record<string, unknown>;
  const resourceType = record.resourceType === "reverse_script" ? record.resourceType : "reverse_script";
  const resourceId = typeof record.resourceId === "string" ? record.resourceId.trim() : "";
  if (!resourceId) {
    throw new Error("resourceId must be a non-empty string");
  }
  const squareCategory = normalizeSquarePublishCategory(record.squareCategory ?? null);
  return {
    resourceType,
    resourceId,
    squareCategory,
  };
}
