import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  formatJson,
  compressJson,
  downloadJson,
  copyToClipboard,
  parseJsonWithStats,
  getLines,
} from './utils';
import { ToastContainer, showToast } from './Toast';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';

interface JsonStats {
  nodeCount: number;
  maxDepth: number;
}

// ===== 辅助函数 =====

/**
 * 计算文件大小显示
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * HTML 转义
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ===== 树形渲染核心 =====

// 路径到DOM节点ID的映射
let pathToId: Record<string, string> = {};
let idToPath: Record<string, string> = {};
let nextId = 0;

function resetIdCounter() {
  pathToId = {};
  idToPath = {};
  nextId = 0;
}

function getPathId(path: string): string {
  if (!(path in pathToId)) {
    const id = 'p' + nextId++;
    pathToId[path] = id;
    idToPath[id] = path;
  }
  return pathToId[path];
}

/**
 * 生成一行 HTML
 */
function makeLineHtml(
  indent: number,
  key: string | null,
  showColon: boolean,
  value: string | null,
  type: string,
  path: string,
  hasComma: boolean,
  collapsedPaths: Set<string>,
  customContent?: string,
  childCount?: number,
  isArray?: boolean
): string {
  const indentStr = '  '.repeat(indent);
  const pid = getPathId(path);
  const isCollapsed = collapsedPaths.has(path);

  // 折叠按钮
  const toggleHtml = childCount !== undefined
    ? `<span class="tree-toggle${isCollapsed ? ' collapsed' : ''}" data-collapse-id="${pid}">▾</span>`
    : '<span class="tree-toggle-spacer"></span>';

  // 主内容
  let content = '';
  if (customContent) {
    content = customContent;
  } else if (value !== null) {
    content = `<span class="tree-value-${type}">${escapeHtml(value)}</span>`;
  }

  // key
  const keyHtml = key !== null
    ? `<span class="tree-key">${typeof key === 'number' ? key : escapeHtml(key)}</span>${showColon ? '<span class="tree-colon">:</span>' : ''}`
    : '';

  // 逗号
  const commaHtml = hasComma ? '<span class="tree-comma">,</span>' : '';

  // 子项计数
  const countHtml = childCount !== undefined
    ? `<span class="tree-count">${childCount} ${isArray ? '项' : '字段'}</span>`
    : '';

  return `<div class="tree-line" data-path-id="${pid}">
    <span class="tree-indent">${indentStr}</span>${toggleHtml}${keyHtml}${content}${commaHtml}${countHtml}
  </div>`;
}

/**
 * 渲染整棵树为 HTML 字符串
 */
function renderTreeHtml(data: unknown, collapsedPaths: Set<string>, searchQuery: string): string {
  let html = '';

  /**
   * 渲染节点
   * @param value 当前值
   * @param path 当前路径
   * @param indent 缩进层级
   * @param isLast 是否是同级最后一个元素
   * @param keyLabel key 的显示标签（数组元素为索引，对象属性为 "key"）
   * @param parentIsArray 父级是否是数组（决定是否显示冒号）
   */
  function renderNode(
    value: unknown,
    path: string,
    indent: number,
    isLast: boolean,
    keyLabel: string | number | null = null,
    parentIsArray: boolean = false
  ) {
    if (value === null) {
      const displayKey = keyLabel !== null ? (parentIsArray ? String(keyLabel) : `"${keyLabel}"`) : null;
      html += makeLineHtml(indent, displayKey, !parentIsArray && keyLabel !== null, 'null', 'null', path, !isLast, collapsedPaths);
      return;
    }

    if (typeof value !== 'object') {
      const type = typeof value;
      const displayVal = type === 'string' ? `"${value}"` : String(value);
      const displayKey = keyLabel !== null ? (parentIsArray ? String(keyLabel) : `"${keyLabel}"`) : null;
      html += makeLineHtml(indent, displayKey, !parentIsArray && keyLabel !== null, displayVal, type, path, !isLast, collapsedPaths);
      return;
    }

    const isArray = Array.isArray(value);
    const entries = isArray ? value.map((v: any, i: number) => [i, v] as [number, any]) : Object.entries(value);
    const count = entries.length;
    const bracket = isArray ? ['[', ']'] as const : ['{', '}'] as const;
    const isCollapsed = collapsedPaths.has(path);

    // 开括号行（如果有 key，key 和开括号在同一行）
    let openContent = `<span class="tree-bracket">${bracket[0]}</span>`;
    if (count > 0 && isCollapsed) {
      openContent += ` <span class="tree-ellipsis" data-ellipsis-id="${getPathId(path)}">...${count} 项</span> <span class="tree-bracket">${bracket[1]}</span>`;
    } else if (count === 0) {
      openContent += ` <span class="tree-bracket">${bracket[1]}</span>`;
    }
    // key 和开括号合并显示
    const displayKeyForOpen = keyLabel !== null ? (parentIsArray ? String(keyLabel) : `"${keyLabel}"`) : null;
    html += makeLineHtml(
      indent, displayKeyForOpen, !parentIsArray && keyLabel !== null, null, '', path, false, collapsedPaths,
      openContent, count > 0 && !isCollapsed ? count : undefined, isArray
    );

    if (!isCollapsed && count > 0) {
      entries.forEach(([key, val], i) => {
        const childIsLast = i === count - 1;
        const childPath = isArray ? `${path}[${key}]` : `${path}["${key}"]`;

        if (val !== null && typeof val === 'object') {
          // 对象/数组：交给递归处理，传入原始 key（不加引号）
          renderNode(val, childPath, indent + 1, childIsLast, key, isArray);
        } else {
          // 原始值：直接渲染，key 由 makeLineHtml 处理格式
          const type = val === null ? 'null' : typeof val;
          const displayVal = val === null ? 'null' : typeof val === 'string' ? `"${val}"` : String(val);
          // key 格式：数组用索引，对象用 "key"（带引号）
          const formattedKey = isArray ? String(key) : `"${key}"`;
          html += makeLineHtml(
            indent + 1, formattedKey, !isArray, displayVal, type, childPath, !childIsLast, collapsedPaths
          );
        }
      });

      // 闭括号
      html += makeLineHtml(indent, null, false, null, '', path, false, collapsedPaths,
        `<span class="tree-bracket">${bracket[1]}</span>`);
    }
  }

  renderNode(data, '$', 0, true);
  return html;
}

/**
 * 收集所有可折叠节点的路径
 */
function collectAllPaths(data: any, path: string, pathSet: Set<string>): void {
  if (data === null || typeof data !== 'object') return;
  if (path !== '$') pathSet.add(path);
  const isArray = Array.isArray(data);
  const entries = isArray ? data.map((v: any, i: number) => [i, v] as [number, any]) : Object.entries(data);
  entries.forEach(([key, value]: [any, any]) => {
    const childPath = isArray ? `${path}[${key}]` : `${path}["${key}"]`;
    collectAllPaths(value, childPath, pathSet);
  });
}

/**
 * 搜索匹配的 path-id 集合
 */
function findSearchMatches(treeEl: HTMLElement, query: string): string[] {
  const lowerQuery = query.toLowerCase();
  const lines = treeEl.querySelectorAll('.tree-line');
  const matches: string[] = [];

  lines.forEach(line => {
    const text = line.textContent?.toLowerCase() || '';
    if (text.includes(lowerQuery)) {
      const pid = (line as HTMLElement).dataset.pathId;
      if (pid) matches.push(pid);
    }
  });

  return matches;
}

// ===== 组件 =====

export const JsonFormatter: React.FC = () => {
  // 状态
  const [inputText, setInputText] = useState('');
  const [parsedData, setParsedData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<JsonStats | null>(null);
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIds, setSearchMatchIds] = useState<string[]>([]);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(-1);
  const [leftWidth, setLeftWidth] = useState(50);
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    path: string;
    value: any;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 输入防抖解析
  const parseInput = useCallback((text: string) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      if (!text.trim()) {
        setParsedData(null);
        setStats(null);
        setError(null);
        return;
      }

      try {
        const result = parseJsonWithStats(text);
        setParsedData(result.data);
        setStats(result.stats);
        setError(null);
        resetIdCounter();
      } catch (err) {
        setParsedData(null);
        setStats(null);
        setError(err instanceof Error ? err.message : 'JSON 解析失败');
      }
    }, 300);
  }, []);

  // 处理输入变化
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setInputText(text);
    parseInput(text);
  }, [parseInput]);

  // 更新行号
  const lines = useMemo(() => getLines(inputText), [inputText]);

  // 生成树形 HTML
  const treeHtml = useMemo(() => {
    if (!parsedData) return '';
    resetIdCounter();
    return renderTreeHtml(parsedData, collapsedPaths, '');
  }, [parsedData, collapsedPaths]);

  // 当 treeHtml 更新后，应用搜索
  useEffect(() => {
    if (!searchQuery || !treeRef.current) return;
    // 延迟到 DOM 渲染后
    const timer = setTimeout(() => {
      if (!treeRef.current) return;
      applySearchHighlight();
    }, 0);
    return () => clearTimeout(timer);
  }, [treeHtml, searchQuery]);

  // ===== 工具栏操作 =====

  const handleFormat = useCallback(() => {
    if (!parsedData) return;
    const formatted = formatJson(parsedData);
    setInputText(formatted);
    parseInput(formatted);
    showToast('已格式化', true);
  }, [parsedData, parseInput]);

  const handleCompress = useCallback(() => {
    if (!parsedData) return;
    const compressed = compressJson(parsedData);
    setInputText(compressed);
    parseInput(compressed);
    showToast('已压缩', true);
  }, [parsedData, parseInput]);

  const handleCopy = useCallback(async () => {
    if (!parsedData) return;
    const text = formatJson(parsedData);
    await copyToClipboard(text);
    showToast('已复制到剪贴板', true);
  }, [parsedData]);

  const handleDownload = useCallback(() => {
    if (!parsedData) return;
    downloadJson(parsedData, 'formatted.json');
    showToast('已下载', true);
  }, [parsedData]);

  const handleClear = useCallback(() => {
    setInputText('');
    setParsedData(null);
    setStats(null);
    setError(null);
    setCollapsedPaths(new Set());
    setSearchQuery('');
    setSearchMatchIds([]);
    setCurrentMatchIdx(-1);
    resetIdCounter();
  }, []);

  const handleExpandAll = useCallback(() => {
    setCollapsedPaths(new Set());
  }, []);

  const handleCollapseAll = useCallback(() => {
    if (!parsedData) return;
    const allPaths = new Set<string>();
    collectAllPaths(parsedData, '$', allPaths);
    setCollapsedPaths(allPaths);
  }, [parsedData]);

  // ===== 搜索 =====

  const applySearchHighlight = useCallback(() => {
    if (!treeRef.current) return;
    const treeEl = treeRef.current;

    // 清除旧高亮
    treeEl.querySelectorAll('.tree-line.search-match, .tree-line.search-current')
      .forEach(el => {
        el.classList.remove('search-match', 'search-current');
      });

    if (!searchQuery) {
      setSearchMatchIds([]);
      setCurrentMatchIdx(-1);
      return;
    }

    const matchPids = findSearchMatches(treeEl, searchQuery);
    setSearchMatchIds(matchPids);

    if (matchPids.length > 0) {
      setCurrentMatchIdx(0);
      // 延迟设置高亮和滚动，等待 React 状态更新
      requestAnimationFrame(() => {
        if (!treeRef.current) return;
        matchPids.forEach((pid, idx) => {
          const line = treeRef.current!.querySelector(`.tree-line[data-path-id="${pid}"]`);
          if (line) {
            line.classList.add('search-match');
            if (idx === 0) {
              line.classList.add('search-current');
              line.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
          }
        });
      });
    } else {
      setCurrentMatchIdx(-1);
    }
  }, [searchQuery]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  // 搜索导航（回车键）
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchMatchIds.length > 0) {
      const nextIdx = e.shiftKey
        ? (currentMatchIdx - 1 + searchMatchIds.length) % searchMatchIds.length
        : (currentMatchIdx + 1) % searchMatchIds.length;

      setCurrentMatchIdx(nextIdx);

      if (treeRef.current) {
        // 更新 current 高亮
        treeRef.current.querySelectorAll('.tree-line.search-current').forEach(el => el.classList.remove('search-current'));
        const pid = searchMatchIds[nextIdx];
        const line = treeRef.current.querySelector(`.tree-line[data-path-id="${pid}"]`);
        if (line) {
          line.classList.add('search-current');
          line.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
    }
  }, [searchMatchIds, currentMatchIdx]);

  // ===== 节点折叠切换 =====

  const toggleCollapse = useCallback((path: string) => {
    setCollapsedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // ===== 右键菜单 =====

  const getContextMenuItems = useCallback((): ContextMenuItem[] => {
    if (!contextMenu) return [];

    const value = contextMenu.value;
    const displayValue = typeof value === 'string' ? value : JSON.stringify(value);

    return [
      {
        label: '复制值',
        shortcut: '⌘C',
        onClick: () => {
          navigator.clipboard.writeText(displayValue).then(() => {
            showToast('已复制值', true);
          });
          setContextMenu(null);
        },
      },
      {
        label: '复制路径',
        shortcut: '⌘⇧C',
        onClick: () => {
          navigator.clipboard.writeText(contextMenu.path).then(() => {
            showToast('已复制路径', true);
          });
          setContextMenu(null);
        },
      },
      { separator: true },
      {
        label: '全部展开',
        onClick: () => {
          handleExpandAll();
          setContextMenu(null);
        },
      },
      {
        label: '全部折叠',
        onClick: () => {
          handleCollapseAll();
          setContextMenu(null);
        },
      },
    ];
  }, [contextMenu, handleExpandAll, handleCollapseAll]);

  // ===== 树形视图事件代理 =====

  const handleTreeClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // 折叠/展开按钮
    const toggle = target.closest('[data-collapse-id]') as HTMLElement | null;
    if (toggle) {
      const id = toggle.dataset.collapseId!;
      const path = idToPath[id];
      if (path) toggleCollapse(path);
      return;
    }

    // 省略号
    const ellipsis = target.closest('[data-ellipsis-id]') as HTMLElement | null;
    if (ellipsis) {
      const id = ellipsis.dataset.ellipsisId!;
      const path = idToPath[id];
      if (path) toggleCollapse(path);
      return;
    }
  }, [toggleCollapse]);

  const handleTreeContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const target = e.target as HTMLElement;
    const line = target.closest('.tree-line') as HTMLElement | null;
    if (!line) return;

    const pid = line.dataset.pathId;
    if (!pid) return;
    const path = idToPath[pid];
    if (!path) return;

    // 通过路径解析出值
    let value: any = parsedData;
    if (path !== '$') {
      // 从 path 字符串中解析出值（简化处理）
      value = getValueByPath(parsedData, path);
    }

    setContextMenu({ x: e.clientX, y: e.clientY, path, value });
  }, [parsedData]);

  // 关闭右键菜单
  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // ===== 分隔条拖拽 =====

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingDivider(true);
  }, []);

  useEffect(() => {
    if (!isDraggingDivider) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const percent = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.max(25, Math.min(75, percent)));
    };

    const handleMouseUp = () => setIsDraggingDivider(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingDivider]);

  // ===== 快捷键 =====

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;

      if (isMeta && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        handleFormat();
      }
      if (isMeta && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleCompress();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleFormat, handleCompress]);

  // ===== 文件拖拽 =====

  const handleDrop = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setInputText(text);
        parseInput(text);
      };
      reader.readAsText(file);
    }
  }, [parseInput]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    e.currentTarget.style.borderColor = 'var(--color-primary, #e68c19)';
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = '';
  }, []);

  // 计算输入大小
  const inputSize = new Blob([inputText]).size;

  return (
    <div className="h-screen flex flex-col" ref={containerRef}
      style={{
        background: '#fdfbf7',
        fontFamily: "'Inter', 'Noto Sans SC', sans-serif",
        color: '#002244',
      }}
    >
      {/* 自定义样式 */}
      <style>{cssStyles}</style>

      {/* ===== 工具栏 ===== */}
      <div style={{
        height: 56,
        background: '#fff',
        borderBottom: '1px solid #e0e0e0',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 12,
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34,
            background: 'linear-gradient(135deg, #e68c19, #00a8ff)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 14, fontWeight: 700, color: '#fff',
            boxShadow: '0 4px 12px rgba(230,140,25,0.25)',
          }}>{'{ }'}</div>
          <span style={{
            fontSize: 16, fontWeight: 700,
            background: 'linear-gradient(135deg, #e68c19, #00a8ff)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>JSON Formatter</span>
        </div>

        <div style={{ width: 1, height: 28, background: '#e0e0e0', margin: '0 4px' }} />

        {/* 操作按钮 */}
        <button className="json-btn primary" onClick={handleFormat} disabled={!parsedData}>
          ✦ 格式化 <span className="kbd">⌘⇧F</span>
        </button>
        <button className="json-btn" onClick={handleCompress} disabled={!parsedData}>
          ⇱ 压缩 <span className="kbd">⌘S</span>
        </button>
        <button className="json-btn" onClick={handleCopy} disabled={!parsedData}>
          ⎘ 复制
        </button>
        <button className="json-btn" onClick={handleDownload} disabled={!parsedData}>
          ⤓ 下载
        </button>

        <div style={{ width: 1, height: 28, background: '#e0e0e0', margin: '0 4px' }} />

        <button className="json-btn" onClick={handleExpandAll} disabled={!parsedData}>⊞ 展开全部</button>
        <button className="json-btn" onClick={handleCollapseAll} disabled={!parsedData}>⊟ 折叠全部</button>

        <div style={{ flex: 1 }} />

        {/* 搜索栏 */}
        <div className="search-wrapper">
          <div className="search-bar">
            <span style={{ fontSize: 16, color: '#999' }}>⌕</span>
            <input
              type="text"
              placeholder="搜索 key 或 value..."
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
            />
            <span style={{ fontSize: 11, color: '#999', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
              {searchQuery ? (searchMatchIds.length > 0 ? `${searchMatchIds.length} 匹配 · ${currentMatchIdx + 1}/${searchMatchIds.length}` : '无匹配') : ''}
            </span>
          </div>
        </div>
      </div>

      {/* ===== 主区域 ===== */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 左侧面板 */}
        <div style={{
          width: `${leftWidth}%`,
          display: 'flex', flexDirection: 'column',
          background: '#fff', minWidth: 0,
        }}>
          {/* 面板头 */}
          <div style={{
            height: 38, background: '#fcfaf7', borderBottom: '1px solid #e0e0e0',
            display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8,
            fontSize: 13, fontWeight: 600, color: '#666',
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#e68c19' }} />
            输入
            <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 11, color: '#999' }}>
              {formatSize(inputSize)}
            </span>
          </div>

          {/* 编辑器 */}
          <div className="editor-with-lines">
            <div className="line-numbers">
              {lines.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <textarea
              value={inputText}
              onChange={handleInputChange}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              placeholder={`在此粘贴 JSON...\n\n支持快捷键：\n  ⌘⇧F  格式化\n  ⌘S    压缩\n\n也可以拖拽 .json 文件到此处`}
              spellCheck={false}
              style={{
                flex: 1,
                background: '#fff',
                color: '#002244',
                border: 'none',
                outline: 'none',
                resize: 'none',
                padding: '14px 16px',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13,
                lineHeight: 1.65,
                tabSize: 2,
              }}
            />
          </div>
        </div>

        {/* 分隔条 */}
        <div
          className={`resizer${isDraggingDivider ? ' active' : ''}`}
          onMouseDown={handleDividerMouseDown}
        />

        {/* 右侧面板 */}
        <div style={{
          width: `${100 - leftWidth}%`,
          display: 'flex', flexDirection: 'column',
          background: '#fff', minWidth: 0,
        }}>
          {/* 面板头 */}
          <div style={{
            height: 38, background: '#fcfaf7', borderBottom: '1px solid #e0e0e0',
            display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8,
            fontSize: 13, fontWeight: 600, color: '#666',
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: parsedData ? '#22c55e' : error ? '#ef4444' : '#999',
            }} />
            预览
            {stats && (
              <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 11, color: '#999' }}>
                {stats.nodeCount} 节点 · 深度 {stats.maxDepth}
              </span>
            )}
          </div>

          {/* 树形视图 */}
          <div
            ref={treeRef}
            className="tree-area"
            onClick={handleTreeClick}
            onContextMenu={handleTreeContextMenu}
          >
            {error && (
              <div className="empty-state">
                <div className="icon-large" style={{ background: '#fef2f2', color: '#ef4444' }}>✕</div>
                <p style={{ color: '#ef4444' }}>JSON 解析失败</p>
                <span className="hint">{error}</span>
              </div>
            )}

            {!parsedData && !error && (
              <div className="empty-state">
                <div className="icon-large">{'{ }'}</div>
                <p>粘贴 JSON 开始格式化</p>
                <span className="hint">或拖拽 .json 文件到左侧面板</span>
              </div>
            )}

            {parsedData && (
              <div dangerouslySetInnerHTML={{ __html: treeHtml }} />
            )}
          </div>
        </div>
      </div>

      {/* ===== 状态栏 ===== */}
      <div style={{
        height: 32, background: '#fcfaf7', borderTop: '1px solid #e0e0e0',
        display: 'flex', alignItems: 'center', padding: '0 16px',
        fontSize: 11, color: '#999', gap: 16,
        fontFamily: "'JetBrains Mono', monospace",
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: parsedData ? '#22c55e' : error ? '#ef4444' : '#999',
            boxShadow: parsedData ? '0 0 6px rgba(34,197,94,0.4)' : error ? '0 0 6px rgba(239,68,68,0.4)' : undefined,
          }} />
          <span>{parsedData ? 'JSON 有效' : error ? error : '等待输入'}</span>
        </div>

        {stats && (
          <>
            <span>节点: {stats.nodeCount}</span>
            <span>深度: {stats.maxDepth}</span>
          </>
        )}

        <div style={{ flex: 1 }} />

        <span>{formatSize(inputSize)}</span>
      </div>

      {/* Toast 容器 */}
      <ToastContainer />

      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems()}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  );
};

// ===== 路径解析辅助 =====
function getValueByPath(data: any, path: string): any {
  if (path === '$') return data;
  // 移除开头的 $
  const withoutRoot = path.startsWith('$.') ? path.slice(2) : path;
  // 解析路径段（支持 ["key"] 和 [index] 格式）
  const segments = withoutRoot.match(/\["?([^"\]]+)"?\]/g);
  if (!segments) return undefined;

  let current = data;
  for (const seg of segments) {
    const key = seg.replace(/^\["?|"?\]$/g, '');
    if (Array.isArray(current)) {
      current = current[parseInt(key)];
    } else {
      current = current?.[key];
    }
    if (current === undefined) return undefined;
  }
  return current;
}

// ===== CSS 内联样式 =====
const cssStyles = `
.json-btn {
  height: 36px;
  padding: 0 14px;
  border: 1px solid #e0e0e0;
  background: #fff;
  color: #666;
  font-family: 'Inter', 'Noto Sans SC', sans-serif;
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s ease;
  white-space: nowrap;
}
.json-btn:hover:not(:disabled) {
  background: #fff7ed;
  color: #002244;
  border-color: #e68c19;
}
.json-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.json-btn.primary {
  background: #e68c19;
  color: #fff;
  border-color: #e68c19;
  box-shadow: 0 4px 12px rgba(230,140,25,0.2);
}
.json-btn.primary:hover:not(:disabled) {
  background: #d97e10;
  box-shadow: 0 6px 16px rgba(230,140,25,0.3);
}
.json-btn .kbd {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(0,0,0,0.06);
  font-family: 'JetBrains Mono', monospace;
  color: #999;
}
.json-btn.primary .kbd {
  background: rgba(255,255,255,0.2);
  color: rgba(255,255,255,0.8);
}

.search-wrapper {
  position: relative;
  width: 260px;
}
.search-wrapper::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 14px;
  background: linear-gradient(135deg, #e68c19, #00a8ff);
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 0;
}
.search-wrapper:focus-within::before {
  opacity: 1;
}
.search-bar {
  position: relative;
  z-index: 1;
  height: 36px;
  width: 100%;
  display: flex;
  align-items: center;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 0 12px;
  gap: 8px;
  transition: all 0.2s;
}
.search-wrapper:focus-within .search-bar {
  border-color: transparent;
  background: #fff;
}
.search-bar input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: #002244;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}
.search-bar input::placeholder {
  color: #999;
}

.resizer {
  width: 6px;
  background: #f8f7f6;
  cursor: col-resize;
  position: relative;
  transition: background 0.2s;
  border-left: 1px solid #e0e0e0;
  border-right: 1px solid #e0e0e0;
  flex-shrink: 0;
}
.resizer:hover, .resizer.active {
  background: #fff7ed;
  border-color: #e68c19;
}
.resizer::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 2px;
  height: 24px;
  border-radius: 2px;
  background: #999;
  opacity: 0;
  transition: opacity 0.2s;
}
.resizer:hover::after { opacity: 0.5; }

.editor-with-lines {
  position: relative;
  height: 100%;
  display: flex;
  flex: 1;
  overflow: hidden;
}
.line-numbers {
  width: 44px;
  padding: 14px 8px 14px 0;
  text-align: right;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.65;
  color: #999;
  user-select: none;
  pointer-events: none;
  background: #fcfaf7;
  border-right: 1px solid #e0e0e0;
  overflow: hidden;
  flex-shrink: 0;
}

.tree-area {
  flex: 1;
  overflow: auto;
  background: #fff;
  padding: 14px 16px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  line-height: 1.65;
}

/* 树形节点 */
.tree-area .tree-line {
  display: flex;
  align-items: flex-start;
  padding: 1px 4px;
  border-radius: 4px;
  transition: background 0.1s;
  white-space: pre-wrap;
  word-break: break-all;
}
.tree-area .tree-line:hover {
  background: #fff7ed;
}
.tree-area .tree-line.search-match {
  background: rgba(230,140,25,0.08);
  outline: 1px solid rgba(230,140,25,0.3);
}
.tree-area .tree-line.search-current {
  background: rgba(230,140,25,0.15);
  outline: 2px solid #e68c19;
}
.tree-area .tree-indent { flex-shrink: 0; }
.tree-area .tree-toggle,
.tree-area .tree-toggle-spacer {
  width: 18px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 10px;
  user-select: none;
}
.tree-area .tree-toggle {
  cursor: pointer;
  color: #999;
  border-radius: 4px;
  transition: all 0.15s;
}
.tree-area .tree-toggle:hover {
  color: #e68c19;
  background: #fff7ed;
}
.tree-area .tree-toggle.collapsed { transform: rotate(-90deg); }

.tree-area .tree-key { color: #0066cc; margin-right: 4px; flex-shrink: 0; }
.tree-area .tree-colon { color: #999; margin-right: 4px; flex-shrink: 0; }
.tree-area .tree-value-string { color: #1a7f37; }
.tree-area .tree-value-number { color: #d97e10; }
.tree-area .tree-value-boolean { color: #7c3aed; }
.tree-area .tree-value-null { color: #999; font-style: italic; }
.tree-area .tree-bracket { color: #555; font-weight: 600; }
.tree-area .tree-comma { color: #999; }

.tree-area .tree-ellipsis {
  color: #999;
  font-style: italic;
  font-size: 11px;
  cursor: pointer;
  padding: 0 4px;
  border-radius: 4px;
  transition: all 0.15s;
}
.tree-area .tree-ellipsis:hover {
  background: #fff7ed;
  color: #e68c19;
}
.tree-area .tree-count {
  color: #999;
  font-size: 11px;
  margin-left: 6px;
  font-family: 'Inter', sans-serif;
}

/* 空状态 */
.tree-area .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
  gap: 12px;
  padding: 40px;
}
.tree-area .empty-state .icon-large {
  width: 72px;
  height: 72px;
  background: #fff7ed;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 28px;
  font-weight: 700;
  color: #e68c19;
}
.tree-area .empty-state p {
  font-size: 15px;
  color: #666;
  margin: 0;
}
.tree-area .empty-state .hint {
  font-size: 12px;
  color: #999;
}

/* 动画 */
.tree-area .tree-line { animation: fadeIn 0.15s ease; }
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
`;
