# ingest (stub)

Accepts source videos (upload, URL, or library) and creates `ingest` jobs scoped to a family.

**This package does not download, transcode, or store real media.** Staging directories stay outside git (see `.gitignore`).

## Rules

- Require an authenticated guardian and `familyId`.
- Do not treat ingest as consent or enrollment.
- Media files must never be committed.

## Layout

```
src/familiar_ingest/main.py   # placeholder entry
```
