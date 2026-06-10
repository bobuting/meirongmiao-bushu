import type { CharacterViewKey, Project } from "../contracts/types.js";

function normalizeStorageEntityName(rawName: string, fallback: string): string {
  const normalized = rawName
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || fallback;
}

function buildDressedupProjectFolder(project: Pick<Project, "id" | "name">): string {
  return `${normalizeStorageEntityName(project.name, "project")}-${project.id}`;
}

function buildAllInOneProjectFolder(project: Pick<Project, "id" | "name">): string {
  return `${project.id}-${normalizeStorageEntityName(project.name, "project")}`;
}

export type Step2AllInOneSlot = 1 | 2 | 3;

export function parseStep2AllInOneSlot(value: unknown): Step2AllInOneSlot | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return null;
  }
  if (parsed === 1 || parsed === 2 || parsed === 3) {
    return parsed;
  }
  return null;
}

export function toStep2AllInOneSlotFolder(slot: Step2AllInOneSlot): "01" | "02" | "03" {
  if (slot === 1) {
    return "01";
  }
  if (slot === 2) {
    return "02";
  }
  return "03";
}

export function buildStep2DressedupWriteStoragePrefix(
  project: Pick<Project, "id" | "name">,
  viewKey: CharacterViewKey,
): string {
  return `dressedup5in1/0/${buildDressedupProjectFolder(project)}/${viewKey}`;
}

export function buildStep2DressedupAllInOneSlotStoragePrefix(
  project: Pick<Project, "id" | "name">,
  slot: Step2AllInOneSlot,
): string {
  return `dressedup5in1/${buildAllInOneProjectFolder(project)}/${toStep2AllInOneSlotFolder(slot)}`;
}

export function buildLegacyDressedupReadStoragePrefix(
  project: Pick<Project, "id" | "name">,
  viewKey: CharacterViewKey,
): string {
  return `dressedup/${buildDressedupProjectFolder(project)}/${viewKey}`;
}

export function listStep2DressedupReadableStoragePrefixes(
  project: Pick<Project, "id" | "name">,
  viewKey: CharacterViewKey,
): string[] {
  return [
    buildStep2DressedupWriteStoragePrefix(project, viewKey),
    buildLegacyDressedupReadStoragePrefix(project, viewKey),
  ];
}
