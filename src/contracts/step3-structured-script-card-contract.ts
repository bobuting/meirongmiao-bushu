export const STEP3_STRUCTURED_SCRIPT_CARD_CONTRACT_VERSION = "AT30-10.v2";

export const STEP3_STRUCTURED_SCRIPT_CARD_FIELDS = [
  "title",
  "scenario",
  "durationSec",
  "storyboardCount",
  "coreSellingPoint",
  "rhythmTags",
  "mainScene",
  "atmosphere",
  "timeOfDay",
  "weather",
  "theme",
  "summary",
  "primaryEmotion",
  "emotionArc",
  "videoStyle",
] as const;

/**
 * 脚本卡片视图模型
 * 核心字段对齐 nrm_script_data 表定义列，用于前端卡片展示和 ScriptEditor 编辑
 */
export interface Step3StructuredScriptCard {
  title: string;
  scenario: string;
  durationSec: number;
  storyboardCount: number;
  coreSellingPoint: string;
  rhythmTags: string[];
  /** 主场景（对应 nrm_script_data.main_scene） */
  mainScene?: string;
  /** 氛围描述（对应 nrm_script_data.atmosphere） */
  atmosphere?: string;
  /** 时间段（对应 nrm_script_data.time_of_day） */
  timeOfDay?: string;
  /** 天气（对应 nrm_script_data.weather） */
  weather?: string;
  /** 主题（对应 nrm_script_data.theme） */
  theme?: string;
  /** 概要（对应 nrm_script_data.summary） */
  summary?: string;
  /** 主要情绪（对应 nrm_script_data.primary_emotion） */
  primaryEmotion?: string;
  /** 情绪弧线（对应 nrm_script_data.emotion_arc） */
  emotionArc?: string;
  /** 视频风格（对应 nrm_script_data.video_style） */
  videoStyle?: string;
}

function assertNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value;
}

function assertOptionalString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

export function normalizeStep3StructuredScriptCard(input: unknown): Step3StructuredScriptCard {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("step3 structured script card must be an object");
  }
  const record = input as Record<string, unknown>;
  const durationSec = Number(record.durationSec);
  if (!Number.isInteger(durationSec) || durationSec <= 0) {
    throw new Error("durationSec must be a positive integer");
  }
  const storyboardCount = Number(record.storyboardCount);
  if (!Number.isInteger(storyboardCount) || storyboardCount <= 0) {
    throw new Error("storyboardCount must be a positive integer");
  }
  if (!Array.isArray(record.rhythmTags)) {
    throw new Error("rhythmTags must be an array");
  }

  const rhythmTags = record.rhythmTags.map((tag, index) =>
    assertNonEmptyString(tag, `rhythmTags[${index}]`),
  );

  return {
    title: assertNonEmptyString(record.title, "title"),
    scenario: assertNonEmptyString(record.scenario, "scenario"),
    durationSec,
    storyboardCount,
    coreSellingPoint: assertNonEmptyString(record.coreSellingPoint, "coreSellingPoint"),
    rhythmTags,
    mainScene: assertOptionalString(record.mainScene),
    atmosphere: assertOptionalString(record.atmosphere),
    timeOfDay: assertOptionalString(record.timeOfDay),
    weather: assertOptionalString(record.weather),
    theme: assertOptionalString(record.theme),
    summary: assertOptionalString(record.summary),
    primaryEmotion: assertOptionalString(record.primaryEmotion),
    emotionArc: assertOptionalString(record.emotionArc),
    videoStyle: assertOptionalString(record.videoStyle),
  };
}

export function assertStep3StructuredScriptCardContract(): {
  version: string;
  requiredFieldCount: number;
  excludesCaseFields: boolean;
} {
  return {
    version: STEP3_STRUCTURED_SCRIPT_CARD_CONTRACT_VERSION,
    requiredFieldCount: STEP3_STRUCTURED_SCRIPT_CARD_FIELDS.length,
    excludesCaseFields: true,
  };
}
