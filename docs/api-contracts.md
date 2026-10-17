# API contracts (as implemented)

Derived from code in [`apps/review-api/src/index.ts`](../apps/review-api/src/index.ts), [`apps/ingest/.../http.py`](../apps/ingest/src/familiar_ingest/http.py) and [`apps/convert/.../http.py`](../apps/convert/src/familiar_convert/http.py). These are **stub, in-memory** HTTP surfaces: no persistence, no ML, no media. All example ids and values are synthetic.

> Planned (not built): OpenAPI-first contract and generated clients, real auth, versioned paths, enrollment-create / consent / capture / upload / release endpoints. See [§6](#6-future-openapi-and-planned-endpoints) and [clients.md](./clients.md).

## 1. Common conventions

| Item | Behavior |
| --- | --- |
| Transport | JSON over HTTP. Review-api is Node `http` (default port from `REVIEW_API_PORT`, else 3000, started only when `index.ts` is the entry script; the npm `start` script is a placeholder). Ingest and convert are Python `BaseHTTPRequestHandler` factories (`create_handler(store)`); there is **no `__main__` server entry point** in the tree, handlers are exercised by tests. |
| Auth (stub) | Headers `x-guardian-id` and `x-family-id`, both required, whitespace-only = missing. **Proves nothing**: anyone who sets headers can claim any pair. Mode is always `stub`. Production auth is blocked. |
| Auth order | Missing guardian reported first (`401 {"error":"missing_guardian"}`), then missing family (`401 {"error":"missing_family"}`). |
| Family isolation | `assertSameFamily` / `assert_same_family`: a path `familyId` must equal the header family, else `403 {"error":"wrong_family","familyId":"<path id>"}`. Job/enrollment routes compare the record's family to the header family. |
| Trailing slash | Tolerated. Unknown route (after auth) → `404 {"error":"not_found"}`. |
| Errors | `{ "error": "<code>", ...context }`. |

### Status codes

| Code | Meaning in these services |
| --- | --- |
| `200` | OK. `201` on create (ingest job, convert job). |
| `400` | Validation/gate refusal: `invalid_source_ref`, `missing_target_enrollment`, `convert_refused` (Python); review-api default for other flow errors (`consent_revoked`, `consent_not_bound`, `missing_enrollment_scopes`, `missing_required_field`). |
| `401` | `missing_guardian`, `missing_family`. |
| `403` | `wrong_family`. |
| `404` | `not_found` (record missing, or wrong `kind` for the service, or unknown route). |
| `409` | `illegal_job_status`, `illegal_transition`, `already_deleted` (review-api); `illegal_job_status`, `kid_profile_not_target` (Python). |
| `501` | Review-api media/preview routes, always. |

## 2. review-api (TypeScript)

| Method | Path | Auth | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | `/health` | none | `200 {"ok":true,"service":"review-api","ml":false,"media":"not_served"}` | none |
| GET | `/jobs/:id/media`, `/jobs/:id/preview` | **none (checked before auth)** | n/a | **always `501`** `{"error":"not_implemented","detail":"…","media":"not_served","jobId":"…"}` |
| GET | `/families/:familyId/jobs` | stub | `200 {"familyId","jobs":[GuardianJobView]}` (all job kinds in that family) | 401, 403 |
| GET | `/jobs/:id` | stub | `200 GuardianJobView` | 401, 403, 404 |
| POST | `/jobs/:id/approve` | stub | `200 {"job","intendedAudit","note"}` | 401, 403, 404, 409 |
| POST | `/jobs/:id/reject` | stub | `200 {"job","intendedAudit"}` | 401, 403, 404, 409 |
| POST | `/enrollments/:id/revoke` | stub | `200 {"enrollmentId","status","revokedAt","intendedAudit","convertJobs":"fail_closed","convertJobMayRun"}` | 401, 403, 404, 409 |
| POST | `/enrollments/:id/delete` | stub | `200 {"enrollmentId","status","deletedAt","artifactRef","intendedAudit","convertJobs","convertJobMayRun"}` | 401, 403, 404, 409 |

`GuardianJobView` = `Job` plus `previewReady` (`true` only when `status === 'needs_review'`) and `media: "not_served"`.

Error bodies: job routes `{"error":"…","jobId":"…"}`; enrollment routes `{"error":"…","enrollmentId":"…","convertJobs":"fail_closed"}`.

Caveats, stated plainly:

- The `501` media route precedes auth, so it reveals nothing but also is not itself guarded. When real media is served, it must be behind guardian auth ([ADR 0008](./adr/0008-guardian-review-before-release.md)).
- Approve/reject require only a same-family caller; there is no check that the caller is a guardian record (no directory exists) and no kid/guardian distinction beyond claimed headers.
- `consent` grant/revoke logic exists as functions (`grantConsentInStore`, `revokeConsentInStore`) but has **no HTTP route**. Enrollment create/activate also has none.
- `convertJobMayRun` in revoke/delete responses is computed via a probe job; after revoke/delete it is `false`.

Example, approve:

```http
POST /jobs/convert_1/approve HTTP/1.1
x-guardian-id: grd_demo_1
x-family-id: fam_demo_1
```

```json
{
  "job": { "id": "convert_1", "familyId": "fam_demo_1", "requestedByGuardianId": "grd_demo_1",
           "kind": "convert", "status": "approved", "targetEnrollmentId": "enr_demo_2",
           "sourceRef": "library:demo/lesson-1", "createdAt": "2026-01-01T00:00:00.000Z",
           "updatedAt": "2026-01-01T00:05:00.000Z", "errorCode": null,
           "previewReady": false, "media": "not_served" },
  "intendedAudit": { "id": "audit_intended_review_approved_convert_1", "familyId": "fam_demo_1",
                     "actorGuardianId": "grd_demo_1", "kind": "review_approved",
                     "at": "2026-01-01T00:05:00.000Z", "subjectRef": "convert_1",
                     "metadata": { "previousStatus": "needs_review", "newStatus": "approved" } },
  "note": "Kids must not see output until status is approved."
}
```

Example, wrong family: `GET /families/fam_other/jobs` with `x-family-id: fam_demo_1` → `403 {"error":"wrong_family","familyId":"fam_other"}`.

## 3. ingest (Python)

| Method | Path | Success | Errors |
| --- | --- | --- | --- |
| GET | `/health` | `200 {"ok":true,"service":"ingest","ml":false,"media":"not_stored"}` (no auth) | |
| GET | `/families/:familyId/jobs` | `200 {"familyId","jobs":[Job],"media":"not_stored"}` (ingest-kind only) | 401, 403 |
| GET | `/jobs/:id` | `200 Job` (the bare job object, not wrapped) | 401, 403, 404 |
| POST | `/families/:familyId/jobs` body `{"sourceRef": "..."}` | `201 {"job","media":"not_stored"}` | 400 `invalid_source_ref`, 401, 403 |
| POST | `/jobs/:id/stage` | `200 {"job","media":"not_stored"}` | 403, 404, 409 `illegal_job_status`, 400 `invalid_source_ref` |
| POST | `/jobs/:id/fail` body `{"errorCode"?}` (default `staging_failed`) | `200 {"job","media":"not_stored"}` | 403, 404, 409 |
| POST | `/jobs/:id/convert` body `{"targetEnrollmentId": "..."}` | `200 {"job","intendedAudit"}` (new convert job, `queued`) | 400 `missing_target_enrollment` / `convert_refused` (body may include `intendedAudit`), 409 `illegal_job_status` / `kid_profile_not_target`, 403, 404 |

Nuances: POST routes authenticate before routing, so an unauthenticated `POST` to an unknown path is `401`, not `404`. Malformed JSON bodies are not handled by `_read_json` (raises); treat as undefined behavior, fix before any real use. Convert refusal when the enrollment or consent record is missing returns `convert_refused` (400), not `not_found`.

```http
POST /families/fam_demo_1/jobs HTTP/1.1
x-guardian-id: grd_demo_1
x-family-id: fam_demo_1
content-type: application/json

{ "sourceRef": "library:demo/lesson-1" }
```

```json
{ "job": { "id": "ingest_1", "familyId": "fam_demo_1", "requestedByGuardianId": "grd_demo_1",
           "kind": "ingest", "status": "queued", "targetEnrollmentId": null,
           "sourceRef": "library:demo/lesson-1", "createdAt": "2026-01-01T00:00:00.000Z",
           "updatedAt": "2026-01-01T00:00:00.000Z", "errorCode": null },
  "media": "not_stored" }
```

Refused example: `{"sourceRef":"file:///tmp/a.mp4"}` → `400 {"error":"invalid_source_ref","familyId":"fam_demo_1"}`. Valid schemes: `http`, `https`, `s3`, `gs`, `library`, `external`; refused: empty, contains `..` or `\`, starts with `/` or `./`, no scheme, other schemes. Fixture: [`source-ref-cases.json`](../packages/shared/fixtures/source-ref-cases.json).

## 4. convert (Python)

| Method | Path | Success | Errors |
| --- | --- | --- | --- |
| GET | `/health` | `200 {"ok":true,"service":"convert","ml":false,"inference":"not_run","media":"not_processed"}` (no auth) | |
| GET | `/families/:familyId/jobs` | `200 {"familyId","jobs":[Job],"ml":false,"inference":"not_run"}` | 401, 403 |
| GET | `/jobs/:id` | `200 {"job","ml":false,"inference":"not_run"}` | 401, 403, 404 |
| POST | `/families/:familyId/jobs` body `{"targetEnrollmentId", "sourceRef"?}` | `201 {"job","intendedAudit","ml":false,"inference":"not_run"}` | 400 `missing_target_enrollment` / `convert_refused` (+`intendedAudit`), 409 `kid_profile_not_target`, 401, 403 |
| POST | `/jobs/:id/run` | `200 {"job",…}` `queued → running` | 403, 404, 409 |
| POST | `/jobs/:id/complete` | `200 {"job",…}` `running → needs_review` | 403, 404, 409 |
| POST | `/jobs/:id/fail` body `{"errorCode"?}` | `200 {"job",…}` `running → failed` | 403, 404, 409 |
| POST | `/jobs/:id/cancel` | `200 {"job",…}` `queued\|running → cancelled` | 403, 404, 409 |

Note: ingest `GET /jobs/:id` returns the bare job but convert wraps it as `{"job": …}`; clients must handle both until a unified contract exists.

```http
POST /families/fam_demo_1/jobs HTTP/1.1
x-guardian-id: grd_demo_1
x-family-id: fam_demo_1
content-type: application/json

{ "targetEnrollmentId": "enr_demo_2", "sourceRef": "library:demo/lesson-1" }
```

Refused with a revoked enrollment → `400 {"error":"convert_refused","familyId":"fam_demo_1","intendedAudit":{"kind":"convert_refused","subjectRef":"convert_1","metadata":{"reason":"convertJobMayRun","targetEnrollmentId":"enr_demo_2"}, …}}`. Metadata `reason` is `enrollment_missing`, `consent_missing` or `convertJobMayRun` depending on which lookup failed.

## 5. Shared TypeScript surface (not HTTP)

Exported from `packages/shared`: `convertJobMayRun`, `activateEnrollment`, `revokeEnrollment`, `deleteEnrollment`, `grantConsent`, `revokeConsent`, `queueConvertJob`, `startConvertJob`, `completeConvertJob`, `failConvertJob`, `cancelConvertJob`, `queueConvertFromIngest`, `isExternalSourceRef`, `resolveAuthContext[FromHeaders]`, `assertSameFamily`, `httpStatusForAuthError`, `createAuditLog`, `validateAuditEvent`. Proposed in PR #23/#24 (not on `main`): convert backend interface and runner; encrypted artifact store.

## 6. Future: OpenAPI and planned endpoints

All **planned**:

- OpenAPI 3.1 as the single contract, generating TypeScript, Swift and Kotlin clients ([ADR 0009](./adr/0009-client-stack.md), [clients.md](./clients.md#2-shared-api-contract)); versioned under `/v1`; conformance tests against the Python and TS servers.
- Unify response envelopes (ingest bare job vs convert wrapped), structured error schema, pagination, idempotency keys on POST.
- Replace stub headers with IdP-verified bearer tokens; derive `guardianId`/`familyId` from the token, never from client-supplied headers.
- New endpoints: family/guardian/kid-profile management, consent grant/revoke, enrollment create/activate with capture upload sessions, presigned upload initiation and completion, job output preview/stream (guardian-auth only), release.
- Rate limiting, malformed-body handling (`400`), and moving the unauthenticated `501` media route behind auth.
