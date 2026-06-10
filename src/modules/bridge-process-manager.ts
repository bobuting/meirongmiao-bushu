/**
 * BridgeProcessManager — 统一的 Python 桥接子进程生命周期管理。
 *
 * 提供：spawn + PID 追踪、超时 watchdog、进程组 kill、
 * stderr __PROGRESS__: 结构化解析、服务关闭时清理。
 *
 * 同时被 DouyinPublishService 和 DouyinAuthService 使用。
 */
import { spawn } from "node:child_process";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("bridge-process-manager");

// ─── public types ──────────────────────────────────────────────

export interface BridgeProgressEvent {
  stage?: string;
  message?: string;
}

export interface BridgeSpawnOptions {
  /** Unique identifier for this process (e.g. jobId / sessionId). */
  id: string;
  /** Python binary path. */
  pythonBin: string;
  /** Script path. */
  scriptPath: string;
  /** Arguments to pass after scriptPath. */
  args: string[];
  /** Timeout in ms. 0 = no timeout. */
  timeoutMs: number;
  /** If true, spawn detached and only track PID (no stdout/stderr). */
  detached?: boolean;
  /** Called on each progress event parsed from stderr. */
  onProgress?: (event: BridgeProgressEvent) => void;
  /** Called on each non-progress log line (sanitized). */
  onLog?: (line: string) => void;
  /** Called when timeout fires, before killing the process. */
  onTimeout?: () => void;
}

export interface BridgeResult {
  exitCode: number | null;
  stdout: string;
  timedOut: boolean;
}

// ─── constants ─────────────────────────────────────────────────

const PROGRESS_PREFIX = "__PROGRESS__:";
const ANSI_RE = /\u001b\[[0-9;]*m/g;

// ─── manager class ─────────────────────────────────────────────

export class BridgeProcessManager {
  /** All tracked processes keyed by id. */
  private readonly processes = new Map<
    string,
    { child: ChildProcess; timedOut: boolean }
  >();

  // ── spawn with full stdio tracking ───────────────────────────

  /**
   * Spawn a Python bridge process, track its PID, parse stderr progress,
   * enforce a timeout, and return collected stdout + exit code.
   */
  spawn(opts: BridgeSpawnOptions): Promise<BridgeResult> {
    return new Promise<BridgeResult>((resolve, reject) => {
      const spawnOpts: SpawnOptions = {
        stdio: opts.detached ? "ignore" : ["ignore", "pipe", "pipe"],
        windowsHide: true,
        // Ensure Python subprocess uses UTF-8 on Windows
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      };

      const child = spawn(
        opts.pythonBin,
        [opts.scriptPath, ...opts.args],
        spawnOpts,
      );

      const entry = { child, timedOut: false };
      this.processes.set(opts.id, entry);

      // ── detached mode: just track PID, no stdio ──────────────
      if (opts.detached) {
        child.unref();
        // For detached we resolve immediately — caller polls state file.
        child.on("error", (err) => {
          this.processes.delete(opts.id);
          reject(new Error(`Failed to spawn bridge: ${err.message}`));
        });
        // Set up timeout to kill even detached processes
        let timer: ReturnType<typeof setTimeout> | null = null;
        if (opts.timeoutMs > 0) {
          timer = setTimeout(() => {
            entry.timedOut = true;
            opts.onTimeout?.();
            void this.kill(opts.id);
          }, opts.timeoutMs);
        }
        // Track close to cleanup
        child.on("close", () => {
          if (timer) clearTimeout(timer);
          this.processes.delete(opts.id);
        });
        resolve({ exitCode: null, stdout: "", timedOut: false });
        return;
      }

      // ── attached mode: full stdio ────────────────────────────
      let stdout = "";
      let stderrBuf = "";
      let stdoutBuf = "";

      // Timeout watchdog
      let timer: ReturnType<typeof setTimeout> | null = null;
      if (opts.timeoutMs > 0) {
        timer = setTimeout(() => {
          entry.timedOut = true;
          opts.onTimeout?.();
          void this.kill(opts.id);
        }, opts.timeoutMs);
      }

      const handleLine = (raw: string) => {
        const line = raw.replace(ANSI_RE, "").trim();
        if (!line) return;
        const progress = this.parseProgress(line);
        if (progress) {
          opts.onProgress?.(progress);
          return;
        }
        opts.onLog?.(line);
      };

      const drainLines = (
        buf: string,
        onLine: (l: string) => void,
      ): string => {
        const parts = buf.split(/\r?\n/);
        const pending = parts.pop() ?? "";
        for (const part of parts) onLine(part);
        return pending;
      };

      child.stdout!.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stdout += text;
        stdoutBuf += text;
        stdoutBuf = drainLines(stdoutBuf, handleLine);
      });

      child.stderr!.on("data", (chunk: Buffer) => {
        stderrBuf += chunk.toString("utf8");
        stderrBuf = drainLines(stderrBuf, handleLine);
      });

      child.on("error", (err) => {
        if (timer) clearTimeout(timer);
        this.processes.delete(opts.id);
        reject(new Error(`Failed to spawn bridge: ${err.message}`));
      });

      child.on("close", (code) => {
        if (timer) clearTimeout(timer);
        this.processes.delete(opts.id);
        // Flush remaining buffers
        if (stdoutBuf.trim()) handleLine(stdoutBuf);
        if (stderrBuf.trim()) handleLine(stderrBuf);
        resolve({
          exitCode: code,
          stdout,
          timedOut: entry.timedOut,
        });
      });
    });
  }

  // ── spawn detached (convenience for QR auth) ─────────────────

  /**
   * Spawn a detached bridge process. Returns the tracked id.
   * Caller is responsible for polling state via external mechanism.
   */
  spawnDetached(opts: Omit<BridgeSpawnOptions, "detached">): string {
    // Fire-and-forget spawn; errors logged but not thrown to caller.
    this.spawn({ ...opts, detached: true }).catch((err) => {
      log.error({ err, id: opts.id }, "[bridge-manager] detached spawn error");
    });
    return opts.id;
  }

  // ── kill a tracked process ───────────────────────────────────

  async kill(id: string): Promise<void> {
    const entry = this.processes.get(id);
    if (!entry) return;
    const pid = entry.child.pid;
    if (!pid) {
      this.processes.delete(id);
      return;
    }

    if (process.platform === "win32") {
      await new Promise<void>((res) => {
        const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
        killer.on("close", () => res());
        killer.on("error", () => res());
      });
    } else {
      // Kill process group (negative PID) so Chrome children also die.
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // Already exited.
        }
      }
    }
    this.processes.delete(id);
  }

  // ── check if a process is alive ──────────────────────────────

  isAlive(id: string): boolean {
    return this.processes.has(id);
  }

  // ── shutdown: kill all tracked processes ──────────────────────

  async shutdown(): Promise<void> {
    const ids = [...this.processes.keys()];
    await Promise.all(ids.map((id) => this.kill(id)));
  }

  // ── helpers ──────────────────────────────────────────────────

  private parseProgress(line: string): BridgeProgressEvent | null {
    if (!line.startsWith(PROGRESS_PREFIX)) return null;
    try {
      return JSON.parse(line.slice(PROGRESS_PREFIX.length)) as BridgeProgressEvent;
    } catch {
      return null;
    }
  }
}
