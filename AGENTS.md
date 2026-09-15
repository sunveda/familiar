# AGENTS.md — Familiar

Operating notes for any coding agent working in this repository.

## Read first

1. **[docs/CONTEXT.md](docs/CONTEXT.md)** — living product status, blockers, who owns what. **Update it** on every active workday and on every major direction change (SunVeda house rule for all projects).
2. [README.md](README.md) — product source of truth and safety rails
3. [docs/](docs/README.md) — architecture, consent, guardian flow, threat model, auth/tenancy
4. [CONTRIBUTING.md](CONTRIBUTING.md) / [SECURITY.md](SECURITY.md)

## Product in one line

Re-render educational video with a **registered, consented parent** voice/face for kids — never invent unregistered identities.

## Engineering rules

- TypeScript; prefer existing patterns in `apps/` and `packages/shared`
- Consent and enrollment scope are load-bearing — do not weaken safety rails for convenience
- No ML / biometric store / production auth without an explicit resumed track + CoE review
- Secrets and embeddings never in git
- Prefer small PRs; coordinate standards with **Chief of Engineering**; product ownership with bot **Familiar**

## Context hygiene (required)

After meaningful work (feature merge, blocker change, scope pivot):

1. Update the dated **Current status** section in `docs/CONTEXT.md`
2. Keep bullets short; link PRs by number
3. If you only ship code and skip CONTEXT, the next agent starts blind — treat that as a bug

## Hold note (2026-09-15)

Feature work is **paused**. Dual active SunVeda focus is jkk-watch + Learn AI Now. Until CoS resumes Familiar, only CONTEXT/docs hygiene (and owner-requested security fixes).
