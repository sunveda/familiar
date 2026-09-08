# Shared types

TypeScript types for **Family**, **Guardian**, **Enrollment**, **ConsentRecord**, and **Job**, plus fail-closed helpers (`convertJobMayRun`, etc.).

These objects are metadata only. Do not add fields for raw audio, face images, or embedding vectors.

```ts
import { convertJobMayRun } from '@familiar/shared';
```

See [docs/consent.md](../../docs/consent.md).
