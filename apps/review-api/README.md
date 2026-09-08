# review-api (stub)

Guardian preview, approve/reject, and enrollment revoke. Kids do not use this API to skip review.

**No media streaming or biometric I/O in this stub.** Handlers return JSON descriptors only. Auth is the shared **stub** (`mode: 'stub'`), not an IdP — [docs/auth-tenancy.md](../../docs/auth-tenancy.md).

Guardian sequence: [docs/guardian-flow.md](../../docs/guardian-flow.md). Convert gate: canonical `convertJobMayRun`.

## Intended routes

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/health` | Liveness |
| `GET` | `/families/:familyId/jobs` | List jobs for that family (`previewReady` if `needs_review`) |
| `GET` | `/jobs/:id` | Job status + `previewReady`; stub tenancy (`x-family-id` must match) |
| `GET` | `/jobs/:id/preview` | **501** — never streams preview bytes |
| `GET` | `/jobs/:id/media` | **501** — never streams media |
| `POST` | `/jobs/:id/approve` | `needs_review` → `approved`; intended `review_approved` audit |
| `POST` | `/jobs/:id/reject` | `needs_review` → `rejected`; intended `review_rejected` audit |
| `POST` | `/enrollments/:id/revoke` | Shared state machine + fail closed for convert |
| `POST` | `/enrollments/:id/delete` | Status `deleted`; `artifactRef` nulled; convert fail closed |

Stub headers (not production auth): **both** `x-family-id` and `x-guardian-id` on family-scoped routes. Parsed by `@familiar/shared` `resolveAuthContextFromHeaders`. Cross-family → 403; missing ids → 401. Health is public. Preview/media stay 501.

In-memory store only. Intended `AuditEvent` objects are returned/recorded for emit-point tests; there is no audit store.

## Run (after `npm install` at repo root)

```bash
npm run start -w @familiar/review-api
npm test -w @familiar/review-api
```
