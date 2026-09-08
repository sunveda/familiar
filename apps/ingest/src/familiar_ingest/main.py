"""Placeholder ingest API.

Does not fetch URLs, write files, or touch biometric data.
HTTP tenancy uses the shared stub (`x-family-id`, `x-guardian-id`). Not an IdP.
"""

from __future__ import annotations

from dataclasses import dataclass

from familiar_ingest.jobs import IngestError, create_ingest_job_in_store
from familiar_ingest.store import create_memory_store


@dataclass(frozen=True)
class IngestRequest:
    family_id: str
    guardian_id: str
    source_ref: str


def create_ingest_job(request: IngestRequest) -> dict[str, object]:
    """Validate tenancy + external sourceRef and return a queued job descriptor.

    Real implementations must stage media outside the git tree.
    """
    store = create_memory_store()
    result = create_ingest_job_in_store(
        store,
        family_id=request.family_id,
        guardian_id=request.guardian_id,
        source_ref=request.source_ref,
    )
    if not result["ok"]:
        raise IngestError(
            f"ingest refused: {result['errorCode']}",
            error_code=str(result["errorCode"]),
        )
    return result["value"]
