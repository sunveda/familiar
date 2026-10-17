# Running the Python stub services

`apps/convert` and `apps/ingest` each ship a minimal **standard-library** HTTP entry point that wraps the existing stub handlers (`http.py`). No ML, no media, no outbound fetches, no files, no secrets. **No third-party dependency was added**, so there is nothing new to pin or for Dependabot to track (the per-app `pyproject.toml` files remain dependency-free and watched).

> This is the "run instructions" section for the Python services. If `docs/development.md` (PR #25) is present, link to this page from it.

## Run

From the repo root (Python 3.11+):

```bash
# convert stub on http://127.0.0.1:8001
PYTHONPATH=apps/convert/src python3 -m familiar_convert

# ingest stub on http://127.0.0.1:8002
PYTHONPATH=apps/ingest/src python3 -m familiar_ingest
```

| Variable | Default | Notes |
| --- | --- | --- |
| `FAMILIAR_CONVERT_HOST` / `FAMILIAR_INGEST_HOST` | `127.0.0.1` | Non-loopback is **refused** unless `FAMILIAR_ALLOW_NON_LOOPBACK=1` |
| `FAMILIAR_CONVERT_PORT` / `FAMILIAR_INGEST_PORT` | `8001` / `8002` | Must be 0–65535 |
| `FAMILIAR_ALLOW_NON_LOOPBACK` | unset | Only for isolated development. Stub auth is not authentication. |

## Try it

```bash
curl -s localhost:8001/health                      # public
curl -s localhost:8001/families/fam_1/jobs         # 401: stub headers missing
curl -s -H 'x-family-id: fam_1' -H 'x-guardian-id: grd_1' localhost:8001/families/fam_1/jobs   # 200
curl -s -H 'x-family-id: fam_1' -H 'x-guardian-id: grd_1' localhost:8001/families/fam_2/jobs   # 403
```

## Behavior and limits

- Health is public; every other route needs both `x-family-id` and `x-guardian-id` (stub `AuthContext`, **not** an IdP; production auth is blocked). Missing ids → 401, family mismatch → 403, unknown route/job → 404.
- The store is in-memory per process and starts empty. Convert jobs therefore refuse until enrollments and consents are seeded by tests; there is no enrollment/consent write API in these services.
- Request bodies are capped at 64 KiB; malformed JSON is treated as an empty body and refused by the route (400), never a crash.
- No `/media` or `/preview` routes exist (404).

## Tests

```bash
python3 -m unittest discover -s apps/convert/tests -v
python3 -m unittest discover -s apps/ingest/tests -v
```
