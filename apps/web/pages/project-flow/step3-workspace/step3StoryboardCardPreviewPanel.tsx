import React, { useId, useRef, useMemo, useCallback } from "react";
import {
  STEP3_SCENE_CANDIDATE_DRAG_MIME,
  type Step3CandidateStripViewModel,
} from "./step3CandidateStripRuntime";
import { Step3PreviewCardRuntime, type Step3PreviewCardViewModel } from "./step3PreviewCardRuntime";
import {
  Step3CandidateExpander,
  type Step3CandidateExpanderViewModel,
} from "./step3CandidateExpander";

function trimText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function canUseDroppedImageUrl(value: string): boolean {
  return /^(?:https?:\/\/|\/storage\/|data:image\/)/i.test(value);
}

function listDroppedItems(event: React.DragEvent<HTMLDivElement>): DataTransferItem[] {
  return Array.from(event.dataTransfer.items as ArrayLike<DataTransferItem>);
}

function listDroppedFiles(event: React.DragEvent<HTMLDivElement>): File[] {
  return Array.from(event.dataTransfer.files as ArrayLike<File>);
}

async function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result.trim()) {
        reject(new Error("empty-file-result"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("file-read-failed"));
    reader.readAsDataURL(file);
  });
}

export interface Step3StoryboardCardPreviewPanelProps {
  frameIndex: number;
  previewViewModel: Step3PreviewCardViewModel;
  candidateStripViewModel: Step3CandidateStripViewModel | null;
  isGenerating: boolean;
  generationStartedAt?: number | null;
  retryCreditCost?: number;
  hasMaskApplied: boolean;
  onGenerateOrRetry: () => void;
  onOpenMaskEditor: () => void;
  onSelectCandidate: (sceneReferenceId: string, imageUrl: string) => void;
  onOpenPreview: (imageUrl: string, label: string) => void;
  onManualReplaceImage: (imageUrl: string) => void;
}

export const Step3StoryboardCardPreviewPanel: React.FC<Step3StoryboardCardPreviewPanelProps> = ({
  frameIndex,
  previewViewModel,
  candidateStripViewModel,
  isGenerating,
  generationStartedAt = null,
  retryCreditCost = 0,
  hasMaskApplied,
  onGenerateOrRetry,
  onOpenMaskEditor,
  onSelectCandidate,
  onOpenPreview,
  onManualReplaceImage,
}) => {
  const uploadInputId = useId();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileReplace = async (file: File | null | undefined) => {
    if (!file || !file.type.startsWith("image/")) {
      return;
    }
    const dataUrl = await readImageFileAsDataUrl(file);
    onManualReplaceImage(dataUrl);
  };

  // 构建候选图展开选择器的视图模型
  const candidateExpanderViewModel = useMemo((): Step3CandidateExpanderViewModel | null => {
    if (!candidateStripViewModel || candidateStripViewModel.candidates.length < 1) {
      return null;
    }
    return {
      sceneReferenceId: candidateStripViewModel.sceneReferenceId,
      frameIndex: candidateStripViewModel.frameIndex,
      selectedImageUrl: candidateStripViewModel.candidates.find((c) => c.isSelected)?.imageUrl ?? null,
      candidates: candidateStripViewModel.candidates.map((c) => ({
        imageUrl: c.imageUrl,
        label: c.label,
      })),
    };
  }, [candidateStripViewModel]);

  // 处理候选图选择
  const handleSelectCandidate = useCallback((imageUrl: string) => {
    if (!candidateStripViewModel) return;
    onSelectCandidate(candidateStripViewModel.sceneReferenceId, imageUrl);
  }, [candidateStripViewModel, onSelectCandidate]);

  return (
    <div
      data-testid={`step3-frame-preview-panel-${frameIndex}`}
      className="flex h-full flex-col gap-3"
    >
      {/* Preview card with candidate expander */}
      <Step3CandidateExpander
        viewModel={candidateExpanderViewModel}
        onSelectCandidate={handleSelectCandidate}
        onPreviewImage={onOpenPreview}
        isGenerating={isGenerating}
      >
        <div
          className="flex-1 min-h-0"
          onDragOver={(event) => {
            const hasFile = listDroppedItems(event).some((item) => item.kind === "file");
            const manualImageUrl =
              trimText(event.dataTransfer.getData(STEP3_SCENE_CANDIDATE_DRAG_MIME)) ||
              trimText(event.dataTransfer.getData("text/uri-list")) ||
              trimText(event.dataTransfer.getData("text/plain"));
            if (hasFile || canUseDroppedImageUrl(manualImageUrl)) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            const file = listDroppedFiles(event).find((item) => item.type.startsWith("image/")) ?? null;
            if (file) {
              void handleFileReplace(file);
              return;
            }
            const manualImageUrl =
              trimText(event.dataTransfer.getData(STEP3_SCENE_CANDIDATE_DRAG_MIME)) ||
              trimText(event.dataTransfer.getData("text/uri-list")) ||
              trimText(event.dataTransfer.getData("text/plain"));
            if (canUseDroppedImageUrl(manualImageUrl)) {
              onManualReplaceImage(manualImageUrl);
            }
          }}
        >
          <Step3PreviewCardRuntime
            viewModel={previewViewModel}
            isGenerating={isGenerating}
            generationStartedAt={generationStartedAt}
            retryCreditCost={retryCreditCost}
            hasMaskApplied={hasMaskApplied}
            onGenerateOrRetry={onGenerateOrRetry}
            onOpenPreview={onOpenPreview}
            onChangeImage={() => uploadInputRef.current?.click()}
            onOpenMaskEditor={onOpenMaskEditor}
          />
        </div>
      </Step3CandidateExpander>

      <label htmlFor={uploadInputId} className="sr-only">
        上传替换当前镜头主图
      </label>
      <input
        id={uploadInputId}
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          void handleFileReplace(file);
          event.target.value = "";
        }}
      />
    </div>
  );
};
