# review-api (stub)

Guardian preview, approve/reject, and enrollment revoke. Kids do not use this API to skip review.

**No media streaming or biometric I/O in this stub.** Handlers return JSON descriptors only. Auth is not implemented.

Guardian sequence: [docs/guardian-flow.md](../../docs/guardian-flow.md). Convert gate: canonical `convertJobMayRun`.

## Intended routes

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/health` | Liveness |
| `GET` | `/families/:familyId/jobs` | List jobs for that family (`previewReady` if `needs_review`) |
| `GET` | `/jobs/:id` | Job status + `previewReady`; optional `x-family-id` tenancy check |
| `GET` | `/jobs/:id/preview` | **501** — never streams preview bytes |
| `GET` | `/jobs/:id/media` | **501** — never streams media |
| `POST` | `/jobs/:id/approve` | `needs_review` → `approved`; intended `review_approved` audit |
| `POST` | `/jobs/:id/reject` | `needs_review` → `rejected`; intended `review_rejected` audit |
| `POST` | `/enrollments/:id/revoke` | Shared state machine + fail closed for convert |
| `POST` | `/enrollments/:id/delete` | Status `deleted`; `artifactRef` nulled; convert fail closed |

Stub headers (not production auth): `x-family-id`, `x-guardian-id`.

In-memory store only. Intended `AuditEvent` objects are returned/recorded for emit-point tests; there is no audit store.

## Run (after `npm install` at repo root)

```bash
npm run start -w @familiar/review-api
npm test -w @familiar/review-api
```
