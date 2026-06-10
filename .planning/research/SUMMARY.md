# Research Summary — 图片项目 4 步流水线

## Key Findings

**Stack:** Section-based architecture (banana-mall pattern) + strict service isolation. Share only infrastructure (LLM transport, storage, auth), not business logic. Dedicated PostgreSQL tables for ModelPhoto and PageSection.

**Table Stakes:** Upload → analysis → planning → generation → export pipeline. Step 3 pose/background auto-matching. SVG fallback for failed generations. Section-based detail page with hero + detail blocks.

**Differentiators:** AI automatic pose+background matching (competitors require manual selection). Section-based architecture with visualPrompt-driven generation per section.

**Watch Out For:** Premature abstraction coupling image/video pipelines. LLM failures without user feedback. Step 4 editor complexity (defer full phone preview to v2).

## Recommended Phase Structure

1. **数据基础** — Types, DB tables, contracts (zero-dependency)
2. **Step 1+2** — 服装搭配 + 角色定妆 (MVP flow)
3. **Step 3** — 模特图自动生成 (pose+background auto-matching)
4. **Step 4** — 电商详情页规划 + 生成 (section-based)
5. **集成与打磨** — Wiring, export, error handling

## Files
- STACK.md
- FEATURES.md
- ARCHITECTURE.md
- PITFALLS.md

---
*Synthesized: 2026-04-10*
