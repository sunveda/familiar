# Security Policy

Familiar handles **parent biometric enrollment** (voice + face) for a kids’ learning product. Only registered, consented guardians may be enrolled. Treat enrollment artifacts as sensitive personal data.

## Reporting a vulnerability

Do **not** open a public issue for security reports.

Use GitHub **private vulnerability reporting** on this repository (Security → Advisories), or email the current private security contact for the sunveda org, with:

- Description and impact
- Affected service or path
- Reproduction notes that do **not** include real biometric samples, embeddings, or secrets

If the issue involves leaked enrollment data or missing consent checks, say so in the first line.

## Non-negotiable controls

| Control | Requirement |
| --- | --- |
| Consent | Affirmative UI + persisted `ConsentRecord` before capture or inference |
| Identity scope | Inference only against **enrolled** identities in **that family** |
| Revoke / delete | Guardian can revoke consent and delete enrollment; jobs targeting revoked IDs fail closed |
| Git hygiene | No biometrics, embeddings, models, media, or `.env` secrets in this repository |
| Auth | Production auth is **blocked**. Stub tenancy only (`docs/auth-tenancy.md`). No IdP/OIDC/JWT theater; no secrets in git |
| Kids | No training on kids’ faces for public models; no unsupervised kid accounts |

See [docs/consent.md](./docs/consent.md) and [docs/threat-model.md](./docs/threat-model.md).

## What must never be committed

- Voice or face samples, crops, spectrograms
- Embeddings, FAISS/ANN indexes, enrollment dumps (`.npy`, `.pkl`, `.emb`, …)
- Model weights and checkpoints
- `.env`, API keys, signing keys, cloud credentials
- Rendered videos or source media

`.gitignore` is configured to block common cases. Do not force-add ignored files.

## Secrets and local config

Copy `.env.example` to `.env` locally. Environment files stay on the machine (or a secret manager), never in git.

## Incident notes (scaffold)

Until production services exist, treat any accidental commit of the items above as an incident: rotate secrets, purge git history if needed, and delete local copies of biometric files.
