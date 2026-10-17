# ADR 0001: Monorepo with TypeScript and Python

- **Status:** Accepted (in effect; layout exists on `main`)
- **Date:** not recorded
- **Deciders:** Familiar, CoE

## Context
Domain rules and the guardian API suit TypeScript (shared types with future web client). Media/ML tooling (voice, face, ffmpeg) is overwhelmingly Python. One private repo keeps consent-critical logic reviewable together.

## Decision
npm workspaces (`packages/*`, `apps/review-api`) for TypeScript; `apps/ingest` and `apps/convert` are Python packages (`pyproject.toml`, stdlib-only stubs today). `docs/` and fixtures are shared. CI runs both toolchains ([development.md](../development.md#ci-jobs)).

## Consequences
- Two languages means duplicated logic; mitigated by [ADR 0002](./0002-ts-canonical-gate-python-mirror.md).
- Python apps are not npm workspaces; ingest imports convert via a `sys.path` insert (a stub-era shortcut to revisit when services separate).
- Models, media and biometrics stay out of the tree regardless of language.

## Alternatives considered
All-TypeScript (poor ML ecosystem fit); all-Python (loses shared types with clients); polyrepo (consent gate drift risk).
