# Contributing to Familiar

This repository is **private**. Familiar re-renders learning videos so a **registered, consented parent** appears and speaks. Read the [product brief](./README.md) before changing anything.

## Hard rules

These are not style preferences. Violating them is a security/privacy incident.

1. **Consent required.** Enrollment and inference must not run without an affirmative, stored [`ConsentRecord`](./packages/shared/src/types.ts) for that guardian and family. There is no silent opt-in, implied consent, or “demo mode” that skips this.
2. **Inference only on enrolled identities.** Convert jobs bind to an active enrollment in the same family. Do not invent, scrape, or swap unregistered faces or voices (celebrities, strangers, other families).
3. **No biometrics or secrets in git.** Never commit voice/face samples, embeddings, model weights, `.env` files, keys, or enrollment dumps. See `.gitignore` and [SECURITY.md](./SECURITY.md).
4. **Revoke and delete enrollment.** Guardians must be able to revoke consent and delete enrollment artifacts. Downstream jobs that target a revoked/deleted enrollment must fail closed.

## What this repo is (and is not)

This is a **scaffold**. Do not land real ML models, face/voice pipelines, or collection of real biometric data in this tree until product, legal, and security have an approved design. Stubs should fail closed (missing consent / missing enrollment → error).

## Layout

| Path | Role |
| --- | --- |
| [README.md](./README.md) | Product brief — source of truth |
| [docs/](./docs/README.md) | Architecture, consent, guardian flow, threat model |
| [apps/ingest](./apps/ingest/) | Source video ingest stub |
| [apps/convert](./apps/convert/) | Convert pipeline stub (no models) |
| [apps/review-api](./apps/review-api/) | Guardian review/preview API stub |
| [packages/shared](./packages/shared/) | Shared domain types |

## Local setup

```bash
npm install
npm run typecheck
npm run lint
```

Python service stubs are syntax-checked in CI (`python -m compileall`). They do not install ML libraries.

```bash
npm test
python3 apps/convert/tests/test_pipeline.py
python3 -m unittest discover -s apps/ingest/tests
```

## CI: fail-closed convert tests

CI runs TypeScript `convertJobMayRun` tests (`packages/shared`) and Python `queue_convert_job` tests (`apps/convert/tests/test_pipeline.py`) on every PR. Enrollment transition tests, ingest `sourceRef`/handoff tests, and review-api guardian stubs run via `npm test` / ingest unittest.

**Removing or skipping these tests when ML lands is a regression.** Inference must still refuse missing, revoked, cross-family, or unscoped consent/enrollment. Wire models behind the existing gate; do not delete the gate to “get a demo working.”

## Pull requests

- Keep README as the product source of truth; update it if behavior or safety rails change, and link related docs.
- Prefer types and fail-closed stubs over speculative pipeline code.
- Describe how the change preserves consent, family-scoped inference, and revoke/delete.
