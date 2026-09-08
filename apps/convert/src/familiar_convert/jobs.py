"""Family-scoped convert job stubs.

Queue uses the Python mirror of canonical TS `convertJobMayRun`
(`queue_convert_job`). Status transitions are metadata-only — no inference,
models, or media. Success lands in `needs_review` for guardian review-api.
"""

from __future__ import annotations

from typing import Any

from familiar_convert.auth import resolve_auth_context
from familiar_convert.pipeline import ConvertRefused, ConvertRequest, queue_convert_job
from familiar_convert.store import ConvertStore, Job

JobResult = dict[str, Any]


def _fail(error_code: str) -> JobResult:
    return {"ok": False, "errorCode": error_code}


def _ok(value: Any) -> JobResult:
    return {"ok": True, "value": value}


def _now(at: str | None) -> str:
    return at if at is not None else "2026-01-01T00:00:00.000Z"


def _intended_audit(
    kind: str,
    job: Job,
    actor_guardian_id: str | None,
    at: str,
    metadata: dict[str, Any],
) -> dict[str, Any]:
    return {
        "id": f"audit_intended_{kind}_{job['id']}",
        "familyId": job["familyId"],
        "actorGuardianId": actor_guardian_id,
        "kind": kind,
        "at": at,
        "subjectRef": job["id"],
        "metadata": metadata,
    }


def _as_convert_job(store: ConvertStore, job_id: str, family_id: str | None) -> JobResult:
    job = store.get_job(job_id)
    if not job or job.get("kind") != "convert":
        return _fail("not_found")
    if family_id is not None and job["familyId"] != family_id:
        return _fail("wrong_family")
    return _ok(job)


def list_family_convert_jobs(store: ConvertStore, family_id: str) -> list[Job]:
    return store.list_jobs(family_id, kind="convert")


def get_family_job(store: ConvertStore, job_id: str, family_id: str | None = None) -> JobResult:
    return _as_convert_job(store, job_id, family_id)


def queue_convert_job_in_store(
    store: ConvertStore,
    *,
    family_id: str,
    guardian_id: str,
    target_enrollment_id: str | None,
    source_ref: str | None = None,
    at: str | None = None,
    job_id: str | None = None,
) -> JobResult:
    """Queue a convert job only with explicit targetEnrollmentId + gate pass.

    KidProfile ids are never enrollment targets. No ML.
    """
    auth = resolve_auth_context(guardian_id=guardian_id, family_id=family_id)
    if not auth["ok"]:
        return _fail(str(auth["errorCode"]))
    ctx = auth["context"]
    family_id = ctx.family_id
    guardian_id = ctx.guardian_id

    target = (target_enrollment_id or "").strip()
    if not target:
        return _fail("missing_target_enrollment")

    kid = store.get_kid_profile(target)
    if kid is not None:
        return _fail("kid_profile_not_target")

    stamp = _now(at)
    convert_id = job_id or store.next_id("convert")

    enrollment = store.get_enrollment(target)
    if enrollment is None:
        refused_job: Job = {
            "id": convert_id,
            "familyId": family_id,
            "requestedByGuardianId": guardian_id,
            "kind": "convert",
            "status": "queued",
            "targetEnrollmentId": target,
            "sourceRef": source_ref,
            "createdAt": stamp,
            "updatedAt": stamp,
            "errorCode": "convert_refused",
        }
        event = _intended_audit(
            "convert_refused",
            refused_job,
            guardian_id,
            stamp,
            {"reason": "enrollment_missing", "targetEnrollmentId": target},
        )
        store.record_intended_audit(event)
        return {**_fail("convert_refused"), "intendedAudit": event}

    consent_id = str(enrollment.get("consentRecordId") or "")
    consent = store.get_consent(consent_id)
    if consent is None:
        refused_job = {
            "id": convert_id,
            "familyId": family_id,
            "requestedByGuardianId": guardian_id,
            "kind": "convert",
            "status": "queued",
            "targetEnrollmentId": target,
            "sourceRef": source_ref,
            "createdAt": stamp,
            "updatedAt": stamp,
            "errorCode": "convert_refused",
        }
        event = _intended_audit(
            "convert_refused",
            refused_job,
            guardian_id,
            stamp,
            {"reason": "consent_missing", "targetEnrollmentId": target},
        )
        store.record_intended_audit(event)
        return {**_fail("convert_refused"), "intendedAudit": event}

    request = ConvertRequest(
        family_id=family_id,
        guardian_id=guardian_id,
        enrollment_id=str(enrollment["id"]),
        enrollment_family_id=str(enrollment["familyId"]),
        enrollment_status=str(enrollment["status"]),
        consent_id=str(consent["id"]),
        consent_family_id=str(consent["familyId"]),
        consent_revoked=consent.get("revokedAt") is not None,
        consent_scopes=tuple(consent.get("scopes") or ()),
        enrollment_consent_id=str(enrollment.get("consentRecordId") or ""),
    )

    try:
        queued = queue_convert_job(request)
    except ConvertRefused:
        refused_job = {
            "id": convert_id,
            "familyId": family_id,
            "requestedByGuardianId": guardian_id,
            "kind": "convert",
            "status": "queued",
            "targetEnrollmentId": target,
            "sourceRef": source_ref,
            "createdAt": stamp,
            "updatedAt": stamp,
            "errorCode": "convert_refused",
        }
        event = _intended_audit(
            "convert_refused",
            refused_job,
            guardian_id,
            stamp,
            {"reason": "convertJobMayRun", "targetEnrollmentId": target},
        )
        store.record_intended_audit(event)
        return {**_fail("convert_refused"), "intendedAudit": event}

    convert_job: Job = {
        "id": convert_id,
        "familyId": queued["familyId"],
        "requestedByGuardianId": queued["requestedByGuardianId"],
        "kind": "convert",
        "status": queued["status"],
        "targetEnrollmentId": queued["targetEnrollmentId"],
        "sourceRef": source_ref,
        "createdAt": stamp,
        "updatedAt": stamp,
        "errorCode": None,
    }
    store.put_job(convert_job)
    event = _intended_audit(
        "convert_queued",
        convert_job,
        guardian_id,
        stamp,
        {"targetEnrollmentId": target},
    )
    store.record_intended_audit(event)
    return _ok({"job": convert_job, "intendedAudit": event})


def start_convert_job(
    store: ConvertStore,
    job_id: str,
    *,
    family_id: str | None = None,
    at: str | None = None,
) -> JobResult:
    """queued → running. No inference."""
    result = _as_convert_job(store, job_id, family_id)
    if not result["ok"]:
        return result
    job = result["value"]
    if job["status"] != "queued":
        return _fail("illegal_job_status")
    next_job = dict(job)
    next_job["status"] = "running"
    next_job["updatedAt"] = _now(at)
    store.put_job(next_job)
    return _ok(next_job)


def complete_convert_job(
    store: ConvertStore,
    job_id: str,
    *,
    family_id: str | None = None,
    at: str | None = None,
) -> JobResult:
    """running → needs_review. Success stub for guardian review-api. No ML."""
    result = _as_convert_job(store, job_id, family_id)
    if not result["ok"]:
        return result
    job = result["value"]
    if job["status"] != "running":
        return _fail("illegal_job_status")
    next_job = dict(job)
    next_job["status"] = "needs_review"
    next_job["updatedAt"] = _now(at)
    store.put_job(next_job)
    return _ok(next_job)


def fail_convert_job(
    store: ConvertStore,
    job_id: str,
    *,
    family_id: str | None = None,
    error_code: str = "convert_failed",
    at: str | None = None,
) -> JobResult:
    """running → failed. Stub failure path (no inference)."""
    result = _as_convert_job(store, job_id, family_id)
    if not result["ok"]:
        return result
    job = result["value"]
    if job["status"] != "running":
        return _fail("illegal_job_status")
    next_job = dict(job)
    next_job["status"] = "failed"
    next_job["errorCode"] = error_code
    next_job["updatedAt"] = _now(at)
    store.put_job(next_job)
    return _ok(next_job)


def cancel_convert_job(
    store: ConvertStore,
    job_id: str,
    *,
    family_id: str | None = None,
    at: str | None = None,
) -> JobResult:
    """queued | running → cancelled. Review/terminal statuses are not cancellable."""
    result = _as_convert_job(store, job_id, family_id)
    if not result["ok"]:
        return result
    job = result["value"]
    if job["status"] not in {"queued", "running"}:
        return _fail("illegal_job_status")
    next_job = dict(job)
    next_job["status"] = "cancelled"
    next_job["updatedAt"] = _now(at)
    store.put_job(next_job)
    return _ok(next_job)
