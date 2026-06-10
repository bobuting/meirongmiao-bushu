<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1pRxqL5mS4O_FLza6se3NKWokco6Cy8Qp

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Fast Integration Switch (Mock / Real / Hybrid)

`services/backendApi.ts` now supports a per-feature dual route:

- `VITE_API_MODE=mock|real|hybrid`
- `VITE_API_REAL_FEATURES=auth,projects,scripts,...` (only used in `hybrid`)
- `VITE_API_REAL_FALLBACK_TO_MOCK=true|false`
- `VITE_API_BASE_URL=http://localhost:3020` (optional, default same-origin)

Recommended production/dev integration (real-only):

```env
VITE_API_MODE=real
VITE_API_REAL_FEATURES=all
VITE_API_REAL_FALLBACK_TO_MOCK=false
VITE_API_BASE_URL=http://localhost:3010
```
