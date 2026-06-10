/**
 * 右键菜单组件
 */

import React, { useEffect, useRef } from 'react';

export type ContextMenuItem =
  | {
      label: string;
      shortcut?: string;
      onClick: () => void;
      separator?: never;
    }
  | {
      separator: true;
      label?: never;
      onClick?: never;
      shortcut?: never;
    };

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    // 延迟绑定，防止触发当前点击事件
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // 调整位置防止溢出
  const adjustedPos = (() => {
    const menuWidth = 200;
    const menuHeight = items.length * 36;

    let adjustedX = x;
    let adjustedY = y;

    if (x + menuWidth > window.innerWidth) {
      adjustedX = window.innerWidth - menuWidth - 8;
    }
    if (y + menuHeight > window.innerHeight) {
      adjustedY = window.innerHeight - menuHeight - 8;
    }

    return { x: adjustedX, y: adjustedY };
  })();

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: adjustedPos.x,
        top: adjustedPos.y,
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        padding: 4,
        minWidth: 200,
        boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
        zIndex: 100,
      }}
    >
      {items.map((item, index) =>
        'separator' in item && item.separator ? (
          <div
            key={`sep-${index}`}
            style={{
              height: 1,
              background: '#e0e0e0',
              margin: '4px 8px',
            }}
          />
        ) : (
          <div
            key={index}
            className="context-menu-item"
            onClick={(e) => {
              e.stopPropagation();
              item.onClick();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 13,
              color: '#666',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = '#fff7ed';
              (e.currentTarget as HTMLElement).style.color = '#e68c19';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = '';
              (e.currentTarget as HTMLElement).style.color = '#666';
            }}
          >
            {item.label}
            {item.shortcut && (
              <span style={{
                marginLeft: 'auto',
                fontSize: 11,
                color: '#999',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {item.shortcut}
              </span>
            )}
          </div>
        )
      )}
    </div>
  );
};
