# Auth and tenancy (stub)

Engineering sketch of the **family tenancy boundary**. It is **not** a production identity design, not legal advice, and not an IdP integration.

## Production auth: blocked / not ready

**Production authentication is blocked.** This repository is not ready to authenticate real users.

- Shared stub tenancy (`AuthContext`, `mode: 'stub'`) is the intended slice. It is OK.
- It is **not** an IdP, OIDC provider, OAuth client, or JWT verifier. Do **not** add fake JWT parse/verify, JWKS fetch, OIDC discovery, session cookies, or other verification theater.
- **No secrets in git** — no API keys, client secrets, JWKS, signing keys, or IdP config. See [SECURITY.md](../SECURITY.md).
- Family isolation is fail-closed via `assertSameFamily`. Do not weaken that check.

Until a real IdP is designed and approved, treat every caller as unauthenticated except for this explicit stub used in local wiring and tests.

This slice replaces ad-hoc `x-family-id` / `x-guardian-id` reads with one documented stub used by [`apps/review-api`](../apps/review-api/), [`apps/ingest`](../apps/ingest/), and [`apps/convert`](../apps/convert/). Convert queue HTTP and ingest `POST /jobs/:id/convert` use the same path. Canonical TypeScript: [`packages/shared/src/auth-context.ts`](../packages/shared/src/auth-context.ts). Python mirrors: [`apps/ingest/src/familiar_ingest/auth.py`](../apps/ingest/src/familiar_ingest/auth.py), [`apps/convert/src/familiar_convert/auth.py`](../apps/convert/src/familiar_convert/auth.py). Shared cases: [`packages/shared/fixtures/auth-tenancy-cases.json`](../packages/shared/fixtures/auth-tenancy-cases.json).

Japan/APPI and other capture gates stay checklist-only in [consent.md](./consent.md). Convert/enrollment fail-closed rules are unchanged ([consent-gate.md](./consent-gate.md)).

## Trust boundary: who may act for a `familyId`

**Family** is the tenancy unit. Jobs, enrollments, consent records, and kid profiles always carry `familyId`. A caller may act in a family only when they are a **guardian of that family**.

| Actor | May act for `familyId`? |
| --- | --- |
| Guardian with membership in that family | Yes — review, ingest, convert request, enrollment revoke/delete in that family |
| Guardian of a *different* family | No — cross-family access is refused |
| Kid / `KidProfile` | No — kids do not approve export and are not enrollment targets |
| Unauthenticated caller | No — family-scoped routes fail closed |

In-family convert targeting is unchanged: guardian A may request convert targeting guardian B’s **explicit** `targetEnrollmentId` in the **same** family when `convertJobMayRun` passes. That is not a tenancy exception; both actors still belong to `job.familyId`. See [consent-gate.md](./consent-gate.md).

## Stub vs future IdP

| | Today’s stub (`mode: 'stub'`) | Future IdP (not this slice) |
| --- | --- | --- |
| What the caller sends | Headers `x-family-id` and `x-guardian-id` (or the in-process helper with the same two ids) | Proof of an authenticated principal (session, bearer token, etc.) |
| What it **proves** | **Nothing cryptographically.** Anyone who can set headers can claim any guardian/family pair. | That the request is bound to a verified principal the IdP issued |
| What it **does** check | Non-empty ids; `assertSameFamily(ctx, resourceFamilyId)` so a claimed family cannot read another family’s records | Principal → `guardianId`; `familyId` ∈ allowed families; then the same family-scope checks |
| Secrets | None in git. No API keys, JWKS, or client secrets in this repo | IdP config and secrets stay out of git (env / secret manager) |

Treat stub headers as **claimed** identity for local wiring and tests only. **Do not ship this as production auth.** Production auth remains blocked until a real IdP exists.

Do **not** implement JWT/OIDC/JWKS “verification” against hardcoded keys or unsigned tokens in this tree. That would pretend to be an IdP. When real auth lands, it belongs behind a verified IdP — secrets still out of git.

## Mapping: authenticated principal → `guardianId` + allowed `familyId`s

**Design only** for a future IdP. This repository does not verify tokens or store a membership directory. The numbered steps below are not implemented and must not be faked.

Intended binding after real auth exists:

1. Verify the credential (IdP signature, issuer, audience, expiry). Failure → unauthenticated.
2. Map the IdP subject (stable principal id) to a `Guardian` record → `guardianId`. Unknown subject → unauthenticated / forbidden.
3. Load **allowed families** for that guardian (membership, not a client header). Empty set → forbidden.
4. Bind the request to **one** `familyId` that is in that set (resource path, explicit session family, or similar). If the client also sends a family id, it is a *hint* that must match membership — never the source of truth.
5. Run the same `assertSameFamily` checks against jobs, enrollments, and consent. Do not land that verifier in this stub module.

The stub skips steps 1–3 and takes both ids from the caller. That is why `mode` is `'stub'` and why cross-family mismatch is the only tenancy proof we have today.

## Rules (fail closed)

1. **Never trust a client-supplied family id without binding it to a principal.** The stub binds by requiring **both** `guardianId` and `familyId` together (`resolveAuthContext`). A family header or URL segment alone is not an auth context.
2. **Cross-family access is refused.** After a context exists, `assertSameFamily(ctx, resourceFamilyId)` must pass. Wrong family → `wrong_family` (HTTP 403). Missing/empty ids → `missing_guardian` or `missing_family` (HTTP 401).
3. Family-scoped HTTP routes (list/create jobs, get/stage/fail/convert, convert run/complete/cancel, approve/reject, enrollment revoke/delete) go through the shared resolver. Health stays public. Preview/media stay **501** and never stream bytes.
4. Convert/enrollment gates stay fail closed: explicit `targetEnrollmentId`, same-family scope, `KidProfile` never an enrollment target. Auth-tenancy does not override `convertJobMayRun`.

Canonical helpers:

- `resolveAuthContext({ guardianId, familyId })` — in-process
- `resolveAuthContextFromHeaders(headers)` — stub HTTP (`x-guardian-id`, `x-family-id`)
- `assertSameFamily(ctx, resourceFamilyId)` — refuse mismatch or empty resource family

## Non-goals this slice

- Real IdP, OAuth, OIDC, JWT verification, session cookies, or production API keys
- Fake JWT/OIDC/JWKS verification theater (unsigned tokens, hardcoded keys, discovery stubs that look like auth)
- Cryptographic proof of the caller; mTLS between services
- Secrets of any kind in git
- Encrypted enrollment store or membership directory
- ML, biometric capture/storage, or media bytes in git
- Changing convert/enrollment fail-closed tests or Japan/APPI checklist items
- Weakening `assertSameFamily` (family isolation stays fail-closed)
- Kids as principals or enrollment targets
