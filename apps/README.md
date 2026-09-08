# Apps

Placeholder services for the Familiar pipeline. None of these implement ML, face/voice conversion, or biometric collection.

| App | Role |
| --- | --- |
| [ingest](./ingest/) | Stage opaque external `sourceRef` (no download; media outside git) |
| [convert](./convert/) | Intended voice convert + face swap — **queue stub, fail closed, no ML** |
| [review-api](./review-api/) | Guardian preview and approve/reject |

Shared types: [`packages/shared`](../packages/shared/). Policy: [`docs/consent.md`](../docs/consent.md). Tenancy stub: [`docs/auth-tenancy.md`](../docs/auth-tenancy.md).
