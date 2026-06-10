/**
 * V2 已为唯一流程，旧预设网格始终隐藏。
 */
export const STEP2_LEGACY_PRESET_GRID_REMOVAL_VERSION = "AT35-24.v2";

export function resolveStep2LegacyPresetGridRemovalState(_input: {
  loadingPresets?: boolean;
  presetCount?: number;
  hasSelectedModel?: boolean;
}) {
  return {
    version: STEP2_LEGACY_PRESET_GRID_REMOVAL_VERSION,
    showLegacyLoadingState: false,
    showLegacyEmptyState: false,
    showLegacyPresetGrid: false,
    showLegacySelectionConfirm: false,
  };
}
