## ADDED Requirements

### Requirement: Zustand 5 dependency upgrade

The system SHALL upgrade Zustand from version 4.5.2 to 5.0.13 with exact version locking to support React 19.

#### Scenario: Successful dependency installation

- **WHEN** npm install zustand@5.0.13 --prefix apps/web --save-exact is executed
- **THEN** package.json contains "zustand": "5.0.13" with no semver ranges
- **AND** package-lock.json reflects exact version 5.0.13
- **AND** peer dependencies include "react": ">=18.0.0"

#### Scenario: Build compatibility verification

- **WHEN** npm run build --prefix apps/web is executed with Zustand 5.0.13
- **THEN** build completes successfully without peer dependency warnings
- **AND** no TypeScript compilation errors related to Zustand occur

### Requirement: Automatic type inference adoption

The system SHALL remove manual AppState interface definition and utilize Zustand 5's automatic type inference with type assertions.

#### Scenario: Manual interface removal

- **WHEN** AppState interface definition (lines 151-270 in useAppStore.ts) is deleted
- **THEN** TypeScript compilation succeeds without manual interface
- **AND** no 'AppState' type references remain in the file

#### Scenario: Type assertion addition

- **WHEN** type assertions are added to Store fields (e.g., `projectId: null as string | null`)
- **THEN** TypeScript infers correct types automatically
- **AND** tsc --noEmit --prefix apps/web reports zero type errors
- **AND** all Store fields maintain original type safety

#### Scenario: Store functionality preservation

- **WHEN** useAppStore is used after removing AppState interface
- **THEN** all Store methods (setProjectId, updateProjectDataForProject, etc.) function correctly
- **AND** Store selectors return correct typed values
- **AND** global task queue operations work without errors

### Requirement: Type migration completeness

The system SHALL ensure all Store fields receive proper type assertions to maintain type safety after AppState removal.

#### Scenario: Field coverage verification

- **WHEN** manual review of useAppStore.ts is performed after AppState removal
- **THEN** every field has explicit type assertion (as Type)
- **AND** nullable fields use `as Type | null` pattern
- **AND** array fields use `as Type[]` pattern
- **AND** object fields use `as Record<string, Type>` pattern

#### Scenario: TypeScript strict mode validation

- **WHEN** tsc --noEmit --strict --prefix apps/web is executed after type migration
- **THEN** zero type errors are reported
- **AND** no implicit 'any' types exist
- **AND** all Store access patterns are type-safe

### Requirement: Code simplification verification

The system SHALL reduce Store code complexity by removing redundant type definitions while maintaining type safety.

#### Scenario: Code line reduction

- **WHEN** AppState interface removal and type assertion addition are complete
- **THEN** useAppStore.ts contains fewer than 1,200 lines (reduced from 1,201 lines)
- **AND** no duplicate type definitions exist
- **AND** code remains readable and maintainable

#### Scenario: Maintainability improvement

- **WHEN** new fields are added to Store after migration
- **THEN** developers only need to add field with type assertion
- **AND** no manual AppState interface updates are required
- **AND** TypeScript automatically includes new field in inferred type