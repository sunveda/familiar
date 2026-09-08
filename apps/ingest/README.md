# ingest (stub)

Accepts source videos (upload, URL, or library) and creates `ingest` jobs scoped to a family.

**This package does not download, transcode, or store real media.** Callers register an opaque external `sourceRef` (URL or storage placeholder). Staging is metadata-only (`queued` → `staged` / `failed`). Bytes stay outside git.

Convert is **not** automatic after staging. A convert job is queued only when the caller supplies an explicit `targetEnrollmentId` and canonical `convertJobMayRun` (Python mirror: `queue_convert_job`) passes.

## Rules

- Require a guardian and `familyId`. Jobs never leak across families.
- `sourceRef` must be a non-empty external pointer (`library:`, `https:`, `s3:`, `gs:`, `external:`). Repo paths, `file:` URLs, and local filesystem paths are refused.
- Do not treat ingest as consent or enrollment.
- Media files must never be committed. This stub does not write them.
- `KidProfile` is never an enrollment / convert target.

## Layout

```
src/familiar_ingest/source_ref.py  # opaque external ref check
src/familiar_ingest/store.py       # in-memory jobs (no files)
src/familiar_ingest/jobs.py        # create / list / stage / convert handoff
src/familiar_ingest/auth.py        # stub AuthContext mirror of packages/shared
src/familiar_ingest/http.py        # JSON stub; shared tenancy resolver
src/familiar_ingest/main.py        # convenience create_ingest_job
tests/                             # family scope, fail-closed convert, no media I/O
```

## Intended routes

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/health` | Liveness (`media: not_stored`) |
| `GET` | `/families/:familyId/jobs` | List ingest jobs for that family |
| `POST` | `/families/:familyId/jobs` | Queue ingest; body `{ sourceRef }` |
| `GET` | `/jobs/:id` | Job JSON; stub tenancy (`x-family-id` must match) |
| `POST` | `/jobs/:id/stage` | `queued` → `staged` (no download) |
| `POST` | `/jobs/:id/fail` | `queued` → `failed` |
| `POST` | `/jobs/:id/convert` | Handoff; body **must** include `targetEnrollmentId` |

Stub headers (**not production auth** — production auth is blocked): **both** `x-family-id` and `x-guardian-id` on family-scoped routes. Same shared resolver as [review-api](../review-api/). Not IdP/OIDC/JWT. No secrets. Family isolation: `assert_same_family`. See [docs/auth-tenancy.md](../../docs/auth-tenancy.md).

## Tests

```bash
python3 -m unittest discover -s apps/ingest/tests
```
