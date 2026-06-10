/**
 * 主题切换 Hook
 * 封装主题切换逻辑，提供便捷的主题操作方法
 *
 * @module apps/web/hooks/useTheme
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { backendApi } from '../services/backendApi';
import {
  applyTheme,
  resetTheme,
  mergeThemeConfig,
} from '../utils/themeUtils';
import type { ThemeConfig, RuntimeThemeState } from '../types';

/* ===================== 常量定义 ===================== */

/** 主题缓存键 - localStorage 键名 */
const THEME_CACHE_KEY = 'neirongmiao_theme_cache';

/** 缓存过期时间：24小时 */
const THEME_CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** 默认系统名称 */
const DEFAULT_SYSTEM_NAME = '内容喵';

/** 默认 Logo URL */
const DEFAULT_LOGO_URL = '/logo.png';

/* ===================== 全局初始化锁 ===================== */

/** 全局初始化锁，防止并发初始化 */
let themeInitializingLock = false;

/** 全局初始化完成标记 */
let themeInitializedFlag = false;

/* ===================== 类型定义 ===================== */

/**
 * 主题切换选项接口
 */
interface SwitchThemeOptions {
  /** 是否保存到服务器（默认 true，有 token 时） */
  saveToServer?: boolean;
  /** 是否保存到本地缓存（默认 true） */
  saveToLocal?: boolean;
}

/**
 * 主题缓存数据接口
 */
interface ThemeCacheData {
  /** 主题 ID */
  themeId: string;
  /** 系统名称 */
  systemName: string;
  /** 自定义 Logo URL */
  customLogoUrl?: string;
  /** 自义配置 */
  customConfig?: Partial<ThemeConfig>;
  /** 缓存时间戳 */
  timestamp: number;
}

/* ===================== 辅助函数 ===================== */

/**
 * 从 localStorage 读取主题缓存
 * @returns 主题缓存数据或 null
 */
function loadThemeCache(): ThemeCacheData | null {
  try {
    // 从 localStorage 获取缓存数据
    const raw = localStorage.getItem(THEME_CACHE_KEY);
    // 如果没有数据，返回 null
    if (!raw) return null;
    // 解析 JSON 数据
    const parsed = JSON.parse(raw) as ThemeCacheData;

    // 检查缓存过期（24小时）
    const now = Date.now();
    if (parsed.timestamp && (now - parsed.timestamp) > THEME_CACHE_EXPIRY_MS) {
      localStorage.removeItem(THEME_CACHE_KEY);
      return null;
    }

    return parsed;
  } catch (error) {
    // 解析失败，清除缓存并返回 null
    console.warn('[useTheme] 读取主题缓存失败:', error);
    localStorage.removeItem(THEME_CACHE_KEY);
    return null;
  }
}

/**
 * 保存主题缓存到 localStorage
 * @param data - 主题缓存数据
 */
function saveThemeCache(data: ThemeCacheData): void {
  try {
    // 序列化并保存到 localStorage
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(data));
  } catch (error) {
    // 保存失败，输出警告
    console.warn('[useTheme] 保存主题缓存失败:', error);
  }
}

/**
 * 清除主题缓存
 */
function clearThemeCache(): void {
  localStorage.removeItem(THEME_CACHE_KEY);
}

/* ==================== 主 Hook ==================== */

/**
 * 主题切换 Hook
 * 提供主题状态和操作方法
 *
 * @returns 主题状态和操作方法
 * @example
 * ```tsx
 * function ThemeSwitcher() {
 *   const {
 *     currentTheme,
 *     availableThemes,
 *     isLoading,
 *     switchTheme,
 *     updateSystemName,
 *     updateCustomConfig
 *   } = useTheme();
 *
 *   return (
 *     <select onChange={(e) => switchTheme(e.target.value)}>
 *       {availableThemes.map(t => (
 *         <option key={t.id} value={t.id}>{t.displayName}</option>
 *       ))}
 *     </select>
 *   );
 * }
 * ```
 */
export function useTheme() {
  /* ===================== 从 Store 获取状态和方法 ===================== */

  // 获取主题状态
  const theme = useAppStore((state) => state.theme);
  // 获取 token（用于判断是否需要保存到服务器）
  const token = useAppStore((state) => state.token);

  // 获取主题操作方法
  const setCurrentTheme = useAppStore((state) => state.setCurrentTheme);
  const setAvailableThemes = useAppStore((state) => state.setAvailableThemes);
  const setThemeLoading = useAppStore((state) => state.setThemeLoading);
  const setThemeError = useAppStore((state) => state.setThemeError);
  const setThemeInitialized = useAppStore((state) => state.setThemeInitialized);
  const updateThemeSystemName = useAppStore((state) => state.updateThemeSystemName);
  const updateThemeLogo = useAppStore((state) => state.updateThemeLogo);
  const resetThemeState = useAppStore((state) => state.resetThemeState);

  /* ===================== 本地状态 ===================== */

  // 是否正在初始化（仅用于 UI 显示）
  const [isInitializing, setIsInitializing] = useState(false);

  // token ref 用于竞态防范
  const tokenRef = useRef(token);
  tokenRef.current = token;

  /* ===================== 初始化主题 ===================== */

  /**
   * 初始化主题数据
   * 从服务器或本地缓存加载主题配置
   */
  const initializeTheme = useCallback(async () => {
    // 使用全局锁 + Zustand状态双重检查，防止重复初始化
    if (themeInitializingLock || themeInitializedFlag || theme.themeInitialized) {
      return;
    }

    // 加锁
    themeInitializingLock = true;
    setIsInitializing(true);
    setThemeLoading(true);
    setThemeError(null);

    try {
      // 并行加载可用主题列表和用户主题
      const [themesResponse, userThemeResponse] = await Promise.all([
        // 获取所有启用的主题列表
        backendApi.listEnabledThemes(),
        // 获取用户当前主题（如果有 token）
        tokenRef.current ? backendApi.getCurrentUserTheme(tokenRef.current) : Promise.resolve(null),
      ]);

      // 竞态检查：确保请求完成时 token 未变化
      if (tokenRef.current !== token) {
        // 释放锁和重置状态，避免阻塞后续初始化
        themeInitializingLock = false;
        setIsInitializing(false);
        setThemeLoading(false);
        return;
      }

      // 设置可用主题列表
      setAvailableThemes(themesResponse);

      // 处理用户主题
      if (userThemeResponse) {
        // 用户有主题偏好，构建运行时状态
        const effectiveConfig = mergeThemeConfig(
          userThemeResponse.theme.config,
          userThemeResponse.customConfig
        );

        // 设置运行时主题状态
        // 使用用户的 systemName（如有）或主题的 displayName
        const effectiveSystemName = userThemeResponse.systemName || userThemeResponse.theme.displayName || DEFAULT_SYSTEM_NAME;
        // 优先使用用户自定义 logo，其次使用主题 logo，最后使用默认值
        const effectiveLogoUrl = userThemeResponse.customLogoUrl || userThemeResponse.theme.logoUrl || DEFAULT_LOGO_URL;

        const runtimeState: RuntimeThemeState = {
          theme: userThemeResponse.theme,
          systemName: effectiveSystemName,
          logoUrl: effectiveLogoUrl,
          effectiveConfig,
        };

        setCurrentTheme(runtimeState);

        // 应用主题到 CSS 变量
        applyTheme(effectiveConfig);

        // 保存到本地缓存
        saveThemeCache({
          themeId: userThemeResponse.theme.id,
          systemName: effectiveSystemName,
          customLogoUrl: effectiveLogoUrl,
          customConfig: userThemeResponse.customConfig,
          timestamp: Date.now(),
        });
      } else {
        // 用户没有主题偏好，尝试从本地缓存加载
        const cache = loadThemeCache();
        // 从缓存或默认主题中查找
        const defaultTheme = cache
          ? themesResponse.find(t => t.id === cache.themeId)
          : themesResponse.find(t => t.name === 'neirongmiao');

        const activeTheme = defaultTheme || themesResponse[0];

        if (activeTheme) {
          // 使用主题的 displayName（如有）或默认值
          const systemName = activeTheme.displayName || DEFAULT_SYSTEM_NAME;
          // 使用主题的 logoUrl（如有）或默认值
          const logoUrl = activeTheme.logoUrl || DEFAULT_LOGO_URL;

          // 如果有缓存的自定义配置，合并
          const effectiveConfig = cache?.customConfig
            ? mergeThemeConfig(activeTheme.config, cache.customConfig)
            : activeTheme.config;

          // 设置运行时主题状态
          const runtimeState: RuntimeThemeState = {
            theme: activeTheme,
            systemName,
            logoUrl,
            effectiveConfig,
          };

          setCurrentTheme(runtimeState);

          // 应用主题到 CSS 变量
          applyTheme(effectiveConfig);

          // 保存到本地缓存
          saveThemeCache({
            themeId: activeTheme.id,
            systemName,
            customLogoUrl: logoUrl,
            customConfig: cache?.customConfig,
            timestamp: Date.now(),
          });
        }
      }

      // 标记初始化完成
      themeInitializedFlag = true;
      setThemeInitialized(true);
    } catch (error) {
      // 处理加载错误
      const errorMessage = error instanceof Error ? error.message : '初始化主题失败';
      console.error('[useTheme] 初始化主题失败:', error);
      setThemeError(errorMessage);

      // 即使加载失败，也应用默认主题以保持 UI 正常显示
      resetTheme();
    } finally {
      // 释放锁
      themeInitializingLock = false;
      setIsInitializing(false);
      setThemeLoading(false);
    }
  }, [
    // React 19: 移除 Zustand 函数依赖（它们引用稳定），只保留状态值
    theme.themeInitialized,
    token,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ]); // Zustand setter 函数引用稳定，无需加入依赖数组

  /**
   * 组件挂载时自动初始化主题
   * 已修复依赖循环问题，可以安全使用
   */
  useEffect(() => {
    initializeTheme();
  }, [initializeTheme]);

  /* ===================== 主题操作方法 ===================== */

  /**
   * 切换主题
   * @param themeId - 目标主题 ID
   * @param options - 切换选项
   */
  const switchTheme = useCallback(async (
    themeId: string,
    options: SwitchThemeOptions = {}
  ) => {
    // 默认选项
    const { saveToServer = true, saveToLocal = true } = options;

    // 查找目标主题
    let targetTheme = theme.availableThemes.find(t => t.id === themeId);

    // 如果在可用主题列表中找不到，尝试从服务器获取
    if (!targetTheme) {
      try {
        const themes = await backendApi.listEnabledThemes();
        setAvailableThemes(themes);
        targetTheme = themes.find(t => t.id === themeId);
      } catch (error) {
        console.error('[useTheme] 刷新主题列表失败:', error);
      }
    }

    // 如果仍然找不到主题，报错
    if (!targetTheme) {
      throw new Error(`主题不存在: ${themeId}`);
    }

    // 构建新的运行时状态
    // 如果主题有 displayName，使用主题的 displayName，否则使用默认值
    const newSystemName = targetTheme.displayName || DEFAULT_SYSTEM_NAME;
    // 如果主题有 logoUrl，使用主题的 logoUrl，否则使用默认值
    const newLogoUrl = targetTheme.logoUrl || DEFAULT_LOGO_URL;

    const newRuntimeState: RuntimeThemeState = {
      theme: targetTheme,
      systemName: newSystemName,
      logoUrl: newLogoUrl,
      effectiveConfig: targetTheme.config,
    };

    // 更新本地状态
    setCurrentTheme(newRuntimeState);

    // 应用新主题
    applyTheme(targetTheme.config);

    // 保存到本地缓存
    if (saveToLocal) {
      saveThemeCache({
        themeId: targetTheme.id,
        systemName: newSystemName,
        customLogoUrl: newLogoUrl || DEFAULT_LOGO_URL,
        timestamp: Date.now(),
      });
    }

    // 保存到服务器
    if (saveToServer && token) {
      try {
        setThemeLoading(true);
        await backendApi.setCurrentUserTheme(token, {
          themeId: targetTheme.id,
          systemName: newSystemName,
        });
      } catch (error) {
        console.error('[useTheme] 保存主题到服务器失败:', error);
        // 不抛出错误，因为本地已经切换成功
      } finally {
        setThemeLoading(false);
      }
    }
  }, [
    theme.availableThemes,
    theme.currentTheme,
    token,
    setCurrentTheme,
    setThemeLoading,
    setAvailableThemes,
  ]);

  /**
   * 更新系统名称
   * @param systemName - 新的系统名称
   * @param options - 更新选项
   */
  const updateSystemName = useCallback(async (
    systemName: string,
    options: SwitchThemeOptions = {}
  ) => {
    // 默认选项
    const { saveToServer = true, saveToLocal = true } = options;

    // 如果没有当前主题，无法更新
    if (!theme.currentTheme?.theme) {
      throw new Error('没有活动的主题');
    }

    // 更新本地状态
    updateThemeSystemName(systemName);

    // 更新本地缓存
    if (saveToLocal && theme.currentTheme) {
      saveThemeCache({
        themeId: theme.currentTheme.theme.id,
        systemName,
        customLogoUrl: theme.currentTheme.logoUrl || DEFAULT_LOGO_URL,
        customConfig: undefined,
        timestamp: Date.now(),
      });
    }

    // 保存到服务器
    if (saveToServer && token && theme.currentTheme.theme) {
      try {
        setThemeLoading(true);
        await backendApi.setCurrentUserTheme(token, {
          themeId: theme.currentTheme.theme.id,
          systemName,
        });
      } catch (error) {
        console.error('[useTheme] 保存系统名称到服务器失败:', error);
      } finally {
        setThemeLoading(false);
      }
    }
  }, [
    theme.currentTheme,
    token,
    updateThemeSystemName,
    setThemeLoading,
  ]);

  /**
   * 更新自定义 Logo
   * @param logoUrl - Logo URL
   * @param options - 更新选项
   */
  const updateCustomLogo = useCallback(async (
    logoUrl: string,
    options: SwitchThemeOptions = {}
  ) => {
    // 默认选项
    const { saveToServer = true, saveToLocal = true } = options;

    // 更新本地状态
    updateThemeLogo(logoUrl);

    // 更新本地缓存
    if (saveToLocal && theme.currentTheme) {
      saveThemeCache({
        themeId: theme.currentTheme.theme.id,
        systemName: theme.currentTheme.systemName,
        customLogoUrl: logoUrl,
        timestamp: Date.now(),
      });
    }

    // 保存到服务器
    if (saveToServer && token) {
      try {
        setThemeLoading(true);
        await backendApi.uploadUserLogo(token, logoUrl);
      } catch (error) {
        console.error('[useTheme] 保存 Logo 到服务器失败:', error);
      } finally {
        setThemeLoading(false);
      }
    }
  }, [
    theme.currentTheme,
    token,
    updateThemeLogo,
    setThemeLoading,
  ]);

  /**
   * 更新自定义配置（如颜色覆盖）
   * @param config - 自定义配置
   * @param options - 更新选项
   */
  const updateCustomConfig = useCallback(async (
    config: Partial<ThemeConfig>,
    options: SwitchThemeOptions = {}
  ) => {
    // 默认选项
    const { saveToServer = true, saveToLocal = true } = options;

    // 如果没有当前主题，无法更新
    if (!theme.currentTheme?.theme) {
      throw new Error('没有活动的主题');
    }

    // 合并配置
    const newEffectiveConfig = mergeThemeConfig(
      theme.currentTheme.theme.config,
      config
    );

    // 更新运行时状态
    const newRuntimeState: RuntimeThemeState = {
      ...theme.currentTheme,
      effectiveConfig: newEffectiveConfig,
    };

    setCurrentTheme(newRuntimeState);

    // 应用新配置
    applyTheme(newEffectiveConfig);

    // 更新本地缓存
    if (saveToLocal) {
      saveThemeCache({
        themeId: theme.currentTheme.theme.id,
        systemName: theme.currentTheme.systemName,
        customLogoUrl: theme.currentTheme.logoUrl || DEFAULT_LOGO_URL,
        customConfig: config,
        timestamp: Date.now(),
      });
    }

    // 保存到服务器
    if (saveToServer && token) {
      try {
        setThemeLoading(true);
        await backendApi.setCurrentUserTheme(token, {
          themeId: theme.currentTheme.theme.id,
          systemName: theme.currentTheme.systemName,
          customConfig: config,
        });
      } catch (error) {
        console.error('[useTheme] 保存自定义配置到服务器失败:', error);
      } finally {
        setThemeLoading(false);
      }
    }
  }, [
    theme.currentTheme,
    token,
    setCurrentTheme,
    setThemeLoading,
  ]);

  /**
   * 重置为默认主题
   */
  const resetThemeToDefault = useCallback(() => {
    // 重置 CSS 变量
    resetTheme();
    // 重置状态
    resetThemeState();
    // 清除本地缓存
    clearThemeCache();
  }, [resetThemeState]);

  /**
   * 刷新主题数据（重新从服务器加载）
   */
  const refreshTheme = useCallback(async () => {
    // 清除缓存和全局锁
    clearThemeCache();
    themeInitializedFlag = false;
    themeInitializingLock = false;

    // 重置 Zustand 状态
    setThemeInitialized(false);
    setThemeError(null);

    // 重新初始化
    await initializeTheme();
  }, [initializeTheme, setThemeInitialized, setThemeError]);

  /**
   * 强制刷新（忽略缓存和锁）
   */
  const forceRefreshTheme = useCallback(async () => {
    // 清除所有状态和缓存
    clearThemeCache();
    themeInitializedFlag = false;
    themeInitializingLock = false;
    resetThemeState();

    // 重新初始化
    await initializeTheme();
  }, [initializeTheme, resetThemeState]);

  /**
   * 清除错误并重试
   */
  const clearErrorAndRetry = useCallback(async () => {
    setThemeError(null);
    themeInitializedFlag = false;
    await initializeTheme();
  }, [initializeTheme, setThemeError]);

  /* ===================== 返回值 ===================== */

  return {
    // 状态
    /** 当前运行时主题状态 */
    currentTheme: theme.currentTheme,
    /** 所有可用主题列表 */
    availableThemes: theme.availableThemes,
    /** 是否正在加载 */
    isLoading: theme.themeLoading,
    /** 是否正在初始化 */
    isInitializing,
    /** 错误信息 */
    error: theme.themeError,
    /** 是否已初始化 */
    isInitialized: theme.themeInitialized,

    // 操作方法
    /** 切换主题 */
    switchTheme,
    /** 更新系统名称 */
    updateSystemName,
    /** 更新自定义 Logo */
    updateCustomLogo,
    /** 更新自定义配置 */
    updateCustomConfig,
    /** 重置为默认主题 */
    resetThemeToDefault,
    /** 刷新主题数据 */
    refreshTheme,
    /** 强制刷新（忽略缓存和锁） */
    forceRefreshTheme,
    /** 清除错误并重试 */
    clearErrorAndRetry,
    /** 初始化主题（手动触发） */
    initializeTheme,
  };
}

/* ===================== 导出 ===================== */

export default useTheme;