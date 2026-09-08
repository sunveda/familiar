/**
 * Unit tests for the canonical convert gate (`convertJobMayRun`).
 *
 * Shared cases: ../fixtures/convert-gate-cases.json (mirrored in Python).
 * Removing or skipping these tests when ML lands is a regression.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { convertJobMayRun, type ConsentRecord, type Enrollment, type Job } from './types';

interface ConvertGateCase {
  id: string;
  expectMayRun: boolean;
  appliesTo: string[];
  notes: string;
  job: Job;
  enrollment: Enrollment;
  consent: ConsentRecord;
}

interface ConvertGateFixture {
  cases: ConvertGateCase[];
}

const fixturePath = join(__dirname, '..', 'fixtures', 'convert-gate-cases.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as ConvertGateFixture;

const at = '2026-01-01T00:00:00.000Z';

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job_1',
    familyId: 'fam_1',
    requestedByGuardianId: 'grd_1',
    kind: 'convert',
    status: 'queued',
    targetEnrollmentId: 'enr_1',
    sourceRef: null,
    createdAt: at,
    updatedAt: at,
    errorCode: null,
    ...overrides,
  };
}

function enrollment(overrides: Partial<Enrollment> = {}): Enrollment {
  return {
    id: 'enr_1',
    familyId: 'fam_1',
    guardianId: 'grd_1',
    consentRecordId: 'cns_1',
    modality: 'voice_and_face',
    status: 'active',
    artifactRef: null,
    createdAt: at,
    revokedAt: null,
    ...overrides,
  };
}

function consent(overrides: Partial<ConsentRecord> = {}): ConsentRecord {
  return {
    id: 'cns_1',
    familyId: 'fam_1',
    guardianId: 'grd_1',
    policyVersion: 'stub-0',
    grantedAt: at,
    revokedAt: null,
    affirmationMethod: 'explicit_ui',
    scopes: ['voice_enrollment', 'face_enrollment', 'inference_on_family_content'],
    ...overrides,
  };
}

describe('convertJobMayRun (shared fixture)', () => {
  for (const gateCase of fixture.cases) {
    if (!gateCase.appliesTo.includes('typescript')) {
      continue;
    }
    test(`${gateCase.id}: ${gateCase.notes}`, () => {
      assert.equal(
        convertJobMayRun(gateCase.job, gateCase.enrollment, gateCase.consent),
        gateCase.expectMayRun,
      );
    });
  }
});

describe('convertJobMayRun (explicit)', () => {
  test('allows consented active enrollment', () => {
    assert.equal(convertJobMayRun(job(), enrollment(), consent()), true);
  });

  test('refuses revoked enrollment', () => {
    assert.equal(
      convertJobMayRun(job(), enrollment({ status: 'revoked', revokedAt: at }), consent()),
      false,
    );
  });

  test('refuses missing inference_on_family_content scope', () => {
    assert.equal(
      convertJobMayRun(
        job(),
        enrollment(),
        consent({ scopes: ['voice_enrollment', 'face_enrollment'] }),
      ),
      false,
    );
  });

  test('allows same-family guardian A targeting guardian B explicit enrollment', () => {
    assert.equal(
      convertJobMayRun(
        job({ requestedByGuardianId: 'grd_a' }),
        enrollment({ guardianId: 'grd_b' }),
        consent({ guardianId: 'grd_b' }),
      ),
      true,
    );
  });

  test('refuses cross-family enrollment selection', () => {
    assert.equal(convertJobMayRun(job(), enrollment({ familyId: 'fam_other' }), consent()), false);
  });

  test('refuses missing targetEnrollmentId selection', () => {
    assert.equal(
      convertJobMayRun(job({ targetEnrollmentId: null }), enrollment(), consent()),
      false,
    );
  });
});
