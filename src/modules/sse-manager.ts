/**
 * SSE 连接管理器
 *
 * 职责：
 * 1. 管理所有 SSE 连接（按 userId 分组）
 * 2. 推送任务状态变化信号（精简信号，不带完整数据）
 * 3. 自动清理断开的连接
 * 4. 提供全局单例访问
 *
 * 设计原则：
 * - SSE 只推送信号，前端收到信号后主动查询详情
 * - 减少消息体大小，提高传输效率
 * - 保证数据一致性（以数据库为准）
 */

import type { FastifyReply } from "fastify";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("sse-manager");

/** SSE 事件类型 */
export type SSEEventType =
  | "job_created"
  | "job_updated"
  | "job_completed"
  | "job_failed"
  | "job_deleted"
  | "model_photo_failed";

/** SSE 信号（精简版，只包含关键信息） */
export interface SSESignal {
  /** 事件类型 */
  type: SSEEventType;
  /** 任务 ID */
  jobId: string;
  /** 任务类型 */
  jobType: string;
  /** 状态（只有完成/失败时才带） */
  status?: "completed" | "failed";
  /** 错误信息（失败时带） */
  error?: { code: string; message: string };
  /** 进度信息（父任务子任务进度） */
  progress?: { completedChildCount: number; totalChildCount: number; failedChildCount: number };
  /** 时间戳 */
  timestamp: number;
  /** model_photo_failed 专用：照片 ID */
  photoId?: string;
  /** model_photo_failed 专用：姿态标签 */
  poseLabel?: string;
  /** model_photo_failed 专用：失败原因 */
  errorMessage?: string;
  /** model_photo_failed 专用：项目 ID */
  projectId?: string;
}

/** SSE 连接信息 */
interface SSEConnection {
  userId: string;
  reply: FastifyReply;
  connectedAt: number;
  lastHeartbeat: number;
}

/**
 * SSE 连接管理器（单例）
 */
export class SSEManager {
  /** 按 userId 分组的连接 Map */
  private connections = new Map<string, Set<SSEConnection>>();

  /** 全局连接计数 */
  private totalConnections = 0;

  /** 心跳检查定时器 */
  private heartbeatTimer?: NodeJS.Timeout;

  /** 心跳间隔（30秒） */
  private readonly HEARTBEAT_INTERVAL = 30_000;

  /** 连接超时时间（5分钟无心跳则断开） */
  private readonly CONNECTION_TIMEOUT = 5 * 60_000;

  constructor() {
    this.startHeartbeatCheck();
  }

  /**
   * 注册 SSE 连接
   */
  register(userId: string, reply: FastifyReply): void {
    const connection: SSEConnection = {
      userId,
      reply,
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
    };

    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set());
    }

    this.connections.get(userId)!.add(connection);
    this.totalConnections++;

    log.info(
      { userId, totalConnections: this.totalConnections },
      "SSE 连接已注册"
    );

    // 监听连接关闭事件
    reply.raw.on("close", () => {
      this.unregister(userId, connection);
    });
  }

  /**
   * 移除 SSE 连接
   */
  unregister(userId: string, connection: SSEConnection): void {
    const userConnections = this.connections.get(userId);
    if (!userConnections) return;

    userConnections.delete(connection);
    this.totalConnections--;

    if (userConnections.size === 0) {
      this.connections.delete(userId);
    }

    log.info(
      { userId, totalConnections: this.totalConnections },
      "SSE 连接已断开"
    );
  }

  /**
   * 推送信号给指定用户的所有连接
   */
  pushToUser(userId: string, signal: SSESignal): void {
    const userConnections = this.connections.get(userId);
    if (!userConnections || userConnections.size === 0) return;

    const eventData = this.formatSignal(signal);

    for (const conn of userConnections) {
      try {
        conn.reply.raw.write(eventData);
        conn.lastHeartbeat = Date.now();
      } catch (err) {
        log.warn({ userId, err }, "推送 SSE 信号失败，连接可能已断开");
        this.unregister(userId, conn);
      }
    }
  }

  /**
   * 格式化 SSE 信号
   */
  private formatSignal(signal: SSESignal): string {
    return `event: ${signal.type}\ndata: ${JSON.stringify(signal)}\n\n`;
  }

  /**
   * 发送心跳
   */
  private sendHeartbeat(userId: string, connection: SSEConnection): void {
    try {
      connection.reply.raw.write(": heartbeat\n\n");
      connection.lastHeartbeat = Date.now();
    } catch (err) {
      log.warn({ userId }, "心跳发送失败，连接已断开");
      this.unregister(userId, connection);
    }
  }

  /**
   * 启动心跳检查
   */
  private startHeartbeatCheck(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();

      for (const [userId, conns] of this.connections) {
        for (const conn of conns) {
          // 超时断开
          if (now - conn.lastHeartbeat > this.CONNECTION_TIMEOUT) {
            log.warn({ userId }, "连接超时，自动断开");
            this.unregister(userId, conn);
            continue;
          }

          // 发送心跳
          this.sendHeartbeat(userId, conn);
        }
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * 停止心跳检查（服务关闭时调用）
   */
  stopHeartbeatCheck(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalConnections: number;
    userCount: number;
    connectionsPerUser: Record<string, number>;
  } {
    const connectionsPerUser: Record<string, number> = {};
    for (const [userId, conns] of this.connections) {
      connectionsPerUser[userId] = conns.size;
    }

    return {
      totalConnections: this.totalConnections,
      userCount: this.connections.size,
      connectionsPerUser,
    };
  }

  /**
   * 关闭所有连接（服务关闭时调用）
   */
  closeAll(): void {
    for (const [userId, conns] of this.connections) {
      for (const conn of conns) {
        try {
          conn.reply.raw.end();
        } catch {
          // ignore
        }
      }
    }

    this.connections.clear();
    this.totalConnections = 0;
    this.stopHeartbeatCheck();

    log.info("所有 SSE 连接已关闭");
  }
}

/** 全局单例 */
export const sseManager = new SSEManager();
