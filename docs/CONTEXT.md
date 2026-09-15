# Agent context (living)

**Purpose:** Single source of truth so any agent (or human) can pick up this repo without chat history.

**Rule (SunVeda, all projects):** Update this file **at least once per active workday** while the project is the focus, and **immediately** on any major direction change (scope, stack, blockers, live URL, merge policy). Prefer a short dated entry at the top of Status over rewriting the whole file.

Do not put secrets here. Env var *names* and where they live are fine. Biometric embeddings, media, model weights, and tokens never belong in git or in this file.

---

## What this product is

Private SunVeda product: help kids learn from faces and voices they trust. Familiar ingests educational videos and re-renders them so a **registered, consented parent** appears and speaks (voice conversion + face/identity swap) instead of the original presenter.

Repo: https://github.com/sunveda/familiar

Safety rails are non-negotiable: enrollment consent, inference only against enrolled family identities, revoke/delete, no celebrity/stranger deepfakes, no public face/voice marketplace.

## Owner / bots

- Product owner: Sarveshwar Singh (SunVeda)
- Specialist bot: **Familiar**
- Standards: **Chief of Engineering**
- Coordination: **Chief of Staff**

## Stack (known)

- Private npm workspaces monorepo (`packages/*`, `apps/review-api`; also ingest/convert stubs under `apps/`)
- TypeScript (Node ≥20); Prettier; Python present for convert-gate / fail-closed tests
- Shared types: Family, Guardian, Enrollment, ConsentRecord, Job, AuditEvent
- **Auth:** stub tenancy only (`docs/auth-tenancy.md`). Production auth is blocked — no IdP / OIDC / JWT verification in tree. Fail-closed family isolation (`assertSameFamily`, `convertJobMayRun`)
- No ML / media download / biometric bytes in repo (scaffold + stubs only)

## Current status (2026-09-15)

### Engineering focus

- **Paused / held.** Active SunVeda eng focus is **jkk-watch** (+ Learn AI Now, no repo). This repo is **CONTEXT-only** until the owner reopens Familiar eng.
- Do **not** ship feature code, ML wiring, or auth theater while paused — documentation and handoff only.

### `main` (as of last product merges)

- Foundation scaffold + CoE next-slice hardening A–J
- Enrollment state machine + review-api guardian flow stubs
- Ingest job staging stubs (no download/transcode)
- Convert job queue API stubs (status machine only)
- Stub auth-tenancy shared by review-api and ingest
- In-memory `AuditEvent` log (metadata only; never biometrics/secrets) — PR #12 merged

### Open PRs

- Dependabot only: #3–#7 (Actions + TypeScript / `@types/node` bumps)
- No open product feature PRs

### Blockers / next when reopened

1. Real auth/IdP path (replace stub tenancy) after threat-model + CoE review
2. Persistence beyond process-lifetime AuditLog / in-memory jobs
3. ML / media pipeline only behind explicit consent + convert gates
4. Japan/APPI pre-capture checklist before any enrollment capture

## Non-goals / constraints

- No deepfakes of unregistered people; no unsupervised kid accounts without a guardian
- Secrets and biometric embeddings never in git
- Do not expand into other SunVeda products while another repo is sole eng focus

## Related docs

- [Architecture](architecture.md), [Consent](consent.md), [Consent gate](consent-gate.md), [Guardian flow](guardian-flow.md)
- [Auth / tenancy](auth-tenancy.md), [Audit](audit.md), [Threat model](threat-model.md)
- Root [AGENTS.md](../AGENTS.md) — agent operating rules
- Root [README.md](../README.md) — product brief and layout
