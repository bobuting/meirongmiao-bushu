/**
 * 项目分享页面 - 电影级沉浸体验
 * 公开访问，展示成片视频和裂变视频
 * Visual Thesis: 深邃背景 + 品牌光晕聚光灯 + 视频主角 + 能量脉冲
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { getOssVideoSnapshotUrl, getOssThumbnailUrl } from '../../utils/ossImage';

// API 响应类型
interface ShareProjectResponse {
  project: {
    id: string;
    name: string;
    publishTitle: string | null;
    thumbnailUrl: string | null;
    videoCoverImageUrl: string | null;
    durationSec: number;
    views: number;
    createdAt: number;
    projectKind: string;
    formatLabel: string;
  };
  mainVideo: {
    id: string | null;
    videoUrl: string | null;
    coverImageUrl: string | null;
    durationSec: number | null;
  } | null;
  step4Videos: Array<{
    id: string;
    videoUrl: string | null;
    coverImageUrl: string | null;
    durationSec: number | null;
    createdAt: number;
  }>;
  fissionVideos: Array<{
    id: string;
    videoUrl: string | null;
    thumbnailUrl: string | null;
    durationSec: number | null;
    fissionType: string;
    createdAt: number;
  }>;
}

// 格式化时长
function formatDuration(seconds: number | null): string {
  if (!seconds) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 格式化日期 - 简短版
function formatDateShort(timestamp: number): string {
  const date = new Date(timestamp);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
}

// 格式化浏览次数
function formatViews(count: number): string {
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}万`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
}

/**
 * 加载骨架屏 - 电影级风格
 */
function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-[#0a0a0c] flex flex-col items-center justify-center">
      {/* 光晕骨架 */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-gradient-radial from-orange-500/20 via-red-500/10 to-transparent blur-3xl animate-pulse" />

      {/* 视频骨架 */}
      <div className="relative w-[340px] aspect-[9/16] bg-[#141418] rounded-2xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />

        {/* 播放按钮骨架 */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-white/10 animate-pulse" />
        </div>

        {/* 底部信息骨架 */}
        <div className="absolute bottom-5 left-5 right-5">
          <div className="h-5 w-3/4 bg-white/10 rounded animate-pulse mb-3" />
          <div className="flex gap-4">
            <div className="h-4 w-16 bg-white/5 rounded animate-pulse" />
            <div className="h-4 w-12 bg-white/5 rounded animate-pulse" />
          </div>
        </div>
      </div>

      {/* 底部骨架 */}
      <div className="mt-8 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-white/10 animate-pulse" />
        <div className="h-4 w-24 bg-white/5 rounded animate-pulse" />
      </div>
    </div>
  );
}

/**
 * 错误状态 - 电影级风格
 */
function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-[#0a0a0c] flex flex-col items-center justify-center p-8">
      {/* 背景光效 */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/3 w-[300px] h-[300px] rounded-full bg-red-500/10 blur-[100px]" />
        <div className="absolute bottom-1/3 right-1/3 w-[200px] h-[200px] rounded-full bg-orange-500/10 blur-[80px]" />
      </div>

      <div className="relative z-10 text-center">
        {/* 图标 */}
        <div className="w-28 h-28 rounded-full bg-gradient-to-br from-red-500/30 to-orange-500/20 flex items-center justify-center mb-8 border border-white/10 backdrop-blur-sm">
          <span className="material-icons-round text-6xl text-white/70">videocam_off</span>
        </div>

        {/* 文字 */}
        <p className="text-white/80 text-lg mb-2">{message}</p>
        <p className="text-white/40 text-sm mb-10 max-w-[260px]">该内容可能已被删除或暂未生成视频</p>

        {/* 按钮 */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white rounded-full font-semibold transition-all shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50"
        >
          <span className="material-icons-round">explore</span>
          探索更多精彩
        </Link>
      </div>
    </div>
  );
}

/**
 * 裂变视频卡片 - 能量块风格
 */
function FissionCard({
  videoUrl,
  thumbnailUrl,
  duration,
  index,
  onClick,
}: {
  videoUrl: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  index: number;
  onClick: () => void;
}) {
  if (!videoUrl) return null;

  const coverImage = thumbnailUrl
    ? getOssThumbnailUrl(thumbnailUrl, 400)
    : getOssVideoSnapshotUrl(videoUrl, 0, 400);

  return (
    <div
      onClick={onClick}
      className="relative aspect-[9/16] bg-[#141418] rounded-xl overflow-hidden cursor-pointer group transition-all duration-500 hover:scale-[1.02] hover:shadow-lg hover:shadow-orange-500/20"
      style={{
        animationDelay: `${index * 100}ms`,
      }}
    >
      {/* 封面图 */}
      <img
        src={coverImage}
        alt={`裂变创作 #${index + 1}`}
        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        loading="lazy"
      />

      {/* 渐变遮罩 */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      {/* 序号标签 - 能量脉冲风格 */}
      <div className="absolute top-3 left-3">
        <div className="relative">
          {/* 能量光晕 */}
          <div className="absolute inset-0 w-8 h-8 rounded-full bg-gradient-to-r from-orange-500 to-red-500 blur-md opacity-60 animate-pulse" />
          {/* 序号球 */}
          <div className="relative w-7 h-7 rounded-full bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center text-white text-xs font-bold shadow-lg">
            {index + 1}
          </div>
        </div>
      </div>

      {/* 播放按钮 - 玻璃态 */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
          <span className="material-icons-round text-2xl text-white">play_arrow</span>
        </div>
      </div>

      {/* 时长标签 */}
      <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/60 backdrop-blur-sm rounded text-white/90 text-xs font-medium">
        {formatDuration(duration)}
      </div>
    </div>
  );
}

/**
 * 全屏视频播放器 - 电影级
 */
function FullscreenPlayer({
  videoUrl,
  coverUrl,
  title,
  subtitle,
  onClose,
}: {
  videoUrl: string;
  coverUrl?: string | null;
  title?: string;
  subtitle?: string;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // 自动播放
    videoRef.current?.play().catch(() => {/* 浏览器自动播放策略限制，预期失败 */});
    // 阻止滚动
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0a0a0c] flex items-center justify-center animate-[backdrop-fade-in_0.3s_ease-out]"
      onClick={onClose}
    >
      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        className="absolute top-5 right-5 z-10 w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 text-white/70 hover:text-white hover:bg-white/20 transition-all"
        aria-label="关闭"
      >
        <span className="material-icons-round text-2xl">close</span>
      </button>

      {/* 视频容器 */}
      <div
        className="relative w-full max-w-md aspect-[9/16] animate-[fade-in-scale_0.3s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 背景光晕 */}
        <div className="absolute -inset-8 rounded-full bg-gradient-radial from-orange-500/30 via-red-500/20 to-transparent blur-[60px]" />

        {/* 视频元素 */}
        <video
          ref={videoRef}
          src={videoUrl}
          poster={coverUrl ? getOssVideoSnapshotUrl(coverUrl, 0, 800) : undefined}
          controls
          playsInline
          className="relative w-full h-full object-contain rounded-2xl"
          style={{ boxShadow: '0 0 100px rgba(230,140,25,0.3)' }}
        />

        {/* 底部信息 */}
        {title && (
          <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black/95 via-black/70 to-transparent rounded-b-2xl">
            <p className="text-white font-semibold text-lg mb-1">{title}</p>
            {subtitle && <p className="text-white/50 text-sm">{subtitle}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 主播放按钮组件 - 玻璃态 + 光圈脉冲
 */
function PlayButton() {
  return (
    <div className="relative">
      {/* 外层光圈脉冲 */}
      <div className="absolute inset-0 w-20 h-20 -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2 rounded-full bg-gradient-to-r from-orange-500/40 to-red-500/40 blur-xl animate-pulse" />
      {/* 内层光圈 */}
      <div className="absolute inset-0 w-16 h-16 -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2 rounded-full bg-gradient-to-r from-orange-500/60 to-red-500/60 blur-md animate-pulse" style={{ animationDelay: '0.5s' }} />

      {/* 播放按钮本体 */}
      <div className="relative w-16 h-16 rounded-full bg-white/15 backdrop-blur-xl flex items-center justify-center border-2 border-white/50 transition-all hover:bg-white/25 hover:scale-110 hover:border-white/70 cursor-pointer shadow-lg shadow-orange-500/30">
        <span className="material-icons-round text-4xl text-white drop-shadow-lg">play_arrow</span>
      </div>
    </div>
  );
}

/**
 * 项目分享页面主组件 - 电影级沉浸体验
 */
export function ProjectShare(): React.ReactElement {
  const { projectId } = useParams<{ projectId: string }>();
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [activeVideoIndex, setActiveVideoIndex] = useState<number | null>(null);

  // 获取分享数据
  const { data, isLoading, error } = useQuery<ShareProjectResponse>({
    queryKey: ['share-project', projectId],
    queryFn: async () => {
      const response = await fetch(`/neirongmiao/api/share/projects/${projectId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: '加载失败' }));
        throw new Error(errorData.message || '项目不存在或无法分享');
      }
      return response.json();
    },
    enabled: !!projectId,
    retry: false,
    staleTime: 30000,
  });

  // 关闭全屏
  const handleCloseFullscreen = useCallback(() => {
    setShowFullscreen(false);
    setActiveVideoIndex(null);
  }, []);

  // 点击主视频
  const handleMainVideoClick = useCallback(() => {
    setShowFullscreen(true);
    setActiveVideoIndex(null);
  }, []);

  // 点击裂变视频
  const handleFissionVideoClick = useCallback((index: number) => {
    setShowFullscreen(true);
    setActiveVideoIndex(index);
  }, []);

  // 加载状态
  if (isLoading) return <LoadingSkeleton />;
  // 错误状态
  if (error || !data) return <ErrorState message={error?.message || '加载失败'} />;

  const { project, mainVideo, step4Videos, fissionVideos } = data;
  const displayTitle = project.publishTitle || project.name;
  const hasFissionVideos = fissionVideos.length > 0;
  const hasStep4Videos = step4Videos.length > 0;

  // 当前播放视频（索引 < fission数量 为裂变，>= 为其他成片）
  const currentVideo = activeVideoIndex === null
    ? mainVideo
    : activeVideoIndex < fissionVideos.length
      ? fissionVideos[activeVideoIndex]
      : step4Videos[activeVideoIndex - fissionVideos.length];

  // 主视频封面
  const mainCoverImage = mainVideo?.coverImageUrl
    ? getOssThumbnailUrl(mainVideo.coverImageUrl, 800)
    : mainVideo?.videoUrl
      ? getOssVideoSnapshotUrl(mainVideo.videoUrl, 0, 800)
      : project.thumbnailUrl
        ? getOssThumbnailUrl(project.thumbnailUrl, 800)
        : null;

  return (
    <div className="min-h-screen bg-[#0a0a0c] flex flex-col">
      {/* 背景光效层 - 聚光灯效果 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {/* 顶部主光晕 */}
        <div className="absolute top-[15%] left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-gradient-radial from-orange-500/25 via-red-500/15 to-transparent blur-[100px] animate-pulse" style={{ animationDuration: '3s' }} />
        {/* 底部辅助光晕 */}
        <div className="absolute bottom-[20%] left-[20%] w-[250px] h-[250px] rounded-full bg-gradient-radial from-blue-500/10 to-transparent blur-[80px]" />
        <div className="absolute bottom-[25%] right-[25%] w-[200px] h-[200px] rounded-full bg-gradient-radial from-purple-500/10 to-transparent blur-[60px]" />
      </div>

      {/* 主内容区 */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8 pb-24">
        {/* 主视频卡片 */}
        {mainVideo?.videoUrl && (
          <div className="w-full max-w-[380px] animate-[fade-in-scale_0.4s_ease-out]">
            {/* 外层光晕容器 */}
            <div className="relative">
              {/* 卡片背后光晕 */}
              <div className="absolute -inset-6 rounded-3xl bg-gradient-radial from-orange-500/40 via-red-500/20 to-transparent blur-[40px] animate-pulse" style={{ animationDuration: '4s' }} />

              {/* 视频卡片 */}
              <div
                onClick={handleMainVideoClick}
                className="relative aspect-[9/16] bg-[#141418] rounded-2xl overflow-hidden cursor-pointer group transition-transform duration-500 hover:scale-[1.01]"
                style={{ boxShadow: '0 8px 60px rgba(0,0,0,0.8), 0 0 80px rgba(230,140,25,0.2)' }}
              >
                {/* 封面图 */}
                {mainCoverImage && (
                  <img
                    src={mainCoverImage}
                    alt={displayTitle}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                  />
                )}

                {/* 渐变遮罩 */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/20" />

                {/* 播放按钮 */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <PlayButton />
                </div>

                {/* 底部信息区 */}
                <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/95 via-black/80 to-transparent">
                  {/* 标题 */}
                  <h1 className="text-white font-semibold text-xl mb-4 leading-relaxed line-clamp-2">
                    {displayTitle}
                  </h1>

                  {/* 元信息行 */}
                  <div className="flex items-center justify-between text-white/60">
                    <div className="flex items-center gap-5">
                      {/* 浏览量 */}
                      <span className="flex items-center gap-1.5">
                        <span className="material-icons-round text-lg text-orange-400">visibility</span>
                        <span className="font-medium">{formatViews(project.views)}</span>
                      </span>
                      {/* 时长 */}
                      <span className="flex items-center gap-1.5">
                        <span className="material-icons-round text-lg text-white/50">schedule</span>
                        {formatDuration(mainVideo.durationSec || project.durationSec)}
                      </span>
                    </div>
                    {/* 日期 */}
                    <span className="text-white/40">{formatDateShort(project.createdAt)}</span>
                  </div>
                </div>

                {/* 格式标签 */}
                {project.formatLabel && (
                  <div className="absolute top-5 right-5 px-3 py-1.5 bg-white/10 backdrop-blur-md rounded-full text-white/70 text-xs font-medium border border-white/15">
                    {project.formatLabel}
                  </div>
                )}
              </div>
            </div>

            {/* 操作提示 */}
            <p className="text-center text-white/30 text-sm mt-5 animate-[fadeInSlide_0.5s_ease-out]">
              点击播放观看视频
            </p>
          </div>
        )}

        {/* 裂变视频区域 */}
        {hasFissionVideos && (
          <div className="w-full max-w-[380px] mt-10 animate-[fadeInSlide_0.6s_ease-out]" style={{ animationDelay: '200ms' }}>
            {/* 分隔线 */}
            <div className="flex items-center gap-4 mb-5">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <div className="flex items-center gap-2 text-white/50 text-sm">
                {/* 能量图标 */}
                <span className="relative">
                  <div className="absolute inset-0 w-5 h-5 rounded-full bg-orange-500/40 blur-sm animate-pulse" />
                  <span className="material-icons-round text-base text-orange-400 relative">bolt</span>
                </span>
                <span>AI 裂变创作</span>
                <span className="bg-white/15 px-2 py-0.5 rounded-full text-xs">{fissionVideos.length}</span>
              </div>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </div>

            {/* 裂变视频网格 */}
            <div className="grid grid-cols-2 gap-4">
              {fissionVideos.map((video, index) => (
                <FissionCard
                  key={video.id}
                  videoUrl={video.videoUrl}
                  thumbnailUrl={video.thumbnailUrl}
                  duration={video.durationSec}
                  index={index}
                  onClick={() => handleFissionVideoClick(index)}
                />
              ))}
            </div>
          </div>
        )}

        {/* 其他成片视频区域 */}
        {hasStep4Videos && (
          <div className="w-full max-w-[380px] mt-10 animate-[fadeInSlide_0.6s_ease-out]" style={{ animationDelay: '300ms' }}>
            {/* 分隔线 */}
            <div className="flex items-center gap-4 mb-5">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <div className="flex items-center gap-2 text-white/50 text-sm">
                <span className="material-icons-round text-base text-blue-400">video_library</span>
                <span>其他成片</span>
                <span className="bg-white/15 px-2 py-0.5 rounded-full text-xs">{step4Videos.length}</span>
              </div>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </div>

            {/* 成片视频网格 */}
            <div className="grid grid-cols-2 gap-4">
              {step4Videos.map((video, index) => {
                const coverImage = video.coverImageUrl
                  ? getOssThumbnailUrl(video.coverImageUrl, 400)
                  : video.videoUrl
                    ? getOssVideoSnapshotUrl(video.videoUrl, 0, 400)
                    : null;

                return (
                  <div
                    key={video.id}
                    onClick={() => {
                      setShowFullscreen(true);
                      setActiveVideoIndex(fissionVideos.length + index);
                    }}
                    className="relative aspect-[9/16] bg-[#141418] rounded-xl overflow-hidden cursor-pointer group transition-all duration-500 hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/20"
                  >
                    {/* 封面图 */}
                    {coverImage && (
                      <img
                        src={coverImage}
                        alt={`成片 #${index + 1}`}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        loading="lazy"
                      />
                    )}

                    {/* 渐变遮罩 */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                    {/* 序号标签 */}
                    <div className="absolute top-3 left-3">
                      <div className="relative">
                        <div className="absolute inset-0 w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 blur-md opacity-60 animate-pulse" />
                        <div className="relative w-7 h-7 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold shadow-lg">
                          {index + 1}
                        </div>
                      </div>
                    </div>

                    {/* 播放按钮 */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
                        <span className="material-icons-round text-2xl text-white">play_arrow</span>
                      </div>
                    </div>

                    {/* 时长标签 */}
                    <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/60 backdrop-blur-sm rounded text-white/90 text-xs font-medium">
                      {formatDuration(video.durationSec)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* 底部品牌区 - 圆角悬浮卡片 */}
      <footer className="fixed bottom-4 left-4 right-4 z-10 px-5 py-4 rounded-2xl bg-[#141418]/50 backdrop-blur-xl shadow-2xl shadow-black/50 border border-white/10">
        <div className="max-w-[380px] mx-auto flex items-center justify-between gap-4">
          {/* 品牌 Logo - 使用项目 logo */}
          <Link to="/" className="flex items-center gap-3 group flex-1">
            {/* Logo 图片 */}
            <div className="relative transition-transform duration-300 group-hover:scale-110">
              {/* 光晕效果 */}
              <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-orange-500/40 to-red-500/40 blur-lg opacity-70 group-hover:opacity-100 transition-opacity" />
              {/* Logo 图片 */}
              <img
                src="/logo.png"
                alt="内容喵"
                className="relative w-12 h-12 rounded-xl object-contain"
              />
            </div>
            {/* 品牌文字 */}
            <div className="flex flex-col">
              <span className="text-white font-bold text-base tracking-wide">内容喵</span>
              <span className="text-white/50 text-xs">AI 视频创作平台</span>
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

      {/* 全屏播放器 */}
      {showFullscreen && currentVideo?.videoUrl && (
        <FullscreenPlayer
          videoUrl={currentVideo.videoUrl}
          coverUrl={(currentVideo as Record<string, unknown>).thumbnailUrl as string || (currentVideo as Record<string, unknown>).coverImageUrl as string || mainVideo?.coverImageUrl || null}
          title={activeVideoIndex === null ? displayTitle : activeVideoIndex < fissionVideos.length ? `裂变创作 #${activeVideoIndex + 1}` : `成片 #${activeVideoIndex - fissionVideos.length + 1}`}
          subtitle={activeVideoIndex === null ? formatDateShort(project.createdAt) : formatDuration(currentVideo.durationSec)}
          onClose={handleCloseFullscreen}
        />
      )}
    </div>
  );
}

export default ProjectShare;