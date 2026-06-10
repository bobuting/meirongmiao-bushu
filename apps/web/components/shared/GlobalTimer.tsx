import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/useAppStore';
import styles from './GlobalTimer.module.css';

// 轮换提示文案 — 鼓励型 + 解释型混合
const TIMER_MESSAGES = [
  // 鼓励型
  "别急，好作品需要时间 ✨",
  "你的效率已经很高了 🚀",
  "AI 在全力工作中 🎬",
  "一杯咖啡的时间就够了 ☕",
  "精彩内容正在酝酿 🎨",
  "耐心是创作的底色 🌟",
  // 解释型
  "正在使用海外优质模型，为保障效果可能需要较长时间等待",
  "高品质模型生成中，细节越多需要越细致处理",
  "当前使用最优模型为你生成，等待是值得的 ⏳",
  "优质模型正在云端渲染你的作品，请稍候片刻",
];

const MESSAGE_ROTATE_INTERVAL = 8000;
const INITIAL_WELCOME_DURATION = 5000;

/**
 * 格式化毫秒为 LED 数字面板的 parts
 * hours > 0 时返回 [H, MM, SS]，否则 [MM, SS]
 */
function formatTime(ms: number): string[] {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return [
      String(hours),
      String(minutes).padStart(2, '0'),
      String(seconds).padStart(2, '0'),
    ];
  }
  return [
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
  ];
}

export const GlobalTimer: React.FC = () => {
  const {
    globalTimerStartTime,
    globalLoading,
    globalTimerMessageIndex,
    nextTimerMessage,
  } = useAppStore(useShallow((state) => ({
    globalTimerStartTime: state.globalTimerStartTime,
    globalLoading: state.globalLoading,
    globalTimerMessageIndex: state.globalTimerMessageIndex,
    nextTimerMessage: state.nextTimerMessage,
  })));

  const [elapsed, setElapsed] = useState(0);
  const [visible, setVisible] = useState(false);
  const [animatingOut, setAnimatingOut] = useState(false);
  const welcomeShownRef = useRef(false);
  const welcomePhaseActiveRef = useRef(false);
  const welcomeTimerRef = useRef<number | null>(null);
  const messageTimerRef = useRef<number | null>(null);
  const welcomeHideTimerRef = useRef<number | null>(null);

  // 计时器：每秒更新已用时间
  useEffect(() => {
    if (!globalTimerStartTime) return;
    setElapsed(Date.now() - globalTimerStartTime);
    const interval = setInterval(() => {
      setElapsed(Date.now() - globalTimerStartTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [globalTimerStartTime]);

  // 首次进入项目：直接显示 welcome 状态，5 秒后自动隐藏
  // welcome 阶段只管理本地 visible，不碰 globalLoading，避免后续 loading 竞态
  useEffect(() => {
    if (!globalTimerStartTime || welcomeShownRef.current) return;
    welcomeShownRef.current = true;
    welcomePhaseActiveRef.current = true;

    // 立即显示
    setVisible(true);
    setAnimatingOut(false);

    // 5 秒后自动隐藏
    welcomeHideTimerRef.current = window.setTimeout(() => {
      setAnimatingOut(true);
      welcomeTimerRef.current = window.setTimeout(() => {
        setVisible(false);
        setAnimatingOut(false);
        welcomePhaseActiveRef.current = false;
      }, 300);
    }, INITIAL_WELCOME_DURATION);

    return () => {
      if (welcomeHideTimerRef.current != null) window.clearTimeout(welcomeHideTimerRef.current);
      if (welcomeTimerRef.current != null) window.clearTimeout(welcomeTimerRef.current);
    };
  }, [globalTimerStartTime]);

  // loading 状态变化时的显示/隐藏动画
  useEffect(() => {
    if (welcomePhaseActiveRef.current) return; // welcome 阶段跳过
    if (!globalTimerStartTime) return;
    if (!welcomeShownRef.current) return;

    if (globalLoading) {
      setAnimatingOut(false);
      setVisible(true);
    } else {
      setAnimatingOut(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setAnimatingOut(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [globalLoading, globalTimerStartTime]);

  // 文案轮换
  useEffect(() => {
    if (!visible) return;
    messageTimerRef.current = window.setInterval(() => {
      nextTimerMessage();
    }, MESSAGE_ROTATE_INTERVAL);
    return () => {
      if (messageTimerRef.current) clearInterval(messageTimerRef.current);
    };
  }, [visible, nextTimerMessage]);

  if (!visible) return null;

  const parts = formatTime(elapsed);
  const isInitialWelcome = elapsed < INITIAL_WELCOME_DURATION && elapsed > 0;
  const currentMessage = isInitialWelcome
    ? `加油，你已经制作视频 ${Math.floor(elapsed / 1000)} 秒了 🎉`
    : TIMER_MESSAGES[globalTimerMessageIndex % TIMER_MESSAGES.length];

  return createPortal(
    <div className={`${styles.timerContainer} ${animatingOut ? styles.slideOut : styles.slideIn}`}>
      <div className={`${styles.alarmClock} ${styles.wiggle}`}>
        {/* 敲击锤 */}
        <div className={styles.hammer} />

        {/* 双铃铛 */}
        <div className={`${styles.bell} ${styles.bellLeft}`} />
        <div className={`${styles.bell} ${styles.bellRight}`} />

        {/* 支脚 */}
        <div className={`${styles.leg} ${styles.legLeft}`} />
        <div className={`${styles.leg} ${styles.legRight}`} />

        {/* 钟身 */}
        <div className={styles.clockBody}>
          <div className={styles.clockHighlight} />

          {/* 钟面 */}
          <div className={styles.clockFace}>
            {/* 弧形艺术字 - 顶部内弧 */}
            <svg className={styles.clockArcText} viewBox="0 0 100 35" fill="none">
              <defs>
                <path id="clockArcPath" d="M 6 28 Q 50 2 94 28" fill="none" />
                <linearGradient id="arcTextGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#b0a394" />
                  <stop offset="50%" stopColor="#8b7355" />
                  <stop offset="100%" stopColor="#b0a394" />
                </linearGradient>
                <filter id="arcTextShadow" x="-10%" y="-10%" width="120%" height="140%">
                  <feDropShadow dx="0" dy="1" stdDeviation="0.8" floodColor="#000" floodOpacity="0.25" />
                </filter>
              </defs>
              <text fontSize="11" fontWeight="900" fontFamily="inherit" letterSpacing="3" fill="url(#arcTextGradient)" filter="url(#arcTextShadow)">
                <textPath href="#clockArcPath" startOffset="50%" textAnchor="middle">
                  项目用时
                </textPath>
              </text>
            </svg>
            {/* 刻度 */}
            <div className={`${styles.tick} ${styles.tickTop}`} />
            <div className={`${styles.tick} ${styles.tickBottom}`} />
            <div className={`${styles.tick} ${styles.tickLeft}`} />
            <div className={`${styles.tick} ${styles.tickRight}`} />

            {/* LED 数字 */}
            <div className={styles.ledPanel}>
              <div className={styles.ledDigits}>
                {parts.map((part, i) => {
                  const isColonBefore = i > 0;
                  return (
                    <React.Fragment key={`d${i}`}>
                      {isColonBefore && (
                        <span className={styles.ledColon}>:</span>
                      )}
                      <div className={styles.ledDigit}>
                        <span>{part}</span>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
              <div className={styles.statusIndicator} />
            </div>
          </div>
        </div>
      </div>

      {/* 底部文案 */}
      <div className={styles.message}>
        {currentMessage}
      </div>
    </div>,
    document.body,
  );
};
