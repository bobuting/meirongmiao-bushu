import React, { useEffect, useRef, useState, useCallback } from 'react';
import { transitionManager } from '../../src/modules/transitions';
import type { WebCutBaseTransition, WebCutTransitionConfig } from '../../src/modules/transitions/base-transition';
import {
  canvasTransitionRegistry,
  hasCanvasTransition,
  getCanvasTransitionRenderer,
  getCanvasTransitionDefinition,
} from '../../src/core/transitions';
import type { TransitionRenderer } from '../../src/core/transitions/types';
import { getTransitionDefinitionIds } from '../../src/core/export/transition-definitions';

const CARD_CANVAS_WIDTH = 160;
const CARD_CANVAS_HEIGHT = 90;
const ANIMATION_CYCLE_MS = 2000; // 一个完整循环 2 秒
const PREVIEW_FPS = 15; // 预览帧率：15fps 足够展示转场效果，大幅降低 GPU 负载
const FRAME_INTERVAL_MS = 1000 / PREVIEW_FPS; // ~66.7ms

interface TransitionInfo {
  name: string;
  title: string;
  defaultDuration: number;
  type: 'webgl' | 'canvas2d';
  instance?: WebCutBaseTransition;
  renderer?: TransitionRenderer;
}

/**
 * 创建渐变色帧的 VideoFrame
 * @param gradient 渐变色数组 [起始色, 结束色]
 */
function createGradientFrame(gradient: [string, string]): VideoFrame {
  const canvas = new OffscreenCanvas(CARD_CANVAS_WIDTH, CARD_CANVAS_HEIGHT);
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, CARD_CANVAS_WIDTH, 0);
  grad.addColorStop(0, gradient[0]);
  grad.addColorStop(1, gradient[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_CANVAS_WIDTH, CARD_CANVAS_HEIGHT);
  return new VideoFrame(canvas, { timestamp: 0, duration: undefined });
}

// 预览用的两帧：蓝青渐变 和 红橙渐变
const FRAME_A = createGradientFrame(['#3B82F6', '#06B6D4']);
const FRAME_B = createGradientFrame(['#EF4444', '#F97316']);

// 预览用的 OffscreenCanvas（Canvas 2D 转场需要）
const LEFT_PREVIEW_CANVAS = new OffscreenCanvas(CARD_CANVAS_WIDTH, CARD_CANVAS_HEIGHT);
const LEFT_PREVIEW_CTX = LEFT_PREVIEW_CANVAS.getContext('2d')!;
LEFT_PREVIEW_CTX.drawImage(FRAME_A, 0, 0, CARD_CANVAS_WIDTH, CARD_CANVAS_HEIGHT);

const RIGHT_PREVIEW_CANVAS = new OffscreenCanvas(CARD_CANVAS_WIDTH, CARD_CANVAS_HEIGHT);
const RIGHT_PREVIEW_CTX = RIGHT_PREVIEW_CANVAS.getContext('2d')!;
RIGHT_PREVIEW_CTX.drawImage(FRAME_B, 0, 0, CARD_CANVAS_WIDTH, CARD_CANVAS_HEIGHT);

const TransitionCard: React.FC<{ transition: TransitionInfo; isSelected: boolean; onClick: () => void }> = ({ transition, isSelected, onClick }) => {
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    startTimeRef.current = performance.now();
    let lastFrameTime = 0;

    const animate = (now: number) => {
      // 节流到 PREVIEW_FPS
      const delta = now - lastFrameTime;
      if (delta < FRAME_INTERVAL_MS) {
        animFrameRef.current = requestAnimationFrame(animate);
        return;
      }
      lastFrameTime = now - (delta % FRAME_INTERVAL_MS);

      const elapsed = now - startTimeRef.current;
      // progress 在 0→1→0 之间循环
      const cycleProgress = (elapsed % ANIMATION_CYCLE_MS) / ANIMATION_CYCLE_MS;
      const progress = cycleProgress < 0.5
        ? cycleProgress * 2  // 0→1
        : (1 - cycleProgress) * 2; // 1→0

      if (transition.type === 'webgl' && transition.instance) {
        // WebGL 转场预览
        transition.instance.apply(FRAME_A, FRAME_B, progress, transition.instance.defaultConfig)
          .then((outputFrame) => {
            canvas.width = CARD_CANVAS_WIDTH;
            canvas.height = CARD_CANVAS_HEIGHT;
            ctx.drawImage(outputFrame, 0, 0);
            outputFrame.close();
          })
          .catch(() => {
            setSupported(false);
            renderPlaceholder(ctx);
          });
      } else if (transition.type === 'canvas2d' && transition.renderer?.renderCanvas) {
        // Canvas 2D 转场预览
        try {
          canvas.width = CARD_CANVAS_WIDTH;
          canvas.height = CARD_CANVAS_HEIGHT;
          // renderCanvas 内部会先绘制右帧，再 clip 绘制左帧
          ctx.fillStyle = 'black';
          ctx.fillRect(0, 0, CARD_CANVAS_WIDTH, CARD_CANVAS_HEIGHT);
          ctx.save();  // 必须 save，因为 renderCanvas 内部会 clip
          transition.renderer.renderCanvas!(
            ctx,
            LEFT_PREVIEW_CANVAS,
            RIGHT_PREVIEW_CANVAS,
            progress,
            undefined,
            { width: CARD_CANVAS_WIDTH, height: CARD_CANVAS_HEIGHT }
          );
          ctx.restore();  // 恢复状态，避免下一帧 clip 状态累积
        } catch (e) {
          console.error('[TransitionPreview] Canvas 2D 渲染失败:', transition.name, e);
          setSupported(false);
          renderPlaceholder(ctx);
        }
      } else {
        console.warn('[TransitionPreview] 转场无渲染器:', transition.name, transition.type);
        setSupported(false);
        renderPlaceholder(ctx);
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [transition]);

  const renderPlaceholder = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, CARD_CANVAS_WIDTH, CARD_CANVAS_HEIGHT);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('不可用', CARD_CANVAS_WIDTH / 2, CARD_CANVAS_HEIGHT / 2);
  };

  return (
    <div
      className={`flex flex-col gap-1.5 p-2 rounded-xl border-2 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
        isSelected
          ? 'border-blue-500 bg-blue-50 shadow-md'
          : 'border-gray-100 bg-white hover:border-gray-200'
      }`}
      onClick={onClick}
    >
      <div className="relative rounded-lg overflow-hidden bg-gray-100">
        <canvas
          ref={displayCanvasRef}
          width={CARD_CANVAS_WIDTH}
          height={CARD_CANVAS_HEIGHT}
          className="w-full h-auto block"
          style={{ imageRendering: 'auto' }}
        />
        {!supported && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <span className="text-xs text-gray-400">不可用</span>
          </div>
        )}
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-gray-900 truncate flex-1">
          {transition.title}
        </span>
        <span className="text-xs text-gray-400 font-mono">
          {(transition.defaultDuration / 30).toFixed(1)}帧
        </span>
      </div>
      <span className="text-xs text-gray-400 font-mono">
        {transition.name}
      </span>
    </div>
  );
};

interface TransitionPreviewModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (name: string) => void;
  selectedName?: string;
}

export const TransitionPreviewModal: React.FC<TransitionPreviewModalProps> = ({
  open,
  onClose,
  onSelect,
  selectedName,
}) => {
  const [transitions, setTransitions] = useState<TransitionInfo[]>([]);

  // 弹窗打开时获取转场列表（从两个注册表）
  useEffect(() => {
    if (!open) return;

    const allIds = getTransitionDefinitionIds();
    console.log('[TransitionPreview] 所有转场 ID:', allIds);
    const items: TransitionInfo[] = [];

    for (const name of allIds) {
      // 优先检查 WebGL 转场
      const webglInstance = transitionManager.getTransition(name);
      if (webglInstance) {
        items.push({
          name,
          title: webglInstance.title,
          defaultDuration: webglInstance.defaultDuration / 1000000 * 30, // 微秒转帧
          type: 'webgl',
          instance: webglInstance,
        });
        continue;
      }

      // 其次检查 Canvas 2D 转场
      const hasCanvas = hasCanvasTransition(name);
      console.log('[TransitionPreview] hasCanvasTransition(' + name + '):', hasCanvas);
      if (hasCanvas) {
        const def = getCanvasTransitionDefinition(name);
        const renderer = getCanvasTransitionRenderer(name);
        console.log('[TransitionPreview] Canvas 2D 转场:', name, 'renderer:', renderer, 'renderCanvas:', renderer?.renderCanvas);
        if (def && renderer?.renderCanvas) {
          items.push({
            name,
            title: def.label,
            defaultDuration: def.defaultDuration,
            type: 'canvas2d',
            renderer,
          });
        }
      }
    }

    console.log('[TransitionPreview] 最终转场列表:', items.length, items.map(i => i.name));
    setTransitions(items);
  }, [open]);

  const handleSelect = useCallback((name: string) => {
    onSelect(name);
    onClose();
  }, [onSelect, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="material-icons-round text-blue-500">auto_awesome</span>
            <h3 className="text-lg font-bold text-gray-900">转场效果预览</h3>
            <span className="text-xs text-gray-400 ml-1">({transitions.length} 种)</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <span className="material-icons-round">close</span>
          </button>
        </div>

        {/* 内容区 - 响应式网格 */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {transitions.map((transition) => (
              <TransitionCard
                key={transition.name}
                transition={transition}
                isSelected={transition.name === selectedName}
                onClick={() => handleSelect(transition.name)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
