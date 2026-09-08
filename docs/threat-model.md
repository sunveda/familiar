# Threat model (stub)

Draft for the scaffold stage. Revisit before any real enrollment capture or inference.

## Assets

| Asset | Why it matters |
| --- | --- |
| Voice/face samples and embeddings | Biometric personal data of parents |
| Consent records | Proof of affirmative enrollment; audit trail |
| Source and rendered videos | Family media; rendered output can be misused if leaked |
| Family / guardian identifiers | Tenancy and access control |
| Signing keys, `.env`, cloud credentials | Access to stores and APIs |

## Trust boundaries

- **Git / CI:** source code only. No media, models, embeddings, or secrets ([`.gitignore`](../.gitignore), [SECURITY.md](../SECURITY.md)).
- **Enrollment store:** encrypted, access-controlled, opaque refs in app DBs.
- **Convert workers:** may load enrollment artifacts at runtime for **that family only**; must not log raw biometrics.
- **Review API / ingest HTTP:** guardian-authenticated at the stub layer (claimed `guardianId` + `familyId`); kids do not approve export. Future IdP must bind family membership to a verified principal ([auth-tenancy.md](./auth-tenancy.md)).

## Threats and expected controls

| Threat | Expected control (v1 intent) |
| --- | --- |
| Swap using a non-enrolled identity | Convert refuses without active family-scoped `Enrollment` |
| Capture without consent | Enrollment blocked without unrevoked `ConsentRecord` |
| Cross-family leakage | All queries keyed by `familyId`; no shared face/voice gallery |
| Celebrity / stranger deepfake | Product non-goal; no identity search APIs |
| Secrets or embeddings in git | Ignore rules + CI hygiene; never force-add |
| Revoked parent still used | Fail closed on `revoked` / `deleted` enrollment |
| Kid sees output before parent | Jobs stay `needs_review` until guardian approval |
| Abuse / mass conversion | Rate limits and abuse detection — **hooks only** in stubs (disabled/no-op). Consent fail-closed still wins. |
| Training on children’s faces | Forbidden for public models (README safety rails) |

## Fail closed

If consent, enrollment status, or family binding cannot be verified, **do not convert**. Stubs should error rather than skip checks “until the model is wired.”

## Out of scope for this stub

Cryptographic design of the enrollment store, KMS, watermarking, and detailed abuse-detection signals. Track those when services leave placeholder status.
