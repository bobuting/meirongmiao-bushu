import React from "react";
import { getOssThumbnailUrl } from "../../utils/ossImage";
import type { RolePresetInfo } from "./HistoryStep1Panel";

/** 角色参考项 */
export interface CharacterReferenceItem {
  id: string;
  label?: string;
  imageUrl: string;
}

export interface HistoryStep2PanelProps {
  /** 角色参考图列表（仅使用第一个作为主图） */
  characterReferences: CharacterReferenceItem[];
  /** 已选角色预设 */
  rolePreset?: RolePresetInfo | null;
  /** 图片预览回调 */
  onImagePreview?: (imageUrl: string, label: string) => void;
  /** 加载状态 */
  loading?: boolean;
}

/**
 * Step 2 历史面板 - 角色定妆
 */
export const HistoryStep2Panel: React.FC<HistoryStep2PanelProps> = ({
  characterReferences,
  rolePreset,
  onImagePreview,
  loading = false,
}) => {
  const mainImage = characterReferences[0];

  return (
    <>
      {/* 角色预设信息 */}
      {rolePreset && (
        <div className="px-6 py-4">
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
                          key={`history-step2-role-line-${line.lineId}`}
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
        </div>
      )}

      {/* 角色参考图 */}
      <div className="px-6 py-4">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold text-gray-600">角色参考图</div>
          {/* 加载状态骨架屏 */}
          {loading ? (
            <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-100 animate-pulse flex items-center justify-center">
              <div className="w-10 h-10 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : mainImage ? (
            <div
              className="relative aspect-video w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-50 cursor-pointer group"
              onClick={() => {
                if (mainImage?.imageUrl) {
                  onImagePreview?.(mainImage.imageUrl, mainImage.label ?? "角色参考图");
                }
              }}
            >
              <img
                src={getOssThumbnailUrl(mainImage?.imageUrl ?? "", 400)}
                alt="角色主图"
                className="h-full w-full object-cover object-left"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <span className="material-icons-round text-white opacity-0 group-hover:opacity-100 transition-opacity text-3xl drop-shadow-lg">zoom_in</span>
              </div>
            </div>
          ) : (
            <div className="rounded border border-dashed border-gray-300 px-3 py-4 text-xs text-gray-400 text-center">
              暂无角色参考图
            </div>
          )}
        </div>
      </div>
    </>
  );
};
