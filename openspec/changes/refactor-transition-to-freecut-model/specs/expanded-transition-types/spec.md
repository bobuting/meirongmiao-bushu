## ADDED Requirements

### Requirement: Expanded transition type catalog

The system SHALL provide 40+ transition effect types, organized into series: dissolve, wipe, slide, flip, iris, shape, and more.

#### Scenario: Dissolve series availability
- **WHEN** user requests dissolve transitions
- **THEN** system provides `dissolve`, `cross-fade`, `fade-through-black`, `fade-through-white`

#### Scenario: Wipe series availability
- **WHEN** user requests wipe transitions
- **THEN** system provides `wipe-left`, `wipe-right`, `wipe-up`, `wipe-down`, `wipe-diagonal`

#### Scenario: Slide series availability
- **WHEN** user requests slide transitions
- **THEN** system provides `slide-left`, `slide-right`, `slide-up`, `slide-down`, `slide-push`

#### Scenario: Iris series availability
- **WHEN** user requests iris transitions
- **THEN** system provides `iris-circle`, `iris-square`, `iris-star`, `iris-heart`

#### Scenario: Shape series availability
- **WHEN** user requests shape transitions
- **THEN** system provides `shape-circle`, `shape-square`, `shape-star`, `shape-heart`, `shape-diamond`

### Requirement: Transition type metadata

The system SHALL provide metadata for each transition type including default duration, min/max duration, and direction support.

#### Scenario: Transition definition lookup
- **WHEN** system looks up `wipe-left` transition definition
- **THEN** returns `{ defaultDuration: 30, minDuration: 10, maxDuration: 120, hasDirection: false }`

#### Scenario: Directioned transition definition
- **WHEN** system looks up `slide` transition definition
- **THEN** returns `{ defaultDuration: 30, minDuration: 10, maxDuration: 120, hasDirection: true, directions: ['left', 'right', 'up', 'down'] }`

### Requirement: Smooth transition filtering

The system SHALL filter out overly intense transitions (glitch, pixelate, chromatic) from random selection for natural video merging.

#### Scenario: Random smooth transition
- **WHEN** random transition type is requested
- **THEN** system selects from filtered list excluding glitch, pixelate, chromatic effects

### Requirement: GPU shader implementation requirement

The system SHALL implement each transition type as a WebGPU shader for high-performance rendering.

#### Scenario: Shader registration
- **WHEN** new transition type `iris-circle` is added
- **THEN** corresponding shader is registered in TransitionPipeline with proper fragment shader code