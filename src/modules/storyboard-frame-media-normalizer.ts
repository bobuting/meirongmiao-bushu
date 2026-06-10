import { isDataUrl, sanitizeUrlField } from "../contracts/media-url-safety.js";
import type { StoryboardFrame } from "../contracts/types.js";

export interface StoryboardFrameUrlPersistContext {
  readonly slot: "primary" | "variant";
  readonly variantIndex?: number;
}

export type StoryboardFrameUrlPersistor = (
  sourceUrl: string,
  context: StoryboardFrameUrlPersistContext,
) => Promise<string>;

function dedupeSafeUrls(items: Array<string | null | undefined>): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const normalized = sanitizeUrlField(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function assertSafeStoryboardFrameUrl(sourceUrl: string, persistedUrl: string, label: string): string {
  const safe = sanitizeUrlField(persistedUrl) ?? sanitizeUrlField(sourceUrl);
  if (safe) {
    return safe;
  }
  throw new Error(`STORYBOARD_FRAME_MEDIA_NOT_PERSISTABLE:${label}`);
}

export function storyboardFrameContainsInlineMediaUrls(
  frame: Pick<StoryboardFrame, "imageUrl" | "variants">,
): boolean {
  if (isDataUrl(frame.imageUrl)) {
    return true;
  }
  return Array.isArray(frame.variants) && frame.variants.some((item) => isDataUrl(item));
}

export async function normalizeStoryboardFrameMediaUrls(
  frame: StoryboardFrame,
  persistUrl: StoryboardFrameUrlPersistor,
): Promise<StoryboardFrame> {
  const primaryPersisted = await persistUrl(frame.imageUrl, { slot: "primary" });
  const primaryImageUrl = assertSafeStoryboardFrameUrl(frame.imageUrl, primaryPersisted, "primary");

  const sourceVariants =
    Array.isArray(frame.variants) && frame.variants.length > 0
      ? frame.variants
      : [frame.imageUrl];

  const persistedVariants = await Promise.all(
    sourceVariants.map(async (variantUrl, variantIndex) => {
      const persisted = await persistUrl(variantUrl, { slot: "variant", variantIndex });
      return assertSafeStoryboardFrameUrl(variantUrl, persisted, `variant-${variantIndex + 1}`);
    }),
  );

  const variants = dedupeSafeUrls(persistedVariants);
  if (!variants.includes(primaryImageUrl)) {
    variants.unshift(primaryImageUrl);
  }

  const selectedVariantIndex = Math.max(0, variants.indexOf(primaryImageUrl));

  return {
    ...frame,
    imageUrl: primaryImageUrl,
    variants,
    selectedVariantIndex,
  };
}
