/**
 * Convert queue stubs: explicit targetEnrollmentId + convertJobMayRun.
 * Status path is queued → running → needs_review (no ML).
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createAuditLog } from './audit';
import {
  cancelConvertJob,
  completeConvertJob,
  failConvertJob,
  queueConvertJob,
  startConvertJob,
} from './convert-queue';
import type { ConsentRecord, Enrollment, KidProfile } from './types';

const at = '2026-01-01T00:00:00.000Z';

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

describe('queueConvertJob', () => {
  test('allows explicit in-family target (requester may differ from enrollment subject)', () => {
    const result = queueConvertJob({
      familyId: 'fam_1',
      requestedByGuardianId: 'grd_a',
      targetEnrollmentId: 'enr_1',
      enrollment: enrollment(),
      consent: consent(),
      kidProfile: undefined,
      at,
      convertJobId: 'cvt_1',
    });
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.job.kind, 'convert');
    assert.equal(result.job.status, 'queued');
    assert.equal(result.job.targetEnrollmentId, 'enr_1');
    assert.equal(result.job.requestedByGuardianId, 'grd_a');
    assert.equal(result.intendedAudit.kind, 'convert_queued');
  });

  test('refuses missing targetEnrollmentId', () => {
    const result = queueConvertJob({
      familyId: 'fam_1',
      requestedByGuardianId: 'grd_1',
      targetEnrollmentId: null,
      enrollment: enrollment(),
      consent: consent(),
      kidProfile: undefined,
      at,
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.errorCode, 'missing_target_enrollment');
  });

  test('refuses empty targetEnrollmentId', () => {
    const result = queueConvertJob({
      familyId: 'fam_1',
      requestedByGuardianId: 'grd_1',
      targetEnrollmentId: '  ',
      enrollment: enrollment(),
      consent: consent(),
      kidProfile: undefined,
      at,
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.errorCode, 'missing_target_enrollment');
  });

  test('refuses revoked enrollment', () => {
    const result = queueConvertJob({
      familyId: 'fam_1',
      requestedByGuardianId: 'grd_1',
      targetEnrollmentId: 'enr_1',
      enrollment: enrollment({ status: 'revoked', revokedAt: at }),
      consent: consent(),
      kidProfile: undefined,
      at,
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.errorCode, 'convert_refused');
    assert.equal(result.intendedAudit?.kind, 'convert_refused');
  });

  test('refuses revoked consent', () => {
    const result = queueConvertJob({
      familyId: 'fam_1',
      requestedByGuardianId: 'grd_1',
      targetEnrollmentId: 'enr_1',
      enrollment: enrollment(),
      consent: consent({ revokedAt: at }),
      kidProfile: undefined,
      at,
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.errorCode, 'convert_refused');
  });

  test('refuses wrong-family enrollment', () => {
    const result = queueConvertJob({
      familyId: 'fam_1',
      requestedByGuardianId: 'grd_1',
      targetEnrollmentId: 'enr_1',
      enrollment: enrollment({ familyId: 'fam_other' }),
      consent: consent(),
      kidProfile: undefined,
      at,
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.errorCode, 'convert_refused');
  });

  test('refuses KidProfile as target', () => {
    const result = queueConvertJob({
      familyId: 'fam_1',
      requestedByGuardianId: 'grd_1',
      targetEnrollmentId: 'kid_1',
      enrollment: undefined,
      consent: undefined,
      kidProfile: kid(),
      at,
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.errorCode, 'kid_profile_not_target');
  });

  test('refuses insufficient inference scope', () => {
    const result = queueConvertJob({
      familyId: 'fam_1',
      requestedByGuardianId: 'grd_1',
      targetEnrollmentId: 'enr_1',
      enrollment: enrollment(),
      consent: consent({ scopes: ['voice_enrollment', 'face_enrollment'] }),
      kidProfile: undefined,
      at,
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.errorCode, 'convert_refused');
  });
});

describe('convert status stubs (no ML)', () => {
  test('queued → running → needs_review', () => {
    const queued = queueConvertJob({
      familyId: 'fam_1',
      requestedByGuardianId: 'grd_1',
      targetEnrollmentId: 'enr_1',
      enrollment: enrollment(),
      consent: consent(),
      kidProfile: undefined,
      at,
      convertJobId: 'cvt_1',
    });
    assert.equal(queued.ok, true);
    if (!queued.ok) {
      return;
    }
    const running = startConvertJob(queued.job, at);
    assert.equal(running.ok, true);
    if (!running.ok) {
      return;
    }
    assert.equal(running.job.status, 'running');
    const reviewed = completeConvertJob(running.job, at);
    assert.equal(reviewed.ok, true);
    if (!reviewed.ok) {
      return;
    }
    assert.equal(reviewed.job.status, 'needs_review');
  });

  test('running → failed', () => {
    const queued = queueConvertJob({
      familyId: 'fam_1',
      requestedByGuardianId: 'grd_1',
      targetEnrollmentId: 'enr_1',
      enrollment: enrollment(),
      consent: consent(),
      kidProfile: undefined,
      at,
      convertJobId: 'cvt_fail',
    });
    assert.equal(queued.ok, true);
    if (!queued.ok) {
      return;
    }
    const running = startConvertJob(queued.job, at);
    assert.equal(running.ok, true);
    if (!running.ok) {
      return;
    }
    const failed = failConvertJob(running.job, at, undefined, 'stub_failed');
    assert.equal(failed.ok, true);
    if (!failed.ok) {
      return;
    }
    assert.equal(failed.job.status, 'failed');
    assert.equal(failed.job.errorCode, 'stub_failed');
  });

  test('cancel is allowed for queued and running only', () => {
    const queued = queueConvertJob({
      familyId: 'fam_1',
      requestedByGuardianId: 'grd_1',
      targetEnrollmentId: 'enr_1',
      enrollment: enrollment(),
      consent: consent(),
      kidProfile: undefined,
      at,
      convertJobId: 'cvt_cancel',
    });
    assert.equal(queued.ok, true);
    if (!queued.ok) {
      return;
    }
    const cancelledQueued = cancelConvertJob(queued.job, at);
    assert.equal(cancelledQueued.ok, true);
    if (!cancelledQueued.ok) {
      return;
    }
    assert.equal(cancelledQueued.job.status, 'cancelled');

    const running = startConvertJob(queued.job, at);
    assert.equal(running.ok, true);
    if (!running.ok) {
      return;
    }
    const cancelledRunning = cancelConvertJob(running.job, at);
    assert.equal(cancelledRunning.ok, true);
    if (!cancelledRunning.ok) {
      return;
    }
    assert.equal(cancelledRunning.job.status, 'cancelled');

    const reviewed = completeConvertJob(running.job, at);
    assert.equal(reviewed.ok, true);
    if (!reviewed.ok) {
      return;
    }
    const cancelReview = cancelConvertJob(reviewed.job, at);
    assert.equal(cancelReview.ok, false);
    if (cancelReview.ok) {
      return;
    }
    assert.equal(cancelReview.errorCode, 'illegal_job_status');
  });

  test('wrong family on start is refused', () => {
    const queued = queueConvertJob({
      familyId: 'fam_1',
      requestedByGuardianId: 'grd_1',
      targetEnrollmentId: 'enr_1',
      enrollment: enrollment(),
      consent: consent(),
      kidProfile: undefined,
      at,
      convertJobId: 'cvt_fam',
    });
    assert.equal(queued.ok, true);
    if (!queued.ok) {
      return;
    }
    const result = startConvertJob(queued.job, at, 'fam_other');
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.errorCode, 'wrong_family');
  });
});

describe('queueConvertJob audit log', () => {
  test('appends convert_queued and convert_refused; listByFamily isolates', () => {
    const log = createAuditLog();
    const queued = queueConvertJob({
      familyId: 'fam_1',
      requestedByGuardianId: 'grd_a',
      targetEnrollmentId: 'enr_1',
      enrollment: enrollment(),
      consent: consent(),
      kidProfile: undefined,
      at,
      convertJobId: 'cvt_1',
      auditLog: log,
    });
    assert.equal(queued.ok, true);

    const refused = queueConvertJob({
      familyId: 'fam_2',
      requestedByGuardianId: 'grd_2',
      targetEnrollmentId: 'enr_1',
      enrollment: enrollment({ familyId: 'fam_1' }),
      consent: consent({ familyId: 'fam_1' }),
      kidProfile: undefined,
      at,
      convertJobId: 'cvt_2',
      auditLog: log,
    });
    assert.equal(refused.ok, false);
    if (refused.ok) {
      return;
    }
    assert.equal(refused.errorCode, 'convert_refused');

    const fam1 = log.listByFamily('fam_1');
    const fam2 = log.listByFamily('fam_2');
    assert.equal(fam1.length, 1);
    assert.equal(fam1[0]?.kind, 'convert_queued');
    assert.equal(fam1[0]?.subjectRef, 'cvt_1');
    assert.equal(fam2.length, 1);
    assert.equal(fam2[0]?.kind, 'convert_refused');
    assert.equal(
      fam1.some((item) => item.familyId === 'fam_2'),
      false,
    );
    assert.equal(log.listByJob('cvt_1').length, 1);
    assert.equal(log.listByJob('cvt_2')[0]?.kind, 'convert_refused');
  });
});
