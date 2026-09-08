"""Ingest stub tests (stdlib unittest)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(ROOT))

from familiar_ingest.main import IngestError, IngestRequest, create_ingest_job


class CreateIngestJobTests(unittest.TestCase):
    def test_queues_family_scoped_job(self) -> None:
        job = create_ingest_job(
            IngestRequest(family_id="fam_1", guardian_id="grd_1", source_ref="library:demo")
        )
        self.assertEqual(job["kind"], "ingest")
        self.assertEqual(job["status"], "queued")
        self.assertEqual(job["targetEnrollmentId"], "")

    def test_requires_family_and_guardian(self) -> None:
        with self.assertRaises(IngestError):
            create_ingest_job(IngestRequest(family_id="", guardian_id="grd_1", source_ref="x"))


if __name__ == "__main__":
    unittest.main()
