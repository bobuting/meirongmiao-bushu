export function resolveAdminSystemSettingsErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "操作失败，请稍后重试";
}
