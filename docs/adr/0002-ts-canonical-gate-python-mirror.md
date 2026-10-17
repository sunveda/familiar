# ADR 0002: TypeScript canonical consent gate, Python mirror, shared fixtures

- **Status:** Accepted (in effect)
- **Date:** not recorded
- **Deciders:** Familiar, CoE

## Context
The convert gate is the core safety control. It must be identical wherever convert is queued or run.

## Decision
`convertJobMayRun` in `packages/shared/src/types.ts` is canonical. `queue_convert_job` in `apps/convert/.../pipeline.py` is the mirror. Cross-language cases live in `packages/shared/fixtures/convert-gate-cases.json` and both test suites run them. Changing the gate means changing both implementations, the fixture and [consent-gate.md](../consent-gate.md) in one PR. Same pattern for `sourceRef` and auth-tenancy fixtures. See [state-machines.md](../state-machines.md#convertjobmayrun-exact-checks) for the exact checks and known mirror differences (Python lacks the `kind` check).

## Consequences
- Drift is caught by CI rather than review memory.
- Any real GPU worker must call the gate again before each stage (proposed in PR #23).
- Removing/skipping these tests is a regression (`CONTRIBUTING.md`).

## Alternatives considered
Generate Python from TS (tooling cost, less readable); single gate service over RPC (adds a network dependency to a fail-closed check; may be revisited).
