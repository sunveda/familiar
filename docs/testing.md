# Testing guide

## Suites on `main`

| Suite | Location | Runner | Covers |
| --- | --- | --- | --- |
| Shared TS | `packages/shared/src/*.test.ts` | `npm test` (tsc → `node --test dist-test/*.test.js`) | `convertJobMayRun` + fixture, enrollment transitions, consent grant/revoke, convert queue, ingest handoff, `sourceRef`, stub auth context, audit log |
| review-api | `apps/review-api/src/flow.test.ts`, `http.test.ts` | `npm test` | approve/reject, revoke/delete, family isolation, media `501` |
| Convert | `apps/convert/tests/` (`test_pipeline`, `test_jobs`, `test_http`, `test_auth`, `test_audit`) | `python3 -m unittest discover -s apps/convert/tests -v` | Python gate mirror + fixture, queue/status, HTTP, auth mirror, audit |
| Ingest | `apps/ingest/tests/` (`test_main`, `test_http`, `test_auth`) | `python3 -m unittest discover -s apps/ingest/tests -v` | `sourceRef`, staging, handoff, HTTP, auth mirror |

Counts are not listed because they change per PR; PR #23 and #24 (merged) added convert-runner and artifact-store suites.

## Fail-closed tests required forever

Removing, skipping or weakening these is a regression, even when ML lands ([CONTRIBUTING.md](../CONTRIBUTING.md)). Inference must still refuse:

- missing, revoked, cross-family or unscoped consent
- enrollment not `active` (pending, revoked, deleted) or not bound to the consent
- missing `targetEnrollmentId`, or a `KidProfile` id as target
- cross-family job/enrollment access (`wrong_family` → 403)
- missing auth ids (401)
- illegal enrollment/job transitions; `deleted` terminal
- invalid or local-path `sourceRef`
- audit events with biometric/secret-like keys
- media never served without guardian auth (stub: `501`)

A disabled abuse hook must never turn a refusal into an allow.

## Fixtures

| File | Shared by | Purpose |
| --- | --- | --- |
| [`convert-gate-cases.json`](../packages/shared/fixtures/convert-gate-cases.json) | TS `convert-gate.test.ts`, Python `test_pipeline.py` | Allow/refuse table for the gate. Cases have `appliesTo` (`typescript`, `python`) since TS has the extra `kind` check |
| [`source-ref-cases.json`](../packages/shared/fixtures/source-ref-cases.json) | TS + Python | `sourceRef` validation |
| [`auth-tenancy-cases.json`](../packages/shared/fixtures/auth-tenancy-cases.json) | TS + Python | Header resolution and family assertion |

All fixture data is synthetic (`fam_1`, `grd_1`, `enr_1`, `cns_1`). Never put real ids, media or biometrics in fixtures or tests; use synthetic random bytes if bytes are needed (as PR #24 does).

## How to add tests for a slice

1. Add a refusal case for every new guard before the success case.
2. If behavior exists in both languages, add a fixture case and make both runners consume it; adding a case to only one side is how drift starts ([ADR 0002](./adr/0002-ts-canonical-gate-python-mirror.md)).
3. For HTTP routes, test 401 (missing guardian, missing family), 403 (cross-family), 404, and the 409/400 paths.
4. Assert state machines against the tables in [state-machines.md](./state-machines.md).
5. Run `npm run lint && npm run typecheck && npm test` and both Python unittest commands before opening the PR.

## Not yet tested or present

Contract tests against an OpenAPI spec, end-to-end tests with real stores, load/abuse tests, client UI tests, and any ML quality tests (spike metrics are offline and not CI). All planned.

## Docs checks

Markdown is excluded from prettier. Mermaid blocks in `docs/` should render; a quick local check is `npx -p @mermaid-js/mermaid-cli mmdc -i <file>.md -o /tmp/out.md` (needs a headless browser; optional). Keep relative links valid (see the link check in the docs PR).
