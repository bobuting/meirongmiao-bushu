import React from "react";
import { getOssThumbnailUrl } from "../../../utils/ossImage";

function trimText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export const STEP3_SCENE_CANDIDATE_DRAG_MIME = "application/x-step3-scene-candidate-url";

export interface Step3CandidateStripSceneReference {
  id: string;
  frameIndex: number;
  title: string;
  candidates: string[];
  selectedImageUrl: string | null;
  linkedFrameIndexes?: number[];
}

export interface Step3CandidateStripCandidateViewModel {
  candidateId: string;
  imageUrl: string;
  label: string;
  isSelected: boolean;
}

export interface Step3CandidateStripViewModel {
  sceneReferenceId: string;
  frameIndex: number;
  title: string;
  selectionSummary: string;
  candidates: Step3CandidateStripCandidateViewModel[];
}

export function buildStep3CandidateStripViewModel(input: {
  frameIndex: number;
  sceneReference: Step3CandidateStripSceneReference | null;
}): Step3CandidateStripViewModel | null {
  if (!input.sceneReference) {
    return null;
  }

  const frameTokens = Array.from(
    new Set([input.sceneReference.frameIndex, ...(input.sceneReference.linkedFrameIndexes ?? [])]),
  ).sort((left, right) => left - right);
  const frameLabel = frameTokens.join("/");
  const selectedImageUrl = trimText(input.sceneReference.selectedImageUrl) || null;
  const candidates = input.sceneReference.candidates
    .map((candidate) => trimText(candidate))
    .filter((candidate) => candidate.length > 0)
    .slice(0, 8)
    .map((candidate, index) => ({
      candidateId: `${input.sceneReference!.id}-${index + 1}`,
      imageUrl: candidate,
      label: `场景 ${frameLabel} 候选 ${index + 1}`,
      isSelected: candidate === selectedImageUrl,
    }));
  const selectedCandidate = candidates.find((candidate) => candidate.isSelected) ?? null;

  return {
    sceneReferenceId: input.sceneReference.id,
    frameIndex: input.frameIndex,
    title: trimText(input.sceneReference.title) || `场景 ${frameLabel}`,
    selectionSummary: selectedCandidate
      ? `当前主图: ${selectedCandidate.label}`
      : candidates.length > 0
        ? "单击候选图切换右侧大图"
        : "当前镜头还没有可切换的场景候选图",
    candidates,
  };
}

export function selectStep3SceneReferenceCandidate<T extends Step3CandidateStripSceneReference>(
  items: T[],
  sceneReferenceId: string,
  imageUrl: string,
): T[] {
  const nextImageUrl = trimText(imageUrl);
  if (!sceneReferenceId.trim() || nextImageUrl.length < 1) {
    return items;
  }

  let changed = false;
  const nextItems = items.map((item) => {
    if (item.id !== sceneReferenceId) {
      return item;
    }
    if (!item.candidates.some((candidate) => trimText(candidate) === nextImageUrl)) {
      return item;
    }
    if (trimText(item.selectedImageUrl) === nextImageUrl) {
      return item;
    }
    changed = true;
    return {
      ...item,
      selectedImageUrl: nextImageUrl,
    };
  });

  return changed ? nextItems : items;
}

export function upsertStep3SceneReferenceCandidate<T extends Step3CandidateStripSceneReference>(
  items: T[],
  sceneReferenceId: string,
  imageUrl: string,
): T[] {
  const normalizedSceneReferenceId = trimText(sceneReferenceId);
  const nextImageUrl = trimText(imageUrl);
  if (!normalizedSceneReferenceId || nextImageUrl.length < 1) {
    return items;
  }

  let changed = false;
  const nextItems = items.map((item) => {
    if (trimText(item.id) !== normalizedSceneReferenceId) {
      return item;
    }
    const nextCandidates = [
      nextImageUrl,
      ...item.candidates
        .map((candidate) => trimText(candidate))
        .filter((candidate) => candidate.length > 0 && candidate !== nextImageUrl),
    ].slice(0, 8);
    if (
      trimText(item.selectedImageUrl) === nextImageUrl &&
      nextCandidates.length === item.candidates.length &&
      nextCandidates.every((candidate, index) => candidate === trimText(item.candidates[index]))
    ) {
      return item;
    }
    changed = true;
    return {
      ...item,
      candidates: nextCandidates,
      selectedImageUrl: nextImageUrl,
    };
  });

  return changed ? nextItems : items;
}

export const Step3CandidateStripRuntime: React.FC<{
  viewModel: Step3CandidateStripViewModel | null;
  onSelectCandidate: (sceneReferenceId: string, imageUrl: string) => void;
  onPreviewImage: (imageUrl: string, label: string) => void;
}> = ({ viewModel, onSelectCandidate, onPreviewImage }) => {
  if (!viewModel || viewModel.candidates.length < 1) return null;

  return (
    <div data-testid="step3-candidate-strip" className="overflow-x-auto pb-1">
      <div className="inline-flex min-w-full gap-2">
        {viewModel.candidates.map((candidate, index) => (
          <button
            key={candidate.candidateId}
            type="button"
            draggable
            data-testid={`step3-scene-candidate-${viewModel.frameIndex}-${index + 1}`}
            onClick={() => onSelectCandidate(viewModel.sceneReferenceId, candidate.imageUrl)}
            onDoubleClick={() => onPreviewImage(candidate.imageUrl, candidate.label)}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "copy";
              event.dataTransfer.setData(STEP3_SCENE_CANDIDATE_DRAG_MIME, candidate.imageUrl);
              event.dataTransfer.setData("text/uri-list", candidate.imageUrl);
              event.dataTransfer.setData("text/plain", candidate.imageUrl);
            }}
            className={`relative h-16 w-16 shrink-0 overflow-hidden rounded border ${
              candidate.isSelected ? "border-primary" : "border-slate-200"
            }`}
            title="点击切换当前大图；双击预览"
          >
            <img src={getOssThumbnailUrl(candidate.imageUrl, 200)} alt={candidate.label} className="h-full w-full object-cover"  loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
};
