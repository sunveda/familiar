/**
 * Ingest → convert handoff: explicit targetEnrollmentId + convertJobMayRun.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createAuditLog } from './audit';
import { queueConvertFromIngest } from './ingest-handoff';
import type { ConsentRecord, Enrollment, Job, KidProfile } from './types';

const at = '2026-01-01T00:00:00.000Z';

function ingestJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'ing_1',
    familyId: 'fam_1',
    requestedByGuardianId: 'grd_1',
    kind: 'ingest',
    status: 'staged',
    targetEnrollmentId: null,
    sourceRef: 'library:demo',
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
    deletedAt: null,
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

function kid(): KidProfile {
  return {
    id: 'kid_1',
    familyId: 'fam_1',
    displayName: 'A',
    managedByGuardianId: 'grd_1',
    createdAt: at,
    updatedAt: at,
    status: 'active',
  };
}

describe('queueConvertFromIngest', () => {
  test('queues convert when staged ingest + explicit active consented enrollment', () => {
    const result = queueConvertFromIngest({
      ingestJob: ingestJob(),
      targetEnrollmentId: 'enr_1',
      enrollment: enrollment(),
      consent: consent(),
      kidProfile: undefined,
      requestedByGuardianId: 'grd_a',
      at,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.job.kind, 'convert');
      assert.equal(result.job.status, 'queued');
      assert.equal(result.job.targetEnrollmentId, 'enr_1');
      assert.equal(result.job.sourceRef, 'library:demo');
      assert.equal(result.job.requestedByGuardianId, 'grd_a');
      assert.equal(result.intendedAudit.kind, 'convert_queued');
    }
  });

  test('refuses missing targetEnrollmentId (no auto convert)', () => {
    const result = queueConvertFromIngest({
      ingestJob: ingestJob(),
      targetEnrollmentId: null,
      enrollment: enrollment(),
      consent: consent(),
      kidProfile: undefined,
      requestedByGuardianId: 'grd_1',
      at,
    });
    assert.deepEqual(result, { ok: false, errorCode: 'missing_target_enrollment' });
  });

  test('refuses empty targetEnrollmentId', () => {
    const result = queueConvertFromIngest({
      ingestJob: ingestJob(),
      targetEnrollmentId: '  ',
      enrollment: enrollment(),
      consent: consent(),
      kidProfile: undefined,
      requestedByGuardianId: 'grd_1',
      at,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errorCode, 'missing_target_enrollment');
    }
  });

  test('refuses convert before ingest is staged', () => {
    const result = queueConvertFromIngest({
      ingestJob: ingestJob({ status: 'queued' }),
      targetEnrollmentId: 'enr_1',
      enrollment: enrollment(),
      consent: consent(),
      kidProfile: undefined,
      requestedByGuardianId: 'grd_1',
      at,
    });
    assert.deepEqual(result, { ok: false, errorCode: 'illegal_job_status' });
  });

  test('refuses missing enrollment (fail closed)', () => {
    const result = queueConvertFromIngest({
      ingestJob: ingestJob(),
      targetEnrollmentId: 'enr_missing',
      enrollment: undefined,
      consent: consent(),
      kidProfile: undefined,
      requestedByGuardianId: 'grd_1',
      at,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errorCode, 'convert_refused');
      assert.equal(result.intendedAudit?.kind, 'convert_refused');
    }
  });

  test('refuses revoked enrollment via convertJobMayRun', () => {
    const result = queueConvertFromIngest({
      ingestJob: ingestJob(),
      targetEnrollmentId: 'enr_1',
      enrollment: enrollment({ status: 'revoked', revokedAt: at }),
      consent: consent(),
      kidProfile: undefined,
      requestedByGuardianId: 'grd_1',
      at,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errorCode, 'convert_refused');
    }
  });

  test('refuses revoked consent via convertJobMayRun', () => {
    const result = queueConvertFromIngest({
      ingestJob: ingestJob(),
      targetEnrollmentId: 'enr_1',
      enrollment: enrollment(),
      consent: consent({ revokedAt: at }),
      kidProfile: undefined,
      requestedByGuardianId: 'grd_1',
      at,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errorCode, 'convert_refused');
    }
  });

  test('refuses wrong family', () => {
    const result = queueConvertFromIngest({
      ingestJob: ingestJob(),
      targetEnrollmentId: 'enr_1',
      enrollment: enrollment(),
      consent: consent(),
      kidProfile: undefined,
      familyId: 'fam_other',
      requestedByGuardianId: 'grd_1',
      at,
    });
    assert.deepEqual(result, { ok: false, errorCode: 'wrong_family' });
  });

  test('refuses KidProfile as convert target', () => {
    const result = queueConvertFromIngest({
      ingestJob: ingestJob(),
      targetEnrollmentId: 'kid_1',
      enrollment: undefined,
      consent: undefined,
      kidProfile: kid(),
      requestedByGuardianId: 'grd_1',
      at,
    });
    assert.deepEqual(result, { ok: false, errorCode: 'kid_profile_not_target' });
  });

  test('refuses missing ingest job', () => {
    const result = queueConvertFromIngest({
      ingestJob: undefined,
      targetEnrollmentId: 'enr_1',
      enrollment: enrollment(),
      consent: consent(),
      kidProfile: undefined,
      requestedByGuardianId: 'grd_1',
      at,
    });
    assert.deepEqual(result, { ok: false, errorCode: 'not_found' });
  });

  test('appends convert_queued / convert_refused and refuses cross-family reads', () => {
    const log = createAuditLog();
    const queued = queueConvertFromIngest({
      ingestJob: ingestJob(),
      targetEnrollmentId: 'enr_1',
      enrollment: enrollment(),
      consent: consent(),
      kidProfile: undefined,
      requestedByGuardianId: 'grd_a',
      at,
      convertJobId: 'cvt_from_ing',
      auditLog: log,
    });
    assert.equal(queued.ok, true);

    const refused = queueConvertFromIngest({
      ingestJob: ingestJob({ id: 'ing_2', familyId: 'fam_2' }),
      targetEnrollmentId: 'enr_1',
      enrollment: enrollment({ familyId: 'fam_1' }),
      consent: consent({ familyId: 'fam_1' }),
      kidProfile: undefined,
      requestedByGuardianId: 'grd_2',
      at,
      convertJobId: 'cvt_refused',
      auditLog: log,
    });
    assert.equal(refused.ok, false);

    const fam1 = log.listByFamily('fam_1');
    const fam2 = log.listByFamily('fam_2');
    assert.equal(fam1.length, 1);
    assert.equal(fam1[0]?.kind, 'convert_queued');
    assert.equal(fam2.length, 1);
    assert.equal(fam2[0]?.kind, 'convert_refused');
    assert.equal(
      fam1.some((item) => item.familyId === 'fam_2'),
      false,
    );
  });
});
