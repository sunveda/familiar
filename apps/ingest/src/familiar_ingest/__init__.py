"""Ingest stub. No downloads, transcoding, or media I/O."""

from familiar_ingest.auth import (
    AuthContext,
    assert_same_family,
    resolve_auth_context,
    resolve_auth_context_from_headers,
)
from familiar_ingest.http import create_handler
from familiar_ingest.jobs import (
    IngestError,
    create_ingest_job_in_store,
    fail_ingest_job,
    get_family_job,
    list_family_ingest_jobs,
    queue_convert_from_ingest,
    stage_ingest_job,
)
from familiar_ingest.main import IngestRequest, create_ingest_job
from familiar_ingest.source_ref import is_external_source_ref
from familiar_ingest.store import IngestStore, create_memory_store

__all__ = [
    "AuthContext",
    "IngestError",
    "IngestRequest",
    "IngestStore",
    "create_handler",
    "create_ingest_job",
    "create_ingest_job_in_store",
    "create_memory_store",
    "fail_ingest_job",
    "get_family_job",
    "is_external_source_ref",
    "list_family_ingest_jobs",
    "queue_convert_from_ingest",
    "resolve_auth_context",
    "resolve_auth_context_from_headers",
    "assert_same_family",
    "stage_ingest_job",
]
