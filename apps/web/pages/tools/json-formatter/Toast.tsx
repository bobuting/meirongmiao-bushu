/**
 * Toast 通知组件
 * 使用全局函数 showToast 来控制
 */

import React, { useState, useCallback, useEffect, createContext, useContext } from 'react';

interface ToastItem {
  id: number;
  message: string;
  success: boolean;
}

let nextToastId = 0;
let globalAddToast: ((message: string, success: boolean) => void) | null = null;

/**
 * 全局 Toast 调用函数
 */
export function showToast(message: string, success: boolean): void {
  globalAddToast?.(message, success);
}

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, success: boolean) => {
    const id = nextToastId++;
    setToasts(prev => [...prev, { id, message, success }]);

    // 2秒后自动移除
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2000);
  }, []);

  useEffect(() => {
    globalAddToast = addToast;
    return () => { globalAddToast = null; };
  }, [addToast]);

  const handleClose = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <>
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="toast-item"
          style={{
            position: 'fixed',
            bottom: 64,
            right: 20,
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: 12,
            padding: '10px 18px',
            fontSize: 13,
            color: '#002244',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            zIndex: 9999,
            cursor: 'pointer',
          }}
          onClick={() => handleClose(toast.id)}
        >
          <span style={{
            width: 20, height: 20, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, color: '#fff',
            background: toast.success ? '#22c55e' : '#ef4444',
          }}>
            {toast.success ? '✓' : '✕'}
          </span>
          {toast.message}
        </div>
      ))}
    </>
  );
};
