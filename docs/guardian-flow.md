# Guardian UX flow (stub)

Engineering sketch of the caregiver path. **Not legal advice.** Japan/APPI and other capture gates stay checklist-only in [consent.md](./consent.md).

Kids never enroll. `KidProfile` is not an enrollment target and must not be used as `Job.targetEnrollmentId`.

## Sequence

```
1. Onboard     Guardian creates a Family space (and optional KidProfiles)
2. Consent     Affirmative UI → ConsentRecord (enrollment + inference scopes)
3. Enroll      Enrollment starts pending → active (opaque artifactRef only)
4. Ingest      Source video job: register opaque `sourceRef` (outside git); stub stages `queued` → `staged` (no download)
5. Convert     After staging, explicit per-job `targetEnrollmentId` (chosen enrolled parent) — not automatic
6. Review      Job is needs_review; guardian previewReady; no kid access
7. Kids see    Only after guardian approve (status approved)
```

Skipping a step is a bug. Ingest only stages an external ref; it does not pick a convert profile. Convert still requires an explicit `targetEnrollmentId` after staging — multi-profile families are allowed; automatic any↔any pairing is not.

```
onboard → consent → enroll → ingest (stage ref) → convert (pick profile) → review → kids
```

## Enrollment status

Canonical transitions live in [`packages/shared/src/enrollment.ts`](../packages/shared/src/enrollment.ts).

| From | To | When |
| --- | --- | --- |
| `pending` | `active` | Unrevoked, same-family `ConsentRecord` with enrollment scopes |
| `pending` | `revoked` or `deleted` | Withdraw or abandon before activation |
| `active` | `revoked` or `deleted` | Guardian revoke / delete |
| `revoked` | `deleted` | Invalidate leftover artifact refs |

**Illegal:** any → `pending` (create-only); `deleted` → anything (terminal); `revoked` → `active` (no reactivation — create a new enrollment); `active` → `pending`. Activate without consent, with the wrong family, or on a deleted record **fails closed**.

Delete **nulls** `artifactRef`. This repo never stores sample bytes.

## Review (guardian only)

[`apps/review-api`](../apps/review-api/) is a JSON stub:

- List jobs for a family
- `previewReady` is true only when status is `needs_review` (guardian flag — not kid-visible)
- Approve / reject transition `needs_review` → `approved` / `rejected` and record **intended** `AuditEvent` emit points (no audit store)
- Revoke/delete enrollment then **reuse** canonical `convertJobMayRun` (must be false)
- **No media.** Preview/media routes return 501 and never stream bytes

Auth is a **stub** (`mode: 'stub'`): `x-family-id` / `x-guardian-id` are claimed ids, not cryptographic proof. Family-scoped routes require both headers and refuse cross-family mismatch. See [auth-tenancy.md](./auth-tenancy.md). Real IdP is a later slice.

## Convert lock (unchanged)

TypeScript `convertJobMayRun` is canonical; Python `queue_convert_job` is the mirror. See [consent-gate.md](./consent-gate.md). Fail closed on revoked, deleted, non-enrolled, missing selection, or wrong family.
