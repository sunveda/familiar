# Audit log (in-memory stub)

Familiar records **metadata-only** `AuditEvent`s so consent, enrollment, convert, and review actions are traceable. This slice is an **in-memory, process-lifetime** append-only list. It is **not durable**. A production store (Postgres, cloud sink, etc.) is TBD.

This is not a biometric store and not an enrollment artifact store.

## What is stored

[`AuditEvent`](../packages/shared/src/types.ts) fields only:

- `id`, `familyId`, `actorGuardianId`, `kind`, `at`
- `subjectRef` — opaque consent / enrollment / job id (never a path to samples)
- `metadata` — primitive flags and ids (`previousStatus`, `targetEnrollmentId`, …)

Canonical implementation: [`createAuditLog`](../packages/shared/src/audit.ts) (`append`, `listByFamily`, `listByJob`). Thin Python adapters live in `apps/convert` and `apps/ingest` for those process stubs.

## What must never be logged

`append` **rejects** payloads whose keys look like biometric or secret content, including:

`embedding`, `sample`, `audio`, `faceBytes`, `privateKey`, plus related aliases (`embeddings`, `secret`, `password`, `token`, media/model extensions).

Nested objects in `metadata` are also refused. Do not log voice/face samples, embeddings, media bytes, or secrets.

## Family isolation

`listByFamily(familyId)` returns only events with that `familyId`. It never returns another family’s events. Callers must not use a process-wide dump as a tenancy API.

## Emit points (this slice)

| Kind | Where it appends |
| --- | --- |
| `consent_granted` / `consent_revoked` | Shared `grantConsent` / `revokeConsent`; review-api store wrappers |
| `enrollment_revoked` / `enrollment_deleted` | review-api revoke/delete (shared enrollment machine unchanged) |
| `convert_queued` / `convert_refused` | Shared convert queue + ingest handoff; Python convert/ingest stores |
| `review_approved` / `review_rejected` | review-api approve/reject |

Convert still fail-closes via `convertJobMayRun` / `queue_convert_job` **before** any audit append. A missing audit write does not allow a refused job.

## Production store (out of scope)

When a durable sink exists, keep the same event shape and forbidden-key checks. Do not weaken consent, convert, or enrollment gates to “get audit working.”
