# Docs

Product intent lives in the root [README](../README.md). This folder holds design stubs that expand on that brief. They are **not** a substitute for legal review.

| Doc | What it covers |
| --- | --- |
| [architecture.md](./architecture.md) | Services, data boundaries, job flow |
| [consent.md](./consent.md) | Enrollment consent, inference rules, revoke/delete |
| [threat-model.md](./threat-model.md) | Assets, threats, and fail-closed expectations |

When implementation starts, keep these docs aligned with `packages/shared` types (`Family`, `Guardian`, `Enrollment`, `ConsentRecord`, `Job`).
