# Familiar documentation

Product intent and safety rails live in the root [README](../README.md). Living status: [CONTEXT.md](./CONTEXT.md). These docs describe what the code **does today** (stub level, no ML, no real biometrics, no production auth) and mark everything else **planned**. Not legal advice.

## Start here

| Doc | What it covers |
| --- | --- |
| [architecture.md](./architecture.md) | Components, trust boundaries, component and data-flow diagrams, deployment view |
| [state-machines.md](./state-machines.md) | Enrollment, ingest job, convert job state diagrams, guards, exact `convertJobMayRun` checks |
| [data-model.md](./data-model.md) | Entities, invariants, ER diagram, what is never stored |
| [api-contracts.md](./api-contracts.md) | review-api, ingest, convert routes as implemented; stub auth headers; status codes; OpenAPI as future |
| [clients.md](./clients.md) | **Planned** web, iOS, Android clients: shared contract, capture/upload, review and consent UX, store policy flags, stack |
| [security-and-threat-model.md](./security-and-threat-model.md) | STRIDE, misuse, consent abuse, kids privacy, provenance, keys, incident runbook |
| [development.md](./development.md) | Setup, commands, CI jobs, branching/PR rules, adding a slice, spike procedure |
| [testing.md](./testing.md) | Suites, fail-closed tests, fixtures |
| [roadmap.md](./roadmap.md) | Done, in flight, blocked, next, owner decisions |
| [adr/](./adr/README.md) | Architecture decision records 0001 to 0009 |

## Policy and design notes (earlier)

| Doc | What it covers |
| --- | --- |
| [consent.md](./consent.md) | Consent principles, inference rules, revoke/delete, pre-capture legal checklist |
| [consent-gate.md](./consent-gate.md) | Canonical vs mirrored convert gate; explicit profile selection |
| [guardian-flow.md](./guardian-flow.md) | Guardian UX sequence stub |
| [auth-tenancy.md](./auth-tenancy.md) | Family boundary; stub headers vs future IdP. **Production auth is blocked.** |
| [audit.md](./audit.md) | In-memory AuditLog: metadata only, not durable |
| [threat-model.md](./threat-model.md) | Original threat stub (superseded by security-and-threat-model.md) |

## Status vocabulary

**Built (stub)**: on `main`, metadata-only. **Proposed, in PR #23/#24**: open drafts (convert backend interface; encrypted enrollment artifact store), not merged and not depended on. **Planned**: design only. **[placeholder]**: owner to fill, no invented text. **[U]/unverified**: not confirmed.

Keep docs aligned with `packages/shared` types and the gate fixtures; docs changes that touch behavior belong in the same PR as the code.
