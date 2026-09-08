# convert (stub)

Intended pipeline: diarize / select speaker → voice convert → face swap / reenactment → mux.

**This package does not load models, embeddings, or media.** There is no face or voice pipeline here.

## Fail closed

A convert job may be queued only when:

- `familyId` matches the enrollment and consent record
- Enrollment status is `active`
- Linked `ConsentRecord` is unrevoked and includes `inference_on_family_content`
- `targetEnrollmentId` is set (enrolled parent in that family only)

Otherwise the stub raises `ConvertRefused`. See [docs/consent.md](../../docs/consent.md).

## Layout

```
src/familiar_convert/pipeline.py
tests/test_pipeline.py
```
