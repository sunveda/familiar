# Convert / consent gate (source of truth)

This is an **engineering** map of the fail-closed convert check. It is not legal advice and does not invent product policy. See [consent.md](./consent.md) for principles and the pre-capture legal checklist.

## Canonical vs mirrored

| Check | Role |
| --- | --- |
| TypeScript `convertJobMayRun` in [`packages/shared/src/types.ts`](../packages/shared/src/types.ts) | **Canonical** domain rule. Shared types and TS tests lock the intended gate. |
| Python `queue_convert_job` in [`apps/convert/src/familiar_convert/pipeline.py`](../apps/convert/src/familiar_convert/pipeline.py) | **Mirror** used by the convert stub at queue time. Must refuse the same cases. |

Do not treat a green Python test as permission to weaken the TS helper, or the reverse. When the gate changes, update **both** implementations, the shared case table, and this doc in the same PR.

Python `queue_convert_job` is convert-only (it has no `job.kind`). The TS helper also returns `false` when `job.kind !== 'convert'`. That extra TS branch has no Python counterpart; document new TS-only branches here if they appear.

## Shared case table

Cross-language cases live in [`packages/shared/fixtures/convert-gate-cases.json`](../packages/shared/fixtures/convert-gate-cases.json).

- TS: `packages/shared/src/convert-gate.test.ts`
- Python: `apps/convert/tests/test_pipeline.py` (explicit fail-closed tests **plus** the fixture)

Adding a refuse/allow case without both test runners is how the implementations drift.

## What the gate checks (v0)

A convert job may run only if **all** of these hold:

1. Job kind is `convert` (TS; Python function is convert-only)
2. `job.targetEnrollmentId` matches the enrollment id
3. Job, enrollment, and consent share the same `familyId`
4. Enrollment is bound to that `ConsentRecord` (`enrollment.consentRecordId === consent.id`)
5. Consent is unrevoked (`revokedAt === null`)
6. Enrollment status is `active` (not `pending`, `revoked`, or `deleted`)
7. Consent scopes include `inference_on_family_content`

Otherwise fail closed. Missing data is a refusal, not a skip.

## In-family profile selection (product lock)

A family may enroll any number of consented voice+face profiles. Convert output follows the enrollment the user **explicitly chooses** for that job (`targetEnrollmentId`). It is **not** automatic “any family member ↔ any other face.”

- `requestedByGuardianId` **may differ** from `enrollment.guardianId` when both are in the same family (`job.familyId === enrollment.familyId`) and the chosen enrollment is `active` with unrevoked consent that includes `inference_on_family_content`.
- Cross-family targeting is refused.
- Missing `targetEnrollmentId` or a revoked/deleted/inactive enrollment is refused.
- Do **not** add `requestedByGuardianId === enrollment.guardianId`; that would contradict this lock.

Kids are not enrollment targets in v1 (`KidProfile` is never `targetEnrollmentId`). Auth/tenancy (`AuthContext`) is a **separate** stub — production auth is blocked — and must not weaken this gate. Family isolation stays `assertSameFamily` fail-closed ([auth-tenancy.md](./auth-tenancy.md)).

Ingest staging does **not** queue convert. After an ingest job is `staged`, convert still requires an explicit `targetEnrollmentId` and this gate (`queueConvertFromIngest` in TypeScript; Python ingest calls `queue_convert_job`). The convert app’s own queue (`queueConvertJob` / `queue_convert_job_in_store`) uses the same rule. Status stubs after queue (`queued` → `running` → `needs_review`) do not run inference.

## Abuse / rate-limit hooks

Convert may take a **disabled / no-op** abuse hook after the consent gate. Real detection is not implemented. A hook must not allow a job the consent gate refused. Fail-closed consent always wins.

## Intended `AuditEvent` emit points (stub only)

There is no audit store yet. [`AuditEvent`](../packages/shared/src/types.ts) is metadata-only. When a store exists, emit at least:

| Event kind | When |
| --- | --- |
| `consent_granted` / `consent_revoked` | Consent create or withdraw |
| `enrollment_revoked` / `enrollment_deleted` | Enrollment revoke or artifact delete |
| `convert_refused` / `convert_queued` | Convert gate refuse or queue |
| `review_approved` / `review_rejected` | Guardian review decision |

Enrollment status machine: [`packages/shared/src/enrollment.ts`](../packages/shared/src/enrollment.ts) (`pending` → `active` → `revoked` or `deleted`). Guardian sequence: [guardian-flow.md](./guardian-flow.md).
