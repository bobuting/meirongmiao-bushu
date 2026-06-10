# Architecture Patterns: Image Project 4-Step Pipeline

**Domain:** AI E-Commerce Image Generation Pipeline (Brownfield Feature Addition)
**Researched:** 2026-04-10

## Overview

Add a **4-step self-contained image project pipeline** to an existing AI e-commerce video generation platform. The image pipeline produces e-commerce detail page images, independent from the video workflow.

### Pipeline Steps

| Step | Name | Description | Reuse? |
|------|------|-------------|--------|
| 1 | 服装搭配 | Upload garment, AI analyzes matching plan | New (no video step1 reuse) |
| 2 | 角色定妆 | Generate character finalization image | New (no video step2 reuse) |
| 3 | 模特图生成 | AI generates model photos (pose + background auto-combo) | New |
| 4 | 电商详情页 | Section-based detail page generation (banana-mall pattern) | New + reference |

### Design Principle

**Self-contained, parallel to video pipeline.** The image pipeline shares infrastructure (LLM transport, storage, auth, persistence) but NOT step logic with the video pipeline. This avoids coupling two workflows that will evolve independently.

## Recommended Architecture

### High-Level System Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Frontend (React 18)                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Video Pipeline          │  Image Pipeline (NEW)                        │
│  /create/:projectId/     │  /image-create/:projectId/                   │
│  step1 → step5           │  step1 → step4                               │
│                          │                                              │
│  ProjectLayout           │  ImageProjectLayout (extended 2→4 steps)    │
│  Assets                  │  ImageStep1Outfit (new)                     │
│  CharacterSelection      │  ImageStep2Character (new)                  │
│  Step3-5 Workspace       │  ImageStep3ModelPhoto (new)                 │
│                          │  ImageStep4DetailPage (new)                 │
│                          │    ├── SectionTreePanel                      │
│    │  PhonePreviewSimulator (new)                  │
│    │  SectionEditorPanel (new)                     │
│                                                                         │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ HTTP /neirongmiao/api
┌──────────────────────────┴──────────────────────────────────────────────┐
│                          Backend (Fastify 5)                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Shared Infrastructure                                                  │
│  ├── AppContext (DI container)                                          │
│  ├── LLM Transport (云雾 API: Gemini/FLUX/DALL-E)                      │
│  ├── Storage Adapter (S3/OSS/Local)                                     │
│  ├── Auth (Bearer token, route guards)                                  │
│  └── Prompt Management (getPromptContent())                             │
│                                                                         │
│  Video Services              │  Image Services (NEW)                    │
│  ProjectService              │  ImageOutfitService (new)               │
│  OutfitService               │  ImageCharacterService (new)            │
│  CharacterService            │  ImageModelPhotoService (new)           │
│  StoryboardService           │  ImageDetailPageService (new)           │
│  VideoJobService             │  ImageSvgFallbackService (new)          │
│                              │  ImageProjectService (extend existing)  │
│                                                                         │
│  Repositories                │  Repositories (NEW)                      │
│  project-pg-repository       │  image-outfit-plans (new table)         │
│  outfit-plans                │  image-character-previews (new table)   │
│  character-previews          │  image-model-photos (new table)         │
│  storyboard-frames           │  image-detail-sections (new table)      │
│                              │  image-detail-pages (new table)         │
│                                                                         │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────────────────┐
│                          PostgreSQL + Object Storage                    │
├─────────────────────────────────────────────────────────────────────────┤
│  nrm_projects (projectKind="image")                                    │
│  nrm_image_outfit_plans                                                  │
│  nrm_image_character_previews                                           │
│  nrm_image_model_photos                                                  │
│  nrm_image_detail_sections                                               │
│  nrm_image_detail_pages                                                  │
│  S3/OSS: /image-projects/{projectId}/*                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Boundaries

### Backend Components

| Component | File Location | Responsibility | Communicates With |
|-----------|--------------|----------------|-------------------|
| `ImageOutfitService` | `src/modules/image-project/image-outfit-service.ts` | Step 1: Garment analysis, matching plan generation | LLM Transport, GarmentAsset repo, ImageOutfitPlan repo |
| `ImageCharacterService` | `src/modules/image-project/image-character-service.ts` | Step 2: Character finalization image generation | LLM Transport, ImageOutfitPlan repo, ImageCharacterPreview repo |
| `ImageModelPhotoService` | `src/modules/image-project/image-model-photo-service.ts` | Step 3: Generate model photos with pose + background combos | LLM Transport, Sharp, ImageCharacterPreview repo, ImageModelPhoto repo |
| `ImageDetailPageService` | `src/modules/image-project/image-detail-page-service.ts` | Step 4: Section-based detail page planning & generation | LLM Transport, ImageModelPhoto repo, ImageDetailSection repo, ImageSvgFallbackService |
| `ImageSvgFallbackService` | `src/modules/image-project/image-svg-fallback-service.ts` | SVG fallback when image generation fails | Sharp (optional), pure SVG generation |
| `registerImageProjectRoutes` | `src/routes/image-project/index.ts` | Route registration for all 4 steps | AppContext, all Image*Services |

### Frontend Components

| Component | File Location | Responsibility | Communicates With |
|-----------|--------------|----------------|-------------------|
| `ImageProjectLayout` | `apps/web/pages/image-project/ImageProjectLayout.tsx` | Layout shell, step routing, state restore (extend existing) | Zustand store, backendApi, React Router |
| `ImageStep1Outfit` | `apps/web/pages/image-project/step1-outfit/ImageStep1Outfit.tsx` | Step 1 UI: garment upload, AI matching plan display | API: POST /image-projects/:id/outfits |
| `ImageStep2Character` | `apps/web/pages/image-project/step2-character/ImageStep2Character.tsx` | Step 2 UI: character finalization preview & confirm | API: POST /image-projects/:id/character |
| `ImageStep3ModelPhoto` | `apps/web/pages/image-project/step3-model-photo/ImageStep3ModelPhoto.tsx` | Step 3 UI: model photo gallery, pose/background combos | API: POST /image-projects/:id/model-photos |
| `ImageStep4DetailPage` | `apps/web/pages/image-project/step4-detail-page/ImageStep4DetailPage.tsx` | Step 4 UI: 3-column editor (section tree + phone preview + edit panel) | API: POST /image-projects/:id/detail-page |
| `PhonePreviewSimulator` | `apps/web/pages/image-project/step4-detail-page/PhonePreviewSimulator.tsx` | Phone-frame preview of detail page sections | Local state, section data |
| `SectionTreePanel` | `apps/web/pages/image-project/step4-detail-page/SectionTreePanel.tsx` | Section tree: reorder, add, delete, regenerate | Local state, API calls |
| `SectionEditorPanel` | `apps/web/pages/image-project/step4-detail-page/SectionEditorPanel.tsx` | Edit individual section: text, images, layout | Local state, API calls |
| `useImageProjectStore` | `apps/web/store/useImageProjectStore.ts` | Zustand store for image project state | Zustand |

## Data Flow

### Step 1: 服装搭配

```
User uploads garment image(s)
    │
    ▼
Frontend: POST /image-projects/:projectId/outfits
    │ (image file → upload → garment asset)
    ▼
Backend: ImageOutfitService.analyzeAndRecommend()
    │ 1. Garment image → Sharp (optional: resize, classify)
    │ 2. Build prompt (prompt management module)
    │ 3. Call LLM (Gemini multimodal: analyze garment + suggest matching)
    │ 4. Parse response → 3 matching plans
    │ 5. Store plans in nrm_image_outfit_plans
    ▼
Returns: Array<ImageOutfitPlan> { id, styleName, items, analysis, optimizedPrompt }
    │
    ▼
Frontend: Display 3 plans, user selects one
    │
    ▼
POST /image-projects/:projectId/outfits/:planId/select
    → project status → OUTFIT_CONFIRMED
    → selectedOutfitPlanId set
```

### Step 2: 角色定妆

```
User confirms outfit plan, enters Step 2
    │
    ▼
Frontend: POST /image-projects/:projectId/character/generate
    │ Sends: outfit plan ID, user preferences
    ▼
Backend: ImageCharacterService.generatePreview()
    │ 1. Load selected outfit plan (optimizedPrompt + items)
    │ 2. Build prompt (outfit plan → character description)
    │ 3. Call LLM image generation (FLUX/DALL-E)
    │ 4. Store preview in nrm_image_character_previews
    ▼
Returns: ImageCharacterPreview { id, imageUrl, prompt, status }
    │
    ▼
Frontend: Display generated character, allow regenerate
    │
    ▼
POST /image-projects/:projectId/character/confirm
    → project status → CHARACTER_CONFIRMED
    → selectedCharacterPreviewId set
```

### Step 3: 模特图生成

```
User confirms character, enters Step 3
    │
    ▼
Frontend: POST /image-projects/:projectId/model-photos/generate
    │ Sends: character preview ID, count, style preferences
    ▼
Backend: ImageModelPhotoService.generatePhotos()
    │ 1. Load character preview + outfit plan
    │ 2. Generate pose+background combinations (AI auto-match)
    │ 3. For each combo:
    │    a. Build prompt (character + outfit + pose + background)
    │    b. Call LLM image generation
    │    c. Store result in nrm_image_model_photos
    │ 4. Return N generated photos
    ▼
Returns: Array<ImageModelPhoto> { id, imageUrl, pose, background, prompt }
    │
    ▼
Frontend: Display gallery, user selects photos for detail page
    │
    ▼
POST /image-projects/:projectId/model-photos/:photoId/select
    → photo marked as selected
```

### Step 4: 电商详情页 (Section-Based Architecture)

```
User enters Step 4 with selected model photos
    │
    ▼
Backend: ImageDetailPageService.planSections()
    │ 1. Load selected model photos + outfit plan + character
    │ 2. Call LLM to plan page sections (banana-mall pattern):
    │    - Hero section (main model photo)
    │    - Detail sections (fabric, fit, styling tips)
    │    - Size guide section
    │    - Scene/usage sections
    │ 3. Store section plan in nrm_image_detail_sections
    │ 4. Link sections to nrm_image_detail_pages
    ▼
Returns: ImageDetailPage { id, sections: Section[] }
    │
    ▼
Frontend: 3-column editor
    │
    │  ┌─────────────┬─────────────────┬──────────────┐
    │  │ SectionTree │ PhonePreview    │ SectionEditor│
    │  │             │                 │              │
    │  │ - Hero      │ ┌─────────────┐ │ Edit current │
    │  │ - Details   │ │  Phone Frame │ │ section:     │
    │  │ - Size      │ │  ┌─────────┐ │ │ - Text       │
    │  │ - Scene 1   │ │ │ Hero    │ │ │ - Images     │
    │  │ - Scene 2   │ │ ├─────────┤ │ │ - Layout     │
    │  │ - CTA       │ │ │ Details │ │ │ - Regenerate │
    │  │             │ │ ├─────────┤ │ │ - Delete     │
    │  │ [Add Sec]   │ │ │ Size    │ │ │              │
    │  │ [Regenerate]│ │ └─────────┘ │ │              │
    │  └─────────────┴─────────────────┴──────────────┘
    │
    │ Each section can be:
    │ - Regenerated (call LLM with updated prompt)
    │ - Manually edited (text overrides)
    │ - Reordered (drag and drop in SectionTree)
    │ - Deleted
    │
    │ SVG Fallback: If image generation fails for a section,
    │ ImageSvgFallbackService generates an SVG layout placeholder
    │
    ▼
POST /image-projects/:projectId/detail-page/export
    → Merge all sections into final composite image(s)
    → Store in object storage
    → project status → READY_TO_PUBLISH
```

## Database Schema (New Tables)

### nrm_image_outfit_plans

```sql
-- 图片项目搭配方案表
CREATE TABLE IF NOT EXISTS nrm_image_outfit_plans (
  id TEXT PRIMARY KEY,                    -- 方案ID
  user_id TEXT NOT NULL,                  -- 用户ID
  project_id TEXT NOT NULL,               -- 项目ID
  garment_asset_id TEXT,                  -- 焦点单品ID
  style_name TEXT,                        -- 风格名称
  title TEXT,                             -- 方案标题
  analysis TEXT,                          -- LLM分析内容
  optimized_prompt TEXT,                  -- 优化后的提示词（用于角色生成）
  suitable_scene TEXT,                    -- 适用场景
  items JSONB,                            -- 服饰单品数组
  tags TEXT[],                            -- 风格标签
  created_at BIGINT NOT NULL,             -- 创建时间戳
  updated_at BIGINT NOT NULL              -- 更新时间戳
);
```

### nrm_image_character_previews

```sql
-- 图片项目角色定妆预览表
CREATE TABLE IF NOT EXISTS nrm_image_character_previews (
  id TEXT PRIMARY KEY,                    -- 预览ID
  user_id TEXT NOT NULL,                  -- 用户ID
  project_id TEXT NOT NULL,               -- 项目ID
  outfit_plan_id TEXT NOT NULL,           -- 关联搭配方案ID
  image_url TEXT NOT NULL,                -- 定妆图URL
  prompt TEXT,                            -- 生成提示词
  status TEXT NOT NULL DEFAULT 'pending', -- pending/generating/ready/failed
  error_message TEXT,                     -- 失败原因
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
```

### nrm_image_model_photos

```sql
-- 图片项目模特图表
CREATE TABLE IF NOT EXISTS nrm_image_model_photos (
  id TEXT PRIMARY KEY,                    -- 照片ID
  user_id TEXT NOT NULL,                  -- 用户ID
  project_id TEXT NOT NULL,               -- 项目ID
  character_preview_id TEXT NOT NULL,     -- 关联定妆图ID
  image_url TEXT NOT NULL,                -- 模特图URL
  pose TEXT,                              -- 姿势描述
  background TEXT,                        -- 背景描述
  prompt TEXT,                            -- 生成提示词
  selected BOOLEAN DEFAULT FALSE,         -- 是否选中用于详情页
  sort_order INT DEFAULT 0,               -- 排序
  status TEXT NOT NULL DEFAULT 'pending', -- pending/generating/ready/failed
  error_message TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
```

### nrm_image_detail_sections

```sql
-- 图片项目详情页区块表
CREATE TABLE IF NOT EXISTS nrm_image_detail_sections (
  id TEXT PRIMARY KEY,                    -- 区块ID
  user_id TEXT NOT NULL,                  -- 用户ID
  project_id TEXT NOT NULL,               -- 项目ID
  page_id TEXT NOT NULL,                  -- 关联详情页ID
  section_type TEXT NOT NULL,             -- hero/detail/size/scene/cta
  title TEXT,                             -- 区块标题
  content JSONB,                          -- 区块内容（文本、图片URL、布局）
  image_url TEXT,                         -- 区块主图URL（LLM生成）
  svg_fallback TEXT,                      -- SVG兜底内容（生成失败时）
  sort_order INT NOT NULL,                -- 排序
  status TEXT NOT NULL DEFAULT 'pending', -- pending/generating/ready/failed/svg-fallback
  prompt TEXT,                            -- 生成提示词
  error_message TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
```

### nrm_image_detail_pages

```sql
-- 图片项目详情页表
CREATE TABLE IF NOT EXISTS nrm_image_detail_pages (
  id TEXT PRIMARY KEY,                    -- 详情页ID
  user_id TEXT NOT NULL,                  -- 用户ID
  project_id TEXT NOT NULL,               -- 项目ID
  title TEXT,                             -- 页面标题
  export_url TEXT,                        -- 导出后的完整图片URL
  status TEXT NOT NULL DEFAULT 'draft',   -- draft/planning/generating/exported
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
```

## Route Registration

### New Route Registrar

Add `image_project_routes` to `APP_ROUTE_REGISTRAR_IDS` in `src/routes/index.ts`:

```typescript
export const APP_ROUTE_REGISTRAR_IDS = [
  "project_flow_routes",
  "image_project_routes",        // NEW
  "reverse_square_routes",
  // ... existing
] as const;
```

### Route Endpoints

```
POST   /image-projects/:projectId/outfits/recommend     — Step 1: Generate matching plans
POST   /image-projects/:projectId/outfits/:planId/select — Step 1: Select a plan
GET    /image-projects/:projectId/outfits                — Step 1: List plans

POST   /image-projects/:projectId/character/generate     — Step 2: Generate character preview
POST   /image-projects/:projectId/character/regenerate   — Step 2: Regenerate
POST   /image-projects/:projectId/character/confirm      — Step 2: Confirm character

POST   /image-projects/:projectId/model-photos/generate   — Step 3: Generate model photos
POST   /image-projects/:projectId/model-photos/:photoId/select — Step 3: Select photo
GET    /image-projects/:projectId/model-photos            — Step 3: List photos

POST   /image-projects/:projectId/detail-page/plan        — Step 4: Plan page sections
POST   /image-projects/:projectId/detail-page/sections/:sectionId/regenerate — Step 4: Regenerate section
PATCH  /image-projects/:projectId/detail-page/sections/:sectionId — Step 4: Edit section
POST   /image-projects/:projectId/detail-page/export      — Step 4: Export final page
GET    /image-projects/:projectId/detail-page             — Step 4: Get page + sections
```

## Integration with Existing Architecture

### AppContext Extension

Add image services to `AppContext` in `src/core/app-context.ts`:

```typescript
export interface AppContext {
  // ... existing
  imageOutfitService: IImageOutfitService;         // NEW
  imageCharacterService: IImageCharacterService;   // NEW
  imageModelPhotoService: IImageModelPhotoService; // NEW
  imageDetailPageService: IImageDetailPageService; // NEW
}
```

### ProjectService Extension

Extend existing `ProjectService` to handle image project step count:

- `IMAGE_PROJECT_MAX_STEP = 4` (currently 2, needs update)
- `updateLastVisitedStep` already works generically with step numbers
- Status transitions need image-specific states or reuse existing ones

### Frontend Routing

Extend `ImageProjectLayout` routes in `apps/web/App.tsx`:

```tsx
// Existing (2 steps):
<Route path="/image-create/:projectId/step1" element={<ImageProjectLayout />}>
  <Route index element={<ImageAssets />} />
</Route>
<Route path="/image-create/:projectId/step2" element={<ImageProjectLayout />}>
  <Route index element={<ImageCharacterSelection />} />
</Route>

// Extended (4 steps):
<Route path="/image-create/:projectId/step3" element={<ImageProjectLayout />}>
  <Route index element={<ImageStep3ModelPhoto />} />
</Route>
<Route path="/image-create/:projectId/step4" element={<ImageProjectLayout />}>
  <Route index element={<ImageStep4DetailPage />} />
</Route>
```

Update `imageProjectRouteNormalization.ts`:
- `IMAGE_PROJECT_CANONICAL_STEPS` from `[1, 2]` to `[1, 2, 3, 4]`
- `resolveImageProjectResumeRoute` clamp from `min(2, ...)` to `min(4, ...)`

## Build Order (Phase Dependencies)

### Phase 1: Data Foundation (Types + DB + Contracts)

**Dependencies:** None (foundation layer)

- Define TypeScript types in `src/contracts/image-project-types.ts`
- Create database tables (4 new tables, no migration files)
- Define service interfaces in `src/contracts/services.ts` (image service interfaces)
- Create repository interfaces in `src/contracts/repository-ports/image-project-repository.ts`
- Implement PG repositories in `src/repositories/pg/image-project-repositories.ts`
- Update `IMAGE_PROJECT_MAX_STEP` from 2 to 4
- Update `imageProjectRouteNormalization.ts` for 4 steps

### Phase 2: Step 1 + Step 2 (MVP — Upload to Character)

**Dependencies:** Phase 1 (types + repos)

- `ImageOutfitService` — Step 1 outfit analysis and matching
- `ImageCharacterService` — Step 2 character generation
- Route handlers for step 1 and step 2 APIs
- Frontend components: `ImageStep1Outfit`, `ImageStep2Character`
- Register `image_project_routes` in route registrar

### Phase 3: Step 3 (Model Photo Generation)

**Dependencies:** Phase 1 (types + repos)

- `ImageModelPhotoService` — Model photo with pose + background combos
- Route handlers for step 3 APIs
- Frontend component: `ImageStep3ModelPhoto`
- Sharp integration for image processing (resize, compose)

### Phase 4: Step 4 (Detail Page Editor)

**Dependencies:** Phase 1 (types + repos), Phase 3 (model photos)

- `ImageDetailPageService` — Section planning and generation
- `ImageSvgFallbackService` — SVG fallback mechanism
- Route handlers for step 4 APIs
- Frontend: `ImageStep4DetailPage` + 3-column editor
- Frontend: `PhonePreviewSimulator`, `SectionTreePanel`, `SectionEditorPanel`

### Phase 5: Integration & Polish

**Dependencies:** Phase 1-4

- AppContext wiring (add image services to DI container)
- Route registrar smoke test coverage
- Project list page shows image projects with correct step indicators
- Export pipeline (composite image generation)
- Error handling, loading states, edge cases

### Dependency Graph

```
Phase 1: Types + DB + Contracts
    ├──→ Phase 2: Step 1 + Step 2
    ├──→ Phase 3: Step 3
    │        └──→ Phase 4: Step 4
    └─────────────→ Phase 4: Step 4
                         └──→ Phase 5: Integration
```

## Patterns to Follow

### Pattern 1: Section-Based Architecture (Step 4)

**What:** Split e-commerce detail page into independently generatable/editable sections

**Why:** Users can regenerate individual sections without re-generating the entire page. Each section has its own prompt, image, and state.

**Implementation:**
```typescript
interface DetailSection {
  id: string;
  type: 'hero' | 'detail' | 'size' | 'scene' | 'cta';
  content: SectionContent; // { text, imageUrl, layout }
  status: 'pending' | 'generating' | 'ready' | 'failed' | 'svg-fallback';
  svgFallback?: string; // SVG content when image gen fails
}

interface DetailPage {
  id: string;
  sections: DetailSection[]; // Ordered list
  exportUrl: string | null;
}
```

### Pattern 2: SVG Fallback Mechanism

**What:** When LLM image generation fails for a section, generate an SVG layout placeholder

**Why:** Better UX than empty/error states. SVG provides a structural layout that still conveys information.

**Implementation:**
```typescript
class ImageSvgFallbackService {
  generateSectionFallback(section: DetailSection): string {
    // Generate SVG with:
    // - Section type label
    // - Placeholder rectangles for image areas
    // - Text content if available
    // - Styled border/label indicating "generating"
    return svgString;
  }
}
```

### Pattern 3: Project Kind Routing

**What:** Use `projectKind` field to route to the correct pipeline

**Why:** Image and video pipelines are independent. The `projectKind` field already exists and should be the single source of truth.

**Implementation:** Frontend routes based on `projectKind`. Backend services are separate. No cross-pipeline logic.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Reusing Video Step 1/2 Logic

**What:** Import video outfit/character services for image projects

**Why bad:** Video step 1/2 have video-specific logic (script generation, storyboard prep). Image projects have different end goals. Reusing creates coupling and confusion.

**Instead:** New services (`ImageOutfitService`, `ImageCharacterService`) that may share helper functions (LLM calls, prompt building) but NOT business logic.

### Anti-Pattern 2: Adding Routes to app.ts

**What:** Register image project routes directly in `src/app.ts`

**Why bad:** `app.ts` is already too large, CLAUDE.md explicitly says "只减不增".

**Instead:** Use `registerImageProjectRoutes` in `src/routes/image-project/index.ts`, register via route registrar pattern.

### Anti-Pattern 3: Storing Step Data in payload_json

**What:** Store all image project step data as JSON in a single column

**Why bad:** CLAUDE.md says "不要用 payload_json 存储，用传统字段模式". Makes querying, auditing, and debugging harder.

**Instead:** Dedicated tables with explicit columns for each step's data.

### Anti-Pattern 4: Hardcoding Prompts

**What:** Embed LLM prompts directly in service code

**Why bad:** CLAUDE.md says "所有提示词必须通过提示词管理模块统一管理，绝对禁止硬编码"

**Instead:** Use `getPromptContent()` from prompt management module, with variables passed as `userPrompt`/`userInput`.

### Anti-Pattern 5: Silent Degradation on Failure

**What:** Return empty/default data when LLM generation fails

**Why bad:** CLAUDE.md says "主流程失败时直接报错，禁止静默降级"

**Instead:** Throw errors for main flow failures. SVG fallback is an explicit design feature, not a silent degradation.

## Scalability Considerations

| Concern | Current (100 users) | At 10K users | At 1M users |
|---------|---------------------|--------------|-------------|
| LLM calls | Synchronous, single provider | Async queue, provider fallback | Multi-region, load balancing |
| Image storage | Local/S3 single bucket | CDN + multi-region S3 | CDN + edge caching |
| DB queries | Direct PG queries | Connection pooling, read replicas | Sharding by user/project |
| Concurrent generations | Sequential per user | Per-user concurrency limit | Distributed queue (BullMQ/Redis) |

## Sources

- **Project Context:** `.planning/PROJECT.md` (Image project 4-step pipeline requirements)
- **Architecture Constraints:** `CLAUDE.md` (app.ts 只减不增, route registrar pattern, prompt management)
- **Existing Patterns:** `src/routes/step1-outfit/index.ts`, `src/modules/outfit-service.ts`, `src/routes/step3-candidate/index.ts`
- **Reference Project:** banana-mall (section-based architecture, SVG fallback, phone preview simulator)
- **Current Image Code:** `apps/web/pages/image-project/ImageProjectLayout.tsx`, `apps/web/pages/image-project/imageProjectRouteNormalization.ts`