/**
 * 成片管理页面
 * 三栏布局：项目列表 | 视频网格 | 详情面板（fixed 定位，不影响布局）
 * 点击视频封面 → 全屏播放
 * 点击视频信息区 → 弹出右侧详情
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { finalVideosProjects, finalVideosList, finalVideoDelete } from "../../services/realApi/finalVideos";
import { realAdminApi } from "../../services/realApi/admin/index";
import { useAppStore } from "../../store/useAppStore";
import { useToast } from "../../components/ui/Toast";
import { useShallow } from 'zustand/react/shallow';
import { getOssThumbnailUrl, getOssVideoSnapshotUrl } from "../../utils/ossImage";
import { VideoPreviewModal } from "../../components/shared/VideoPreviewModal";
import { ShareModal } from "../../components/shared/ShareModal";

// ========== 类型 ==========

interface ProjectSummary {
  id: string;
  name: string;
  userId: string;
  userEmail: string;
  finalVideoCount: number;
  updatedAt: number;
  coverImageUrl: string | null;
  projectKind: string;
}

interface FinalVideo {
  id: string;
  projectId: string;
  videoType: "step4" | "fission" | "outfit_merge";
  videoUrl: string;
  durationSec: number | null;
  fileSize: number | null;
  coverImageUrl: string | null;
  backgroundMusicTitle: string | null;
  backgroundMusicUrl: string | null;
  storyboardUrls: string[] | null;
  transitionType: string | null;
  transitionDurationFrames: number | null;
  creatorId: string | null;
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
  projectName: string | null;
  creatorEmail: string | null;
}

interface UserBrief { id: string; email: string }

// ========== 工具函数 ==========

/** 判断 URL 是否为视频 */
function isVideoUrl(url: string): boolean {
  const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv'];
  const lowerUrl = url.toLowerCase();
  return videoExtensions.some(ext => lowerUrl.includes(ext));
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

function formatDuration(sec: number | null): string {
  if (!sec) return "-";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ========== 缩略图组件 ==========

function Thumbnail({ src, alt, className, onClick, width = 300, videoUrl }: {
  src: string | null;
  alt: string;
  className?: string;
  onClick?: () => void;
  width?: number;
  videoUrl?: string;
}) {
  const [error, setError] = useState(false);
  const fallback = (
    <div className={`flex items-center justify-center bg-slate-800 text-slate-500 ${className}`}>
      <svg className="w-5 h-5 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    </div>
  );

  // 智能判断 URL 类型并生成缩略图 URL
  let imageUrl: string | null = null;

  if (src) {
    // 如果 src 存在，判断是视频还是图片
    if (isVideoUrl(src)) {
      // src 是视频 URL，使用视频缩略图
      imageUrl = getOssVideoSnapshotUrl(src, 0, width);
    } else {
      // src 是图片 URL，使用图片缩略图
      imageUrl = getOssThumbnailUrl(src, width, 85);
    }
  } else if (videoUrl) {
    // src 不存在但有 videoUrl，使用视频缩略图
    imageUrl = getOssVideoSnapshotUrl(videoUrl, 0, width);
  }

  if (!imageUrl || error) return onClick ? <div onClick={onClick}>{fallback}</div> : fallback;

  return (
    <img
      src={imageUrl}
      alt={alt}
      loading="lazy"
      onError={() => setError(true)}
      onClick={onClick}
      className={`object-cover transition-all duration-200 ${className} ${onClick ? "cursor-pointer hover:brightness-110" : ""}`}
    />
  );
}

// ========== 视频卡片操作菜单 ==========

function VideoCardMenu({ video, onRefresh }: { video: FinalVideo; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleDownload = useCallback(() => {
    const link = document.createElement("a");
    link.href = video.videoUrl;
    link.download = `${video.projectName || "video"}_${video.id.slice(0, 8)}.mp4`;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setOpen(false);
  }, [video]);

  const handleDelete = useCallback(async () => {
    if (!confirm("确定要删除这个成片吗？")) return;
    try {
      const { token } = useAppStore.getState();
      if (!token) return;
      await finalVideoDelete(token, video.id);
      onRefresh();
      setOpen(false);
    } catch (err) {
      console.error(err);
      alert("删除失败");
    }
  }, [video, onRefresh]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="w-6 h-6 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"
      >
        <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-7 z-20 w-28 bg-white rounded-lg shadow-lg border border-slate-200 py-1 overflow-hidden"
        >
          <button
            onClick={handleDownload}
            className="w-full px-3 py-2 text-xs text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            下载视频
          </button>
          <button
            onClick={handleDelete}
            className="w-full px-3 py-2 text-xs text-left text-red-600 hover:bg-red-50 flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            删除
          </button>
        </div>
      )}
    </div>
  );
}

// ========== 音乐播放器组件 ==========

function MusicPlayer({ title, url, isPlaying, onToggle }: {
  title: string;
  url: string;
  isPlaying: boolean;
  onToggle: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(() => {/* 浏览器自动播放策略限制，预期失败 */});
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);

  return (
    <div className="flex items-center gap-2 p-2 bg-slate-100 rounded-lg">
      <audio ref={audioRef} src={url} onEnded={onToggle} />
      <button
        onClick={onToggle}
        className="w-8 h-8 rounded-full bg-violet-500 hover:bg-violet-600 text-white flex items-center justify-center flex-shrink-0 transition-colors"
      >
        {isPlaying ? (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <span className="text-xs text-slate-700 truncate flex-1">{title}</span>
    </div>
  );
}

// ========== 主页面 ==========

export function FinalVideosManagement() {
  const { token, currentUser } = useAppStore(useShallow((state) => ({ token: state.token, currentUser: state.currentUser })));
  const toast = useToast();
  const safeToken = token!;
  const canAccess = currentUser?.role === "admin" && Boolean(token);

  const [projectList, setProjectList] = useState<ProjectSummary[]>([]);
  const [videoList, setVideoList] = useState<FinalVideo[]>([]);
  const [userList, setUserList] = useState<UserBrief[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<FinalVideo | null>(null);
  const [loading, setLoading] = useState({ projects: true, videos: false }); // 初始状态设置为加载中
  const [searchText, setSearchText] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [videoPreview, setVideoPreview] = useState<{ videoUrl: string; title: string } | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [hasMoreProjects, setHasMoreProjects] = useState(true);
  const [playingMusicUrl, setPlayingMusicUrl] = useState<string | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const PROJECT_PAGE_SIZE = 15;
  const projectPageRef = useRef(0);

  const sidebarRef = useRef<HTMLDivElement>(null);

  // 加载项目列表
  const loadProjects = useCallback(async (resetPage = false) => {
    setLoading(p => ({ ...p, projects: true }));
    const page = resetPage ? 0 : projectPageRef.current;
    try {
      const res = await finalVideosProjects(safeToken, {
        userId: filterUserId || undefined,
        search: searchText || undefined,
        offset: page * PROJECT_PAGE_SIZE,
        limit: PROJECT_PAGE_SIZE,
      });
      if (resetPage) {
        setProjectList(res.projects);
        projectPageRef.current = 0;
      } else {
        setProjectList(prev => [...prev, ...res.projects]);
      }
      setHasMoreProjects(res.projects.length >= PROJECT_PAGE_SIZE);
    } catch (err) {
      console.error(err);
      toast.error("加载项目列表失败，请重试");
    }
    finally { setLoading(p => ({ ...p, projects: false })); }
  }, [safeToken, filterUserId, searchText]);

  const loadVideos = useCallback(async (projectId: string) => {
    setLoading(p => ({ ...p, videos: true }));
    try {
      const res = await finalVideosList(safeToken, projectId);
      setVideoList(res.videos);
    } catch (err) {
      console.error(err);
      toast.error("加载视频列表失败，请重试");
    }
    finally { setLoading(p => ({ ...p, videos: false })); }
  }, [safeToken]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await realAdminApi.adminUsers(safeToken);
      setUserList(res.users.map(u => ({ id: u.id, email: u.email })));
    } catch (err) {
      console.error(err);
      toast.error("加载用户列表失败，请重试");
    }
  }, [safeToken]);

  // 初始加载
  useEffect(() => {
    if (canAccess) { loadProjects(true); loadUsers(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess, filterUserId]);

  // 选中项目后加载成片
  useEffect(() => {
    if (selectedProjectId && canAccess) { loadVideos(selectedProjectId); setSelectedVideo(null); }
    else { setVideoList([]); setSelectedVideo(null); }
  }, [selectedProjectId, canAccess, loadVideos]);

  // 搜索
  const handleSearch = useCallback(() => {
    projectPageRef.current = 0;
    loadProjects(true);
  }, [loadProjects]);

  // 加载更多
  const loadMoreProjects = useCallback(() => {
    if (loading.projects || !hasMoreProjects) return;
    projectPageRef.current += 1;
    loadProjects(false);
  }, [loading.projects, hasMoreProjects, loadProjects]);

  // 刷新
  const refreshVideos = useCallback(() => {
    if (selectedProjectId) loadVideos(selectedProjectId);
    loadProjects(true);
  }, [selectedProjectId, loadVideos, loadProjects]);

  // 切换音乐播放
  const toggleMusic = useCallback((url: string) => {
    setPlayingMusicUrl(prev => prev === url ? null : url);
  }, []);

  if (!canAccess) {
    return <div className="flex items-center justify-center h-full text-slate-400 text-sm">请先登录管理员账号</div>;
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200/80 shadow-sm shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <h2 className="text-base font-semibold text-slate-800 tracking-tight">成片管理</h2>
          {selectedProjectId && videoList.length > 0 && (
            <span className="text-xs text-slate-400 ml-2">{videoList.length} 个成片</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* 分享按钮 - 选中项目后显示 */}
          {selectedProjectId && videoList.length > 0 && (
            <button
              onClick={() => setShareModalOpen(true)}
              className="px-3 py-1.5 text-xs text-white bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 rounded-md transition-colors flex items-center gap-1 shadow-md shadow-blue-500/20"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 0l6.632 3.316m0 0l-6.632 3.316m0 0l6.632 3.316M9 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              分享作品
            </button>
          )}
          <button
            onClick={() => { loadProjects(true); if (selectedProjectId) loadVideos(selectedProjectId); }}
            className="px-3 py-1.5 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 5a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            刷新
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* ========== 左侧：项目列表 ========== */}
        <div ref={sidebarRef} className="w-[260px] bg-white border-r border-slate-200 flex flex-col overflow-hidden shrink-0">
          {/* 搜索 & 筛选 */}
          <div className="p-3 space-y-2 border-b border-slate-100 shrink-0">
            <div className="relative">
              <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="搜索项目..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 placeholder-slate-400 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400/30"
              />
            </div>
            <select
              value={filterUserId}
              onChange={e => setFilterUserId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400/30 appearance-none cursor-pointer"
            >
              <option value="">全部用户</option>
              {userList.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
            </select>
          </div>

          {/* 项目卡片列表 */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {loading.projects && projectList.length === 0 ? (
              <div className="text-center text-xs text-slate-400 py-10">加载中...</div>
            ) : projectList.length === 0 ? (
              <div className="text-center text-xs text-slate-400 py-10">无项目数据</div>
            ) : (
              <>
                {projectList.map(p => (
                  <div
                    key={p.id}
                    onClick={() => setSelectedProjectId(p.id)}
                    className={`flex gap-2.5 p-2 rounded-lg cursor-pointer transition-all duration-150
                      ${selectedProjectId === p.id
                        ? "bg-sky-50 ring-1 ring-sky-400 shadow-sm"
                        : "bg-slate-50 hover:bg-slate-100"}`}
                  >
                    <div className="w-10 h-14 rounded-md overflow-hidden shrink-0 bg-slate-200">
                      <Thumbnail src={p.coverImageUrl} alt={p.name} className="w-full h-full" width={80} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0
                          ${p.projectKind === 'video' ? 'bg-sky-100 text-sky-700' :
                            p.projectKind === 'image' ? 'bg-orange-100 text-orange-700' :
                            p.projectKind === 'outfit_change' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-violet-100 text-violet-700'}`}>
                          {p.projectKind === 'video' ? '视频' :
                            p.projectKind === 'image' ? '图片' :
                            p.projectKind === 'outfit_change' ? '换装' : '反推'}
                        </span>
                        <span className="text-xs font-medium text-slate-700 truncate">{p.name}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 truncate">{p.userEmail}</div>
                      <div className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-sky-600 font-medium">{p.finalVideoCount}个</span>
                          <span className="text-[10px] text-slate-400">{formatTime(p.updatedAt)}</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(p.id);
                            toast.success(`复制项目ID ${p.id} 成功`);
                            // 简单提示：改变按钮颜色
                            const btn = e.currentTarget;
                            btn.classList.add('text-emerald-500');
                            setTimeout(() => btn.classList.remove('text-emerald-500'), 1000);
                          }}
                          className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded transition-colors shrink-0"
                          title="复制项目ID"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {/* 加载更多 */}
                {hasMoreProjects && (
                  <button
                    onClick={loadMoreProjects}
                    disabled={loading.projects}
                    className="w-full py-2 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loading.projects ? "加载中..." : "加载更多"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* ========== 中间：视频网格 ========== */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selectedProjectId ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <svg className="w-16 h-16 opacity-20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span className="text-sm">选择左侧项目查看成片</span>
            </div>
          ) : loading.videos && videoList.length === 0 ? (
            <div className="text-center text-xs text-slate-400 py-20">加载中...</div>
          ) : videoList.length === 0 ? (
            <div className="text-center text-xs text-slate-400 py-20">该项目无成片</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
              {videoList.map(v => (
                <div key={v.id} className="group">
                  {/* 视频封面 - 点击播放 */}
                  <div
                    className="relative aspect-[9/16] rounded-xl overflow-hidden bg-slate-900 cursor-pointer shadow-md hover:shadow-xl transition-shadow"
                    onClick={() => setVideoPreview({ videoUrl: v.videoUrl, title: v.projectName ?? "成片" })}
                  >
                    <Thumbnail src={v.coverImageUrl} alt={v.projectName ?? "成片"} className="w-full h-full" width={300} videoUrl={v.videoUrl} />
                    {/* 播放图标 */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                      <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all duration-200">
                        <svg className="w-5 h-5 text-slate-800 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                    {/* 类型标签 */}
                    <div className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide backdrop-blur-sm
                      ${v.videoType === "step4" ? "bg-sky-500/90 text-white" : v.videoType === "outfit_merge" ? "bg-emerald-500/90 text-white" : "bg-violet-500/90 text-white"}`}>
                      {v.videoType === "step4" ? "Step4" : v.videoType === "outfit_merge" ? "换装" : "裂变"}
                    </div>
                    {/* 操作菜单 */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <VideoCardMenu video={v} onRefresh={refreshVideos} />
                    </div>
                    {/* 时长 */}
                    <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-medium">
                      {formatDuration(v.durationSec)}
                    </div>
                  </div>
                  {/* 视频信息 - 点击弹出详情 */}
                  <div
                    className="mt-2 px-1 cursor-pointer group/info"
                    onClick={() => setSelectedVideo(selectedVideo?.id === v.id ? null : v)}
                  >
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span className="font-medium truncate flex-1">{formatSize(v.fileSize)}</span>
                      <span className="text-slate-400 text-[10px]">{formatTime(v.createdAt)}</span>
                    </div>
                    <div className="text-[10px] text-sky-500 mt-0.5 opacity-0 group-hover/info:opacity-100 transition-opacity">
                      点击查看详情 →
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ========== 右侧详情面板（fixed 定位） ========== */}
        {selectedVideo && (
          <div className="fixed right-0 top-0 bottom-0 w-[360px] bg-white shadow-2xl z-50 overflow-y-auto animate-[slideInRight_0.2s_ease-out]">
            {/* 头部 */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-slate-100 px-4 py-3 flex items-center justify-between z-10">
              <span className="text-sm font-semibold text-slate-800">成片详情</span>
              <button
                onClick={() => setSelectedVideo(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 视频预览 */}
            <div className="p-4">
              <div
                className="relative aspect-[9/16] rounded-xl overflow-hidden bg-slate-900 cursor-pointer group"
                onClick={() => setVideoPreview({ videoUrl: selectedVideo.videoUrl, title: selectedVideo.projectName ?? "成片" })}
              >
                <Thumbnail src={selectedVideo.coverImageUrl} alt="视频封面" className="w-full h-full" width={400} videoUrl={selectedVideo.videoUrl} />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                  <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-xl">
                    <svg className="w-6 h-6 text-slate-800 ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
                <div className="absolute bottom-3 left-3 text-xs text-white/80 bg-black/50 px-2 py-1 rounded-md backdrop-blur-sm">
                  点击全屏播放
                </div>
              </div>
            </div>

            {/* 基本信息 */}
            <div className="px-4 pb-4 space-y-3">
              {/* 类型和时长 */}
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold
                    ${selectedVideo.videoType === "step4"
                      ? "bg-sky-100 text-sky-700"
                      : selectedVideo.videoType === "outfit_merge"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-violet-100 text-violet-700"}`}>
                    {selectedVideo.videoType === "step4" ? "Step4 成片" : selectedVideo.videoType === "outfit_merge" ? "换装成片" : "裂变成片"}
                  </span>
                  <span className="text-sm font-medium text-slate-700">{formatDuration(selectedVideo.durationSec)}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-600">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {formatSize(selectedVideo.fileSize)}
                  </div>
                  {selectedVideo.transitionType && (
                    <div className="flex items-center gap-2 text-slate-600">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                      {selectedVideo.transitionType}
                    </div>
                  )}
                </div>
              </div>

              {/* 背景音乐 */}
              {selectedVideo.backgroundMusicUrl && selectedVideo.backgroundMusicTitle && (
                <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl p-4">
                  <div className="text-xs text-violet-600 font-medium mb-2 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
                    </svg>
                    背景音乐
                  </div>
                  <MusicPlayer
                    title={selectedVideo.backgroundMusicTitle}
                    url={selectedVideo.backgroundMusicUrl}
                    isPlaying={playingMusicUrl === selectedVideo.backgroundMusicUrl}
                    onToggle={() => toggleMusic(selectedVideo.backgroundMusicUrl!)}
                  />
                </div>
              )}

              {/* 项目和创建者 */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-3 text-xs">
                <div className="flex items-center gap-3">
                  <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <div className="text-slate-400 text-[10px]">所属项目</div>
                    <div className="text-slate-700 font-medium truncate">{selectedVideo.projectName ?? "-"}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <div className="text-slate-400 text-[10px]">创建者</div>
                    <div className="text-slate-700 font-medium truncate">{selectedVideo.creatorEmail ?? "-"}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <div className="text-slate-400 text-[10px]">创建时间</div>
                    <div className="text-slate-700 font-medium">{formatTime(selectedVideo.createdAt)}</div>
                  </div>
                </div>
              </div>

              {/* 分镜图 */}
              {selectedVideo.storyboardUrls && selectedVideo.storyboardUrls.length > 0 && (
                <div>
                  <div className="text-xs text-slate-600 font-medium mb-2 flex items-center gap-1">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    分镜图 ({selectedVideo.storyboardUrls.length})
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedVideo.storyboardUrls.map((url, i) => (
                      <div
                        key={i}
                        className="aspect-[9/16] rounded-lg overflow-hidden bg-slate-900 cursor-pointer hover:ring-2 hover:ring-sky-400 transition-all"
                        onClick={() => setImagePreview(url)}
                      >
                        <Thumbnail src={url} alt={`分镜 ${i + 1}`} className="w-full h-full" width={150} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 视频预览弹窗 */}
      {videoPreview && (
        <VideoPreviewModal
          isOpen={true}
          videos={[{ url: videoPreview.videoUrl, title: videoPreview.title }]}
          currentIndex={0}
          onIndexChange={() => {}}
          onClose={() => setVideoPreview(null)}
        />
      )}

      {/* 图片预览弹窗 */}
      {imagePreview && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex items-center justify-center"
          onClick={() => setImagePreview(null)}
        >
          <img
            src={imagePreview}
            alt="分镜预览"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
          <button
            onClick={() => setImagePreview(null)}
            className="absolute top-6 right-6 w-12 h-12 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-all"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* 分享弹窗 */}
      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        shareUrl={`${window.location.origin}/share/${selectedProjectId}`}
      />

      {/* CSS 动画 */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default FinalVideosManagement;
