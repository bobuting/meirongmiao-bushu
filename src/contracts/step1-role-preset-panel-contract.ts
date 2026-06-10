import type { Step1RolePreset } from "./step1-role-preset-contract.js";
import {
  STEP1_ROLE_PRESET_GOVERNANCE_CONTRACT_VERSION,
  STEP1_ROLE_PRESET_MAX_AGE,
  STEP1_ROLE_PRESET_MIN_AGE,
  STEP1_ROLE_PRESET_PANEL_ALLOWED_FIELDS,
  STEP1_ROLE_PRESET_PANEL_FORBIDDEN_FALLBACK_FIELDS,
} from "./step1-role-preset-governance-contract.js";

export const STEP1_ROLE_PRESET_PANEL_CONTRACT_VERSION = STEP1_ROLE_PRESET_GOVERNANCE_CONTRACT_VERSION;
export const STEP1_ROLE_PRESET_PANEL_TITLE = "推荐角色预设";
export const STEP1_ROLE_PRESET_PANEL_HINT = "先选择推荐角色预设，再进入 Step2 定妆。";
export const STEP1_ROLE_PRESET_PANEL_EMPTY_TEXT = "暂无推荐角色预设，请先执行 Step1 联合反推。";
export const STEP1_ROLE_PRESET_CONFIRM_LABEL = "确认推荐角色预设";
export const STEP1_ROLE_PRESET_CONFIRMED_LABEL = "推荐角色预设已确认，可进入 Step2";

export interface Step1RolePresetPanelMeta {
  version: string;
  title: string;
  hint: string;
  count: number;
  personFieldKeys: Array<keyof Step1RolePreset>;
  ageBandLabel: string;
  forbiddenFallbackFields: string[];
}

export function resolveStep1RolePresetPanelMeta(count: number): Step1RolePresetPanelMeta {
  return {
    version: STEP1_ROLE_PRESET_PANEL_CONTRACT_VERSION,
    title: STEP1_ROLE_PRESET_PANEL_TITLE,
    hint: STEP1_ROLE_PRESET_PANEL_HINT,
    count: Math.max(0, Math.floor(count)),
    personFieldKeys: [...STEP1_ROLE_PRESET_PANEL_ALLOWED_FIELDS],
    ageBandLabel: `${STEP1_ROLE_PRESET_MIN_AGE}-${STEP1_ROLE_PRESET_MAX_AGE}`,
    forbiddenFallbackFields: [...STEP1_ROLE_PRESET_PANEL_FORBIDDEN_FALLBACK_FIELDS],
  };
}
