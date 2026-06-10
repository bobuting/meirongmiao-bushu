export const PREVIEW_ISOLATION_PERSISTENCE_COMPAT_CONTRACT_VERSION = "AT32-24.v1";

export function assertPreviewIsolationPersistenceCompat(): {
  version: string;
  persistence: {
    scope: "per-project" | "per-user";
    storage: "local-first-with-server-sync" | "server-only";
    keys: string[];
    writePolicy: string;
  };
  compatibility: {
    acceptsLegacyKeys: boolean;
    legacyKeyMap: Record<string, string>;
    migration: string;
  };
} {
  return {
    version: PREVIEW_ISOLATION_PERSISTENCE_COMPAT_CONTRACT_VERSION,
    persistence: {
      scope: "per-project",
      storage: "local-first-with-server-sync",
      keys: [
        "preview.selectedViewKey",
        "preview.zoom.level",
        "preview.zoom.mode",
        "preview.panel.open",
      ],
      writePolicy:
        "Writes are debounced and namespaced by projectId; server snapshot is optional and merged without leaking state across projects.",
    },
    compatibility: {
      acceptsLegacyKeys: true,
      legacyKeyMap: {
        // Historical projects used 'dressedup.*' keys in step2 UI
        "dressedup.selected": "preview.selectedViewKey",
        "dressedup.zoom": "preview.zoom.level",
        "dressedup.zoomMode": "preview.zoom.mode",
      },
      migration:
        "On first load, legacy keys are read, transformed into new keys, and then persisted under new namespace; operation is idempotent and non-destructive.",
    },
  };
}