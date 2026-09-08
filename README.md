# Familiar

**Private.** Help kids learn from the faces and voices they trust.

Familiar ingests educational (or other) videos from various sources and re-renders them so a **registered, consented parent** appears and speaks — voice conversion + face/identity swap — instead of the original presenter.

## Goals

- Better learning / comfort for kids when content feels like Mom/Dad
- Strong privacy and consent: only enrolled caregivers; never invent unregistered identities
- Private models and data; auditability

## Non-goals (v1)

- Generating deepfakes of celebrities or strangers
- Public marketplace of faces/voices
- Unsupervised kid accounts without a guardian

## Product flow (draft)

See [docs/guardian-flow.md](./docs/guardian-flow.md) for the stub sequence (onboard → consent → enroll → ingest → convert with an explicit profile pick → review → kids see only after approve).

1. **Guardian onboarding** — create family space, consent, kids profiles
2. **Enrollment** — capture parent voice samples + face reference under explicit consent
3. **Ingest** — upload / URL / library source video
4. **Convert** — diarize/select speaker track → voice convert → face swap / reenactment → mux
5. **Review & export** — guardian preview before kids see it; watermark/metadata as needed

## Safety rails (required)

- Enrollment requires affirmative consent UI + stored consent record
- Inference only against enrolled identities in that family
- Rate limits, abuse detection, and revoke/delete enrollment
- No training on kids’ faces for public models
- Secrets and biometric embeddings never in git

## Status

Scaffold / brief stage. Specialist bot: **Familiar**. Coordinate via Chief of Staff.

**Production auth is blocked / not ready** (stub tenancy only — [docs/auth-tenancy.md](./docs/auth-tenancy.md)). No IdP, OIDC, or JWT verification in this tree.

This README is the product source of truth. Implementation stubs and design notes live alongside it; they must not weaken the safety rails above.

## Repository layout

| Path | What it is |
| --- | --- |
| [docs/](./docs/README.md) | Architecture, consent, guardian flow, threat-model, and auth/tenancy stubs |
| [apps/](./apps/README.md) | Ingest, convert, and review-api placeholders (no ML) |
| [packages/shared](./packages/shared/) | Types: Family, Guardian, Enrollment, ConsentRecord, Job |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Consent, enrollment scope, git hygiene, revoke/delete |
| [SECURITY.md](./SECURITY.md) | Vulnerability reporting and biometric/secret handling |

## License

Private / proprietary — all rights reserved.
