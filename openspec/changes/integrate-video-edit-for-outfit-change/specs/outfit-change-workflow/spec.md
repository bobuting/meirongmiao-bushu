## ADDED Requirements

### Requirement: Workflow mode can be switched
The system SHALL support switching between "video-edit" and "image-to-video" modes for outfit change workflow.

#### Scenario: Default mode is video-edit
- **WHEN** outfit change task is created
- **THEN** system uses "video-edit" mode by default

#### Scenario: Switch to image-to-video mode
- **WHEN** configuration OUTFIT_CHANGE_MODE is set to "image-to-video"
- **THEN** system uses original first-frame/last-frame + image-to-video approach

#### Scenario: Per-task mode override
- **WHEN** task input specifies mode explicitly
- **THEN** system uses that mode instead of global default

### Requirement: Stage 1 remains unchanged in video-edit mode
The system SHALL use existing video understanding logic for Stage 1 in both modes.

#### Scenario: Video understanding unchanged
- **WHEN** video-edit mode is active and Stage 1 executes
- **THEN** system uses existing video understanding to extract actionSegments (startTime/endTime)

#### Scenario: ActionSegments used for splitting
- **WHEN** Stage 1 completes with actionSegments
- **THEN** Stage 2 uses these time boundaries to split source video

## MODIFIED Requirements

### Requirement: Stage 2 generates reference image instead of first/last frames
The system SHALL generate single reference image per segment instead of first and last frames in video-edit mode.

**Original behavior**: Generate 2N images (N segments × first + last frames)
**New behavior**: Generate N images (N segments × 1 reference image)

#### Scenario: Reference image generation
- **WHEN** video-edit mode is active and Stage 2 executes for segment
- **THEN** system generates one outfit reference image for that segment

#### Scenario: Reference image used for all segments
- **WHEN** multiple segments exist
- **THEN** same reference image can be reused for all segments to ensure consistency

#### Scenario: First/last frame mode preserved
- **WHEN** image-to-video mode is active
- **THEN** system generates first and last frames as before

### Requirement: Stage 3 calls video edit API instead of image-to-video
The system SHALL call kling video edit API instead of omni-video API in video-edit mode.

**Original behavior**: Call omni-video with first_frame + last_frame + prompt
**New behavior**: Call video-edit with segment_video + reference_images + prompt

#### Scenario: Video edit API call
- **WHEN** video-edit mode is active and Stage 3 executes
- **THEN** system calls KLING_VIDEO_EDIT_PRO RouteKey

#### Scenario: Input parameters differ
- **WHEN** video-edit API is called
- **THEN** input includes segment_video_url, reference_images array, and outfit_change prompt

#### Scenario: Image-to-video preserved
- **WHEN** image-to-video mode is active
- **THEN** system calls KLING_OMNI_VIDEO or multi-image API as before

### Requirement: Executor handlers support dual mode
The system SHALL support both workflow modes in executor-handlers.ts.

**Original behavior**: Single hardcoded workflow
**New behavior**: Mode-aware dispatch to different stage implementations

#### Scenario: Mode dispatch in understand stage
- **WHEN** understand job executes
- **THEN** system checks mode and calls appropriate Stage 1 implementation

#### Scenario: Mode dispatch in adapt stage
- **WHEN** adapt job executes
- **THEN** system checks mode and calls appropriate Stage 2 implementation

#### Scenario: Mode dispatch in gen stage
- **WHEN** gen job executes
- **THEN** system checks mode and calls appropriate Stage 3 implementation