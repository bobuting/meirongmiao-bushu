## 1. Interface Refactoring

- [x] 1.1 Update TransitionConfig interface: rename `duration` to `durationInFrames`, add `timing` and `alignment` fields
- [x] 1.2 Create TransitionTiming type definition: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'cubic-bezier'
- [x] 1.3 Create TransitionDefinition interface for metadata (defaultDuration, minDuration, maxDuration, hasDirection, directions)
- [x] 1.4 Add conversion utility functions: framesToMicroseconds(frames, fps) and microsecondsToFrames(us, fps)

## 2. Timing Function Implementation

- [x] 2.1 Implement applyTimingFunction(progress, timing, bezierParams) utility
- [x] 2.2 Add linear timing (identity function)
- [x] 2.3 Add ease-in timing (progress squared)
- [x] 2.4 Add ease-out timing (1 - (1-progress) squared)
- [x] 2.5 Add ease-in-out timing (split at 0.5)
- [x] 2.6 Add cubic-bezier timing with bezier curve calculation

## 3. Alignment Calculation

- [x] 3.1 Implement calculateTransitionStartTime(cutPointFrame, durationInFrames, alignment) utility
- [x] 3.2 Add alignment=0 case (right clip start)
- [x] 3.3 Add alignment=0.5 case (centered on cut)
- [x] 3.4 Add alignment=1 case (left clip end)
- [x] 3.5 Add custom alignment case (0-1 range offset calculation)

## 4. ExportPipeline Rendering Update

- [x] 4.1 Update renderTransitionFrame to use timing function on progress
- [x] 4.2 Update renderTransitionFrame to use alignment-based frame timing
- [x] 4.3 Update frame loop to calculate progress with timing applied
- [x] 4.4 Add backward compatibility: accept legacy duration field and convert

## 5. Video Merge Configuration Update

- [x] 5.1 Update video-merge.ts to use durationInFrames instead of microseconds
- [x] 5.2 Update transition config generation with timing and alignment
- [x] 5.3 Add default timing=linear and alignment=0.5 for existing callers
- [x] 5.4 Update getRandomTransitionDuration to return frames count

## 6. Business Configuration Update

- [x] 6.1 Update videoMergeHelper.ts: convert 3-second config to frames (90 frames at 30fps)
- [x] 6.2 Add fps parameter to video merge options for frame rate awareness
- [x] 6.3 Update transitionDurationMin/Max from microseconds to frames

## 7. Transition Types Expansion

- [x] 7.1 Create TransitionDefinition registry for all 40+ transition types
- [x] 7.2 Add dissolve series definitions (dissolve, cross-fade, fade-through-black, fade-through-white)
- [x] 7.3 Add wipe series definitions (wipe-left, wipe-right, wipe-up, wipe-down, wipe-diagonal)
- [x] 7.4 Add slide series definitions (slide-left, slide-right, slide-up, slide-down, slide-push)
- [x] 7.5 Add iris series definitions (iris-circle, iris-square, iris-star, iris-heart)
- [x] 7.6 Add shape series definitions (shape-circle, shape-square, shape-star, shape-heart, shape-diamond)
- [x] 7.7 Update getGpuTransitionIds to return expanded catalog
- [x] 7.8 Update smooth transition filter to include new types

## 8. GPU Shader Expansion

- [x] 8.1 Add iris-circle shader to TransitionPipeline
- [x] 8.2 Add iris-square shader to TransitionPipeline
- [x] 8.3 Add iris-star shader to TransitionPipeline
- [x] 8.4 Add iris-heart shader to TransitionPipeline
- [x] 8.5 Add shape-circle shader to TransitionPipeline
- [x] 8.6 Add shape-square shader to TransitionPipeline
- [x] 8.7 Add shape-star shader to TransitionPipeline
- [x] 8.8 Add shape-heart shader to TransitionPipeline

## 9. Testing and Verification

- [x] 9.1 Test frame-based duration at different frame rates (24fps, 30fps, 60fps)
- [x] 9.2 Test all 5 timing functions with progress values 0.25, 0.5, 0.75
- [x] 9.3 Test alignment values 0, 0.3, 0.5, 0.7, 1
- [x] 9.4 Test backward compatibility with legacy microsecond config
- [x] 9.5 Test smooth transition filtering excludes glitch/pixelate/chromatic
- [x] 9.6 Verify video merge produces correct output with new config