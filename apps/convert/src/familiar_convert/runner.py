"""Convert runner: consent gate first, backend second.

`run_convert_job` re-evaluates the fail-closed gate (`queue_convert_job`, the
mirror of TS `convertJobMayRun`) against current store state **before every
backend call**, so a revoke between queue and run (or between stages) stops
the job. A refused gate cancels the job (queued|running -> cancelled), records
`convert_refused`, and never invokes the backend. No ML, no media.

Status flow stays: queued -> running -> needs_review | failed | cancelled.
"""

from __future__ import annotations

from typing import Any

from familiar_convert.backend import (
    ConvertBackend,
    StageContext,
    StageResult,
    validate_stage_result,
)
from familiar_convert.jobs import (
    JobResult,
    _fail,
    _intended_audit,
    _now,
    _ok,
    cancel_convert_job,
    complete_convert_job,
    fail_convert_job,
    get_family_job,
    start_convert_job,
)
from familiar_convert.pipeline import (
    ConvertAbuseHook,
    ConvertRefused,
    ConvertRequest,
    queue_convert_job,
)
from familiar_convert.store import ConvertStore, Job


def _gate(
    store: ConvertStore,
    job: Job,
    abuse_hook: ConvertAbuseHook | None,
) -> str | None:
    """Return None if the job may run, else a short refusal reason code."""
    target = str(job.get("targetEnrollmentId") or "").strip()
    if not target:
        return "missing_target_enrollment"
    if store.get_kid_profile(target) is not None:
        return "kid_profile_not_target"
    enrollment = store.get_enrollment(target)
    if enrollment is None:
        return "enrollment_missing"
    consent = store.get_consent(str(enrollment.get("consentRecordId") or ""))
    if consent is None:
        return "consent_missing"
    request = ConvertRequest(
        family_id=str(job["familyId"]),
        guardian_id=str(job["requestedByGuardianId"]),
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
        queue_convert_job(request, abuse_hook=abuse_hook)
    except ConvertRefused:
        return "convertJobMayRun"
    return None


def _refuse(
    store: ConvertStore, job: Job, reason: str, stamp: str, family_id: str
) -> JobResult:
    cancel_convert_job(store, str(job["id"]), family_id=family_id, at=stamp)
    event = _intended_audit(
        "convert_refused",
        job,
        str(job["requestedByGuardianId"]),
        stamp,
        {"reason": reason, "targetEnrollmentId": str(job.get("targetEnrollmentId") or "")},
    )
    store.record_intended_audit(event)
    store_job = store.get_job(str(job["id"]))
    if store_job is not None:
        store_job["errorCode"] = "convert_refused"
        store.put_job(store_job)
    return {**_fail("convert_refused"), "intendedAudit": event}


def run_convert_job(
    store: ConvertStore,
    job_id: str,
    backend: ConvertBackend,
    *,
    family_id: str,
    abuse_hook: ConvertAbuseHook | None = None,
    at: str | None = None,
) -> JobResult:
    """Run voice then face stage for a queued convert job, gate-first."""
    found = get_family_job(store, job_id, family_id)
    if not found["ok"]:
        return found
    job = found["value"]
    if job["status"] != "queued":
        return _fail("illegal_job_status")
    stamp = _now(at)

    reason = _gate(store, job, abuse_hook)
    if reason is not None:
        return _refuse(store, job, reason, stamp, family_id)

    started = start_convert_job(store, job_id, family_id=family_id, at=stamp)
    if not started["ok"]:
        return started
    job = started["value"]

    results: list[StageResult] = []
    for stage in ("voice", "face"):
        # Re-check immediately before each backend call (revoke mid-run).
        reason = _gate(store, job, abuse_hook)
        if reason is not None:
            return _refuse(store, job, reason, stamp, family_id)
        ctx = StageContext(
            job_id=str(job["id"]),
            family_id=str(job["familyId"]),
            enrollment_id=str(job["targetEnrollmentId"]),
            source_ref=job.get("sourceRef"),
            stage=stage,  # type: ignore[arg-type]
        )
        try:
            raw: Any = backend.voice_stage(ctx) if stage == "voice" else backend.face_stage(ctx)
            results.append(validate_stage_result(raw, stage))  # type: ignore[arg-type]
        except Exception:  # noqa: BLE001 - code only; never leak backend messages
            code = f"backend_{stage}_failed"
            fail_convert_job(store, job_id, family_id=family_id, error_code=code, at=stamp)
            return _fail(code)

    done = complete_convert_job(store, job_id, family_id=family_id, at=stamp)
    if not done["ok"]:
        return done
    return _ok({"job": done["value"], "stages": results})
