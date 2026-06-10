# 图片编辑器设计规格

> 基于 Fabric.js v7 的前端 PS 级图片编辑器，独立路由页面，UI 风格与现有系统统一。

## 1. 概述

### 1.1 目标

为内容喵平台提供一个独立的前端图片编辑器，支持类 PS 的图片处理能力：裁剪、调色、绘制、文字、形状、图层管理。所有编辑运算在浏览器 Canvas 完成，不依赖后端。

### 1.2 使用场景

- 任何项目步骤都可调用，通过独立路由页面进入
- 编辑完成后导出图片或保存可重新编辑的 JSON 状态
- 预留 AI 接口，未来可扩展一键抠图、智能调色等能力

### 1.3 技术选型

| 项 | 选择 | 理由 |
|---|---|---|
| Canvas 引擎 | Fabric.js v7 | TS 原生、对象模型类图层、20+ 内置滤镜、社区最大 |
| 状态管理 | Zustand | 与项目一致 |
| UI | React 18 + Tailwind | 与项目一致 |
| 图标 | Material Icons Round | 与项目一致 |

## 2. 布局设计

经典三栏布局，类 Photoshop：

```
┌─────────────────────────────────────────────────────┐
│  顶部导航栏 (44px)                                    │
│  ◀ 返回 │ 图片编辑器 │ ↩撤销 ↪重做 │ 重置 │ 保存      │
├──┬──────────────────────────────────┬───────────────┤
│  │  工具属性栏 (36px)                │               │
│  │  选择工具 │ X:120 Y:80 W:800 H:600│               │
│左│──────────────────────────────────│  右侧面板     │
│侧│                                  │  (280px)      │
│工│         画 布 区 域               │               │
│具│    (棋盘格透明背景)               │  图层 │ 调色 │ 滤镜│
│栏│                                  │               │
│56│                                  │  图层列表     │
│px│                                  │  · 背景图     │
│  │                                  │  · 文字层     │
│  │                                  │  · 形状层     │
│  │──────────────────────────────────│               │
│  │  状态栏 (24px)                   │  不透明度     │
│  │  1200×800px │ 3图层 │ 缩放100%  │  混合模式     │
├──┴──────────────────────────────────┴───────────────┤
│  (底部浮动工具条 - 可选，用于保存/返回快捷操作)         │
└─────────────────────────────────────────────────────┘
```

### 2.1 尺寸规范

| 区域 | 宽度 | 说明 |
|------|------|------|
| 左侧工具栏 | 56px | 固定，图标 40×40，圆角 10px |
| 中间画布区 | 弹性 | 填充剩余空间 |
| 右侧面板 | 280px | 固定，Tab 切换三个面板 |
| 顶部导航 | 44px | 固定 |
| 工具属性栏 | 36px | 固定，跟随当前工具变化 |
| 底部状态栏 | 24px | 固定 |

### 2.2 视觉风格

与项目现有 UI 统一：
- 暖白底色 `#fdfbf7`
- 橙色主色 `#e68c19`，选中工具高亮
- 圆角：按钮 10px，面板 8px，输入框 8px
- 阴影：`shadow-xl shadow-gray-200/50`
- 图标：Material Icons Round
- 画布区棋盘格透明背景（经典 PS 样式）

## 3. 工具系统

### 3.1 工具栏（左侧 56px）

7 个工具，分组排列：

| 分组 | 工具 | 快捷键 | 说明 |
|------|------|--------|------|
| 变换 | 选择/移动 | V | 选中对象，拖拽移动，手柄缩放/旋转 |
| 变换 | 裁剪 | C | 裁剪框+预设比例 |
| 绘制 | 画笔 | B | 自由绘制，平滑路径 |
| 绘制 | 橡皮擦 | E | 擦除笔画或对象局部 |
| 对象 | 文字 | T | 点击添加文字框，双击编辑 |
| 对象 | 形状 | U | 子菜单选类型：矩形/圆形/三角/直线 |
| 视图 | 缩放 | - | 放大/缩小按钮（底部） |

工具间用 1px 分隔线分组。选中态：橙色背景白字。未选中：白底灰字。Hover：`bg-gray-100`。

### 3.2 选择/移动工具（V）

交互：
- 点击选中对象，显示 8 个控制手柄 + 顶部旋转手柄
- 拖拽移动，Shift 约束水平/垂直
- 拖拽手柄缩放，Shift 等比缩放
- 拖拽旋转手柄旋转，Shift 15° 吸附
- 点击空白取消选中
- Ctrl+A 全选，Delete 删除选中

属性栏显示：工具名称 | X Y 坐标 | W H 尺寸 | ∠ 角度 | ↔ 水平翻转 | ↕ 垂直翻转 | ↻ 旋转90°

### 3.3 裁剪工具（C）

交互：
- 进入裁剪模式，显示裁剪框覆盖画布
- 拖拽边角调整裁剪范围
- 裁剪框外区域半透明遮罩
- Enter 确认裁剪，Esc 取消

属性栏显示：预设比例按钮组（自由 / 1:1 / 4:3 / 16:9 / 3:4）

### 3.4 画笔工具（B）

交互：
- 在画布上拖拽绘制自由路径
- 每条笔画是独立 Fabric Path 对象，可选中/移动/删除
- 自动平滑（Fabric PencilBrush）

属性栏显示：颜色选择器 | 粗细滑块 (1-50px) | 透明度滑块 (0-100%)

### 3.5 橡皮擦（E）

交互：
- 擦除经过的笔画或对象（使用 Fabric EraserBrush）

属性栏显示：粗细滑块 (1-50px)

### 3.6 文字工具（T）

交互：
- 点击画布添加文字框，自动进入编辑模式
- 双击已有文字进入编辑
- Esc 或点击其他位置退出编辑

属性栏显示：字体选择 | 字号 | 颜色 | 对齐 | 粗体 B / 斜体 I / 下划线 U

### 3.7 形状工具（U）

交互：
- 点击工具栏形状图标弹出子菜单选择类型（矩形/圆形/三角/直线）
- 在画布上拖拽绘制，Shift 等比约束
- 绘制后自动切换回选择工具

属性栏显示：填充色 | 边框色 | 边框粗细

### 3.8 翻转/旋转

不是独立工具，集成在选择工具属性栏中：
- 水平翻转、垂直翻转按钮
- 旋转 90° 按钮、角度输入框
- 选中对象时作用于对象，未选中时作用于整个画布

## 4. 右侧面板

### 4.1 面板 Tab 切换

三个 Tab：图层 | 调色 | 滤镜

选中 Tab：橙色文字 + 底部 2px 橙色边框。未选中：灰色文字。

### 4.2 图层面板

操作按钮行：新建 | 复制 | 上移 | 下移 | 删除（红色）

图层列表（从上到下 = 从前到后）：
- 每项：可见性眼睛图标 | 缩略图 | 名称 | 描述 | 锁定图标
- 选中图层：`bg-primary/5 border border-primary/20`
- Hover：`hover:bg-gray-50`

底部：不透明度滑块 + 混合模式下拉

### 4.3 调色面板

4 个滑块，实时预览：

| 参数 | 范围 | 默认 |
|------|------|------|
| 亮度 | -100 ~ +100 | 0 |
| 对比度 | -100 ~ +100 | 0 |
| 饱和度 | -100 ~ +100 | 0 |
| 色温 | -100 ~ +100 | 0 |

每个滑块带重置按钮。作用于选中对象或整个画布。

### 4.4 滤镜面板

预设滤镜网格（2 列），点击应用/取消：
- 原图（无滤镜）
- 灰度
- 复古（Sepia）
- 模糊
- 锐化
- 浮雕
- 像素化
- 反转

每个滤镜卡片：缩略图预览 + 名称。选中态橙色边框。

## 5. 架构设计

### 5.1 三层架构

```
UI 层 (React + Tailwind)
  ↕ Zustand Store
状态层 (editorStore)
  ↕ Hooks 桥接
引擎层 (Fabric.js v7 Canvas)
```

- **UI 层**只与 Store 交互，不直接操作 Canvas
- **Store** 是单一状态源，UI 和 Canvas 都从这里读写
- **引擎层**通过 Hook 桥接，Canvas 事件反向更新 Store

### 5.2 文件结构

```
apps/web/pages/image-editor/
├── ImageEditorPage.tsx          // 页面入口 + 路由
├── components/
│   ├── EditorNavbar.tsx         // 顶部导航栏
│   ├── EditorToolbar.tsx        // 左侧工具栏
│   ├── CanvasArea.tsx           // 中间画布区 + 属性栏
│   ├── PropertyPanel.tsx        // 右侧面板（Tab 切换容器）
│   ├── LayerPanel.tsx           // 图层列表面板
│   ├── ColorPanel.tsx           // 调色面板
│   └── FilterPanel.tsx          // 滤镜面板
├── hooks/
│   ├── useFabricCanvas.ts       // Canvas 生命周期管理
│   ├── useEditorTools.ts        // 工具切换 + 交互逻辑
│   ├── useHistory.ts            // 撤销/重做历史栈
│   └── useExport.ts             // 导出图片/JSON
└── store/
    └── editorStore.ts           // Zustand 全局状态
```

### 5.3 Store 状态结构

```typescript
interface EditorState {
  // 画布
  canvas: Canvas | null;
  canvasSize: { width: number; height: number };
  zoom: number; // 0.1 ~ 5.0

  // 工具
  activeTool: EditorTool;
  toolOptions: ToolOptions;

  // 对象
  selectedObjects: FabricObject[];
  layers: LayerItem[];

  // 历史
  historyStack: string[]; // JSON 快照
  historyIndex: number;
  isDirty: boolean;

  // 调色
  adjustments: Adjustments;

  // 面板
  rightPanelTab: 'layers' | 'adjust' | 'filters';
}
```

### 5.4 LayerItem

```typescript
interface LayerItem {
  id: string;          // Fabric object 唯一标识
  name: string;        // 显示名称
  type: 'image' | 'text' | 'shape' | 'path' | 'group';
  visible: boolean;
  locked: boolean;
  opacity: number;     // 0 ~ 1
  blendMode: string;
}
```

LayerItem 是 Fabric 对象的轻量镜像，只存 UI 需要的元数据。实际渲染数据由 Fabric 管理。图层顺序 = Fabric Canvas 对象顺序。

### 5.5 双向同步

**正向：用户操作 → Canvas 执行**
1. 用户点击工具 → `setActiveTool('brush')`
2. `useEditorTools` 监听 Store 变化 → 设置 `canvas.isDrawingMode = true`

**反向：Canvas 事件 → UI 更新**
1. `canvas.on('selection:created')` 触发
2. `useFabricCanvas` 处理回调 → `setSelectedObjects([...])`
3. 属性栏/图层面板自动刷新

### 5.6 历史记录

- 每次 `object:modified` / `object:added` / `object:removed` 后，调用 `canvas.toJSON()` 存入 `historyStack`
- 最大 50 步，超出丢弃最早快照
- 撤销：`historyIndex--` → `canvas.loadFromJSON(historyStack[index])`
- 重做：`historyIndex++` → `canvas.loadFromJSON(historyStack[index])`
- 新操作时截断 `historyIndex` 之后的所有快照
- 防抖 300ms：连续拖拽/绘制中不频繁保存

## 6. 导出与保存

### 6.1 导出图片

```typescript
canvas.toDataURL({
  format: 'png' | 'jpeg',
  quality: 0.92,
  multiplier: 2, // 2x 高清
})
```

→ 上传 OSS → 返回 URL → 回传给调用页面

### 6.2 保存编辑状态

```typescript
canvas.toJSON(['name', 'lockMovementX', 'lockMovementY', 'selectable'])
```

→ 存入数据库 `nrm_editor_states` → 下次打开 `canvas.loadFromJSON()` 继续编辑

## 7. 路由设计

```
/image-editor?imageUrl=xxx&editorStateId=yyy&callback=zzz
```

| 参数 | 必传 | 说明 |
|------|------|------|
| imageUrl | 是 | 要编辑的图片 URL |
| editorStateId | 否 | 之前保存的编辑状态 ID，有则加载继续编辑 |
| callback | 否 | 保存后跳回的路由路径 |

保存完成后的回调方式：
1. 有 `callback` 参数：跳转到指定路由
2. 无 `callback`：通过 `window.opener.postMessage` 通知父窗口

## 8. 快捷键

| 快捷键 | 操作 |
|--------|------|
| V | 选择工具 |
| C | 裁剪工具 |
| B | 画笔工具 |
| E | 橡皮擦 |
| T | 文字工具 |
| U | 形状工具 |
| Ctrl+Z | 撤销 |
| Ctrl+Shift+Z | 重做 |
| Ctrl+S | 保存 |
| Ctrl+A | 全选 |
| Delete | 删除选中 |
| Esc | 取消当前操作/回空闲 |
| Ctrl+0 | 适应画布 |
| Ctrl+= | 放大 |
| Ctrl+- | 缩小 |

## 9. AI 接口预留

在 Store 和 Hook 层预留扩展点：

```typescript
// editorStore 扩展字段
aiTools: {
  removeBackground: boolean;  // 一键抠图
  smartAdjust: boolean;       // 智能调色
}

// useEditorTools 扩展方法
async function applyAITool(tool: 'removeBackground' | 'smartAdjust') {
  // 调用后端 AI 接口
  // 将结果作为新图层添加到 Canvas
}
```

AI 处理流程：选中对象 → 调用后端 AI 接口 → 返回处理后的图片 → 作为新图层叠加 → 用户可继续编辑

## 10. 约束与边界

- 纯前端运算，不上传图片到后端做编辑处理
- 单张图片编辑，不支持多图拼接（可通过图层间接实现）
- 文字工具不支持富文本（粗体/斜体/下划线已是上限）
- 滤镜预设固定 8 种，不支持自定义滤镜参数组合
- 历史记录最多 50 步
- 导出分辨率最高 2x
