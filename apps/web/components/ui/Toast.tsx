/**
 * 全局 Toast 提示组件
 * 符合项目温暖橙黄主题风格
 * 支持成功/错误/信息三种类型，自动消失
 */
import React, { useState, useCallback } from 'react';

interface ToastProps {
  isOpen: boolean;
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({
  isOpen,
  message,
  type = 'success',
  onClose,
}) => {
  if (!isOpen) return null;

  const typeStyles = {
    success: 'bg-emerald-500 text-white',
    error: 'bg-red-500 text-white',
    info: 'bg-primary text-white',
  };

  const typeIcons = {
    success: 'check_circle',
    error: 'error',
    info: 'info',
  };

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[80]">
      <div className="animate-slide-down">
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg ${typeStyles[type]}`}
          onClick={onClose}
        >
          <span className="material-icons-round text-lg">{typeIcons[type]}</span>
          <span className="text-sm font-medium">{message}</span>
        </div>
      </div>
    </div>
  );
};

/**
 * 全局 Toast Context + Provider
 * 在根布局挂载一次，所有组件通过 useToast() 即可调用
 */

interface ToastContextValue {
  showToast: (message: string, type?: 'success' | 'error' | 'info', durationMs?: number) => void;
  /** 显示成功提示（默认 2 秒自动消失） */
  success: (message: string, durationMs?: number) => void;
  /** 显示错误提示（默认 3 秒自动消失） */
  error: (message: string, durationMs?: number) => void;
  /** 显示信息提示（默认 2 秒自动消失） */
  info: (message: string, durationMs?: number) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

/** 全局 Provider，在根布局挂载一次 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<{
    isOpen: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
    timerId: number | null;
  }>({ isOpen: false, message: '', type: 'success', timerId: null });

  const clearTimer = useCallback(() => {
    if (state.timerId !== null) {
      window.clearTimeout(state.timerId);
    }
  }, [state.timerId]);

  const showToast = useCallback((
    message: string,
    type: 'success' | 'error' | 'info' = 'success',
    durationMs: number = type === 'error' ? 3000 : 2000
  ) => {
    clearTimer();

    const timerId = window.setTimeout(() => {
      setState((prev) => ({ ...prev, isOpen: false, timerId: null }));
    }, durationMs);

    setState({ isOpen: true, message, type, timerId });
  }, [clearTimer]);

  const success = useCallback((message: string, durationMs?: number) => {
    showToast(message, 'success', durationMs);
  }, [showToast]);

  const error = useCallback((message: string, durationMs?: number) => {
    showToast(message, 'error', durationMs ?? 3000);
  }, [showToast]);

  const info = useCallback((message: string, durationMs?: number) => {
    showToast(message, 'info', durationMs);
  }, [showToast]);

  const handleClose = useCallback(() => {
    clearTimer();
    setState((prev) => ({ ...prev, isOpen: false, timerId: null }));
  }, [clearTimer]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, info }}>
      {children}
      <Toast
        isOpen={state.isOpen}
        message={state.message}
        type={state.type}
        onClose={handleClose}
      />
    </ToastContext.Provider>
  );
};

/** 全局 Toast Hook，任意组件可调用 */
export const useToast = (): ToastContextValue => {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
};