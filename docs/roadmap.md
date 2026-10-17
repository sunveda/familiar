# Roadmap and status

Snapshot of 2026-10-17 (Asia/Tokyo). Living detail is in [CONTEXT.md](./CONTEXT.md), which may lag; this page reflects `main` at `a31d72d` plus the open draft PRs named below.

## Owner decisions

| Date | Decision |
| --- | --- |
| earlier | In-family explicit per-job profile selection, no automatic pairing ([ADR 0003](./adr/0003-explicit-target-enrollment.md)) |
| 2026-10-17 | v1 = voice **and** face together ([ADR 0006](./adr/0006-voice-and-face-together-v1.md)) |
| 2026-10-17 | GO on the offline quality spike using **only the owner's own voice and face**, no kids or other people, all outputs off git |
| 2026-10-17 | Real enrollment capture stays gated on the legal checklist |
| 2026-10-17 | Ships as web + iOS + Android ([clients.md](./clients.md), [ADR 0009](./adr/0009-client-stack.md), Proposed) |
| 2026-10-17 | Documentation must be detailed with architecture and design (this docs set) |

## Done (on `main`, stub level, no ML)

Foundation scaffold and safety docs; hardening; enrollment state machine; review-api guardian stubs; ingest staging stubs; stub auth tenancy; convert queue stubs; in-memory `AuditEvent` log (#12); CoE CONTEXT/AGENTS docs (#13). All CI green with fail-closed tests.

## In flight (open draft PRs, not merged, not relied on by these docs)

- **PR #23**: pluggable convert backend interface, `MockBackend`, gate-first runner.
- **PR #24**: encrypted enrollment artifact store (AES-256-GCM local impl + in-memory double).
- **This docs PR**: architecture, design, ADRs, API, client and dev guides.
- Spike research plan written (off git); **experiment not run** (needs owner media + consent record).

## Blocked

| Blocker | Needed from |
| --- | --- |
| Production auth / IdP (stub headers prove nothing) | IdP decision, membership directory |
| Legal/privacy checklist (Japan APPI etc.) before any real capture | Counsel, product, privacy |
| Face-swap model licensing (InsightFace/inswapper restricted; SimSwap NC; F5-TTS weights NC) | License decision or alternative ([ADR 0007](./adr/0007-model-choices.md)) |
| Spike inputs: owner voice sample, face clip, source video, signed consent record | Owner |
| Production enrollment store design + key management approval | Security |
| App Store / Google Play policy review (synthetic media, kids, labels) | Counsel, product |

## Next (planned, in rough order)

1. CoE review and merge decisions on #23, #24 (CoS merges).
2. Run the own-media spike once inputs and consent exist; update ADR 0007 from Proposed with measurements and closed licensing items.
3. OpenAPI-first contract (`/v1`), unified error envelope, and IdP selection ([clients.md](./clients.md#2-shared-api-contract)).
4. Durable store + durable audit store; consent revoke cascade to enrollments and in-flight jobs; HTTP routes for consent and enrollment lifecycle.
5. Liveness/same-person enrollment design; enrollment capture + upload sessions.
6. Private GPU convert worker behind the backend interface with gate re-check per stage; output storage and guardian-auth preview/stream.
7. Provenance (C2PA + watermark) and abuse controls.
8. Web reference client, then iOS (SwiftUI), then Android (Compose); store submissions.

## Not planned for v1

On-device conversion, kid accounts, celebrity/stranger identities, marketplaces, cross-family sharing.
