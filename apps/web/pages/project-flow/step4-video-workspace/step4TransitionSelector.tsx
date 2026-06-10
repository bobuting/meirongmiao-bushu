/**
 * Step4 转场预览组件
 * 支持 GPU 转场和 Canvas 2D 转场
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { TransitionPipeline } from '../../../src/core/gpu-transitions';
import { getTransitionDefinitionIds, getSmoothTransitionIds } from '../../../src/core/export/transition-definitions';
import {
  hasCanvasTransition,
  getCanvasTransitionRenderer,
} from '../../../src/core/transitions';
import type { TransitionRenderer } from '../../../src/core/transitions/types';

// 缩小预览格子尺寸
const CARD_CANVAS_WIDTH = 120;
const CARD_CANVAS_HEIGHT = 68;
const MODAL_CANVAS_WIDTH = 400;
const MODAL_CANVAS_HEIGHT = 225;
const ANIMATION_CYCLE_MS = 2500;
const PREVIEW_FPS = 12;
const FRAME_INTERVAL_MS = 1000 / PREVIEW_FPS;

/**
 * 创建带图标的预览画布
 */
function createPreviewCanvas(
  gradient: [string, string],
  icon: string,
  width: number,
  height: number
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;

  // 绘制渐变背景
  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, gradient[0]);
  grad.addColorStop(1, gradient[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // 绘制图标（简化版，使用圆形和文字）
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, Math.min(width, height) / 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = `bold ${Math.min(width, height) / 6}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon === 'person' ? '👤' : '🌅', width / 2, height / 2);

  return canvas;
}

/**
 * 转场名称映射标题
 */
const TRANSITION_TITLE_MAP: Record<string, string> = {
  fade: '淡入淡出',
  wipe: '擦除',
  clockWipe: '时钟擦除',
  slide: '滑动',
  flip: '翻转',
  iris: '虹膜',
  dissolve: '溶解',
  additiveDissolve: '叠加溶解',
  blurDissolve: '模糊溶解',
  dipToColorDissolve: '色彩溶解',
  nonAdditiveDissolve: '非叠加溶解',
  smoothCut: '平滑切换',
  sparkles: '闪光',
  radialBlur: '径向模糊',
  liquidDistort: '液态扭曲',
  lensWarpZoom: '镜头扭曲',
  lightLeakBurn: '光晕',
  filmGateSlip: '胶片滑动',
  bandWipe: '条带擦除',
  centerWipe: '中心展开',
  edgeWipe: '边缘擦除',
  radialWipe: '扇形擦除',
  spiralWipe: '螺旋擦除',
  venetianBlindWipe: '百叶窗',
  xWipe: 'X形擦除',
  barnDoor: '双门展开',
  split: '四分展开',
};

interface TransitionInfo {
  id: string;
  title: string;
  type: 'gpu' | 'canvas2d';
  renderer?: TransitionRenderer;
}

interface TransitionCardProps {
  transition: TransitionInfo;
  pipeline: TransitionPipeline | null;
  canvasA: OffscreenCanvas;
  canvasB: OffscreenCanvas;
  onClick: () => void;
}

const TransitionCard: React.FC<TransitionCardProps> = ({ transition, pipeline, canvasA, canvasB, onClick }) => {
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return;

    // 检查转场是否可用
    if (transition.type === 'gpu' && (!pipeline || !pipeline.has(transition.id))) {
      setError('GPU转场不可用');
      return;
    }
    if (transition.type === 'canvas2d' && !transition.renderer?.renderCanvas) {
      setError('Canvas转场不可用');
      return;
    }

    const ctx = canvas.getContext('2d')!;
    startTimeRef.current = performance.now();
    let lastFrameTime = 0;
    let isRunning = true;

    const animate = (now: number) => {
      if (!isRunning) return;

      const delta = now - lastFrameTime;
      if (delta < FRAME_INTERVAL_MS) {
        animFrameRef.current = requestAnimationFrame(animate);
        return;
      }
      lastFrameTime = now - (delta % FRAME_INTERVAL_MS);

      const elapsed = now - startTimeRef.current;
      const cycleProgress = (elapsed % ANIMATION_CYCLE_MS) / ANIMATION_CYCLE_MS;
      const progress = cycleProgress < 0.5
        ? cycleProgress * 2
        : (1 - cycleProgress) * 2;

      try {
        if (transition.type === 'gpu' && pipeline) {
          // GPU 转场渲染
          const resultCanvas = pipeline.render(
            transition.id,
            canvasA,
            canvasB,
            progress,
            CARD_CANVAS_WIDTH,
            CARD_CANVAS_HEIGHT
          );

          if (resultCanvas && isRunning) {
            ctx.drawImage(resultCanvas, 0, 0, CARD_CANVAS_WIDTH, CARD_CANVAS_HEIGHT);
          }
        } else if (transition.type === 'canvas2d' && transition.renderer?.renderCanvas) {
          // Canvas 2D 转场渲染
          ctx.fillStyle = 'black';
          ctx.fillRect(0, 0, CARD_CANVAS_WIDTH, CARD_CANVAS_HEIGHT);
          ctx.save();
          transition.renderer.renderCanvas!(
            ctx,
            canvasA,
            canvasB,
            progress,
            undefined,
            { width: CARD_CANVAS_WIDTH, height: CARD_CANVAS_HEIGHT }
          );
          ctx.restore();
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : '渲染失败';
        setError(errorMsg);
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      isRunning = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [transition, pipeline, canvasA, canvasB]);

  const title = TRANSITION_TITLE_MAP[transition.id] || transition.id;

  return (
    <div
      className="flex flex-col items-center gap-1 cursor-pointer group"
      onClick={onClick}
    >
      <div className="relative rounded-md overflow-hidden ring-1 ring-gray-200 hover:ring-violet-400 transition-all duration-150 hover:shadow-md group-hover:scale-[1.02]">
        <canvas
          ref={displayCanvasRef}
          width={CARD_CANVAS_WIDTH}
          height={CARD_CANVAS_HEIGHT}
          className="block"
          style={{ width: CARD_CANVAS_WIDTH, height: CARD_CANVAS_HEIGHT }}
        />
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-xs text-red-500 p-1 text-center">
            {error}
          </div>
        )}
        {/* 类型标签 */}
        <div className="absolute top-0 right-0 px-1 py-0.5 rounded-bl bg-black/50 text-white text-[8px] font-mono">
          {transition.type === 'gpu' ? 'GPU' : '2D'}
        </div>
        {/* 悬停提示 */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <span className="material-icons-round text-white text-lg drop-shadow-lg">zoom_in</span>
        </div>
      </div>
      <span className="text-[10px] font-medium text-gray-600 truncate max-w-full group-hover:text-violet-600 transition-colors">
        {title}
      </span>
    </div>
  );
};

/**
 * 放大预览弹窗
 */
interface TransitionPreviewModalProps {
  open: boolean;
  transition: TransitionInfo | null;
  pipeline: TransitionPipeline | null;
  onClose: () => void;
}

const TransitionPreviewModal: React.FC<TransitionPreviewModalProps> = ({
  open,
  transition,
  pipeline,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  const canvasA = useMemo(() => createPreviewCanvas(['#4F46E5', '#7C3AED'], 'person', MODAL_CANVAS_WIDTH, MODAL_CANVAS_HEIGHT), []);
  const canvasB = useMemo(() => createPreviewCanvas(['#F59E0B', '#EF4444'], 'landscape', MODAL_CANVAS_WIDTH, MODAL_CANVAS_HEIGHT), []);

  useEffect(() => {
    if (!open || !transition || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    startTimeRef.current = performance.now();
    let lastFrameTime = 0;
    let isRunning = true;

    const animate = (now: number) => {
      if (!isRunning) return;

      const delta = now - lastFrameTime;
      if (delta < FRAME_INTERVAL_MS) {
        animFrameRef.current = requestAnimationFrame(animate);
        return;
      }
      lastFrameTime = now - (delta % FRAME_INTERVAL_MS);

      const elapsed = now - startTimeRef.current;
      const cycleProgress = (elapsed % ANIMATION_CYCLE_MS) / ANIMATION_CYCLE_MS;
      const progress = cycleProgress < 0.5
        ? cycleProgress * 2
        : (1 - cycleProgress) * 2;

      try {
        if (transition.type === 'gpu' && pipeline) {
          // GPU 转场渲染
          const resultCanvas = pipeline.render(
            transition.id,
            canvasA,
            canvasB,
            progress,
            MODAL_CANVAS_WIDTH,
            MODAL_CANVAS_HEIGHT
          );

          if (resultCanvas && isRunning) {
            ctx.drawImage(resultCanvas, 0, 0, MODAL_CANVAS_WIDTH, MODAL_CANVAS_HEIGHT);
          }
        } else if (transition.type === 'canvas2d' && transition.renderer?.renderCanvas) {
          // Canvas 2D 转场渲染
          ctx.fillStyle = 'black';
          ctx.fillRect(0, 0, MODAL_CANVAS_WIDTH, MODAL_CANVAS_HEIGHT);
          ctx.save();
          transition.renderer.renderCanvas!(
            ctx,
            canvasA,
            canvasB,
            progress,
            undefined,
            { width: MODAL_CANVAS_WIDTH, height: MODAL_CANVAS_HEIGHT }
          );
          ctx.restore();
        }
      } catch (e) {
        console.error('[Modal] 渲染错误:', e);
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      isRunning = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [open, transition, pipeline, canvasA, canvasB]);

  if (!open || !transition) return null;

  const title = TRANSITION_TITLE_MAP[transition.id] || transition.id;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="material-icons-round text-violet-500 text-lg">auto_awesome</span>
            <h3 className="text-base font-bold text-gray-900">{title}</h3>
            <span className="text-xs text-gray-400 font-mono">({transition.id})</span>
            <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-500">
              {transition.type === 'gpu' ? 'GPU' : 'Canvas 2D'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <span className="material-icons-round text-lg">close</span>
          </button>
        </div>

        {/* 预览画布 */}
        <div className="p-4 bg-gray-50">
          <canvas
            ref={canvasRef}
            width={MODAL_CANVAS_WIDTH}
            height={MODAL_CANVAS_HEIGHT}
            className="w-full h-auto block rounded-lg shadow-lg"
          />
        </div>

        {/* 说明 */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-600">
            转场效果会自动应用到视频片段之间，让画面过渡更加自然流畅。
          </p>
        </div>
      </div>
    </div>
  );
};

interface Step4TransitionPreviewProps {
  /** 是否展开 */
  expanded?: boolean;
  /** 最近一次合成使用的转场 ID 列表 */
  usedTransitionIds?: string[];
}

export const Step4TransitionPreview: React.FC<Step4TransitionPreviewProps> = ({
  expanded = true,
  usedTransitionIds = [],
}) => {
  const [transitions, setTransitions] = useState<TransitionInfo[]>([]);
  const [pipeline, setPipeline] = useState<TransitionPipeline | null>(null);
  const [canvasA, setCanvasA] = useState<OffscreenCanvas | null>(null);
  const [canvasB, setCanvasB] = useState<OffscreenCanvas | null>(null);
  const [selectedTransition, setSelectedTransition] = useState<TransitionInfo | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [webGpuSupported, setWebGpuSupported] = useState<boolean | null>(null);

  // 初始化 GPU 转场管线和所有转场列表
  useEffect(() => {
    const initPipeline = async () => {
      try {
        const nav = navigator as Navigator & { gpu?: GPU };
        if (!nav.gpu) {
          setWebGpuSupported(false);
          console.warn('[Step4TransitionPreview] WebGPU 不支持');
          return;
        }

        const adapter = await nav.gpu.requestAdapter();
        if (!adapter) {
          setWebGpuSupported(false);
          console.warn('[Step4TransitionPreview] WebGPU adapter 不可用');
          return;
        }

        const device = await adapter.requestDevice();
        const pipelineInstance = TransitionPipeline.create(device);

        if (pipelineInstance) {
          setPipeline(pipelineInstance);
          setWebGpuSupported(true);

          // 创建预览画布
          const a = createPreviewCanvas(['#4F46E5', '#7C3AED'], 'person', CARD_CANVAS_WIDTH, CARD_CANVAS_HEIGHT);
          const b = createPreviewCanvas(['#F59E0B', '#EF4444'], 'landscape', CARD_CANVAS_WIDTH, CARD_CANVAS_HEIGHT);
          setCanvasA(a);
          setCanvasB(b);
        } else {
          setWebGpuSupported(false);
        }
      } catch (e) {
        console.error('[Step4TransitionPreview] 初始化失败:', e);
        setWebGpuSupported(false);
      }
    };

    initPipeline();
  }, []);

  // 获取所有转场列表（GPU + Canvas 2D）
  useEffect(() => {
    if (!pipeline) return;

    const allIds = getTransitionDefinitionIds();
    const items: TransitionInfo[] = [];

    for (const id of allIds) {
      // 检查是否是 GPU 转场
      if (pipeline.has(id)) {
        items.push({
          id,
          title: TRANSITION_TITLE_MAP[id] || id,
          type: 'gpu',
        });
        continue;
      }

      // 检查是否是 Canvas 2D 转场
      if (hasCanvasTransition(id)) {
        const renderer = getCanvasTransitionRenderer(id);
        if (renderer?.renderCanvas) {
          items.push({
            id,
            title: TRANSITION_TITLE_MAP[id] || id,
            type: 'canvas2d',
            renderer,
          });
        }
      }
    }

    setTransitions(items);
  }, [pipeline]);

  const handleCardClick = useCallback((transition: TransitionInfo) => {
    setSelectedTransition(transition);
    setModalOpen(true);
  }, []);

  if (!expanded) return null;

  // 加载中
  if (webGpuSupported === null || !pipeline) {
    return (
      <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-center text-sm text-gray-500">
        <span className="material-icons-round animate-spin text-violet-500 mb-2">progress_activity</span>
        <div>初始化转场...</div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl bg-gradient-to-br from-gray-50 to-white border border-gray-100 overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100/80">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shadow-md shadow-violet-500/20">
            <span className="material-icons-round text-white text-sm">auto_awesome</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-gray-900">转场效果</div>
            <div className="text-[10px] text-gray-400">
              随机选择 · {transitions.length} 种 · GPU + Canvas 2D
            </div>
          </div>
          {/* 本次合成使用的转场 */}
          {usedTransitionIds.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap justify-end">
              {usedTransitionIds.map((id, i) => {
                const title = TRANSITION_TITLE_MAP[id] || id;
                const info = transitions.find(t => t.id === id);
                const typeLabel = info?.type === 'gpu' ? 'GPU' : '2D';
                const typeColor = info?.type === 'gpu' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600';
                return (
                  <span key={i} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium ${typeColor}`}>
                    {title}
                    <span className="opacity-60">{typeLabel}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* 预览网格 */}
        <div className="p-2">
          {canvasA && canvasB ? (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
              {transitions.map((transition) => (
                <TransitionCard
                  key={transition.id}
                  transition={transition}
                  pipeline={pipeline}
                  canvasA={canvasA}
                  canvasB={canvasB}
                  onClick={() => handleCardClick(transition)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-gray-400 text-xs">
              初始化中...
            </div>
          )}
        </div>
      </div>

      {/* 放大预览弹窗 */}
      <TransitionPreviewModal
        open={modalOpen}
        transition={selectedTransition}
        pipeline={pipeline}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
};

export default Step4TransitionPreview;
