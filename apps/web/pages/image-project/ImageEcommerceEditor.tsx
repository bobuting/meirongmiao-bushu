/**
 * ImageEcommerceEditor.tsx - Step 4 万相营造商详长图生成 + Sketch 编辑
 * 一键生成长图 → 预览 → Sketch 可视化编辑（Pro 版）→ 下载
 *
 * 编辑模式流程：
 * 1. 点击「编辑模式」→ editMode=true（渲染 canvas 容器）+ editLoading=true
 * 2. useEffect 检测 canvas ref 可用 → 下载 sketch → parseSketchFile → createSketchListener
 * 3. 初始化完成 → editLoading=false，canvas 可交互
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from 'react-router';
import { useAppStore } from "../../store/useAppStore";
import { useProjectState } from "../../hooks/useProjectState";
import { realBackendApi } from "../../services/realApi";
import type { WanxiangTemplate, LongImageGenerationItem } from "../../services/realApi/image-step4";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import { ShareModal } from "../../components/shared/ShareModal";
import {
  resolveStep4FooterPreviousRoute,
} from "../project-flow/step2ProjectFlowAction";
import { GlobalTaskType, TaskStatus } from "../../components/layout/taskQueueConfig";
import {
  parseSketchFile,
  createSketchListener,
  destroySketch,
  exportCanvasAsPng,
  exportSketchFile,
  updateNodeText,
  updateNodeStyle,
  selectNode,
  clearSelection,
  type SketchElement,
  type SketchParseResult,
  type TextProps,
  type ImageProps,
  type ShapeProps,
} from "../../services/sketch-parser";

interface ImageEcommerceEditorProps {
  projectId: string;
}

export const ImageEcommerceEditorRoute: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) return null;
  return <ImageEcommerceEditor projectId={projectId} />;
};

export const ImageEcommerceEditor: React.FC<ImageEcommerceEditorProps> = ({ projectId }) => {
  const token = useAppStore((state) => state.token);
  const pushTaskNotification = useAppStore((state) => state.pushTaskNotification);
  const globalTaskQueue = useAppStore((state) => state.globalTaskQueue);
  const navigate = useNavigate();
  const { projectData, updateProjectData } = useProjectState(projectId);
  const toast = useToast();

  const kind: "image" | "video" = "image";
  const [loading, setLoading] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [sketchUrl, setSketchUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // 模板选择
  const [templates, setTemplates] = useState<WanxiangTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  // 长图历史记录
  const [generations, setGenerations] = useState<LongImageGenerationItem[]>([]);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  // Sketch 编辑模式
  const [editMode, setEditMode] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sketchResult, setSketchResult] = useState<SketchParseResult | null>(null);
  const [selectedElement, setSelectedElement] = useState<SketchElement | null>(null);
  const [editedElements, setEditedElements] = useState<Map<string, SketchElement>>(new Map());
  const sketchCanvasRef = useRef<HTMLCanvasElement>(null);
  const sketchContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listenerRef = useRef<any>(null);

  // ========= 任务队列 =========

  const longImageJob = globalTaskQueue.find(
    (t) => t.type === GlobalTaskType.IMAGE_STEP4_LONG_IMAGE_SUBMIT
      && t.projectId === projectId
      && (t.status === TaskStatus.PENDING || t.status === TaskStatus.RUNNING),
  );

  const completedLongImageJob = globalTaskQueue.find(
    (t) => t.type === GlobalTaskType.IMAGE_STEP4_LONG_IMAGE_SUBMIT
      && t.projectId === projectId
      && t.status === TaskStatus.COMPLETED,
  );

  const failedLongImageJob = globalTaskQueue.find(
    (t) => t.type === GlobalTaskType.IMAGE_STEP4_LONG_IMAGE_SUBMIT
      && t.projectId === projectId
      && t.status === TaskStatus.FAILED,
  );

  // ========= 初始加载 =========

  useEffect(() => {
    let cancelled = false;
    const currentToken = token || useAppStore.getState().token;
    if (!currentToken) return;

    void (async () => {
      try {
        const status = await realBackendApi.imageStep4GetLongImageStatus(currentToken, projectId);
        if (cancelled) return;
        if (status.imageUrl) {
          setImageUrl(status.imageUrl);
          setSketchUrl(status.sketchUrl ?? null);
        }
        if (status.generations) {
          setGenerations(status.generations);
        }
        if (status.status === "running") setGenerating(true);
      } catch {
        // 首次查询失败忽略
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [token, projectId]);

  // ========= 任务状态监听 =========

  const prevJobRunningRef = useRef(false);

  useEffect(() => {
    const isRunning = Boolean(longImageJob);
    if (isRunning && !prevJobRunningRef.current) {
      setGenerating(true);
    } else if (!isRunning && prevJobRunningRef.current) {
      setGenerating(false);
      if (token) {
        void realBackendApi.imageStep4GetLongImageStatus(token, projectId).then((status) => {
          if (status.imageUrl) {
            setImageUrl(status.imageUrl);
            setSketchUrl(status.sketchUrl ?? null);
          }
          if (status.generations) {
            setGenerations(status.generations);
          }
        });
      }
    }
    prevJobRunningRef.current = isRunning;
  }, [longImageJob, token, projectId]);

  // 任务完成/失败通知
  const handledCompletedRef = useRef<Set<string>>(new Set());
  const handledFailedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (completedLongImageJob && !handledCompletedRef.current.has(completedLongImageJob.id)) {
      handledCompletedRef.current.add(completedLongImageJob.id);
      pushTaskNotification({
        category: "clip",
        title: "长图生成完成",
        detail: "商详长图已生成，可预览和下载",
        targetPath: `/image-create/${projectId}/step4`,
      });
    }
  }, [completedLongImageJob?.id, projectId, pushTaskNotification]);

  useEffect(() => {
    if (failedLongImageJob && !handledFailedRef.current.has(failedLongImageJob.id)) {
      handledFailedRef.current.add(failedLongImageJob.id);
      const errorMsg = (failedLongImageJob.error as { message?: string } | undefined)?.message ?? "长图生成失败";
      pushTaskNotification({
        category: "clip",
        title: "长图生成失败",
        detail: errorMsg,
        targetPath: `/image-create/${projectId}/step4`,
      });
    }
  }, [failedLongImageJob?.id, projectId, pushTaskNotification]);

  // 更新项目状态
  useEffect(() => {
    if (imageUrl && projectData.projectStatus !== "IMAGE_DETAIL_PAGE_GENERATED"
      && projectData.projectStatus !== "IMAGE_READY_TO_PUBLISH"
      && projectData.projectStatus !== "IMAGE_PUBLISHED") {
      updateProjectData({ projectStatus: "IMAGE_DETAIL_PAGE_GENERATED" });
      if (token && projectId) {
        void realBackendApi.updateProjectStatus(token, projectId, "IMAGE_DETAIL_PAGE_GENERATED").catch(() => {});
      }
    }
  }, [imageUrl, projectData.projectStatus, updateProjectData, token, projectId]);

  // ========= 关键：editMode=true 后 canvas 渲染到 DOM，useEffect 初始化 sketch-editor =========

  useEffect(() => {
    if (!editMode || !editLoading || !sketchUrl || !token) return;

    // DOM 可能还没渲染完（canvas/container ref 为 null），轮询等待 ref 就绪
    let destroyed = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const tryInit = () => {
      if (destroyed) return;
      const canvas = sketchCanvasRef.current;
      const container = sketchContainerRef.current;
      if (!canvas || !container) {
        pollTimer = setTimeout(tryInit, 50);
        return;
      }

      void (async () => {
        try {
          // 1. 通过后端代理下载 sketch 文件
          const proxyResult = await realBackendApi.imageStep4ProxySketchFile(token, projectId, sketchUrl);
          if (destroyed) return;

          const arrayBuffer = Uint8Array.from(atob(proxyResult.data), (c) => c.charCodeAt(0)).buffer;

          // 2. 临时 canvas 尺寸（用于解析）
          const containerWidth = container.clientWidth;
          canvas.width = containerWidth;
          canvas.height = containerWidth;

          // 3. 解析 + WebGL 渲染
          const result = await parseSketchFile(arrayBuffer, canvas);
          if (destroyed) { destroySketch(result.root); return; }

          // 4. 按文档宽高比重设 canvas（宽度填满容器，高度按比例）
          const { width: docW, height: docH } = result.documentSize;
          const displayWidth = containerWidth;
          const displayHeight = docW > 0 ? Math.round(displayWidth * (docH / docW)) : containerWidth;
          canvas.width = displayWidth;
          canvas.height = displayHeight;

          // 5. 手动同步 root 内部尺寸（checkRoot 在 PX 模式下读旧值，这里全覆盖）
          const rootAny = result.root as Record<string, unknown>;
          rootAny.width = displayWidth;
          rootAny.height = displayHeight;
          const rootStyle = rootAny.style as Record<string, unknown> | undefined;
          if (rootStyle) {
            const sw = rootStyle.width as Record<string, unknown> | undefined;
            if (sw && typeof sw === "object" && "v" in sw) sw.v = displayWidth;
            const sh = rootStyle.height as Record<string, unknown> | undefined;
            if (sh && typeof sh === "object" && "v" in sh) sh.v = displayHeight;
          }
          const rootCs = rootAny.computedStyle as Record<string, unknown> | undefined;
          if (rootCs) { rootCs.width = displayWidth; rootCs.height = displayHeight; }
          const rootCtx = rootAny.ctx as WebGLRenderingContext | undefined;
          rootCtx?.viewport(0, 0, displayWidth, displayHeight);
          result.root.zoomFit();

          // 6. 创建交互 Listener（禁用缩放和平移）
          const listener = await createSketchListener(result.root, container);
          if (destroyed) { destroySketch(result.root); return; }

          // 7. 移除 Listener 的 wheel 监听，让容器可垂直滚动
          //    library 的 onWheel 在顶部调用 preventDefault() 会阻止滚动
          const listenerAny = listener as Record<string, unknown>;
          const eventList = listenerAny.eventListenerList as Array<{ type: string; cb: EventListener }> | undefined;
          if (eventList) {
            for (const item of eventList) {
              if (item.type === "wheel") {
                container.removeEventListener("wheel", item.cb);
                break;
              }
            }
          }

          listenerRef.current = listener;
          setSketchResult(result);
          setSelectedElement(null);
          setEditedElements(new Map());
          setEditLoading(false);
        } catch (err) {
          if (destroyed) return;
          const message = err instanceof Error ? err.message : "加载编辑器失败";
          toast.error(message);
          setEditMode(false);
          setEditLoading(false);
        }
      })();
    };

    tryInit();

    return () => {
      destroyed = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [editMode, editLoading, sketchUrl, token, projectId, toast]);

  // ========= 操作回调 =========

  const handleGenerate = useCallback(async () => {
    if (!token || generating) return;
    try {
      const selectedTemplate = selectedTemplateId
        ? templates.find((t) => t.templateId === selectedTemplateId)
        : null;
      await realBackendApi.imageStep4GenerateLongImage(token, projectId, {
        templateId: selectedTemplateId ?? undefined,
        templateName: selectedTemplate?.templateName,
      });
      setGenerating(true);
      setEditMode(false);
      setSketchResult(null);
      setShowTemplatePicker(false);
      toast.showToast("已提交长图生成任务，请稍候...");
    } catch (err) {
      const message = err instanceof Error ? err.message : "提交失败";
      toast.error(message);
    }
  }, [token, projectId, generating, selectedTemplateId, templates, toast]);

  const loadTemplates = useCallback(async () => {
    if (!token) return;
    setTemplatesLoading(true);
    try {
      const result = await realBackendApi.imageStep4GetLongImageTemplates(token, projectId);
      setTemplates(result.templates);
    } catch {
      toast.error("获取模板列表失败");
    } finally {
      setTemplatesLoading(false);
    }
  }, [token, projectId, toast]);

  const handleOpenTemplatePicker = useCallback(() => {
    setShowTemplatePicker(true);
    if (templates.length === 0) void loadTemplates();
  }, [templates.length, loadTemplates]);

  /** 进入编辑模式：先设 editMode=true 渲染 canvas，再由 useEffect 初始化 */
  const handleEnterEditMode = useCallback(() => {
    if (!sketchUrl || !token) {
      toast.error("Pro 版 Sketch 源文件不可用");
      return;
    }
    setEditMode(true);
    setEditLoading(true);
  }, [sketchUrl, token, toast]);

  /** 退出编辑模式（确认 → 自动保存 sketch + 导出长图 → 销毁实例 → 切换回预览） */
  const handleExitEditMode = useCallback(async () => {
    const shouldExport = window.confirm("是否导出图片并替换当前长图？\n\n选择「确定」：保存编辑 + 导出长图替换\n选择「取消」：仅保存编辑");
    const root = sketchResult?.root;
    const canvas = sketchCanvasRef.current;

    // 自动保存 sketch + 可选导出长图
    if (root && token) {
      try {
        // 1. 并行获取上传 URL
        const [sketchUploadRes, imageUploadRes] = await Promise.all([
          realBackendApi.imageStep4SketchUploadUrl(token, projectId),
          shouldExport && canvas ? realBackendApi.imageStep4ImageUploadUrl(token, projectId) : null,
        ]);

        // 2. 并行上传：sketch 文件 + 长图 WebP
        const sketchBuffer = await exportSketchFile(root);
        const imageBlob = shouldExport && canvas
          ? await new Promise<Blob | null>((resolve) => { root.draw(); canvas.toBlob(resolve, "image/webp", 0.9); })
          : null;

        const uploadResults = await Promise.all([
          fetch(sketchUploadRes.uploadUrl, { method: "PUT", headers: { "Content-Type": "application/zip" }, body: sketchBuffer }),
          imageBlob && imageUploadRes
            ? fetch(imageUploadRes.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/webp" }, body: imageBlob })
            : Promise.resolve(null),
        ]);

        // 3. 更新数据库
        const sketchOk = uploadResults[0]?.ok ?? false;
        const imageOk = !imageUploadRes || (uploadResults[1]?.ok ?? false);

        if (sketchOk && imageOk) {
          await realBackendApi.imageStep4SaveSketchUrl(token, projectId, {
            imageUrl: imageUploadRes?.downloadUrl,
            sketchUrl: sketchUploadRes.downloadUrl,
          });
          setSketchUrl(sketchUploadRes.downloadUrl);
          if (imageUploadRes) setImageUrl(imageUploadRes.downloadUrl);
          toast.showToast(shouldExport ? "保存成功，长图已替换" : "编辑已保存");
        } else {
          toast.showToast("部分上传失败，请重试");
        }
      } catch {
        toast.showToast("保存失败");
      }
    }

    if (root) destroySketch(root);
    if (listenerRef.current?.destroy) listenerRef.current.destroy();
    listenerRef.current = null;
    setEditMode(false);
    setEditLoading(false);
    setSelectedElement(null);
    setSketchResult(null);
    setEditedElements(new Map());
  }, [sketchResult, token, projectId, toast]);

  /** 从图层列表选中元素（同步画布选框 + 自动滚动到元素位置） */
  const handleSelectElement = useCallback((element: SketchElement) => {
    let action: "select" | "deselect" = "select";
    setSelectedElement((prev) => {
      if (prev?.objectId === element.objectId) {
        action = "deselect";
        return null;
      }
      return element;
    });

    // 副作用放在 setState 外部（React StrictMode 下 updater 可能被调用多次）
    if (action === "deselect") {
      if (listenerRef.current) clearSelection(listenerRef.current);
    } else {
      if (listenerRef.current && sketchResult?.root) {
        selectNode(sketchResult.root, listenerRef.current, element.objectId);
      }
      // 自动滚动：读取 sketch-editor 的选框 DOM 实际位置（由库通过 matrixWorld 计算）
      requestAnimationFrame(() => {
        const container = sketchContainerRef.current;
        if (!container) return;
        const selectEl = container.querySelector(".select") as HTMLElement | null;
        if (!selectEl || selectEl.style.display === "none") return;
        const top = parseFloat(selectEl.style.top) || 0;
        const height = parseFloat(selectEl.style.height) || 0;
        const viewTop = container.scrollTop;
        const viewBottom = viewTop + container.clientHeight;
        if (top < viewTop || top + height > viewBottom) {
          container.scrollTo({ top: Math.max(0, top - 40), behavior: "smooth" });
        }
      });
    }
  }, [sketchResult]);

  /** 更新文字内容（React state + sketch-editor 节点 + 重绘 canvas） */
  const handleUpdateText = useCallback((elementId: string, newContent: string) => {
    // 1. 同步 sketch-editor 内部节点并重绘 canvas
    let canvasUpdated = false;
    if (sketchResult?.root) {
      canvasUpdated = updateNodeText(sketchResult.root, elementId, newContent);
    }

    // 2. 更新 React state（图层面板始终更新）
    setEditedElements((prev) => {
      const next = new Map(prev);
      const original = sketchResult?.elements.find((e) => e.objectId === elementId);
      if (!original || original.props.kind !== "text") return prev;
      next.set(elementId, {
        ...original,
        props: { ...(original.props as TextProps), content: newContent },
      });
      return next;
    });

    // 3. canvas 未更新时提示用户
    if (!canvasUpdated && sketchResult?.root) {
      toast.showToast("画布渲染未更新，但文字已记录");
    }
  }, [sketchResult, toast]);

  /** 通用样式更新（字号、颜色、透明度、可见性、填充色等） */
  const handleUpdateStyle = useCallback((elementId: string, styleUpdates: Record<string, unknown>) => {
    if (!sketchResult?.root) return;
    const canvasUpdated = updateNodeStyle(sketchResult.root, elementId, styleUpdates);

    // 同步 React state
    setEditedElements((prev) => {
      const next = new Map(prev);
      const original = sketchResult.elements.find((e) => e.objectId === elementId);
      if (!original) return prev;
      const merged: SketchElement = { ...original, ...next.get(elementId), ...original };

      // 根据元素类型更新对应的 props
      if (merged.props.kind === "text") {
        const tp = { ...(merged.props as TextProps) };
        if ("opacity" in styleUpdates) merged.opacity = styleUpdates.opacity as number;
        if ("isVisible" in styleUpdates) merged.isVisible = styleUpdates.isVisible as boolean;
        if ("fontSize" in styleUpdates) tp.fontSize = styleUpdates.fontSize as number;
        if ("color" in styleUpdates) tp.color = styleUpdates.color as string;
        if ("textAlign" in styleUpdates) tp.textAlign = styleUpdates.textAlign as "left" | "center" | "right";
        merged.props = tp;
      } else if (merged.props.kind === "image") {
        if ("opacity" in styleUpdates) merged.opacity = styleUpdates.opacity as number;
        if ("isVisible" in styleUpdates) merged.isVisible = styleUpdates.isVisible as boolean;
      } else if (merged.props.kind === "shape") {
        const sp = { ...(merged.props as ShapeProps) };
        if ("opacity" in styleUpdates) merged.opacity = styleUpdates.opacity as number;
        if ("isVisible" in styleUpdates) merged.isVisible = styleUpdates.isVisible as boolean;
        if ("fill" in styleUpdates) sp.fillColor = styleUpdates.fill as string;
        if ("stroke" in styleUpdates) sp.strokeColor = styleUpdates.stroke as string;
        if ("strokeWidth" in styleUpdates) sp.strokeWidth = styleUpdates.strokeWidth as number;
        merged.props = sp;
      }

      next.set(elementId, merged);
      return next;
    });

    if (!canvasUpdated) {
      toast.showToast("画布渲染未更新");
    }
  }, [sketchResult, toast]);

  /** 获取当前有效元素（合并编辑） */
  const getEffectiveElement = useCallback((element: SketchElement): SketchElement => {
    return editedElements.get(element.objectId) ?? element;
  }, [editedElements]);

  /** WebGL canvas 导出 */
  const handleExportCanvas = useCallback(async () => {
    if (!sketchResult?.root || !sketchCanvasRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = exportCanvasAsPng(sketchResult.root, sketchCanvasRef.current);
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `长图编辑_${projectId}_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      toast.error("导出失败，请重试");
    } finally {
      setDownloading(false);
    }
  }, [sketchResult, projectId, toast]);

  /** 保存编辑后的 sketch 文件到 OSS（序列化 → 直传 OSS → 更新数据库 URL） */
  const handleSaveSketch = useCallback(async () => {
    if (!sketchResult?.root || !token) return;
    setSaving(true);
    try {
      // 1. 序列化为 .sketch ArrayBuffer
      const arrayBuffer = await exportSketchFile(sketchResult.root);

      // 2. 获取 OSS 预签名上传 URL
      const { uploadUrl, downloadUrl } = await realBackendApi.imageStep4SketchUploadUrl(token, projectId);

      // 3. 直传 OSS
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/zip" },
        body: arrayBuffer,
      });
      if (!uploadRes.ok) {
        throw new Error(`上传失败: ${uploadRes.status}`);
      }

      // 4. 通知后端更新数据库
      await realBackendApi.imageStep4SaveSketchUrl(token, projectId, downloadUrl);

      // 5. 更新前端状态
      setSketchUrl(downloadUrl);
      toast.showToast("保存成功");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "保存失败，请重试";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [sketchResult, token, projectId, toast]);

  /** 下载长图（非编辑模式） */
  const handleDownload = useCallback(async () => {
    if (!imageUrl || downloading) return;
    setDownloading(true);
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `长图_${projectId}_${Date.now()}.webp`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error("下载失败，请重试");
    } finally {
      setDownloading(false);
    }
  }, [imageUrl, projectId, downloading, toast]);

  /** 打开分享模态框 */
  const handleShare = useCallback(() => {
    setShareModalOpen(true);
  }, []);

  /** 激活历史长图 */
  const handleActivateGeneration = useCallback(async (genId: string) => {
    if (!token || genId === activatingId) return;
    setActivatingId(genId);
    try {
      const result = await realBackendApi.imageStep4ActivateLongImage(token, projectId, genId);
      setImageUrl(result.imageUrl);
      setSketchUrl(result.sketchUrl ?? null);
      setGenerations((prev) => prev.map((g) => ({ ...g, isActive: g.id === genId })));
    } catch (err) {
      const message = err instanceof Error ? err.message : "切换失败";
      toast.error(message);
    } finally {
      setActivatingId(null);
    }
  }, [token, projectId, activatingId, toast]);

  // ========= 渲染 =========

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="material-icons-round text-4xl text-gray-300 animate-spin">autorenew</span>
          <p className="text-sm text-gray-400">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <span className="material-icons-round text-white text-lg">auto_awesome</span>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              {editMode ? "Sketch 编辑模式" : "商详长图"}
            </h2>
            <p className="text-xs text-gray-400">
              {generating ? "AI 正在生成长图..." : editMode ? "在画布上直接选中/拖拽/编辑元素" : imageUrl ? "长图已生成" : "一键生成电商详情长图"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <Button variant="outline" onClick={handleExitEditMode} className="rounded-lg px-4 text-sm">
                <span className="material-icons-round text-base mr-1">close</span>
                退出编辑
              </Button>
              <Button onClick={handleSaveSketch} disabled={saving} className="rounded-lg px-4 text-sm bg-primary hover:bg-primary-hover text-white">
                <span className="material-icons-round text-base mr-1">save</span>
                {saving ? "保存中..." : "保存"}
              </Button>
              <Button onClick={handleExportCanvas} disabled={downloading} className="rounded-lg px-4 text-sm">
                <span className="material-icons-round text-base mr-1">download</span>
                {downloading ? "导出中..." : "导出图片"}
              </Button>
            </>
          ) : imageUrl && !generating ? (
            <>
              {sketchUrl && (
                <Button variant="outline" onClick={handleEnterEditMode} className="rounded-lg px-4 text-sm">
                  <span className="material-icons-round text-base mr-1">edit</span>
                  编辑模式
                </Button>
              )}
              <Button variant="outline" onClick={handleDownload} disabled={downloading} className="rounded-lg px-4 text-sm">
                <span className="material-icons-round text-base mr-1">{downloading ? "hourglass_top" : "download"}</span>
                {downloading ? "下载中..." : "下载长图"}
              </Button>
              <Button onClick={() => { setSelectedTemplateId(null); handleOpenTemplatePicker(); }} className="rounded-lg px-4 text-sm bg-primary hover:bg-primary-hover text-white">
                <span className="material-icons-round text-base mr-1">refresh</span>
                重新生成
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 min-h-0 flex">
        {editMode ? (
          <SketchEditorLayout
            sketchResult={sketchResult}
            selectedElement={selectedElement}
            editedElements={editedElements}
            loading={editLoading}
            canvasRef={sketchCanvasRef}
            containerRef={sketchContainerRef}
            onSelectElement={handleSelectElement}
            onUpdateText={handleUpdateText}
            onUpdateStyle={handleUpdateStyle}
            getEffectiveElement={getEffectiveElement}
          />
        ) : generating ? (
          <GeneratingView />
        ) : showTemplatePicker ? (
          <TemplatePickerView
            templates={templates}
            loading={templatesLoading}
            selectedTemplateId={selectedTemplateId}
            onSelect={setSelectedTemplateId}
            onGenerate={handleGenerate}
            onBack={() => setShowTemplatePicker(false)}
          />
        ) : imageUrl ? (
          <LongImagePreview imageUrl={imageUrl} onShare={handleShare}
            generations={generations} activatingId={activatingId}
            onActivate={handleActivateGeneration}
            onOpenTemplatePicker={handleOpenTemplatePicker}
          />
        ) : (
          <EmptyStateView
            onGenerate={handleGenerate}
            onOpenTemplatePicker={handleOpenTemplatePicker}
          />
        )}
      </div>

      {/* 底部工具条 */}
      {!editMode && !showTemplatePicker && (
        <BottomToolbar
          generating={generating}
          imageUrl={imageUrl}
          downloading={downloading}
          kind={kind}
          projectId={projectId}
          navigate={navigate}
          onGenerate={handleGenerate}
          onDownload={handleDownload}
          onOpenTemplatePicker={handleOpenTemplatePicker}
        />
      )}

      {/* 分享弹窗（与视频项目一致） */}
      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        shareUrl={`${window.location.origin}/share-image/${projectId}`}
        description="将商详长图分享给好友查看"
        tipText="无需登录即可查看，包含完整商详长图"
      />
    </div>
  );
};

// ========== 子组件 ==========

/** Sketch WebGL 编辑器布局 */
const SketchEditorLayout: React.FC<{
  sketchResult: SketchParseResult | null;
  selectedElement: SketchElement | null;
  editedElements: Map<string, SketchElement>;
  loading: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onSelectElement: (element: SketchElement) => void;
  onUpdateText: (elementId: string, content: string) => void;
  onUpdateStyle: (elementId: string, updates: Record<string, unknown>) => void;
  getEffectiveElement: (element: SketchElement) => SketchElement;
}> = ({ sketchResult, selectedElement, editedElements, loading, canvasRef, containerRef, onSelectElement, onUpdateText, onUpdateStyle, getEffectiveElement }) => {
  const textElements = sketchResult?.elements.filter((e) => e.props.kind === "text") ?? [];
  const imageElements = sketchResult?.elements.filter((e) => e.props.kind === "image") ?? [];
  const shapeElements = sketchResult?.elements.filter((e) => e.props.kind === "shape") ?? [];

  return (
    <div className="flex flex-1 min-h-0">
      {/* 左侧：图层列表（容器始终占位，保证 canvas 容器宽度测量正确） */}
      <div className="w-56 border-r border-gray-200 bg-white overflow-y-auto flex-shrink-0">
        {!loading && (
        <div className="p-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">图层</p>
          {textElements.length > 0 && (
            <LayerSection title="文字" icon="text_fields" elements={textElements}
              selectedId={selectedElement?.objectId} onClick={onSelectElement} getEffective={getEffectiveElement} />
          )}
          {imageElements.length > 0 && (
            <LayerSection title="图片" icon="image" elements={imageElements}
              selectedId={selectedElement?.objectId} onClick={onSelectElement} getEffective={getEffectiveElement} />
          )}
          {shapeElements.length > 0 && (
            <LayerSection title="形状" icon="category" elements={shapeElements}
              selectedId={selectedElement?.objectId} onClick={onSelectElement} getEffective={getEffectiveElement} />
          )}
          {textElements.length === 0 && imageElements.length === 0 && shapeElements.length === 0 && (
            <p className="text-xs text-gray-400 py-4 text-center">无可编辑图层</p>
          )}
        </div>
        )}
      </div>

      {/* 中间：WebGL Canvas */}
      {/* sketch-editor Select/Hover/Frame 覆盖层样式 */}
      <style>{`
        [data-sketch-editor] .select {
          position: absolute; left: 0; top: 0; transform-origin: 0 0;
        }
        [data-sketch-editor] .select .l {
          position: absolute; left: -2px; top: 0; width: 4px; height: 100%;
          cursor: ew-resize; pointer-events: auto;
        }
        [data-sketch-editor] .select .l b {
          position: absolute; left: 2px; top: 0; width: 0; height: 100%;
          border-left: 0.5px solid #F43; box-shadow: 0 0 2px rgba(0,0,0,0.5); pointer-events: none;
        }
        [data-sketch-editor] .select .t {
          position: absolute; left: 0; top: -2px; width: 100%; height: 4px;
          cursor: ns-resize; pointer-events: auto;
        }
        [data-sketch-editor] .select .t b {
          position: absolute; left: 0; top: 2px; width: 100%; height: 0;
          border-top: 0.5px solid #F43; box-shadow: 0 0 2px rgba(0,0,0,0.5); pointer-events: none;
        }
        [data-sketch-editor] .select .r {
          position: absolute; top: 0; right: -2px; width: 4px; height: 100%;
          cursor: ew-resize; pointer-events: auto;
        }
        [data-sketch-editor] .select .r b {
          position: absolute; right: 2px; top: 0; width: 0; height: 100%;
          border-right: 0.5px solid #F43; box-shadow: 0 0 2px rgba(0,0,0,0.5); pointer-events: none;
        }
        [data-sketch-editor] .select .b {
          position: absolute; left: 0; bottom: -2px; width: 100%; height: 4px;
          cursor: ns-resize; pointer-events: auto;
        }
        [data-sketch-editor] .select .b b {
          position: absolute; left: 0; bottom: 2px; width: 100%; height: 0;
          border-bottom: 0.5px solid #F43; box-shadow: 0 0 2px rgba(0,0,0,0.5); pointer-events: none;
        }
        [data-sketch-editor] .select .tl {
          position: absolute; left: 0; top: 0; width: 8px; height: 8px;
          transform: translate(-50%, -50%); cursor: nwse-resize; pointer-events: auto;
        }
        [data-sketch-editor] .select .tr {
          position: absolute; right: 0; top: 0; width: 8px; height: 8px;
          transform: translate(50%, -50%); cursor: nesw-resize; pointer-events: auto;
        }
        [data-sketch-editor] .select .br {
          position: absolute; right: 0; bottom: 0; width: 8px; height: 8px;
          transform: translate(50%, 50%); cursor: nwse-resize; pointer-events: auto;
        }
        [data-sketch-editor] .select .bl {
          position: absolute; left: 0; bottom: 0; width: 8px; height: 8px;
          transform: translate(-50%, 50%); cursor: nesw-resize; pointer-events: auto;
        }
        [data-sketch-editor] .select .tl b,
        [data-sketch-editor] .select .tr b,
        [data-sketch-editor] .select .br b,
        [data-sketch-editor] .select .bl b {
          position: absolute; box-sizing: border-box; width: 100%; height: 100%;
          border: 0.5px solid #999; background: #FFF; box-shadow: 0 0 2px rgba(0,0,0,0.5); pointer-events: none;
        }
        [data-sketch-editor] .hover {
          position: absolute; left: 0; top: 0; box-sizing: border-box;
          border: 2px solid #F43; box-shadow: 0 0 3px rgba(0,0,0,0.5);
          transform-origin: 0 0; pointer-events: none;
        }
        [data-sketch-editor] .frame {
          position: absolute; left: 0; top: 0; box-sizing: border-box;
          border: 1px solid rgba(0,0,0,0.1); background: rgba(0,0,0,0.05);
          transform-origin: 0 0; pointer-events: none;
        }
      `}</style>
      <div ref={containerRef} data-sketch-editor className="flex-1 min-h-0 bg-neutral-200 relative overflow-y-auto overflow-x-hidden">
        <canvas ref={canvasRef} className="block mx-auto" style={{ cursor: "default" }} />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-200 z-10">
            <div className="flex flex-col items-center gap-3">
              <span className="material-icons-round text-3xl text-violet-400 animate-spin">autorenew</span>
              <p className="text-sm text-gray-400">加载 Sketch 编辑器...</p>
            </div>
          </div>
        )}
      </div>

      {/* 右侧：属性面板（容器始终占位，保证 canvas 容器宽度测量正确） */}
      <div className="w-64 border-l border-gray-200 bg-white overflow-y-auto flex-shrink-0">
        {!loading && (
        <div className="p-3">
          {selectedElement ? (
            <PropertyPanel element={getEffectiveElement(selectedElement)} onUpdateText={onUpdateText} onUpdateStyle={onUpdateStyle} />
          ) : (
            <div className="text-center py-10">
              <span className="material-icons-round text-2xl text-gray-300">touch_app</span>
              <p className="text-xs text-gray-400 mt-2">在画布上点击元素查看属性</p>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
};

/** 图层分区 */
const LayerSection: React.FC<{
  title: string;
  icon: string;
  elements: SketchElement[];
  selectedId?: string;
  onClick: (element: SketchElement) => void;
  getEffective: (element: SketchElement) => SketchElement;
}> = ({ title, icon, elements, selectedId, onClick, getEffective }) => (
  <div className="mb-3">
    <div className="flex items-center gap-1.5 mb-1.5">
      <span className="material-icons-round text-xs text-gray-400">{icon}</span>
      <p className="text-xs font-medium text-gray-600">{title} ({elements.length})</p>
    </div>
    <div className="space-y-0.5">
      {elements.map((element) => {
        const effective = getEffective(element);
        const isSelected = selectedId === element.objectId;
        return (
          <button
            key={element.objectId}
            onClick={() => onClick(element)}
            className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${
              isSelected ? "bg-violet-50 text-violet-700" : "hover:bg-gray-50 text-gray-600"
            }`}
          >
            <span className="truncate block">{effective.name}</span>
            {effective.props.kind === "text" && (
              <span className="text-[10px] text-gray-400 truncate block">
                {(effective.props as TextProps).content.slice(0, 30)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  </div>
);

/** 属性面板（含所有类型编辑） */
const PropertyPanel: React.FC<{
  element: SketchElement;
  onUpdateText: (elementId: string, content: string) => void;
  onUpdateStyle: (elementId: string, updates: Record<string, unknown>) => void;
}> = ({ element, onUpdateText, onUpdateStyle }) => (
  <div>
    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">属性</p>
    <div className="space-y-2.5">
      <div>
        <label className="text-[10px] text-gray-400">名称</label>
        <p className="text-xs font-medium text-gray-800">{element.name}</p>
      </div>
      <div>
        <label className="text-[10px] text-gray-400">类型</label>
        <p className="text-xs text-gray-700">{element.type}</p>
      </div>
      <div>
        <label className="text-[10px] text-gray-400">位置/尺寸</label>
        <p className="text-xs text-gray-600">
          {Math.round(element.frame.width)}×{Math.round(element.frame.height)}
          {" "}@ ({Math.round(element.frame.x)}, {Math.round(element.frame.y)})
        </p>
      </div>

      {/* 按类型渲染专属编辑器 */}
      {element.props.kind === "text" && (
        <TextPropertyEditor element={element} onUpdateText={onUpdateText} onUpdateStyle={onUpdateStyle} />
      )}
      {element.props.kind === "image" && (
        <ImagePropertyEditor element={element} onUpdateStyle={onUpdateStyle} />
      )}
      {element.props.kind === "shape" && (
        <ShapePropertyEditor element={element} onUpdateStyle={onUpdateStyle} />
      )}

      {/* 通用：不透明度 + 可见性 */}
      <CommonPropertyEditor element={element} onUpdateStyle={onUpdateStyle} />
    </div>
  </div>
);

/** 通用属性编辑器：不透明度、可见性 */
const CommonPropertyEditor: React.FC<{
  element: SketchElement;
  onUpdateStyle: (elementId: string, updates: Record<string, unknown>) => void;
}> = ({ element, onUpdateStyle }) => (
  <div className="pt-2 border-t border-gray-100 space-y-2.5">
    <div>
      <label className="text-[10px] text-gray-400 mb-1 block">不透明度 {Math.round(element.opacity * 100)}%</label>
      <input
        type="range" min={0} max={100} step={1}
        value={Math.round(element.opacity * 100)}
        onChange={(e) => onUpdateStyle(element.objectId, { opacity: Number(e.target.value) / 100 })}
        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-violet-500"
      />
    </div>
    <div className="flex items-center justify-between">
      <label className="text-[10px] text-gray-400">可见性</label>
      <button
        onClick={() => onUpdateStyle(element.objectId, { isVisible: !element.isVisible })}
        className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
          element.isVisible ? "border-green-300 text-green-600 bg-green-50" : "border-red-300 text-red-500 bg-red-50"
        }`}
      >
        {element.isVisible ? "显示" : "隐藏"}
      </button>
    </div>
  </div>
);

/** 文字编辑器（扩展：字号、颜色、对齐均可编辑） */
const TextPropertyEditor: React.FC<{
  element: SketchElement;
  onUpdateText: (elementId: string, content: string) => void;
  onUpdateStyle: (elementId: string, updates: Record<string, unknown>) => void;
}> = ({ element, onUpdateText, onUpdateStyle }) => {
  const textProps = element.props as TextProps;
  const [localValue, setLocalValue] = useState(textProps.content);

  // 切换选中元素时同步本地状态
  useEffect(() => {
    setLocalValue(textProps.content);
  }, [element.objectId, textProps.content]);

  return (
    <div className="pt-2 border-t border-gray-100 space-y-2">
      <div>
        <label className="text-[10px] text-gray-400 mb-1 block">文字内容</label>
        <textarea
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={() => onUpdateText(element.objectId, localValue)}
          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs resize-none focus:ring-1 focus:ring-violet-300 focus:border-violet-300 outline-none"
          rows={3}
        />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <label className="text-[10px] text-gray-400">字体</label>
          <p className="text-[10px] text-gray-600">{textProps.fontFamily}</p>
        </div>
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">字号</label>
          <input
            type="number" min={6} max={200}
            value={textProps.fontSize}
            onChange={(e) => onUpdateStyle(element.objectId, { fontSize: Number(e.target.value) })}
            className="w-full border border-gray-200 rounded px-1.5 py-0.5 text-[10px] focus:ring-1 focus:ring-violet-300 outline-none"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">颜色</label>
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={textProps.color}
              onChange={(e) => onUpdateStyle(element.objectId, { color: e.target.value })}
              className="w-5 h-5 rounded border border-gray-200 cursor-pointer"
            />
            <span className="text-[10px] text-gray-600">{textProps.color}</span>
          </div>
        </div>
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">对齐</label>
          <div className="flex gap-0.5">
            {(["left", "center", "right"] as const).map((align) => (
              <button
                key={align}
                onClick={() => onUpdateStyle(element.objectId, { textAlign: align })}
                className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                  textProps.textAlign === align
                    ? "border-violet-300 bg-violet-50 text-violet-600"
                    : "border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
              >
                {align === "left" ? "左" : align === "center" ? "中" : "右"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/** 图片属性编辑器 */
const ImagePropertyEditor: React.FC<{
  element: SketchElement;
  onUpdateStyle: (elementId: string, updates: Record<string, unknown>) => void;
}> = ({ element, onUpdateStyle }) => {
  const imgProps = element.props as ImageProps;
  const [scaleMode, setScaleMode] = useState<"fill" | "contain" | "cover">("fill");

  return (
    <div className="pt-2 border-t border-gray-100 space-y-2">
      <div>
        <label className="text-[10px] text-gray-400 mb-1 block">缩放模式</label>
        <div className="flex gap-0.5">
          {(["fill", "contain", "cover"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => { setScaleMode(mode); onUpdateStyle(element.objectId, { scaleMode: mode }); }}
              className={`flex-1 px-1 py-0.5 text-[10px] rounded border transition-colors ${
                scaleMode === mode
                  ? "border-violet-300 bg-violet-50 text-violet-600"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              {mode === "fill" ? "填充" : mode === "contain" ? "适应" : "裁切"}
            </button>
          ))}
        </div>
      </div>
      {imgProps.imageUrl && (
        <div>
          <label className="text-[10px] text-gray-400">图片源</label>
          <p className="text-[10px] text-gray-600 truncate">{imgProps.imageRef || "内嵌图片"}</p>
        </div>
      )}
    </div>
  );
};

/** 形状属性编辑器 */
const ShapePropertyEditor: React.FC<{
  element: SketchElement;
  onUpdateStyle: (elementId: string, updates: Record<string, unknown>) => void;
}> = ({ element, onUpdateStyle }) => {
  const shapeProps = element.props as ShapeProps;

  return (
    <div className="pt-2 border-t border-gray-100 space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">填充色</label>
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={shapeProps.fillColor ?? "#000000"}
              onChange={(e) => onUpdateStyle(element.objectId, { fill: [e.target.value] })}
              className="w-5 h-5 rounded border border-gray-200 cursor-pointer"
            />
            <span className="text-[10px] text-gray-600">{shapeProps.fillColor ?? "无"}</span>
          </div>
        </div>
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">描边色</label>
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={shapeProps.strokeColor ?? "#000000"}
              onChange={(e) => onUpdateStyle(element.objectId, { stroke: [e.target.value] })}
              className="w-5 h-5 rounded border border-gray-200 cursor-pointer"
            />
            <span className="text-[10px] text-gray-600">{shapeProps.strokeColor ?? "无"}</span>
          </div>
        </div>
      </div>
      <div>
        <label className="text-[10px] text-gray-400 mb-1 block">描边宽度 {shapeProps.strokeWidth}px</label>
        <input
          type="range" min={0} max={20} step={1}
          value={shapeProps.strokeWidth}
          onChange={(e) => onUpdateStyle(element.objectId, { strokeWidth: [Number(e.target.value)] })}
          className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-violet-500"
        />
      </div>
    </div>
  );
};

/** 生成中视图 */
const GeneratingView: React.FC = () => (
  <div className="flex-1 flex items-center justify-center bg-gray-50">
    <div className="flex flex-col items-center gap-6 py-20">
      <div className="relative">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center">
          <span className="material-icons-round text-3xl text-violet-600 animate-pulse">auto_awesome</span>
        </div>
        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-violet-500 flex items-center justify-center">
          <span className="material-icons-round text-white text-xs animate-spin">autorenew</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-base font-medium text-gray-700">正在生成商详长图</p>
        <p className="text-sm text-gray-400 mt-1">AI 正在分析产品图片并生成详情页，预计 1-3 分钟</p>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "0ms" }} />
        <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "150ms" }} />
        <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  </div>
);

/** 长图预览（手机壳模拟 + 历史条 + 分享引导） */
const LongImagePreview: React.FC<{
  imageUrl: string;
  onShare?: () => void;
  generations: LongImageGenerationItem[];
  activatingId: string | null;
  onActivate: (genId: string) => void;
  onOpenTemplatePicker: () => void;
}> = ({ imageUrl, onShare, generations, activatingId, onActivate, onOpenTemplatePicker }) => (
  <div className="flex-1 min-h-0 flex items-center justify-center bg-gray-50">
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-6 xl:gap-8">
      {/* 历史记录条（左侧竖排） */}
      {generations.length > 0 && (
        <div className="flex flex-col gap-2 py-2 max-h-[640px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {generations.map((gen) => (
            <button
              key={gen.id}
              onClick={() => onActivate(gen.id)}
              disabled={activatingId === gen.id}
              className={`relative flex-shrink-0 w-14 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                gen.isActive
                  ? "border-violet-500 shadow-sm"
                  : "border-gray-200 hover:border-gray-300 opacity-70 hover:opacity-100"
              } ${activatingId === gen.id ? "animate-pulse" : ""}`}
            >
              <img loading="lazy" src={gen.imageUrl} alt={gen.templateName ?? "长图"} className="w-full h-full object-cover" />
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent px-1 py-0.5">
                <p className="text-[8px] text-white truncate leading-tight">
                  {gen.templateName ?? "AI生成"}
                </p>
              </div>
            </button>
          ))}
          {/* 换模板按钮 */}
          <button
            onClick={onOpenTemplatePicker}
            className="flex-shrink-0 w-14 h-20 rounded-lg border-2 border-dashed border-gray-300 hover:border-violet-400 hover:bg-violet-50 transition-colors flex flex-col items-center justify-center gap-0.5 group"
          >
            <span className="material-icons-round text-lg text-gray-400 group-hover:text-violet-500">add</span>
            <span className="text-[8px] text-gray-400 leading-tight">换模板</span>
          </button>
        </div>
      )}

      {/* 手机壳 */}
      <div className="relative w-[320px] rounded-[36px] border-[6px] border-gray-800 bg-gray-900 overflow-hidden shadow-2xl shadow-black/20">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-gray-800 rounded-b-xl z-10" />
        <div className="bg-white h-[640px] overflow-y-auto phone-scroll pt-8">
          <img loading="lazy" src={imageUrl} alt="商详长图" className="w-full h-auto" />
        </div>
      </div>

        {/* 分享引导卡片（桌面端） */}
        {onShare && (
          <div className="hidden xl:flex flex-col items-center justify-center w-[220px] shrink-0 gap-5">
            {/* 分享传播动画 */}
            <div className="relative w-[180px] h-[200px]">
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="relative">
                  <div className="w-[56px] h-[56px] rounded-full bg-gradient-to-br from-blue-500/80 to-cyan-500/80 flex items-center justify-center shadow-lg shadow-blue-500/30">
                    <span className="material-icons-round text-white text-2xl">share</span>
                  </div>
                  <div className="absolute inset-0 rounded-full border-2 border-blue-400/50 animate-ping" style={{ animationDuration: "2s" }} />
                  <div className="absolute -inset-3 rounded-full border border-blue-300/30 animate-ping" style={{ animationDuration: "3s" }} />
                </div>
              </div>
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 180 200" fill="none">
                <line x1="90" y1="100" x2="30" y2="40" stroke="url(#share-grad-img)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" />
                <line x1="90" y1="100" x2="150" y2="40" stroke="url(#share-grad-img)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" />
                <line x1="90" y1="100" x2="20" y2="100" stroke="url(#share-grad-img)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5" />
                <line x1="90" y1="100" x2="160" y2="100" stroke="url(#share-grad-img)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5" />
                <line x1="90" y1="100" x2="40" y2="160" stroke="url(#share-grad-img)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4" />
                <line x1="90" y1="100" x2="140" y2="160" stroke="url(#share-grad-img)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4" />
                <defs>
                  <linearGradient id="share-grad-img" x1="90" y1="100" x2="160" y2="40">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute left-[15px] top-[35px] w-[36px] h-[36px] rounded-full bg-blue-50 border border-blue-300/70 flex items-center justify-center shadow-sm">
                <span className="material-icons-round text-blue-500 text-sm">person</span>
              </div>
              <div className="absolute left-[130px] top-[35px] w-[36px] h-[36px] rounded-full bg-blue-50 border border-blue-300/70 flex items-center justify-center shadow-sm">
                <span className="material-icons-round text-blue-500 text-sm">person</span>
              </div>
              <div className="absolute left-[5px] top-[90px] w-[32px] h-[32px] rounded-full bg-blue-100/70 border border-blue-200/60 flex items-center justify-center">
                <span className="material-icons-round text-blue-400 text-xs">visibility</span>
              </div>
              <div className="absolute left-[145px] top-[90px] w-[32px] h-[32px] rounded-full bg-blue-100/70 border border-blue-200/60 flex items-center justify-center">
                <span className="material-icons-round text-blue-400 text-xs">visibility</span>
              </div>
              <div className="absolute left-[25px] top-[155px] w-[28px] h-[28px] rounded-full bg-blue-100/50 border border-blue-200/40 flex items-center justify-center">
                <span className="material-icons-round text-blue-300/70 text-xs">thumb_up</span>
              </div>
              <div className="absolute left-[125px] top-[155px] w-[28px] h-[28px] rounded-full bg-blue-100/50 border border-blue-200/40 flex items-center justify-center">
                <span className="material-icons-round text-blue-300/70 text-xs">favorite</span>
              </div>
            </div>

            {/* 分享按钮 */}
            <button type="button" onClick={onShare}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold text-base shadow-lg shadow-blue-500/30 hover:from-blue-600 hover:to-cyan-600 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-105 transition-all duration-200 flex items-center gap-2">
              <span className="material-icons-round text-xl">share</span>
              分享作品
              <span className="material-icons-round text-lg">arrow_forward</span>
            </button>
            <p className="text-[11px] text-gray-400 text-center">生成链接分享给好友 · 可选</p>
          </div>
        )}
      </div>

      {/* 移动端分享按钮 */}
      {onShare && (
        <button type="button" onClick={onShare}
          className="xl:hidden mt-4 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold text-sm shadow-lg shadow-blue-500/30 hover:from-blue-600 hover:to-cyan-600 transition-all duration-200 flex items-center gap-2">
          <span className="material-icons-round text-lg">share</span>
          分享作品
        </button>
      )}
    </div>
  </div>
);

/** 空状态 */
const EmptyStateView: React.FC<{
  onGenerate: () => void;
  onOpenTemplatePicker: () => void;
}> = ({ onGenerate, onOpenTemplatePicker }) => (
  <div className="flex-1 min-h-0 flex items-center justify-center bg-gray-50">
    <div className="flex flex-col items-center gap-6 py-20">
      <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100 flex items-center justify-center">
        <span className="material-icons-round text-4xl text-violet-300">image</span>
      </div>
      <div className="text-center max-w-md">
        <p className="text-lg font-medium text-gray-700">一键生成商详长图</p>
        <p className="text-sm text-gray-400 mt-2">
          AI 将基于已上传的产品图片和卖点信息，自动生成完整的电商详情长图
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onOpenTemplatePicker}
	          className="rounded-xl px-6 py-3 text-sm"
	        >
          <span className="material-icons-round text-lg mr-2">dashboard_customize</span>
          选择模板
        </Button>
        <Button onClick={onGenerate}
          className="rounded-xl px-8 py-3 bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/20 text-base font-medium transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <span className="material-icons-round text-lg mr-2">auto_awesome</span>
          快速生成
        </Button>
      </div>
      <p className="text-xs text-gray-400">「快速生成」将由 AI 自动选择模板；「选择模板」可手动指定样式</p>
    </div>
  </div>
);

/** 模板选择器（含大图预览） */
const TemplatePickerView: React.FC<{
  templates: WanxiangTemplate[];
  loading: boolean;
  selectedTemplateId: string | null;
  onSelect: (id: string | null) => void;
  onGenerate: () => void;
  onBack: () => void;
}> = ({ templates, loading, selectedTemplateId, onSelect, onGenerate, onBack }) => {
  const [previewing, setPreviewing] = useState<WanxiangTemplate | null>(null);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-gray-50">
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <span className="material-icons-round text-xl text-gray-600">arrow_back</span>
          </button>
          <div>
            <p className="text-sm font-semibold text-gray-900">选择模板</p>
            <p className="text-xs text-gray-400">点击模板预览大图，选择后生成</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedTemplateId && (
            <Button variant="ghost" onClick={() => onSelect(null)} className="rounded-lg px-3 text-xs text-gray-500 hover:text-gray-700">
              取消选择
            </Button>
          )}
          <Button onClick={onGenerate} className="rounded-lg px-5 py-2 bg-primary hover:bg-primary-hover text-white text-sm font-medium">
            <span className="material-icons-round text-base mr-1">auto_awesome</span>
            {selectedTemplateId ? "使用此模板生成" : "AI 自动选择生成"}
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <span className="material-icons-round text-3xl text-violet-400 animate-spin">autorenew</span>
              <p className="text-sm text-gray-400">加载模板中...</p>
            </div>
          </div>
        ) : templates.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <span className="material-icons-round text-3xl text-gray-300">dashboard_customize</span>
              <p className="text-sm text-gray-400">暂无可用模板</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
            <button onClick={() => onSelect(null)}
              className={`group relative rounded-xl overflow-hidden border-2 transition-all ${
                selectedTemplateId === null ? "border-violet-400 ring-2 ring-violet-100 shadow-md" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="aspect-[3/4] bg-gradient-to-br from-violet-50 to-purple-100 flex flex-col items-center justify-center gap-3">
                <span className="material-icons-round text-3xl text-violet-400">auto_awesome</span>
                <p className="text-sm font-medium text-violet-600">AI 自动选择</p>
              </div>
              {selectedTemplateId === null && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center">
                  <span className="material-icons-round text-white text-xs">check</span>
                </div>
              )}
            </button>
            {templates.map((tpl) => (
              <button key={tpl.templateId} onClick={() => setPreviewing(tpl)}
                className={`group relative rounded-xl overflow-hidden border-2 transition-all ${
                  selectedTemplateId === tpl.templateId ? "border-violet-400 ring-2 ring-violet-100 shadow-md" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="aspect-[3/4] bg-white">
                  {tpl.thumbnailUrl ? (
                    <img loading="lazy" src={tpl.thumbnailUrl} alt={tpl.templateName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100">
                      <span className="material-icons-round text-2xl text-gray-300">image</span>
                    </div>
                  )}
                </div>
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-3 pt-8">
                  <p className="text-xs font-medium text-white truncate">{tpl.templateName}</p>
                  {tpl.category && <p className="text-[10px] text-white/70 mt-0.5">{tpl.category}</p>}
                </div>
                {selectedTemplateId === tpl.templateId && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center">
                    <span className="material-icons-round text-white text-xs">check</span>
                  </div>
                )}
                {/* 悬浮预览提示 */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                  <span className="material-icons-round text-white text-2xl opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg">zoom_in</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 大图预览模态框 */}
      {previewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setPreviewing(null)}>
          {/* 遮罩 */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          {/* 内容面板 */}
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-xl w-full mx-4 flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 顶栏：关闭 + 模板名 */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{previewing.templateName}</p>
                {previewing.category && (
                  <span className="text-xs text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full flex-shrink-0">{previewing.category}</span>
                )}
              </div>
              <button onClick={() => setPreviewing(null)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors flex-shrink-0 ml-2">
                <span className="material-icons-round text-gray-400 text-lg">close</span>
              </button>
            </div>

            {/* 可滚动图片区域 */}
            <div className="flex-1 min-h-0 overflow-auto bg-gray-50">
              {previewing.thumbnailUrl ? (
                <img loading="lazy" src={previewing.thumbnailUrl} alt={previewing.templateName}
                  className="w-full h-auto" />
              ) : (
                <div className="flex items-center justify-center py-20">
                  <span className="material-icons-round text-4xl text-gray-300">image</span>
                </div>
              )}
            </div>

            {/* 底栏：操作按钮 */}
            <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0">
              {previewing.description && (
                <p className="text-xs text-gray-500 mb-3">{previewing.description}</p>
              )}
              <div className="flex items-center gap-3">
                <Button onClick={() => { onSelect(previewing.templateId); setPreviewing(null); }}
                  className="flex-1 rounded-xl py-2.5 bg-primary hover:bg-primary-hover text-white text-sm font-medium">
                  <span className="material-icons-round text-base mr-1">check_circle</span>
                  使用此模板
                </Button>
                <Button variant="outline" onClick={() => setPreviewing(null)}
                  className="rounded-xl px-5 py-2.5 text-sm">
                  取消
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** 底部工具条 */
const BottomToolbar: React.FC<{
  generating: boolean;
  imageUrl: string | null;
  downloading: boolean;
  kind: "image" | "video";
  projectId: string;
  navigate: ReturnType<typeof useNavigate>;
  onGenerate: () => void;
  onDownload: () => void;
  onOpenTemplatePicker: () => void;
}> = ({ generating, imageUrl, downloading, kind, projectId, navigate, onGenerate, onDownload, onOpenTemplatePicker }) => (
  <div className="fixed bottom-6 inset-x-0 flex items-center justify-center z-40 pointer-events-none">
    <div className="bg-white border border-gray-200 rounded-full px-2 py-2 shadow-xl shadow-gray-200/50 pointer-events-auto flex items-center gap-4 max-w-[90%] md:max-w-none">
      <Button variant="ghost" onClick={() => { navigate(resolveStep4FooterPreviousRoute(kind, projectId)); }}
        className="rounded-full px-4 text-gray-500 hover:text-gray-900 whitespace-nowrap">
        <span className="material-icons-round text-lg mr-1">arrow_back</span>
        <span className="hidden md:inline">上一步</span>
      </Button>
      <div className="h-4 w-px bg-gray-200" />
      <div className="text-[10px] text-gray-400 font-medium px-2 whitespace-nowrap">
        {generating ? "长图生成中..." : imageUrl ? "长图已就绪" : "点击生成长图"}
      </div>
      <div className="h-4 w-px bg-gray-200" />
      {generating ? (
        <Button disabled className="rounded-full px-6 bg-gray-300 text-gray-500 whitespace-nowrap">
          <span className="material-icons-round animate-spin text-lg mr-1">autorenew</span>
          生成中...
        </Button>
      ) : !imageUrl ? (
        <Button onClick={onGenerate}
          className="rounded-full px-6 bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/20 whitespace-nowrap transition-transform animate-pulse-scale">
          <span className="material-icons-round text-lg">auto_awesome</span>
          快速生成
        </Button>
      ) : (
        <>
          <Button variant="outline" onClick={onOpenTemplatePicker} className="rounded-full px-4 whitespace-nowrap">
            <span className="material-icons-round text-lg mr-1">dashboard_customize</span>
            <span className="hidden sm:inline">换模板</span>
          </Button>
          <Button variant="outline" onClick={onDownload} disabled={downloading} className="rounded-full px-6 whitespace-nowrap">
            <span className="material-icons-round text-lg mr-1">download</span>
            下载
          </Button>
        </>
      )}
    </div>
  </div>
);
