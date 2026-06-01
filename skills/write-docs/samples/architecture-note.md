# Architecture Note: Feature Name

## Context

Describe the constraint or product need that forced the design. Reference the
files or modules that contain the implementation.

## Responsibilities

- Frontend: state, user interaction, cache behavior, and network fallback.
- Backend: validation, persistence, filesystem or service access.
- Shared contract: data shapes used across the boundary.

## Data Flow

1. User action starts in the UI.
2. Client provider updates local state or browser storage.
3. Optional backend call syncs durable state.
4. UI refreshes from the provider result.

## Persistence

Document exact storage locations and write timing. Include browser storage,
files, databases, or remote services only when implemented.

## Tradeoffs

- Decision: what the implementation chose.
- Benefit: what this simplifies.
- Cost: what future maintainers should watch.

## Verification

List the commands or manual checks used to prove the behavior.
