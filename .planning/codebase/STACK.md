# Technology Stack

**Analysis Date:** 2026-04-06

## Languages & Runtime

**Primary:**
- TypeScript 5.9 — Backend logic, type-safe API development
- TypeScript 5.8 — Frontend components, React application

**Runtime:**
- Node.js — Backend server (ES2022 module target)
- Browser — Frontend runtime (ESNext with DOM APIs)

**Package Manager:**
- npm — Both backend and frontend (yarn prohibited per CLAUDE.md)
- Lockfile: `package-lock.json` present

## Frameworks & Libraries

### Backend
- Fastify 5.6.0 — High-performance HTTP server framework
- PostgreSQL (pg 8.18.0) — Primary database via `pg` driver
- Sharp 0.32.6 — Image processing (background removal, resizing)
- Zod 4.1.1 — Schema validation and type inference
- Pino 10.3.1 + pino-pretty 13.1.3 — Structured logging
- dotenv 17.3.1 — Environment configuration

**Key Backend Files:**
- `src/app.ts` — Main application entry (超大文件，只减不增原则)
- `src/server.ts` — Server bootstrap
- `src/core/runtime-config.ts` — Configuration resolution
- `src/storage/adapters.ts` — Object storage abstraction

### Frontend
- React 18.2.0 — UI framework
- Vite 6.2.0 — Build tool and dev server
- Tailwind CSS 3.4.17 — Utility-first styling
- Zustand 4.5.2 — Client state management
- TanStack Query 5.28.4 — Server state management
- React Router DOM 6.22.3 — Client-side routing
- @webav/av-canvas 1.2.7 + @webav/av-cliper 1.2.7 — Video editing engine

**Key Frontend Files:**
- `apps/web/App.tsx` — Root component
- `apps/web/services/backendApi.ts` — API aggregation layer
- `apps/web/store/useAppStore.ts` — Zustand store

## Build & Configuration

**Build Tools:**
- TypeScript Compiler (tsc) — Backend compilation (`npm run build`)
- Vite — Frontend compilation (`npm run build:ui`)
- tsx 4.20.5 — TypeScript execution for dev/scripts

**Configuration Files:**
- `tsconfig.json` — Backend TypeScript config (ES2022, strict mode)
- `apps/web/tsconfig.json` — Frontend TypeScript config (bundler mode)
- `vitest.config.ts` — Test runner configuration
- `apps/web/vite.config.ts` — Vite dev server + proxy config
- `apps/web/tailwind.config.cjs` — Tailwind theme customization

**Key Config Patterns:**
- Path alias: `@/*` maps to `src/*` (backend) and current dir (frontend)
- Vite proxy: `/neirongmiao/api` → `http://localhost:3020`

## Testing

**Framework:**
- Vitest 3.2.4 — Unit test runner
- @vitest/coverage-v8 3.2.4 — Coverage reporting
- @playwright/test 1.58.2 — E2E testing

**Commands:**
```bash
npm run test                 # Unit tests
npm run test:coverage        # Coverage report
npm run test:e2e             # E2E tests
```

## Dependencies Summary

| Category | Count | Key Dependencies |
|----------|-------|------------------|
| Production Backend | 15 | fastify, pg, sharp, zod, pino, @aws-sdk/client-s3, ali-oss |
| Production Frontend | 15 | react, react-router-dom, zustand, @tanstack/react-query, @webav/*, chroma-js |
| Development | 9 | typescript, tsx, vitest, playwright, cross-env |

## Platform Requirements

**Development:**
- Node.js (ES2022 support required)
- PostgreSQL database (or set `PERSISTENCE_REQUIRE_READY=false`)
- npm package manager

**Production:**
- Node.js runtime
- PostgreSQL database (connection via `DATABASE_URL`)
- Object storage (S3/阿里云 OSS/local filesystem)

---

*Stack analysis: 2026-04-06*