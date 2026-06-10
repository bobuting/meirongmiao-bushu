/**
 * Logo 上传组件
 * 提供自定义 Logo 的上传、预览和删除功能
 *
 * @module apps/web/components/theme/LogoUploader
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';

/* ===================== 类型定义 ===================== */

/**
 * Logo 上传器属性接口
 */
interface LogoUploaderProps {
  /** 自定义类名 */
  className?: string;
  /** 上传成功回调 */
  onUploadSuccess?: (logoUrl: string) => void;
  /** 上传失败回调 */
  onUploadError?: (error: Error) => void;
  /** 最大文件大小（字节），默认 2MB */
  maxSize?: number;
  /** 允许的文件类型，默认图片类型 */
  acceptTypes?: string[];
}

/**
 * 上传状态接口
 */
interface UploadState {
  /** 是否正在上传 */
  isUploading: boolean;
  /** 上传进度（0-100） */
  progress: number;
  /** 错误信息 */
  error: string | null;
  /** 预览 URL */
  previewUrl: string | null;
}

/* ===================== 常量定义 ===================== */

/** 默认最大文件大小：2MB */
const DEFAULT_MAX_SIZE = 2 * 1024 * 1024;

/** 默认允许的文件类型 */
const DEFAULT_ACCEPT_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];

/* ==================== 主组件 ==================== */

/**
 * Logo 上传组件
 * 支持拖拽上传和点击上传，提供预览和删除功能
 *
 * @param props - 组件属性
 * @example
 * ```tsx
 * <LogoUploader
 *   onUploadSuccess={(url) => console.log('Logo uploaded:', url)}
 *   maxSize={2 * 1024 * 1024}
 * />
 * ```
 */
export const LogoUploader: React.FC<LogoUploaderProps> = ({
  className = '',
  onUploadSuccess,
  onUploadError,
  maxSize = DEFAULT_MAX_SIZE,
  acceptTypes = DEFAULT_ACCEPT_TYPES,
}) => {
  /* ===================== Hooks ===================== */

  // 获取主题状态和操作方法
  const { currentTheme, updateCustomLogo } = useTheme();

  /* ===================== 状态 ===================== */

  // 上传状态
  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    progress: 0,
    error: null,
    previewUrl: null,
  });

  // 是否正在拖拽
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // 文件输入框引用
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 拖拽区域引用
  const dropZoneRef = useRef<HTMLDivElement>(null);

  /* ===================== 派生数据 ===================== */

  // 当前 Logo URL（优先使用预览 URL，其次是用户自定义 Logo，最后是主题默认 Logo）
  const currentLogoUrl = uploadState.previewUrl ||
    currentTheme?.logoUrl ||
    currentTheme?.theme?.logoUrl ||
    '';

  // accept 属性值
  const acceptValue = acceptTypes.join(',');

  /* ===================== 副作用 ===================== */

  /**
   * 清理预览 URL（避免内存泄漏）
   */
  useEffect(() => {
    return () => {
      // 组件卸载时清理预览 URL
      if (uploadState.previewUrl && uploadState.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(uploadState.previewUrl);
      }
    };
  }, [uploadState.previewUrl]);

  /* ===================== 辅助函数 ===================== */

  /**
   * 验证文件
   * @param file - 文件对象
   * @returns 错误信息，如果验证通过返回 null
   */
  const validateFile = useCallback((file: File): string | null => {
    // 检查文件类型
    if (!acceptTypes.includes(file.type)) {
      return `不支持的文件类型: ${file.type}。请上传 ${acceptTypes.map(t => t.split('/')[1].toUpperCase()).join('/')} 格式的图片`;
    }

    // 检查文件大小
    if (file.size > maxSize) {
      const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(1);
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
      return `文件大小超出限制: ${fileSizeMB}MB > ${maxSizeMB}MB`;
    }

    // 验证通过
    return null;
  }, [acceptTypes, maxSize]);

  /**
   * 创建本地预览
   * @param file - 文件对象
   * @returns 预览 URL
   */
  const createLocalPreview = useCallback((file: File): string => {
    // 创建本地预览 URL
    const previewUrl = URL.createObjectURL(file);
    return previewUrl;
  }, []);

  /**
   * 模拟上传文件到服务器
   * 实际项目中应替换为真实的上传 API
   * @param file - 文件对象
   * @returns 上传后的 URL
   */
  const uploadFileToServer = useCallback(async (file: File): Promise<string> => {
    // 模拟上传进度
    for (let progress = 0; progress <= 100; progress += 20) {
      await new Promise(resolve => setTimeout(resolve, 100));
      setUploadState(prev => ({ ...prev, progress }));
    }

    // 实际项目中，这里应该调用真实的上传 API
    // 例如：
    // const formData = new FormData();
    // formData.append('logo', file);
    // const response = await fetch('/api/upload/logo', { method: 'POST', body: formData });
    // const data = await response.json();
    // return data.url;

    // 模拟返回一个 URL（实际项目中应替换为服务器返回的 URL）
    return new Promise((resolve) => {
      // 使用本地预览 URL 作为模拟结果
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  /* ===================== 事件处理 ===================== */

  /**
   * 处理文件选择
   * @param file - 文件对象
   */
  const handleFileSelect = useCallback(async (file: File) => {
    // 清除之前的错误
    setUploadState(prev => ({ ...prev, error: null }));

    // 验证文件
    const validationError = validateFile(file);
    if (validationError) {
      setUploadState(prev => ({ ...prev, error: validationError }));
      onUploadError?.(new Error(validationError));
      return;
    }

    // 创建本地预览
    const previewUrl = createLocalPreview(file);
    setUploadState(prev => ({
      ...prev,
      previewUrl,
      isUploading: true,
      progress: 0,
    }));

    try {
      // 上传文件到服务器
      const uploadedUrl = await uploadFileToServer(file);

      // 更新主题 Logo
      await updateCustomLogo(uploadedUrl);

      // 更新状态
      setUploadState(prev => ({
        ...prev,
        isUploading: false,
        progress: 100,
      }));

      // 调用成功回调
      onUploadSuccess?.(uploadedUrl);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '上传失败';
      setUploadState(prev => ({
        ...prev,
        isUploading: false,
        error: errorMessage,
      }));
      onUploadError?.(error instanceof Error ? error : new Error(errorMessage));
    }
  }, [validateFile, createLocalPreview, uploadFileToServer, updateCustomLogo, onUploadSuccess, onUploadError]);

  /**
   * 处理文件输入变更
   */
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    // 清空 input，允许重复选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleFileSelect]);

  /**
   * 处理点击上传区域
   */
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * 处理删除 Logo
   */
  const handleDelete = useCallback(async () => {
    try {
      // 清除预览
      if (uploadState.previewUrl && uploadState.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(uploadState.previewUrl);
      }

      // 重置状态
      setUploadState({
        isUploading: false,
        progress: 0,
        error: null,
        previewUrl: null,
      });

      // 更新主题 Logo（清空）
      await updateCustomLogo('');
    } catch (error) {
      console.error('[LogoUploader] 删除 Logo 失败:', error);
    }
  }, [uploadState.previewUrl, updateCustomLogo]);

  /**
   * 处理拖拽进入
   */
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  /**
   * 处理拖拽离开
   */
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 检查是否真的离开了拖拽区域
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  /**
   * 处理拖拽悬停
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  /**
   * 处理拖拽放置
   */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    // 获取拖拽的文件
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  /* ===================== 渲染 ===================== */

  return (
    <div className={`logo-uploader ${className}`}>
      {/* 隐藏的文件输入框 */}
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptValue}
        onChange={handleInputChange}
        className="hidden"
      />

      {/* 上传区域 */}
      <div
        ref={dropZoneRef}
        onClick={handleUploadClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200
          ${isDragging
            ? 'border-accent bg-accent/5'
            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          }
          ${uploadState.isUploading ? 'pointer-events-none opacity-60' : ''}
        `}
      >
        {/* 有 Logo 时显示预览 */}
        {currentLogoUrl ? (
          <div className="flex flex-col items-center gap-4">
            {/* Logo 预览图 */}
            <div className="relative">
              <img
                src={currentLogoUrl}
                alt="Logo 预览"
                className="w-24 h-24 object-contain rounded-lg bg-gray-100 p-2"
              />
              {/* 删除按钮 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                title="删除 Logo"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 提示文字 */}
            <div className="text-sm text-gray-500">
              点击或拖拽更换 Logo
            </div>
          </div>
        ) : (
          /* 无 Logo 时显示上传提示 */
          <div className="flex flex-col items-center gap-3">
            {/* 上传图标 */}
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>

            {/* 上传提示 */}
            <div>
              <p className="text-sm font-medium text-gray-700">点击或拖拽上传 Logo</p>
              <p className="text-xs text-gray-500 mt-1">
                支持 PNG、JPG、SVG、WebP，最大 {Math.round(maxSize / (1024 * 1024))}MB
              </p>
            </div>
          </div>
        )}

        {/* 上传进度条 */}
        {uploadState.isUploading && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-xl">
            <div className="w-3/4 max-w-xs">
              <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                <span>上传中...</span>
                <span>{uploadState.progress}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-200"
                  style={{ width: `${uploadState.progress}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 错误提示 */}
      {uploadState.error && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{uploadState.error}</span>
        </div>
      )}
    </div>
  );
};

/* ===================== 导出 ===================== */

export default LogoUploader;