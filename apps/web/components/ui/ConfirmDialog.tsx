/**
 * 确认对话框组件
 * 符合项目温暖橙黄主题风格
 * 支持双按钮确认模式和单按钮提示模式
 */
import React, { useState } from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  variant?: 'default' | 'warning' | 'danger';
  /** 单按钮模式：隐藏取消按钮，点击确定后关闭 */
  singleButton?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onCancel,
  variant = 'default',
  singleButton = false,
}) => {
  if (!isOpen) return null;

  const variantStyles = {
    default: 'bg-primary hover:bg-primary-hover shadow-primary/30',
    warning: 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/30',
    danger: 'bg-red-500 hover:bg-red-600 shadow-red-500/30',
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden transform scale-100 opacity-100 translate-y-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部装饰条 */}
        <div className="h-1 bg-gradient-to-r from-primary via-amber-400 to-primary" />

        {/* 内容区域 */}
        <div className="p-6">
          {/* 标题 */}
          {title && (
            <h3 className="text-lg font-semibold text-gray-900 mb-2 font-display">
              {title}
            </h3>
          )}

          {/* 消息内容 */}
          <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{message}</p>

          {/* 按钮组 */}
          <div className={`flex gap-3 mt-6 ${singleButton ? 'justify-center' : ''}`}>
            {!singleButton && (
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all duration-200"
              >
                {cancelText}
              </button>
            )}
            <button
              onClick={onConfirm}
              className={`${singleButton ? 'w-full' : 'flex-1'} px-4 py-2.5 rounded-xl text-sm font-medium text-white shadow-lg transition-all duration-200 hover:-translate-y-0.5 ${variantStyles[variant]}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * 全局确认对话框 Context + Provider
 * 在根布局挂载一次，所有组件通过 useConfirm() 或 useAlert() 即可调用
 */

interface ConfirmDialogContextValue {
  confirm: (message: string, title?: string) => Promise<boolean>;
  /** 单按钮提示弹窗，用户点击确定后 resolve */
  alert: (message: string, title?: string) => Promise<void>;
}

const ConfirmDialogContext = React.createContext<ConfirmDialogContextValue | null>(null);

/** 全局 Provider，在根布局挂载一次 */
export const ConfirmDialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<{
    isOpen: boolean;
    title?: string;
    message: string;
    resolve: ((value: boolean) => void) | null;
    singleButton: boolean;
  }>({ isOpen: false, message: '', resolve: null, singleButton: false });

  const confirm = (message: string, title?: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ isOpen: true, message, title, resolve, singleButton: false });
    });
  };

  const alert = (message: string, title?: string): Promise<void> => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        message,
        title,
        resolve: () => resolve(),
        singleButton: true,
      });
    });
  };

  const handleConfirm = () => {
    state.resolve?.(true);
    setState((prev) => ({ ...prev, isOpen: false }));
  };

  const handleCancel = () => {
    state.resolve?.(false);
    setState((prev) => ({ ...prev, isOpen: false }));
  };

  return (
    <ConfirmDialogContext.Provider value={{ confirm, alert }}>
      {children}
      {state.isOpen ? (
        <ConfirmDialog
          isOpen={state.isOpen}
          title={state.title}
          message={state.message}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          singleButton={state.singleButton}
        />
      ) : null}
    </ConfirmDialogContext.Provider>
  );
};

/** 全局确认对话框 Hook，任意组件可调用 */
export const useConfirm = (): { confirm: (message: string, title?: string) => Promise<boolean> } => {
  const ctx = React.useContext(ConfirmDialogContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within a ConfirmDialogProvider');
  }
  return { confirm: ctx.confirm };
};

/** 全局提示弹窗 Hook，单按钮模式 */
export const useAlert = (): { alert: (message: string, title?: string) => Promise<void> } => {
  const ctx = React.useContext(ConfirmDialogContext);
  if (!ctx) {
    throw new Error('useAlert must be used within a ConfirmDialogProvider');
  }
  return { alert: ctx.alert };
};

/**
 * @deprecated 请使用 useConfirm + ConfirmDialogProvider 替代
 */
export const useConfirmDialog = () => {
  const [state, setState] = useState<{
    isOpen: boolean;
    title?: string;
    message: string;
    resolve: ((value: boolean) => void) | null;
  }>({ isOpen: false, message: '', resolve: null });

  const confirm = (message: string, title?: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ isOpen: true, message, title, resolve });
    });
  };

  const handleConfirm = () => {
    state.resolve?.(true);
    setState((prev) => ({ ...prev, isOpen: false }));
  };

  const handleCancel = () => {
    state.resolve?.(false);
    setState((prev) => ({ ...prev, isOpen: false }));
  };

  return {
    confirm,
    ConfirmDialogComponent: state.isOpen ? (
      <ConfirmDialog
        isOpen={state.isOpen}
        title={state.title}
        message={state.message}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    ) : null,
  };
};