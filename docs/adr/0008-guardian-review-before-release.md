# ADR 0008: Guardian review before release

- **Status:** Accepted (stub implemented in review-api and convert queue)
- **Date:** not recorded
- **Deciders:** Familiar, CoE

## Context
AI-altered video of a parent shown to children must never go out unreviewed.

## Decision
Successful convert lands in `needs_review`. Only a guardian `approve` (`needs_review → approved`) permits kid exposure; `reject` is terminal. Preview media is served only with guardian auth; the stub returns `501` for `/jobs/:id/media` and `/preview` and exposes `previewReady`. Kids never approve. Release to a kid surface is planned and gated on `approved`.

## Consequences
- Clients: guardian-only review UI; no media caching or kid access to previews ([clients.md](../clients.md#3-review-ui-on-all-three-platforms)).
- Approve/reject need verified guardian identity once auth exists (today any same-family caller can approve).
- Audit `review_approved` / `review_rejected` are emitted.

## Alternatives considered
Auto-release after a delay (rejected); kid-visible "pending" previews (rejected).
