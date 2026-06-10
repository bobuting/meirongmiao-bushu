## ADDED Requirements

### Requirement: Transition duration uses frame count

The system SHALL use frame count as the duration unit for video transitions, replacing the previous microsecond-based duration.

#### Scenario: Frame-based duration configuration
- **WHEN** user configures a transition with `durationInFrames: 90` at 30fps
- **THEN** the transition duration is 3 seconds (90 frames / 30fps)

#### Scenario: Frame rate adaptive duration
- **WHEN** same `durationInFrames: 90` is applied at 60fps
- **THEN** the transition duration is 1.5 seconds (90 frames / 60fps)

### Requirement: Frame-to-microsecond conversion

The system SHALL provide a conversion function to translate frame count to microseconds for internal processing.

#### Scenario: Conversion at standard frame rate
- **WHEN** converting `90 frames` at `30fps` to microseconds
- **THEN** the result is `3000000 microseconds` (90 * 1000000 / 30)

#### Scenario: Conversion at high frame rate
- **WHEN** converting `90 frames` at `60fps` to microseconds
- **THEN** the result is `1500000 microseconds` (90 * 1000000 / 60)

### Requirement: Backward compatibility during transition

The system SHALL accept both microsecond and frame-based duration during migration period, with frame-based taking precedence.

#### Scenario: Legacy microsecond input
- **WHEN** legacy code provides `duration: 3000000` (microseconds) without `durationInFrames`
- **THEN** system converts to frames using detected frame rate and processes normally

#### Scenario: Mixed input with precedence
- **WHEN** both `duration: 3000000` and `durationInFrames: 60` are provided
- **THEN** system uses `durationInFrames` value and ignores legacy `duration`