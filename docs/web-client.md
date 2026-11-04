# Web client (`apps/web`)

Status: **reference client, stub level**. React 19 + Vite + TypeScript (strict), exact-pinned deps, Vitest + Testing Library. Implements the web column of [clients.md](./clients.md) against the routes in [api-contracts.md](./api-contracts.md).

## Hard rules (enforced in code and tests)

- **The consent gate stays server-side.** The UI never decides whether a conversion may run; it shows what the server returns and surfaces refusals.
- **Stub auth only.** A dev-only settings screen stores a base URL, `x-family-id` and `x-guardian-id` in `localStorage`. These are not credentials. A permanent banner says so. No secrets or tokens are stored. Real auth is blocked ([auth-tenancy.md](./auth-tenancy.md)).
- **No capture.** There is no `getUserMedia` and no file upload in this phase. Real enrollment capture is gated on the legal checklist ([consent.md](./consent.md)).
- **No fabricated media.** Preview/media routes answer `501` after auth; the UI says preview is not available.
- **Kids are never enrollment targets** and are never offered in any picker.

## Layout

```
apps/web/
  src/api/types.ts     wire types (local copy, no Node-only imports)
  src/api/client.ts    typed review-api client, ApiError, fail-closed on missing ids
  src/api/settings.ts  dev-only stub settings (localStorage)
  src/i18n/            en + ja catalogs; test enforces identical keys/placeholders
  src/pages/           pages; add to registry.tsx to appear in the nav
  src/App.tsx          shell: stub banner, nav landmark, language switch, skip link
```

## Commands

```bash
npm run dev -w @familiar/web        # Vite dev server
npm run test -w @familiar/web       # Vitest (jsdom)
npm run build -w @familiar/web      # typecheck + production build
```

`baseUrl` defaults to `/api`. review-api currently has no server entry point, so run against a mock or your own harness; the Python services have loopback entry points ([python-services.md](./python-services.md)).

## Accessibility and i18n

Landmarks (`banner` note, `nav`, `main`), skip link, labelled inputs, 44px targets, visible focus, `role=status` live regions, responsive layout. Strings live in `src/i18n/messages.ts` (English and Japanese). Japanese strings are a first scaffold and need a native review.

## Slices

1. Scaffold, typed client, dev settings, shell (this doc's baseline).
2. Guardian review UI (planned in the same series).
3. Consent and enrollment UI.
4. Convert job creation and ingest `sourceRef` form.
