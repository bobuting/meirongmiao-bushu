export type ShutdownSignal = "SIGINT" | "SIGTERM" | "SIGHUP" | "SIGBREAK";

interface ShutdownProcessRef {
  once(event: ShutdownSignal, listener: () => void): unknown;
  off(event: ShutdownSignal, listener: () => void): unknown;
}

interface ShutdownLogger {
  info(payload: unknown, message?: string): void;
  error(payload: unknown, message?: string): void;
}

const DEFAULT_SHUTDOWN_SIGNALS: readonly ShutdownSignal[] = ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"];

export function registerGracefulShutdownHandlers(input: {
  close: () => Promise<void>;
  log: ShutdownLogger;
  processRef?: ShutdownProcessRef;
  requestExit?: (code: number) => void;
  signals?: readonly ShutdownSignal[];
}): () => void {
  const processRef = input.processRef ?? (process as unknown as ShutdownProcessRef);
  const requestExit = input.requestExit ?? ((code: number) => process.exit(code));
  const signals = input.signals ?? DEFAULT_SHUTDOWN_SIGNALS;
  const listeners = new Map<ShutdownSignal, () => void>();
  let shutdownStarted = false;

  const detach = () => {
    for (const [signal, listener] of listeners) {
      processRef.off(signal, listener);
    }
    listeners.clear();
  };

  const beginShutdown = (signal: ShutdownSignal) => {
    if (shutdownStarted) {
      return;
    }
    shutdownStarted = true;
    detach();
    input.log.info({ signal }, "graceful shutdown requested");
    void input
      .close()
      .then(() => {
        requestExit(0);
      })
      .catch((error) => {
        input.log.error({ err: error, signal }, "graceful shutdown failed");
        requestExit(1);
      });
  };

  for (const signal of signals) {
    const listener = () => beginShutdown(signal);
    listeners.set(signal, listener);
    processRef.once(signal, listener);
  }

  return detach;
}
