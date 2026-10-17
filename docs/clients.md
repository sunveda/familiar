# Clients: web, iOS, Android

**Everything in this document is PLANNED. No client code exists.** It records the owner requirement that Familiar ships as a web app, an iOS app and an Android app, and proposes how. Platform-policy statements are flagged **[verify]** where current store text has not been read; do not treat them as confirmed. Legal text is placeholder only.

Related: [architecture.md](./architecture.md) · [api-contracts.md](./api-contracts.md) · [security-and-threat-model.md](./security-and-threat-model.md) · [ADR 0009](./adr/0009-client-stack.md)

## 1. Principles

1. **Clients are untrusted.** The consent gate, family isolation, enrollment state and review gate are enforced server-side only. A client can hide a button; it cannot grant anything.
2. **One API, three skins.** All three clients speak the same versioned contract; no client-specific endpoints.
3. **Server-side conversion for v1.** No biometric models or enrollment artifacts on devices.
4. **Guardian-only surfaces.** Capture, consent, review, revoke/delete are guardian features. A kid-facing playback surface (planned) shows only `approved` output and has no guardian API scope.
5. **Nothing biometric persisted on device** beyond the in-flight capture buffer, which is deleted after upload or cancel.

## 2. Shared API contract

**Proposal: OpenAPI-first.**

- Author OpenAPI 3.1 as the source of truth in-repo (`api/openapi.yaml`, planned). Generate clients: TypeScript (e.g. openapi-typescript + fetch), Swift (swift-openapi-generator), Kotlin (openapi-generator or Ktor-based) **[verify tool choice and maintenance status]**.
- Server conformance: contract tests run against review-api (TS) and ingest/convert (Python) so spec and servers cannot drift (same philosophy as the gate fixtures, [ADR 0002](./adr/0002-ts-canonical-gate-python-mirror.md)).
- **Versioning:** URL major version `/v1`; additive changes within a major; breaking changes get `/v2` with an overlap window. Native apps have slow update cycles, so the server must tolerate old clients; a minimum-supported-version header/endpoint can force upgrade for safety fixes.
- **Error model:** a single `{error, message?, ...}` envelope (today's bodies are close; unification needed, see [api-contracts.md](./api-contracts.md#4-convert-python)).
- **Auth path replacing stub headers:** `x-guardian-id` / `x-family-id` are removed from the contract. Planned: OIDC authorization-code + PKCE via a system browser (`ASWebAuthenticationSession`, Android Custom Tabs / AppAuth, web redirect), short-lived access tokens, refresh in Keychain / Keystore-backed storage (web: httpOnly cookie via backend-for-frontend, no tokens in `localStorage`). Server derives `guardianId` and `familyId` from the verified token and a membership lookup. Step-up re-authentication for approve, revoke, delete, consent changes. IdP choice is **open** and production auth is **blocked** ([ADR 0004](./adr/0004-stub-auth-tenancy.md)).
- **Idempotency** keys on POSTs, because mobile networks retry.

## 3. Review UI on all three platforms

| Aspect | Design (planned) |
| --- | --- |
| Who | Guardian only. Preview media is served only with guardian auth (today: always `501`, [api-contracts.md](./api-contracts.md#2-review-api-typescript)). |
| Flow | List family jobs → open `needs_review` job → see which enrollment (whose face/voice) was applied → preview → approve or reject. Only `approved` ever reaches a kid surface ([ADR 0008](./adr/0008-guardian-review-before-release.md)). |
| Delivery | Short-lived signed URL or authenticated stream; `Cache-Control: no-store`; no offline download in v1. |
| Caching | Web: no service-worker caching of media, `no-store`. iOS: stream via `AVPlayer` without writing to persistent storage; no Photos export. Android: ExoPlayer/Media3 with no disk cache for this content. |
| Screenshots / screen recording | **Caveat:** cannot be reliably prevented. Android `FLAG_SECURE` blocks screenshots and recording in-app (still defeatable by a camera). iOS has no equivalent block; apps can only detect screen recording (`UIScreen.isCaptured`) and screenshot events and obscure content **[verify current APIs]**. Web cannot prevent capture at all. Therefore the guarantee is "guardian-authenticated, short-lived, watermarked/provenance-marked", not "uncopyable" ([security doc §7](./security-and-threat-model.md#7-provenance-and-watermark-plan-planned)). |
| Revoke / delete | Dedicated screens listing each enrollment with status; revoke and delete require step-up auth and a plain-language confirmation of consequences (jobs targeting it fail; delete is permanent). Calls `POST /enrollments/:id/revoke` and `/delete` (exist in stub). UI reflects the server response (`convertJobs: fail_closed`), never an optimistic state. |
| Kid separation | Guardian app sections are behind guardian auth; the kid-facing mode (planned) uses a separate, scope-limited session and a guardian gate (PIN/biometric) to exit. |

## 4. Consent UX per platform

Shared rules: consent is **affirmative and explicit** (`affirmationMethod: 'explicit_ui'`). No pre-checked boxes, no bundling with ToS, no consent from signup or upload. The screen shows the policy text for a `policyVersion`, the exact scopes requested (`voice_enrollment`, `face_enrollment`, `inference_on_family_content`, `guardian_preview`) in plain language, and records the version. The client sends the grant; the server persists the `ConsentRecord`.

| Concern | Web | iOS | Android |
| --- | --- | --- | --- |
| Consent screen | Full-page, scroll-to-end, per-scope toggles default **off**, explicit "I agree" button | SwiftUI sheet, same content, per-scope toggles default off | Compose screen, same |
| Policy text | **[placeholder, counsel]** wording and languages (ja/en) | same | same |
| Guardian vs kid | Consent and enrollment only in guardian-authenticated session; kid profile creation is guardian-managed metadata, never a capture target | same | same |
| Re-consent | Triggered when `policyVersion` changes or scopes expand; old consent keeps old scopes only; blocked actions explain why | same | same |
| Revoke | Settings → Consent → Revoke (step-up auth). Cascade to enrollments and in-flight jobs is **planned server behavior** (today gate just fails closed) | same | same |

**Liveness / same-person check at enrollment (planned, design open):** guard against enrolling someone else's face/voice. Proposal: guided live capture (random head-turn and spoken random phrase) performed in-app, bound to the authenticated guardian session; server-side checks that the voice and face in the capture correspond to one live person and, where feasible, to the guardian's verified identity. Method, vendor and false-accept targets are **unverified/undecided**; no third-party service may receive biometrics without a security/legal decision ([security doc](./security-and-threat-model.md)). Pre-recorded or uploaded enrollment media is rejected for v1. Whether enrollment of a second guardian must be performed by that guardian on their own device is a recommended rule.

## 5. Capture and upload per platform

| | Web | iOS | Android |
| --- | --- | --- | --- |
| Capture API | `getUserMedia` + `MediaRecorder` | AVFoundation (`AVCaptureSession`, `AVAudioEngine`/`AVCaptureAudioDataOutput`) | CameraX (`VideoCapture`, `ImageAnalysis`) + `AudioRecord`/`MediaRecorder` |
| Permission prompt | Browser prompt (requires HTTPS, user gesture); handle denied/dismissed | `NSCameraUsageDescription`, `NSMicrophoneUsageDescription` strings; one-shot system prompt, later changes only via Settings | Runtime `CAMERA`, `RECORD_AUDIO`; handle "don't ask again" → settings deep link |
| Constraints | Request ≥ 48 kHz mono audio with echo cancellation/noise suppression **off** for enrollment (or record raw); video 1080p/30 where available | same intent via session presets and audio session mode `.measurement`/raw **[verify]** | same intent via CameraX quality selector and `AudioSource.UNPROCESSED`/`MIC` **[verify device support]** |
| Container/codec at capture | `MediaRecorder` output varies by browser (WebM/Opus, MP4/AAC on Safari) | MP4/H.264 or HEVC + AAC/PCM | MP4/H.264 + AAC |
| Background | Tab must stay open | Background `URLSession` for uploads; system decides timing; capture itself stops when backgrounded | `WorkManager` expedited/long-running uploads; Doze and OEM battery limits can delay; foreground service needed for long ones |

Server-side **normalization** (planned): clients upload whatever the platform produces; the server transcodes to a fixed internal format (e.g. 48 kHz mono PCM/FLAC audio, constant-frame-rate H.264 video) in an isolated worker, validates duration/size/dimensions, and rejects unsupported input. Never trust client-declared types. Format choices **[to decide]**.

**Upload to opaque storage (planned):** (1) client asks API to create an upload session (authenticated, family-scoped; for enrollment this requires an unrevoked consent with the right scopes); (2) API returns presigned, short-lived, single-object URLs for chunked/resumable upload (S3-style multipart or tus/GCS resumable) to a private bucket under an opaque key; (3) client uploads chunks with retry/resume; (4) client calls complete with checksums; (5) server verifies, scans, normalizes, and creates the record. The client never learns a repo path or permanent URL; the persisted reference is an opaque `sourceRef` (ingest) or `artifactRef` (enrollment). Presigned URLs expire in minutes; enrollment capture buffers are deleted client-side after confirmed upload.

Limits to design around: iOS background transfers are best-effort and cannot be started from a terminated state by the app alone; Android background work is throttled; web uploads die with the tab (use resumable sessions and a "keep this tab open" notice). Large source videos should prefer a library/URL `sourceRef` (`https:`, `s3:`, `gs:`, `library:`, already allowed by ingest) over device upload.

## 6. Platform limits and store policy flags

All items **[verify against current policy text before submission]**; nothing here is a legal or policy conclusion.

| Area | Flag |
| --- | --- |
| Synthetic/deepfake media | Apple App Store Review Guidelines and Google Play policies both address AI-generated/altered content and impersonation; expect disclosure labeling, no deceptive impersonation, and content-moderation/reporting mechanisms. Familiar's consent-bound, own-family design and provenance marking (C2PA, visible marker) are our mitigations. |
| Kids / COPPA-style rules | Apps aimed at or used by children trigger Apple Kids Category rules and Google Play Families policy plus US COPPA-style obligations and Japan equivalents (**[placeholder, counsel]**). Mitigation: guardian-managed accounts only, no kid accounts, no third-party analytics/ads SDKs in kid surfaces, parental gate. Decide whether the app is marketed to kids (child-directed) or to parents (guardian app with a kid playback mode); this changes the policy class. |
| Biometric data | Face and voice capture require clear permission strings and privacy disclosures; Apple privacy "nutrition labels" and Google Play Data safety form must declare collected data types (photos/video, audio, identifiers, user content, possibly biometric-like data), purposes, linkage and retention. Draft once from [data-model.md](./data-model.md); **[placeholder, counsel + product]** for final answers. |
| Japan APPI | Treatment of biometric identifiers, consent wording, cross-border transfer, retention: **[placeholder, counsel]**. No text invented here. |
| Account deletion | Both stores require an in-app path to delete the account/data; maps to revoke + delete enrollment and family data deletion (planned). |
| Permissions | Request camera/mic only at the moment of capture with a rationale screen; app must work for review without them. |
| Background limits | See §5. |
| Review process | Provide reviewers a demo guardian account with synthetic data; never real biometrics. |

## 7. On-device vs server conversion

**Recommendation: server-side conversion on a private GPU for v1. Defer on-device.**

| Factor | On-device | Server (recommended) |
| --- | --- | --- |
| Model size | Voice + face + lip-sync stacks are hundreds of MB to GB; app size/download limits, memory ceilings | Unconstrained |
| Thermal / battery | Sustained GPU/NPU load throttles quickly, minutes-long videos | n/a |
| Quality | Must shrink/quantize models; quality loss; wide device variance | Best available models, consistent |
| Key and model protection | Weights and enrollment artifacts on a user-controlled device are extractable; weakens "private models" and biometric protection | Artifacts only in encrypted store and ephemeral worker volumes |
| Consent gate enforcement | Client-side gate can be bypassed on a rooted/jailbroken or modified client | Gate enforced server-side, re-checked by worker, audited |
| Revoke/delete | Cannot prove deletion from a device | Central deletion + key destruction |
| Cost | Zero GPU cost | GPU cost (estimate only, see [ADR 0007](./adr/0007-model-choices.md)) |
| Privacy upside | Media need not leave device | Media goes to our private infra (disclose in privacy labels) |

Revisit on-device later only for non-biometric steps (e.g. client-side trimming/transcode before upload). Any future on-device conversion would still need server-issued, short-lived, consent-checked authorization and cannot replace server-side gate enforcement. That would need its own ADR.

## 8. Stack proposal and sequencing

Recommendation (see [ADR 0009](./adr/0009-client-stack.md), status Proposed):

1. **Web first as the reference client** (React + TypeScript), reusing `packages/shared` types and the generated TS API client. Fastest path to exercise consent, review, revoke/delete against the real API; it is the contract's first consumer. Capture on web is limited (no reliable background upload, codec variance), so web enrollment is a convenience path, not the quality bar.
2. **Native SwiftUI iOS** then **native Kotlin/Jetpack Compose Android**, built on the same generated contracts (Swift/Kotlin clients). Owner note: the sibling health-app repo uses SwiftUI + Compose, so team knowledge and patterns can be reused (claim relayed from the owner; not verified here).
3. Shared pieces: OpenAPI spec, generated clients, design tokens, copy/strings and consent text sources (single source, localized), fixtures for UI state (job statuses from [state-machines.md](./state-machines.md)).

Why native over React Native / Expo for mobile:

| | Native SwiftUI + Compose (recommended) | React Native / Expo |
| --- | --- | --- |
| Capture control (AVFoundation / CameraX, raw audio, camera pipeline) | Direct | Via modules/bridges, more friction, device-specific bugs |
| Background upload (URLSession background, WorkManager) | First-class | Plugin-dependent |
| Secure display (`FLAG_SECURE`, capture detection), Keychain/Keystore | First-class | Plugin-dependent |
| Liveness SDK/in-house guided capture | Easier | Harder |
| Code sharing | Contracts only (generated) | Could share UI/logic with web |
| Team fit | Matches sibling repo skills | New stack for the team |
| Cost | Two UI codebases | One mobile codebase |

Tradeoff acknowledged: native doubles UI work. If capacity forces it, a React Native mobile client is the fallback for the **review/consent** screens only, keeping capture native; that is not recommended for v1 and is an open question.

**Sequencing (planned):** (0) spike and legal checklist gate real capture, independent of clients; (1) OpenAPI contract + auth/IdP decision; (2) web reference client against stubs → real services; (3) iOS; (4) Android; (5) store submissions with synthetic reviewer data. No client may ship real biometric capture until [consent.md](./consent.md) legal checklist is complete and production auth exists.
