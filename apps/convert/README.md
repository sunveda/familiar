# convert (stub)

Intended pipeline: diarize / select speaker → voice convert → face swap / reenactment → mux.

**This package does not load models, embeddings, or media.** There is no face or voice pipeline here. Queue and status transitions are metadata-only.

## Fail closed

A convert job may be queued only when:

- The caller supplies an **explicit** `targetEnrollmentId` (not inferred from family membership)
- `familyId` matches the enrollment and consent record
- Enrollment status is `active`
- Linked `ConsentRecord` is unrevoked and includes `inference_on_family_content`
- The id is an Enrollment — `KidProfile` is never a convert target

Otherwise the stub raises `ConvertRefused` / HTTP `convert_refused` (or `missing_target_enrollment` / `kid_profile_not_target`). Canonical check: TypeScript `convertJobMayRun`; Python `queue_convert_job` is the mirror — see [docs/consent-gate.md](../../docs/consent-gate.md).

A disabled abuse/rate-limit hook may run **after** the consent gate. It cannot allow a refused job. Real detection is not implemented.

Product lock: the requester may differ from the enrollment subject in the same family. Convert follows explicit `targetEnrollmentId` (not automatic pairing). Cross-family, revoked, or missing selection still fail closed.

## Queue API (stub)

JSON HTTP, same stub tenancy as ingest / review-api (`x-family-id` + `x-guardian-id`, `mode: stub`). **Production auth is blocked.** Family isolation: `assert_same_family`. See [docs/auth-tenancy.md](../../docs/auth-tenancy.md).

Status stubs only — **no inference**:

`queued` → `running` → `needs_review` | `failed` | `cancelled`

The success path lands in `needs_review` for guardian [review-api](../review-api/). Cancel is allowed for `queued` / `running` only.

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/health` | Liveness (`ml: false`, `inference: not_run`) |
| `GET` | `/families/:familyId/jobs` | List convert jobs for that family |
| `POST` | `/families/:familyId/jobs` | Queue; body **must** include `targetEnrollmentId` |
| `GET` | `/jobs/:id` | Job JSON; stub tenancy must match |
| `POST` | `/jobs/:id/run` | `queued` → `running` (no ML) |
| `POST` | `/jobs/:id/complete` | `running` → `needs_review` |
| `POST` | `/jobs/:id/fail` | `running` → `failed` |
| `POST` | `/jobs/:id/cancel` | `queued` \| `running` → `cancelled` |

`AuditEvent` emit points: `convert_queued` / `convert_refused` append to an in-memory `AuditLog` (process lifetime; `list_by_family` isolation). Not durable. Never log biometrics. See [docs/audit.md](../../docs/audit.md).

## Layout

```
src/familiar_convert/pipeline.py  # convertJobMayRun mirror
src/familiar_convert/auth.py      # stub AuthContext mirror of packages/shared
src/familiar_convert/store.py     # in-memory jobs (no files)
src/familiar_convert/jobs.py      # queue / list / status stubs
src/familiar_convert/http.py      # JSON stub; shared tenancy resolver
tests/                            # fail-closed gate + family-scoped queue
```

## Tests

```bash
python3 -m unittest discover -s apps/convert/tests
```

Fail-closed convert tests (`test_pipeline.py`) are required CI. Skipping them when ML lands is a regression.
