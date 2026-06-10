import type { Step1RoleDirectionCard } from "../contracts/step1-joint-reverse-contract";
import { resolveStep1RolePresetPanelLayoutMeta } from "../contracts/step1-role-preset-panel-layout-contract";
import { buildStep1RolePresetPanelFieldRows } from "./step1-role-preset-panel-view";

const STEP1_ROLE_PRESET_PENDING_TEXT = "待返回";

export interface Step1RolePresetPanelCompactLine {
  lineId: "hero" | "support" | "style";
  text: string;
  emphasis: boolean;
}

function buildFieldValueMap(
  direction: Pick<
    Step1RoleDirectionCard,
    "ethnicityOrRegion" | "gender" | "age" | "styleWords"
  >,
): Record<string, string> {
  return Object.fromEntries(buildStep1RolePresetPanelFieldRows(direction).map((row) => [row.label, row.value]));
}

export function buildStep1RolePresetPanelCompactLines(
  direction: Pick<
    Step1RoleDirectionCard,
    "ethnicityOrRegion" | "gender" | "age" | "styleWords"
  >,
): Step1RolePresetPanelCompactLine[] {
  const fieldValues = buildFieldValueMap(direction);
  const layoutMeta = resolveStep1RolePresetPanelLayoutMeta();

  return layoutMeta.lineGroups.map((group) => {
    if (group.lineId === "hero") {
      return {
        lineId: "hero" as const,
        text: `人种/地区：${fieldValues["人种/地区："] ?? STEP1_ROLE_PRESET_PENDING_TEXT}`,
        emphasis: true,
      };
    }
    if (group.lineId === "support") {
      const supportValues = [
        fieldValues["性别："],
        fieldValues["年龄："],
      ].filter((value) => value && value !== STEP1_ROLE_PRESET_PENDING_TEXT);
      return {
        lineId: "support" as const,
        text: supportValues.length > 0 ? supportValues.join(" / ") : "基础属性：待返回",
        emphasis: false,
      };
    }
    return {
      lineId: "style" as const,
      text: `风格词：${fieldValues["风格词："] ?? STEP1_ROLE_PRESET_PENDING_TEXT}`,
      emphasis: true,
    };
  });
}
