"""Convert stub. No models, embeddings, or media processing."""

from familiar_convert.auth import (
    AuthContext,
    assert_same_family,
    resolve_auth_context,
    resolve_auth_context_from_headers,
)
from familiar_convert.http import create_handler
from familiar_convert.jobs import (
    cancel_convert_job,
    complete_convert_job,
    fail_convert_job,
    get_family_job,
    list_family_convert_jobs,
    queue_convert_job_in_store,
    start_convert_job,
)
from familiar_convert.pipeline import (
    ConvertAbuseHook,
    ConvertRefused,
    ConvertRequest,
    DisabledConvertAbuseHook,
    queue_convert_job,
)
from familiar_convert.store import ConvertStore, create_memory_store

__all__ = [
    "AuthContext",
    "ConvertAbuseHook",
    "ConvertRefused",
    "ConvertRequest",
    "ConvertStore",
    "DisabledConvertAbuseHook",
    "assert_same_family",
    "cancel_convert_job",
    "complete_convert_job",
    "create_handler",
    "create_memory_store",
    "fail_convert_job",
    "get_family_job",
    "list_family_convert_jobs",
    "queue_convert_job",
    "queue_convert_job_in_store",
    "resolve_auth_context",
    "resolve_auth_context_from_headers",
    "start_convert_job",
]
