import { useState } from "react";
import { resolveStep3FrameOverrideKey } from "./step3FrameOverrideController";
import {
  patchStep3FrameMaskDataUrl,
  resolveStep3FrameMaskDataUrl,
  Step3MaskEditorRuntime,
} from "./step3MaskEditorRuntime";

interface Step3MaskBridgeSegment {
  title: string;
  visualCue: string;
  sceneImageUrl?: string | null;
}

interface Step3MaskEditorSession {
  frameKey: string;
  imageUrl: string;
  title: string;
  promptSummary: string;
}

export function useStep3MaskEditorBridge(input: {
  segments: Step3MaskBridgeSegment[];
  activePreviewFrameIndex: number;
  overrideStateInput: unknown;
  onUpdateOverrideState: (nextState: unknown) => void;
  onFeedback: (message: string) => void;
}) {
  const [session, setSession] = useState<Step3MaskEditorSession | null>(null);
  const activePreviewFrameNumber = input.activePreviewFrameIndex + 1;
  const activePreviewFrameKey = resolveStep3FrameOverrideKey(activePreviewFrameNumber);
  const activeMaskDataUrl =
    input.segments.length > 0 ? resolveStep3FrameMaskDataUrl(input.overrideStateInput, activePreviewFrameKey) : null;

  const openMaskEditorForFrame = (frameIndex = input.activePreviewFrameIndex) => {
    const frameNumber = frameIndex + 1;
    const frameKey = resolveStep3FrameOverrideKey(frameNumber);
    const segment = input.segments[frameIndex];
    const imageUrl = segment?.sceneImageUrl ?? null;
    if (!imageUrl?.trim()) {
      input.onFeedback("请先为当前镜头选择主图后再进入局部重绘。");
      return;
    }
    setSession({
      frameKey,
      imageUrl,
      title: segment?.title?.trim() || `镜头 ${frameNumber}`,
      promptSummary: segment?.visualCue?.trim() || "",
    });
  };

  const modal = (
    <Step3MaskEditorRuntime
      isOpen={Boolean(session)}
      imageUrl={session?.imageUrl ?? ""}
      title={session?.title ?? "当前镜头"}
      promptSummary={session?.promptSummary ?? ""}
      initialMaskDataUrl={session ? resolveStep3FrameMaskDataUrl(input.overrideStateInput, session.frameKey) : null}
      onClose={() => setSession(null)}
      onSave={(maskDataUrl) => {
        if (!session) {
          return;
        }
        input.onUpdateOverrideState(patchStep3FrameMaskDataUrl(input.overrideStateInput, session.frameKey, maskDataUrl));
        input.onFeedback(maskDataUrl ? "已保存当前镜头蒙版。" : "已清空当前镜头蒙版。");
        setSession(null);
      }}
    />
  );

  return {
    activeMaskDataUrl,
    openMaskEditor: () => openMaskEditorForFrame(),
    openMaskEditorForFrame,
    modal,
  };
}
