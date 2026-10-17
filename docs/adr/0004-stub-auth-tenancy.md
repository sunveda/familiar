# ADR 0004: Stub auth tenancy until an IdP exists

- **Status:** Accepted (temporary; production auth **blocked**)
- **Date:** not recorded
- **Deciders:** Familiar, CoE, CoS

## Context
Services need a family boundary now, but no identity provider has been chosen and the repo must not contain secrets or verification theater.

## Decision
A shared `AuthContext { guardianId, familyId, mode: 'stub' }` from headers `x-guardian-id`, `x-family-id`, with fail-closed `assertSameFamily`. No JWT/OIDC/JWKS code. The stub proves nothing cryptographically and must never be exposed beyond local wiring and tests.

## Consequences
- Not safe for real users or real biometrics; real capture is gated on replacing it.
- Clients must be written so identity comes from a token, not hand-set headers (planned: OpenAPI security scheme, [clients.md](../clients.md#2-shared-api-contract)).
- Required next: choose IdP (open), membership directory, step-up auth for destructive actions.

## Alternatives considered
Fake JWT verification (rejected: false assurance); no tenancy until IdP (rejected: untested isolation later).
