import { buildSceneReferencePrompt } from "../../../../src/storyboard-scene-prompt-policy";

export interface Step3SceneReinforcePromptDraftInput {
  frameIndex: number;
  title: string;
  narration: string;
  mainVisualPrompt: string;
}

const SCENE_HINT_PATTERN = /[【\[]\s*场景建议\s*[:：]\s*([^】\]]+)[】\]]/i;

function trimText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function stripVisualPrefix(value: string): string {
  return value.replace(/^画面\s*[:：]\s*/u, "").trim();
}

function pickVisualPromptSource(input: Step3SceneReinforcePromptDraftInput): string {
  const visualCue = trimText(input.mainVisualPrompt);
  const visualLines = visualCue
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^画面\s*[:：]/u.test(line));
  const extractedVisual = stripVisualPrefix(visualLines[0] ?? "");
  if (extractedVisual) {
    return extractedVisual;
  }
  const hintMatch = visualCue.match(SCENE_HINT_PATTERN);
  const sceneHint = trimText(hintMatch?.[1]);
  if (sceneHint) {
    return sceneHint;
  }
  const narrationlessPrompt = visualCue
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^旁白\s*[:：]/u.test(line))
    .join(" ");
  return narrationlessPrompt || trimText(input.narration) || trimText(input.title) || `镜头 ${input.frameIndex} 场景参考`;
}

export function buildStep3SceneReinforcePromptDraft(input: Step3SceneReinforcePromptDraftInput): string {
  const policy = buildSceneReferencePrompt({
    index: input.frameIndex,
    title: trimText(input.title) || `镜头 ${input.frameIndex}`,
    narration: trimText(input.narration),
    visualPrompt: pickVisualPromptSource(input),
  });
  return policy.prompt.trim();
}
