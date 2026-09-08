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

Skipping a step is a bug, not a shortcut.

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
- Target identity is the enrolled guardian — not a child, celebrity, or stranger

Otherwise the job fails with a consent/enrollment error. Stubs in `apps/convert` encode this check with no ML attached.

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
