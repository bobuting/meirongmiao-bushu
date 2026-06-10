import React, { useEffect, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import styles from "../shared/GlobalTimer.module.css";
import { PROJECT_STATUS_LABELS, IMAGE_PROJECT_STATUS_LABELS, type ProjectStatus } from "../../../../src/contant-config/shared_dict";
import type { ImageProjectStatus } from "../../../../src/contracts/types";

interface SidebarPanelHeaderProps {
  /** 当前步骤编号 1-5 */
  currentStep: number;
  /** 项目状态（支持视频和图片两种类型） */
  projectStatus?: ProjectStatus | ImageProjectStatus;
}

// 轮换提示文案（与 GlobalTimer 同源）
const TIMER_MESSAGES = [
  "用心创作，每一秒都值得记录 ✨",
  "别急，好作品需要时间 🌟",
  "你的效率已经很高了 🚀",
  "AI 在全力工作中 🎬",
  "一杯咖啡的时间就够了 ☕",
  "精彩内容正在酝酿 🎨",
  "耐心是创作的底色 💎",
  "正在使用海外优质模型，为保障效果可能需要较长时间等待",
  "高品质模型生成中，细节越多需要越细致处理",
  "当前使用最优模型为你生成，等待是值得的 ⏳",
  "优质模型正在云端渲染你的作品，请稍候片刻",
];

const MESSAGE_ROTATE_INTERVAL = 8000;

/** 格式化毫秒为 LED parts */
function formatTimeParts(ms: number): string[] {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return [String(h), pad(m), pad(s)];
  return [pad(m), pad(s)];
}

/**
 * 左侧栏面板头部 — 左侧文案 + 右侧迷你闹钟
 * 与全局 GlobalTimer 共用 globalTimerStartTime 数据源
 */
export const SidebarPanelHeader: React.FC<SidebarPanelHeaderProps> = ({
  currentStep,
  projectStatus,
}) => {
  const globalTimerStartTime = useAppStore((s) => s.globalTimerStartTime);
  const [now, setNow] = useState(() => Date.now());
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMsgIndex((i) => (i + 1) % TIMER_MESSAGES.length);
    }, MESSAGE_ROTATE_INTERVAL);
    return () => window.clearInterval(timer);
  }, []);

  const startTime = globalTimerStartTime ?? 0;
  const elapsedMs = startTime > 0 ? now - startTime : 0;
  const parts = formatTimeParts(elapsedMs);

  // 项目状态标签：根据状态类型分别查找（图片项目状态以 IMAGE_ 开头）
  const statusLabel = projectStatus
    ? (projectStatus.startsWith('IMAGE_')
      ? IMAGE_PROJECT_STATUS_LABELS[projectStatus as ImageProjectStatus]
      : PROJECT_STATUS_LABELS[projectStatus as ProjectStatus])
    : null;

  return (
    <div className="px-6 py-6 md:py-8 bg-white border-b border-gray-100 flex justify-between items-center shrink-0">
      {/* 左侧：图标 + 标题 + 轮换文案 */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100/80 shrink-0">
          <span className="material-icons-round text-base text-orange-400">timer</span>
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-700">
            项目总用时
            {statusLabel && (
              <span className="ml-2 text-xs font-normal text-gray-400">· {statusLabel}</span>
            )}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{TIMER_MESSAGES[msgIndex]}</p>
        </div>
      </div>

      {/* 右侧：LED 数字面板 */}
      <div className="shrink-0 inline-flex items-center gap-1">
        <div className={styles.ledDigits}>
          {parts.map((part, i) => (
            <React.Fragment key={`d${i}`}>
              {i > 0 && <span className={styles.ledColon}>:</span>}
              <div className={styles.ledDigit}>
                <span>{part}</span>
              </div>
            </React.Fragment>
          ))}
        </div>
        <div className={styles.statusIndicator} style={{ margin: '0 0 0 4px' }} />
      </div>
    </div>
  );
};
