# Enrollment artifact store

Interface `EnrollmentArtifactStore` (`packages/shared/src/artifact-store.ts`): `put` / `get` / `delete` / `revoke`. Callers keep only the opaque `EnrollmentArtifactRef`; bytes never enter git, `Enrollment`, or `AuditEvent`.

- **Local impl**: AES-256-GCM, random 96-bit nonce per write, key from an `ArtifactKeyProvider` (`FAMILIAR_ARTIFACT_KEY`, base64 32 bytes, never in git). Files live only under a configured directory that must be **outside any git worktree** (constructor refuses otherwise). Family/enrollment/content-type header is authenticated as GCM AAD.
- **Fail closed**: missing/bad key, tampering, wrong family, wrong enrollment, or missing artifact all return `{ ok: false, errorCode }`.
- **Delete/revoke**: overwrite with random bytes, fsync, unlink. `revokeAndDeleteEnrollmentArtifact` revokes, removes bytes, then nulls `artifactRef` (`deleted`).
- **Test double**: `createInMemoryArtifactStore` (synthetic data only).
- **Audit** (metadata only): `artifact_stored`, `artifact_access_denied`, plus existing `enrollment_revoked` / `enrollment_deleted`. The two new kinds exist in TS only; the Python audit mirrors in `apps/convert` and `apps/ingest` do not emit them yet.

Not production: key management/rotation, durable storage, and legal review gates are still open.

## Caller obligations and status

- `put` only checks family and enrollment scoping. It does **not** check consent or enrollment status. Callers must pass the consent gate (unrevoked, same-family, bound consent and an `active` or activating enrollment) before calling `put`, so a revoked-consent enrollment can never receive new artifacts.
- Overwrite-then-unlink deletion is best-effort on SSD, copy-on-write and snapshotted storage. Crypto-erase (a per-artifact key that is destroyed) is the real deletion story; it is not built yet.
- This store is a non-production stub. It is not wired to real capture, and real biometrics stay gated on the legal checklist. Key rotation and KMS are open.
- Follow-up: the Python audit mirrors do not yet know `artifact_stored` and `artifact_access_denied`.
