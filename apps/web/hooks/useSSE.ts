/**
 * SSE (Server-Sent Events) Hook
 * 用于实时接收任务状态更新
 */

import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';

/** SSE 信号类型 */
export interface SSESignal {
  type: 'job_created' | 'job_updated' | 'job_completed' | 'job_failed' | 'model_photo_failed';
  jobId: string;
  jobType: string;
  status?: 'completed' | 'failed';
  error?: { code: string; message: string };
  timestamp: number;
  /** model_photo_failed 专用字段 */
  photoId?: string;
  poseLabel?: string;
  errorMessage?: string;
  projectId?: string;
}

/** SSE Hook 配置 */
interface UseSSEOptions {
  /** 是否启用（默认 true） */
  enabled?: boolean;
  /** 重连间隔（毫秒，默认 3000） */
  reconnectInterval?: number;
  /** 最大重连次数（默认 10） */
  maxReconnectAttempts?: number;
}

/** SSE Hook 返回值 */
interface UseSSEReturn {
  /** 是否已连接 */
  isConnected: boolean;
  /** 重连次数 */
  reconnectCount: number;
  /** 手动重连 */
  reconnect: () => void;
}

/** 后端推送的命名事件列表 */
const SSE_EVENT_TYPES = [
  'initial',
  'job_created',
  'job_updated',
  'job_completed',
  'job_failed',
  'model_photo_failed',
] as const;

/**
 * SSE Hook
 * 自动连接、断线重连、接收信号并更新 store
 */
export function useSSE(options: UseSSEOptions = {}): UseSSEReturn {
  const {
    enabled = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
  } = options;

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // 用 ref 持有最新配置，避免 connect 因配置变化重建导致 useEffect 重连
  const enabledRef = useRef(enabled);
  const reconnectIntervalRef = useRef(reconnectInterval);
  const maxReconnectAttemptsRef = useRef(maxReconnectAttempts);
  enabledRef.current = enabled;
  reconnectIntervalRef.current = reconnectInterval;
  maxReconnectAttemptsRef.current = maxReconnectAttempts;

  // Store actions（通过 ref 持有避免 handleMessage 依赖变化导致连锁重建）
  const refreshGlobalTasks = useAppStore((state) => state.refreshGlobalTasks);
  const refreshGlobalTasksRef = useRef(refreshGlobalTasks);
  refreshGlobalTasksRef.current = refreshGlobalTasks;

  /** 处理 SSE 消息 */
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const signal: SSESignal = JSON.parse(event.data);

      // 【调试日志】SSE 事件接收
      console.log('[SSE] 收到事件:', signal.type, signal.jobId, signal.jobType, signal.status);

      refreshGlobalTasksRef.current();

      // 特殊处理：模特图失败通知
      if (signal.type === 'model_photo_failed') {
        const pushTaskNotification = useAppStore.getState().pushTaskNotification;
        pushTaskNotification({
          category: 'clip',
          title: '模特图生成失败',
          detail: `${signal.poseLabel ?? '模特图'} 生成失败，已自动删除${signal.errorMessage ? `：${signal.errorMessage}` : ''}`,
          targetPath: signal.projectId ? `/image-create/${signal.projectId}/step3` : null,
        });
      }
    } catch {
      // 非法 JSON，静默忽略
    }
  }, []);

  /** 连接 SSE（稳定引用，不依赖外部变量） */
  const connect = useCallback(() => {
    if (!enabledRef.current) return;

    // 关闭现有连接（EventSource.close 自动移除所有监听器）
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const token = useAppStore.getState().token;
    const url = token
      ? `/neirongmiao/api/async-jobs/sse?token=${encodeURIComponent(token)}`
      : '/neirongmiao/api/async-jobs/sse';
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      reconnectCountRef.current = 0;
      refreshGlobalTasksRef.current();
    };

    // 注册所有命名事件监听器
    for (const eventType of SSE_EVENT_TYPES) {
      es.addEventListener(eventType, handleMessage);
    }

    // 兼容默认 message 事件
    es.onmessage = handleMessage;

    es.onerror = () => {
      es.close();
      if (eventSourceRef.current === es) {
        eventSourceRef.current = null;
      }

      // 自动重连
      if (reconnectCountRef.current < maxReconnectAttemptsRef.current) {
        reconnectCountRef.current++;
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, reconnectIntervalRef.current);
      }
    };
  }, [handleMessage]); // handleMessage 通过 ref 读取最新 store，本身是稳定引用

  /** 手动重连 */
  const reconnect = useCallback(() => {
    reconnectCountRef.current = 0;
    connect();
  }, [connect]);

  /** 初始化连接（只在 enabled 变化时执行） */
  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [enabled, connect]);

  return {
    isConnected: eventSourceRef.current?.readyState === EventSource.OPEN,
    reconnectCount: reconnectCountRef.current,
    reconnect,
  };
}
