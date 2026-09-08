# Architecture (stub)

Familiar is a **family-scoped** pipeline: ingest source video, convert using an enrolled parent identity, then require guardian review before kids see the result.

This document describes intended service boundaries. **No production ML or biometric capture is implemented in this repository.**

## Services

```
                    ┌─────────────┐
                    │  Guardian   │
                    │  (review UI)│
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ review-api  │  preview, approve/reject, revoke
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
  ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
  │   ingest    │   │   convert   │   │  enrollment │
  │  (videos)   │──►│ (voice+face)│   │ store (out  │
  └─────────────┘   └─────────────┘   │ of this repo)│
                                      └─────────────┘
```

| App | Intended role | This repo |
| --- | --- | --- |
| [`apps/ingest`](../apps/ingest/) | Accept upload / URL / library `sourceRef`; stage **outside git** (no download) | Stub |
| [`apps/convert`](../apps/convert/) | Diarize → voice convert → face swap → mux | Stub only; no models |
| [`apps/review-api`](../apps/review-api/) | Guardian preview, approve/reject, enrollment revoke | HTTP stub |

Shared domain types: [`packages/shared`](../packages/shared/).

## Data boundaries

- **Family** is the tenancy unit. Jobs, enrollments, and consent records always carry `familyId`.
- **Enrollment artifacts** (samples, embeddings) live in an encrypted store referenced by opaque keys. They are not files in this git tree.
- **Convert** may run only with an `active` enrollment whose `consentRecordId` is not revoked. Canonical check: `convertJobMayRun` ([consent-gate.md](./consent-gate.md)).
- **Kids never skip review.** Convert output is `needs_review` until a guardian approves.
- **KidProfile** is guardian-managed metadata in the family. Kids are **not** enrollment targets in v1.
- **AuditEvent** is a metadata-only stub (no store). Intended emit points: consent grant/revoke, enrollment revoke/delete, convert refuse/queue, review approve/reject.
- **Abuse / rate-limit hooks** on convert are disabled no-ops. They must not override fail-closed consent.

### In-family convert targeting (locked)

A family may enroll many consented profiles. Convert uses the enrollment the user **explicitly selects** (`Job.targetEnrollmentId`). Guardian A may request convert targeting guardian B’s enrollment in the same family; the requester id need not equal the enrollment subject. This is not automatic any-to-any pairing. Cross-family or revoked/missing selection fail closed. See [consent-gate.md](./consent-gate.md).

## Job flow (draft)

1. Guardian onboarding creates a `Family` and `Guardian`.
2. Affirmative consent persists a `ConsentRecord`.
3. Enrollment capture (out of band) creates an `Enrollment` bound to that consent.
4. Ingest creates a `Job` of kind `ingest`, registers an opaque external `sourceRef`, and stubs staging (`queued` → `staged` / `failed`) **outside git**.
5. Convert creates a `Job` of kind `convert` only after the caller picks an explicit `targetEnrollmentId` (chosen enrolled profile). Staging does not auto-convert.
6. Review API exposes preview; guardian approval is required before export to kids.

See [guardian-flow.md](./guardian-flow.md) for the caregiver sequence, [consent.md](./consent.md) for policy, and [threat-model.md](./threat-model.md) for abuse cases.

## Non-goals in this tree

- Shipping model weights, inference servers, or training code
- Collecting or storing real biometric data
- Public identity search or cross-family reuse of enrollments
