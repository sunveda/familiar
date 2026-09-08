# Consent (stub)

This is an engineering sketch of consent and enrollment rules. It is **not** legal advice. Product copy and retention periods need legal/privacy review before any real capture.

## Principles

1. **Affirmative only.** Enrollment and inference require an explicit guardian action in UI, persisted as a `ConsentRecord`. No pre-checked boxes, bundled “by using the app,” or implied consent from account creation alone.
2. **Family-scoped.** Consent and enrollments do not transfer across families.
3. **Enrolled identities only.** Convert jobs target an `Enrollment` that is `active` for a guardian in that family. Unregistered faces and voices are out of scope (see README non-goals).
4. **Revoke and delete.** A guardian can revoke consent and delete enrollment artifacts. After revoke or delete, inference that would use that identity must fail closed.

## Required sequence

```
Guardian account
    → Family space
    → Affirmative consent UI (policy version shown)
    → ConsentRecord stored
    → Voice/face enrollment capture
    → Enrollment record (metadata + opaque artifact ref)
    → Convert jobs may bind to that Enrollment
    → Guardian review before kids see output
```

Skipping a step is a bug, not a shortcut. Stub UX sequence: [guardian-flow.md](./guardian-flow.md).

## `ConsentRecord` (see `packages/shared`)

Minimum fields:

- Who: `guardianId`, `familyId`
- What: `scopes` (e.g. `voice_enrollment`, `face_enrollment`, `inference_on_family_content`)
- Which text: `policyVersion` of the consent the guardian saw
- How: `affirmationMethod: 'explicit_ui'`
- When: `grantedAt`; `revokedAt` when withdrawn

Do not treat a successful login, a video upload, or a “try demo” click as consent.

## Inference rule

A convert job is allowed only if **all** of the following hold:

- `job.familyId` equals `enrollment.familyId`
- `enrollment.status === 'active'`
- Linked `ConsentRecord` exists, is not revoked, and includes the needed scopes
- Target identity is an **explicitly selected** enrolled guardian (`targetEnrollmentId`) — not a child, celebrity, or stranger, and not an automatic pick from the family

Otherwise the job fails with a consent/enrollment error. Stubs in `apps/convert` encode this check with no ML attached.

The **canonical** implementation is TypeScript `convertJobMayRun`. Python `queue_convert_job` is the convert-stub **mirror**. See [consent-gate.md](./consent-gate.md) and `packages/shared/fixtures/convert-gate-cases.json` so the two cannot drift in silence.

### In-family convert targeting (locked)

A family can enroll any number of consented voice+face profiles. Guardian A may queue convert targeting guardian B’s enrollment in the **same family** when B’s enrollment is the job’s explicit `targetEnrollmentId`, is `active`, and has valid unrevoked consent (including `inference_on_family_content`).

`requestedByGuardianId` may differ from `enrollment.guardianId`. Convert does **not** auto-pair family members. Cross-family, revoked, or missing selection fail closed.

## Revoke / delete

| Action | Effect |
| --- | --- |
| Revoke consent | `ConsentRecord.revokedAt` set; related enrollments become `revoked`; in-flight convert jobs cancel or fail |
| Delete enrollment | Status `deleted`; artifact bytes deleted from the enrollment store; refs must not remain usable |

Deletion of enrollment artifacts is a product requirement, not a best-effort cleanup. Git must never have been a store for those bytes ([SECURITY.md](../SECURITY.md)).

## Kids

- No unsupervised kid accounts (README non-goal).
- Do not train public models on kids’ faces.
- Kids are not enrollment targets for v1 parent voice+face swap.
- `KidProfile` is guardian-managed and family-scoped. It is **never** an `Enrollment` and must not be used as `Job.targetEnrollmentId`.

## Legal/privacy review before real capture

This section is a **checklist for counsel and product**. It is not legal advice, not policy text, and not a substitute for review. Placeholders below are for those owners to fill; engineering must not invent wording.

Do **not** start real biometric capture or storage until this gate is completed.

- [ ] **Japan-first / APPI biometric care** — required product/legal gate before real capture. Counsel/product: complete APPI (and related) care items here; do not treat this checkbox as advice.
- [ ] *[placeholder — counsel]* Lawful basis / consent-form text for target jurisdictions
- [ ] *[placeholder — counsel]* Retention, deletion, and cross-border transfer notes
- [ ] *[placeholder — product + counsel]* Guardian identity verification and kid-data handling
- [ ] *[placeholder — privacy]* DPIA / privacy-review sign-off before capture
- [ ] *[placeholder — security]* Enrollment-store design approved (opaque refs only in this repo)

Until the boxes that counsel/product own are filled and signed off, convert/ingest remain stubs: no samples, no embeddings, no models.
