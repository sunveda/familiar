/**
 * Unit tests for the enrollment status state machine.
 *
 * Allow/refuse cases for activate, revoke, and delete. No biometric bytes.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  activateEnrollment,
  canTransitionEnrollment,
  consentHasEnrollmentScopes,
  deleteEnrollment,
  LEGAL_ENROLLMENT_TRANSITIONS,
  revokeEnrollment,
} from './enrollment';
import { convertJobMayRun, type ConsentRecord, type Enrollment, type Job } from './types';

const at = '2026-01-01T00:00:00.000Z';
const later = '2026-02-01T00:00:00.000Z';

function enrollment(overrides: Partial<Enrollment> = {}): Enrollment {
  return {
    id: 'enr_1',
    familyId: 'fam_1',
    guardianId: 'grd_1',
    consentRecordId: 'cns_1',
    modality: 'voice_and_face',
    status: 'pending',
    artifactRef: {
      storageKey: 'opaque:enr_1',
      contentType: 'application/octet-stream',
      createdAt: at,
    },
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

function convertJob(overrides: Partial<Job> = {}): Job {
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

describe('enrollment transition table', () => {
  test('documents legal pending → active|revoked|deleted', () => {
    assert.deepEqual([...LEGAL_ENROLLMENT_TRANSITIONS.pending], ['active', 'revoked', 'deleted']);
    assert.equal(canTransitionEnrollment('pending', 'active'), true);
  });

  test('refuses reactivation and un-delete', () => {
    assert.equal(canTransitionEnrollment('revoked', 'active'), false);
    assert.equal(canTransitionEnrollment('deleted', 'active'), false);
    assert.equal(canTransitionEnrollment('deleted', 'pending'), false);
    assert.equal(canTransitionEnrollment('active', 'pending'), false);
    assert.equal(canTransitionEnrollment('revoked', 'pending'), false);
  });
});

describe('activateEnrollment', () => {
  test('allows pending → active with unrevoked enrollment-scoped consent', () => {
    const result = activateEnrollment(enrollment(), consent(), later);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.enrollment.status, 'active');
      assert.equal(result.enrollment.artifactRef?.storageKey, 'opaque:enr_1');
    }
  });

  test('refuses activate without enrollment scopes', () => {
    const result = activateEnrollment(
      enrollment(),
      consent({ scopes: ['inference_on_family_content', 'guardian_preview'] }),
      later,
    );
    assert.deepEqual(result, { ok: false, errorCode: 'missing_enrollment_scopes' });
  });

  test('refuses activate when voice_and_face is missing face_enrollment', () => {
    const result = activateEnrollment(
      enrollment(),
      consent({ scopes: ['voice_enrollment', 'inference_on_family_content'] }),
      later,
    );
    assert.deepEqual(result, { ok: false, errorCode: 'missing_enrollment_scopes' });
  });

  test('refuses activate with revoked consent', () => {
    const result = activateEnrollment(enrollment(), consent({ revokedAt: later }), later);
    assert.deepEqual(result, { ok: false, errorCode: 'consent_revoked' });
  });

  test('refuses activate with wrong family', () => {
    const result = activateEnrollment(enrollment(), consent({ familyId: 'fam_other' }), later);
    assert.deepEqual(result, { ok: false, errorCode: 'wrong_family' });
  });

  test('refuses activate when expected familyId does not match', () => {
    const result = activateEnrollment(enrollment(), consent(), later, { familyId: 'fam_other' });
    assert.deepEqual(result, { ok: false, errorCode: 'wrong_family' });
  });

  test('refuses activate when consent is not bound to the enrollment', () => {
    const result = activateEnrollment(enrollment(), consent({ id: 'cns_other' }), later);
    assert.deepEqual(result, { ok: false, errorCode: 'consent_not_bound' });
  });

  test('refuses activate of an already deleted enrollment', () => {
    const result = activateEnrollment(
      enrollment({ status: 'deleted', deletedAt: later, artifactRef: null }),
      consent(),
      later,
    );
    assert.deepEqual(result, { ok: false, errorCode: 'already_deleted' });
  });

  test('refuses activate from revoked (no reactivation)', () => {
    const result = activateEnrollment(
      enrollment({ status: 'revoked', revokedAt: later }),
      consent(),
      later,
    );
    assert.deepEqual(result, { ok: false, errorCode: 'illegal_transition' });
  });

  test('refuses activate from active (not a transition)', () => {
    const result = activateEnrollment(enrollment({ status: 'active' }), consent(), later);
    assert.deepEqual(result, { ok: false, errorCode: 'illegal_transition' });
  });
});

describe('revokeEnrollment', () => {
  test('allows active → revoked and stamps revokedAt', () => {
    const result = revokeEnrollment(enrollment({ status: 'active' }), later);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.enrollment.status, 'revoked');
      assert.equal(result.enrollment.revokedAt, later);
    }
  });

  test('allows pending → revoked', () => {
    const result = revokeEnrollment(enrollment(), later);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.enrollment.status, 'revoked');
    }
  });

  test('is idempotent when already revoked', () => {
    const current = enrollment({ status: 'revoked', revokedAt: at });
    const result = revokeEnrollment(current, later);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.enrollment.revokedAt, at);
    }
  });

  test('refuses revoke of deleted enrollment', () => {
    const result = revokeEnrollment(
      enrollment({ status: 'deleted', deletedAt: later, artifactRef: null }),
      later,
    );
    assert.deepEqual(result, { ok: false, errorCode: 'already_deleted' });
  });

  test('refuses revoke for the wrong family', () => {
    const result = revokeEnrollment(enrollment({ status: 'active' }), later, {
      familyId: 'fam_other',
    });
    assert.deepEqual(result, { ok: false, errorCode: 'wrong_family' });
  });
});

describe('deleteEnrollment', () => {
  test('allows active → deleted, stamps deletedAt, and nulls artifactRef', () => {
    const result = deleteEnrollment(enrollment({ status: 'active' }), later);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.enrollment.status, 'deleted');
      assert.equal(result.enrollment.deletedAt, later);
      assert.equal(result.enrollment.artifactRef, null);
      assert.equal(result.enrollment.revokedAt, later);
    }
  });

  test('allows revoked → deleted and does not keep a usable artifact ref', () => {
    const result = deleteEnrollment(enrollment({ status: 'revoked', revokedAt: at }), later);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.enrollment.status, 'deleted');
      assert.equal(result.enrollment.revokedAt, at);
      assert.equal(result.enrollment.deletedAt, later);
      assert.equal(result.enrollment.artifactRef, null);
    }
  });

  test('idempotent delete keeps artifactRef null', () => {
    const result = deleteEnrollment(
      enrollment({ status: 'deleted', deletedAt: at, artifactRef: null }),
      later,
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.enrollment.artifactRef, null);
      assert.equal(result.enrollment.deletedAt, at);
    }
  });

  test('refuses delete for the wrong family', () => {
    const result = deleteEnrollment(enrollment({ status: 'active' }), later, {
      familyId: 'fam_other',
    });
    assert.deepEqual(result, { ok: false, errorCode: 'wrong_family' });
  });
});

describe('convert gate after revoke/delete', () => {
  test('revoked enrollment fails closed for convert', () => {
    const revoked = revokeEnrollment(enrollment({ status: 'active' }), later);
    assert.equal(revoked.ok, true);
    if (revoked.ok) {
      assert.equal(convertJobMayRun(convertJob(), revoked.enrollment, consent()), false);
    }
  });

  test('deleted enrollment fails closed for convert', () => {
    const deleted = deleteEnrollment(enrollment({ status: 'active' }), later);
    assert.equal(deleted.ok, true);
    if (deleted.ok) {
      assert.equal(convertJobMayRun(convertJob(), deleted.enrollment, consent()), false);
    }
  });
});

describe('consentHasEnrollmentScopes', () => {
  test('voice modality requires voice_enrollment only', () => {
    assert.equal(
      consentHasEnrollmentScopes(consent({ scopes: ['voice_enrollment'] }), 'voice'),
      true,
    );
    assert.equal(
      consentHasEnrollmentScopes(consent({ scopes: ['face_enrollment'] }), 'voice'),
      false,
    );
  });
});
