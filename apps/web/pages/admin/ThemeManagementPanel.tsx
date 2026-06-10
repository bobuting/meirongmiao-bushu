/**
 * 主题维护面板组件
 * 全局单一主题模式：系统只有一个主题，所有用户共享
 *
 * 页面布局：
 * - Logo 上传
 * - 公司名称设置
 * - 主题色配置
 *
 * @module apps/web/pages/admin/ThemeManagementPanel
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { backendApi } from '../../services/backendApi';
import { useTheme } from '../../hooks/useTheme';
import { generateThemeFromImage, generateThemeFromPrimaryColor } from '../../utils/colorExtractor';
import { uploadFileToOss } from '../../services/ossUpload';
import type { ThemeConfig, ThemeCategory } from '../../types';

/* ===================== 类型定义 ===================== */

/**
 * 主题表单数据
 */
interface ThemeForm {
  logoUrl: string;
  displayName: string;
  primaryColor: string;
  accentColor: string;
  /** 主要文字色（用于标题、重要内容） */
  textPrimary: string;
  /** 次要文字色（用于正文） */
  textSecondary: string;
  /** 弱化文字色（用于提示、次要信息） */
  textMuted: string;
}

/**
 * 确认弹窗数据
 */
interface ConfirmDialogData {
  displayName: string;
  logoUrl?: string;
  primaryColor: string;
  accentColor: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
}

/* ==================== 辅助组件 ==================== */

/**
 * 颜色色板预览组件
 * 展示完整的主题色板，包括品牌色、文字色、背景色和实际效果预览
 */
const ColorPalettePreview: React.FC<{
  primaryColor: string;
  accentColor: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
}> = ({ primaryColor, accentColor, textPrimary, textSecondary, textMuted }) => {
  const theme = generateThemeFromPrimaryColor(primaryColor, accentColor, {
    text: { primary: textPrimary, secondary: textSecondary, muted: textMuted }
  });

  return (
    <div className="bg-gray-50 rounded-xl p-4 space-y-4">
      {/* 色板展示 */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {[
          { color: theme.colors.primary, label: '主色' },
          { color: theme.colors.primaryHover, label: '悬浮' },
          { color: theme.colors.primaryActive, label: '激活' },
          { color: theme.colors.primaryLight, label: '浅色', border: true },
          { color: theme.colors.accent, label: '强调' },
          { color: theme.colors.text.primary, label: '文字', text: true },
        ].map((item, i) => (
          <div key={i} className="flex flex-col items-center gap-1 flex-shrink-0">
            <div
              className={`w-10 h-10 rounded-lg shadow-sm flex items-center justify-center ${item.border ? 'border border-gray-200' : ''}`}
              style={item.text ? { backgroundColor: '#fff', color: item.color } : { backgroundColor: item.color }}
            >
              {item.text && <span className="text-sm font-bold">Aa</span>}
            </div>
            <span className="text-[10px] text-gray-400">{item.label}</span>
          </div>
        ))}
      </div>

      {/* 实际效果预览 */}
      <div className="grid grid-cols-2 gap-3">
        {/* 按钮预览 */}
        <div className="bg-white rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-2">按钮效果</p>
          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded-lg text-white text-sm font-medium"
              style={{ background: theme.gradients.primary }}
            >
              主要按钮
            </button>
            <button
              className="px-4 py-2 rounded-lg text-sm font-medium border"
              style={{ borderColor: theme.colors.primary, color: theme.colors.primary }}
            >
              次要按钮
            </button>
          </div>
        </div>

        {/* 文字预览 */}
        <div className="bg-white rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-2">文字效果</p>
          <div className="space-y-1">
            <p className="text-sm font-bold" style={{ color: textPrimary }}>标题文字</p>
            <p className="text-sm" style={{ color: textSecondary }}>正文内容示例</p>
            <p className="text-xs" style={{ color: textMuted }}>提示信息</p>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ==================== 主组件 ==================== */

/**
 * 主题维护面板组件
 */
export const ThemeManagementPanel: React.FC = () => {
  /* ===================== Hooks ===================== */

  const token = useAppStore((state) => state.token);
  const queryClient = useQueryClient();
  const { refreshTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ===================== 状态 ===================== */

  // 默认文字色
  const defaultTextColors = {
    primary: '#002244',
    secondary: '#666666',
    muted: '#999999',
  };

  // 主题表单
  const [themeForm, setThemeForm] = useState<ThemeForm>({
    logoUrl: '',
    displayName: '',
    primaryColor: '#e68c19',
    accentColor: '#00a8ff',
    textPrimary: defaultTextColors.primary,
    textSecondary: defaultTextColors.secondary,
    textMuted: defaultTextColors.muted,
  });

  // 上传状态
  const [isUploading, setIsUploading] = useState(false);
  const [isExtractingColors, setIsExtractingColors] = useState(false);

  // 操作反馈
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 确认弹窗
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmData, setConfirmData] = useState<ConfirmDialogData | null>(null);

  /* ===================== 数据查询 ===================== */

  // 获取系统主题（单一主题）
  const themeQuery = useQuery({
    queryKey: ['system-theme', token],
    enabled: Boolean(token),
    queryFn: async () => {
      if (!token) return null;
      return backendApi.getUserCreatedTheme(token);
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  /* ===================== 数据变更 ===================== */

  // 保存主题（创建或更新，后端会自动处理）
  const saveMutation = useMutation({
    mutationFn: async (data: { name: string; displayName: string; category: ThemeCategory; config: ThemeConfig; logoUrl?: string }) => {
      if (!token) throw new Error('未登录');
      return backendApi.createTheme(token, data);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['system-theme'] });
      // 刷新前端主题状态
      refreshTheme();
      setFeedback({ type: 'success', message: '主题保存并应用成功' });
    },
    onError: (error: Error) => {
      setFeedback({ type: 'error', message: `保存失败: ${error.message}` });
    },
  });

  /* ===================== 副作用 ===================== */

  // 自动清除反馈消息
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // 加载主题数据到表单
  useEffect(() => {
    const theme = themeQuery.data;
    if (theme) {
      setThemeForm({
        logoUrl: theme.logoUrl || '',
        displayName: theme.displayName,
        primaryColor: theme.config.colors.primary,
        accentColor: theme.config.colors.accent,
        textPrimary: theme.config.colors.text.primary,
        textSecondary: theme.config.colors.text.secondary,
        textMuted: theme.config.colors.text.muted,
      });
    }
  }, [themeQuery.data]);

  /* ===================== 辅助函数 ===================== */

  /**
   * 处理Logo上传（上传到 OSS）
   */
  const handleLogoUpload = useCallback(async (file: File) => {
    if (!token) {
      setFeedback({ type: 'error', message: '请先登录' });
      return;
    }

    setIsUploading(true);
    setIsExtractingColors(true);

    try {
      // 1. 创建本地预览用于颜色提取
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // 2. 从图片提取颜色
      try {
        const themeConfig = await generateThemeFromImage(dataUrl);
        setThemeForm(prev => ({
          ...prev,
          primaryColor: themeConfig.colors.primary,
          accentColor: themeConfig.colors.accent,
        }));
      } catch (error) {
        console.error('颜色提取失败:', error);
      } finally {
        setIsExtractingColors(false);
      }

      // 3. 上传到 OSS
      const { fileUrl } = await uploadFileToOss(token, 'theme-logo', file, true);

      // 4. 更新表单
      setThemeForm(prev => ({ ...prev, logoUrl: fileUrl }));

    } catch (error) {
      console.error('上传失败:', error);
      setFeedback({ type: 'error', message: 'Logo上传失败' });
    } finally {
      setIsUploading(false);
    }
  }, [token]);

  /**
   * 处理文件选择
   */
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleLogoUpload(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleLogoUpload]);

  /**
   * 处理拖拽上传
   */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleLogoUpload(file);
    }
  }, [handleLogoUpload]);

  /**
   * 处理主色调变更
   */
  const handlePrimaryColorChange = useCallback((color: string) => {
    setThemeForm(prev => ({ ...prev, primaryColor: color }));

    // 自动生成强调色
    const theme = generateThemeFromPrimaryColor(color);
    setThemeForm(prev => ({
      ...prev,
      primaryColor: color,
      accentColor: theme.colors.accent,
    }));
  }, []);

  /**
   * 点击保存按钮 - 显示确认弹窗
   */
  const handleClickSave = useCallback(() => {
    if (!themeForm.displayName.trim()) {
      setFeedback({ type: 'error', message: '请输入公司名称' });
      return;
    }

    // 显示确认弹窗
    setConfirmData({
      displayName: themeForm.displayName,
      logoUrl: themeForm.logoUrl,
      primaryColor: themeForm.primaryColor,
      accentColor: themeForm.accentColor,
      textPrimary: themeForm.textPrimary,
      textSecondary: themeForm.textSecondary,
      textMuted: themeForm.textMuted,
    });
    setShowConfirmDialog(true);
  }, [themeForm]);

  /**
   * 确认保存主题
   */
  const handleConfirmSave = useCallback(() => {
    if (!confirmData) return;

    // 生成主题标识符
    let name = confirmData.displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    if (!name) {
      name = `theme-${Date.now()}`;
    }

    // 生成完整主题配置，传入自定义文字色
    const config = generateThemeFromPrimaryColor(
      confirmData.primaryColor,
      confirmData.accentColor,
      {
        text: {
          primary: confirmData.textPrimary,
          secondary: confirmData.textSecondary,
          muted: confirmData.textMuted,
        }
      }
    );

    saveMutation.mutate({
      name,
      displayName: confirmData.displayName,
      category: 'custom',
      config,
      logoUrl: confirmData.logoUrl || undefined,
    });

    setShowConfirmDialog(false);
    setConfirmData(null);
  }, [confirmData, saveMutation]);

  /**
   * 取消保存
   */
  const handleCancelSave = useCallback(() => {
    setShowConfirmDialog(false);
    setConfirmData(null);
  }, []);


  /* ===================== 渲染 ===================== */

  const isSaving = saveMutation.isPending;

  return (
    <div className="theme-management-panel space-y-6">
      {/* 操作反馈 */}
      {feedback && (
        <div
          className={`
            px-4 py-3 rounded-xl border
            ${feedback.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
            }
          `}
        >
          {feedback.message}
        </div>
      )}

      {/* 确认弹窗 */}
      {showConfirmDialog && confirmData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-3">确认保存主题</h3>
            <div className="text-gray-600 mb-6 space-y-3">
              <p>即将保存并应用以下主题配置：</p>
              <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">公司名称：</span>
                  <span className="font-medium text-gray-900">{confirmData.displayName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Logo：</span>
                  <span className="font-medium text-gray-900">{confirmData.logoUrl ? '已设置' : '未设置'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">主色调：</span>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded" style={{ backgroundColor: confirmData.primaryColor }} />
                    <span className="font-medium text-gray-900">{confirmData.primaryColor}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">强调色：</span>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded" style={{ backgroundColor: confirmData.accentColor }} />
                    <span className="font-medium text-gray-900">{confirmData.accentColor}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">文字色：</span>
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 rounded bg-white border border-gray-200 flex items-center justify-center text-[8px] font-bold" style={{ color: confirmData.textPrimary }}>A</div>
                    <div className="w-4 h-4 rounded bg-white border border-gray-200 flex items-center justify-center text-[8px]" style={{ color: confirmData.textSecondary }}>A</div>
                    <div className="w-4 h-4 rounded bg-white border border-gray-200 flex items-center justify-center text-[8px]" style={{ color: confirmData.textMuted }}>A</div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500">保存后将立即应用到全局系统。</p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelSave}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmSave}
                disabled={isSaving}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <span className="material-icons-round animate-spin text-sm">refresh</span>
                    保存中...
                  </>
                ) : (
                  '确认保存'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 主题配置 */}
      <div className="max-w-4xl mx-auto space-y-6">
        <h2 className="text-xl font-bold text-gray-900">系统主题配置</h2>

        {themeQuery.isLoading ? (
          <div className="py-12 text-center text-gray-500">
            <span className="material-icons-round text-4xl animate-spin text-primary">refresh</span>
            <p className="mt-2">加载中...</p>
          </div>
        ) : (
          <>
            {/* 基本信息 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="material-icons-round text-primary text-lg">business</span>
                基本信息
              </h3>
              <div className="flex flex-col md:flex-row gap-6">
                {/* Logo 上传 */}
                <div className="flex-shrink-0">
                  <div
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                    className={`
                      relative w-32 h-32 border-2 border-dashed rounded-2xl flex items-center justify-center cursor-pointer transition-all
                      ${isUploading ? 'opacity-60 pointer-events-none' : 'border-gray-200 hover:border-primary hover:bg-gray-50'}
                    `}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />

                    {themeForm.logoUrl ? (
                      <img
                        src={themeForm.logoUrl}
                        alt="Logo"
                        className="w-24 h-24 object-contain rounded-xl"
                      />
                    ) : (
                      <div className="text-center">
                        <span className="material-icons-round text-3xl text-gray-300">add_photo_alternate</span>
                        <p className="text-xs text-gray-400 mt-1">上传 Logo</p>
                      </div>
                    )}

                    {isExtractingColors && (
                      <div className="absolute inset-0 bg-white/90 rounded-2xl flex items-center justify-center">
                        <span className="material-icons-round animate-spin text-primary">refresh</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 公司名称 */}
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    公司名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={themeForm.displayName}
                    onChange={(e) => setThemeForm(prev => ({ ...prev, displayName: e.target.value }))}
                    placeholder="请输入公司名称"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                  <p className="text-xs text-gray-400 mt-2">Logo 和公司名称将显示在系统左上角</p>
                </div>
              </div>
            </div>

            {/* 品牌色配置 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="material-icons-round text-primary text-lg">palette</span>
                品牌色配置
              </h3>
              <div className="grid grid-cols-2 gap-6">
                {/* 主色调 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">主色调</label>
                  <div className="flex items-center gap-4">
                    <div
                      className="w-16 h-16 rounded-2xl shadow-lg cursor-pointer relative overflow-hidden group"
                      style={{ backgroundColor: themeForm.primaryColor }}
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'color';
                        input.value = themeForm.primaryColor;
                        input.onchange = (e) => handlePrimaryColorChange((e.target as HTMLInputElement).value);
                        input.click();
                      }}
                    >
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <span className="material-icons-round text-white/0 group-hover:text-white/80 transition-colors">edit</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-mono text-gray-900">{themeForm.primaryColor.toUpperCase()}</p>
                      <p className="text-xs text-gray-400 mt-1">用于按钮、链接等强调元素</p>
                    </div>
                  </div>
                </div>

                {/* 强调色 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">强调色</label>
                  <div className="flex items-center gap-4">
                    <div
                      className="w-16 h-16 rounded-2xl shadow-lg cursor-pointer relative overflow-hidden group"
                      style={{ backgroundColor: themeForm.accentColor }}
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'color';
                        input.value = themeForm.accentColor;
                        input.onchange = (e) => setThemeForm(prev => ({ ...prev, accentColor: (e.target as HTMLInputElement).value }));
                        input.click();
                      }}
                    >
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <span className="material-icons-round text-white/0 group-hover:text-white/80 transition-colors">edit</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-mono text-gray-900">{themeForm.accentColor.toUpperCase()}</p>
                      <p className="text-xs text-gray-400 mt-1">用于次要强调、渐变终点</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 文字色配置 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="material-icons-round text-primary text-lg">text_fields</span>
                文字色配置
              </h3>
              <div className="grid grid-cols-3 gap-6">
                {/* 主要文字色 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">主要文字</label>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-xl bg-white border-2 flex items-center justify-center text-lg font-bold cursor-pointer hover:border-primary transition-colors"
                      style={{ color: themeForm.textPrimary, borderColor: themeForm.textPrimary + '40' }}
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'color';
                        input.value = themeForm.textPrimary;
                        input.onchange = (e) => setThemeForm(prev => ({ ...prev, textPrimary: (e.target as HTMLInputElement).value }));
                        input.click();
                      }}
                    >
                      Aa
                    </div>
                    <div>
                      <p className="text-xs font-mono text-gray-600">{themeForm.textPrimary.toUpperCase()}</p>
                      <p className="text-xs text-gray-400">标题、重要内容</p>
                    </div>
                  </div>
                </div>

                {/* 次要文字色 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">次要文字</label>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-xl bg-white border-2 flex items-center justify-center text-lg cursor-pointer hover:border-primary transition-colors"
                      style={{ color: themeForm.textSecondary, borderColor: themeForm.textSecondary + '40' }}
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'color';
                        input.value = themeForm.textSecondary;
                        input.onchange = (e) => setThemeForm(prev => ({ ...prev, textSecondary: (e.target as HTMLInputElement).value }));
                        input.click();
                      }}
                    >
                      Aa
                    </div>
                    <div>
                      <p className="text-xs font-mono text-gray-600">{themeForm.textSecondary.toUpperCase()}</p>
                      <p className="text-xs text-gray-400">正文、描述</p>
                    </div>
                  </div>
                </div>

                {/* 弱化文字色 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">弱化文字</label>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-xl bg-white border-2 flex items-center justify-center text-lg cursor-pointer hover:border-primary transition-colors"
                      style={{ color: themeForm.textMuted, borderColor: themeForm.textMuted + '40' }}
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'color';
                        input.value = themeForm.textMuted;
                        input.onchange = (e) => setThemeForm(prev => ({ ...prev, textMuted: (e.target as HTMLInputElement).value }));
                        input.click();
                      }}
                    >
                      Aa
                    </div>
                    <div>
                      <p className="text-xs font-mono text-gray-600">{themeForm.textMuted.toUpperCase()}</p>
                      <p className="text-xs text-gray-400">提示、次要信息</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 实时预览 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="material-icons-round text-primary text-lg">preview</span>
                实时预览
              </h3>
              <ColorPalettePreview
                primaryColor={themeForm.primaryColor}
                accentColor={themeForm.accentColor}
                textPrimary={themeForm.textPrimary}
                textSecondary={themeForm.textSecondary}
                textMuted={themeForm.textMuted}
              />
            </div>

            {/* 保存按钮 */}
            <div className="flex justify-end">
              <button
                onClick={handleClickSave}
                disabled={isSaving || !themeForm.displayName.trim()}
                className="px-8 py-3 bg-gradient-to-r from-primary to-accent text-white rounded-xl font-medium shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <span className="material-icons-round animate-spin">refresh</span>
                    保存中...
                  </>
                ) : (
                  <>
                    <span className="material-icons-round">save</span>
                    保存并应用主题
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/* ===================== 导出 ===================== */

export default ThemeManagementPanel;