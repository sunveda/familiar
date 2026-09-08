# Shared types

TypeScript types for **Family**, **Guardian**, **Enrollment**, **ConsentRecord**, **Job**, **KidProfile**, and **AuditEvent**, plus fail-closed helpers (`convertJobMayRun`, enrollment transitions, etc.).

`KidProfile` is guardian-managed and family-scoped; kids are **not** enrollment targets in v1. `AuditEvent` is metadata only (no audit store).

Enrollment status: `pending` → `active` → `revoked` | `deleted`. Activate requires an unrevoked `ConsentRecord` with enrollment scopes. Delete nulls `artifactRef`. See [docs/guardian-flow.md](../../docs/guardian-flow.md).

These objects are metadata only. Do not add fields for raw audio, face images, or embedding vectors.

```ts
import { convertJobMayRun } from '@familiar/shared';
```

Canonical convert gate: [docs/consent-gate.md](../../docs/consent-gate.md). Shared cases: `fixtures/convert-gate-cases.json`.
