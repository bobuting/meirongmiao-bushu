/**
 * 主题选择器弹出组件
 * 提供主题选择、系统名称设置、Logo上传等功能
 *
 * @module apps/web/components/theme/ThemeSelector
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { useAppStore } from '../../store/useAppStore';
import type { Theme } from '../../types';

/* ===================== 类型定义 ===================== */

/**
 * 主题选择器属性接口
 */
interface ThemeSelectorProps {
  /** 是否显示选择器 */
  isOpen: boolean;
  /** 关闭选择器的回调函数 */
  onClose: () => void;
  /** 自定义类名 */
  className?: string;
}

/**
 * 主题分类标签接口
 */
interface CategoryTab {
  /** 分类标识 */
  key: string;
  /** 分类显示名称 */
  label: string;
  /** 分类过滤器（带当前用户ID参数） */
  filter: (theme: Theme, currentUserId?: string) => boolean;
}

/* ===================== 常量定义 ===================== */

/**
 * 主题分类标签配置
 * 注意：过滤逻辑会在组件中使用 currentUserId 进行进一步过滤
 */
const CATEGORY_TABS: CategoryTab[] = [
  {
    key: 'all',
    label: '全部',
    filter: () => true, // 显示所有主题（后续会过滤掉他人的自定义主题）
  },
];

/**
 * 默认系统名称
 * 当使用系统主题时，系统名称统一使用此默认值
 */
const DEFAULT_SYSTEM_NAME = '内容喵';

/* ==================== 子组件 ==================== */

/**
 * 主题预览卡片组件
 * @param theme - 主题数据
 * @param isSelected - 是否选中
 * @param onClick - 点击回调
 */
const ThemeCard: React.FC<{
  theme: Theme;
  isSelected: boolean;
  onClick: () => void;
}> = ({ theme, isSelected, onClick }) => {
  // 获取主题的主色调
  const primaryColor = theme.config.colors.primary;
  // 获取主题的强调色
  const accentColor = theme.config.colors.accent;

  return (
    <button
      onClick={onClick}
      className={`
        relative w-full p-4 rounded-xl border-2 transition-all duration-200 text-left
        ${isSelected
          ? 'border-accent shadow-lg scale-[1.02]'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
        }
      `}
      style={{
        // 如果选中，使用强调色作为边框
        borderColor: isSelected ? accentColor : undefined,
      }}
    >
      {/* 主题颜色预览条 */}
      <div className="flex gap-1 mb-3 h-8 rounded-lg overflow-hidden">
        {/* 主色调预览 */}
        <div
          className="flex-1"
          style={{ backgroundColor: primaryColor }}
          title={`主色: ${primaryColor}`}
        />
        {/* 强调色预览 */}
        <div
          className="flex-1"
          style={{ backgroundColor: accentColor }}
          title={`强调色: ${accentColor}`}
        />
        {/* 渐变预览 */}
        <div
          className="flex-1"
          style={{ background: theme.config.gradients.primary }}
          title="渐变"
        />
      </div>

      {/* 主题名称 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-gray-900 text-sm">
            {theme.displayName}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {CATEGORY_TABS.find(t => t.key === theme.category)?.label || theme.category}
          </p>
        </div>

        {/* 选中指示器 */}
        {isSelected && (
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center"
            style={{ backgroundColor: accentColor }}
          >
            <svg
              className="w-3 h-3 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        )}
      </div>

      {/* 系统预置标识 */}
      {theme.isSystem && (
        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] rounded">
          系统预置
        </div>
      )}
    </button>
  );
};

/* ==================== 主组件 ==================== */

/**
 * 主题选择器弹出组件
 * 提供主题选择、系统名称设置等功能
 *
 * @param props - 组件属性
 * @example
 * ```tsx
 * <ThemeSelector
 *   isOpen={showSelector}
 *   onClose={() => setShowSelector(false)}
 * />
 * ```
 */
export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  isOpen,
  onClose,
  className = '',
}) => {
  /* ===================== Hooks ===================== */

  // 获取主题状态和操作方法
  const {
    currentTheme,
    availableThemes,
    isLoading,
    switchTheme,
    updateSystemName: _updateSystemName,
  } = useTheme();

  // 获取当前用户（用于过滤自定义主题）
  const currentUser = useAppStore((state) => state.currentUser);

  /* ===================== 状态 ===================== */

  // 当前选中的分类标签
  const [activeCategory, setActiveCategory] = useState<string>('all');
  // 系统名称输入值
  const [_systemNameInput, setSystemNameInput] = useState<string>('');
  // 是否正在切换主题
  const [isSwitching, setIsSwitching] = useState<boolean>(false);
  // 弹窗引用（用于点击外部关闭）
  const modalRef = useRef<HTMLDivElement>(null);
  // 【新增】用户选中的主题ID（用于预览，不立即应用）
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  // 【新增】是否已应用主题（用于判断是否显示"应用主题"按钮状态）
  const [isApplied, setIsApplied] = useState<boolean>(true);

  /* ===================== 派生数据 ===================== */

  // 当前主题 ID
  const currentThemeId = currentTheme?.theme?.id;

  // 过滤主题：只显示系统主题和当前用户创建的自定义主题
  const visibleThemes = useMemo(() => {
    return availableThemes.filter((theme) => {
      // 系统主题始终可见
      if (theme.isSystem) return true;
      // 自定义主题只有创建者可见
      if (theme.category === 'custom') {
        return theme.createdBy === currentUser?.id;
      }
      // 其他分类主题可见
      return true;
    });
  }, [availableThemes, currentUser?.id]);

  // 根据分类过滤主题列表
  const filteredThemes = useMemo(() => {
    const categoryFilter = CATEGORY_TABS.find(t => t.key === activeCategory)?.filter;
    return visibleThemes.filter(
      categoryFilter ? (theme) => categoryFilter(theme, currentUser?.id) : () => true
    );
  }, [visibleThemes, activeCategory, currentUser?.id]);

  /* ===================== 副作用 ===================== */

  /**
   * 同步系统名称输入值
   */
  useEffect(() => {
    if (currentTheme?.systemName) {
      setSystemNameInput(currentTheme.systemName);
    }
  }, [currentTheme?.systemName]);

  /**
   * 【新增】同步选中的主题ID为当前主题ID
   * 当弹窗打开时，将选中主题重置为当前主题
   */
  useEffect(() => {
    if (isOpen && currentThemeId) {
      setSelectedThemeId(currentThemeId);
      setIsApplied(true);
    }
  }, [isOpen, currentThemeId]);

  /**
   * 点击外部关闭弹窗
   */
  useEffect(() => {
    // 点击外部处理函数
    const handleClickOutside = (event: MouseEvent) => {
      // 如果点击的不是弹窗内部，则关闭
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // 如果弹窗打开，添加点击事件监听
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    // 清理函数
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  /**
   * ESC 键关闭弹窗
   */
  useEffect(() => {
    // 键盘事件处理函数
    const handleKeyDown = (event: KeyboardEvent) => {
      // 如果按下 ESC 键，关闭弹窗
      if (event.key === 'Escape') {
        onClose();
      }
    };

    // 如果弹窗打开，添加键盘事件监听
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    // 清理函数
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  /* ===================== 事件处理 ===================== */

  /**
   * 【修改】主题选择处理函数
   * 点击主题卡片只更新选中状态，不立即应用主题
   * @param themeId - 目标主题 ID
   */
  const handleThemeSelect = useCallback((themeId: string) => {
    // 更新选中的主题ID
    setSelectedThemeId(themeId);
    // 标记为未应用状态
    setIsApplied(false);
  }, []);

  /**
   * 【修改】应用主题处理函数
   * 点击"应用主题"按钮后，真正切换主题
   * switchTheme 已内置处理 systemName 和 logoUrl 的更新逻辑
   */
  const handleApplyTheme = useCallback(async () => {
    // 如果没有选中的主题或正在切换，直接返回
    if (!selectedThemeId || isSwitching) return;

    // 如果选中的是当前主题，直接标记为已应用
    if (selectedThemeId === currentThemeId) {
      setIsApplied(true);
      return;
    }

    setIsSwitching(true);
    try {
      // 调用切换主题方法
      await switchTheme(selectedThemeId);

      // 更新本地输入状态（使用主题的 displayName 或默认值）
      const selectedTheme = visibleThemes.find(t => t.id === selectedThemeId);
      if (selectedTheme) {
        setSystemNameInput(selectedTheme.displayName || DEFAULT_SYSTEM_NAME);
      }

      // 标记为已应用
      setIsApplied(true);
    } catch (error) {
      console.error('[ThemeSelector] 切换主题失败:', error);
    } finally {
      setIsSwitching(false);
    }
  }, [selectedThemeId, isSwitching, currentThemeId, switchTheme, visibleThemes]);

  /**
   * 分类标签点击处理函数
   */
  const handleCategoryClick = useCallback((categoryKey: string) => {
    setActiveCategory(categoryKey);
  }, []);

  /* ===================== 渲染 ===================== */

  // 如果弹窗未打开，不渲染
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      {/* 弹窗主体 */}
      <div
        ref={modalRef}
        className={`bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col ${className}`}
      >
        {/* ========== 头部 ========== */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">主题设置</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="关闭"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

       

        {/* ========== 分类标签 ========== */}
        <div className="px-6 py-3 border-b border-gray-100">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleCategoryClick(tab.key)}
                className={`
                  px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors
                  ${activeCategory === tab.key
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }
                `}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ========== 主题列表 ========== */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* 加载状态 */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* 空状态 */}
          {!isLoading && filteredThemes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p>暂无可用主题</p>
            </div>
          )}

          {/* 主题网格 */}
          {!isLoading && filteredThemes.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {filteredThemes.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  isSelected={theme.id === selectedThemeId}
                  onClick={() => handleThemeSelect(theme.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ========== 底部 ========== */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">共 {visibleThemes.length} 套主题可用</span>
            <div className="flex items-center gap-3">
              {/* 切换中状态提示 */}
              {isSwitching && (
                <span className="flex items-center gap-1.5 text-sm text-accent">
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  切换中...
                </span>
              )}
              {/* 【新增】应用主题按钮 */}
              {!isApplied && selectedThemeId && selectedThemeId !== currentThemeId && (
                <button
                  onClick={handleApplyTheme}
                  disabled={isSwitching}
                  className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-primary to-accent rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  应用主题
                </button>
              )}
              {/* 已应用状态提示 */}
              {isApplied && selectedThemeId === currentThemeId && (
                <span className="text-sm text-green-600 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  当前主题
                </span>
              )}
              {/* 关闭按钮 */}
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ===================== 导出 ===================== */

export default ThemeSelector;