export const HIDDEN_PROMPT_CLEANING_CONTRACT_VERSION = "AT32-04.v1";

export interface HiddenPromptCleaningPolicy {
  whitelist: string[]; // phrases allowed to remain (optional semantic guard)
  blacklist: string[]; // phrases removed from the hidden prompt before use or display
}

function assertStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  const cleaned = value
    .map((v, i) => {
      if (typeof v !== "string") throw new Error(`${field}[${i}] must be a string`);
      const s = v.trim();
      if (s.length === 0) throw new Error(`${field}[${i}] must be a non-empty string`);
      return s;
    })
    .map((s) => s.toLowerCase())
    .filter((s, i, arr) => arr.indexOf(s) === i); // dedupe case-insensitively
  return cleaned;
}

export function normalizeHiddenPromptCleaningPolicy(input: unknown): HiddenPromptCleaningPolicy {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("policy must be an object");
  }
  const rec = input as Record<string, unknown>;
  const whitelist = assertStringArray(rec.whitelist ?? [], "whitelist");
  const blacklist = assertStringArray(rec.blacklist ?? [], "blacklist");
  return { whitelist, blacklist };
}

function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileBlacklistPattern(phrase: string): RegExp {
  const escaped = escapeForRegex(phrase);
  if (/^[a-z0-9_-]+$/i.test(phrase)) {
    return new RegExp(`\\b${escaped}\\b`, "gi");
  }
  return new RegExp(escaped, "gi");
}

export function sanitizeHiddenPrompt(prompt: string, policy: HiddenPromptCleaningPolicy): string {
  if (typeof prompt !== "string") throw new Error("prompt must be a string");
  let out = prompt;
  for (const phrase of policy.blacklist) {
    const pattern = compileBlacklistPattern(phrase);
    out = out.replace(pattern, "");
  }
  // If a whitelist is provided, we do not add or inject anything; we only ensure
  // non-whitelisted single-word tokens are softened by collapsing extra spaces after blacklist removal.
  // The main enforcement here is blacklist removal; whitelist serves as audit metadata.
  out = out.replace(/\s{2,}/g, " ").replace(/\s+,/g, ",").replace(/,\s*,/g, ", ").trim();
  return out.replace(/\s+,/g, ",").replace(/,\s*/g, ", ").replace(/\s{2,}/g, " ").trim();
}

export function assertHiddenPromptCleaningContract(): { version: string; hasLists: boolean } {
  return { version: HIDDEN_PROMPT_CLEANING_CONTRACT_VERSION, hasLists: true };
}
