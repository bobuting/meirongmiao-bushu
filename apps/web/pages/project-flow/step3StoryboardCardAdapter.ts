import type { Step3StoryCardViewModelContract } from "../../../../src/contracts/step3-scene-workbench-contract";
import type { Step3CharacterReferenceItem } from "../../utils/step3CharacterReferencePool";

export interface Step3StoryboardCardAdapterSegmentInput {
  frameIndex: number;
  time?: string;
  /** 镜头时长（秒） */
  durationSec?: number;
  title: string;
  content: string;
  visualCue: string;  // 镜头画面描述
  visualPrompt?: string;
  selectedCharacterReferenceId?: string | null;
  shot_description?: string;  // 分镜概要（数据库字段名）
}

export interface Step3StoryboardCardAdapterSceneReferenceInput {
  id: string;
  frameIndex: number;
  title: string;
  prompt: string;
  reinforcePrompt?: string;
  candidates: string[];
  selectedImageUrl: string | null;
}

export interface Step3StoryboardCardRoleReferenceItem {
  id: string;
  label: string;
  imageUrl: string;
  isSelected: boolean;
}

export interface Step3StoryboardCardSceneImageItem {
  id: string;
  imageUrl: string;
  isSelected: boolean;
}

export interface Step3StoryboardCardViewModel extends Step3StoryCardViewModelContract {
  frameIndex: number;
  frameLabel: string;
  timeLabel: string;
  title: string;
  narration: string;
  shot_description: string;  // 分镜概要（数据库字段名）
  selectedRoleReferenceId: string | null;
  roleReferenceItems: Step3StoryboardCardRoleReferenceItem[];
  sceneReferenceLabel: string;
  sceneReferenceItems: Step3StoryboardCardSceneImageItem[];
}

export interface Step3StoryboardCardAdapterInput {
  segment: Step3StoryboardCardAdapterSegmentInput;
  roleReferences: readonly Step3CharacterReferenceItem[];
  sceneReference: Step3StoryboardCardAdapterSceneReferenceInput | null;
}

function trimText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function stripNarrationPrefix(value: string): string {
  return value.replace(/^旁白\s*[:：]\s*/u, "").trim();
}

function stripVisualPrefix(value: string): string {
  return value.replace(/^画面\s*[:：]\s*/u, "").trim();
}

function splitSegmentNarrationAndVisual(content: string): { narration: string; visual: string } {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const narrationLines = lines
    .filter((line) => !/^画面\s*[:：]/u.test(line))
    .map((line) => stripNarrationPrefix(line))
    .filter((line) => line.length > 0);
  const visualLines = lines
    .filter((line) => /^画面\s*[:：]/u.test(line))
    .map((line) => stripVisualPrefix(line))
    .filter((line) => line.length > 0);
  if (narrationLines.length < 1 && lines.length === 1 && !/^画面\s*[:：]/u.test(lines[0] ?? "")) {
    narrationLines.push(stripNarrationPrefix(lines[0] ?? ""));
  }
  return {
    narration: narrationLines.join("\n").trim(),
    visual: visualLines[0] ?? "",
  };
}

function resolveNarrationText(content: string): string {
  const normalizedContent = trimText(content);
  if (normalizedContent.length < 1) {
    return "";
  }
  const split = splitSegmentNarrationAndVisual(normalizedContent);
  return split.narration || normalizedContent;
}

/**
 * 解析分镜的主视觉提示词（分镜画面描述）
 * 优先使用 visualPrompt（完整画面提示词）
 * 回退：使用 visualCue（画面描述/shot_description）
 * 最后回退：使用 content（口播旁白）
 */
function resolveMainVisualPrompt(
  content: string,
  visualCue: string,
  visualPrompt?: string | null,
): string {
  // 1. 优先使用 visualPrompt
  const normalizedVisualPrompt = trimText(visualPrompt);
  if (normalizedVisualPrompt.length > 0) {
    return normalizedVisualPrompt;
  }

  // 2. 回退：使用 visualCue（画面描述，来自 shot_description）
  const normalizedVisualCue = trimText(visualCue);
  if (normalizedVisualCue.length > 0) {
    return normalizedVisualCue;
  }

  // 3. 最后回退：使用 content
  return trimText(content);
}

function resolveSelectedRoleReferenceId(
  roleReferences: readonly Step3CharacterReferenceItem[],
  selectedCharacterReferenceId: string | null | undefined,
): string | null {
  const explicitId = trimText(selectedCharacterReferenceId);
  if (explicitId && roleReferences.some((item) => item.id === explicitId)) {
    return explicitId;
  }
  const defaultId = trimText(roleReferences[0]?.id);
  return defaultId.length > 0 ? defaultId : null;
}

function buildRoleReferenceItems(
  roleReferences: readonly Step3CharacterReferenceItem[],
  selectedRoleReferenceId: string | null,
): Step3StoryboardCardRoleReferenceItem[] {
  return roleReferences.map((item) => ({
    id: item.id,
    label: trimText(item.label) || "角色参考图",
    imageUrl: item.imageUrl,
    isSelected: item.id === selectedRoleReferenceId,
  }));
}

function buildSceneReferenceItems(
  sceneReference: Step3StoryboardCardAdapterSceneReferenceInput | null,
): Step3StoryboardCardSceneImageItem[] {
  if (!sceneReference) {
    return [];
  }
  const selectedImageUrl = trimText(sceneReference.selectedImageUrl);
  const candidateUrls = sceneReference.candidates
    .map((imageUrl) => trimText(imageUrl))
    .filter((imageUrl) => imageUrl.length > 0);
  const fallbackSelectedImageUrl = selectedImageUrl || candidateUrls[0] || "";
  return candidateUrls.map((imageUrl, index) => ({
      id: `${sceneReference.id}-candidate-${index + 1}`,
      imageUrl,
      isSelected: fallbackSelectedImageUrl.length > 0 ? imageUrl === fallbackSelectedImageUrl : false,
    }));
}

export function buildStep3StoryboardCardViewModel(
  input: Step3StoryboardCardAdapterInput,
): Step3StoryboardCardViewModel {
  const selectedRoleReferenceId = resolveSelectedRoleReferenceId(
    input.roleReferences,
    input.segment.selectedCharacterReferenceId,
  );
  const roleReferenceItems = buildRoleReferenceItems(input.roleReferences, selectedRoleReferenceId);
  const sceneReferenceItems = buildSceneReferenceItems(input.sceneReference);
  const selectedSceneImageUrl =
    sceneReferenceItems.find((item) => item.isSelected)?.imageUrl ??
    (trimText(input.sceneReference?.selectedImageUrl) || null);

  // 优先使用 durationSec，其次使用 time 字段，最后才估算
  const timeLabel = trimText(input.segment.time) ||
    (typeof input.segment.durationSec === "number" && input.segment.durationSec > 0
      ? `${input.segment.durationSec}s`
      : `${Math.max(0, input.segment.frameIndex - 1) * 3}-${input.segment.frameIndex * 3}s`);

  return {
    frameIndex: input.segment.frameIndex,
    frameLabel: `#${input.segment.frameIndex}`,
    timeLabel,
    title: trimText(input.segment.title) || `镜头 ${input.segment.frameIndex}`,
    narration: resolveNarrationText(input.segment.content),
    shot_description: trimText(input.segment.shot_description) || trimText(input.segment.visualCue),  // 回退使用 visualCue
    selectedRoleReferenceId,
    roleReferenceItems,
    roleReferenceImages: roleReferenceItems.map((item) => item.imageUrl),
    sceneReferenceLabel: trimText(input.sceneReference?.title) || `场景 ${input.segment.frameIndex}`,
    sceneReferenceItems,
    selectedSceneImageUrl,
    mainVisualPrompt: resolveMainVisualPrompt(
      input.segment.content,
      input.segment.visualCue,
      input.segment.visualPrompt,
    ),
    sceneReinforcePrompt: trimText(input.sceneReference?.reinforcePrompt),
  };
}
