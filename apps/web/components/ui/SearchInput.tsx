import React, { useRef, useEffect } from 'react';

/**
 * 精致搜索输入框
 * - 发光边框悬浮效果
 * - 搜索图标旋转动画
 * - 清空按钮淡入动画
 * - 支持键盘快捷键（ESC 清空）
 */
interface SearchInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
    className?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
    value,
    onChange,
    placeholder = '搜索...',
    autoFocus = false,
    className = '',
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    // 自动聚焦
    useEffect(() => {
        if (autoFocus && inputRef.current) {
            inputRef.current.focus();
        }
    }, [autoFocus]);

    // 键盘快捷键
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            onChange('');
            inputRef.current?.blur();
        }
    };

    const handleClear = () => {
        onChange('');
        inputRef.current?.focus();
    };

    return (
        <div className={`relative group ${className}`}>
            {/* 背景光晕效果 */}
            <div
                className={`
                    absolute -inset-0.5 rounded-xl opacity-0 transition-opacity duration-300
                    ${value ? 'opacity-100' : 'group-focus-within:opacity-100'}
                `}
                style={{
                    background: value
                        ? 'linear-gradient(135deg, rgba(230, 140, 25, 0.15), rgba(230, 140, 25, 0.05))'
                        : 'linear-gradient(135deg, rgba(230, 140, 25, 0.1), rgba(230, 140, 25, 0.02))',
                }}
            />

            {/* 输入框容器 */}
            <div className="relative flex items-center bg-white rounded-xl border border-gray-200 shadow-sm transition-all duration-300 group-focus-within:border-primary/30 group-focus-within:shadow-md group-focus-within:shadow-primary/5">
                {/* 搜索图标 */}
                <div className="pl-3.5 flex items-center justify-center">
                    <svg
                        className={`
                            w-4.5 h-4.5 transition-all duration-300
                            ${value ? 'text-primary rotate-[-10deg] scale-110' : 'text-gray-400 group-focus-within:text-gray-500'}
                        `}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                    >
                        <circle cx="11" cy="11" r="8" />
                        <path strokeLinecap="round" d="m21 21-4.35-4.35" />
                    </svg>
                </div>

                {/* 输入框 */}
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className="flex-1 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 bg-transparent outline-none"
                    aria-label="搜索"
                />

                {/* 清空按钮 */}
                <button
                    onClick={handleClear}
                    className={`
                        pr-3 flex items-center justify-center transition-all duration-200
                        ${value ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'}
                    `}
                    aria-label="清空搜索"
                >
                    <div className="w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors group/close">
                        <svg
                            className="w-3 h-3 text-gray-500 group-hover/close:text-gray-700 transition-colors"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </div>
                </button>
            </div>

            {/* 快捷键提示（无内容时显示） */}
            {!value && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded transition-opacity duration-200 group-focus-within:opacity-0">
                        ESC
                    </kbd>
                </div>
            )}
        </div>
    );
};
