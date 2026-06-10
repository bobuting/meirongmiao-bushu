/**
 * 通用音乐推荐面板
 * 从 Step5MusicRecommendationPanel 抽取，供 Step4 / Step5 共用。
 * 外层容器样式由 className 控制，文案通过 props 参数化。
 */

import React from "react";
import { Button } from "../../components/ui/Button";
import type { VideoMusicDto, VideoMusicMatchResultDto } from "../../services/backendApi.videoMusic";

export interface MusicRecommendationPanelProps {
  /** 音乐功能是否开启，null 表示尚未加载 */
  enabled: boolean | null;
  /** 是否正在首次加载推荐 */
  isLoading: boolean;
  /** 是否正在手动刷新推荐 */
  isRefreshing: boolean;
  /** 当前推荐结果 */
  recommendation: VideoMusicMatchResultDto | null;
  /** 已选音乐 ID */
  selectedMusicId: string | null;
  /** 选中音乐 */
  onSelectMusic: (musicId: string) => void;
  /** 清除选择 */
  onClearSelection: () => void;
  /** 刷新推荐 */
  onRefresh: () => void;
  /** 打开音乐库 */
  onOpenMusicLibrary: () => void;
  /** 外层容器 className */
  className?: string;
  /** 面板标题，默认"自动匹配音乐" */
  title?: string;
  /** 面板描述文案 */
  description?: string;
  /** 音乐功能关闭时的提示文案 */
  disabledHint?: string;
  /** 加载中文案 */
  loadingText?: string;
  /** 空状态文案 */
  emptyText?: string;
}

function renderMusicMeta(music: VideoMusicDto): string {
  return [music.artist, music.album].filter((item) => item && item.trim().length > 0).join(" · ");
}

function renderPreviewPlayer(musicUrl: string, label: string): React.ReactNode {
  if (!musicUrl.trim()) {
    return null;
  }
  return (
    <div className="mt-3 rounded-2xl border border-gray-200 bg-white/80 px-3 py-2">
      <div className="mb-2 text-[11px] font-semibold text-gray-500">{label}</div>
      <audio controls preload="none" className="h-10 w-full">
        <source src={musicUrl} />
      </audio>
    </div>
  );
}

export const MusicRecommendationPanel: React.FC<MusicRecommendationPanelProps> = ({
  enabled,
  isLoading,
  isRefreshing,
  recommendation,
  selectedMusicId,
  onSelectMusic,
  onClearSelection,
  onRefresh,
  onOpenMusicLibrary,
  className = "",
  title = "自动匹配音乐",
  description,
  disabledHint = "音乐功能已关闭，请联系管理员开启。",
  loadingText = "正在分析脚本氛围并匹配音乐…",
  emptyText = "当前还没有拿到匹配结果，可以点击「重新匹配」发起一次音乐推荐。",
}) => {
  // 从推荐结果中获取候选列表（首选音乐 + 其他候选）
  const candidates: VideoMusicDto[] = [
    ...(recommendation?.music ? [recommendation.music] : []),
    ...(recommendation?.candidates ?? []),
  ];
  if (enabled === false) {
    return (
      <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-5">
        <p className="text-sm font-bold text-amber-800">音乐功能已关闭</p>
        <p className="mt-1 text-xs text-amber-700">{disabledHint}</p>
      </div>
    );
  }

  return (
    <div className={className || undefined}>
      {/* 标题与操作按钮 */}
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-base font-bold text-gray-800">{title}</p>
          {description ? <p className="mt-1 text-xs leading-6 text-gray-500">{description}</p> : null}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={onClearSelection}
            className={`rounded-2xl px-3 py-2 text-xs font-semibold transition-all ${
              selectedMusicId
                ? "border border-gray-200 bg-white text-gray-600 hover:border-primary/40 hover:text-primary"
                : "bg-stone-900 text-white shadow-lg shadow-stone-900/15"
            }`}
          >
            本次不选
          </button>
          <button
            type="button"
            onClick={onOpenMusicLibrary}
            className="rounded-2xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:border-primary/40 hover:text-primary"
          >
            打开音乐库
          </button>
          <Button
            onClick={onRefresh}
            className="rounded-2xl px-3 py-2 text-xs font-bold"
            disabled={isRefreshing || isLoading}
          >
            {isRefreshing ? "匹配中" : "重新匹配"}
          </Button>
        </div>
      </div>

      {/* 推荐结果区 */}
      <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50/60 px-4 py-4">
        {isLoading ? (
          <p className="text-sm text-gray-500">{loadingText}</p>
        ) : recommendation?.music ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-bold text-gray-900 truncate">{recommendation.music.title}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {renderMusicMeta(recommendation.music) || "系统音乐库"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSelectMusic(recommendation.music!.id)}
                className={`shrink-0 rounded-2xl px-3 py-2 text-xs font-bold transition-all ${
                  selectedMusicId === recommendation.music.id
                    ? "bg-primary text-white shadow-lg shadow-primary/20"
                    : "border border-gray-200 bg-white text-gray-600 hover:border-primary/40 hover:text-primary"
                }`}
              >
                {selectedMusicId === recommendation.music.id ? "当前使用" : "使用这首"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(recommendation.music.atmospheres ?? []).map((atmosphere) => (
                <span key={atmosphere} className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
                  #{atmosphere}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-gray-500">
              当前匹配氛围：
              <span className="ml-1 font-semibold text-gray-700">{recommendation.matchedAtmosphere ?? "未命中，已兜底"}</span>
              {recommendation.usedDefault ? <span className="ml-2 text-amber-600">已使用默认回退</span> : null}
            </p>
            {renderPreviewPlayer(recommendation.music.musicUrl, "试听推荐音乐")}
          </>
        ) : (
          <p className="text-sm text-gray-500">{emptyText}</p>
        )}
      </div>

      {/* 候选音乐列表 */}
      {candidates.length > 1 ? (
        <div className="mt-4 grid gap-3">
          {candidates.slice(1).map((music, index) => {
            const selected = selectedMusicId === music.id;
            const isFirstCandidate = index === 0;
            return (
              <div
                key={music.id}
                className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                  selected
                    ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
                    : "border-gray-200 bg-white hover:border-primary/40"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {music.title}
                      {isFirstCandidate ? <span className="ml-2 text-primary">推荐</span> : null}
                    </p>
                    <p className="mt-1 text-[11px] text-gray-500">{renderMusicMeta(music) || "系统音乐库"}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectMusic(music.id)}
                    className={`shrink-0 rounded-2xl px-3 py-2 text-xs font-bold transition-all ${
                      selected
                        ? "bg-primary text-white shadow-lg shadow-primary/20"
                        : "border border-gray-200 bg-white text-gray-600 hover:border-primary/40 hover:text-primary"
                    }`}
                  >
                    {selected ? "当前使用" : "使用这首"}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(music.atmospheres ?? []).map((atmosphere) => (
                    <span key={atmosphere} className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-600">
                      {atmosphere}
                    </span>
                  ))}
                </div>
                {renderPreviewPlayer(music.musicUrl, selected ? "当前选中音乐试听" : "先试听再决定")}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
