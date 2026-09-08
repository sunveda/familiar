# Shared types

TypeScript types for **Family**, **Guardian**, **Enrollment**, **ConsentRecord**, **Job**, **KidProfile**, and **AuditEvent**, plus fail-closed helpers (`convertJobMayRun`, enrollment transitions, stub `AuthContext` / tenancy).

`KidProfile` is guardian-managed and family-scoped; kids are **not** enrollment targets in v1. `AuditEvent` is metadata only (no audit store).

Enrollment status: `pending` → `active` → `revoked` | `deleted`. Activate requires an unrevoked `ConsentRecord` with enrollment scopes. Delete nulls `artifactRef`. See [docs/guardian-flow.md](../../docs/guardian-flow.md).

Ingest `sourceRef` values are opaque external pointers (`isExternalSourceRef`). Convert handoff (`queueConvertFromIngest`) still requires explicit `targetEnrollmentId` and `convertJobMayRun`.

Stub tenancy (`resolveAuthContext`, `assertSameFamily`) is documented in [docs/auth-tenancy.md](../../docs/auth-tenancy.md). **Production auth is blocked / not ready.** This is not an IdP, OIDC, or JWT verifier. No secrets in this package.

These objects are metadata only. Do not add fields for raw audio, face images, or embedding vectors.

```ts
import { convertJobMayRun } from '@familiar/shared';
```

Canonical convert gate: [docs/consent-gate.md](../../docs/consent-gate.md). Shared cases: `fixtures/convert-gate-cases.json`.
