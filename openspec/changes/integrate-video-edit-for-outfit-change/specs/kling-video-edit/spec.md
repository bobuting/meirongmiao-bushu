## ADDED Requirements

### Requirement: Kling video edit API can be called
The system SHALL call kling-video-o3-pro API to edit video with outfit change.

#### Scenario: Successful outfit change
- **WHEN** user provides source video, reference image, and prompt "change to white shirt"
- **THEN** system calls kling API and returns edited video URL

#### Scenario: API returns task ID
- **WHEN** kling API accepts the request
- **THEN** system receives task ID for async processing

#### Scenario: API rate limit handled
- **WHEN** kling API returns rate limit error
- **THEN** system retries after delay with exponential backoff

### Requirement: Reference images control outfit appearance
The system SHALL pass up to 4 reference images to kling API for visual guidance.

#### Scenario: Single reference image
- **WHEN** user provides 1 reference image
- **THEN** API uses that image as outfit reference

#### Scenario: Multiple reference images
- **WHEN** user provides 4 reference images (front, back, left, right views)
- **THEN** API uses all images for multi-angle outfit guidance

#### Scenario: No reference image
- **WHEN** user provides no reference image but only text prompt
- **THEN** API still processes request using text-only guidance

### Requirement: Async task polling implemented
The system SHALL poll kling API for task completion status.

#### Scenario: Poll until completion
- **WHEN** task is submitted to kling API
- **THEN** system polls status endpoint every 5 seconds until "completed"

#### Scenario: Handle task failure
- **WHEN** kling API returns "failed" status
- **THEN** system throws error with failure reason

#### Scenario: Timeout handling
- **WHEN** task does not complete within 5 minutes
- **THEN** system throws timeout error

### Requirement: LLM debug record created
The system SHALL create LLM debug record for every kling API call following project LLM audit requirements.

#### Scenario: Record API call
- **WHEN** kling API is called
- **THEN** system creates debug record with RouteKey "KLING_VIDEO_EDIT_PRO"

#### Scenario: Record success
- **WHEN** kling API returns successfully
- **THEN** system finalizes debug record with success status

#### Scenario: Record failure
- **WHEN** kling API call fails
- **THEN** system finalizes debug record with error details

### Requirement: Provider RouteKey registered
The system SHALL register KLING_VIDEO_EDIT_PRO in ProviderRouteKeys.

#### Scenario: RouteKey exists
- **WHEN** system calls kling video edit
- **THEN** RouteKey "KLING_VIDEO_EDIT_PRO" is defined in provider-route-keys.js

#### Scenario: Call mode configured
- **WHEN** RouteKey is used
- **THEN** CallMode is set to "async-polling" for kling async API pattern