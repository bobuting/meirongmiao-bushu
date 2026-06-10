import type { Step1RoleDirectionCard } from "../contracts/step1-joint-reverse-contract.js";

const STEP1_ROLE_PRESET_PENDING_TEXT = "待返回";
const STEP1_ROLE_PRESET_DISPLAY_VALUE_MAP: Record<string, string> = {
  Asian: "东亚",
  "East Asian": "东亚",
  "clean and natural": "清透自然",
  "fresh and bright": "清透明亮",
  "neat and spirited": "利落有神",
  "quiet and refined": "安静书卷",
  "clean and energetic": "清爽有活力",
  "clear and delicate": "通透精致",
  "relaxed and sharp": "松弛利落",
  fresh: "清新",
  airy: "轻盈",
  gentle: "柔和",
  neat: "利落",
  bright: "明亮",
  youthful: "少年感",
  quiet: "安静",
  refined: "精致",
  soft: "柔和",
  energetic: "有活力",
  clean: "干净清爽",
  sunny: "明媚",
  clear: "通透",
  delicate: "精致",
  relaxed: "松弛",
  sharp: "利落",
  cool: "清冷",
  natural: "自然",
};

export interface Step1RolePresetPanelFieldRow {
  label: string;
  value: string;
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatGender(value: unknown): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "male") return "男";
  if (normalized === "female") return "女";
  if (normalized === "unknown") return STEP1_ROLE_PRESET_PENDING_TEXT;
  return normalizeOptionalText(value) ?? STEP1_ROLE_PRESET_PENDING_TEXT;
}

function localizePresetValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return STEP1_ROLE_PRESET_PENDING_TEXT;
  }
  return STEP1_ROLE_PRESET_DISPLAY_VALUE_MAP[trimmed] ?? STEP1_ROLE_PRESET_DISPLAY_VALUE_MAP[trimmed.toLowerCase()] ?? trimmed;
}

function formatAge(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return STEP1_ROLE_PRESET_PENDING_TEXT;
  }
  return `${Math.floor(value)} 岁`;
}

function formatStyleWords(value: unknown): string {
  if (!Array.isArray(value)) {
    return STEP1_ROLE_PRESET_PENDING_TEXT;
  }
  const words = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item, index, list) => item.length > 0 && list.indexOf(item) === index);
  return words.length > 0 ? words.map((item) => localizePresetValue(item)).join(" / ") : STEP1_ROLE_PRESET_PENDING_TEXT;
}

export function buildStep1RolePresetPanelFieldRows(
  direction: Pick<
    Step1RoleDirectionCard,
    "ethnicityOrRegion" | "gender" | "age" | "styleWords"
  >,
): Step1RolePresetPanelFieldRow[] {
  return [
    {
      label: "人种/地区：",
      value: normalizeOptionalText(direction.ethnicityOrRegion)
        ? localizePresetValue(normalizeOptionalText(direction.ethnicityOrRegion)!)
        : STEP1_ROLE_PRESET_PENDING_TEXT,
    },
    {
      label: "性别：",
      value: formatGender(direction.gender),
    },
    {
      label: "年龄：",
      value: formatAge(direction.age),
    },
    {
      label: "风格词：",
      value: formatStyleWords(direction.styleWords),
    },
  ];
}
