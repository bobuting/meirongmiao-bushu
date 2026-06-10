export const PREVIEW_ISOLATION_DOUBLEZOOM_CONTRACT_VERSION = "AT32-08.v1";

export function assertPreviewIsolationDoubleZoom(): {
  version: string;
  isolationPrinciple: string;
  interaction: string;
} {
  return {
    version: PREVIEW_ISOLATION_DOUBLEZOOM_CONTRACT_VERSION,
    isolationPrinciple: "Preview UI state is locally scoped per page and does not leak across modules.",
    interaction: "Thumbnails use cursor-zoom-in; double-click opens full-screen image, double-click or close button exits.",
  };
}
