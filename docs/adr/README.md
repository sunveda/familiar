# Architecture Decision Records

Format: [template.md](./template.md). One decision per file, never rewritten after Accepted (supersede instead).

| ADR | Title | Status |
| --- | --- | --- |
| [0001](./0001-monorepo-ts-python.md) | Monorepo with TypeScript and Python | Accepted (in effect) |
| [0002](./0002-ts-canonical-gate-python-mirror.md) | TS canonical consent gate with Python mirror and shared fixtures | Accepted (in effect) |
| [0003](./0003-explicit-target-enrollment.md) | Explicit per-job `targetEnrollmentId` | Accepted (owner lock) |
| [0004](./0004-stub-auth-tenancy.md) | Stub auth tenancy until an IdP exists | Accepted (temporary) |
| [0005](./0005-opaque-artifactref-encrypted-store.md) | Opaque `artifactRef` + encrypted store outside git | Accepted (store itself planned) |
| [0006](./0006-voice-and-face-together-v1.md) | Voice and face together for v1 | Accepted (owner decision 2026-10-17) |
| [0007](./0007-model-choices.md) | Model choices for the spike and v1 | **Proposed** |
| [0008](./0008-guardian-review-before-release.md) | Guardian review before release | Accepted |
| [0009](./0009-client-stack.md) | Client stack: web, iOS, Android | **Proposed** |

"Accepted (in effect)" records decisions already reflected in code on `main`; dates are not reconstructed.
