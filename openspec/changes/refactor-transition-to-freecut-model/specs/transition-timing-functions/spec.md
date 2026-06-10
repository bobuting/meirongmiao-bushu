## ADDED Requirements

### Requirement: Transition timing function support

The system SHALL support 5 timing functions for controlling transition progress curves: linear, ease-in, ease-out, ease-in-out, and cubic-bezier.

#### Scenario: Linear timing
- **WHEN** timing is set to `linear`
- **THEN** progress value is passed directly to shader without modification

#### Scenario: Ease-in timing
- **WHEN** timing is set to `ease-in` and raw progress is `0.5`
- **THEN** shader receives `0.25` (progress squared)

#### Scenario: Ease-out timing
- **WHEN** timing is set to `ease-out` and raw progress is `0.5`
- **THEN** shader receives `0.75` (1 - (1-progress) squared)

#### Scenario: Ease-in-out timing
- **WHEN** timing is set to `ease-in-out` and raw progress is `0.25`
- **THEN** shader receives `0.125` (2 * progress squared for progress < 0.5)

#### Scenario: Ease-in-out timing at midpoint
- **WHEN** timing is set to `ease-in-out` and raw progress is `0.75`
- **THEN** shader receives `0.875` (1 - (1-progress) squared / 2 for progress >= 0.5)

### Requirement: Custom cubic-bezier timing

The system SHALL support custom cubic-bezier timing with 4 control point parameters.

#### Scenario: Custom bezier curve
- **WHEN** timing is set to `cubic-bezier` with parameters `[0.42, 0, 0.58, 1]`
- **THEN** progress is calculated using the bezier curve formula

### Requirement: Default timing behavior

The system SHALL default to `linear` timing when no timing is specified.

#### Scenario: Missing timing configuration
- **WHEN** transition config does not include timing field
- **THEN** system uses `linear` timing as default