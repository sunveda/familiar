# ADR 0005: Opaque `artifactRef` and an encrypted store outside git

- **Status:** Accepted as a rule; interface and local AES-256-GCM stub implementation merged in PR #24 (non-production, not wired to real capture; KMS and crypto-erase open)
- **Date:** not recorded
- **Deciders:** Familiar, CoE

## Context
Enrollment needs voice/face artifacts (samples, embeddings). They are biometric data and must never be in git, app records, logs or audit metadata.

## Decision
App records hold only `Enrollment.artifactRef = { storageKey, contentType, createdAt } | null`, an opaque key. Bytes and embeddings live in an encrypted, access-controlled store outside the repo, scoped by family and enrollment. `deleteEnrollment` nulls the ref; deleting bytes (and destroying keys where feasible) is part of delete, not best-effort. Revoke/delete fail closed.

## Consequences
- Workers load artifacts at runtime for one family only and must not log them.
- Key management and the production store design need security sign-off ([security doc](../security-and-threat-model.md#8-key-management-planned)).
- CI `git-hygiene` and `.gitignore` enforce the repo side.

## Alternatives considered
Embeddings in the app DB (broader blast radius); files in repo (forbidden).
