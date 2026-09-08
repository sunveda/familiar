"""In-memory convert stub store. Not production persistence. No media or models."""

from __future__ import annotations

from typing import Any

Job = dict[str, Any]
Enrollment = dict[str, Any]
Consent = dict[str, Any]
KidProfile = dict[str, Any]
AuditEvent = dict[str, Any]


class ConvertStore:
    """Family-scoped job/enrollment maps. Convert never writes files here."""

    def __init__(
        self,
        *,
        jobs: list[Job] | None = None,
        enrollments: list[Enrollment] | None = None,
        consents: list[Consent] | None = None,
        kid_profiles: list[KidProfile] | None = None,
    ) -> None:
        self._jobs: dict[str, Job] = {}
        self._enrollments: dict[str, Enrollment] = {}
        self._consents: dict[str, Consent] = {}
        self._kid_profiles: dict[str, KidProfile] = {}
        self._audits: list[AuditEvent] = []
        self._seq = 0

        for job in jobs or []:
            self._jobs[str(job["id"])] = dict(job)
        for enrollment in enrollments or []:
            self._enrollments[str(enrollment["id"])] = dict(enrollment)
        for consent in consents or []:
            self._consents[str(consent["id"])] = dict(consent)
        for kid in kid_profiles or []:
            self._kid_profiles[str(kid["id"])] = dict(kid)

    def next_id(self, prefix: str) -> str:
        self._seq += 1
        return f"{prefix}_{self._seq}"

    def list_jobs(self, family_id: str, *, kind: str | None = None) -> list[Job]:
        out: list[Job] = []
        for job in self._jobs.values():
            if job.get("familyId") != family_id:
                continue
            if kind is not None and job.get("kind") != kind:
                continue
            out.append(dict(job))
        return out

    def get_job(self, job_id: str) -> Job | None:
        job = self._jobs.get(job_id)
        return dict(job) if job else None

    def put_job(self, job: Job) -> None:
        self._jobs[str(job["id"])] = dict(job)

    def get_enrollment(self, enrollment_id: str) -> Enrollment | None:
        row = self._enrollments.get(enrollment_id)
        return dict(row) if row else None

    def put_enrollment(self, enrollment: Enrollment) -> None:
        self._enrollments[str(enrollment["id"])] = dict(enrollment)

    def get_consent(self, consent_id: str) -> Consent | None:
        row = self._consents.get(consent_id)
        return dict(row) if row else None

    def put_consent(self, consent: Consent) -> None:
        self._consents[str(consent["id"])] = dict(consent)

    def get_kid_profile(self, kid_profile_id: str) -> KidProfile | None:
        row = self._kid_profiles.get(kid_profile_id)
        return dict(row) if row else None

    def put_kid_profile(self, kid: KidProfile) -> None:
        self._kid_profiles[str(kid["id"])] = dict(kid)

    def record_intended_audit(self, event: AuditEvent) -> None:
        self._audits.append(dict(event))

    def intended_audits(self) -> list[AuditEvent]:
        return [dict(event) for event in self._audits]


def create_memory_store(**seed: Any) -> ConvertStore:
    return ConvertStore(**seed)
