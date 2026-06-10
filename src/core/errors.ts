export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  /** 额外信息（如 taskId） */
  public readonly extras?: Record<string, unknown>;

  constructor(statusCode: number, code: string, message: string, extras?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.extras = extras;
  }
}

export function assertCondition(
  condition: boolean,
  statusCode: number,
  code: string,
  message: string,
): void {
  if (!condition) {
    throw new AppError(statusCode, code, message);
  }
}
