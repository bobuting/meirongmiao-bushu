## ADDED Requirements

### Requirement: Video can be split by time points
The system SHALL split a source video into multiple segments based on provided time points.

#### Scenario: Split video into 3 segments
- **WHEN** user provides a 30-second video and 3 split points [5s-15s, 15s-25s, 25s-30s]
- **THEN** system outputs 3 video segments with correct durations [10s, 10s, 5s]

#### Scenario: Split video with single segment
- **WHEN** user provides a video with no split points (single segment)
- **THEN** system returns the original video unchanged

#### Scenario: Handle invalid time points
- **WHEN** user provides time points that exceed video duration
- **THEN** system throws error "Split points exceed video duration"

### Requirement: Split segments preserve video quality
The system SHALL use ffmpeg stream copy mode to preserve original video quality without re-encoding.

#### Scenario: Quality preservation
- **WHEN** video is split into segments
- **THEN** each segment has same resolution, bitrate, and codec as source video

#### Scenario: Fast splitting performance
- **WHEN** video splitting is executed
- **THEN** process completes within 2 seconds per minute of video

### Requirement: Split output stored in object storage
The system SHALL upload split segments to object storage and return URLs.

#### Scenario: Upload to storage
- **WHEN** video is split successfully
- **THEN** each segment is uploaded to S3/OSS and returns a public URL

#### Scenario: Storage path structure
- **WHEN** segments are uploaded
- **THEN** path follows pattern: `outfit-change/{projectId}/segments/segment_{index}.mp4`