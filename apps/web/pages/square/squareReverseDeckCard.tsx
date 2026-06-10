import React, { useState, useEffect } from "react";
import type { SquareReverseDeckSnapshot } from "./squareReverseDeckSnapshot";
import { VideoPreviewModal } from "../../components/shared/VideoPreviewModal";
import { getOssVideoSnapshotUrl } from "../../utils/ossImage";

interface SquareReverseDeckCardProps {
  snapshot: SquareReverseDeckSnapshot | null;
  onSendToStep3: () => void;
  onClose: () => void;
  /** 是否显示"已存入脚本中心"提示（首次打开时显示） */
  showStorageHint?: boolean;
}

// ============================================================================
// 工具函数
// ============================================================================

type MarkdownBlock =
  | { type: "kv"; label: string; value: string }
  | { type: "subheading"; value: string }
  | { type: "bullet"; value: string }
  | { type: "paragraph"; value: string };

function stripMarkdownMarks(value: string): string {
  return value.replace(/\*\*/g, "").replace(/[`_~]+/g, "").trim();
}

function cleanOverviewText(value: string): string {
  return stripMarkdownMarks(
    value
      .replace(/^#{1,6}\s*/gmu, "")
      .replace(/^(?:第)?[\d一二三四五六七八九十]+[.)、：:\-]\s*/gmu, "")
      .replace(/^[-*•]\s*/gmu, ""),
  ).replace(/\s+\n/g, "\n");
}

function parseMarkdownLikeContent(content: string): MarkdownBlock[] {
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const normalized = line.replace(/^[-*•]\s*/u, "").trim();
      const keyValueMatch = normalized.match(/^\*\*(.+?)\*\*[：:]\s*(.+)$/u);
      if (keyValueMatch) {
        return { type: "kv" as const, label: stripMarkdownMarks(keyValueMatch[1] ?? ""), value: stripMarkdownMarks(keyValueMatch[2] ?? "") };
      }
      const genericKeyValueMatch = stripMarkdownMarks(normalized).match(/^([^：:]{2,14})[：:]\s*(.+)$/u);
      if (genericKeyValueMatch) {
        return { type: "kv" as const, label: stripMarkdownMarks(genericKeyValueMatch[1] ?? ""), value: stripMarkdownMarks(genericKeyValueMatch[2] ?? "") };
      }
      const subheadingMatch = normalized.match(/^\*\*(.+?)\*\*$/u);
      if (subheadingMatch) {
        return { type: "subheading" as const, value: stripMarkdownMarks(subheadingMatch[1] ?? "") };
      }
      if (/^[-*•]\s*/u.test(line)) {
        return { type: "bullet" as const, value: stripMarkdownMarks(normalized) };
      }
      return { type: "paragraph" as const, value: stripMarkdownMarks(normalized) };
    });
}

// ============================================================================
// 子组件
// ============================================================================

/** 分镜帧卡片 — 去重显示，画面提示独立标签 */
function FrameCard({ frame }: { frame: SquareReverseDeckSnapshot["frames"][number] }) {
  const titleText = (frame.title ?? "").trim();
  const narrationText = (frame.narration ?? "").trim();
  const visualText = (frame.visualCue ?? "").trim();
  // title 和 narration 去重
  const narrationDuplicate = narrationText.length > 0 && narrationText === titleText;
  const mainText = narrationDuplicate ? titleText : [titleText, narrationText].filter(Boolean).join("：");
  return (
    <div className="group relative rounded-xl bg-gray-50/80 p-3 hover:bg-gray-100/80 transition-colors">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-orange-400 to-amber-500 text-[10px] font-black text-white shadow-sm">
          {frame.index || 1}
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          {mainText && (
            <p className="text-xs leading-relaxed text-gray-700 line-clamp-3">{mainText}</p>
          )}
          {visualText && visualText !== titleText && visualText !== narrationText && (
            <div className="flex items-center gap-1">
              <span className="material-icons-round text-sm text-sky-400">videocam</span>
              <p className="text-sm leading-5 text-gray-400 line-clamp-2">{visualText}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 分析报告 section */
function SectionBlock({ section }: { section: { order: number; title: string; content: string } }) {
  const [expanded, setExpanded] = useState(false);
  const blocks = parseMarkdownLikeContent(section.content);
  const displayBlocks = expanded ? blocks : blocks.slice(0, 3);
  const hasMore = blocks.length > 3;

  return (
    <div className="rounded-xl bg-white border border-gray-100 p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gray-900 text-[10px] font-bold text-white">
          {section.order}
        </span>
        <h4 className="text-xs font-bold text-gray-800">{section.title}</h4>
      </div>
      <div className="space-y-1.5">
        {displayBlocks.map((block, idx) => {
          if (block.type === "kv") {
            return (
              <div key={idx} className="text-xs leading-relaxed">
                <span className="font-semibold text-gray-500">{block.label}：</span>
                <span className="text-gray-700">{block.value}</span>
              </div>
            );
          }
          if (block.type === "bullet") {
            return (
              <div key={idx} className="flex items-start gap-1.5 text-xs leading-relaxed text-gray-600">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-orange-400" />
                {block.value}
              </div>
            );
          }
          return (
            <p key={idx} className="text-xs leading-relaxed text-gray-600">{block.value}</p>
          );
        })}
      </div>
      {hasMore && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 text-[11px] font-semibold text-primary hover:underline"
        >
          展开更多
        </button>
      )}
    </div>
  );
}

// ============================================================================
// 空状态
// ============================================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100">
        <span className="material-icons-round text-2xl text-gray-300">movie_filter</span>
      </div>
      <p className="text-sm font-medium text-gray-400">暂无反推结果</p>
      <p className="mt-1 text-xs text-gray-300">在上方输入链接执行反推</p>
    </div>
  );
}

// ============================================================================
// 存储提示 Toast
// ============================================================================

/** 脚本已存入脚本中心的提示 Toast */
function StorageHintToast({ visible }: { visible: boolean }) {
  return (
    <div
      className={`absolute top-12 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-500 ${
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 -translate-y-2 pointer-events-none"
      }`}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 shadow-lg shadow-emerald-200/50">
        <span className="material-icons-round text-base text-white">check_circle</span>
        <span className="text-sm font-semibold text-white">脚本已存入脚本中心</span>
      </div>
    </div>
  );
}

// ============================================================================
// 主卡片组件
// ============================================================================

export const SquareReverseDeckCard: React.FC<SquareReverseDeckCardProps> = ({
  snapshot,
  onSendToStep3,
  onClose,
  showStorageHint = false,
}) => {
  // Tab 状态：分镜 / 分析 — 无分镜数据时默认打开分析 tab
  const [activeTab, setActiveTab] = useState<"frames" | "analysis">(
    (snapshot?.frames?.length ?? 0) > 0 ? "frames" : "analysis"
  );
  // 存储提示显示状态（3秒后自动隐藏）
  const [storageHintVisible, setStorageHintVisible] = useState(showStorageHint);
  // 视频预览弹窗状态
  const [videoPreviewOpen, setVideoPreviewOpen] = useState(false);

  // 存储提示 3 秒后自动隐藏
  useEffect(() => {
    if (showStorageHint) {
      setStorageHintVisible(true);
      const timer = window.setTimeout(() => {
        setStorageHintVisible(false);
      }, 3000);
      return () => window.clearTimeout(timer);
    }
  }, [showStorageHint]);

  const frames = snapshot?.frames ?? [];
  // 移除 content 为空的过滤条件，因为上游已经设置了默认文本
  const sections = (snapshot?.sections ?? []).filter(
    (s) => s.order >= 1 && s.order <= 5
  );
  const keywords = snapshot?.keywords ?? [];
  const hasFrames = frames.length > 0;
  const hasSections = sections.length > 0;

  // 构建 overview 文本（摘要）
  const overviewText = (() => {
    if (!snapshot) return "";
    const ordered = [...sections].sort((a, b) => a.order - b.order);
    for (const section of ordered) {
      const lines = parseMarkdownLikeContent(section.content)
        .map((b) => (b.type === "kv" ? `${b.label}：${b.value}` : b.value))
        .map((l) => cleanOverviewText(l))
        .filter((l) => l.length > 0);
      if (lines.length > 0) return lines.slice(0, 2).join("；");
    }
    const frameLines = frames
      .map((f) => cleanOverviewText(f.narration || f.visualCue || ""))
      .filter((l) => l.length > 0);
    if (frameLines.length > 0) return frameLines.slice(0, 2).join("；");
    return cleanOverviewText(snapshot.scriptText || "暂无文案内容") || "暂无文案内容";
  })();

  return (
    <div className="pointer-events-auto w-full max-w-lg mx-auto overflow-visible rounded-2xl bg-white shadow-2xl shadow-black/10 border border-gray-200/80 text-left relative">
      {/* 存储提示 Toast */}
      <StorageHintToast visible={storageHintVisible} />
      {/* 顶部渐变头部 */}
      <div className="relative bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 px-4 pt-4 pb-8 overflow-hidden rounded-t-2xl">
        {/* 装饰光点 */}
        <div className="absolute top-0 right-0 h-24 w-24 rounded-full bg-orange-500/10 blur-2xl" />
        <div className="absolute bottom-0 left-0 h-16 w-16 rounded-full bg-sky-500/10 blur-2xl" />

        {/* 标题栏 */}
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white truncate" title={snapshot?.title}>
              {snapshot?.title || "视频反推"}
            </h3>
            {snapshot?.sourceUrl && (
              <a
                href={snapshot.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 block truncate text-[11px] text-gray-400 hover:text-gray-300 transition-colors"
              >
                {snapshot.sourceUrl}
              </a>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 shrink-0 rounded-lg flex items-center justify-center text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <span className="material-icons-round text-lg">close</span>
          </button>
        </div>

        {/* 关键词 */}
        {(keywords.length > 0 || snapshot?.hasRealPerson !== null) && (
          <div className="relative mt-3 flex flex-wrap gap-1.5">
            {/* 真人标签 */}
            {snapshot?.hasRealPerson !== null && snapshot?.hasRealPerson !== undefined && (
              <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm ${
                snapshot.hasRealPerson
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/20 text-rose-300'
              }`}>
                <span className="material-icons-round text-xs mr-1">
                  {snapshot.hasRealPerson ? 'person' : 'person_off'}
                </span>
                {snapshot.hasRealPerson ? '检测到真人' : '未检测到真人'}
              </span>
            )}

            {/* 关键词标签 */}
            {keywords.slice(0, 6).map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-gray-300 backdrop-blur-sm"
              >
                {kw}
              </span>
            ))}
            {keywords.length > 6 && (
              <span className="text-[10px] text-gray-500">+{keywords.length - 6}</span>
            )}
          </div>
        )}

        {/* 场景信息标签 */}
        {(() => {
          const sceneTags: Array<{ icon: string; label: string; color: string }> = [];
          if (snapshot?.mainScene) sceneTags.push({ icon: "landscape", label: snapshot.mainScene, color: "bg-blue-500/20 text-blue-300" });
          if (snapshot?.timeOfDay) sceneTags.push({ icon: "schedule", label: snapshot.timeOfDay, color: "bg-amber-500/20 text-amber-300" });
          if (snapshot?.weather) sceneTags.push({ icon: "cloud", label: snapshot.weather, color: "bg-sky-500/20 text-sky-300" });
          if (snapshot?.atmosphere) sceneTags.push({ icon: "mood", label: snapshot.atmosphere, color: "bg-purple-500/20 text-purple-300" });
          if (sceneTags.length === 0) return null;
          return (
            <div className="relative mt-2 flex flex-wrap gap-1.5">
              {sceneTags.map((tag) => (
                <span
                  key={tag.label}
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm ${tag.color}`}
                >
                  <span className="material-icons-round text-xs mr-1">{tag.icon}</span>
                  {tag.label}
                </span>
              ))}
            </div>
          );
        })()}
      </div>

      {/* 摘要卡片（浮在头部下方） */}
      <div className="relative -mt-4 mx-3 rounded-xl bg-white border border-gray-100 p-3 shadow-md shadow-gray-200/50">
        <p className="text-xs leading-relaxed text-gray-600 line-clamp-3">{overviewText}</p>
      </div>

      {/* 视频缩略图预览区 */}
      {snapshot?.videoUrl && (
        <div className="mx-3 mt-3">
          <button
            type="button"
            onClick={() => setVideoPreviewOpen(true)}
            className="relative w-full h-40 rounded-xl overflow-hidden border border-gray-100 group cursor-pointer"
          >
            <img
              src={getOssVideoSnapshotUrl(snapshot.videoUrl, 0, 400)}
              alt="视频封面"
              className="w-full h-full object-cover"
            />
            {/* 播放按钮覆盖层 */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
              <span className="material-icons-round text-5xl text-white/90 group-hover:scale-110 transition-transform">play_circle</span>
            </div>
          </button>
        </div>
      )}

      {!snapshot ? (
        <EmptyState />
      ) : (
        <>
          {/* Tab 切换 */}
          <div className="mx-3 mt-3 flex rounded-lg bg-gray-100 p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab("frames")}
              className={`flex-1 rounded-md py-1.5 text-xs font-bold transition-colors ${
                activeTab === "frames"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              分镜 ({frames.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("analysis")}
              className={`flex-1 rounded-md py-1.5 text-xs font-bold transition-colors ${
                activeTab === "analysis"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              分析 ({sections.length})
            </button>
          </div>

          {/* Tab 内容 */}
          <div className="mx-3 mt-2 mb-3 max-h-[360px] overflow-y-auto overscroll-contain space-y-2 pr-0.5">
            {activeTab === "frames" && (
              hasFrames ? (
                frames.slice(0, 10).map((frame, idx) => (
                  <FrameCard key={`frame-${frame.index}-${idx}`} frame={frame} />
                ))
              ) : (
                <div className="py-8 text-center text-xs text-gray-400">未提取到分镜帧</div>
              )
            )}
            {activeTab === "analysis" && (
              hasSections ? (
                sections
                  .sort((a, b) => a.order - b.order)
                  .map((section) => (
                    <SectionBlock key={`section-${section.order}`} section={section} />
                  ))
              ) : (
                <div className="py-8 text-center text-xs text-gray-400">未提取到分析报告</div>
              )
            )}
          </div>

          {/* 底部操作栏 */}
          <div className="border-t border-gray-100 px-3 py-2.5">
            <button
              type="button"
              onClick={onSendToStep3}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-200/40 transition-all hover:shadow-orange-300/50 hover:-translate-y-0.5 active:translate-y-0"
            >
              <span className="material-icons-round text-base">edit_note</span>
              投入创作
            </button>
          </div>
        </>
      )}

      {/* 视频预览弹窗 */}
      {videoPreviewOpen && snapshot?.videoUrl && (
        <VideoPreviewModal
          isOpen={videoPreviewOpen}
          videos={[{ url: snapshot.videoUrl, title: snapshot.title }]}
          currentIndex={0}
          onIndexChange={() => {}}
          onClose={() => setVideoPreviewOpen(false)}
        />
      )}
    </div>
  );
};
