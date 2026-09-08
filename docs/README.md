# Docs

Product intent lives in the root [README](../README.md). This folder holds design stubs that expand on that brief. They are **not** a substitute for legal review.

| Doc | What it covers |
| --- | --- |
| [architecture.md](./architecture.md) | Services, data boundaries, job flow |
| [guardian-flow.md](./guardian-flow.md) | Guardian UX stubs: onboard → consent → enroll → ingest → convert → review → kids |
| [consent.md](./consent.md) | Enrollment consent, inference rules, revoke/delete, pre-capture legal checklist |
| [consent-gate.md](./consent-gate.md) | Canonical vs mirrored convert gate; explicit in-family profile selection |
| [threat-model.md](./threat-model.md) | Assets, threats, and fail-closed expectations |

When implementation starts, keep these docs aligned with `packages/shared` types (`Family`, `Guardian`, `Enrollment`, `ConsentRecord`, `Job`, `KidProfile`, `AuditEvent`).
