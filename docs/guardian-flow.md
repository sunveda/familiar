# Guardian UX flow (stub)

Engineering sketch of the caregiver path. **Not legal advice.** Japan/APPI and other capture gates stay checklist-only in [consent.md](./consent.md).

Kids never enroll. `KidProfile` is not an enrollment target and must not be used as `Job.targetEnrollmentId`.

## Sequence

```
1. Onboard     Guardian creates a Family space (and optional KidProfiles)
2. Consent     Affirmative UI → ConsentRecord (enrollment + inference scopes)
3. Enroll      Enrollment starts pending → active (opaque artifactRef only)
4. Ingest      Source video job: register opaque `sourceRef` (outside git); stub stages `queued` → `staged` (no download)
5. Convert     Queue stub: explicit per-job `targetEnrollmentId` (chosen enrolled parent) + `convertJobMayRun`. Status stubs `queued` → `running` → `needs_review` (no ML)
6. Review      Job is needs_review; guardian previewReady; no kid access
7. Kids see    Only after guardian approve (status approved)
```

Skipping a step is a bug. Ingest only stages an external ref; it does not pick a convert profile. Convert queue is stubbed (no inference): it still requires an explicit `targetEnrollmentId` and a passing gate — multi-profile families are allowed; automatic any↔any pairing is not. ML remains out of scope.

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
- Approve / reject transition `needs_review` → `approved` / `rejected` and append `review_*` events to the in-memory `AuditLog` (not durable; see [audit.md](./audit.md))
- Revoke/delete enrollment then **reuse** canonical `convertJobMayRun` (must be false)
- **No media.** Preview/media routes return 501 and never stream bytes

Auth is a **stub** (`mode: 'stub'`): `x-family-id` / `x-guardian-id` are claimed ids, not cryptographic proof. **Production auth is blocked / not ready** (no IdP, OIDC, or JWT verification). Family-scoped routes require both headers and refuse cross-family mismatch (`assertSameFamily`). See [auth-tenancy.md](./auth-tenancy.md).

## Convert lock (unchanged)

TypeScript `convertJobMayRun` is canonical; Python `queue_convert_job` is the mirror. [`apps/convert`](../apps/convert/) exposes a family-scoped JSON queue (list/get/queue/cancel + status stubs). Queue still fails closed on revoked, deleted, non-enrolled, missing selection, KidProfile targets, or wrong family. See [consent-gate.md](./consent-gate.md).
