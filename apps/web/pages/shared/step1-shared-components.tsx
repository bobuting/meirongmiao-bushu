// apps/web/pages/shared/step1-shared-components.tsx
/**
 * Step1 服装上传共享组件
 * 包含 Assets.tsx 和 ImageAssets.tsx 共用的组件
 */

import React, { useState, useCallback } from "react";
import { getOssThumbnailUrl } from "../../utils/ossImage";
import {
  PROJECT_FLOW_MEDIA_CHROME_Z_CLASS,
  PROJECT_FLOW_MEDIA_HOVER_OVERLAY_Z_CLASS,
  PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS,
} from "../project-flow/projectFlowMediaLayerGuard";
import type { Step1OutfitModuleImage, Step1OutfitModuleCategory } from "../../../../src/contracts/step1-outfit-module-contract";
import type { Step1OutfitAnalysisCard } from "../../../../src/contracts/step1-outfit-analysis-card-contract";
import {
  STEP1_MODULE_CATEGORY_LABELS,
  STEP1_MODULE_CATEGORY_ICON,
} from "./step1-utils";

// ============================================================================
// 类型定义
// ============================================================================

/** 兼容旧数据类型（已废弃，使用 Step1OutfitAnalysisCard） */
export type OutfitAnalysisCardData = Step1OutfitAnalysisCard;

export interface LibraryAssetItem {
  id: string;
  name: string;
  mainImageUrl: string;
  category?: string;
}

// ============================================================================
// SelectedCardBadge 已选中卡片徽章组件
// ============================================================================

export const SelectedCardBadge: React.FC<{ source: string }> = ({ source }) => (
  <div
    data-testid={`step1-selected-badge-${source}`}
    className={`pointer-events-none ${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} bottom-3 right-3 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white shadow`}
  >
    <span className="material-icons-round text-sm">check</span>
  </div>
);

// ============================================================================
// 事件处理工具函数
// ============================================================================

export function isCardSelectionIgnoredTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest("button, textarea, input, select, a, label"));
}

// ============================================================================
// UploadSlotCard 上传槽位卡片组件
// ============================================================================

export const UploadSlotCard: React.FC<{
  category: Step1OutfitModuleCategory;
  uploaded: string | null;
  onClick: () => void;
}> = ({ category, uploaded, onClick }) => (
  <div
    onClick={onClick}
    data-testid={`step1-upload-slot-${category}`}
    className={`aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all group relative overflow-hidden ${
      uploaded
        ? "border-primary/50 bg-primary/5"
        : "border-gray-200 bg-gray-50 hover:bg-white hover:border-primary/50"
    }`}
  >
    {uploaded ? (
      <>
        <img src={getOssThumbnailUrl(uploaded, 400)} className={`${PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS} w-full h-full object-cover p-2`} alt={STEP1_MODULE_CATEGORY_LABELS[category]}  loading="lazy" />
        <div className={`${PROJECT_FLOW_MEDIA_HOVER_OVERLAY_Z_CLASS} bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity`}>
          <span className="material-icons-round text-white">edit</span>
        </div>
        <div className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} top-1 right-1 bg-green-500 text-white text-[10px] px-1.5 rounded-full shadow-sm`}>
          Ready
        </div>
      </>
    ) : (
      <>
        <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
          <span className="material-icons-round text-gray-400 group-hover:text-primary transition-colors">{STEP1_MODULE_CATEGORY_ICON[category]}</span>
        </div>
        <span className="text-xs font-bold text-gray-500 group-hover:text-primary">{STEP1_MODULE_CATEGORY_LABELS[category]}</span>
      </>
    )}
  </div>
);

// ============================================================================
// AnalysisText 可展开/折叠的分析文本
// ============================================================================

const AnalysisText: React.FC<{ text: string }> = ({ text }) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 150;

  return (
    <div className="flex-1 min-h-0 rounded-xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-3">
      <p className={`text-sm leading-6 text-gray-700 whitespace-pre-wrap ${!expanded && isLong ? "line-clamp-3" : ""}`}>
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="mt-1 text-xs text-primary hover:text-primary/80 font-medium"
        >
          {expanded ? "收起" : "展开全文"}
        </button>
      )}
    </div>
  );
};

// ============================================================================
// OutfitAnalysisCard 搭配分析卡片组件
// ============================================================================

export const OutfitAnalysisCard: React.FC<{
  card: OutfitAnalysisCardData;
  selected: boolean;
  disabled?: boolean;
  status?: "pending" | "ready" | "failed";
  className?: string;
  onSelect: () => void;
}> = ({
  card,
  selected,
  disabled = false,
  status = "ready",
  className,
  onSelect,
}) => {
  const isPending = status === "pending";
  const isDisabled = disabled || isPending;
  const cardRef = React.useRef<HTMLDivElement>(null);

  /** 点击时播放 outline + scale 脉冲动画，动画结束后触发 onSelect */
  const triggerPulseAndSelect = useCallback(() => {
    const el = cardRef.current;
    if (el) {
      // 使用 Web Animations API 实现 outline 光晕 + scale 脉冲（primary 品牌色）
      const anim = el.animate([
        { outline: "0px solid rgba(230,140,25,0)", transform: "scale(1)", offset: 0 },
        { outline: "8px solid rgba(230,140,25,0.35)", transform: "scale(1.04)", offset: 0.4 },
        { outline: "0px solid rgba(230,140,25,0)", transform: "scale(1)", offset: 1 },
      ], { duration: 480, easing: "ease-out" });
      anim.onfinish = () => onSelect();
    } else {
      onSelect();
    }
  }, [onSelect]);

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      aria-disabled={isDisabled}
      aria-pressed={selected}
      data-testid={`step1-analysis-card-${card.planId}`}
      onKeyDown={(event) => {
        if (isDisabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          triggerPulseAndSelect();
        }
      }}
      onClickCapture={(event) => {
        if (isDisabled) return;
        if (isCardSelectionIgnoredTarget(event.target)) return;
        triggerPulseAndSelect();
      }}
      className={`relative h-full flex flex-col rounded-2xl border-2 bg-white p-5 transition-all touch-manipulation ${
        isDisabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"
      } ${selected ? "border-primary bg-gradient-to-br from-primary/5 to-orange-50 shadow-lg shadow-primary/20" : "border-gray-200 hover:border-primary/40 hover:shadow-md"} ${
        className ?? ""
      }`}
    >
      {/* 顶部：搭配方案标题 + 风格 + 状态标签 */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-bold text-gray-900 truncate">{card.title || `搭配方案 #${card.index}`}</span>
          {card.styleName && (
            <span className="shrink-0 inline-flex items-center rounded-md bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 whitespace-nowrap">
              {card.styleName}
            </span>
          )}
        </div>
        <span
          data-testid={`step1-analysis-status-${card.planId}`}
          className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            isPending ? "bg-orange-100 text-orange-700" : selected ? "bg-primary/10 text-primary" : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {isPending ? (
            <span
              data-testid={`step1-analysis-status-spinner-${card.planId}`}
              className="mr-1 h-2 w-2 rounded-full border border-orange-400 border-t-transparent animate-spin"
              aria-hidden="true"
            />
          ) : null}
          {isPending ? "生成中" : selected ? "已选择" : "已就绪"}
        </span>
      </div>

      {/* 风格标签区域 */}
      {card.tags && card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {card.tags.map((tag, ti) => (
            <span
              key={ti}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${
                ti % 3 === 0
                  ? "bg-blue-100 text-blue-700"
                  : ti % 3 === 1
                    ? "bg-amber-100 text-amber-700"
                    : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* 分析详情区域（默认截断，点击展开） */}
      <AnalysisText text={isPending ? "时尚穿搭分析生成中，请稍候自动刷新..." : (card.analysis?.trim() || "暂无返回内容，等待接入或联系管理员开启 API。")} />

      {/* 适用场景 */}
      {card.suitableScene && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="material-icons-round text-sm text-gray-400">place</span>
            <span className="font-medium">适用场景：</span>
            <span>{card.suitableScene}</span>
          </div>
        </div>
      )}

      {/* 搭配单品列表，动态渲染 LLM 返回的 items */}
      {(() => {
        const displayItems = card.items;

        if (displayItems.length === 0) return null;

        // 服饰类型对应 Material Icons 图标
        const typeIcons: Record<string, string> = {
          "上装": "checkroom",
          "下装": "checkroom",
          "鞋履": "hiking",
          "配饰": "diamond",
          "套装": "business_center",
          "连衣裙": "checkroom",
          "外套": "checkroom",
        };
        const itemColors = [
          { icon: "text-rose-500", bg: "bg-rose-50", text: "text-rose-700" },
          { icon: "text-sky-500", bg: "bg-sky-50", text: "text-sky-700" },
          { icon: "text-amber-500", bg: "bg-amber-50", text: "text-amber-700" },
          { icon: "text-purple-500", bg: "bg-purple-50", text: "text-purple-700" },
          { icon: "text-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700" },
          { icon: "text-indigo-500", bg: "bg-indigo-50", text: "text-indigo-700" },
        ];

        return (
          <div className="mt-auto pt-3 space-y-2 text-xs text-gray-700">
            {displayItems.map((item, i) => {
              const c = itemColors[i % itemColors.length];
              return (
                <div key={`${item.type}-${i}`} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg ${c.bg}`}>
                  <span className={`material-icons-round text-sm shrink-0 ${c.icon}`}>{typeIcons[item.type] || "checkroom"}</span>
                  <span className={`shrink-0 font-semibold ${c.text}`}>{item.type}</span>
                  <span className="min-w-0 text-gray-700 leading-5 line-clamp-2">
                    {item.name}{item.description ? ` — ${item.description}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })()}

      {selected ? <SelectedCardBadge source="analysis" /> : null}
    </div>
  );
};

// ============================================================================
// SelectionPanel 选择面板组件
// ============================================================================

export const SelectionPanel: React.FC<{
  category: Step1OutfitModuleCategory;
  assets: LibraryAssetItem[];
  isLoading: boolean;
  isUploading: boolean;
  hasSelected: boolean;
  onSelect: (asset: LibraryAssetItem) => void;
  onUpload: (file: File) => Promise<void>;
  onClear: () => void;
  onClose: () => void;
}> = ({ category, assets, isLoading, isUploading, hasSelected, onSelect, onUpload, onClear, onClose }) => {
  const uploadInputId = `upload-${category}-file`;
  return (
    <div className="h-full flex flex-col bg-white">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <span className="material-icons-round text-primary">checkroom</span>选择{STEP1_MODULE_CATEGORY_LABELS[category]}
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-800 p-1 hover:bg-gray-200 rounded-full transition-colors">
          <span className="material-icons-round">close</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
          <div className="text-xs text-gray-500">
            {assets.length > 0 ? `优选库可选 ${assets.length} 项` : "当前分类暂无优选库素材"}
          </div>
          <div className="flex items-center gap-2">
            {hasSelected ? (
              <button
                onClick={onClear}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 hover:border-primary/30 hover:text-primary"
              >
                <span className="material-icons-round text-sm">remove_circle_outline</span>
                清空选择
              </button>
            ) : null}
            <label
              htmlFor={uploadInputId}
              className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                isUploading
                  ? "border-gray-200 bg-gray-100 text-gray-400"
                  : "border-primary bg-primary text-white shadow-sm hover:bg-primary-hover"
              }`}
            >
              <span className="material-icons-round text-sm">upload</span>
              {isUploading ? "上传中..." : "自己上传"}
            </label>
          </div>
          <input
            id={uploadInputId}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={isUploading}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              await onUpload(file);
              event.currentTarget.value = "";
            }}
          />
        </div>

        {isLoading ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
            正在加载优选库...
          </div>
        ) : assets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-orange-200 bg-orange-50 p-8 text-center text-sm text-orange-900">
            当前分类没有可用素材，请先上传后再选择。
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {assets.map((asset) => (
              <div
                key={asset.id}
                onClick={() => onSelect(asset)}
                data-testid={`step1-library-asset-${asset.id}`}
                className="aspect-[3/4] rounded-lg border border-gray-200 overflow-hidden cursor-pointer hover:border-primary hover:shadow-md transition-all group relative"
              >
                <img src={getOssThumbnailUrl(asset.mainImageUrl, 400)} alt={asset.name} className="w-full h-full object-cover"  loading="lazy" />
                <div className="absolute inset-x-0 bottom-0 bg-white/90 p-2 text-xs font-bold text-center translate-y-full group-hover:translate-y-0 transition-transform">
                  {asset.name}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};