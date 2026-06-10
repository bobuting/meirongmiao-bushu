# External Integrations

**Analysis Date:** 2026-04-06

## APIs

| Service | Purpose | Auth Method | Key Endpoints |
|---------|---------|-------------|---------------|
| TikHub API | 抖音热榜数据、视频反推 | Bearer token (`TIKHUB_API_TOKEN`) | `api.tikhub.io/api/v1/douyin/billboard/*` |
| Apify API | 抖音视频字幕抓取 | Bearer token (`APIFY_API_TOKEN`) | `api.apify.com/v2/acts/apple_yang~douyin-transcripts-scraper` |
| AnyToCopy API | 视频反推（可选） | Bearer token (`ANYTOCOPY_API_TOKEN`) | Configurable via `ANYTOCOPY_REVERSE_API_URL` |
| DouHot API | 抖音热点列表 | 无认证 | `douhot.douyin.com/douhot/v1/hotspot/list` |
| GitHub Raw | 抖音热榜 README | 无认证 | `raw.githubusercontent.com/lonnyzhang423/douyin-hot-hub` |

**LLM Provider System:**
| Provider | Purpose | Auth Method | Config Location |
|----------|---------|-------------|-----------------|
| 云雾 API (Yunwu) | Gemini/OpenAI/Claude 中转 | Bearer token | Provider secrets table (`nrm_provider_secrets`) |
| Gemini Native | Google 搜索增强、多模态 | API Key (`GEMINI_API_KEY`) | Provider secrets |
| OpenAI Compatible | 文本生成、Vision | Bearer token | Provider secrets |

**Key LLM Files:**
- `src/services/llm/llm-transport.ts` — Core LLM request functions
- `src/services/llm/provider-resolver.ts` — Provider routing and fallback
- `src/services/llm/gemini-utils.ts` — Gemini-specific utilities
- `src/services/llm/openai-utils.ts` — OpenAI-compatible utilities

## Databases

| Database | Purpose | Connection | Schema Files |
|----------|---------|------------|--------------|
| PostgreSQL | Primary data store | `DATABASE_URL` env var | Table prefix: `nrm_*` |

**Tables (prefix `nrm_`):**
- `nrm_users` — User accounts
- `nrm_sessions` — Login sessions
- `nrm_projects` — Video projects
- `nrm_audit_logs` — System audit trail
- `nrm_provider_call_audits` — LLM API call tracking
- `nrm_providers` — LLM provider configs
- `nrm_provider_policies` — Provider routing policies
- `nrm_provider_secrets` — Encrypted API secrets

**Key Files:**
- `src/app-setup/startup-pg-pool.ts` — PG pool initialization
- `src/persistence/hot-trend-db-operations.ts` — Hot trend data operations
- `src/persistence/audit-store.ts` — Audit logging (PG-backed)

## Authentication

| Provider | Purpose | Flow | Config Location |
|----------|---------|------|-----------------|
| Custom | Email/password login | Session token | `src/modules/auth-service.ts` |

**Auth Implementation:**
- Password hashing: bcrypt via `src/core/security.ts`
- Session management: Token-based with TTL (`sessionTtlHours` config)
- Account lockout: Failed attempts tracking (`lockoutAttempts`, `lockoutMinutes`)
- Route protection: Bearer token via `Authorization` header

**Key Files:**
- `src/modules/auth-service.ts` — AuthService class
- `src/routes/auth-routes.ts` — Auth endpoints
- `src/services/auth/route-guards.ts` — Route protection middleware

**Auth Flow:**
1. User submits email/password → `/neirongmiao/api/auth/login`
2. Server validates, creates session token
3. Client stores token, sends via `Authorization: Bearer {token}`
4. Protected routes validate token via `getBearerToken()` + `requireUser()`

## Storage

| Service | Purpose | Access Pattern | Config Location |
|---------|---------|----------------|-----------------|
| Local filesystem | Development storage | Direct file write | `OBJECT_STORAGE_DRIVER=local` |
| 阿里云 OSS | Production storage | ali-oss SDK | `OBJECT_STORAGE_DRIVER=alioss` |
| AWS S3 | Alternative cloud storage | @aws-sdk/client-s3 | `OBJECT_STORAGE_DRIVER=s3` |

**Storage Adapters:**
- `src/storage/adapters.ts` — Adapter implementations:
  - `LocalObjectStorageAdapter` — Local filesystem
  - `S3ObjectStorageAdapter` — AWS S3 compatible
  - `AliOssStorageAdapter` — 阿里云 OSS native SDK
  - `SupabaseObjectStorageAdapter` — Supabase storage (stub)

**Required Env Vars (OSS):**
- `OBJECT_STORAGE_DRIVER` — `local` | `s3` | `alioss`
- `OBJECT_STORAGE_BUCKET` — Bucket name
- `OSS_ACCESS_KEY_ID` / `S3_ACCESS_KEY_ID` — Access key
- `OSS_ACCESS_KEY_SECRET` / `S3_SECRET_ACCESS_KEY` — Secret key
- `OSS_REGION` / `S3_REGION` — Region
- `OSS_ENDPOINT` / `S3_ENDPOINT` — Endpoint URL

**STS Upload (Frontend):**
- `src/routes/library-asset-upload-routes.ts` — STS token generation for frontend direct upload

## Webhooks & Callbacks

**Incoming:**
- None detected (standard REST API)

**Outgoing:**
- LLM API calls via provider system (logged in `nrm_provider_call_audits`)

## Environment Configuration

**Required Env Vars:**
| Variable | Purpose | Default |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection | Required |
| `APP_SECRET_KEY` | Secret encryption (production) | Required in prod |
| `OBJECT_STORAGE_DRIVER` | Storage backend | `local` |
| `PORT` | Server port | `3020` |
| `NODE_ENV` | Environment mode | `development` |

**Optional External API Vars:**
| Variable | Purpose |
|----------|---------|
| `TIKHUB_API_TOKEN` | TikHub authentication |
| `APIFY_API_TOKEN` | Apify authentication |
| `ANYTOCOPY_API_TOKEN` | AnyToCopy authentication |
| `GEMINI_API_KEY` | Direct Gemini access (optional) |

**Bootstrap Admin (dev only):**
| Variable | Purpose |
|----------|---------|
| `DEV_BOOTSTRAP_ADMIN_EMAIL` | Initial admin email |
| `DEV_BOOTSTRAP_ADMIN_PASSWORD` | Initial admin password |

**Key Config Files:**
- `src/core/config.ts` — Default AppConfig values
- `src/core/runtime-config.ts` — Runtime config resolution
- `.env` — Environment file (exists, contains secrets — DO NOT READ)

## CI/CD & Deployment

**Hosting:**
- Self-hosted Node.js server
- PostgreSQL database (cloud or local)

**CI Pipeline:**
- None detected (no GitHub Actions, Jenkins, etc.)

**Build Commands:**
```bash
npm run build:all          # Build both frontend and backend
npm run build:all:strict   # Build with type checking
```

## Monitoring & Observability

**Logging:**
- Pino structured logging (`src/core/logger.ts`)
- LLM transport logging (`llmTransportLogger`)
- Per-module loggers

**Audit Trail:**
- `nrm_audit_logs` — User action audit
- `nrm_provider_call_audits` — LLM API call audit with metrics:
  - `latency_ms`, `timeout_ms`, `status`, `error_code`
  - `input_tokens`, `output_tokens`, `ttft_ms` (time to first token)

**Error Tracking:**
- None detected (no Sentry, DataDog, etc.)

---

*Integration audit: 2026-04-06*