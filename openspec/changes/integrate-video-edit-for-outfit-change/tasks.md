## 1. Video Split Utility

- [x] 1.1 Create `src/utils/video-split.ts` with splitVideoBySegments function
- [x] 1.2 Implement ffmpeg command execution for video splitting (ffmpeg -ss -t -i -c copy)
- [x] 1.3 Accept actionSegments as input (startTime/endTime from Stage 1)
- [x] 1.4 Add error handling for invalid split points (exceed duration, negative time)
- [x] 1.5 Implement segment upload to object storage (S3/OSS)
- [x] 1.6 Add unit tests for video-split utility

## 2. Kling Video Edit API Integration

- [x] 2.1 Add KLING_VIDEO_EDIT_PRO to ProviderRouteKeys in `src/contracts/provider-route-keys.ts`
- [x] 2.2 Create buildKlingVideoEditEndpoint function in `src/modules/kling-video-provider-endpoints.ts`
- [x] 2.3 Add CallMode configuration for async-polling pattern
- [x] 2.4 Implement requestVideoEdit function following existing requestVideoUrl pattern
- [x] 2.5 Add async task polling logic (poll every 5s until completed/failed)
- [x] 2.6 Integrate with LLM debug recorder (create/finalize records)
- [x] 2.7 Update docs/provider-route-keys-and-call-modes.md with new RouteKey
- [x] 2.8 Add unit tests for video edit generation

## 3. Workflow Mode Configuration

- [x] 3.1 Add OUTFIT_CHANGE_MODE to `src/core/video-config.ts` (video-edit | image-to-video)
- [x] 3.2 Add mode parameter to outfit change task input contract
- [x] 3.3 Implement mode resolution logic (per-task override vs global default)

## 4. Stage 2 Modification - Video Split + Reference Image

- [x] 4.1 Create `src/modules/video-step/step3-outfit-change/stage2-video-edit-adapt.ts`
- [x] 4.2 Implement adaptSingleSegmentForVideoEdit function (video split + reference image)
- [x] 4.3 Integrate video-split utility using actionSegments from Stage 1
- [x] 4.4 Store segment video URL in segmentVideos table
- [x] 4.5 Generate outfit reference image using existing image generation
- [x] 4.6 Add fallback to original Stage 2 when image-to-video mode active

## 5. Stage 3 Modification - Video Edit API

- [x] 5.1 Create `src/modules/video-step/step3-outfit-change/stage3-video-edit-generation.ts`
- [x] 5.2 Implement generateSegmentVideoEdit function (calls kling video edit API)
- [x] 5.3 Pass segment video URL, reference images, and outfit prompt to API
- [x] 5.4 Handle API polling and result retrieval
- [x] 5.5 Store edited video URL in segmentVideos table
- [x] 5.6 Add fallback to original Stage 3 when image-to-video mode active

## 6. Executor Handlers Integration

- [x] 6.1 Modify executeOutfitAdaptJob to dispatch to correct Stage 2 based on mode
- [x] 6.2 Modify executeOutfitGenJob (or create new handler) for video edit mode
- [x] 6.3 Add mode parameter to job input parsing
- [x] 6.4 Ensure job status updates work for both modes
- [x] 6.5 Note: Stage 1 (executeOutfitUnderstandJob) remains unchanged

## 7. Data Model Compatibility

- [x] 7.1 Update segmentImages table usage (reference_image_url instead of first/last frames)
- [x] 7.2 Add source_video_url field usage to segmentVideos table (if not exists)
- [x] 7.3 Ensure backward compatibility with existing image-to-video mode data

## 8. Error Handling and Retry

- [x] 8.1 Add retry logic for video edit API calls (max 3 retries)
- [x] 8.2 Implement exponential backoff for rate limit errors
- [x] 8.3 Add timeout handling for video edit API (uses video-config polling timeout)
- [x] 8.4 Log failures with appropriate error codes
- [-] 8.5 Provide automatic fallback to image-to-video mode on repeated failures (不需要，用户明确拒绝降级)

## 9. Testing and Validation

- [x] 9.1 Create unit tests for video-split utility
- [x] 9.2 Create unit tests for video edit generation
- [ ] 9.3 Create integration test for video-edit mode end-to-end flow
- [ ] 9.4 Compare output quality between video-edit and image-to-video modes
- [ ] 9.5 Test mode switching functionality
- [ ] 9.6 Test handling of segments longer than API limits (>15s)

## 10. Documentation

- [x] 10.1 Create outfit-change-workflow.md with workflow description
- [x] 10.2 Document mode switching configuration
- [x] 10.3 Add API integration notes to docs/provider-route-keys-and-call-modes.md
- [x] 10.4 Create troubleshooting guide in workflow doc

## 11. Deployment and Rollback

- [ ] 11.1 Deploy Phase 1 changes (video-split utility + API integration) without enabling
- [ ] 11.2 Enable video-edit mode in staging environment for testing
- [ ] 11.3 Run A/B comparison with production traffic (optional)
- [ ] 11.4 Switch default mode to video-edit after validation
- [ ] 11.5 Verify rollback procedure (switch config to image-to-video)

## Summary

**Core Implementation Complete**: All core development tasks (1-7, 8.1-8.4, 10.x) are complete.

**Remaining Tasks**:
- 8.5: Automatic fallback (optional enhancement)
- 9.3-9.6: Integration and validation testing (requires deployment)
- 11.x: Deployment steps (operational tasks)