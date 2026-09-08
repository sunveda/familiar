/**
 * Consent grant / revoke stubs. Metadata only; convert stays fail-closed.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createAuditLog } from './audit';
import { grantConsent, revokeConsent } from './consent';
import { convertJobMayRun, type Enrollment, type Job } from './types';

const at = '2026-01-01T00:00:00.000Z';
const later = '2026-02-01T00:00:00.000Z';

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

describe('grantConsent / revokeConsent', () => {
  test('grant creates an unrevoked ConsentRecord and consent_granted audit', () => {
    const result = grantConsent({
      id: 'cns_1',
      familyId: 'fam_1',
      guardianId: 'grd_1',
      policyVersion: 'stub-0',
      scopes: ['voice_enrollment', 'face_enrollment', 'inference_on_family_content'],
      at,
    });
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.consent.revokedAt, null);
    assert.equal(result.consent.affirmationMethod, 'explicit_ui');
    assert.equal(result.intendedAudit.kind, 'consent_granted');
    assert.equal(result.intendedAudit.subjectRef, 'cns_1');
    assert.equal(convertJobMayRun(convertJob(), enrollment(), result.consent), true);
  });

  test('revoke stamps revokedAt, emits consent_revoked, and convert fails closed', () => {
    const granted = grantConsent({
      id: 'cns_1',
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
    const revoked = revokeConsent(granted.consent, later);
    assert.equal(revoked.ok, true);
    if (!revoked.ok) {
      return;
    }
    assert.equal(revoked.consent.revokedAt, later);
    assert.equal(revoked.intendedAudit.kind, 'consent_revoked');
    assert.equal(convertJobMayRun(convertJob(), enrollment(), revoked.consent), false);
  });

  test('revoke refuses the wrong family and does not emit', () => {
    const granted = grantConsent({
      id: 'cns_1',
      familyId: 'fam_1',
      guardianId: 'grd_1',
      policyVersion: 'stub-0',
      scopes: ['inference_on_family_content'],
      at,
    });
    assert.equal(granted.ok, true);
    if (!granted.ok) {
      return;
    }
    const result = revokeConsent(granted.consent, later, { familyId: 'fam_other' });
    assert.deepEqual(result, { ok: false, errorCode: 'wrong_family' });
  });

  test('grant refuses empty required fields', () => {
    const result = grantConsent({
      id: '',
      familyId: 'fam_1',
      guardianId: 'grd_1',
      policyVersion: 'stub-0',
      scopes: ['inference_on_family_content'],
      at,
    });
    assert.deepEqual(result, { ok: false, errorCode: 'missing_required_field' });
  });

  test('append + listByFamily isolates consent events across families', () => {
    const log = createAuditLog();
    const a = grantConsent({
      id: 'cns_a',
      familyId: 'fam_1',
      guardianId: 'grd_1',
      policyVersion: 'stub-0',
      scopes: ['inference_on_family_content'],
      at,
    });
    const b = grantConsent({
      id: 'cns_b',
      familyId: 'fam_2',
      guardianId: 'grd_2',
      policyVersion: 'stub-0',
      scopes: ['inference_on_family_content'],
      at,
    });
    assert.equal(a.ok && log.append(a.intendedAudit).ok, true);
    assert.equal(b.ok && log.append(b.intendedAudit).ok, true);
    if (!a.ok || !b.ok) {
      return;
    }
    const fam1 = log.listByFamily('fam_1');
    assert.equal(fam1.length, 1);
    assert.equal(fam1[0]?.kind, 'consent_granted');
    assert.equal(fam1[0]?.subjectRef, 'cns_a');
    assert.equal(
      log.listByFamily('fam_1').some((item) => item.familyId === 'fam_2'),
      false,
    );
  });
});
