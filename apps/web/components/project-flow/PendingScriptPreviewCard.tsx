import { useState } from "react";
import { VideoPreviewModal } from "../shared/VideoPreviewModal";

/** 反推脚本预览卡片的数据结构 */
interface PendingScriptData {
  title: string;
  summary: string;
  segments: Array<{
    time: string;
    title: string;
    content: string;
    visualCue: string;
  }>;
  videoUrl?: string | null;
  hasRealPerson?: boolean | null;
}

interface PendingScriptPreviewCardProps {
  script: PendingScriptData;
}

/** 反推脚本预览卡片 — 用于 Step1/Step2 侧边栏展示从广场"投入创作"携带的脚本 */
export function PendingScriptPreviewCard({ script }: PendingScriptPreviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [videoPreviewOpen, setVideoPreviewOpen] = useState(false);

  const segmentCount = script.segments.length;

  return (
    <>
      <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-purple-50/60 p-4 space-y-3">
        {/* 标题区域 */}
        <div className="flex items-start gap-2">
          <span className="material-icons-round text-indigo-500 text-lg mt-0.5">article</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-gray-800 truncate">
                {script.title || "反推脚本"}
              </h4>
              <span className="shrink-0 inline-flex items-center rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600">
                反推
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {segmentCount > 0 && (
                <span className="text-[11px] text-gray-400">共 {segmentCount} 个分镜</span>
              )}
              {script.videoUrl && (
                <>
                  {segmentCount > 0 && <span className="text-gray-300">·</span>}
                  <button
                    type="button"
                    onClick={() => setVideoPreviewOpen(true)}
                    className="inline-flex items-center gap-1 text-[11px] text-indigo-500 hover:text-indigo-700 font-medium transition-colors"
                  >
                    <span className="material-icons-round text-sm">play_circle</span>
                    原视频
                  </button>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 p-1 rounded-md hover:bg-indigo-100/60 text-gray-400 hover:text-indigo-600 transition-colors"
            title={expanded ? "收起" : "展开"}
          >
            <span className="material-icons-round text-base">
              {expanded ? "expand_less" : "expand_more"}
            </span>
          </button>
        </div>

        {/* 脚本摘要 */}
        {expanded && script.summary && (
          <div className="max-h-60 overflow-y-auto rounded-lg bg-white/70 border border-indigo-100/50 p-3">
            <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">
              {script.summary}
            </p>
          </div>
        )}

        {/* 分镜摘要（折叠时显示前2条） */}
        {segmentCount > 0 && (
          <div className="space-y-1.5">
            {script.segments.slice(0, expanded ? undefined : 2).map((seg, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 rounded-lg bg-white/60 border border-indigo-100/40 px-2.5 py-2"
              >
                <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-bold flex items-center justify-center">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-gray-700 truncate">
                    {seg.title || `分镜 ${idx + 1}`}
                  </p>
                  {seg.content && (
                    <p className="text-[10px] text-gray-400 line-clamp-2 mt-0.5">{seg.content}</p>
                  )}
                </div>
              </div>
            ))}
            {!expanded && segmentCount > 2 && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="w-full text-center text-[11px] text-indigo-500 hover:text-indigo-700 py-1"
              >
                查看全部 {segmentCount} 个分镜
              </button>
            )}
          </div>
        )}
      </div>

      {/* 视频预览弹窗 */}
      {videoPreviewOpen && script.videoUrl && (
        <VideoPreviewModal
          isOpen={videoPreviewOpen}
          videos={[{ url: script.videoUrl, title: script.title }]}
          currentIndex={0}
          onIndexChange={() => {}}
          onClose={() => setVideoPreviewOpen(false)}
        />
      )}
    </>
  );
}
