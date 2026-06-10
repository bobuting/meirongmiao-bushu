import React from "react";
import type { Step2FiveViewCandidateCard } from "../../../../src/contracts/step2-five-view-candidate-board-contract";
import { Button } from "../../components/ui/Button";

interface Step2V2CandidatePreviewPanelProps {
  candidate: Step2FiveViewCandidateCard;
  promptDraft: string;
  generating: boolean;
  retryCreditCost?: number;
  onPromptChange: (value: string) => void;
  onClose: () => void;
  onRegenerate: () => void;
}

export const Step2V2CandidatePreviewPanel: React.FC<Step2V2CandidatePreviewPanelProps> = ({
  candidate,
  promptDraft,
  generating,
  retryCreditCost = 0,
  onPromptChange,
  onClose,
  onRegenerate,
}) => (
  <aside
    data-testid="step2-v2-candidate-preview-panel"
    className="absolute inset-y-0 right-0 z-30 w-full border-l border-gray-200 bg-white shadow-2xl md:w-[420px] flex flex-col"
  >
    <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3 shrink-0">
      <div>
        <div className="text-sm font-bold text-gray-900">角色候选详情</div>
        <div className="text-xs text-gray-500">{candidate.title}</div>
      </div>
      <button
        data-testid="step2-v2-candidate-panel-close"
        onClick={onClose}
        className="text-gray-400 hover:text-gray-700"
      >
        <span className="material-icons-round">close</span>
      </button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
        {candidate.fiveViewAssetUrl || candidate.closeupPreviewUrl ? (
          <img
            src={candidate.fiveViewAssetUrl ?? candidate.closeupPreviewUrl ?? ""}
            alt={candidate.title}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-52 items-center justify-center text-gray-400">
            <span className="material-icons-round text-3xl">image_not_supported</span>
          </div>
        )}
      </div>
    </div>
    <div className="shrink-0 border-t border-gray-100 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="space-y-2">
        <div className="text-xs font-bold text-gray-700">提示词（留空=重生图，非空=图生图）</div>
        <textarea
          data-testid="step2-v2-prompt-input"
          value={promptDraft}
          onChange={(event) => onPromptChange(event.target.value)}
          className="h-auto w-full aspect-[5/3] resize-none overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700 outline-none focus:border-primary"
          placeholder="输入定向提示词后点击重生成图。"
        />
      </div>
      <div className="mt-3">
        <Button
          data-testid="step2-v2-regenerate-button"
          variant="secondary"
          className="w-full"
          onClick={onRegenerate}
          isLoading={generating}
          title={retryCreditCost > 0 ? `重生成图（${retryCreditCost}积分）` : "重生成图"}
        >
          <span>重生成图</span>
          {retryCreditCost > 0 && (
            <>
              <span className="mx-1.5 w-px h-3 bg-current opacity-30" />
              <span className="text-xs opacity-75">{retryCreditCost}积分</span>
            </>
          )}
        </Button>
      </div>
    </div>
  </aside>
);
