/**
 * Shared layering guardrail for project-flow step media cards.
 *
 * Rule of thumb:
 * - media surface stays on z-[1]
 * - hover chrome sits on z-10
 * - badges/buttons/captions sit on z-20
 * - blocking state overlays sit on z-30
 */
export const PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS = "relative z-[1]";
export const PROJECT_FLOW_MEDIA_HOVER_OVERLAY_Z_CLASS = "absolute inset-0 z-10";
export const PROJECT_FLOW_MEDIA_CHROME_Z_CLASS = "absolute z-20";
export const PROJECT_FLOW_MEDIA_BLOCKING_OVERLAY_Z_CLASS = "absolute inset-0 z-30";
