# Security and threat model

Supersedes the stub scope of [threat-model.md](./threat-model.md) (kept for history and inbound links). Engineering analysis, **not legal advice**. Legal text is deliberately left as placeholders. Everything marked *planned* is not built; today the repo contains fail-closed stubs only.

## 1. Assets and boundaries

Assets: parent voice/face samples and embeddings (biometric personal data), consent records, source and rendered media, family/guardian identifiers, kid profiles, keys and credentials, audit trail. Boundaries are in [architecture.md](./architecture.md#2-trust-boundaries).

## 2. STRIDE table

| Category | Threat | Control today (stub) | Control planned |
| --- | --- | --- | --- |
| **S**poofing | Caller claims another guardian/family | **None effective**: stub headers prove nothing ([ADR 0004](./adr/0004-stub-auth-tenancy.md)) | IdP-verified principal; membership lookup; short-lived tokens; step-up for revoke/delete/approve |
| Spoofing | Enrolling someone else's face/voice | `ConsentRecord` binding checked at activation | Liveness / same-person check, voice challenge at enrollment ([clients.md](./clients.md#4-consent-ux-per-platform)); guardian identity verification (counsel/product) |
| **T**ampering | Edit job to target another enrollment | Gate re-checks family, binding, status, scope | Signed job envelope; worker re-verifies gate from authoritative DB, not from the job payload |
| Tampering | Tamper with stored artifact | n/a (no store) | AES-256-GCM with authenticated header (proposed PR #24); integrity checks |
| **R**epudiation | Guardian denies approve/revoke | In-memory metadata-only `AuditEvent`s (not durable) | Durable append-only audit store; actor from verified principal; hash-chained log |
| **I**nformation disclosure | Cross-family reads | `assertSameFamily` on routes; every record has `familyId` | DB row-level scoping, per-family encryption context, tests that fail closed forever |
| Information disclosure | Biometrics/media in git, logs, audit | `.gitignore`, `git-hygiene` CI, audit forbidden-key validator | Log scrubbing, secret scanning, DLP on worker egress |
| Information disclosure | Preview/media leaked | Media route is `501` always | Guardian-auth short-lived signed URLs, no-store headers ([clients.md](./clients.md#3-review-ui-on-all-three-platforms)) |
| **D**enial of service | Mass conversion / cost abuse | Disabled abuse hook (no-op) | Rate limits, quotas, per-family budgets, queue admission control |
| **E**levation of privilege | Kid approves or enrolls | Kids are not callers or enrollment targets in types; `kid_profile_not_target` | Separate kid surface with no guardian API scope; guardian PIN/biometric to leave kid mode |
| Elevation | Weaken gate to "get a demo working" | CI fail-closed tests, [AGENTS.md](../AGENTS.md) rules, CoE review | Same, forever |

## 3. Misuse and impersonation

The technology equals a deepfake tool. Product posture:

- **No identity search; no stranger/celebrity path.** Inference only against an `active`, family-scoped, consent-bound enrollment explicitly chosen per job.
- Cross-family enrollment reuse is impossible by construction (family check).
- Guardian review precedes any kid exposure ([ADR 0008](./adr/0008-guardian-review-before-release.md)); output is never auto-published.
- Planned: liveness/same-person at enrollment; per-family rate limits and anomaly detection; refuse sources with non-family faces if detectable (open question); output provenance (§6).
- Residual risk: a consented guardian could convert content for a non-kid audience. Out of scope for v1 beyond provenance marks and ToS.

## 4. Consent abuse

| Abuse | Mitigation |
| --- | --- |
| Pre-checked / bundled / implied consent | `affirmationMethod` is only `'explicit_ui'`; account creation or upload is never consent (docs + types); client consent screens are explicit ([clients.md](./clients.md#4-consent-ux-per-platform)) |
| Stale consent after policy change | `policyVersion` recorded; re-consent flow planned |
| Consent granted by wrong person | Planned: guardian identity verification + liveness; one guardian cannot grant on behalf of another (enrollment binds `enrollment.guardianId === consent.guardianId` at activation) |
| Using revoked consent | Gate fails on `revokedAt !== null`; revocation cascade to enrollments and in-flight jobs is **planned** (not implemented) |
| Scope creep | Gate needs `inference_on_family_content`; activation needs modality scopes |

## 5. Kids privacy

- Kids are guardian-managed `KidProfile` metadata only: no enrollment, no capture, no accounts without guardian.
- No training on kids' faces or voices for public models; no kid media in any spike ([development.md](./development.md#spike-procedure-own-media-only)).
- Kid-facing surface shows only `approved` outputs (planned). No analytics/ads SDKs in kid mode (planned; store-policy driven, see [clients.md](./clients.md#6-platform-limits-and-store-policy-flags)).
- Applicable kids-data rules (APPI and others): **[placeholder, counsel]** no legal text is asserted here.

## 6. Legal/privacy placeholders (no invented legal text)

| Topic | Status |
| --- | --- |
| Japan APPI treatment of biometric identifiers / special-care data, consent wording, retention, cross-border transfer | **[placeholder, counsel]** |
| Guardian identity verification and children's data handling | **[placeholder, product + counsel]** |
| DPIA / privacy review sign-off | **[placeholder, privacy]** |
| Enrollment-store design approval | **[placeholder, security]** |
| App Store / Google Play privacy labels and synthetic-media declarations | **[placeholder, counsel + product]** |

Real capture stays gated on the checklist in [consent.md](./consent.md#legalprivacy-review-before-real-capture).

## 7. Provenance and watermark plan (planned)

Goal: any Familiar output is identifiable as AI-altered. Proposed: C2PA Content Credentials manifest on rendered video with an "AI-altered/synthetic" assertion and a Familiar-signed manifest (signing key in KMS, never in git); invisible audio/video watermark (candidate tooling unverified, e.g. AudioSeal); visible "made with Familiar" marker in kid-facing playback; internal hash log of outputs (job id, hash, time; no media). Spec/tool details and licenses **unverified**; decide in a future ADR. C2PA metadata can be stripped by re-encoding, so watermarks and the internal log are complements, not duplicates.

## 8. Key management (planned)

- Per-family data keys wrapped by a KMS master key; envelope encryption for enrollment artifacts (PR #24 proposes AES-256-GCM with env/`ArtifactKeyProvider`-supplied key for a local implementation only; not production key management).
- Revoke/delete = delete artifact bytes **and** destroy/disable the wrapped key (crypto-shred) where feasible.
- Separate keys for artifacts, provenance signing, and session/IdP secrets. Rotation procedure and break-glass access: to be designed.
- Nothing key-like in git; `.env.example` is the only env file allowed ([`git-hygiene`](./development.md#ci-jobs)).
- Worker volumes: encrypted, ephemeral, wiped at job end.

## 9. Incident and revocation runbook (outline, planned)

1. **Guardian revoke/delete request:** call revoke then delete (`POST /enrollments/:id/revoke`, `/delete`). Verify `convertJobMayRun` is false; cancel queued/running jobs targeting the enrollment; delete artifact bytes and key; record audit event; confirm no worker holds a cache.
2. **Suspected consent abuse / impersonation:** suspend family (`FamilyStatus: suspended`, enforcement planned), revoke affected enrollments, preserve metadata-only audit evidence, notify guardians per counsel guidance **[placeholder]**.
3. **Biometric/secret committed to git** (per [SECURITY.md](../SECURITY.md)): rotate secrets, purge history, delete local copies, record the incident.
4. **Leaked output:** identify via provenance mark/hash log, revoke signed URLs, notify per counsel **[placeholder]**.
5. **Post-incident:** add a fail-closed regression test before closing.

Roles, SLAs, and notification duties: **[placeholder]**.

## 10. Fail closed

If consent, enrollment status, family binding, or auth cannot be verified, **do not convert, serve, or delete-skip**. Tests for these are required forever ([testing.md](./testing.md#fail-closed-tests-required-forever)).
