// apps/web/hooks/usePagedList.ts
/**
 * 通用分页加载 Hook
 * 支持"加载更多"模式的分页数据加载
 */

import { useState, useCallback, useMemo } from "react";
import { useToast } from "../components/ui/Toast";

export interface PagedListState<T> {
  items: T[];
  total: number;
  currentPage: number;
  pageSize: number;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
}

export interface UsePagedListOptions<T, P extends Record<string, unknown>> {
  /** 初始页码（默认 1） */
  initialPage?: number;
  /** 每页条数（默认 20） */
  pageSize?: number;
  /** 数据加载函数，返回分页数据 */
  fetcher: (params: { page: number; pageSize: number } & P) => Promise<{
    items: T[];
    total: number;
    hasMore?: boolean;
  }>;
  /** 加载函数的额外参数 */
  fetcherParams?: P;
  /** 是否自动加载第一页（默认 true） */
  autoLoad?: boolean;
}

export interface UsePagedListResult<T> extends PagedListState<T> {
  /** 加载第一页（重置数据） */
  loadFirstPage: () => Promise<void>;
  /** 加载下一页（追加数据） */
  loadNextPage: () => Promise<void>;
  /** 重置到初始状态 */
  reset: () => void;
}

/**
 * 通用分页加载 Hook
 *
 * @example
 * const { items, total, hasMore, loadNextPage, isLoadingMore } = usePagedList({
 *   fetcher: async ({ page, pageSize }) => {
 *     const data = await realGarmentAssetsApi.listGarmentAssets(token, { page, pageSize });
 *     return { items: data.items, total: data.total, hasMore: data.hasMore };
 *   },
 *   pageSize: 20,
 * });
 */
export function usePagedList<T, P extends Record<string, unknown> = Record<string, unknown>>(
  options: UsePagedListOptions<T, P>
): UsePagedListResult<T> {
  const {
    initialPage = 1,
    pageSize = 20,
    fetcher,
    fetcherParams = {} as P,
    autoLoad = true,
  } = options;
  
  const toast = useToast();

  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasLoadedFirstPage, setHasLoadedFirstPage] = useState(false);

  // 加载第一页（重置数据）
  const loadFirstPage = useCallback(async () => {
    setIsLoading(true);
    setIsLoadingMore(false);
    try {
      const result = await fetcher({ page: initialPage, pageSize, ...fetcherParams });
      setItems(result.items);
      setTotal(result.total);
      setCurrentPage(initialPage);
      setHasMore(result.hasMore ?? result.items.length < result.total);
      setHasLoadedFirstPage(true);
    } catch (error) {
      console.error("[usePagedList] Failed to load first page:", error);
      toast.error("加载失败，请重试");
      // 加载失败时重置状态
      setItems([]);
      setTotal(0);
      setCurrentPage(initialPage);
      setHasMore(false);
      setHasLoadedFirstPage(false);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [fetcher, initialPage, pageSize, fetcherParams, toast]);

  // 加载下一页（追加数据）
  const loadNextPage = useCallback(async () => {
    if (isLoadingMore || isLoading || !hasMore) {
      return;
    }

    setIsLoadingMore(true);
    const nextPage = currentPage + 1;

    try {
      const result = await fetcher({ page: nextPage, pageSize, ...fetcherParams });
      setItems((prev) => [...prev, ...result.items]);
      setCurrentPage(nextPage);
      setHasMore(result.hasMore ?? items.length + result.items.length < result.total);
    } catch (error) {
      console.error("[usePagedList] Failed to load next page:", error);
      toast.error("加载更多失败，请重试");
      throw error;
    } finally {
      setIsLoadingMore(false);
    }
  }, [fetcher, currentPage, pageSize, fetcherParams, isLoadingMore, isLoading, hasMore, items.length, total, toast]);

  // 重置到初始状态
  const reset = useCallback(() => {
    setItems([]);
    setTotal(0);
    setCurrentPage(initialPage);
    setHasMore(false);
    setHasLoadedFirstPage(false);
  }, [initialPage]);

  // 自动加载第一页
  useMemo(() => {
    if (autoLoad && !hasLoadedFirstPage && !isLoading) {
      void loadFirstPage();
    }
  }, [autoLoad, hasLoadedFirstPage, isLoading, loadFirstPage]);

  return {
    items,
    total,
    currentPage,
    pageSize,
    hasMore,
    isLoading,
    isLoadingMore,
    loadFirstPage,
    loadNextPage,
    reset,
  };
}
