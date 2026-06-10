import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { request } from '../../services/backendApi.request';
import {
  getVideoMetadata,
  generateVideoThumbnail,
  formatDuration,
  formatFileSize,
  generateId,
  getTransitionOptions,
  randomizeTransition,
  VideoMetadata,
} from '../../utils/videoMergeUtils';
import {
  mergeVideosWithTransitions,
  checkVideoMergeSupport,
} from '../../libs/video-merge';
import { TransitionPreviewModal } from './TransitionPreviewModal';

interface VideoItem {
  id: string;
  file: File;
  url: string;
  name: string;
  duration: number;
  width: number;
  height: number;
  thumbnail: string;
  selected: boolean;
}

interface MergeProgress {
  stage: 'idle' | 'loading' | 'processing' | 'done' | 'error';
  percent: number;
  message: string;
}

export const VideoMerge: React.FC = () => {
  const token = useAppStore((state) => state.token);
  const [videoList, setVideoList] = useState<VideoItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<MergeProgress>({
    stage: 'idle',
    percent: 0,
    message: '',
  });

  // 视频热榜解析状态
  const [isTriggeringParse, setIsTriggeringParse] = useState(false);
  const [parseResult, setParseResult] = useState<{
    triggered: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  // 浏览器兼容性检查
  const [browserSupport, setBrowserSupport] = useState<{
    supported: boolean;
    reason?: string;
  } | null>(null);

  // 转场选项（从转场管理器获取）
  const [transitionOptions, setTransitionOptions] = useState<Array<{ label: string; value: string }>>([]);

  useEffect(() => {
    checkVideoMergeSupport().then(setBrowserSupport);
    // 初始化转场选项
    setTransitionOptions(getTransitionOptions());
  }, []);

  // 转场设置（FreeCut 帧数模式）
  const [selectedTransition, setSelectedTransition] = useState('fade');
  const [transitionDurationFrames, setTransitionDurationFrames] = useState(15); // 帧数，默认15帧=0.5秒@30fps
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  // 随机选择转场效果
  const handleRandomizeTransition = useCallback(() => {
    setSelectedTransition(randomizeTransition());
  }, []);

  // 音频设置
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioName, setAudioName] = useState('');

  // 输出视频
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // 选中的视频列表
  const selectedVideos = useMemo(
    () => videoList.filter((v) => v.selected),
    [videoList]
  );

  // 是否可以合并
  const canMerge = selectedVideos.length >= 1 && !isProcessing;

  // 处理文件上传
  const handleFileUpload = useCallback(
    async (files: FileList | null) => {
      if (!files) return;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('video/')) continue;

        try {
          const [metadata, thumbnail] = await Promise.all([
            getVideoMetadata(file),
            generateVideoThumbnail(file),
          ]);

          const newItem: VideoItem = {
            id: generateId(),
            file,
            url: URL.createObjectURL(file),
            name: file.name,
            duration: metadata.duration,
            width: metadata.width,
            height: metadata.height,
            thumbnail,
            selected: true,
          };

          setVideoList((prev) => [...prev, newItem]);
        } catch (error) {
          console.error('处理视频文件失败:', error);
        }
      }
    },
    []
  );

  // 拖拽上传
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handleFileUpload(e.dataTransfer.files);
    },
    [handleFileUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // 切换视频选择状态
  const toggleSelection = useCallback((id: string) => {
    setVideoList((prev) =>
      prev.map((v) => (v.id === id ? { ...v, selected: !v.selected } : v))
    );
  }, []);

  // 删除视频
  const removeVideo = useCallback((id: string) => {
    setVideoList((prev) => {
      const item = prev.find((v) => v.id === id);
      if (item) {
        URL.revokeObjectURL(item.url);
      }
      return prev.filter((v) => v.id !== id);
    });
  }, []);

  // 清空所有视频
  const clearAllVideos = useCallback(() => {
    videoList.forEach((v) => URL.revokeObjectURL(v.url));
    setVideoList([]);
  }, [videoList]);

  // 全选/取消全选
  const toggleAllSelection = useCallback(() => {
    const allSelected = videoList.every((v) => v.selected);
    setVideoList((prev) => prev.map((v) => ({ ...v, selected: !allSelected })));
  }, [videoList]);

  // 处理音频文件上传
  const handleAudioUpload = useCallback((file: File | null) => {
    if (!file || !file.type.startsWith('audio/')) return;

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }

    setAudioFile(file);
    setAudioUrl(URL.createObjectURL(file));
    setAudioName(file.name);
  }, [audioUrl]);

  // 移除音频
  const removeAudio = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioFile(null);
    setAudioUrl(null);
    setAudioName('');
  }, [audioUrl]);

  // 合并视频
  const mergeVideos = useCallback(async () => {
    if (selectedVideos.length === 0) return;

    // 检查浏览器支持（使用之前检测的结果）
    if (browserSupport && !browserSupport.supported) {
      setProgress({
        stage: 'error',
        percent: 0,
        message: browserSupport.reason || '浏览器不支持',
      });
      return;
    }

    setIsProcessing(true);
    setOutputUrl(null);
    setProgress({ stage: 'loading', percent: 0, message: '准备处理...' });

    try {
      const result = await mergeVideosWithTransitions({
        videos: selectedVideos.map((v) => v.file),
        transitionType: selectedTransition,
        transitionDurationFrames: transitionDurationFrames,
        fps: 30,  // FreeCut 标准帧率
        backgroundAudio: audioFile ? { source: audioFile } : undefined,
        onProgress: (percent, message) => {
          setProgress({
            stage: percent >= 100 ? 'done' : 'processing',
            percent,
            message,
          });
        },
      });

      setOutputUrl(result.url);
      setProgress({ stage: 'done', percent: 100, message: '合并完成！' });
      setShowPreview(true);
    } catch (error) {
      console.error('合并视频失败:', error);
      setProgress({
        stage: 'error',
        percent: 0,
        message: `合并失败: ${error instanceof Error ? error.message : '请重试'}`,
      });
    } finally {
      setIsProcessing(false);
    }
  }, [selectedVideos, selectedTransition, transitionDurationFrames, audioFile, browserSupport]);

  // 下载输出视频
  const downloadOutput = useCallback(() => {
    if (!outputUrl) return;

    const a = document.createElement('a');
    a.href = outputUrl;
    a.download = `merged_video_${Date.now()}.mp4`;
    a.click();
  }, [outputUrl]);

  // 重置
  const reset = useCallback(() => {
    videoList.forEach((v) => URL.revokeObjectURL(v.url));
    setVideoList([]);
    if (outputUrl) {
      URL.revokeObjectURL(outputUrl);
    }
    setOutputUrl(null);
    setProgress({ stage: 'idle', percent: 0, message: '' });
  }, [videoList, outputUrl]);

  // 触发视频热榜解析
  const triggerVideoReverseParse = useCallback(async (limit: number = 10) => {
    if (!token) {
      alert('请先登录');
      return;
    }

    setIsTriggeringParse(true);
    setParseResult(null);

    try {
      const data = await request<{ success: boolean; data?: unknown; error?: string }>(
        'POST',
        '/admin/video-reverse-skill/trigger',
        { body: { limit } }
      );

      if (data.success) {
        setParseResult(data.data as { triggered: number; skipped: number; errors: string[] });
      } else {
        alert(`触发失败: ${data.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('触发视频解析失败:', error);
      alert(`触发失败: ${error instanceof Error ? error.message : '网络错误'}`);
    } finally {
      setIsTriggeringParse(false);
    }
  }, [token]);

  // 清理资源
  useEffect(() => {
    return () => {
      videoList.forEach((v) => URL.revokeObjectURL(v.url));
      if (outputUrl) URL.revokeObjectURL(outputUrl);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, []);

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden bg-[#FDFBF7]">
        {/* 头部标题 */}
        <header className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white">
          <h1 className="text-xl md:text-2xl font-bold text-text-primary font-display">
            视频合并
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            上传多个视频，选择转场效果，合并为一个视频
          </p>
        </header>

        {/* 浏览器兼容性提示 */}
        {browserSupport && !browserSupport.supported && (
          <div className="mx-4 md:mx-6 mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
            <div className="flex items-start gap-3">
              <span className="material-icons-round text-yellow-500">warning</span>
              <div>
                <p className="text-sm font-medium text-yellow-800">浏览器不支持</p>
                <p className="text-sm text-yellow-600 mt-1">{browserSupport.reason}</p>
              </div>
            </div>
          </div>
        )}

        {/* 主要内容区域 */}
        <div className="flex-1 flex flex-col lg:flex-row gap-4 md:gap-6 p-4 md:p-6 overflow-hidden">
          {/* 左侧：上传和视频列表 */}
          <div className="flex-1 lg:flex-[2] flex flex-col gap-4 overflow-hidden">
            {/* 上传区域 */}
            <div
              className="relative border-2 border-dashed border-gray-200 rounded-2xl bg-white transition-all duration-300 hover:border-primary hover:bg-primary-light/30 cursor-pointer group"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => {
                if (!isProcessing) {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.multiple = true;
                  input.accept = 'video/mp4,video/*';
                  input.onchange = (e) =>
                    handleFileUpload((e.target as HTMLInputElement).files);
                  input.click();
                }
              }}
            >
              <div className="flex flex-col items-center justify-center py-8 md:py-12 px-4">
                <span className="material-icons-round text-4xl md:text-5xl text-gray-400 group-hover:text-primary transition-colors">
                  video_call
                </span>
                <p className="mt-3 text-sm md:text-base font-medium text-text-primary">
                  点击或拖拽上传视频
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  支持 MP4、WebM 等格式
                </p>
              </div>
            </div>

            {/* 视频列表 */}
            <div className="flex-1 flex flex-col bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-bold text-text-primary">
                  视频列表 ({videoList.length})
                </span>
                <div className="flex items-center gap-2">
                  {videoList.length > 0 && (
                    <>
                      <button
                        onClick={toggleAllSelection}
                        disabled={isProcessing}
                        className="text-xs font-medium text-primary hover:text-primary-hover disabled:opacity-50 transition-colors"
                      >
                        {videoList.every((v) => v.selected) ? '取消全选' : '全选'}
                      </button>
                      <button
                        onClick={clearAllVideos}
                        disabled={isProcessing}
                        className="text-xs font-medium text-red-500 hover:text-red-600 disabled:opacity-50 transition-colors"
                      >
                        清空列表
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {videoList.length > 0 ? (
                  <div className="space-y-2">
                    {videoList.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3 p-3 rounded-xl bg-gray-50 border-2 transition-all cursor-pointer ${
                          item.selected
                            ? 'border-primary bg-primary-light/20'
                            : 'border-transparent hover:border-gray-200'
                        }`}
                        onClick={() => toggleSelection(item.id)}
                      >
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => toggleSelection(item.id)}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <img
                          src={item.thumbnail}
                          alt={item.name}
                          className="w-20 h-12 object-cover rounded-lg flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {item.name}
                          </p>
                          <p className="text-xs text-text-muted mt-0.5">
                            {formatDuration(item.duration)} · {item.width}x
                            {item.height} · {formatFileSize(item.file.size)}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeVideo(item.id);
                          }}
                          disabled={isProcessing}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-50"
                        >
                          <span className="material-icons-round text-lg">
                            delete_outline
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-text-muted text-sm">
                    暂无视频，请上传
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 右侧：转场设置和操作 */}
          <div className="lg:w-80 flex flex-col gap-4">

            {/* 背景音乐 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-icons-round text-primary">music_note</span>
                <span className="text-sm font-bold text-text-primary">背景音乐</span>
              </div>
              <div className="flex flex-col gap-2">
                <label
                  className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium transition-all cursor-pointer ${
                    isProcessing
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:border-primary hover:text-primary'
                  }`}
                >
                  <span className="material-icons-round text-lg">upload_file</span>
                  上传音频
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    disabled={isProcessing}
                    onChange={(e) =>
                      handleAudioUpload(e.target.files?.[0] ?? null)
                    }
                  />
                </label>
                {audioFile ? (
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                    <span className="text-sm text-text-secondary truncate flex-1 mr-2">
                      {audioName}
                    </span>
                    <button
                      onClick={removeAudio}
                      disabled={isProcessing}
                      className="text-xs text-red-500 hover:text-red-600"
                    >
                      移除
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-text-muted text-center">
                    不上传则无背景音乐
                  </p>
                )}
              </div>
            </div>

      

            {/* 转场设置 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-icons-round text-primary">
                  auto_awesome
                </span>
                <span className="text-sm font-bold text-text-primary">转场设置</span>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-text-secondary">
                      转场效果
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleRandomizeTransition}
                        disabled={isProcessing}
                        className="text-xs text-primary hover:text-primary-hover disabled:opacity-50 transition-colors"
                      >
                        随机选择
                      </button>
                      <button
                        onClick={() => setPreviewModalOpen(true)}
                        disabled={isProcessing}
                        className="flex items-center gap-1 text-xs text-primary hover:text-primary-hover disabled:opacity-50 transition-colors"
                        title="预览所有转场"
                      >
                        <span className="material-icons-round text-sm">visibility</span>
                        预览全部
                      </button>
                    </div>
                  </div>
                  <select
                    value={selectedTransition}
                    onChange={(e) => setSelectedTransition(e.target.value)}
                    disabled={isProcessing}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none disabled:opacity-50"
                  >
                    {transitionOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    转场时长: {transitionDurationFrames}帧 ({(transitionDurationFrames / 30).toFixed(2)}s @ 30fps)
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="60"
                    step="1"
                    value={transitionDurationFrames}
                    onChange={(e) =>
                      setTransitionDurationFrames(Number(e.target.value))
                    }
                    disabled={isProcessing}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50"
                  />
                  <div className="flex justify-between text-xs text-text-muted mt-1">
                    <span>5帧 (0.17s)</span>
                    <span>60帧 (2.0s)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 视频热榜解析 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-icons-round text-primary">analytics</span>
                <span className="text-sm font-bold text-text-primary">视频热榜解析</span>
              </div>
              <p className="text-xs text-text-muted mb-3">
                从热榜获取视频并进行分镜解析
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => triggerVideoReverseParse(1)}
                  disabled={isTriggeringParse}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-primary text-primary text-sm font-medium hover:bg-primary-light transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-icons-round text-lg">
                    {isTriggeringParse ? 'hourglass_top' : 'play_arrow'}
                  </span>
                  {isTriggeringParse ? '解析中...' : '触发解析 (1条)'}
                </button>
                {parseResult && (
                  <div className="mt-2 p-3 bg-gray-50 rounded-xl text-xs">
                    <div className="flex items-center gap-2 text-green-600 mb-1">
                      <span className="material-icons-round text-sm">check_circle</span>
                      <span>解析完成</span>
                    </div>
                    <div className="text-text-secondary space-y-1">
                      <p>触发: {parseResult.triggered} 条</p>
                      <p>跳过: {parseResult.skipped} 条</p>
                      {parseResult.errors.length > 0 && (
                        <p className="text-red-500">错误: {parseResult.errors.length} 条</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex flex-col gap-3">
              <button
                onClick={mergeVideos}
                disabled={!canMerge}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-primary text-white font-bold text-sm shadow-button transition-all hover:shadow-accent-lg hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-button"
              >
                <span className="material-icons-round text-lg">
                  {isProcessing ? 'hourglass_top' : 'merge_type'}
                </span>
                {isProcessing ? '处理中...' : '合并视频'}
              </button>

              {outputUrl && (
                <button
                  onClick={downloadOutput}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm transition-all hover:-translate-y-0.5"
                >
                  <span className="material-icons-round text-lg">download</span>
                  下载视频
                </button>
              )}

              {videoList.length > 0 && (
                <button
                  onClick={reset}
                  disabled={isProcessing}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 text-text-primary font-medium text-sm transition-all hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  <span className="material-icons-round text-lg">refresh</span>
                  重置
                </button>
              )}
            </div>

            {/* 进度显示 */}
            {(isProcessing || progress.stage === 'done') && (
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="mb-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      progress.stage === 'done'
                        ? 'bg-emerald-500'
                        : 'bg-gradient-primary'
                    }`}
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <p className="text-sm text-text-secondary text-center">
                  {progress.message}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 预览弹窗 */}
        {showPreview && outputUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="text-lg font-bold text-text-primary">
                  预览合并结果
                </h3>
                <button
                  onClick={() => setShowPreview(false)}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <span className="material-icons-round">close</span>
                </button>
              </div>
              <div className="p-4">
                <video
                  src={outputUrl}
                  controls
                  className="w-full rounded-xl bg-black"
                  style={{ maxHeight: '60vh' }}
                />
                <div className="flex justify-end gap-3 mt-4">
                  <button
                    onClick={() => setShowPreview(false)}
                    className="px-4 py-2 rounded-lg border border-gray-200 text-text-primary font-medium text-sm hover:border-primary hover:text-primary transition-colors"
                  >
                    关闭
                  </button>
                  <button
                    onClick={downloadOutput}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-medium text-sm hover:bg-primary-hover transition-colors"
                  >
                    <span className="material-icons-round text-lg">download</span>
                    下载视频
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 转场效果预览弹窗 */}
        <TransitionPreviewModal
          open={previewModalOpen}
          onClose={() => setPreviewModalOpen(false)}
          onSelect={(name) => setSelectedTransition(name)}
          selectedName={selectedTransition}
        />
      </div>
    </>
  );
};