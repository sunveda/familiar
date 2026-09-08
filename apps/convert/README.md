# convert (stub)

Intended pipeline: diarize / select speaker → voice convert → face swap / reenactment → mux.

**This package does not load models, embeddings, or media.** There is no face or voice pipeline here.

## Fail closed

A convert job may be queued only when:

- `familyId` matches the enrollment and consent record
- Enrollment status is `active`
- Linked `ConsentRecord` is unrevoked and includes `inference_on_family_content`
- `targetEnrollmentId` is set (enrolled parent in that family only)

Otherwise the stub raises `ConvertRefused`. This function **mirrors** canonical `convertJobMayRun` — see [docs/consent-gate.md](../../docs/consent-gate.md).

A disabled abuse/rate-limit hook may run **after** the consent gate. It cannot allow a refused job. Real detection is not implemented.

OPEN: whether the requester must be the enrollment subject is undecided; this stub does not compare those ids.

## Layout

```
src/familiar_convert/pipeline.py
tests/test_pipeline.py
```
