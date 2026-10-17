# ADR 0006: Voice and face together for v1

- **Status:** Accepted (owner decision 2026-10-17, relayed via CoS)
- **Date:** 2026-10-17
- **Deciders:** Sarveshwar Singh

## Context
`EnrollmentModality` allows `voice`, `face`, `voice_and_face`. The product promise is that kids see and hear a trusted parent.

## Decision
v1 ships voice **and** face together: the target enrollment is `voice_and_face`, requires both `voice_enrollment` and `face_enrollment` consent scopes (plus `inference_on_family_content` to convert), and a convert job applies both. Voice-only or face-only outputs are not a v1 product.

## Consequences
- Pipeline needs voice conversion, face reenactment/swap and lip-sync ([ADR 0007](./0007-model-choices.md)); the face licensing blocker therefore blocks v1 production.
- Type and gate already permit other modalities; whether to restrict `modality` to `voice_and_face` at creation is a follow-up (not enforced in code today).
- Capture UX collects both modalities and a same-person check ([clients.md](../clients.md)).

## Alternatives considered
Voice-first then face (rejected by owner); optional modalities per job (more consent surface).
