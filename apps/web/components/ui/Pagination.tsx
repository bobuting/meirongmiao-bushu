import React from 'react';

/**
 * 精致分页控件
 * - 胶囊式紧凑设计
 * - 微妙悬浮渐变动效
 * - 当前页高光脉冲
 * - 页码智能省略
 */
interface PaginationProps {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    onPageChange: (page: number) => void;
    pageSize?: number;
}

export const Pagination: React.FC<PaginationProps> = ({
    currentPage,
    totalPages,
    totalItems,
    onPageChange,
}) => {
    if (totalPages <= 1) return null;

    // 计算显示的页码范围（智能省略）
    const getPageNumbers = (): (number | 'ellipsis')[] => {
        const pages: (number | 'ellipsis')[] = [];

        if (totalPages <= 7) {
            // 7页以内全部显示
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            // 超过7页，智能省略
            pages.push(1);

            if (currentPage <= 4) {
                // 靠近开头
                for (let i = 2; i <= 5; i++) pages.push(i);
                pages.push('ellipsis');
                pages.push(totalPages);
            } else if (currentPage >= totalPages - 3) {
                // 靠近结尾
                pages.push('ellipsis');
                for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
            } else {
                // 中间位置
                pages.push('ellipsis');
                for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
                pages.push('ellipsis');
                pages.push(totalPages);
            }
        }

        return pages;
    };

    const pageNumbers = getPageNumbers();

    return (
        <div className="flex flex-col items-center gap-3 mt-8 pb-6">
            {/* 主分页控件 */}
            <div className="inline-flex items-center gap-1 p-1 bg-gray-50/80 backdrop-blur-sm rounded-full border border-gray-100 shadow-sm">
                {/* 上一页按钮 */}
                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="group flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="上一页"
                >
                    <svg
                        className="w-4 h-4 transition-transform duration-300 group-hover:-translate-x-0.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    <span className="hidden sm:inline text-gray-600 group-hover:text-gray-900">上一页</span>
                </button>

                {/* 分隔线 */}
                <div className="w-px h-5 bg-gray-200" />

                {/* 页码 */}
                <div className="flex items-center gap-0.5">
                    {pageNumbers.map((page, index) => {
                        if (page === 'ellipsis') {
                            return (
                                <span
                                    key={`ellipsis-${index}`}
                                    className="w-8 h-8 flex items-center justify-center text-gray-400 text-xs"
                                >
                                    •••
                                </span>
                            );
                        }

                        const isActive = currentPage === page;

                        return (
                            <button
                                key={page}
                                onClick={() => onPageChange(page)}
                                className={`relative w-8 h-8 rounded-full text-sm font-medium transition-all duration-300 ${
                                    isActive
                                        ? 'bg-primary text-white shadow-md shadow-primary/25 scale-110'
                                        : 'text-gray-600 hover:text-gray-900 hover:bg-white hover:shadow-sm'
                                }`}
                                aria-label={`第 ${page} 页`}
                                aria-current={isActive ? 'page' : undefined}
                            >
                                {/* 当前页脉冲光环 */}
                                {isActive && (
                                    <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping" />
                                )}
                                <span className="relative z-10 tabular-nums">{page}</span>
                            </button>
                        );
                    })}
                </div>

                {/* 分隔线 */}
                <div className="w-px h-5 bg-gray-200" />

                {/* 下一页按钮 */}
                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="group flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="下一页"
                >
                    <span className="hidden sm:inline text-gray-600 group-hover:text-gray-900">下一页</span>
                    <svg
                        className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>

            {/* 统计信息 */}
            <div className="flex items-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                    第 <strong className="font-semibold text-gray-600 tabular-nums">{currentPage}</strong> / <strong className="font-semibold text-gray-600 tabular-nums">{totalPages}</strong> 页
                </span>
                <span className="w-px h-3 bg-gray-200" />
                <span>
                    共 <strong className="font-semibold text-gray-600 tabular-nums">{totalItems.toLocaleString()}</strong> 项
                </span>
            </div>
        </div>
    );
};
