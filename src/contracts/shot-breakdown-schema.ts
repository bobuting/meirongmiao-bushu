/**
 * 分镜数据 Zod Schema 验证
 *
 * 为 LLM 输出的分镜数据提供运行时验证，确保数据结构符合预期。
 * 配合 TypeScript 类型定义，提供完整的类型安全。
 *
 * 主体严格分为两类（遵循 skills/_shared/rules/video-output-schema.md）：
 * 1. 人物（type: "人物"）：必须有 person_id、eye_line、clothing（ref 可选）
 *    - 用户角色（person_id=1）：clothing.ref 锚定参考图（"搭配1"）
 *    - 配角（person_id>=2）：clothing.ref 可选（由 AI 智能生成）
 * 2. 物品（type: "物体"）：不含 clothing、person_id、expression，eye_line 可为 null
 * 3. 空镜：subjects 为空数组 []
 */

import { z } from "zod";

// ===== 时间码 Schema =====

/** 时间码验证（所有字段允许 null，因为 LLM 可能输出 null 表示缺失） */
export const TimecodeSchema = z.object({
  start: z.string().nullish(),
  end: z.string().nullish(),
  duration_seconds: z.number().positive().nullish(),
}).passthrough();

// ===== 服饰 Schema =====

/**
 * 服饰验证（人物专用）
 * ref 可选：用户角色（person_id=1）锚定到参考图（"搭配1"），配角由 AI 智能生成（可为 null）
 * overall_style 允许 null（LLM 可能输出 null 表示缺失）
 */
export const ClothingSchema = z.object({
  ref: z.string().nullish(),
  overall_style: z.string().nullish(),
}).passthrough();

// ===== 主体共用字段 =====

/**
 * 主体共用字段验证
 * 所有可选字段都使用 nullish，因为 LLM 可能输出 null 表示缺失
 */
const SubjectCommonFields = {
  subject_id: z.number().int().positive().nullish(),
  description: z.string().nullish(),
  position: z.string().nullish(),
  body_angle: z.string().nullish(),
  action: z.string().nullish(),
  movement: z.string().nullish(),
  movement_speed: z.string().nullish(),
  props: z.array(z.string()).nullish(),
};

// ===== 人物主体 Schema =====

/**
 * 人物主体验证
 *
 * 严格约束：
 * - person_id 必填
 * - eye_line 允许 null（LLM 可能输出 null）
 * - clothing 必填（ref 可选：用户角色锚定参考图，配角由 AI 智能生成）
 * - expression 允许 null（LLM 可能输出 null 表示无表情描述）
 */
export const PersonSubjectSchema = z.object({
  ...SubjectCommonFields,
  type: z.literal("人物"),
  person_id: z.number().int().positive(),
  eye_line: z.string().nullish(),
  expression: z.string().nullish(),
  clothing: ClothingSchema,
}).passthrough();

// ===== 物品主体 Schema =====

/**
 * 物品主体验证
 *
 * 严格约束：
 * - 不含 clothing、person_id、expression（出现则报错）
 * - eye_line 允许 null（物品没有视线）
 */
export const ObjectSubjectSchema = z.object({
  ...SubjectCommonFields,
  type: z.literal("物体"),
  eye_line: z.string().nullish(),
}).passthrough().refine(
  (obj) => {
    // 禁止人物专属字段
    const forbidden = ["clothing", "person_id", "expression"] as const;
    const found = forbidden.filter(key => key in obj);
    if (found.length > 0) {
      return false;
    }
    return true;
  },
  { message: "物品主体不允许包含人物专属字段（clothing、person_id、expression）" }
);

// ===== 主体联合 Schema =====

/**
 * 分镜主体验证（discriminated union）
 *
 * 根据 type 字段严格区分人物和物品，各自有独立的字段约束：
 * - type: "人物" → PersonSubjectSchema（含 person_id、clothing、eye_line）
 * - type: "物体" → ObjectSubjectSchema（不含 clothing、person_id）
 */
export const ShotSubjectSchema = z.discriminatedUnion("type", [
  PersonSubjectSchema,
  ObjectSubjectSchema,
]);

// ===== 文字元素 Schema =====

/** 文字元素验证（所有可选字段允许 null） */
export const TextElementSchema = z.object({
  type: z.string(),
  content: z.string(),
  position: z.string().nullish(),
  style: z.string().nullish(),
  animation: z.string().nullish(),
});

// ===== 音频 Schema =====

/** 对话验证（所有字段允许 null） */
export const DialogueSchema = z.object({
  speaker: z.string().nullish(),
  content: z.string().nullish(),
  tone: z.string().nullish(),
}).nullable();

/** 旁白验证（所有字段允许 null） */
export const NarrationSchema = z.object({
  content: z.string().nullish(),
  text: z.string().nullish(),
  tone: z.string().nullish(),
}).nullable();

/** 音效验证（可选字段允许 null） */
export const SoundEffectSchema = z.object({
  type: z.string(),
  description: z.string().nullish(),
  sync_point: z.string().nullish(),
});

/** 音频验证（所有字段允许 null） */
export const AudioSchema = z.object({
  dialogue: DialogueSchema.nullish(),
  narration: NarrationSchema.nullish(),
  ambient_sound: z.string().nullish(),
  sound_effects: z.array(SoundEffectSchema).nullish(),
}).nullish();

// ===== 单个分镜 Schema =====

/**
 * 单个分镜验证
 *
 * 关键字段验证规则：
 * - shot_id: 必须为正整数
 * - subjects: 数组，每个元素必须符合 ShotSubjectSchema（discriminated union）
 * - 其他字段：允许 null 或缺失，允许额外字段（passthrough）
 */
export const ShotBreakdownItemSchema = z.object({
  shot_id: z.number().int().positive(),
  timecode: TimecodeSchema.nullish(),
  shot_type: z.string().nullish(),
  camera_movement: z.string().nullish(),
  transition_in: z.union([z.record(z.string(), z.unknown()), z.string()]).nullish(),
  transition_out: z.union([z.record(z.string(), z.unknown()), z.string()]).nullish(),
  visual: z.record(z.string(), z.unknown()).nullish(),
  subjects: z.array(ShotSubjectSchema).nullish(),
  text_elements: z.array(TextElementSchema).nullish(),
  audio: AudioSchema,
  camera_details: z.record(z.string(), z.unknown()).nullish(),
  speed_effects: z.record(z.string(), z.unknown()).nullish(),
  shot_description: z.string().nullish(),
}).passthrough();

// ===== 分镜数组 Schema =====

/**
 * 分镜数组验证
 *
 * 验证规则：
 * - 必须为数组
 * - 数组可为空（某些场景下 LLM 可能返回空数组）
 * - 每个元素必须符合 ShotBreakdownItemSchema
 * - shot_id 必须唯一（通过 superRefine 检查）
 */
export const ShotBreakdownArraySchema = z.array(ShotBreakdownItemSchema)
  .superRefine((shots, ctx) => {
    // 检查 shot_id 唯一性
    const shotIds = new Set<number>();
    shots.forEach((shot, index) => {
      if (shotIds.has(shot.shot_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `重复的 shot_id: ${shot.shot_id}`,
          path: [index, "shot_id"],
        });
      }
      shotIds.add(shot.shot_id);
    });
  });

// ===== 角色匹配相关 Schema =====

/**
 * 角色匹配输入验证
 *
 * 用于 CharacterMatchingService 的输入验证
 * 所有字段允许 null 或缺失
 */
export const CharacterMatchingInputSchema = z.object({
  gender: z.enum(["male", "female", "other"]).nullish(),
  description: z.string().nullish(),
  age: z.number().int().positive().max(150).nullish(),
}).nullish();

// ===== 验证函数 =====

/**
 * 清洗 subjects 数据
 *
 * 1. 归一化 type 字段：LLM（如 qwen3.6-plus）偶尔截断多字节 UTF-8 字符，
 *    导致 "人物" 变成 "物"（U+FFFD 替换损坏字节）。
 *    根据上下文字段推断正确值：有 person_id + clothing → "人物"，否则 → "物体"
 * 2. 移除物品主体中误带的人物专属字段（clothing、person_id、expression）
 */
function sanitizeSubjects(data: unknown): unknown {
  if (!Array.isArray(data)) return data;

  const VALID_TYPES = new Set(["人物", "物体"]);

  return data.map((shot: Record<string, unknown>) => {
    if (!Array.isArray(shot.subjects)) return shot;

    const sanitizedSubjects = shot.subjects.map((subject: Record<string, unknown>) => {
      // 归一化损坏的 type 值（包含 U+FFFD 或其他非法值）
      if (typeof subject.type === "string" && !VALID_TYPES.has(subject.type)) {
        const hasPersonFields = ("person_id" in subject) || ("clothing" in subject);
        subject = { ...subject, type: hasPersonFields ? "人物" : "物体" };
      }

      // 移除物品主体中误带的人物专属字段
      if (subject.type === "物体") {
        const { clothing, person_id, expression, ...rest } = subject;
        return rest;
      }

      // 修正用户角色的 clothing.ref（如果为 null）
      // 根据 character-outfit-anchors 规则，用户角色（person_id=1）必须锚定到参考图
      // 配角（person_id>=2）的服装由 AI 智能生成，允许 ref 为 null
      if (subject.type === "人物" && subject.clothing) {
        const clothing = subject.clothing as Record<string, unknown>;
        const personId = subject.person_id as number | undefined;

        // 只修正用户角色（person_id=1）
        if (personId === 1 && (clothing.ref === null || clothing.ref === undefined)) {
          subject = {
            ...subject,
            clothing: { ...clothing, ref: "搭配1" }
          };
        }
      }

      return subject;
    });

    return { ...shot, subjects: sanitizedSubjects };
  });
}

/**
 * 验证分镜数据
 *
 * @param data 待验证的数据
 * @returns 验证结果，成功返回解析后的数据，失败返回错误信息
 */
export function validateShotBreakdown(data: unknown): {
  success: boolean;
  data?: z.infer<typeof ShotBreakdownArraySchema>;
  error?: string;
} {
  const sanitized = sanitizeSubjects(data);
  const result = ShotBreakdownArraySchema.safeParse(sanitized);

  if (result.success) {
    return { success: true, data: result.data };
  }

  // 格式化错误消息
  const errorMessages = result.error.issues.map((err: z.ZodIssue) => {
    const path = err.path.join(".");
    return `${path}: ${err.message}`;
  }).join("; ");

  return { success: false, error: `分镜数据验证失败: ${errorMessages}` };
}

/**
 * 验证单个分镜
 *
 * @param data 待验证的数据
 * @returns 验证结果
 */
export function validateSingleShot(data: unknown): {
  success: boolean;
  data?: z.infer<typeof ShotBreakdownItemSchema>;
  error?: string;
} {
  const sanitized = sanitizeSubjects([data]);
  const result = ShotBreakdownItemSchema.safeParse((sanitized as unknown[])[0]);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errorMessages = result.error.issues.map((err: z.ZodIssue) => {
    const path = err.path.join(".");
    return `${path}: ${err.message}`;
  }).join("; ");

  return { success: false, error: `分镜验证失败: ${errorMessages}` };
}

/**
 * 验证角色匹配输入
 *
 * @param data 待验证的数据
 * @returns 验证结果
 */
export function validateCharacterMatchingInput(data: unknown): {
  success: boolean;
  data?: z.infer<typeof CharacterMatchingInputSchema>;
  error?: string;
} {
  const result = CharacterMatchingInputSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errorMessages = result.error.issues.map((err: z.ZodIssue) => {
    const path = err.path.join(".");
    return `${path}: ${err.message}`;
  }).join("; ");

  return { success: false, error: `角色匹配输入验证失败: ${errorMessages}` };
}

// ===== 类型导出 =====

export type Timecode = z.infer<typeof TimecodeSchema>;
export type Clothing = z.infer<typeof ClothingSchema>;
export type PersonSubject = z.infer<typeof PersonSubjectSchema>;
export type ObjectSubject = z.infer<typeof ObjectSubjectSchema>;
export type ShotSubject = z.infer<typeof ShotSubjectSchema>;
export type ShotBreakdownItem = z.infer<typeof ShotBreakdownItemSchema>;
export type CharacterMatchingInput = z.infer<typeof CharacterMatchingInputSchema>;
