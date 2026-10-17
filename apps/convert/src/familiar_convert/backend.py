"""Pluggable convert backend interface (voice stage, then face stage).

Metadata only. A backend receives opaque ids and an opaque external
`source_ref` and returns small primitive metadata. It never receives or
returns media bytes, embeddings, or model weights, and this module loads
nothing. Real ML backends are future work; they must be reached only through
`familiar_convert.runner.run_convert_job`, which runs the consent gate first.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol, runtime_checkable

from familiar_convert.audit import is_forbidden_audit_key

Stage = Literal["voice", "face"]
StageMetadata = dict[str, str | int | float | bool | None]


@dataclass(frozen=True)
class StageContext:
    """Opaque inputs for one stage. No media, no embeddings, no paths."""

    job_id: str
    family_id: str
    enrollment_id: str
    source_ref: str | None
    stage: Stage


@dataclass(frozen=True)
class StageResult:
    stage: Stage
    backend: str
    metadata: StageMetadata = field(default_factory=dict)


@runtime_checkable
class ConvertBackend(Protocol):
    """Explicit stages: voice conversion first, then face swap/reenactment."""

    name: str

    def voice_stage(self, ctx: StageContext) -> StageResult: ...

    def face_stage(self, ctx: StageContext) -> StageResult: ...


class InvalidStageResult(ValueError):
    """Backend returned something that is not metadata-only."""


def validate_stage_result(result: Any, expected_stage: Stage) -> StageResult:
    if not isinstance(result, StageResult) or result.stage != expected_stage:
        raise InvalidStageResult("unexpected stage result")
    for key, value in result.metadata.items():
        if is_forbidden_audit_key(str(key)):
            raise InvalidStageResult("forbidden metadata key")
        if value is not None and not isinstance(value, (str, int, float, bool)):
            raise InvalidStageResult("non-primitive metadata value")
    return result


class MockBackend:
    """Deterministic placeholder. Returns metadata only; no media, no ML."""

    name = "mock"

    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def _run(self, ctx: StageContext) -> StageResult:
        self.calls.append((ctx.stage, ctx.job_id))
        digest = hashlib.sha256(
            f"{ctx.stage}|{ctx.job_id}|{ctx.family_id}|{ctx.enrollment_id}|{ctx.source_ref}".encode()
        ).hexdigest()
        return StageResult(
            stage=ctx.stage,
            backend=self.name,
            metadata={
                "placeholder": True,
                "stage": ctx.stage,
                "placeholderDigest": digest[:16],
            },
        )

    def voice_stage(self, ctx: StageContext) -> StageResult:
        return self._run(ctx)

    def face_stage(self, ctx: StageContext) -> StageResult:
        return self._run(ctx)
