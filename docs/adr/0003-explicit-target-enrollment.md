# ADR 0003: Explicit per-job `targetEnrollmentId`

- **Status:** Accepted (owner lock, relayed via CoS)
- **Date:** not recorded
- **Deciders:** Sarveshwar Singh (owner), Familiar, CoS

## Context
A family may enroll several consented parents/caregivers. Should convert pick a profile automatically, or only follow an explicit choice? Should guardian A be able to use guardian B's profile?

## Decision
A family may enroll any number of consented voice+face profiles. Every convert job carries a user-selected `targetEnrollmentId`. There is no automatic any-member-to-any-face pairing. `requestedByGuardianId` may differ from `enrollment.guardianId` within the family, only for an explicit, `active`, consented enrollment. Missing selection → `missing_target_enrollment`; a `KidProfile` id → `kid_profile_not_target`.

## Consequences
- The gate does not compare requester with subject; it checks family, binding, status, scope.
- Clients need a profile picker and must show whose face/voice is applied before queueing ([clients.md](../clients.md)).
- Note for review: the subject guardian's consent (`inference_on_family_content`) is what authorizes use; whether the *subject* must also be notified when another guardian uses their profile is an open product question.

## Alternatives considered
Auto-pair by requester (blocks legitimate in-family use, still ambiguous with many profiles); auto-pair any-to-any (rejected: weakens consent).
