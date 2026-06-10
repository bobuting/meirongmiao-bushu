import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { createApiRequest } from '../../services/backendApi.request';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { getOssThumbnailUrl } from '../../utils/ossImage';

// 允许的氛围标签（与后端保持一致）
const ALLOWED_ATMOSPHERES = [
  '欢快', '阳光', '动感', '浪漫', '轻松', '空灵'
];

// 与后端 VideoMusicDto 保持一致
interface VideoMusic {
  id: string;
  title: string;
  musicUrl: string;
  localPath: string | null;
  sourceUrl: string | null;
  atmospheres: string[];
  durationSec: number | null;
  artist: string | null;
  album: string | null;
  coverUrl: string | null;
  createdAt: number;
  updatedAt: number;
  creatorId?: string | null;
  musicFile?: File | null;
}

// 后端列表响应格式
interface ListVideoMusicResponse {
  enabled: boolean;
  items: VideoMusic[];
}

// 上传音乐响应
interface UploadMusicResponse {
  id: string;
  musicUrl: string;
}

// 删除音乐响应
interface DeleteMusicResponse {
  success: boolean;
  message?: string;
}

// 分析氛围响应
interface AnalyzeAtmosphereResponse {
  success: boolean;
  results: Array<{ id: string; atmospheres: string[] }>;
}

// 音频进度条组件（支持拖动）
const AudioProgress: React.FC<{
  audioState?: {
    audio: HTMLAudioElement | null;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
  };
  music: VideoMusic;
  onPlayToggle: (music: VideoMusic) => void;
  onSeek: (music: VideoMusic, time: number) => void;
}> = ({ audioState, music, onPlayToggle, onSeek }) => {
  const progressRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 格式化时长
  const formatDuration = (seconds: number) => {
    if (!seconds || seconds === 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isPlaying = audioState?.isPlaying || false;
  const currentTime = audioState?.currentTime || 0;
  const duration = audioState?.duration || 0;

  // 处理点击进度条
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || duration === 0) return;
    const rect = progressRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const seekTime = percentage * duration;
    onSeek(music, seekTime);
  };

  // 处理拖动开始
  const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    handleClick(e);
  };

  // 处理拖动移动
  const handleDragMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !progressRef.current || duration === 0) return;
    const rect = progressRef.current.getBoundingClientRect();
    const mouseX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = mouseX / rect.width;
    const seekTime = percentage * duration;
    onSeek(music, seekTime);
  };

  // 处理拖动结束
  const handleDragEnd = () => {
    setIsDragging(false);
  };

  return (
    <div className="flex items-center gap-2">
      {/* 播放/暂停按钮 */}
      <button
        onClick={() => onPlayToggle(music)}
        className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary-light transition-colors"
        title={isPlaying ? '暂停' : '播放'}
      >
        <span className="material-icons-round text-lg">
          {isPlaying ? 'pause' : 'play_arrow'}
        </span>
      </button>

      {/* 当前时间 */}
      <span className="text-xs text-text-muted w-10 text-center">
        {formatDuration(currentTime)}
      </span>

      {/* 进度条（可点击/拖动） */}
      <div
        ref={progressRef}
        className="w-24 h-2 bg-gray-200 rounded-full cursor-pointer relative overflow-hidden group"
        onClick={handleClick}
        onMouseDown={handleDragStart}
        onMouseMove={handleDragMove}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
        title="点击或拖动调整播放位置"
      >
        {/* 进度填充 */}
        <div
          className={`h-full bg-primary rounded-full transition-all ${isDragging ? '' : 'duration-100'}`}
          style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
        />
        {/* hover 效果 */}
        <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* 总时长 */}
      <span className="text-xs text-text-muted w-10 text-center">
        {formatDuration(duration)}
      </span>
    </div>
  );
};

export const VideoMusicManagement: React.FC = () => {
  const token = useAppStore((state) => state.token);
  const [musicList, setMusicList] = useState<VideoMusic[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [atmosphereFilter, setAtmosphereFilter] = useState('');
  const [total, setTotal] = useState(0);

  // 视频音乐同步状态
  const [isSyncingMusic, setIsSyncingMusic] = useState(false);
  const [syncResult, setSyncResult] = useState<{ added: number; skipped: number } | null>(null);

  // 选中的音乐（用于批量操作）
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 编辑弹窗
  const [editingMusic, setEditingMusic] = useState<Partial<VideoMusic> | null>(null);
  const [editingAtmospheres, setEditingAtmospheres] = useState<string[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const editAudioRef = useRef<HTMLAudioElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // 新增弹窗
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newMusic, setNewMusic] = useState<{
    title: string;
    album: string;
    artist: string;
    atmospheres: string[];
    musicUrl: string;
    localPath: string;
    durationSec: number | null;
    musicFile: File | null;
  }>({
    title: '',
    album: '',
    artist: '',
    atmospheres: [],
    musicUrl: '',
    localPath: '',
    durationSec: null,
    musicFile: null,
  });
  const addAudioRef = useRef<HTMLAudioElement>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);

  // 批量设置氛围的弹窗
  const [isBatchAtmosphereModalOpen, setIsBatchAtmosphereModalOpen] = useState(false);
  const [batchAtmospheres, setBatchAtmospheres] = useState<string[]>([]);

  // 每首音乐的独立播放状态
  const [audioStates, setAudioStates] = useState<Map<string, {
    audio: HTMLAudioElement | null;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
  }>>(new Map());

  // 删除确认弹窗状态
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string; title: string }>({
    isOpen: false,
    id: '',
    title: '',
  });

  // 氛围识别状态
  const [isAnalyzingAtmosphere, setIsAnalyzingAtmosphere] = useState(false);
  const [atmosphereResults, setAtmosphereResults] = useState<Array<{
    id: string | number;
    title: string;
    artist?: string;
    atmospheres: string[];
  }>>([]);
  const [showAtmosphereModal, setShowAtmosphereModal] = useState(false);

  // 统一的请求函数
  // 使用 createApiRequest，401 由 backendApi.request.ts 统一拦截
  const apiRequest = useCallback(createApiRequest(token), [token]);

  // 加载音乐列表
  const loadMusicList = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (atmosphereFilter) params.set('atmosphere', atmosphereFilter);
      const queryString = params.toString();
      const data: ListVideoMusicResponse = await apiRequest(`/video-music${queryString ? `?${queryString}` : ''}`);
      if (data.enabled) {
        setMusicList(data.items);
        setTotal(data.items.length);
      } else {
        setMusicList([]);
        setTotal(0);
      }
    } catch (error) {
      console.error('加载音乐列表失败:', error);
      setMusicList([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, atmosphereFilter, token, apiRequest]);

  useEffect(() => {
    loadMusicList();
  }, [loadMusicList]);

  // 播放/暂停音乐
  const togglePlayMusic = useCallback((music: VideoMusic) => {
    if (!music.musicUrl) return;

    const currentState = audioStates.get(music.id);

    // 如果已有音频实例且正在播放，则暂停
    if (currentState?.isPlaying && currentState.audio) {
      currentState.audio.pause();
      setAudioStates(prev => {
        const next = new Map(prev);
        next.set(music.id, {
          ...currentState,
          isPlaying: false,
          currentTime: currentState.audio?.currentTime || 0,
        });
        return next;
      });
      return;
    }

    // 暂停所有其他正在播放的音乐
    audioStates.forEach((state, id) => {
      if (state.isPlaying && state.audio) {
        state.audio.pause();
        setAudioStates(prev => {
          const next = new Map(prev);
          const existingState = next.get(id);
          if (existingState) {
            next.set(id, {
              ...existingState,
              isPlaying: false,
            });
          }
          return next;
        });
      }
    });

    // 如果已有音频实例且已暂停，则继续播放
    if (currentState?.audio && !currentState.isPlaying) {
      currentState.audio.play();
      setAudioStates(prev => {
        const next = new Map(prev);
        next.set(music.id, {
          ...currentState,
          isPlaying: true,
        });
        return next;
      });
      return;
    }

    // 创建新的音频实例
    const audio = new Audio(music.musicUrl);

    const updateProgress = () => {
      setAudioStates(prev => {
        const next = new Map(prev);
        const state = next.get(music.id);
        if (state) {
          next.set(music.id, {
            ...state,
            currentTime: audio.currentTime,
          });
        }
        return next;
      });
    };

    audio.ontimeupdate = updateProgress;
    audio.onloadedmetadata = () => {
      setAudioStates(prev => {
        const next = new Map(prev);
        next.set(music.id, {
          audio,
          isPlaying: false,
          currentTime: 0,
          duration: audio.duration || 0,
        });
        return next;
      });
      // 自动开始播放
      audio.play();
      setAudioStates(prev => {
        const next = new Map(prev);
        const state = next.get(music.id);
        if (state) {
          next.set(music.id, {
            ...state,
            isPlaying: true,
          });
        }
        return next;
      });
    };
    audio.onended = () => {
      setAudioStates(prev => {
        const next = new Map(prev);
        const state = next.get(music.id);
        if (state) {
          next.set(music.id, {
            ...state,
            isPlaying: false,
            currentTime: 0,
          });
        }
        return next;
      });
    };

    setAudioStates(prev => {
      const next = new Map(prev);
      next.set(music.id, {
        audio,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
      });
      return next;
    });
  }, [audioStates]);

  // 拖动进度条跳转到指定位置
  const handleSeek = useCallback((music: VideoMusic, seekTime: number) => {
    const state = audioStates.get(music.id);
    if (!state?.audio) return;

    state.audio.currentTime = seekTime;
    setAudioStates(prev => {
      const next = new Map(prev);
      next.set(music.id, {
        ...state,
        currentTime: seekTime,
      });
      return next;
    });
  }, [audioStates]);

  // 点击进度条
  const _handleProgressClick = useCallback((music: VideoMusic, e: React.MouseEvent<HTMLDivElement>) => {
    const state = audioStates.get(music.id);
    if (!state || state.duration === 0) return;

    const progressBar = e.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const seekTime = percentage * state.duration;

    handleSeek(music, seekTime);
  }, [audioStates, handleSeek]);

  // 拖动进度条
  const _handleProgressDrag = useCallback((music: VideoMusic, e: React.MouseEvent<HTMLDivElement>, isDragging: boolean) => {
    if (!isDragging) return;

    const state = audioStates.get(music.id);
    if (!state || state.duration === 0) return;

    const progressBar = e.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const mouseX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = mouseX / rect.width;
    const seekTime = percentage * state.duration;

    handleSeek(music, seekTime);
  }, [audioStates, handleSeek]);

  // 处理音乐文件选择（用于编辑弹窗）
  const handleEditFileChange = useCallback((file: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setEditingMusic(prev => {
      if (prev?.musicUrl?.startsWith('blob:')) URL.revokeObjectURL(prev.musicUrl);
      return { ...prev, musicUrl: url, musicFile: file };
    });
    // 自动获取时长
    const audio = new Audio(url);
    audio.onloadedmetadata = () => {
      setEditingMusic(prev => prev ? { ...prev, durationSec: Math.round(audio.duration) } : null);
    };
  }, []);

  // 处理音乐文件选择（用于新增弹窗）
  const handleAddFileChange = useCallback((file: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // 自动填充标题
    const fileName = file.name.replace(/\.[^/.]+$/, '');
    setNewMusic(prev => {
      if (prev.musicUrl?.startsWith('blob:')) URL.revokeObjectURL(prev.musicUrl);
      return {
        ...prev,
        title: prev.title || fileName,
        musicUrl: url,
        musicFile: file,
      };
    });
    // 自动获取时长
    const audio = new Audio(url);
    audio.onloadedmetadata = () => {
      setNewMusic(prev => ({
        ...prev,
        durationSec: Math.round(audio.duration),
      }));
    };
  }, []);

  // 打开编辑弹窗
  const openEditModal = useCallback((music: VideoMusic) => {
    setEditingAtmospheres([...(music.atmospheres || [])]);
    setEditingMusic({ ...music, musicFile: null });
    setIsEditModalOpen(true);
  }, []);

  // 编辑保存
  const handleEditSave = useCallback(async () => {
    if (!editingMusic) return;

    try {
      // 如果有新上传的文件，先上传文件
      if (editingMusic.musicFile) {
        const formData = new FormData();
        formData.append('file', editingMusic.musicFile);
        const uploadData = await apiRequest('/video-music/upload', {
          method: 'POST',
          body: formData,
        }) as UploadMusicResponse;
        // 更新音乐信息
        await apiRequest(`/video-music/${editingMusic.id}`, {
          method: 'PATCH',
          body: {
            title: editingMusic.title,
            artist: editingMusic.artist,
            album: editingMusic.album,
            atmospheres: editingAtmospheres,
            durationSec: editingMusic.durationSec,
            musicUrl: uploadData.musicUrl,
          },
        });
      } else {
        // 只更新信息
        await apiRequest(`/video-music/${editingMusic.id}`, {
          method: 'PATCH',
          body: {
            title: editingMusic.title,
            artist: editingMusic.artist,
            album: editingMusic.album,
            atmospheres: editingAtmospheres,
            durationSec: editingMusic.durationSec,
          },
        });
      }

      setIsEditModalOpen(false);
      setEditingMusic(null);
      setEditingAtmospheres([]);
      loadMusicList();
    } catch (error) {
      console.error('保存失败:', error);
    }
  }, [editingMusic, editingAtmospheres, loadMusicList, apiRequest]);

  // 新增保存
  const handleAddSave = useCallback(async () => {
    if (!newMusic.title) return;

    try {
      // 如果有上传的文件，先上传
      if (newMusic.musicFile) {
        const formData = new FormData();
        formData.append('file', newMusic.musicFile);
        const uploadData = await apiRequest('/video-music/upload', {
          method: 'POST',
          body: formData,
        }) as UploadMusicResponse;
        // 更新音乐信息
        await apiRequest(`/video-music/${uploadData.id}`, {
          method: 'PATCH',
          body: {
            title: newMusic.title,
            artist: newMusic.artist,
            album: newMusic.album,
            atmospheres: newMusic.atmospheres,
            durationSec: newMusic.durationSec,
          },
        });
      } else {
        // 直接创建记录（无文件）
        await apiRequest('/video-music', {
          method: 'POST',
          body: {
            title: newMusic.title,
            artist: newMusic.artist,
            album: newMusic.album,
            atmospheres: newMusic.atmospheres,
            durationSec: newMusic.durationSec,
            musicUrl: newMusic.musicUrl,
          },
        });
      }

      setIsAddModalOpen(false);
      setNewMusic({
        title: '',
        album: '',
        artist: '',
        atmospheres: [],
        musicUrl: '',
        localPath: '',
        durationSec: null,
        musicFile: null,
      });
      loadMusicList();
    } catch (error) {
      console.error('新增失败:', error);
    }
  }, [newMusic, loadMusicList, apiRequest]);

  // 删除音乐（打开确认弹窗）
  const openDeleteConfirm = useCallback((id: string, title: string) => {
    setDeleteConfirm({ isOpen: true, id, title });
  }, []);

  // 确认删除
  const handleDeleteConfirm = useCallback(async () => {
    const id = deleteConfirm.id;
    setDeleteConfirm({ isOpen: false, id: '', title: '' });
    try {
      const result = await apiRequest(`/video-music/${id}`, { method: 'DELETE' }) as DeleteMusicResponse;
      if (result.success) {
        loadMusicList();
        setSelectedIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        alert(result.message || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      alert(error instanceof Error ? error.message : '删除失败，请稍后重试');
    }
  }, [deleteConfirm.id, loadMusicList, apiRequest]);

  // 同步视频音乐确认弹窗状态
  const [syncConfirm, setSyncConfirm] = useState(false);

  // 确认同步视频音乐
  const handleSyncConfirm = useCallback(async () => {
    setSyncConfirm(false);
    if (!token) {
      console.error('未登录，无法同步');
      return;
    }
    setIsSyncingMusic(true);
    setSyncResult(null);
    try {
      const data = await apiRequest<{ success: boolean; added: number; skipped: number; message?: string }>('/video-music/sync', {
        method: 'POST',
      });
      if (data.success) {
        setSyncResult({ added: data.added, skipped: data.skipped });
        // 同步完成后刷新列表
        loadMusicList();
      } else {
        console.error('同步失败:', data.message);
      }
    } catch (error) {
      console.error('同步视频音乐失败:', error);
    } finally {
      setIsSyncingMusic(false);
    }
  }, [token, loadMusicList]);

  // 打开批量设置氛围弹窗
  const openBatchAtmosphereModal = useCallback(() => {
    if (selectedIds.size === 0) return;
    setBatchAtmospheres([]);
    setIsBatchAtmosphereModalOpen(true);
  }, [selectedIds.size]);

  // 批量设置氛围
  const handleBatchAtmosphere = useCallback(async () => {
    if (selectedIds.size === 0 || batchAtmospheres.length === 0) return;
    try {
      // 逐个更新选中的音乐
      const updates = [...selectedIds].map(id =>
        apiRequest(`/video-music/${id}`, {
          method: 'PATCH',
          body: { atmospheres: batchAtmospheres },
        })
      );
      await Promise.all(updates);
      setIsBatchAtmosphereModalOpen(false);
      setSelectedIds(new Set());
      setBatchAtmospheres([]);
      loadMusicList();
    } catch (error) {
      console.error('批量设置失败:', error);
    }
  }, [selectedIds, batchAtmospheres, loadMusicList, apiRequest]);

  // 识别音乐氛围
  const handleAnalyzeAtmosphere = useCallback(async () => {
    if (selectedIds.size === 0) {
      alert('请先选择要分析的音乐');
      return;
    }

    setIsAnalyzingAtmosphere(true);
    setAtmosphereResults([]);

    try {
      const data = await apiRequest('/video-music/analyze-atmosphere', {
        method: 'POST',
        body: { musicIds: [...selectedIds] },
      }) as AnalyzeAtmosphereResponse;

      if (data.success) {
        // 获取音乐详情用于显示
        const resultsWithTitle = data.results.map((result: { id: string; atmospheres: string[] }) => {
          const music = musicList.find(m => m.id === result.id);
          return {
            id: result.id,
            title: music?.title || '未知',
            artist: music?.artist ?? undefined,
            atmospheres: result.atmospheres,
          };
        });
        setAtmosphereResults(resultsWithTitle);
        setShowAtmosphereModal(true);
        loadMusicList();
      } else {
        alert('识别失败，请稍后重试');
      }
    } catch (error) {
      console.error('识别氛围失败:', error);
      alert('识别失败，请检查网络或联系管理员');
    } finally {
      setIsAnalyzingAtmosphere(false);
    }
  }, [selectedIds, musicList, apiRequest, loadMusicList]);

  // 切换氛围选择
  const toggleAtmosphere = useCallback((atmosphere: string, currentAtmospheres: string[], setAtmospheres: (atmospheres: string[]) => void) => {
    if (currentAtmospheres.includes(atmosphere)) {
      setAtmospheres(currentAtmospheres.filter(a => a !== atmosphere));
    } else {
      setAtmospheres([...currentAtmospheres, atmosphere]);
    }
  }, []);

  // 格式化时长
  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 格式化日期
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('zh-CN');
  };

  // 多选氛围组件
  const AtmosphereMultiSelect: React.FC<{
    selected: string[];
    onChange: (atmospheres: string[]) => void;
  }> = ({ selected, onChange }) => (
    <div className="flex flex-wrap gap-2">
      {ALLOWED_ATMOSPHERES.map((atmosphere) => (
        <button
          key={atmosphere}
          type="button"
          onClick={() => toggleAtmosphere(atmosphere, selected, onChange)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
            selected.includes(atmosphere)
              ? 'bg-primary text-white'
              : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
          }`}
        >
          {atmosphere}
        </button>
      ))}
    </div>
  );

  // 音乐文件上传区域组件
  const MusicFileUpload: React.FC<{
    musicUrl: string | null;
    durationSec: number | null;
    onFileChange: (file: File | null) => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    audioRef: React.RefObject<HTMLAudioElement | null>;
    disabled?: boolean;
  }> = ({ musicUrl, durationSec, onFileChange, fileInputRef, audioRef, disabled }) => (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-text-secondary mb-1">音乐文件</label>
      <div className="flex items-center gap-3">
        <label className={`flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-gray-300 text-sm cursor-pointer transition-colors ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary hover:text-primary'
        }`}>
          <span className="material-icons-round text-lg">upload_file</span>
          选择音乐文件
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            disabled={disabled}
            onChange={(e) => onFileChange(e.target.files?.[0] || null)}
          />
        </label>
        {musicUrl && (
          <>
            <button
              type="button"
              onClick={() => {
                if (audioRef.current) {
                  if (audioRef.current.paused) {
                    audioRef.current.play();
                  } else {
                    audioRef.current.pause();
                  }
                }
              }}
              className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <span className="material-icons-round text-primary">play_arrow</span>
            </button>
            <audio ref={audioRef} src={musicUrl} preload="metadata" />
          </>
        )}
      </div>
      {durationSec && (
        <p className="text-sm text-text-muted">
          时长: {formatDuration(durationSec)}
        </p>
      )}
    </div>
  );

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden bg-[#FDFBF7] relative">
        {/* 同步结果提示 */}
        {syncResult && (
          <div className="absolute top-2 right-4 z-10 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
            同步完成：新增 {syncResult.added} 首，跳过 {syncResult.skipped} 首
          </div>
        )}
        {/* 头部 */}
        <header className="px-6 py-4 border-b border-gray-100 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-text-primary">视频音乐管理</h1>
              <p className="text-sm text-text-secondary mt-1">共 {total} 首音乐</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSyncConfirm(true)}
                disabled={isSyncingMusic}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium transition-all hover:border-primary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-icons-round text-lg">
                  {isSyncingMusic ? 'sync' : 'cloud_download'}
                </span>
                {isSyncingMusic ? '同步中...' : '同步视频音乐'}
              </button>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
              >
                <span className="material-icons-round text-lg">add</span>
                新增音乐
              </button>
            </div>
          </div>
        </header>

        {/* 搜索和筛选 */}
        <div className="px-6 py-4 bg-white border-b border-gray-100">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px] max-w-md relative">
              <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                search
              </span>
              <input
                type="text"
                placeholder="搜索音乐标题、艺术家、专辑..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') loadMusicList(); }}
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
            <button
              onClick={loadMusicList}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-text-secondary hover:border-primary hover:text-primary transition-colors"
              title="刷新数据"
            >
              <span className="material-icons-round text-lg">refresh</span>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-secondary">氛围筛选:</span>
              <select
                value={atmosphereFilter}
                onChange={(e) => setAtmosphereFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              >
                <option value="">全部</option>
                {ALLOWED_ATMOSPHERES.map((atmosphere) => (
                  <option key={atmosphere} value={atmosphere}>{atmosphere}</option>
                ))}
              </select>
            </div>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-secondary">已选 {selectedIds.size} 首</span>
                <button
                  onClick={openBatchAtmosphereModal}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm hover:border-primary hover:text-primary transition-colors"
                >
                  批量设置氛围
                </button>
                <button
                  onClick={handleAnalyzeAtmosphere}
                  disabled={isAnalyzingAtmosphere}
                  className="px-3 py-2 rounded-lg border border-primary text-primary text-sm hover:bg-primary-light transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  {isAnalyzingAtmosphere ? (
                    <>
                      <span className="material-icons-round text-sm animate-spin">sync</span>
                      AI分析中...
                    </>
                  ) : (
                    <>
                      <span className="material-icons-round text-sm">auto_awesome</span>
                      识别音乐氛围
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 音乐列表 */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <span className="material-icons-round animate-spin text-primary text-4xl">sync</span>
            </div>
          ) : musicList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-text-muted">
              <span className="material-icons-round text-6xl mb-4">library_music</span>
              <p>暂无音乐数据</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === musicList.length && musicList.length > 0}
                        onChange={() => {
                          if (selectedIds.size === musicList.length) {
                            setSelectedIds(new Set());
                          } else {
                            setSelectedIds(new Set(musicList.map(m => m.id)));
                          }
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      标题
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      艺术家
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      专辑
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      氛围
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      时长
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                      创建时间
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-text-secondary uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {musicList.map((music) => (
                    <tr key={music.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(music.id)}
                          onChange={() => {
                            setSelectedIds(prev => {
                              const next = new Set(prev);
                              if (next.has(music.id)) {
                                next.delete(music.id);
                              } else {
                                next.add(music.id);
                              }
                              return next;
                            });
                          }}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {music.coverUrl ? (
                            <img src={getOssThumbnailUrl(music.coverUrl, 80)} alt="" className="w-10 h-10 rounded-lg object-cover" loading="lazy" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center">
                              <span className="material-icons-round text-gray-400">music_note</span>
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-text-primary">{music.title}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        {music.artist || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        {music.album || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        <div className="flex flex-wrap gap-1">
                          {music.atmospheres && music.atmospheres.length > 0 ? (
                            music.atmospheres.map((atmosphere, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-primary-light text-primary text-xs rounded-full">
                                {atmosphere}
                              </span>
                            ))
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        {formatDuration(music.durationSec)}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        {formatDate(music.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {music.musicUrl && (
                            <div className="flex items-center gap-2">
                              {/* 进度条 - 一直显示 */}
                              <AudioProgress
                                audioState={audioStates.get(music.id)}
                                music={music}
                                onPlayToggle={togglePlayMusic}
                                onSeek={handleSeek}
                              />
                            </div>
                          )}
                          <button
                            onClick={() => openEditModal(music)}
                            className="p-2 rounded-lg text-gray-400 hover:text-primary hover:bg-primary-light transition-colors"
                            title="编辑"
                          >
                            <span className="material-icons-round">edit</span>
                          </button>
                          <button
                            onClick={() => openDeleteConfirm(music.id, music.title)}
                            className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="删除"
                          >
                            <span className="material-icons-round">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 编辑弹窗 */}
        {isEditModalOpen && editingMusic && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white">
                <h3 className="text-lg font-bold text-text-primary">编辑音乐</h3>
                <button
                  onClick={() => { setIsEditModalOpen(false); setEditingMusic(null); setEditingAtmospheres([]); }}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                >
                  <span className="material-icons-round">close</span>
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">标题 *</label>
                  <input
                    type="text"
                    value={editingMusic.title || ''}
                    onChange={(e) => setEditingMusic({ ...editingMusic, title: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">艺术家</label>
                  <input
                    type="text"
                    value={editingMusic.artist || ''}
                    onChange={(e) => setEditingMusic({ ...editingMusic, artist: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">专辑</label>
                  <input
                    type="text"
                    value={editingMusic.album || ''}
                    onChange={(e) => setEditingMusic({ ...editingMusic, album: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">时长（秒）</label>
                  <input
                    type="number"
                    value={editingMusic.durationSec || ''}
                    onChange={(e) => setEditingMusic({ ...editingMusic, durationSec: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    placeholder="自动获取或手动输入"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">氛围标签（可多选）</label>
                  <AtmosphereMultiSelect selected={editingAtmospheres} onChange={setEditingAtmospheres} />
                </div>
                <MusicFileUpload
                  musicUrl={editingMusic.musicUrl || null}
                  durationSec={editingMusic.durationSec || null}
                  onFileChange={handleEditFileChange}
                  fileInputRef={editFileInputRef}
                  audioRef={editAudioRef}
                />
              </div>
              <div className="flex justify-end gap-3 px-4 py-3 border-t border-gray-100 sticky bottom-0 bg-white">
                <button
                  onClick={() => { setIsEditModalOpen(false); setEditingMusic(null); setEditingAtmospheres([]); }}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:border-primary hover:text-primary transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleEditSave}
                  disabled={!editingMusic.title}
                  className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 新增弹窗 */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white">
                <h3 className="text-lg font-bold text-text-primary">新增音乐</h3>
                <button
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setNewMusic({
                      title: '',
                      album: '',
                      artist: '',
                      atmospheres: [],
                      musicUrl: '',
                      localPath: '',
                      durationSec: null,
                      musicFile: null,
                    });
                  }}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                >
                  <span className="material-icons-round">close</span>
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">标题 *</label>
                  <input
                    type="text"
                    value={newMusic.title}
                    onChange={(e) => setNewMusic({ ...newMusic, title: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    placeholder="请输入音乐标题"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">艺术家</label>
                  <input
                    type="text"
                    value={newMusic.artist}
                    onChange={(e) => setNewMusic({ ...newMusic, artist: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">专辑</label>
                  <input
                    type="text"
                    value={newMusic.album}
                    onChange={(e) => setNewMusic({ ...newMusic, album: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">时长（秒）</label>
                  <input
                    type="number"
                    value={newMusic.durationSec || ''}
                    onChange={(e) => setNewMusic({ ...newMusic, durationSec: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    placeholder="上传文件后自动获取"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">氛围标签（可多选）</label>
                  <AtmosphereMultiSelect selected={newMusic.atmospheres} onChange={(atmospheres) => setNewMusic({ ...newMusic, atmospheres })} />
                </div>
                <MusicFileUpload
                  musicUrl={newMusic.musicUrl || null}
                  durationSec={newMusic.durationSec || null}
                  onFileChange={handleAddFileChange}
                  fileInputRef={addFileInputRef}
                  audioRef={addAudioRef}
                />
              </div>
              <div className="flex justify-end gap-3 px-4 py-3 border-t border-gray-100 sticky bottom-0 bg-white">
                <button
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setNewMusic({
                      title: '',
                      album: '',
                      artist: '',
                      atmospheres: [],
                      musicUrl: '',
                      localPath: '',
                      durationSec: null,
                      musicFile: null,
                    });
                  }}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:border-primary hover:text-primary transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleAddSave}
                  disabled={!newMusic.title}
                  className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 批量设置氛围弹窗 */}
        {isBatchAtmosphereModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="text-lg font-bold text-text-primary">批量设置氛围</h3>
                <button
                  onClick={() => { setIsBatchAtmosphereModalOpen(false); setBatchAtmospheres([]); }}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                >
                  <span className="material-icons-round">close</span>
                </button>
              </div>
              <div className="p-4 space-y-4">
                <p className="text-sm text-text-secondary">
                  已选择 <span className="font-medium text-text-primary">{selectedIds.size}</span> 首音乐
                </p>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">选择氛围（可多选）</label>
                  <AtmosphereMultiSelect selected={batchAtmospheres} onChange={setBatchAtmospheres} />
                </div>
              </div>
              <div className="flex justify-end gap-3 px-4 py-3 border-t border-gray-100">
                <button
                  onClick={() => { setIsBatchAtmosphereModalOpen(false); setBatchAtmospheres([]); }}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:border-primary hover:text-primary transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleBatchAtmosphere}
                  disabled={batchAtmospheres.length === 0}
                  className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 氛围识别结果弹窗 */}
        {showAtmosphereModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                  <span className="material-icons-round text-primary">auto_awesome</span>
                  音乐氛围识别结果
                </h3>
                <button
                  onClick={() => { setShowAtmosphereModal(false); setAtmosphereResults([]); }}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                >
                  <span className="material-icons-round">close</span>
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1">
                {atmosphereResults.length === 0 ? (
                  <div className="text-center text-text-muted py-8">
                    <span className="material-icons-round text-4xl mb-2">music_off</span>
                    <p>暂无识别结果</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {atmosphereResults.map((result, index) => (
                      <div key={index} className="p-4 rounded-xl border border-gray-100 bg-gray-50">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-text-primary">{result.title}</p>
                            {result.artist && (
                              <p className="text-sm text-text-secondary mt-0.5">{result.artist}</p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5 ml-4">
                            {(result.atmospheres ?? []).length > 0 ? (
                              (result.atmospheres ?? []).map((atm, i) => (
                                <span
                                  key={i}
                                  className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary"
                                >
                                  {atm}
                                </span>
                              ))
                            ) : (
                              <span className="text-sm text-text-muted">未能识别</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 px-4 py-3 border-t border-gray-100">
                <button
                  onClick={() => { setShowAtmosphereModal(false); setAtmosphereResults([]); }}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:border-primary hover:text-primary transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 删除确认弹窗 */}
        <ConfirmDialog
          isOpen={deleteConfirm.isOpen}
          title="删除音乐"
          message={`确定要删除「${deleteConfirm.title}」吗？删除后无法恢复。`}
          confirmText="删除"
          cancelText="取消"
          variant="danger"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteConfirm({ isOpen: false, id: '', title: '' })}
        />

        {/* 同步视频音乐确认弹窗 */}
        <ConfirmDialog
          isOpen={syncConfirm}
          title="同步视频音乐"
          message="只会更新视频，不会覆盖旧的视频，确认后继续"
          confirmText="确认同步"
          cancelText="取消"
          variant="default"
          onConfirm={handleSyncConfirm}
          onCancel={() => setSyncConfirm(false)}
        />
      </div>
    </>
  );
};

export default VideoMusicManagement;