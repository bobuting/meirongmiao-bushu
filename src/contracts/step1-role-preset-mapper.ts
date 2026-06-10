import {
  normalizeStep1RolePresetBundle,
  normalizeStep1RolePresetList,
  type Step1RolePreset,
  type Step1RolePresetBundle,
} from "./step1-role-preset-contract.js";
import { isStep1RolePresetTitleLike } from "./step1-role-preset-governance-contract.js";
import type { RoleStyleCategory } from "../contant-config/role-style-dict.js";
import { isValidRoleStyle, parseRoleStyleFromText } from "../contant-config/role-style-dict.js";

// AT32-10: Step1 联合反推人物预设输出清洗
// Purpose: map backend role preset bundle to a clean view model strictly about the person

export type Step1RolePresetCard = Step1RolePreset;

const DEFAULT_CLOTHING_DENYLIST = new Set(
  [
    // English
    "shirt",
    "t-shirt",
    "tee",
    "skirt",
    "dress",
    "jeans",
    "pants",
    "trousers",
    "shorts",
    "coat",
    "jacket",
    "hoodie",
    "sweater",
    "cardigan",
    "shoes",
    "sneakers",
    "boots",
    "heels",
    "hat",
    "cap",
    "scarf",
    "sock",
    "socks",
    "bag",
    "belt",
    // Chinese
    "上衣",
    "外套",
    "裙",
    "裙子",
    "连衣裙",
    "牛仔裤",
    "裤",
    "裤子",
    "短裤",
    "大衣",
    "夹克",
    "卫衣",
    "毛衣",
    "开衫",
    "鞋",
    "运动鞋",
    "靴",
    "靴子",
    "高跟鞋",
    "帽",
    "帽子",
    "围巾",
    "袜",
    "袜子",
    "包",
    "腰带",
  ].map((w) => w.toLowerCase()),
);
const DEFAULT_PROMPT_WRAPPER_DENYLIST = new Set(
  [
    "latency-check",
    "generate one ecommerce-ready",
    "character core features",
    "step1搭配参考",
    "后续定妆整体提示词",
    "commercial fashion photography",
    "all-in-one five-view",
    "wearing outfit from phase 1",
    "return only",
    "json",
  ].map((w) => w.toLowerCase()),
);

export interface RolePresetMapperOptions {
  expectedCount?: number; // do not pad; overshoot throws
  clothingDenylist?: string[]; // optional override/extension
  promptNoiseDenylist?: string[]; // strips template wrappers / debug residue from person fields
}

function buildClothingDenylistSet(opts?: RolePresetMapperOptions): Set<string> {
  if (!opts?.clothingDenylist || opts.clothingDenylist.length < 1) return DEFAULT_CLOTHING_DENYLIST;
  const set = new Set(DEFAULT_CLOTHING_DENYLIST);
  for (const w of opts.clothingDenylist) {
    if (typeof w === "string" && w.trim().length > 0) set.add(w.trim().toLowerCase());
  }
  return set;
}

function buildPromptNoiseDenylistSet(opts?: RolePresetMapperOptions): Set<string> {
  if (!opts?.promptNoiseDenylist || opts.promptNoiseDenylist.length < 1) return DEFAULT_PROMPT_WRAPPER_DENYLIST;
  const set = new Set(DEFAULT_PROMPT_WRAPPER_DENYLIST);
  for (const token of opts.promptNoiseDenylist) {
    if (typeof token === "string" && token.trim().length > 0) set.add(token.trim().toLowerCase());
  }
  return set;
}

function containsDenyToken(value: string, deny: Set<string>): boolean {
  const lowered = value.toLowerCase();
  for (const token of deny) {
    if (lowered === token || lowered.includes(token)) {
      return true;
    }
  }
  return false;
}

function cleanseStyleWords(styleWords: RoleStyleCategory[], clothingDeny: Set<string>, promptNoiseDeny: Set<string>): RoleStyleCategory[] {
  const out: RoleStyleCategory[] = [];
  for (const raw of styleWords) {
    const w = String(raw).trim();
    if (w.length === 0) continue;
    if (containsDenyToken(w, clothingDeny)) continue; // remove clothing words
    if (containsDenyToken(w, promptNoiseDeny)) continue; // remove prompt/template wrapper residue
    if (isStep1RolePresetTitleLike(w)) continue; // no extended titles or ui labels
    // 验证是否为有效角色风格，尝试解析
    if (isValidRoleStyle(w)) {
      if (!out.includes(w as RoleStyleCategory)) out.push(w as RoleStyleCategory);
    } else {
      const parsed = parseRoleStyleFromText(w);
      if (parsed && !out.includes(parsed)) out.push(parsed);
    }
  }
  return out;
}

export function mapRolePresetBundleToCards(
  input: unknown,
  options?: RolePresetMapperOptions,
): Step1RolePresetCard[] {
  // Normalize bundle first (shape + age constraint + field types)
  const bundle: Step1RolePresetBundle = normalizeStep1RolePresetBundle(input);
  const expected = options?.expectedCount;
  const presets = normalizeStep1RolePresetList(bundle.rolePresets, expected);
  const clothingDeny = buildClothingDenylistSet(options);
  const promptNoiseDeny = buildPromptNoiseDenylistSet(options);

  // Strictly keep person-only fields; cleanse styleWords against clothing terms
  return presets.map((p) => ({
    presetId: p.presetId,
    ethnicityOrRegion: p.ethnicityOrRegion,
    gender: p.gender,
    age: p.age,
    styleWords: cleanseStyleWords(p.styleWords, clothingDeny, promptNoiseDeny),
  }));
}

export function assertStep1RolePresetMapperContract(): { personOnlyFields: number; stripsTitleLikeWords: boolean } {
  // Card equals preset fields: 5 person-only fields
  return { personOnlyFields: 5, stripsTitleLikeWords: true };
}
