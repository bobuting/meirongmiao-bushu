/**
 * sketch-parser.ts — 基于 sketch-editor 库的 Sketch 源文件解析器
 *
 * 核心职责：
 * 1. 动态加载 sketch-editor（懒加载，减小首屏包体积）
 * 2. 解析 .sketch 文件并创建 WebGL 渲染 Root
 * 3. 从 Root 节点树提取可编辑元素列表
 *
 * sketch-editor 的 Root + Listener 提供完整的可视化编辑能力：
 * - WebGL canvas 渲染
 * - 鼠标选中/拖拽/缩放
 * - 文字编辑
 * - 导出
 */

import SketchEditor from "sketch-editor";
type SketchRoot = ReturnType<typeof SketchEditor.parse>;

// ========== 类型定义（保持与 ImageEcommerceEditor 兼容） ==========

/** 可编辑元素类型 */
export type SketchElementType = "text" | "image" | "shape" | "group";

/** 可编辑元素 */
export interface SketchElement {
  objectId: string;
  name: string;
  type: SketchElementType;
  frame: { x: number; y: number; width: number; height: number };
  rotation: number;
  opacity: number;
  isLocked: boolean;
  isVisible: boolean;
  children?: SketchElement[];
  props: TextProps | ImageProps | ShapeProps;
}

/** 文字属性 */
export interface TextProps {
  kind: "text";
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  textAlign: "left" | "center" | "right";
  lineHeight: number | null;
}

/** 图片属性 */
export interface ImageProps {
  kind: "image";
  imageRef: string;
  imageUrl?: string;
}

/** 形状属性 */
export interface ShapeProps {
  kind: "shape";
  shapeType: "rectangle" | "oval" | "shapePath" | "polygon";
  fillColor: string | null;
  strokeColor: string | null;
  strokeWidth: number;
  cornerRadius: number;
}

/** sketch-editor 内部节点样式（关键字段） */
interface NodeStyle {
  left?: number | string;
  top?: number | string;
  width?: number | string;
  height?: number | string;
  opacity?: number;
  visibility?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;
  color?: string | number[];
  textAlign?: string;
  lineHeight?: number | string;
  fill?: Array<string | number[]>;
  stroke?: Array<string | number[]>;
  strokeWidth?: number[];
}

/** sketch-editor 节点 props 中的关键字段 */
interface SketchNodeProps {
  uuid: string;
  name: string;
  textBehaviour?: unknown;
  src?: string;
  href?: string;
  content?: string;
  isLocked?: boolean;
  [key: string]: unknown;
}

/** sketch-editor 内部节点（关键字段） */
interface SketchNodeLike {
  style?: NodeStyle;
  children?: SketchNodeLike[];
  props?: SketchNodeProps;
}

/** 解析结果 */
export interface SketchParseResult {
  documentSize: { width: number; height: number };
  elements: SketchElement[];
  imageBlobs: Map<string, Blob>;
  /** sketch-editor Root 实例（用于交互和导出） */
  root: SketchRoot;
}

// ========== 动态加载 ==========

/** 动态导入 sketch-editor（懒加载） */
let cachedModule: typeof import("sketch-editor") | null = null;

async function loadSketchEditor(): Promise<typeof import("sketch-editor")> {
  if (!cachedModule) {
    cachedModule = await import("sketch-editor");
    await import("sketch-editor/style");
  }
  return cachedModule;
}

// ========== 解析函数 ==========

/**
 * 解析 .sketch 文件并创建 sketch-editor Root（带 WebGL 渲染）
 *
 * @param data .sketch 文件的 ArrayBuffer
 * @param canvas HTMLCanvasElement，sketch-editor 将 WebGL 渲染到此 canvas
 */
export async function parseSketchFile(
  data: ArrayBuffer,
  canvas: HTMLCanvasElement,
): Promise<SketchParseResult> {
  const mod = await loadSketchEditor();

  // 1. 解析 .sketch ZIP → JFile
  const jfile = await mod.default.openAndConvertSketchBuffer(data);

  // 2. 创建 Root 并渲染到 canvas（preserveDrawingBuffer 确保导出时不空白）
  const root = mod.default.parse(jfile, {
    canvas,
    contextAttributes: { preserveDrawingBuffer: true },
  });

  // 3. 修正 page 尺寸：万相营造生成的 Sketch 文件 page 尺寸为 100x100，
  //    实际画板内容尺寸在第一个子节点上，需要同步到 page 使 zoomFit() 正确
  const elements: SketchElement[] = [];
  let maxWidth = 0;
  let maxHeight = 0;

  const pages = root.getPages();
  for (const page of pages) {
    // 修正 page 尺寸为画板子节点尺寸
    const firstChild = (page as unknown as SketchNodeLike).children?.[0];
    if (firstChild?.style) {
      const cw = numVal(firstChild.style.width);
      const ch = numVal(firstChild.style.height);
      if (cw > 0 && ch > 0 && (page as unknown as SketchNodeLike).style) {
        const ps = (page as unknown as SketchNodeLike).style!;
        const pw = numVal(ps.width);
        const ph = numVal(ps.height);
        if (pw < cw || ph < ch) {
          if (typeof ps.width === "object" && "v" in (ps.width as object)) {
            (ps.width as { v: number }).v = cw;
          } else {
            ps.width = cw as unknown as typeof ps.width;
          }
          if (typeof ps.height === "object" && "v" in (ps.height as object)) {
            (ps.height as { v: number }).v = ch;
          } else {
            ps.height = ch as unknown as typeof ps.height;
          }
        }
      }
    }

    const ps = page.style;
    if (ps) {
      maxWidth = Math.max(maxWidth, numVal(ps.width));
      maxHeight = Math.max(maxHeight, numVal(ps.height));
    }
    extractElements(page as unknown as SketchNodeLike, elements);
  }

  return {
    documentSize: { width: maxWidth || 800, height: maxHeight || 2000 },
    elements,
    imageBlobs: new Map(),
    root,
  };
}

/**
 * 创建交互 Listener（选中/拖拽/缩放/右键菜单）
 *
 * @param root sketch-editor Root 实例
 * @param dom 承载 canvas 的容器 HTMLElement（Listener 监听此元素上的鼠标/键盘事件）
 */
export async function createSketchListener(
  root: SketchRoot,
  dom: HTMLElement,
): Promise<unknown> {
  const mod = await loadSketchEditor();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ListenerClass = (mod.default as any).control.Listener;
  return new ListenerClass(root, dom, {
    disabled: { scale: true, drag: true },
  });
}

/**
 * 销毁 sketch-editor 实例
 */
export function destroySketch(root: SketchRoot): void {
  root.destroy();
}

/**
 * 从 WebGL canvas 导出 PNG（先触发重绘防止空白）
 */
export function exportCanvasAsPng(root: SketchRoot, canvas: HTMLCanvasElement): string {
  root.draw();
  return canvas.toDataURL("image/png");
}

/**
 * 将编辑后的 sketch-editor Root 序列化为 .sketch 文件（ArrayBuffer）
 *
 * 使用 root.toSketchFile() 生成 JSZip，再导出为二进制。
 * 该 ArrayBuffer 可直接作为 .sketch 文件上传到服务器。
 */
export async function exportSketchFile(root: SketchRoot): Promise<ArrayBuffer> {
  const rootAny = root as Record<string, unknown>;
  if (typeof rootAny.toSketchFile !== "function") {
    throw new Error("sketch-editor Root 不支持 toSketchFile");
  }
  const zip = await (rootAny.toSketchFile as () => Promise<unknown>)();
  const zipAny = zip as Record<string, unknown>;
  if (typeof zipAny.generateAsync !== "function") {
    throw new Error("JSZip 实例不支持 generateAsync");
  }
  return (zipAny.generateAsync as (opt: Record<string, unknown>) => Promise<unknown>)({
    type: "arraybuffer",
  }) as Promise<ArrayBuffer>;
}

/** REFLOW_REPAINT = 16384 | 8192 = 24576 — 文字重排+重绘 */
const REFLOW_REPAINT = 24576;
/** REPAINT = 8192 — 仅重绘 */
const REPAINT = 8192;

/**
 * 更新 sketch-editor 内部节点的文字内容并重绘
 *
 * Text 节点的更新流程（基于 sketch-editor Text 类 API）：
 * 1. _content = newContent — 设置文字内容
 * 2. calContent() — 重算文字布局（换行、框高、行距）
 * 3. refresh(REFLOW_REPAINT) — 标记节点为需要重排+重绘
 * 4. root.draw() — 触发 WebGL canvas 重绘
 *
 * @returns true 表示找到节点并更新成功
 */
export function updateNodeText(root: SketchRoot, nodeId: string, content: string): boolean {
  const refs = (root as unknown as Record<string, unknown>).refs;
  if (!refs || typeof refs !== "object") return false;
  const node = (refs as Record<string, unknown>)[nodeId] as SketchNodeLike | undefined;
  if (!node) return false;

  try {
    if (node.props) node.props.content = content;
    // calContent 存在时调用，重算文字布局
    if (typeof (node as Record<string, unknown>).calContent === "function") {
      (node as { calContent: () => boolean }).calContent();
    }
    // refresh 存在时调用，标记节点为需要重排+重绘
    if (typeof (node as Record<string, unknown>).refresh === "function") {
      (node as { refresh: (lv: number) => void }).refresh(REFLOW_REPAINT);
    }
    root.draw();
    return true;
  } catch {
    return false;
  }
}

/**
 * 在画布上选中指定节点（显示选框）
 *
 * 使用 root.refs[nodeId] 直接获取节点，再调用 listener.setSelected([node]) 显示选框
 *
 * @returns true 表示成功选中
 */
export function selectNode(
  root: SketchRoot,
  listener: unknown,
  nodeId: string,
): boolean {
  try {
    const refs = (root as unknown as Record<string, unknown>).refs;
    if (!refs || typeof refs !== "object") return false;
    const node = (refs as Record<string, unknown>)[nodeId];
    if (!node) return false;
    const sel = (listener as Record<string, unknown>).setSelected;
    if (typeof sel !== "function") return false;
    (listener as { setSelected: (nodes: unknown[]) => void }).setSelected([node]);
    return true;
  } catch {
    return false;
  }
}

/**
 * 清除画布选中状态（隐藏选框）
 */
export function clearSelection(listener: unknown): void {
  try {
    const sel = (listener as Record<string, unknown>).setSelected;
    if (typeof sel === "function") {
      (listener as { setSelected: (nodes: unknown[]) => void }).setSelected([]);
    }
  } catch {
    // 忽略
  }
}

/** 图片缩放模式 → sketch-editor PATTERN_FILL_TYPE 映射 */
const SCALE_MODE_MAP: Record<string, number> = {
  cover: 1,   // FILL — Math.max 缩放，可能裁切
  fill: 2,    // STRETCH — 拉伸到精确尺寸
  contain: 3, // FIT — Math.min 缩放，留白
};

/**
 * 通用样式更新 — 修改 sketch-editor 节点的 style 属性并重绘
 *
 * 支持：opacity、visibility、fill、stroke、strokeWidth、fontSize、color、textAlign、fontWeight、scaleMode
 * 值会自动包装为 {v, u} 格式（如果原值是此格式）
 *
 * @param updates 要更新的样式键值对，如 { opacity: 0.5, scaleMode: "cover" }
 * @returns true 表示找到节点并更新成功
 */
export function updateNodeStyle(
  root: SketchRoot,
  nodeId: string,
  updates: Record<string, unknown>,
): boolean {
  // 使用 root.refs 直接查找节点（比遍历树更可靠）
  const refs = (root as unknown as Record<string, unknown>).refs;
  if (!refs || typeof refs !== "object") return false;
  const node = (refs as Record<string, unknown>)[nodeId] as SketchNodeLike | undefined;
  if (!node) return false;

  try {
    const style = node.style;
    if (!style) return false;

    for (const [key, value] of Object.entries(updates)) {
      // scaleMode：修改 style.fill 数组中图片填充条目的 type
      if (key === "scaleMode") {
        const patternType = SCALE_MODE_MAP[value as string];
        if (patternType === undefined) continue;
        updateImageFillType(style, patternType);
        continue;
      }

      // 将用户侧属性名映射为 sketch-editor 内部属性名
      let styleKey = key;
      let styleValue = value;
      if (key === "isVisible") {
        styleKey = "visibility";
        styleValue = value ? "visible" : "hidden";
      }

      const current = (style as Record<string, unknown>)[styleKey];
      // 保持 {v, u} 包装格式
      if (current && typeof current === "object" && "v" in (current as Record<string, unknown>)) {
        (current as { v: unknown }).v = styleValue;
      } else {
        (style as Record<string, unknown>)[styleKey] = styleValue;
      }
    }

    if (typeof (node as Record<string, unknown>).refresh === "function") {
      (node as { refresh: (lv: number) => void }).refresh(REFLOW_REPAINT);
    }
    root.draw();
    return true;
  } catch {
    return false;
  }
}

/** 修改图片节点的 fill 数组中 pattern 填充的 type（缩放模式） */
function updateImageFillType(style: NodeStyle, patternType: number): void {
  const fill = style.fill;
  if (!Array.isArray(fill)) return;
  for (const item of fill) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const obj = item as Record<string, unknown>;
      // {v: u} 格式：{ v: { url, type, scale }, u: StyleUnit.PATTERN }
      const v = obj.v;
      if (v && typeof v === "object" && "url" in (v as Record<string, unknown>)) {
        (v as { type: number }).type = patternType;
        return;
      }
    }
  }
}

function findNodeById(node: SketchNodeLike, id: string): SketchNodeLike | null {
  if (node.props?.uuid === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
  }
  return null;
}

// ========== 元素提取 ==========

/** 判断节点类型：文本节点有 textBehaviour，图片节点有 src，形状节点有 points */
function classifyNode(node: SketchNodeLike): "text" | "bitmap" | "shape" | null {
  const p = node.props;
  if (!p || typeof p !== "object") return null;
  if ("textBehaviour" in p) return "text";
  if ("src" in p) return "bitmap";
  if ("points" in p && "isClosed" in p) return "shape";
  return null;
}

function extractElements(node: SketchNodeLike, results: SketchElement[]): void {
  if (!node.children) return;

  for (const child of node.children) {
    const kind = classifyNode(child);

    if (kind === "text") {
      const el = buildTextElement(child);
      if (el) results.push(el);
      continue;
    }
    if (kind === "bitmap") {
      const el = buildImageElement(child);
      if (el) results.push(el);
      continue;
    }
    if (kind === "shape") {
      const el = buildShapeElement(child);
      if (el) results.push(el);
      continue;
    }
    if (child.children && child.children.length > 0) {
      extractElements(child, results);
    }
  }
}

/** 解包 sketch-editor 样式值：{v, u} → v，普通值直接返回 */
function unwrap(raw: unknown): unknown {
  if (raw && typeof raw === "object" && "v" in (raw as Record<string, unknown>)) {
    return (raw as { v: unknown }).v;
  }
  return raw;
}

function numVal(raw: unknown, fallback = 0): number {
  const v = unwrap(raw);
  return typeof v === "number" ? v : fallback;
}

function strVal(raw: unknown, fallback = ""): string {
  const v = unwrap(raw);
  return typeof v === "string" ? v : fallback;
}

function getNodeFrame(node: SketchNodeLike): { x: number; y: number; width: number; height: number } {
  const s = node.style;
  if (!s) return { x: 0, y: 0, width: 0, height: 0 };
  return {
    x: numVal(s.left),
    y: numVal(s.top),
    width: numVal(s.width),
    height: numVal(s.height),
  };
}

function buildTextElement(node: SketchNodeLike): SketchElement | null {
  const s = node.style;
  const p = node.props;
  if (!s || !p) return null;
  return {
    objectId: p.uuid,
    name: p.name || "Text",
    type: "text",
    frame: getNodeFrame(node),
    rotation: 0,
    opacity: numVal(s.opacity, 1),
    isLocked: p.isLocked ?? false,
    isVisible: unwrap(s.visibility) !== "hidden" && numVal(s.visibility) !== 1,
    props: {
      kind: "text",
      content: p.content ?? p.name ?? "",
      fontFamily: strVal(unwrap(s.fontFamily), "PingFang SC"),
      fontSize: numVal(unwrap(s.fontSize), 14),
      fontWeight: typeof unwrap(s.fontWeight) === "number" ? unwrap(s.fontWeight) as number : 400,
      color: normalizeColor(unwrap(s.color)),
      textAlign: normalizeTextAlign(unwrap(s.textAlign)),
      lineHeight: typeof unwrap(s.lineHeight) === "number" ? unwrap(s.lineHeight) as number : null,
    },
  };
}

function buildImageElement(node: SketchNodeLike): SketchElement | null {
  const s = node.style;
  const p = node.props;
  if (!s || !p) return null;
  return {
    objectId: p.uuid,
    name: p.name || "Image",
    type: "image",
    frame: getNodeFrame(node),
    rotation: 0,
    opacity: numVal(s.opacity, 1),
    isLocked: p.isLocked ?? false,
    isVisible: unwrap(s.visibility) !== "hidden" && numVal(s.visibility) !== 1,
    props: {
      kind: "image",
      imageRef: p.href ?? "",
      imageUrl: typeof p.src === "string" ? p.src : undefined,
    },
  };
}

function buildShapeElement(node: SketchNodeLike): SketchElement | null {
  const s = node.style;
  const p = node.props;
  if (!s || !p) return null;
  return {
    objectId: p.uuid,
    name: p.name || "Shape",
    type: "shape",
    frame: getNodeFrame(node),
    rotation: 0,
    opacity: numVal(s.opacity, 1),
    isLocked: p.isLocked ?? false,
    isVisible: unwrap(s.visibility) !== "hidden" && numVal(s.visibility) !== 1,
    props: {
      kind: "shape",
      shapeType: "rectangle",
      fillColor: s.fill ? normalizeColor(unwrap(Array.isArray(s.fill) ? s.fill[0] : s.fill)) : null,
      strokeColor: s.stroke ? normalizeColor(unwrap(Array.isArray(s.stroke) ? s.stroke[0] : s.stroke)) : null,
      strokeWidth: numVal(Array.isArray(s.strokeWidth) ? unwrap(s.strokeWidth[0]) : unwrap(s.strokeWidth)),
      cornerRadius: numVal(unwrap((s as Record<string, unknown>).borderTopLeftRadius)),
    },
  };
}

// ========== 工具函数 ==========

function normalizeColor(color: unknown): string {
  if (!color) return "#000000";
  if (typeof color === "string") return color;
  if (typeof color === "number") return `#${(color as number).toString(16).padStart(6, "0")}`;
  if (Array.isArray(color) && color.length >= 3) {
    const r = Math.round(color[0] * 255);
    const g = Math.round(color[1] * 255);
    const b = Math.round(color[2] * 255);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }
  return "#000000";
}

function normalizeTextAlign(align: unknown): "left" | "center" | "right" {
  if (align === "center" || align === 1) return "center";
  if (align === "right" || align === 2) return "right";
  return "left";
}
