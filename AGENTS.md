# AGENTS.md — familiar

Operating notes for any coding agent working in this repository.

## Read first

1. **[docs/CONTEXT.md](docs/CONTEXT.md)** — living product status, blockers, who owns what. **Update it** on every active workday and on every major direction change (SunVeda house rule for all projects).
2. [README.md](README.md) — product brief and safety rails
3. [docs/](docs/) — architecture, consent, guardian flow, auth-tenancy, threat model
4. [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md)

## Product in one line

Parent voice+face swap for kids' learning videos — registered/consented guardians only; scaffold and stubs, no ML yet.

## Engineering rules

- TypeScript / workspace patterns already in `packages/` and `apps/`; prefer small PRs
- Convert and enrollment must remain fail-closed (`convertJobMayRun`, consent gates)
- Never commit media, models, embeddings, or secrets; use env / secret stores only
- Do not fake production auth (no pretend JWT/OIDC verification)
- Coordinate standards with **Chief of Engineering**; product ownership with bot **Familiar**
- As of 2026-09-15: eng is paused — CONTEXT/docs only unless owner reopens

## Context hygiene (required)

After meaningful work (feature merge, blocker change, deploy URL change, scope pivot):

1. Update the dated **Current status** section in `docs/CONTEXT.md`
2. Keep bullets short; link PRs by number
3. If you only ship code and skip CONTEXT, the next agent starts blind — treat that as a bug
