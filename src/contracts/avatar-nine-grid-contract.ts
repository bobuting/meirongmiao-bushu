export type Gender = "male" | "female";

export interface GridSize { rows: 3; cols: 3 }
export interface CellSize { width: number; height: number }

export interface CropRule {
  aspectRatio: "1:1"; // square avatars
  faceBoxScale: number; // 1.0-2.5 expands detected face box before crop
  topHeadroomPct: number; // 0.0-0.6 fraction of crop reserved above face center
  minMarginPct: number; // 0.0-0.3 minimal margin around expanded box
}

export interface NineGridAvatarTemplate {
  gender: Gender;
  baseImageUrl: string; // background image for 3x3 scaffold
  gridSize: GridSize;   // fixed 3x3 for this contract
  cell: CellSize;       // logical cell size (px)
  cropRule: CropRule;   // cropping constraints
  slotOrder: number[];  // 0..8 fill order
}

export interface NineGridTemplateBundle {
  version: string;
  templates: NineGridAvatarTemplate[];
}

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function assertNumberInRange(value: unknown, field: string, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${field} must be a finite number in [${min}, ${max}]`);
  }
  return n;
}

function assertPositiveInt(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return n;
}

function assertGender(value: unknown, field: string): Gender {
  const g = String(value ?? "").toLowerCase();
  if (g !== "male" && g !== "female") {
    throw new Error(`${field} must be one of male|female`);
  }
  return g as Gender;
}

function assertGridSize(value: unknown, field: string): GridSize {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  const rec = value as Record<string, unknown>;
  const rows = rec.rows;
  const cols = rec.cols;
  if (rows !== 3 || cols !== 3) {
    throw new Error(`${field} must be fixed 3x3`);
  }
  return { rows: 3, cols: 3 };
}

function assertCellSize(value: unknown, field: string): CellSize {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  const rec = value as Record<string, unknown>;
  const width = assertPositiveInt(rec.width, `${field}.width`);
  const height = assertPositiveInt(rec.height, `${field}.height`);
  return { width, height };
}

function assertSlotOrder(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.length !== 9) {
    throw new Error(`${field} must be an array of length 9`);
  }
  const arr = value.map((v, i) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 8) {
      throw new Error(`${field}[${i}] must be an integer in [0,8]`);
    }
    return n;
  });
  // optional: uniqueness check
  const uniq = new Set(arr);
  if (uniq.size !== 9) {
    throw new Error(`${field} must contain a permutation of 0..8`);
  }
  return arr;
}

function assertCropRule(value: unknown, field: string): CropRule {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  const rec = value as Record<string, unknown>;
  const aspect = String(rec.aspectRatio ?? "");
  if (aspect !== "1:1") {
    throw new Error(`${field}.aspectRatio must be '1:1'`);
  }
  const faceBoxScale = assertNumberInRange(rec.faceBoxScale, `${field}.faceBoxScale`, 1.0, 2.5);
  const topHeadroomPct = assertNumberInRange(rec.topHeadroomPct, `${field}.topHeadroomPct`, 0.0, 0.6);
  const minMarginPct = assertNumberInRange(rec.minMarginPct, `${field}.minMarginPct`, 0.0, 0.3);
  return { aspectRatio: "1:1", faceBoxScale, topHeadroomPct, minMarginPct };
}

export function normalizeNineGridTemplate(input: unknown): NineGridAvatarTemplate {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("template must be an object");
  }
  const rec = input as Record<string, unknown>;
  const gender = assertGender(rec.gender, "gender");
  const baseImageUrl = assertNonEmptyString(rec.baseImageUrl, "baseImageUrl");
  const gridSize = assertGridSize(rec.gridSize, "gridSize");
  const cell = assertCellSize(rec.cell, "cell");
  const cropRule = assertCropRule(rec.cropRule, "cropRule");
  const slotOrder = assertSlotOrder(rec.slotOrder, "slotOrder");
  return { gender, baseImageUrl, gridSize, cell, cropRule, slotOrder };
}

export function normalizeNineGridTemplateBundle(input: unknown): NineGridTemplateBundle {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("bundle must be an object");
  }
  const rec = input as Record<string, unknown>;
  const version = assertNonEmptyString(rec.version, "version");
  const templatesValue = (rec.templates ?? []) as unknown;
  if (!Array.isArray(templatesValue)) {
    throw new Error("templates must be an array");
  }
  const templates = templatesValue.map((t, i) => {
    try {
      return normalizeNineGridTemplate(t);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`templates[${i}]: ${msg}`);
    }
  });
  // hard contract: exactly 2 entries: male & female
  const genders = new Set(templates.map((t) => t.gender));
  if (!(genders.has("male") && genders.has("female")) || templates.length !== 2) {
    throw new Error("templates must include exactly two entries: male and female");
    }
  return { version, templates };
}

export function assertAvatarNineGridContract(): { fixedGrid: string; genders: number; aspect: string } {
  // Freeze minimal invariants for contract tests
  const meta = {
    fixedGrid: "3x3",
    genders: 2,
    aspect: "1:1",
  } as const;
  return { ...meta };
}

// Provide a stable default that tests can import without I/O
export const DEFAULT_NINE_GRID_BUNDLE: NineGridTemplateBundle = {
  version: "v1",
  templates: [
    {
      gender: "male",
      baseImageUrl: "data/boys.jpeg",
      gridSize: { rows: 3, cols: 3 },
      cell: { width: 256, height: 256 },
      cropRule: { aspectRatio: "1:1", faceBoxScale: 1.4, topHeadroomPct: 0.2, minMarginPct: 0.05 },
      slotOrder: [4,0,2,6,8,1,3,5,7],
    },
    {
      gender: "female",
      baseImageUrl: "data/girls.jpeg",
      gridSize: { rows: 3, cols: 3 },
      cell: { width: 256, height: 256 },
      cropRule: { aspectRatio: "1:1", faceBoxScale: 1.35, topHeadroomPct: 0.25, minMarginPct: 0.05 },
      slotOrder: [4,2,0,8,6,1,3,5,7],
    }
  ],
};
