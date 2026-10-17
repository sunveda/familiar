# ADR 0009: Client stack: web, iOS and Android

- **Status:** **Proposed** (nothing built)
- **Date:** 2026-10-17
- **Deciders:** pending (owner, CoE)

## Context
Owner requirement (2026-10-17): Familiar ships as a web app, an iOS app and an Android app. Clients capture biometric media, collect consent, and run guardian review. The consent gate must not be bypassable from a client. A sibling health-app repo reportedly uses SwiftUI + Jetpack Compose (owner note, not verified here).

## Decision (proposed)
1. **One OpenAPI 3.1 contract**, versioned `/v1`, generating TypeScript, Swift and Kotlin clients; server conformance tests.
2. **Auth:** OIDC code + PKCE with a system browser, short-lived tokens, BFF cookies on web; replaces stub headers. IdP choice open; production auth stays blocked until chosen.
3. **Server-side conversion on a private GPU for v1**; on-device conversion deferred (model size, thermal, quality, key/model protection, gate enforcement must stay server-side).
4. **Web first** (React + TypeScript, reuse `packages/shared`), then **native SwiftUI iOS** and **native Kotlin/Compose Android**. React Native/Expo not chosen for v1.
5. Resumable chunked upload to opaque object storage via short-lived presigned URLs; server-side normalization of media.

Details: [clients.md](../clients.md).

## Consequences
- Contract-first work (OpenAPI, error envelope, versioning) precedes client work.
- Two native UI codebases; shared via generated contracts, tokens and strings.
- Web cannot offer reliable background upload or screenshot protection; guardian review safety relies on auth, short-lived URLs and provenance, not on preventing copies.
- Store-policy items (synthetic media, kids, privacy labels) need verification and counsel input before submission.

## Alternatives considered
React Native/Expo for both mobile apps (less capture/background/secure-display control, new stack); Flutter (same concerns, no sibling reuse); PWA only (inadequate capture/background); on-device conversion for v1 (see clients.md §7).

## Unverified / open items
Generator tool choices and maintenance; IdP; liveness approach; exact platform capture/audio flags; current App Store and Google Play policy text; whether kid playback is in the same app or separate; whether the sibling repo claim holds.
