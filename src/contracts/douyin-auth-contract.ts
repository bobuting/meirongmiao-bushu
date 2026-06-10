export interface DouyinUserCookie {
  id: string;
  userId: string;
  accountFilePath: string;
  status: "pending" | "scanning" | "authenticated" | "expired";
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface DouyinScanSession {
  id: string;
  userId: string;
  qrCodeUrl: string;
  qrUpdatedAt: number | null;
  status: "pending" | "scanned" | "confirmed" | "timeout" | "error";
  errorMessage: string | null;
  createdAt: number;
  expiresAt: number;
}

export interface DouyinAuthStatus {
  hasValidCookie: boolean;
  status: "none" | "pending" | "authenticated" | "expired";
  expiresAt: number | null;
  updatedAt: number | null;
  username: string | null;
}

export interface DouyinRemoteLoginSession {
  id: string;
  userId: string;
  remoteLoginUrl: string;
  status: "starting" | "ready" | "challenge_required" | "confirmed" | "timeout" | "error";
  errorMessage: string | null;
  challengeText: string | null;
  createdAt: number;
  expiresAt: number;
  bindPort: number | null;
  displayNum: number | null;
}
