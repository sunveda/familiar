# Apps

Placeholder services for the Familiar pipeline. None of these implement ML, face/voice conversion, or biometric collection.

| App | Role |
| --- | --- |
| [ingest](./ingest/) | Stage source videos (upload / URL / library) |
| [convert](./convert/) | Intended voice convert + face swap — **stub, fail closed** |
| [review-api](./review-api/) | Guardian preview and approve/reject |

Shared types: [`packages/shared`](../packages/shared/). Policy: [`docs/consent.md`](../docs/consent.md).
