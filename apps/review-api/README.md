# review-api (stub)

Guardian preview, approve/reject, and enrollment revoke. Kids do not use this API to skip review.

**No media streaming or biometric I/O in this stub.** Handlers return JSON descriptors only.

## Intended routes

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/health` | Liveness |
| `GET` | `/jobs/:id` | Job status (needs_review until approved) |
| `POST` | `/jobs/:id/approve` | Guardian approval (placeholder) |
| `POST` | `/enrollments/:id/revoke` | Revoke enrollment + fail closed for convert |

Auth, persistence, and preview bytes are not implemented.

## Run (after `npm install` at repo root)

```bash
npm run start -w @familiar/review-api
```
