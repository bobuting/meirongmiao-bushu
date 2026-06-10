/**
 * ImageProductSharePreview.tsx — 图片项目分享预览页面
 * 模拟真实电商商品页布局：主图轮播区域 + 详情页模块展示
 * 无需登录即可查看，用于分享传播
 */

import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link } from 'react-router';
import { imageShareApi, type ImageShareProjectResponse } from "../../services/realApi/image-share";

// 主图轮播组件
const MainImageCarousel: React.FC<{ photos: ImageShareProjectResponse['photos'] }> = ({ photos }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (photos.length === 0) {
    return (
      <div className="w-full aspect-square bg-gray-100 rounded-2xl flex items-center justify-center">
        <span className="text-gray-400">暂无主图</span>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {/* 主图区域 - 正方形 */}
      <div className="relative w-full aspect-square bg-white rounded-2xl overflow-hidden shadow-lg">
        <img loading="lazy"           src={photos[currentIndex]?.imageUrl ?? ""}
          alt={`模特图 ${currentIndex + 1}`}
          className="w-full h-full object-cover"
        />

        {/* 图片指示器 */}
        {photos.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {photos.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`w-2 h-2 rounded-full transition-all ${
                  idx === currentIndex ? "bg-white w-6" : "bg-white/50"
                }`}
              />
            ))}
          </div>
        )}

        {/* 左右切换按钮 */}
        {photos.length > 1 && (
          <>
            <button
              onClick={() => setCurrentIndex(prev => prev > 0 ? prev - 1 : photos.length - 1)}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center hover:bg-white transition-colors"
            >
              <span className="material-icons-round text-gray-700">chevron_left</span>
            </button>
            <button
              onClick={() => setCurrentIndex(prev => prev < photos.length - 1 ? prev + 1 : 0)}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center hover:bg-white transition-colors"
            >
              <span className="material-icons-round text-gray-700">chevron_right</span>
            </button>
          </>
        )}
      </div>

      {/* 缩略图网格 */}
      {photos.length > 1 && (
        <div className="flex gap-2 mt-4 overflow-x-auto px-1 pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {photos.map((photo, idx) => (
            <button
              key={photo.id}
              onClick={() => setCurrentIndex(idx)}
              className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                idx === currentIndex ? "border-orange-500 shadow-md" : "border-gray-200"
              }`}
            >
              <img loading="lazy"                 src={photo.imageUrl ?? ""}
                alt={photo.poseLabel}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// 长图历史切换展示组件（只读，不激活）
const LongImageViewer: React.FC<{
  generations: ImageShareProjectResponse['longImageGenerations'];
  defaultImageUrl: string;
}> = ({ generations, defaultImageUrl }) => {
  // 默认选中激活的长图，没有激活则用第一个
  const activeGen = generations.find(g => g.isActive);
  const [selectedId, setSelectedId] = useState(activeGen?.id ?? generations[0]?.id ?? "");

  const selected = generations.find(g => g.id === selectedId);
  const displayUrl = selected?.imageUrl ?? defaultImageUrl;

  if (generations.length <= 1) {
    return (
      <img loading="lazy" src={defaultImageUrl} alt="商详长图" className="w-full h-auto rounded-xl shadow-sm" />
    );
  }

  return (
    <div>
      {/* 大图 */}
      <img loading="lazy" src={displayUrl} alt="商详长图" className="w-full h-auto rounded-xl shadow-sm" />

      {/* 固定在屏幕左侧垂直居中的缩略图 */}
      <div className="fixed left-3 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2 p-1.5 rounded-xl bg-white/60 backdrop-blur-sm shadow-lg [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] max-h-[70vh] overflow-y-auto">
        {generations.map((gen) => (
          <button
            key={gen.id}
            onClick={() => setSelectedId(gen.id)}
            className={`relative w-14 h-14 rounded-lg overflow-hidden border-2 transition-all shadow-sm ${
              gen.id === selectedId
                ? "border-orange-500 shadow-md ring-2 ring-orange-300"
                : "border-white hover:border-gray-300 opacity-80 hover:opacity-100"
            }`}
          >
            <img loading="lazy"               src={gen.imageUrl}
              alt={gen.templateName ?? "长图"}
              className="w-full h-full object-cover"
            />
            {gen.isActive && (
              <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-green-400 ring-1 ring-white" />
            )}
          </button>
        ))}
      </div>

      {/* 模板名称 */}
      {selected?.templateName && (
        <p className="text-xs text-gray-400 mt-2 text-center">{selected.templateName}</p>
      )}
    </div>
  );
};

// 详情页模块展示组件
const DetailSections: React.FC<{ sections: ImageShareProjectResponse['sections'] }> = ({ sections }) => {
  if (sections.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* 分隔线 */}
      <div className="flex items-center gap-4 py-4">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
        <span className="text-sm font-medium text-gray-500">商品详情</span>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
      </div>

      {/* 模块图片列表 */}
      {sections.map((section) => (
        <div key={section.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* 模块标题 */}
          {section.title && (
            <div className="px-6 py-4 bg-gradient-to-r from-orange-50 to-yellow-50 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">{section.title}</h3>
              {section.goal && (
                <p className="text-sm text-gray-500 mt-1">{section.goal}</p>
              )}
            </div>
          )}

          {/* 模块图片 */}
          <img loading="lazy"             src={section.currentImageAssetId ?? ""}
            alt={section.title ?? "详情模块"}
            className="w-full object-cover"
          />

          {/* 模块文案 */}
          {section.copy && (
            <div className="px-6 py-4 bg-gray-50">
              <p className="text-sm text-gray-600 leading-relaxed">{section.copy}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// 主页面组件
export const ImageProductSharePreview: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareData, setShareData] = useState<ImageShareProjectResponse | null>(null);

  useEffect(() => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    // 使用公开分享 API
    imageShareApi.getImageProjectShareInfo(projectId)
      .then((data) => {
        setShareData(data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "加载失败");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [projectId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full border-4 border-orange-200 border-t-orange-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center">
        <div className="text-center">
          <span className="material-icons-round text-6xl text-red-300 mb-4">error_outline</span>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!shareData || (shareData.photos.length === 0 && shareData.sections.length === 0 && !shareData.ext?.longImageUrl && shareData.longImageGenerations.length === 0)) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center">
        <div className="text-center">
          <span className="material-icons-round text-6xl text-gray-300 mb-4">image_not_supported</span>
          <p className="text-gray-500">暂无内容展示</p>
        </div>
      </div>
    );
  }

  const hasLongImage = Boolean(shareData.ext?.longImageUrl) || shareData.longImageGenerations.length > 0;
  const hasPhotos = shareData.photos.length > 0;
  const projectTitle = shareData.project.name;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-800">{projectTitle}</h1>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-orange-100 text-orange-600 text-sm font-medium">
              AI 生成
            </span>
          </div>
        </div>
      </div>

      {/* 主要内容区域 */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {hasLongImage && !hasPhotos ? (
          /* 有长图但没有模特图时，全宽展示长图 */
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">{projectTitle}</h2>
              <p className="text-sm text-gray-500">由 AI 智能生成的专业电商展示内容</p>
            </div>
            <div className="flex items-center gap-4 py-4">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
              <span className="text-sm font-medium text-gray-500">商品详情</span>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
            </div>
            <LongImageViewer
              generations={shareData.longImageGenerations}
              defaultImageUrl={shareData.ext!.longImageUrl!}
            />
          </div>
        ) : (
          /* 有模特图时，双栏布局 */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="lg:sticky lg:top-20 lg:self-start">
              <MainImageCarousel photos={shareData.photos} />
            </div>
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">{projectTitle}</h2>
                <p className="text-sm text-gray-500 mb-4">由 AI 智能生成的专业电商展示内容</p>
                {shareData.ext?.logoUrl && (
                  <div className="flex items-center gap-3 py-3 border-t border-gray-100">
                    <img loading="lazy" src={shareData.ext.logoUrl} alt="品牌 Logo" className="w-12 h-12 object-contain rounded-lg" />
                    <span className="text-sm text-gray-600">品牌专属定制</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mt-4">
                  <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-600 text-sm font-medium">专业模特图</span>
                  <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-600 text-sm font-medium">详情页定制</span>
                  <span className="px-3 py-1 rounded-full bg-green-100 text-green-600 text-sm font-medium">高清品质</span>
                </div>
              </div>
              {hasLongImage ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-4 py-4">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
                    <span className="text-sm font-medium text-gray-500">商品详情</span>
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
                  </div>
                  <LongImageViewer
                    generations={shareData.longImageGenerations}
                    defaultImageUrl={shareData.ext!.longImageUrl!}
                  />
                </div>
              ) : (
                <DetailSections sections={shareData.sections} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* 底部品牌区 - 圆角悬浮卡片（和视频分享一致） */}
      <footer className="fixed bottom-4 left-4 right-4 z-10 px-5 py-4 rounded-2xl bg-[#141418]/50 backdrop-blur-xl shadow-2xl shadow-black/50 border border-white/10">
        <div className="max-w-[380px] mx-auto flex items-center justify-between gap-4">
          {/* 品牌 Logo */}
          <Link to="/" className="flex items-center gap-3 group flex-1">
            {/* Logo 图片 */}
            <div className="relative transition-transform duration-300 group-hover:scale-110">
              {/* 光晕效果 */}
              <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-orange-500/40 to-red-500/40 blur-lg opacity-70 group-hover:opacity-100 transition-opacity" />
              {/* Logo 图片 */}
              <img loading="lazy"                 src="/logo.png"
                alt="内容喵"
                className="relative w-12 h-12 rounded-xl object-contain"
              />
            </div>
            {/* 品牌文字 */}
            <div className="flex flex-col">
              <span className="text-white font-bold text-base tracking-wide">内容喵</span>
              <span className="text-white/50 text-xs">AI 图片创作平台</span>
            </div>
          </Link>

          {/* 入口按钮 */}
          <Link
            to="/"
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white rounded-full font-bold text-sm transition-all duration-300 shadow-lg shadow-orange-500/40 hover:shadow-orange-500/60 hover:scale-105"
          >
            <span className="material-icons-round text-lg">rocket_launch</span>
            开始创作
          </Link>
        </div>
      </footer>
    </div>
  );
};