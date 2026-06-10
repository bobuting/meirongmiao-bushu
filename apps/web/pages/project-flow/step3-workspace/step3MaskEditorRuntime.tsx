import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Step3FrameParameterOverride } from "../../../../../src/contracts/step3-frame-parameter-contract";
import { Button } from "../../../components/ui/Button";

type Step3MaskTool = "brush" | "erase";

export interface Step3MaskFrameOverrideRecord extends Step3FrameParameterOverride {
  maskDataUrl?: string | null;
}

export type Step3MaskFrameOverrideState = Record<string, Step3MaskFrameOverrideRecord>;

function trimText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasParameterOverride(value: Step3MaskFrameOverrideRecord | null | undefined): boolean {
  return Boolean(value?.ratio || value?.resolution);
}

function restoreCanvasSnapshot(
  canvas: HTMLCanvasElement,
  snapshot: string | null,
  onRestored: (hasMask: boolean) => void,
  contextOverride?: CanvasRenderingContext2D | null,
) {
  const context = contextOverride ?? canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!snapshot) {
    onRestored(false);
    return;
  }
  const image = new Image();
  image.onload = () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    onRestored(true);
  };
  image.onerror = () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    onRestored(false);
  };
  image.src = snapshot;
}

function drawStroke(input: {
  context: CanvasRenderingContext2D;
  tool: Step3MaskTool;
  brushSize: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}) {
  const { context, tool, brushSize, fromX, fromY, toX, toY } = input;
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalCompositeOperation = tool === "erase" ? "destination-out" : "source-over";
  context.strokeStyle = "rgba(255, 236, 140, 1)";
  context.lineWidth = brushSize;
  context.beginPath();
  context.moveTo(fromX, fromY);
  context.lineTo(toX, toY);
  context.stroke();
  context.restore();
}

export function resolveStep3FrameMaskDataUrl(input: unknown, frameKey: string): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input) || !frameKey.trim()) {
    return null;
  }
  const source = input as Record<string, unknown>;
  const record = source[frameKey];
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }
  return trimText((record as Record<string, unknown>).maskDataUrl as string | null | undefined) || null;
}

export function patchStep3FrameMaskDataUrl(
  currentState: unknown,
  frameKey: string,
  maskDataUrl: string | null,
): Step3MaskFrameOverrideState {
  const source =
    currentState && typeof currentState === "object" && !Array.isArray(currentState)
      ? (currentState as Record<string, unknown>)
      : {};
  const currentRecord =
    source[frameKey] && typeof source[frameKey] === "object" && !Array.isArray(source[frameKey])
      ? ({ ...(source[frameKey] as Record<string, unknown>) } as Step3MaskFrameOverrideRecord)
      : {};
  const nextMaskDataUrl = trimText(maskDataUrl) || null;
  const nextRecord: Step3MaskFrameOverrideRecord = {
    ...currentRecord,
    maskDataUrl: nextMaskDataUrl,
  };
  if (nextMaskDataUrl === null) {
    delete nextRecord.maskDataUrl;
  }
  const nextState: Step3MaskFrameOverrideState = {
    ...(source as Step3MaskFrameOverrideState),
  };
  if (!hasParameterOverride(nextRecord) && !nextRecord.maskDataUrl) {
    delete nextState[frameKey];
    return nextState;
  }
  nextState[frameKey] = nextRecord;
  return nextState;
}

export const Step3MaskEditorRuntime: React.FC<{
  isOpen: boolean;
  imageUrl: string;
  title: string;
  promptSummary: string;
  initialMaskDataUrl?: string | null;
  onClose: () => void;
  onSave: (maskDataUrl: string | null) => void;
}> = ({ isOpen, imageUrl, title, promptSummary, initialMaskDataUrl, onClose, onSave }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const historyRef = useRef<Array<string | null>>([]);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const pendingPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const animationFrameRef = useRef<number | null>(null);
  const toolRef = useRef<Step3MaskTool>("brush");
  const brushSizeRef = useRef(28);
  const maskTouchedRef = useRef(false);
  const canvasReadyRef = useRef(false);
  const [tool, setTool] = useState<Step3MaskTool>("brush");
  const [brushSize, setBrushSize] = useState(28);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const toolLabel = useMemo(() => (tool === "erase" ? "擦除蒙版" : "画笔蒙版"), [tool]);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    brushSizeRef.current = brushSize;
  }, [brushSize]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    canvasReadyRef.current = false;
    const updateCanvasSize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      canvas.width = width;
      canvas.height = height;
      contextRef.current =
        canvas.getContext("2d", {
          alpha: true,
          desynchronized: true,
        }) ?? canvas.getContext("2d");
      canvasReadyRef.current = false;
      setCanvasSize({ width, height });
    };
    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);
    return () => window.removeEventListener("resize", updateCanvasSize);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || canvasSize.width < 1 || canvasSize.height < 1 || !canvasRef.current) {
      return;
    }
    historyRef.current = [];
    restoreCanvasSnapshot(canvasRef.current, initialMaskDataUrl ?? null, (hasMask) => {
      maskTouchedRef.current = hasMask;
      canvasReadyRef.current = true;
    }, contextRef.current);
  }, [canvasSize.height, canvasSize.width, initialMaskDataUrl, isOpen]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, []);

  if (!isOpen) {
    return null;
  }

  const snapshotCanvas = (): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }
    return maskTouchedRef.current ? canvas.toDataURL("image/png") : null;
  };

  const resolvePoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const offsetX = Number(event.nativeEvent.offsetX);
    const offsetY = Number(event.nativeEvent.offsetY);
    if (Number.isFinite(offsetX) && Number.isFinite(offsetY)) {
      return {
        x: offsetX,
        y: offsetY,
      };
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = contextRef.current ?? canvas?.getContext("2d");
    const point = resolvePoint(event);
    if (!canvasReadyRef.current || !canvas || !context || !point) {
      return;
    }
    historyRef.current.push(snapshotCanvas());
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = point;
    pendingPointsRef.current = [];
    drawStroke({
      context,
      tool: toolRef.current,
      brushSize: brushSizeRef.current,
      fromX: point.x,
      fromY: point.y,
      toX: point.x + 0.01,
      toY: point.y + 0.01,
    });
    if (!maskTouchedRef.current) {
      maskTouchedRef.current = true;
    }
  };

  const drawPendingStroke = () => {
    animationFrameRef.current = null;
    if (!drawingRef.current) {
      return;
    }
    const context = contextRef.current ?? canvasRef.current?.getContext("2d");
    const lastPoint = lastPointRef.current;
    if (!context || !lastPoint) {
      return;
    }
    const pendingPoints = pendingPointsRef.current;
    if (pendingPoints.length < 1) {
      return;
    }
    let cursor = lastPoint;
    for (const point of pendingPoints) {
      drawStroke({
        context,
        tool: toolRef.current,
        brushSize: brushSizeRef.current,
        fromX: cursor.x,
        fromY: cursor.y,
        toX: point.x,
        toY: point.y,
      });
      cursor = point;
    }
    lastPointRef.current = cursor;
    pendingPointsRef.current = [];
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) {
      return;
    }
    if (!lastPointRef.current) {
      return;
    }
    const coalescedEvents =
      typeof event.nativeEvent.getCoalescedEvents === "function"
        ? event.nativeEvent.getCoalescedEvents()
        : [event.nativeEvent];
    const nextPoints = coalescedEvents
      .map((nativeEvent) => {
        const x = Number(nativeEvent.offsetX);
        const y = Number(nativeEvent.offsetY);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          return null;
        }
        return { x, y };
      })
      .filter((point): point is { x: number; y: number } => Boolean(point));
    if (nextPoints.length < 1) {
      const fallbackPoint = resolvePoint(event);
      if (fallbackPoint) {
        nextPoints.push(fallbackPoint);
      }
    }
    if (nextPoints.length < 1) {
      return;
    }
    pendingPointsRef.current.push(...nextPoints);
    if (animationFrameRef.current === null) {
      animationFrameRef.current = window.requestAnimationFrame(drawPendingStroke);
    }
    if (!maskTouchedRef.current) {
      maskTouchedRef.current = true;
    }
  };

  const stopDrawing = (event?: React.PointerEvent<HTMLCanvasElement>) => {
    if (pendingPointsRef.current.length > 0 && lastPointRef.current) {
      drawPendingStroke();
    }
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    drawingRef.current = false;
    lastPointRef.current = null;
    pendingPointsRef.current = [];
  };

  const handleUndo = () => {
    const canvas = canvasRef.current;
    if (!canvas || historyRef.current.length < 1) {
      return;
    }
    restoreCanvasSnapshot(canvas, historyRef.current.pop() ?? null, (hasMask) => {
      maskTouchedRef.current = hasMask;
    }, contextRef.current);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const context = contextRef.current ?? canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    historyRef.current.push(snapshotCanvas());
    context.clearRect(0, 0, canvas.width, canvas.height);
    maskTouchedRef.current = false;
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas || !maskTouchedRef.current) {
      onSave(null);
      return;
    }
    onSave(canvas.toDataURL("image/png"));
  };

  return (
    <div data-testid="step3-mask-editor-modal" className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0f172a] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-lg font-bold text-white">局部蒙版编辑</div>
            <div className="text-xs text-slate-300">{title} · 当前工具：{toolLabel}</div>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white">
            <span className="material-icons-round text-base">close</span>
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-hidden p-5 lg:flex-row">
          <aside className="w-full max-w-[280px] shrink-0 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-bold text-white">编辑工具</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setTool("brush")} className={`rounded-full px-3 py-2 text-xs font-semibold ${tool === "brush" ? "bg-white text-slate-900" : "border border-white/20 text-slate-200"}`}>
                画笔
              </button>
              <button type="button" onClick={() => setTool("erase")} className={`rounded-full px-3 py-2 text-xs font-semibold ${tool === "erase" ? "bg-white text-slate-900" : "border border-white/20 text-slate-200"}`}>
                擦除
              </button>
            </div>
            <label className="mt-4 block text-xs font-semibold text-slate-200">
              画笔尺寸
              <input
                data-testid="step3-mask-editor-brush-size"
                type="range"
                min={12}
                max={72}
                step={2}
                value={brushSize}
                onChange={(event) => setBrushSize(Number(event.target.value))}
                className="mt-2 w-full"
              />
            </label>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={handleUndo} className="rounded-2xl border border-white/15 px-3 py-2 text-xs font-semibold text-white">
                撤销
              </button>
              <button type="button" onClick={handleClear} className="rounded-2xl border border-white/15 px-3 py-2 text-xs font-semibold text-white">
                清空蒙版
              </button>
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs leading-6 text-slate-200">
              局部重绘将使用“参考当前图 + 当前镜头提示词”的模式。
            </div>
            <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs leading-6 text-slate-300">
              {trimText(promptSummary) || "当前镜头还没有主提示词，将仅回写蒙版结果。"}
            </div>
          </aside>
          <div className="relative flex-1 overflow-hidden rounded-3xl border border-white/10 bg-black/30">
            <div ref={containerRef} className="relative h-full w-full">
              <img src={imageUrl} alt={title} className="h-full w-full object-contain"  loading="lazy" />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                style={{ opacity: 0.35 }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={stopDrawing}
                onPointerLeave={stopDrawing}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-white/10 px-5 py-4">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave}>保存蒙版</Button>
        </div>
      </div>
    </div>
  );
};
