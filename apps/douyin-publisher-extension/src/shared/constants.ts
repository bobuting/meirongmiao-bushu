/** 后端 API 基础配置 */
export const API_BASE_URL = "http://localhost:3020";
export const API_PATH_PREFIX = "/neirongmiao/api";

/** chrome.storage 存储键 */
export const STORAGE_KEYS = {
  ACCOUNTS: "nrm_ext_accounts",
  ACTIVE_ACCOUNT: "nrm_ext_active_account",
  BACKEND_CONFIG: "nrm_ext_backend_config",
  AUTH_TOKEN: "nrm_ext_auth_token",
  PENDING_LOGIN_TABIDS: "nrm_ext_pending_login_tabids", // pending 账号的登录标签页 ID
} as const;

/** 抖音关键认证 Cookie 名称 */
export const AUTH_COOKIE_NAMES = [
  "sessionid",
  "sessionid_ss",
  "sid_guard",
] as const;

/** 抖音域名 */
export const DOUYIN_DOMAIN = ".douyin.com";

/** 发布页 URL */
export const PUBLISH_PAGE_URL =
  "https://creator.douyin.com/creator-micro/content/publish";

/** 轮询间隔（毫秒） */
export const POLL_INTERVAL_MS = 5_000;

/** 任务各阶段超时（毫秒） */
export const STAGE_TIMEOUTS: Record<string, number> = {
  navigating: 30_000,
  uploading: 600_000,
  processing: 600_000,
  filling_form: 60_000,
  selecting_cover: 60_000,
  publishing: 30_000,
  confirming: 30_000,
} as const;

/** 任务最大重试次数 */
export const MAX_RETRIES = 3;

/** 任务过期时间（2 小时） */
export const JOB_TTL_MS = 2 * 60 * 60 * 1_000;
