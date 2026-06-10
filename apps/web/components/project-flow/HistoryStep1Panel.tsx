import React from "react";
import { getOssThumbnailUrl } from "../../utils/ossImage";

/** 服装参考项 */
export interface OutfitReferenceItem {
  category: string;
  label: string;
  imageUrl: string | null;
}

/** 已选搭配摘要 */
export interface OutfitSummary {
  sourceLabel: string;
  title: string;
  complementaryItems: Array<{
    id: string;
    label: string;
    text: string;
  }>;
}

/** 已选角色预设 */
export interface RolePresetInfo {
  title: string;
  imageUrl: string;
  compactLines: Array<{
    lineId: string;
    text: string;
    emphasis?: boolean;
  }>;
  gender?: string | null;
  age?: number | null;
  styleWords?: string[] | null;
  ethnicityOrRegion?: string | null;
}

export interface HistoryStep1PanelProps {
  /** 服装参考图列表 */
  outfitReferenceItems: OutfitReferenceItem[];
  /** 已选搭配摘要 */
  outfitSummary: OutfitSummary;
  /** 已选角色预设 */
  rolePreset?: RolePresetInfo | null;
  /** 图片预览回调 */
  onImagePreview?: (imageUrl: string, label: string) => void;
}

/**
 * Step 1 历史面板 - 服装搭配
 */
export const HistoryStep1Panel: React.FC<HistoryStep1PanelProps> = ({
  outfitReferenceItems,
  outfitSummary,
  rolePreset,
  onImagePreview,
}) => {
  const hasOutfitDetails = (outfitSummary.complementaryItems?.length ?? 0) > 0;

  return (
    <div className="px-6 py-4">
      {/* 服装参考图 */}
      <div className="rounded-lg border border-gray-200 bg-white p-3 mb-3">
        <div className="mb-2 text-xs font-semibold text-gray-600">服装参考图</div>
        {outfitReferenceItems.length > 0 ? (
          <div className="flex gap-2 justify-center items-start">
            {outfitReferenceItems.map((item, index) => (
              <div
                key={`history-step1-outfit-${item.category}-${index}`}
                className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50 cursor-pointer group"
                style={{ maxWidth: 100 }}
                onClick={() => {
                  if (item.imageUrl) {
                    onImagePreview?.(item.imageUrl, item.label);
                  }
                }}
              >
                <div>
                  {item.imageUrl ? (
                    <img src={getOssThumbnailUrl(item.imageUrl, 300)} alt={item.label} className="h-auto w-full object-contain" loading="lazy" />
                  ) : (
                    <div className="h-24 flex items-center justify-center text-gray-300">
                      <span className="material-icons-round text-2xl">image_not_supported</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    {item.imageUrl && (
                      <span className="material-icons-round text-white opacity-0 group-hover:opacity-100 transition-opacity text-lg drop-shadow-lg">zoom_in</span>
                    )}
                  </div>
                </div>
                <div className="border-t border-gray-200 px-2 py-1 text-[10px] text-gray-600 truncate">{item.label}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded border border-dashed border-gray-300 px-3 py-4 text-xs text-gray-400 text-center">
            暂无服装参考图
          </div>
        )}
      </div>

      {/* 已选搭配摘要 */}
      <div className="rounded-lg border border-gray-200 bg-white p-3 mb-3">
          <div className="mb-2 text-xs font-semibold text-gray-600">已选搭配</div>
        <div className="rounded-md border border-orange-100 bg-orange-50/60 px-2.5 py-2 text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-gray-900 truncate flex-1 min-w-0" title={outfitSummary.title}>
              {outfitSummary.title}
            </span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-primary border border-orange-200 shrink-0">
              {outfitSummary.sourceLabel}
            </span>
          </div>
          {hasOutfitDetails && (
            <div className="mt-2 grid grid-cols-1 gap-2">
              {outfitSummary.complementaryItems.map((item, index) => (
                <div
                  key={`history-step1-outfit-detail-${item.id}-${index}`}
                  className="rounded-md border border-orange-200/70 bg-white px-2 py-1.5"
                >
                  <div className="text-[11px] font-bold text-gray-900">{item.label}</div>
                  <p className="mt-0.5 text-[11px] leading-5 text-gray-600 break-words">{item.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 已选角色预设 - 仅在Step2显示，Step3时不显示避免重复 */}
      {rolePreset && (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold text-gray-600">已选角色预设</div>
          <div className="rounded-lg border border-orange-100 bg-orange-50/50 px-2.5 py-2">
            <div className="flex gap-2.5">
              {rolePreset.imageUrl ? (
                <div
                  className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-orange-100 bg-white cursor-pointer group"
                  onClick={() => {
                    onImagePreview?.(rolePreset.imageUrl, rolePreset.title);
                  }}
                >
                  <img src={getOssThumbnailUrl(rolePreset.imageUrl, 200)} alt="角色预设" className="h-full w-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <span className="material-icons-round text-white opacity-0 group-hover:opacity-100 transition-opacity text-lg drop-shadow-lg">zoom_in</span>
                  </div>
                </div>
              ) : (
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-orange-100 bg-gray-50 flex items-center justify-center">
                  <span className="material-icons-round text-gray-300 text-2xl">person</span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                </div>
                {(rolePreset.compactLines?.length ?? 0) > 0 && (
                  <div className="space-y-0.5 text-[11px] leading-4 text-gray-600">
                    {rolePreset.compactLines.map((line) => (
                      <div
                        key={`history-step1-role-line-${line.lineId}`}
                        className={line.emphasis ? "font-semibold text-gray-800" : ""}
                      >
                        {line.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
