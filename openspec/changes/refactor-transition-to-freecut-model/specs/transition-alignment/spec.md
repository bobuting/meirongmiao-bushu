## ADDED Requirements

### Requirement: Transition alignment control

The system SHALL support alignment parameter (0-1 range) to control transition position relative to the cut point between clips.

#### Scenario: Right-aligned transition (alignment=0)
- **WHEN** alignment is set to `0`
- **THEN** transition starts exactly when the right clip begins

#### Scenario: Centered transition (alignment=0.5)
- **WHEN** alignment is set to `0.5` with duration 60 frames
- **THEN** transition starts 30 frames before the cut point (half centered)

#### Scenario: Left-aligned transition (alignment=1)
- **WHEN** alignment is set to `1`
- **THEN** transition ends exactly when the left clip ends

#### Scenario: Custom alignment position
- **WHEN** alignment is set to `0.3` with duration 90 frames
- **THEN** transition starts 27 frames after the cut point (0.3 * 90 = 27 frames offset)

### Requirement: Alignment time calculation

The system SHALL calculate transition start time based on alignment and duration.

#### Scenario: Start time calculation formula
- **WHEN** left clip ends at frame 300, alignment is `0.5`, duration is `60 frames`
- **THEN** transition starts at frame 270 (300 - 60 * 0.5 = 270)

### Requirement: Default alignment behavior

The system SHALL default to `0.5` alignment (centered on cut) when no alignment is specified.

#### Scenario: Missing alignment configuration
- **WHEN** transition config does not include alignment field
- **THEN** system uses `0.5` alignment as default (centered on cut point)