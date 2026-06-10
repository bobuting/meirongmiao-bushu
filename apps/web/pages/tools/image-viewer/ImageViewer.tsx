import React, { useState, useCallback, useRef } from 'react';
import { parseUrls } from '../../../utils/imageUrlParser';

interface ImageInfo {
  url: string;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
  name: string;
  type: string;
  size?: number;
  loaded: boolean;
  error?: boolean;
}


export const ImageViewer: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [previewIndex, setPreviewIndex] = useState(-1);
  const imgRefs = useRef<Map<number, HTMLImageElement>>(new Map());

  // 提交
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const urls = parseUrls(inputText);
    if (urls.length === 0) {
      setError('未找到有效的图片地址，请检查输入');
      return;
    }

    setLoading(true);
    setError('');
    setImages(urls.map(url => ({
      url,
      width: 0, height: 0,
      naturalWidth: 0, naturalHeight: 0,
      name: '', type: '', loaded: false, error: false,
    })));
  }, [inputText]);

  // 单张图片加载完成
  const handleImageLoad = useCallback((index: number) => {
    const img = imgRefs.current.get(index);
    if (!img) return;

    const urlObj = new URL(img.src);
    const pathname = urlObj.pathname;
    const fileName = pathname.split('/').pop() || 'unknown';
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    const typeMap: Record<string, string> = {
      jpg: 'JPEG', jpeg: 'JPEG', png: 'PNG', gif: 'GIF',
      webp: 'WebP', svg: 'SVG', bmp: 'BMP', ico: 'ICO',
      avif: 'AVIF', tiff: 'TIFF', tif: 'TIFF',
    };

    setImages(prev => prev.map((item, i) => i === index ? {
      ...item,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      width: img.width,
      height: img.height,
      name: fileName,
      type: typeMap[ext] || `未知 (${ext})`,
      loaded: true,
      error: false,
    } : item));

    // 所有图片都完成加载（成功或失败）
    setImages(prev => {
      const allDone = prev.every(img => img.loaded || img.error);
      if (allDone) setLoading(false);
      return prev;
    });
  }, []);

  // 单张图片加载失败
  const handleImageError = useCallback((index: number) => {
    setImages(prev => prev.map((item, i) => i === index ? {
      ...item, loaded: false, error: true,
    } : item));

    setImages(prev => {
      const allDone = prev.every(img => img.loaded || img.error);
      if (allDone) setLoading(false);
      return prev;
    });
  }, []);

  // 清空
  const handleClear = useCallback(() => {
    setInputText('');
    setImages([]);
    setError('');
    setLoading(false);
    imgRefs.current.clear();
  }, []);

  // 复制
  const handleCopy = useCallback(async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch { /* 静默 */ }
  }, []);

  const loadedImages = images.filter(img => img.loaded);
  const failedImages = images.filter(img => img.error);
  const pendingImages = images.filter(img => !img.loaded && !img.error);

  // 大图弹窗导航
  const goToPrev = useCallback(() => {
    setPreviewIndex(i => {
      const newIdx = i - 1;
      return newIdx < 0 ? loadedImages.length - 1 : newIdx;
    });
  }, [loadedImages.length]);

  const goToNext = useCallback(() => {
    setPreviewIndex(i => {
      const newIdx = i + 1;
      return newIdx >= loadedImages.length ? 0 : newIdx;
    });
  }, [loadedImages.length]);

  const previewImage = previewIndex >= 0 && previewIndex < loadedImages.length ? loadedImages[previewIndex] : null;

  return (
    <div className="min-h-screen bg-[var(--color-bg)] p-6">
      <div className="max-w-6xl mx-auto">
        {/* 标题区 */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            图片预览工具
            <span className="text-sm font-normal text-[var(--color-text-secondary)] ml-3">
              支持多行 URL 或 JSON 数组格式
            </span>
          </h1>
        </div>

        {/* 输入区 */}
        <form onSubmit={handleSubmit} className="mb-6">
          <div className="flex gap-3 items-start">
            <div className="flex-1">
              <textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder={'输入图片 URL，支持以下格式：\n\n1. 每行一个 URL\nhttps://example.com/a.jpg\nhttps://example.com/b.png\n\n2. JSON 数组\n["https://example.com/a.jpg", "https://example.com/b.png"]'}
                rows={8}
                className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-white text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)] focus:border-transparent transition-all text-sm resize-none font-mono"
              />
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="submit"
                disabled={loading || !inputText.trim()}
                className="px-6 py-3 rounded-xl bg-[var(--color-primary)] text-white font-medium text-sm hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-active)] shadow-lg shadow-[var(--color-primary)]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {loading ? '加载中...' : `加载图片`}
              </button>
              {images.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-600 text-sm hover:bg-gray-50 transition-all whitespace-nowrap"
                >
                  清空
                </button>
              )}
            </div>
          </div>
        </form>

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* 加载状态摘要 */}
        {images.length > 0 && (pendingImages.length > 0 || loading) && (
          <div className="mb-4 px-4 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-sm">
            加载中：{loadedImages.length}/{images.length} 张
            {failedImages.length > 0 && `，失败 ${failedImages.length} 张`}
          </div>
        )}

        {/* 隐藏的 img 用于加载和获取尺寸 */}
        {images.map((img, i) => (
          <img
            key={img.url + i}
            ref={el => { if (el) imgRefs.current.set(i, el); }}
            src={img.url}
            onLoad={() => handleImageLoad(i)}
            onError={() => handleImageError(i)}
            className="hidden"
          />
        ))}

        {/* 多图网格展示 */}
        {loadedImages.length > 0 && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {loadedImages.map((img, idx) => {
                // 在 images 数组中的真实 index
                const realIndex = images.indexOf(img);
                return (
                  <div
                    key={img.url + realIndex}
                    className="bg-white rounded-2xl border border-[var(--color-border)] overflow-hidden shadow-sm group cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setPreviewIndex(idx)}
                  >
                    {/* 缩略图 */}
                    <div className="relative overflow-hidden bg-gray-50 flex items-center justify-center h-48">
                      <img
                        src={img.url}
                        alt={img.name}
                        className="max-w-full max-h-48 object-contain transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white bg-black/50 px-3 py-1.5 rounded-lg text-xs backdrop-blur-sm">
                          查看大图
                        </span>
                      </div>
                      {/* 序号标记 */}
                      <span className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-md backdrop-blur-sm">
                        {realIndex + 1}/{images.length}
                      </span>
                    </div>
                    {/* 信息摘要 */}
                    <div className="p-3 space-y-1">
                      <div className="text-xs text-[var(--color-text-primary)] font-medium truncate" title={img.name}>
                        {img.name}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
                        <span>{img.type}</span>
                        <span>{img.naturalWidth}×{img.naturalHeight}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 加载失败的图片列表 */}
        {failedImages.length > 0 && (
          <div className="mt-6 bg-white rounded-2xl border border-red-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-red-600">加载失败 ({failedImages.length})</h2>
            </div>
            <div className="p-4 space-y-2">
              {failedImages.map((img, idx) => {
                const realIndex = images.indexOf(img);
                return (
                  <div key={img.url + realIndex} className="flex items-center gap-2 text-sm">
                    <span className="text-red-400 shrink-0">✕</span>
                    <span className="text-[var(--color-text-muted)] truncate flex-1" title={img.url}>{img.url}</span>
                    <button
                      onClick={() => handleCopy(img.url)}
                      className="p-1 rounded-md hover:bg-gray-100 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors shrink-0"
                      title="复制地址"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 空状态 */}
        {images.length === 0 && !loading && !error && (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[var(--color-primary-light)] mb-4">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
            <p className="text-[var(--color-text-secondary)] text-sm">输入图片地址开始预览，支持多行或 JSON 数组</p>
          </div>
        )}
      </div>

      {/* 大图预览弹窗 */}
      {previewIndex >= 0 && previewImage && (
        <ImagePreviewModal
          src={previewImage.url}
          name={previewImage.name}
          index={previewIndex}
          total={loadedImages.length}
          onClose={() => setPreviewIndex(-1)}
          onPrev={goToPrev}
          onNext={goToNext}
        />
      )}
    </div>
  );
};

/** 大图预览弹窗（支持左右切换） */
const ImagePreviewModal: React.FC<{
  src: string;
  name: string;
  index: number;
  total: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}> = ({ src, name, index, total, onClose, onPrev, onNext }) => (
  <div
    className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in"
    onClick={onClose}
  >
    <div
      className="relative max-w-[90vw] max-h-[90vh] animate-fade-in"
      onClick={e => e.stopPropagation()}
    >
      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white/90 text-gray-700 hover:bg-white shadow-lg flex items-center justify-center transition-all z-10"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* 左箭头 */}
      {total > 1 && (
        <button
          onClick={onPrev}
          className="absolute -left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 text-gray-700 hover:bg-white shadow-lg flex items-center justify-center transition-all z-10"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      {/* 右箭头 */}
      {total > 1 && (
        <button
          onClick={onNext}
          className="absolute -right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 text-gray-700 hover:bg-white shadow-lg flex items-center justify-center transition-all z-10"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

      <img
        src={src}
        alt={name}
        className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
      />

      {/* 底部信息栏 */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4 rounded-b-lg flex items-center justify-between">
        <p className="text-white/90 text-sm truncate flex-1">{name}</p>
        {total > 1 && (
          <span className="text-white/70 text-xs ml-3 shrink-0">{index + 1} / {total}</span>
        )}
      </div>
    </div>
  </div>
);
