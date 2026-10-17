# Development guide

Familiar is a private repo with fail-closed stubs. Read [README](../README.md), [CONTRIBUTING.md](../CONTRIBUTING.md), [AGENTS.md](../AGENTS.md) and [CONTEXT.md](./CONTEXT.md) first. Test details: [testing.md](./testing.md).

## Prerequisites

- Node ≥ 20 (`engines`; CI uses 20) and npm.
- Python ≥ 3.11 (`pyproject.toml`; CI uses 3.12). Python stubs use the standard library only, no installs needed.
- No GPU, models or media are needed or allowed in this repo.

## Setup and commands

```bash
npm ci                      # or npm install
npm run lint                # prettier --check "**/*.{js,ts,json,yml,yaml}" (markdown is ignored by .prettierignore)
npm run format              # prettier --write (same globs)
npm run typecheck           # tsc --noEmit in each workspace (packages/shared, apps/review-api)
npm test                    # shared + review-api: tsc to dist-test, then node --test
python3 -m compileall -q apps/ingest/src apps/convert/src
python3 -m unittest discover -s apps/convert/tests -v
python3 -m unittest discover -s apps/ingest/tests -v
```

Run the Python stub servers locally: see [python-services.md](./python-services.md).

`.env.example` is the only env file in git; copy to `.env` locally (ignored). Never commit `.env`, keys, media, models, embeddings.

## Layout

| Path | Role |
| --- | --- |
| `packages/shared/` | TS domain types, canonical gate, state logic, stub auth, audit, fixtures (`fixtures/*.json`) |
| `apps/review-api/` | TS guardian API stub (npm workspace) |
| `apps/ingest/`, `apps/convert/` | Python stubs (not npm workspaces) |
| `docs/` | This documentation ([index](./README.md)) |
| `.github/workflows/ci.yml` | CI |

## CI jobs

From [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), on push to `main` and every pull request:

| Job | Steps |
| --- | --- |
| `lint-and-typecheck` | `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` |
| `python-stubs` | `compileall` on ingest/convert `src`; convert unittest; ingest unittest |
| `git-hygiene` | Fails if `git ls-files` contains `.env*` (except `.env.example`), any `embeddings/` directory path, or files ending `.pt .pth .onnx .safetensors .gguf .npy .emb .mp4 .wav` |

The hygiene pattern is narrower than `.gitignore` (which also blocks e.g. `.ckpt`, `.mp3`, `.pkl`); still never force-add ignored files.

## Branching and PR rules

- Branch from latest `main`; small PRs. Open as **draft** until ready; **do not merge your own PR**: Chief of Staff (CoS) owns merges and Chief of Engineering (CoE) does a second-pass review of every PR.
- Describe how the change preserves consent, family-scoped inference, and revoke/delete.
- Keep the README as product source of truth; update docs and [CONTEXT.md](./CONTEXT.md) for meaningful work (house rule: dated status, short bullets, PR numbers).
- No ML, biometric store, or production auth without an explicitly resumed track and CoE review. No fake JWT/OIDC code.
- Gate changes: update TS `convertJobMayRun`, Python `queue_convert_job`, `convert-gate-cases.json` and [consent-gate.md](./consent-gate.md) in the same PR ([ADR 0002](./adr/0002-ts-canonical-gate-python-mirror.md)).
- Code work is delegated to Cloud Agents; do not clone and hand-edit in unrelated workspaces.

## How to add a slice

1. State the slice and which safety rail it touches; confirm scope with CoS.
2. Types first in `packages/shared/src/types.ts` (or a new module exported from `index.ts`); keep records metadata-only.
3. Implement fail-closed logic in TS (canonical) and the Python mirror when ingest/convert need it; add fixture cases if behavior is shared.
4. Add tests including refusal paths (see [testing.md](./testing.md#how-to-add-tests-for-a-slice)).
5. Wire HTTP route in the relevant app: stub auth first, `assertSameFamily`, map error codes to statuses; update [api-contracts.md](./api-contracts.md).
6. Update docs ([state-machines](./state-machines.md), [data-model](./data-model.md)), CONTEXT.md, add/adjust an ADR if a decision changed.
7. Run all commands above; open a draft PR; request CoE review.

## Spike procedure (own media only)

The offline quality spike evaluates voice/face/lip-sync models ([ADR 0007](./adr/0007-model-choices.md)). Rules:

- Subject is the **owner's own voice and face only**. No kids, no other people, no scraped or third-party media.
- A written consent record from the owner (mirroring `ConsentRecord`) exists before processing.
- All inputs, weights, outputs and logs live **outside any git working tree** (an encrypted volume on a dedicated/secure GPU or a local GPU); not in `/workspace/familiar*` clones.
- Pin versions; record each repo's license and commit hash and each weight file's license in a spike log kept off git.
- No third-party inference APIs; no peer-hosted GPU hosts for biometric data; no persistent cloud storage.
- Measure per the plan's metrics (speaker similarity, WER, MOS proxy, face ID similarity, flicker, lip-sync LSE, cost/VRAM); thresholds are proposals.
- At the end, secure-delete media and weights; keep only the metrics table and logs; commit **only** conclusions (docs/ADR), never artifacts.
- Real enrollment capture of anyone else stays gated on the legal checklist in [consent.md](./consent.md).
