# Agent context (living)

**Purpose:** Single source of truth so any agent (or human) can pick up this repo without chat history.

**Rule (SunVeda, all projects):** Update this file **at least once per active workday** while the project is the focus, and **immediately** on any major direction change (scope, stack, blockers, live URL, merge policy). Prefer a short dated entry at the top of Status over rewriting the whole file.

Do not put secrets here. Env var *names* and where they live are fine. Never put biometric samples, embeddings, or consent artifacts in git.

---

## What this product is

**Familiar** — private SunVeda app that helps kids learn from faces and voices they trust. Ingests videos and re-renders them so a **registered, consented parent** appears and speaks (voice conversion + face/identity swap) instead of the original presenter.

Repo: https://github.com/sunveda/familiar

## Owner / bots

- Product owner: Sarveshwar Singh (SunVeda)
- Specialist bot: **Familiar**
- Standards: **Chief of Engineering**
- Coordination: **Chief of Staff**
- As of **2026-09-15:** feature work **HELD**. Dual SunVeda active focus is **jkk-watch** + **Learn AI Now** LINE/WhatsApp automation. This repo: **CONTEXT hygiene only** until CoS resumes Familiar.

## Stack (locked / scaffold)

- TypeScript monorepo (`apps/` ingest · convert · review-api placeholders; `packages/shared` types)
- Docs-first: consent, guardian flow, threat model, auth/tenancy stubs
- **No ML conversion** in tree yet — convert path is job-queue stubs only
- **Auth:** stub tenancy only (`docs/auth-tenancy.md`). Production IdP / OIDC / JWT **blocked**
- Safety rails required: consent records, enrollment scope, fail-closed family checks — see README + CONTRIBUTING

## Current status (2026-09-15)

### `main` (approx.)

- Foundation scaffold + safety docs
- Stub auth-tenancy (PR #10 era) — mode stub only; `assertSameFamily` fail-closed; production auth blocked
- Convert job queue API stubs (PR #11 era) — explicit `targetEnrollmentId` + `convertJobMayRun`; no ML
- Enrollment / guardian flow stubs and ingest staging stubs previously merged
- AuditEvent persistence agent was **canceled** during JKK pivot — do not relaunch without CoS

### Focus / merge policy

- **No new feature PRs** while Familiar is held
- Allowed: `docs/CONTEXT.md` refresh, trivial docs/AGENTS hygiene, security fixes if owner asks
- Open drafts (if any) stay unmerged unless CoS resumes the track

### Blockers before real conversion

1. Production auth / IdP (not stub)
2. Real enrollment store + consent ledger (not scaffold-only)
3. ML / media pipeline with consent-gated inference only
4. AuditEvent persistence (metadata only — no biometric store in git)
5. CoS resume of Familiar eng track

## Non-goals / constraints

- No deepfakes of celebrities/strangers; no public face/voice marketplace
- No unsupervised kid accounts without a guardian
- No training on kids’ faces for public models
- Secrets and biometric embeddings never in git
- Do not expand into other SunVeda products from this repo while held

## Related docs

- [docs/README.md](README.md)
- [architecture.md](architecture.md)
- [consent.md](consent.md) / [consent-gate.md](consent-gate.md)
- [guardian-flow.md](guardian-flow.md)
- [auth-tenancy.md](auth-tenancy.md)
- [threat-model.md](threat-model.md)
- [audit.md](audit.md)
- Root [AGENTS.md](../AGENTS.md)
