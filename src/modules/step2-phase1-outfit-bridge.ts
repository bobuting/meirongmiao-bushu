export interface Step2Phase1OutfitSeed {
  planId: string;
  optimizedPrompt?: string | null;
  analysis?: string | null;
}

export interface Step2Phase1OutfitBridgeInput {
  selectedPlanId: string | null | undefined;
  selectedOutfitSource: "visual" | "analysis" | null | undefined;
  promptDraftByPlanId: Readonly<Record<string, string>>;
  analysisCards: readonly Step2Phase1OutfitSeed[];
  persistedOutfitSummary?: string | null;
}

export interface Step2Phase1OutfitBridgeResult {
  phase1OutfitEnglish: string;
  source:
    | "analysis-draft"
    | "analysis-optimized"
    | "visual-analysis-optimized"
    | "persisted-summary"
    | "generic-fallback";
  usedFallback: boolean;
}

const STEP2_PHASE1_OUTFIT_GENERIC_FALLBACK =
  "coordinated Phase 1 outfit with the confirmed garments, accessories, and stable styling details";

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function looksEnglishPrompt(value: string): boolean {
  const normalized = normalizeText(value);
  if (!normalized) {
    return false;
  }
  if (!/[A-Za-z]/.test(normalized)) {
    return false;
  }
  const letters = normalized.replace(/[^A-Za-z]/g, "").length;
  const cjk = (normalized.match(/[\u3400-\u9fff]/gu) ?? []).length;
  return letters > cjk;
}

function findAnalysisCard(planId: string, analysisCards: readonly Step2Phase1OutfitSeed[]): Step2Phase1OutfitSeed | null {
  return analysisCards.find((item) => normalizeText(item.planId) === planId) ?? null;
}

export function buildStep2Phase1OutfitBridge(
  input: Step2Phase1OutfitBridgeInput,
): Step2Phase1OutfitBridgeResult {
  const selectedPlanId = normalizeText(input.selectedPlanId);
  const selectedOutfitSource = input.selectedOutfitSource === "analysis" ? "analysis" : input.selectedOutfitSource === "visual" ? "visual" : null;
  const draft = selectedPlanId ? normalizeText(input.promptDraftByPlanId[selectedPlanId]) : "";
  const analysisCard = selectedPlanId ? findAnalysisCard(selectedPlanId, input.analysisCards) : null;
  const optimizedPrompt = normalizeText(analysisCard?.optimizedPrompt);
  const persistedSummary = normalizeText(input.persistedOutfitSummary);

  if (selectedOutfitSource === "analysis" && looksEnglishPrompt(draft)) {
    return {
      phase1OutfitEnglish: draft,
      source: "analysis-draft",
      usedFallback: false,
    };
  }
  if (looksEnglishPrompt(optimizedPrompt)) {
    return {
      phase1OutfitEnglish: optimizedPrompt,
      source: selectedOutfitSource === "visual" ? "visual-analysis-optimized" : "analysis-optimized",
      usedFallback: false,
    };
  }
  if (looksEnglishPrompt(persistedSummary)) {
    return {
      phase1OutfitEnglish: persistedSummary,
      source: "persisted-summary",
      usedFallback: false,
    };
  }
  return {
    phase1OutfitEnglish: STEP2_PHASE1_OUTFIT_GENERIC_FALLBACK,
    source: "generic-fallback",
    usedFallback: true,
  };
}
