/**
 * Guardian flow stubs: list, approve/reject, preview-ready, revoke fail-closed.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  convertJobMayRun,
  type ConsentRecord,
  type Enrollment,
  type Job,
} from '../../../packages/shared/src/index';

import {
  approveJob,
  convertMayRunAfterEnrollment,
  deleteEnrollmentInStore,
  getFamilyJob,
  grantConsentInStore,
  listFamilyJobs,
  rejectJob,
  revokeConsentInStore,
  revokeEnrollmentInStore,
  toJobView,
} from './flow';
import { createMemoryStore } from './store';

const at = '2026-01-01T00:00:00.000Z';
const later = '2026-02-01T00:00:00.000Z';

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job_1',
    familyId: 'fam_1',
    requestedByGuardianId: 'grd_1',
    kind: 'convert',
    status: 'needs_review',
    targetEnrollmentId: 'enr_1',
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

describe('listFamilyJobs', () => {
  test('lists only jobs for that family', () => {
    const store = createMemoryStore({
      jobs: [
        job(),
        job({ id: 'job_other', familyId: 'fam_2' }),
        job({ id: 'job_queued', status: 'queued' }),
      ],
    });
    const listed = listFamilyJobs(store, 'fam_1');
    assert.equal(listed.length, 2);
    assert.equal(
      listed.some((item) => item.id === 'job_other'),
      false,
    );
  });

  test('marks needs_review jobs previewReady without serving media', () => {
    const view = toJobView(job());
    assert.equal(view.previewReady, true);
    assert.equal(view.media, 'not_served');
    assert.equal(toJobView(job({ status: 'queued' })).previewReady, false);
    assert.equal(toJobView(job({ status: 'approved' })).previewReady, false);
  });
});

describe('approveJob / rejectJob', () => {
  test('approve transitions needs_review → approved and records intended audit', () => {
    const store = createMemoryStore({ jobs: [job()] });
    const result = approveJob(store, 'job_1', later, 'grd_1');
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.job.status, 'approved');
      assert.equal(result.value.job.previewReady, false);
      assert.equal(result.value.intendedAudit.kind, 'review_approved');
      assert.equal(result.value.intendedAudit.subjectRef, 'job_1');
      assert.equal(store.intendedAudits().length, 1);
      assert.equal(store.listAuditsByFamily('fam_1').length, 1);
      assert.equal(store.listAuditsByFamily('fam_other').length, 0);
      assert.equal(store.listAuditsByJob('job_1')[0]?.kind, 'review_approved');
    }
  });

  test('reject transitions needs_review → rejected and records intended audit', () => {
    const store = createMemoryStore({ jobs: [job()] });
    const result = rejectJob(store, 'job_1', later, 'grd_1');
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.job.status, 'rejected');
      assert.equal(result.value.intendedAudit.kind, 'review_rejected');
    }
  });

  test('refuses approve when job is not needs_review', () => {
    const store = createMemoryStore({ jobs: [job({ status: 'queued' })] });
    const result = approveJob(store, 'job_1', later, 'grd_1');
    assert.deepEqual(result, { ok: false, errorCode: 'illegal_job_status' });
  });

  test('refuses reject of an already approved job', () => {
    const store = createMemoryStore({ jobs: [job({ status: 'approved' })] });
    const result = rejectJob(store, 'job_1', later, 'grd_1');
    assert.deepEqual(result, { ok: false, errorCode: 'illegal_job_status' });
  });

  test('refuses approve for the wrong family', () => {
    const store = createMemoryStore({ jobs: [job()] });
    const result = approveJob(store, 'job_1', later, 'grd_1', 'fam_other');
    assert.deepEqual(result, { ok: false, errorCode: 'wrong_family' });
  });

  test('refuses missing job', () => {
    const store = createMemoryStore();
    assert.deepEqual(approveJob(store, 'missing', later, 'grd_1'), {
      ok: false,
      errorCode: 'not_found',
    });
  });

  test('getFamilyJob refuses cross-family read', () => {
    const store = createMemoryStore({ jobs: [job()] });
    const result = getFamilyJob(store, 'job_1', 'fam_other');
    assert.deepEqual(result, { ok: false, errorCode: 'wrong_family' });
  });
});

describe('revokeEnrollmentInStore fail-closed convert', () => {
  test('revoke then convertJobMayRun is false', () => {
    const current = enrollment();
    const store = createMemoryStore({
      enrollments: [current],
      consents: [consent()],
    });
    const result = revokeEnrollmentInStore(store, 'enr_1', later, 'grd_1');
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.enrollment.status, 'revoked');
      assert.equal(result.value.convertJobMayRun, false);
      assert.equal(result.value.convertJobs, 'fail_closed');
      assert.equal(result.value.intendedAudit.kind, 'enrollment_revoked');
      assert.equal(
        convertJobMayRun(
          job({ kind: 'convert', status: 'queued', targetEnrollmentId: 'enr_1' }),
          result.value.enrollment,
          consent(),
        ),
        false,
      );
    }
  });

  test('delete nulls artifactRef and fails closed for convert', () => {
    const store = createMemoryStore({
      enrollments: [enrollment()],
      consents: [consent()],
    });
    const result = deleteEnrollmentInStore(store, 'enr_1', later, 'grd_1');
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.enrollment.status, 'deleted');
      assert.equal(result.value.enrollment.artifactRef, null);
      assert.equal(result.value.convertJobMayRun, false);
      assert.equal(convertMayRunAfterEnrollment(result.value.enrollment, consent()), false);
    }
  });

  test('refuses revoke for the wrong family', () => {
    const store = createMemoryStore({ enrollments: [enrollment()] });
    const result = revokeEnrollmentInStore(store, 'enr_1', later, 'grd_1', 'fam_other');
    assert.deepEqual(result, { ok: false, errorCode: 'wrong_family' });
  });

  test('refuses revoke of missing enrollment', () => {
    const store = createMemoryStore();
    const result = revokeEnrollmentInStore(store, 'enr_missing', later, 'grd_1');
    assert.deepEqual(result, { ok: false, errorCode: 'not_found' });
  });

  test('enrollment revoke/delete append and listByFamily isolates', () => {
    const store = createMemoryStore({
      enrollments: [enrollment(), enrollment({ id: 'enr_2', familyId: 'fam_2' })],
      consents: [consent(), consent({ id: 'cns_2', familyId: 'fam_2' })],
    });
    const revoked = revokeEnrollmentInStore(store, 'enr_1', later, 'grd_1');
    const deleted = deleteEnrollmentInStore(store, 'enr_2', later, 'grd_2');
    assert.equal(revoked.ok, true);
    assert.equal(deleted.ok, true);
    const fam1 = store.listAuditsByFamily('fam_1');
    const fam2 = store.listAuditsByFamily('fam_2');
    assert.equal(fam1.length, 1);
    assert.equal(fam1[0]?.kind, 'enrollment_revoked');
    assert.equal(fam2.length, 1);
    assert.equal(fam2[0]?.kind, 'enrollment_deleted');
    assert.equal(
      fam1.some((item) => item.familyId === 'fam_2'),
      false,
    );
  });
});

describe('consent grant / revoke audit', () => {
  test('grant and revoke append; listByFamily refuses cross-family reads', () => {
    const store = createMemoryStore();
    const granted = grantConsentInStore(store, {
      id: 'cns_new',
      familyId: 'fam_1',
      guardianId: 'grd_1',
      policyVersion: 'stub-0',
      scopes: ['voice_enrollment', 'face_enrollment', 'inference_on_family_content'],
      at,
    });
    assert.equal(granted.ok, true);
    if (!granted.ok) {
      return;
    }
    assert.equal(granted.value.intendedAudit.kind, 'consent_granted');

    const other = grantConsentInStore(store, {
      id: 'cns_other',
      familyId: 'fam_2',
      guardianId: 'grd_2',
      policyVersion: 'stub-0',
      scopes: ['inference_on_family_content'],
      at,
    });
    assert.equal(other.ok, true);

    const revoked = revokeConsentInStore(store, 'cns_new', later, 'grd_1', 'fam_1');
    assert.equal(revoked.ok, true);
    if (!revoked.ok) {
      return;
    }
    assert.equal(revoked.value.intendedAudit.kind, 'consent_revoked');
    assert.equal(revoked.value.convertJobMayRun, false);
    assert.equal(
      convertJobMayRun(
        job({ kind: 'convert', status: 'queued', targetEnrollmentId: 'enr_1' }),
        enrollment(),
        revoked.value.consent,
      ),
      false,
    );

    const fam1 = store.listAuditsByFamily('fam_1');
    assert.equal(fam1.length, 2);
    assert.deepEqual(
      fam1.map((item) => item.kind),
      ['consent_granted', 'consent_revoked'],
    );
    assert.equal(store.listAuditsByFamily('fam_2').length, 1);
    assert.equal(
      store.listAuditsByFamily('fam_1').some((item) => item.familyId === 'fam_2'),
      false,
    );
  });

  test('revoke consent refuses the wrong family and does not append', () => {
    const store = createMemoryStore({ consents: [consent()] });
    const result = revokeConsentInStore(store, 'cns_1', later, 'grd_1', 'fam_other');
    assert.deepEqual(result, { ok: false, errorCode: 'wrong_family' });
    assert.equal(store.listAuditsByFamily('fam_1').length, 0);
    assert.equal(store.listAuditsByFamily('fam_other').length, 0);
  });

  test('grant refuses a family mismatch on the expected header', () => {
    const store = createMemoryStore();
    const result = grantConsentInStore(
      store,
      {
        id: 'cns_x',
        familyId: 'fam_1',
        guardianId: 'grd_1',
        policyVersion: 'stub-0',
        scopes: ['inference_on_family_content'],
        at,
      },
      'fam_other',
    );
    assert.deepEqual(result, { ok: false, errorCode: 'wrong_family' });
  });
});
