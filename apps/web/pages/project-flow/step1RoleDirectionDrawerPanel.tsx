import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  STEP1_ROLE_PRESET_PANEL_EMPTY_TEXT,
  resolveStep1RolePresetPanelMeta,
} from "../../../../src/contracts/step1-role-preset-panel-contract";
import {
  resolveStep1RolePresetPanelLayoutMeta,
} from "../../../../src/contracts/step1-role-preset-panel-layout-contract";
import {
  resolveRoleDirectionAvatarRenderModel,
} from "./step1RoleDirectionAvatarController";
import type { Step1RoleDirectionCard } from "../../../../src/contracts/step1-joint-reverse-contract";

import {
  REGION_LABEL,
} from "../../../../src/contracts/ethnicity-dictionary";

import {
  getAgeGroupByAge,
  AGE_GROUPS,
} from "../../../../src/constants/age-groups";

/** 根据具体年龄映射为年龄段（使用统一年龄段定义） */
function resolveAgeRange(age: number): string {
  const ageGroup = getAgeGroupByAge(age);
  const config = AGE_GROUPS[ageGroup];
  return `${config.range}岁（${config.label}）`;
}

/** 根据性别返回色块渐变色 Tailwind class */
function getGradientByGender(gender?: string | null): string {
  switch (gender) {
    case "female":
      return "from-pink-50 via-purple-50 to-blue-50";
    case "male":
      return "from-blue-50 via-cyan-50 to-green-50";
    default:
      return "from-gray-100 to-gray-50";
  }
}

interface Step1RoleDirectionDrawerPanelProps {
  open: boolean;
  roleDirections: Step1RoleDirectionCard[];
  selectedDirectionId: string | null;
  onSelect: (directionId: string, visibleRoleDirections?: Step1RoleDirectionCard[]) => void;
  onClose: (shouldConfirm: boolean, confirmedDirectionId?: string | null, visibleRoleDirections?: Step1RoleDirectionCard[]) => void;
}

export const Step1RoleDirectionDrawerPanel: React.FC<Step1RoleDirectionDrawerPanelProps> = ({
  open,
  roleDirections,
  selectedDirectionId,
  onSelect,
  onClose,
}) => {
  const panelMeta = resolveStep1RolePresetPanelMeta(roleDirections.length);
  const panelLayoutMeta = resolveStep1RolePresetPanelLayoutMeta();
  const [runtimeRoleDirections, setRuntimeRoleDirections] = useState(roleDirections);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // 当前可见的第一个卡片索引（用于轮播导航）
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  // 跟踪是否可以左右滚动
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [, setAppliedSuggestionCount] = useState(0);

  // 当前选中的预设详情
  const selectedDirection = useMemo(
    () => runtimeRoleDirections.find((d) => d.directionId === selectedDirectionId) ?? null,
    [runtimeRoleDirections, selectedDirectionId],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setRuntimeRoleDirections(roleDirections);
    setAppliedSuggestionCount(0);
    setCurrentCardIndex(0);
  }, [open, roleDirections]);

  // 更新滚动状态
  const updateScrollState = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const { scrollLeft, scrollWidth, clientWidth } = container;

    // 计算当前可见的第一个卡片索引
    const cardWidth = 200 + 12; // 卡片宽度 + gap
    const newIndex = Math.round(scrollLeft / cardWidth);
    setCurrentCardIndex(newIndex);

    // 滚动超过 10px 时显示左箭头
    setCanScrollLeft(scrollLeft > 10);
    // 右侧还有内容时显示右箭头
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
  }, []);

  // 监听滚动事件
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener("scroll", updateScrollState);
    // 初始化时检查一次
    updateScrollState();

    return () => container.removeEventListener("scroll", updateScrollState);
  }, [updateScrollState, runtimeRoleDirections]);

  // 窗口大小变化时重新计算
  useEffect(() => {
    window.addEventListener("resize", updateScrollState);
    return () => window.removeEventListener("resize", updateScrollState);
  }, [updateScrollState]);

  // 滚动到指定索引的卡片
  const scrollToCard = useCallback((index: number) => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const cardWidth = 200 + 12; // 卡片宽度 + gap
    const targetScrollLeft = index * cardWidth;
    container.scrollTo({ left: targetScrollLeft, behavior: "smooth" });
  }, []);

  // 点击左箭头：滚动到上一张
  const handlePrevCard = useCallback(() => {
    const newIndex = Math.max(0, currentCardIndex - 1);
    scrollToCard(newIndex);
  }, [currentCardIndex, scrollToCard]);

  // 点击右箭头：滚动到下一张
  const handleNextCard = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const _container = scrollContainerRef.current;
    const _cardWidth = 200 + 12;
    const maxIndex = Math.max(0, runtimeRoleDirections.length - 1);
    const newIndex = Math.min(maxIndex, currentCardIndex + 1);
    scrollToCard(newIndex);
  }, [currentCardIndex, scrollToCard, runtimeRoleDirections.length]);

  // 选中卡片时自动滚动到容器中间
  useEffect(() => {
    if (!selectedDirectionId || !scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const selectedCard = container.querySelector(`[data-testid="step1-role-direction-${selectedDirectionId}"]`) as HTMLElement | null;
    if (!selectedCard) return;
    const containerRect = container.getBoundingClientRect();
    const cardRect = selectedCard.getBoundingClientRect();
    const scrollLeft = container.scrollLeft + (cardRect.left - containerRect.left) - (containerRect.width / 2) + (cardRect.width / 2);
    container.scrollTo({ left: scrollLeft, behavior: "smooth" });
  }, [selectedDirectionId]);

  // 点击遮罩关闭（取消选择）
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose(false, selectedDirectionId, runtimeRoleDirections);
    }
  };

  // 点击关闭按钮（取消选择）
  const handleCloseClick = () => {
    onClose(false, selectedDirectionId, runtimeRoleDirections);
  };

  // 点击确认按钮（保持选择并进入step2）
  const handleConfirmClick = () => {
    onClose(true, selectedDirectionId, runtimeRoleDirections);
  };

  if (!open) {
    return null;
  }

  return (
    <div
      data-testid="step1-role-direction-drawer"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40"
      onClick={handleBackdropClick}
    >
      <div className="w-auto max-w-[760px] min-w-[320px] max-h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col animate-fade-in overflow-hidden">
        {/* 头部 */}
        <div className="shrink-0 flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <div className="text-xl font-bold text-gray-900">{panelMeta.title}</div>
            <div className="mt-0.5 text-xs text-gray-500">{panelMeta.hint}</div>
          </div>
          <button
            onClick={handleCloseClick}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          >
            <span className="material-icons-round text-xl">close</span>
          </button>
        </div>

        {/* 卡片区域 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {runtimeRoleDirections.length > 0 ? (
            <div className="relative">
              {/* 左箭头按钮 */}
              {canScrollLeft && (
                <button
                  type="button"
                  onClick={handlePrevCard}
                  className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center text-gray-600 hover:bg-white hover:text-primary transition-all duration-200"
                  aria-label="上一张"
                >
                  <span className="material-icons-round text-xl">chevron_left</span>
                </button>
              )}
              {/* 右箭头按钮 */}
              {canScrollRight && (
                <button
                  type="button"
                  onClick={handleNextCard}
                  className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center text-gray-600 hover:bg-white hover:text-primary transition-all duration-200"
                  aria-label="下一张"
                >
                  <span className="material-icons-round text-xl">chevron_right</span>
                </button>
              )}
              {/* 滚动容器 */}
              <div ref={scrollContainerRef} className="relative overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory py-4 px-2">
              <div className="flex gap-3" style={{ overflow: 'visible' }}>
                {runtimeRoleDirections.map((direction, index) => {
                  const selected = selectedDirectionId === direction.directionId;
                  const avatarRender = resolveRoleDirectionAvatarRenderModel(index, direction.gender, direction.portraitUrl);

                  return (
                    <div key={direction.directionId} className="flex-shrink-0 snap-start py-2 px-1.5">
                    <button
                      type="button"
                      data-testid={`step1-role-direction-${direction.directionId}`}
                      data-layout-version={panelLayoutMeta.version}
                      onClick={() => { if (selected) return; onSelect(direction.directionId, runtimeRoleDirections); }}
                      aria-pressed={selected}
                      className={`w-[200px] rounded-[18px] overflow-hidden text-left transition-all duration-300 ease-out origin-center ${
                        selected
                          ? "shadow-[0_0_0_3px_var(--color-primary),0_12px_32px_rgba(99,102,241,0.3)] -translate-y-1"
                          : "bg-white border border-black/5 shadow-sm hover:shadow-md hover:border-primary/30"
                      }`}
                    >
                    {/* 上方渐变色块区 */}
                    <div className={`relative h-40 bg-gradient-to-br ${getGradientByGender(direction.gender)} flex items-center justify-center overflow-hidden`}>
                      {/* 选中态径向渐变叠加 */}
                      {selected && (
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,var(--color-primary)_15%,transparent_70%)]" />
                      )}
                      {/* 头像 */}
                      <div className="relative w-20 h-20 rounded-full overflow-hidden border-[3px] border-white/80 shadow-lg z-10">
                        <img
                          data-testid={`step1-role-avatar-${direction.directionId}`}
                          className="w-full h-full object-cover"
                          src={avatarRender.imageUrl}
                          alt={`角色预设 ${index + 1} 头像`}
                        />
                      </div>
                      {/* 选中角标 */}
                      {selected && (
                        <div
                          data-testid={`step1-role-direction-selected-check-${direction.directionId}`}
                          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center shadow-md z-20"
                        >
                          <span className="material-icons-round text-white text-sm">check</span>
                        </div>
                      )}
                    </div>

                    {/* 下方信息区 */}
                    <div className="px-4 pt-3.5 pb-4">
                      {/* 标题 */}
                      <div className="text-[15px] font-bold text-gray-900 truncate">
                        {Array.isArray(direction.styleWords) && direction.styleWords.length > 0
                          ? direction.styleWords.slice(0, 2).join(" / ")
                          : `预设 ${index + 1}`}
                      </div>
                      {/* Pill 标签行 — 固定一行高度，溢出隐藏 */}
                      <div className="flex flex-wrap gap-1 mt-2 h-[23px] overflow-hidden">
                        {(direction.gender || direction.age != null) && (
                          <span className={`text-[11px] leading-[18px] px-2 py-0.5 rounded-full ${selected ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-600"}`}>
                            {[
                              direction.gender === "male" ? "男" : direction.gender === "female" ? "女" : null,
                              direction.age != null ? resolveAgeRange(direction.age) : null,
                            ].filter(Boolean).join(" · ")}
                          </span>
                        )}
                        {direction.ethnicityOrRegion && (
                          <span className={`text-[11px] leading-[18px] px-2 py-0.5 rounded-full ${selected ? "bg-primary/10 text-primary" : "bg-gray-50 text-gray-400"}`}>
                            {REGION_LABEL[direction.ethnicityOrRegion] ?? direction.ethnicityOrRegion}
                          </span>
                        )}
                        {/* 显示所有风格词 */}
                        {Array.isArray(direction.styleWords) && direction.styleWords.map((word, wi) => (
                          <span key={wi} className={`text-[11px] leading-[18px] px-2 py-0.5 rounded-full ${selected ? "bg-primary/10 text-primary" : "bg-gray-50 text-gray-400"}`}>
                            {word}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                  </div>
                );
              })}
            </div>
            </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-400">
              {STEP1_ROLE_PRESET_PANEL_EMPTY_TEXT}
            </div>
          )}

          {/* 无障碍选中播报 */}
          {selectedDirection && (
            <div className="sr-only" aria-live="polite">
              已选择角色预设：{Array.isArray(selectedDirection.styleWords) && selectedDirection.styleWords.length > 0
                ? selectedDirection.styleWords.slice(0, 2).join(" / ")
                : `预设 ${runtimeRoleDirections.findIndex(d => d.directionId === selectedDirection.directionId) + 1}`}
            </div>
          )}
        </div>

        {/* 底部操作区 */}
        <div className="shrink-0 border-t border-gray-100 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {/* 确认按钮 */}
          <button
            onClick={handleConfirmClick}
            disabled={!selectedDirectionId}
            className={`w-full py-3 rounded-xl font-medium text-white transition ${
              selectedDirectionId
                ? "bg-gradient-to-r from-primary to-purple-500 hover:opacity-90 shadow-lg shadow-primary/30"
                : "bg-gray-300 cursor-not-allowed"
            }`}
          >
            {selectedDirectionId ? "确认选择" : "请先选择一个角色预设"}
          </button>
        </div>
      </div>
    </div>
  );
};
