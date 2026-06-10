import {
  buildStoryboardPromptInput,
  type StoryboardPromptInput,
} from "../../../../src/contracts/storyboard-character-summary";
import type { Step3CharacterReferenceItem } from "../../utils/step3CharacterReferencePool";

export interface Step3StoryboardPromptInputOptions {
  readonly script: string;
  readonly frameCount: number;
  readonly writingStyle?: string | null;
  readonly templateLabel?: string | null;
  readonly projectName?: string | null;
  readonly outfitSummary?: string | null;
  readonly rolePresetSummary?: string | null;
  readonly characterStylingPrompt?: string | null;
  readonly characterReferences?: readonly Step3CharacterReferenceItem[];
}

function buildProjectContextText(options: Step3StoryboardPromptInputOptions): string {
  const segments = [
    options.projectName?.trim() ? `项目=${options.projectName.trim()}` : "",
    options.templateLabel?.trim() ? `模板=${options.templateLabel.trim()}` : "",
    options.writingStyle?.trim() ? `风格=${options.writingStyle.trim()}` : "",
  ].filter((item) => item.length > 0);
  return segments.join("；");
}

export function buildStep3StoryboardPromptInput(
  options: Step3StoryboardPromptInputOptions,
): StoryboardPromptInput {
  const rolePresetSummary = options.rolePresetSummary?.trim() ?? "";
  return buildStoryboardPromptInput(
    {
      script: options.script,
      frameCount: options.frameCount,
      writingStyle: options.writingStyle ?? null,
      templateLabel: options.templateLabel ?? null,
      characterStylingPrompt: options.characterStylingPrompt ?? null,
    },
    {
      characterName:
        rolePresetSummary.length > 0
          ? rolePresetSummary
          : (options.characterReferences ?? []).length > 0
          ? "已确认角色"
          : null,
      outfitSummary: options.outfitSummary ?? null,
      projectContext: buildProjectContextText(options),
      referenceAnchors: (options.characterReferences ?? []).map((item) => item.label),
    },
  );
}
