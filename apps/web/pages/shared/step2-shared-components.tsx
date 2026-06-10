// apps/web/pages/shared/step2-shared-components.tsx
/**
 * Step2 角色定妆共享组件
 * 包含五视图布局和移动端配置抽屉
 */

import React, { useMemo, useState } from "react";
import { BlurFillImage } from "../../components/shared/BlurFillImage";
import { LoadMoreButton } from "../../components/shared/LoadMoreButton";
import { getOssThumbnailUrl } from "../../utils/ossImage";
import {
  PROJECT_FLOW_MEDIA_CHROME_Z_CLASS,
} from "../project-flow/projectFlowMediaLayerGuard";
import {
  type FiveViewSlotKey,
  type ViewItem,
  VIEW_LABEL_BY_KEY,
  FIVE_VIEW_SLOT_ORDER,
  normalizeFiveViewSlots,
} from "./step2-utils";

// ============================================================================
// FiveViewLayout 五视图布局组件
// ============================================================================

export const FiveViewLayout: React.FC<{
  title: string;
  items: ViewItem[];
  emptyText: string;
  showEmptyHint?: boolean;
  selectable?: boolean;
  selectedId?: string | null;
  regeneratingId?: string | null;
  generatedIds?: string[];
  allowPendingClick?: boolean;
  pendingTileClickEnabled?: boolean;
  onSelect?: (item: ViewItem) => void;
  onRegenerate?: (item: ViewItem) => void;
  onPreview?: (item: ViewItem) => void;
  onPendingClick?: (slot: FiveViewSlotKey) => void;
  headerAction?: React.ReactNode;
  regeneratingSlotKey?: FiveViewSlotKey | null;
  tileTestIdPrefix?: string;
  draggable?: boolean;
  dropEnabled?: boolean;
  onDropItem?: (slot: FiveViewSlotKey, item: ViewItem) => void;
  collapseWhenEmpty?: boolean;
  hideMissingSlots?: boolean;
}> = ({
  title,
  items,
  emptyText,
  showEmptyHint = true,
  selectable = false,
  selectedId = null,
  regeneratingId = null,
  generatedIds = [],
  allowPendingClick = false,
  pendingTileClickEnabled = true,
  onSelect,
  onRegenerate,
  onPreview,
  onPendingClick,
  headerAction,
  regeneratingSlotKey = null,
  tileTestIdPrefix,
  draggable = false,
  dropEnabled = false,
  onDropItem,
  collapseWhenEmpty = false,
  hideMissingSlots = false,
}) => {
  const slots = normalizeFiveViewSlots(items);
  const filledSlotsInOrder: FiveViewSlotKey[] = FIVE_VIEW_SLOT_ORDER.filter(
    (slot) => Boolean(slots[slot]),
  );
  const dragPayloadMime = "application/x-vogue-five-view-item";

  const renderTile = (slot: FiveViewSlotKey, className: string, fallbackLabel: string) => {
    const item = slots[slot];
    const generatedOnce = item ? generatedIds.includes(item.id) : false;
    const isGeneratingSlot = regeneratingSlotKey === slot || (item ? regeneratingId === item.id : false);
    const canGenerateSlot = item ? selectable && Boolean(onRegenerate) : allowPendingClick && Boolean(onPendingClick);

    return (
      <div
        data-testid={tileTestIdPrefix ? `${tileTestIdPrefix}-${slot}` : undefined}
        onDragOver={(event) => {
          if (!dropEnabled) {
            return;
          }
          event.preventDefault();
        }}
        onDrop={(event) => {
          if (!dropEnabled || !onDropItem) {
            return;
          }
          event.preventDefault();
          const payload =
            event.dataTransfer.getData(dragPayloadMime) ||
            event.dataTransfer.getData("text/plain");
          if (!payload) {
            return;
          }
          try {
            const parsed = JSON.parse(payload) as ViewItem;
            if (
              typeof parsed?.id !== "string" ||
              typeof parsed?.label !== "string" ||
              typeof parsed?.imageUrl !== "string"
            ) {
              return;
            }
            onDropItem(slot, parsed);
          } catch {
            // Ignore invalid drag payload.
          }
        }}
        className={`group relative overflow-hidden rounded-lg border bg-gray-100 ${className} ${
          item && selectable
            ? selectedId === item.id
              ? "cursor-pointer border-primary ring-2 ring-primary/20"
              : "cursor-pointer border-gray-200 hover:border-primary/40"
            : "border-gray-200"
        } ${dropEnabled ? "border-dashed hover:border-primary/50" : ""}`}
      >
        {item && selectable ? (
          <button
            type="button"
            className="h-full w-full"
            draggable={draggable}
            onClick={() => onSelect?.(item)}
            onDoubleClick={() => onPreview?.(item)}
            onDragStart={(event) => {
              if (!draggable) {
                return;
              }
              const payload = JSON.stringify(item);
              event.dataTransfer.setData(dragPayloadMime, payload);
              event.dataTransfer.setData("text/plain", payload);
              event.dataTransfer.effectAllowed = "copyMove";
            }}
          >
            <img src={getOssThumbnailUrl(item.imageUrl, 300)} alt={item.label} className="h-full w-full object-cover" loading="lazy" />
          </button>
        ) : item ? (
          <img
            src={item.imageUrl}
            alt={item.label}
            className={`h-full w-full object-cover ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
            draggable={draggable}
            onDoubleClick={() => onPreview?.(item)}
            onDragStart={(event) => {
              if (!draggable) {
                return;
              }
              const payload = JSON.stringify(item);
              event.dataTransfer.setData(dragPayloadMime, payload);
              event.dataTransfer.setData("text/plain", payload);
              event.dataTransfer.effectAllowed = "copyMove";
            }}
           loading="lazy" />
        ) : allowPendingClick && pendingTileClickEnabled ? (
          <button
            type="button"
            className="flex h-full w-full items-center justify-center text-xs font-bold text-gray-400 hover:text-primary"
            onClick={() => onPendingClick?.(slot)}
            title="待确认，点击生成该视角"
          >
            待确认
          </button>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-bold text-gray-400">待确认</div>
        )}
        <div className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} bottom-0 left-0 right-0 bg-black/65 px-2 py-1 text-[10px] font-bold text-white`}>
          {item?.label ?? fallbackLabel}
        </div>
        {canGenerateSlot ? (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (item) {
                onRegenerate?.(item);
                return;
              }
              onPendingClick?.(slot);
            }}
            disabled={isGeneratingSlot}
            className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-white transition hover:bg-black/80 disabled:opacity-50`}
            aria-label={item ? (generatedOnce ? "重试生成该视图" : "重新生成该视图") : "生成该视图"}
            title={item ? (generatedOnce ? "重试生成该视图" : "重新生成该视图") : "生成该视图"}
          >
            <span className={`material-icons-round text-xs ${isGeneratingSlot ? "animate-spin" : ""}`}>autorenew</span>
          </button>
        ) : null}
      </div>
    );
  };

  if (collapseWhenEmpty && items.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-xs font-bold text-gray-700">{title}</div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>
      {hideMissingSlots && items.length > 0 ? (
        <div className="grid grid-cols-3 gap-1.5 md:gap-2">
          {filledSlotsInOrder.map((slot) =>
            renderTile(slot, "aspect-square", VIEW_LABEL_BY_KEY[slot]),
          )}
        </div>
      ) : items.length === 0 ? (
        <div className="space-y-2">
          <div className="grid grid-cols-3 grid-rows-2 gap-1.5 md:gap-2">
            {renderTile("closeup", "col-span-2 row-start-1 aspect-[4/3]", "特写")}
            {renderTile("front", "col-start-3 row-start-1 aspect-square", "正面")}
            {renderTile("left", "col-start-3 row-start-2 aspect-square", "左侧")}
            {renderTile("right", "col-start-1 row-start-2 aspect-square", "右侧")}
            {renderTile("back", "col-start-2 row-start-2 aspect-square", "背面")}
          </div>
          {showEmptyHint && emptyText.trim().length > 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2.5 text-xs text-gray-400">
              {emptyText}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-3 grid-rows-2 gap-1.5 md:gap-2">
          {renderTile("closeup", "col-span-2 row-start-1 aspect-[4/3]", "特写")}
          {renderTile("front", "col-start-3 row-start-1 aspect-square", "正面")}
          {renderTile("left", "col-start-3 row-start-2 aspect-square", "左侧")}
          {renderTile("right", "col-start-1 row-start-2 aspect-square", "右侧")}
          {renderTile("back", "col-start-2 row-start-2 aspect-square", "背面")}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MobileConfigDrawer 移动端配置抽屉
// ============================================================================

export const MobileConfigDrawer: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[80vh] overflow-y-auto animate-slide-up shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 p-4 flex justify-between items-center z-10">
          <h3 className="font-bold text-gray-900 font-display">角色筛选</h3>
          <button onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors">
            <span className="material-icons-round text-sm">close</span>
          </button>
        </div>
        <div className="p-6 pb-24">{children}</div>
      </div>
    </div>
  );
};

// ============================================================================
// CharacterLibrarySelectorModal 角色库选择器模态框
// ============================================================================

export interface CharacterLibrarySelectorItem {
  id: string;
  name: string;
  tags: string[];
  thumbnailUrl: string;
  kind: "basic" | "image" | "video";
  status: "processing" | "ready";
  viewSession?: unknown;
  /** @deprecated 使用 fiveViewOssImageUrl 代替 */
  views?: string[];
  fiveViewOssImageUrl?: string | null;
  gender?: string | null;
  age?: string | null;
}

const SUGGESTED_TAGS = ["真实感", "3D", "二次元", "亚洲", "欧美", "男性", "女性", "儿童", "老年", "商务", "休闲", "古风"];

export const CharacterLibrarySelectorModal: React.FC<{
  isOpen: boolean;
  characters: CharacterLibrarySelectorItem[];
  onSelect: (character: CharacterLibrarySelectorItem) => void;
  onClose: () => void;
  selectedId?: string | null;
  loading?: boolean;
  // 分页相关参数
  totalCount?: number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}> = ({
  isOpen,
  characters,
  onSelect,
  onClose,
  selectedId = null,
  loading = false,
  totalCount = 0,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const filteredCharacters = useMemo(() => {
    return characters.filter((char) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!char.name.toLowerCase().includes(q) && !char.tags.some((t) => t.toLowerCase().includes(q))) {
          return false;
        }
      }
      if (selectedTags.length > 0 && !selectedTags.some((t) => char.tags.includes(t))) {
        return false;
      }
      return true;
    });
  }, [characters, searchQuery, selectedTags]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
          <div>
            <h3 className="text-lg font-bold text-gray-900 font-display">从角色库选择</h3>
            <p className="text-xs text-gray-500 mt-0.5">共 {filteredCharacters.length} 个角色</p>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <span className="material-icons-round text-xl">close</span>
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-50 shrink-0">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 material-icons-round text-lg">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索角色名称或标签..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-primary focus:bg-white transition-colors"
            />
          </div>
        </div>

        {/* Tags */}
        <div className="px-6 py-2 border-b border-gray-50 shrink-0">
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-all ${
                  selectedTags.includes(tag)
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
              >
                {tag}
              </button>
            ))}
            {selectedTags.length > 0 && (
              <button
                onClick={() => setSelectedTags([])}
                className="px-2.5 py-1 rounded text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
              >
                清除筛选
              </button>
            )}
          </div>
        </div>

        {/* Characters Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <span className="material-icons-round text-5xl mb-3 text-gray-300 animate-pulse">hourglass_top</span>
              <p className="text-sm font-medium">加载角色库...</p>
            </div>
          ) : filteredCharacters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <span className="material-icons-round text-5xl mb-3 text-gray-300">person_off</span>
              <p className="text-sm font-medium">未找到匹配的角色</p>
              <p className="text-xs mt-1">尝试调整搜索条件或筛选标签</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {filteredCharacters.map((char) => {
                const isSelected = selectedId === char.id;
                return (
                  <button
                    key={char.id}
                    type="button"
                    onClick={() => onSelect(char)}
                    className={`group relative overflow-hidden rounded-xl border bg-white transition-all duration-200 text-left ${
                      isSelected
                        ? "border-primary ring-2 ring-primary/20 shadow-lg shadow-primary/10"
                        : "border-gray-200 hover:border-primary/40 hover:shadow-md"
                    }`}
                  >
                    <div className="relative">
                      <BlurFillImage
                        src={
                          char.tags.some(t => t === "auto-generated" || t.startsWith("step2"))
                            ? (char.fiveViewOssImageUrl || char.thumbnailUrl || "")
                            : (char.thumbnailUrl || char.fiveViewOssImageUrl || "")
                        }
                        alt={char.name}
                        aspectClass="aspect-[4/3]"
                        hoverClass="group-hover:scale-105"
                      />
                      {char.tags.some(t => t === "auto-generated" || t.startsWith("step2")) && (
                        <span className="absolute top-2.5 left-2.5 z-10 bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-[10px] font-bold px-2 py-1 rounded-md">AI</span>
                      )}
                      {!char.tags.some(t => t === "auto-generated" || t.startsWith("step2")) && (
                        <span className="absolute top-2.5 left-2.5 z-10 bg-black/50 text-white text-[10px] font-medium px-1.5 py-1 rounded-md flex items-center gap-1">
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                          五视图
                        </span>
                      )}
                      {isSelected && (
                        <div className="absolute inset-0 bg-primary/10 z-20" />
                      )}
                      {char.status === "processing" && (
                        <div className="absolute bottom-2 right-2 z-20 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white">
                          <span className="w-2.5 h-2.5 rounded-full border border-white border-t-transparent animate-spin" />
                          生成中
                        </div>
                      )}
                      {isSelected && (
                        <div className="absolute bottom-2 left-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white shadow-lg">
                          <span className="material-icons-round text-sm">check</span>
                        </div>
                      )}
                    </div>
                    <div className="p-2.5">
                      <div className="text-sm font-semibold text-gray-800 truncate">{char.name}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {char.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="text-[10px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {/* 加载更多按钮 */}
          {!loading && characters.length > 0 && (
            <LoadMoreButton
              isLoading={isLoadingMore}
              hasMore={hasMore}
              currentCount={characters.length}
              totalCount={totalCount}
              onClick={onLoadMore}
              loadText="加载更多角色"
              noMoreText="已加载全部角色"
            />
          )}
        </div>
      </div>
    </div>
  );
};