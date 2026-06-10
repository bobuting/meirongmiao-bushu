/**
 * 主题色选择器组件
 * 提供颜色选择和自定义主题颜色的功能
 *
 * @module apps/web/components/theme/ColorPicker
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeConfig } from '../../types';

/* ===================== 类型定义 ===================== */

/**
 * 颜色类型
 */
type ColorType = 'primary' | 'accent';

/**
 * 颜色选择器属性接口
 */
interface ColorPickerProps {
  /** 颜色类型（主色或强调色） */
  colorType: ColorType;
  /** 自定义类名 */
  className?: string;
  /** 颜色变更回调 */
  onChange?: (color: string) => void;
  /** 是否显示标签 */
  showLabel?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * 预设颜色接口
 */
interface PresetColor {
  /** 颜色值 */
  value: string;
  /** 颜色名称 */
  name: string;
}

/* ===================== 常量定义 ===================== */

/**
 * 预设颜色列表
 */
const PRESET_COLORS: PresetColor[] = [
  { value: '#003366', name: '深蓝' },
  { value: '#3B82F6', name: '科技蓝' },
  { value: '#2563EB', name: '纯净蓝' },
  { value: '#EC4899', name: '品红' },
  { value: '#6366F1', name: '靛蓝' },
  { value: '#10B981', name: '翠绿' },
  { value: '#FF2E4D', name: '红色' },
  { value: '#FF0099', name: '玫红' },
  { value: '#D4AF37', name: '金色' },
  { value: '#FF7F50', name: '珊瑚橙' },
  { value: '#F06292', name: '粉色' },
  { value: '#2C3E50', name: '深灰蓝' },
];

/**
 * 颜色类型标签映射
 */
const COLOR_TYPE_LABELS: Record<ColorType, string> = {
  primary: '主色调',
  accent: '强调色',
};

/* ==================== 主组件 ==================== */

/**
 * 颜色选择器组件
 * 支持预设颜色选择和自定义颜色输入
 *
 * @param props - 组件属性
 * @example
 * ```tsx
 * <ColorPicker
 *   colorType="primary"
 *   onChange={(color) => console.log('Selected:', color)}
 * />
 * ```
 */
export const ColorPicker: React.FC<ColorPickerProps> = ({
  colorType,
  className = '',
  onChange,
  showLabel = true,
  disabled = false,
}) => {
  /* ===================== Hooks ===================== */

  // 获取主题状态和操作方法
  const { currentTheme, updateCustomConfig } = useTheme();

  /* ===================== 状态 ===================== */

  // 是否展开预设颜色面板
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  // 自定义颜色输入值
  const [customColor, setCustomColor] = useState<string>('');
  // 面板引用（用于点击外部关闭）
  const panelRef = useRef<HTMLDivElement>(null);
  // 触发按钮引用
  const triggerRef = useRef<HTMLButtonElement>(null);

  /* ===================== 派生数据 ===================== */

  // 当前颜色值
  const currentColor = colorType === 'primary'
    ? currentTheme?.effectiveConfig?.colors?.primary || '#003366'
    : currentTheme?.effectiveConfig?.colors?.accent || '#00a8ff';

  // 颜色类型标签
  const colorLabel = COLOR_TYPE_LABELS[colorType];

  /* ===================== 副作用 ===================== */

  /**
   * 同步自定义颜色输入值
   */
  useEffect(() => {
    setCustomColor(currentColor);
  }, [currentColor]);

  /**
   * 点击外部关闭面板
   */
  useEffect(() => {
    // 点击外部处理函数
    const handleClickOutside = (event: MouseEvent) => {
      // 如果点击的不是面板内部和触发按钮，则关闭面板
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsExpanded(false);
      }
    };

    // 如果面板展开，添加点击事件监听
    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    // 清理函数
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExpanded]);

  /* ===================== 辅助函数 ===================== */

  /**
   * 验证颜色格式
   * 支持 HEX 和 RGB/RGBA 格式
   * @param color - 颜色值
   * @returns 是否有效
   */
  const isValidColor = useCallback((color: string): boolean => {
    // 检查 HEX 格式
    const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    // 检查 RGB/RGBA 格式
    const rgbPattern = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/;

    return hexPattern.test(color) || rgbPattern.test(color);
  }, []);

  /**
   * 更新颜色配置
   * @param color - 新颜色值
   */
  const updateColor = useCallback(async (color: string) => {
    // 验证颜色格式
    if (!isValidColor(color)) {
      console.warn('[ColorPicker] 无效的颜色格式:', color);
      return;
    }

    try {
      // 构建颜色配置更新
      const colorUpdate = (colorType === 'primary'
        ? { colors: { primary: color, primaryHover: color, primaryActive: color } as ThemeConfig['colors'] }
        : { colors: { accent: color, accentHover: color, accentActive: color } as ThemeConfig['colors'] }) as Partial<ThemeConfig>;

      // 调用更新方法
      await updateCustomConfig(colorUpdate);

      // 调用回调
      onChange?.(color);
    } catch (error) {
      console.error('[ColorPicker] 更新颜色失败:', error);
    }
  }, [colorType, updateCustomConfig, onChange, isValidColor]);

  /* ===================== 事件处理 ===================== */

  /**
   * 触发按钮点击处理
   */
  const handleTriggerClick = useCallback(() => {
    if (!disabled) {
      setIsExpanded(prev => !prev);
    }
  }, [disabled]);

  /**
   * 预设颜色点击处理
   */
  const handlePresetClick = useCallback((color: string) => {
    setCustomColor(color);
    updateColor(color);
    setIsExpanded(false);
  }, [updateColor]);

  /**
   * 自定义颜色输入变更处理
   */
  const handleCustomColorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomColor(e.target.value);
  }, []);

  /**
   * 自定义颜色输入确认处理
   */
  const handleCustomColorConfirm = useCallback(() => {
    if (isValidColor(customColor)) {
      updateColor(customColor);
    }
  }, [customColor, isValidColor, updateColor]);

  /**
   * 颜色选择器变更处理（原生 input type="color"）
   */
  const handleColorInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    setCustomColor(color);
    updateColor(color);
  }, [updateColor]);

  /* ===================== 渲染 ===================== */

  return (
    <div className={`color-picker relative ${className}`}>
      {/* 触发按钮 */}
      <button
        ref={triggerRef}
        onClick={handleTriggerClick}
        disabled={disabled}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200
          ${disabled
            ? 'opacity-50 cursor-not-allowed border-gray-200'
            : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
          }
        `}
      >
        {/* 颜色预览块 */}
        <div
          className="w-6 h-6 rounded border border-gray-300"
          style={{ backgroundColor: currentColor }}
        />
        {/* 标签 */}
        {showLabel && (
          <span className="text-sm text-gray-700">{colorLabel}</span>
        )}
        {/* 下拉箭头 */}
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 颜色选择面板 */}
      {isExpanded && (
        <div
          ref={panelRef}
          className="absolute top-full left-0 mt-2 p-4 bg-white rounded-xl shadow-lg border border-gray-100 z-50 min-w-[280px]"
        >
          {/* 当前颜色显示 */}
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100">
            <div
              className="w-10 h-10 rounded-lg border border-gray-200"
              style={{ backgroundColor: currentColor }}
            />
            <div>
              <div className="text-sm font-medium text-gray-900">{colorLabel}</div>
              <div className="text-xs text-gray-500">{currentColor}</div>
            </div>
          </div>

          {/* 预设颜色网格 */}
          <div className="mb-4">
            <div className="text-xs font-medium text-gray-700 mb-2">预设颜色</div>
            <div className="grid grid-cols-6 gap-2">
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => handlePresetClick(preset.value)}
                  className={`
                    w-8 h-8 rounded-lg border-2 transition-all duration-150 hover:scale-110
                    ${currentColor === preset.value
                      ? 'border-gray-800 shadow-md'
                      : 'border-transparent hover:border-gray-300'
                    }
                  `}
                  style={{ backgroundColor: preset.value }}
                  title={preset.name}
                />
              ))}
            </div>
          </div>

          {/* 自定义颜色输入 */}
          <div>
            <div className="text-xs font-medium text-gray-700 mb-2">自定义颜色</div>
            <div className="flex items-center gap-2">
              {/* 原生颜色选择器 */}
              <input
                type="color"
                value={currentColor}
                onChange={handleColorInputChange}
                className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
              />
              {/* HEX 输入框 */}
              <input
                type="text"
                value={customColor}
                onChange={handleCustomColorChange}
                onBlur={handleCustomColorConfirm}
                onKeyDown={(e) => e.key === 'Enter' && handleCustomColorConfirm()}
                placeholder="#000000"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
            </div>
            {/* 颜色格式提示 */}
            <p className="mt-2 text-xs text-gray-400">
              支持 HEX 格式（如 #003366）
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

/* ===================== 导出 ===================== */

export default ColorPicker;