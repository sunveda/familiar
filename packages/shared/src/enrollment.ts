/**
 * Enrollment status state machine (metadata only).
 *
 * Opaque `artifactRef` only — never sample bytes, embeddings, or secrets.
 * KidProfile is never an enrollment and cannot enter this machine.
 *
 * Legal transitions:
 *   pending → active   (activate; unrevoked ConsentRecord + enrollment scopes)
 *   pending → revoked
 *   pending → deleted
 *   active  → revoked
 *   active  → deleted
 *   revoked → deleted  (invalidate artifact refs)
 *
 * Illegal:
 *   * → pending              (pending is create-only)
 *   deleted → *              (terminal)
 *   revoked → active|pending (no reactivation; create a new enrollment)
 *   active → pending
 */

import {
  consentIsActive,
  type ConsentRecord,
  type ConsentScope,
  type Enrollment,
  type EnrollmentModality,
  type EnrollmentStatus,
  type FamilyId,
  type IsoTimestamp,
} from './types';

export type EnrollmentTransitionErrorCode =
  | 'illegal_transition'
  | 'already_deleted'
  | 'consent_revoked'
  | 'consent_not_bound'
  | 'wrong_family'
  | 'missing_enrollment_scopes';

export type EnrollmentTransitionResult =
  { ok: true; enrollment: Enrollment } | { ok: false; errorCode: EnrollmentTransitionErrorCode };

export const LEGAL_ENROLLMENT_TRANSITIONS: Readonly<
  Record<EnrollmentStatus, readonly EnrollmentStatus[]>
> = {
  pending: ['active', 'revoked', 'deleted'],
  active: ['revoked', 'deleted'],
  revoked: ['deleted'],
  deleted: [],
};

export function canTransitionEnrollment(from: EnrollmentStatus, to: EnrollmentStatus): boolean {
  return LEGAL_ENROLLMENT_TRANSITIONS[from].includes(to);
}

export function enrollmentScopesForModality(modality: EnrollmentModality): ConsentScope[] {
  switch (modality) {
    case 'voice':
      return ['voice_enrollment'];
    case 'face':
      return ['face_enrollment'];
    case 'voice_and_face':
      return ['voice_enrollment', 'face_enrollment'];
  }
}

export function consentHasEnrollmentScopes(
  consent: ConsentRecord,
  modality: EnrollmentModality,
): boolean {
  return enrollmentScopesForModality(modality).every((scope) => consent.scopes.includes(scope));
}

function fail(errorCode: EnrollmentTransitionErrorCode): EnrollmentTransitionResult {
  return { ok: false, errorCode };
}

function familyMismatch(
  enrollment: Enrollment,
  consent: ConsentRecord,
  expectedFamilyId?: FamilyId,
): boolean {
  if (enrollment.familyId !== consent.familyId) {
    return true;
  }
  if (expectedFamilyId !== undefined && enrollment.familyId !== expectedFamilyId) {
    return true;
  }
  return false;
}

/**
 * pending → active. Fail closed without unrevoked, bound, same-family consent
 * that includes the enrollment scopes for this modality.
 */
export function activateEnrollment(
  enrollment: Enrollment,
  consent: ConsentRecord,
  _at: IsoTimestamp,
  options?: { familyId?: FamilyId },
): EnrollmentTransitionResult {
  if (enrollment.status === 'deleted') {
    return fail('already_deleted');
  }
  if (!canTransitionEnrollment(enrollment.status, 'active')) {
    return fail('illegal_transition');
  }
  if (familyMismatch(enrollment, consent, options?.familyId)) {
    return fail('wrong_family');
  }
  if (enrollment.consentRecordId !== consent.id || enrollment.guardianId !== consent.guardianId) {
    return fail('consent_not_bound');
  }
  if (!consentIsActive(consent)) {
    return fail('consent_revoked');
  }
  if (!consentHasEnrollmentScopes(consent, enrollment.modality)) {
    return fail('missing_enrollment_scopes');
  }

  return {
    ok: true,
    enrollment: {
      ...enrollment,
      status: 'active',
    },
  };
}

/** pending|active → revoked. Deleted enrollments cannot be revoked. */
export function revokeEnrollment(
  enrollment: Enrollment,
  at: IsoTimestamp,
  options?: { familyId?: FamilyId },
): EnrollmentTransitionResult {
  if (enrollment.status === 'deleted') {
    return fail('already_deleted');
  }
  if (options?.familyId !== undefined && enrollment.familyId !== options.familyId) {
    return fail('wrong_family');
  }
  if (enrollment.status === 'revoked') {
    return { ok: true, enrollment };
  }
  if (!canTransitionEnrollment(enrollment.status, 'revoked')) {
    return fail('illegal_transition');
  }

  return {
    ok: true,
    enrollment: {
      ...enrollment,
      status: 'revoked',
      revokedAt: at,
    },
  };
}

/**
 * pending|active|revoked → deleted.
 * Nulls `artifactRef` so no usable opaque pointer remains. Bytes are out of process.
 */
export function deleteEnrollment(
  enrollment: Enrollment,
  at: IsoTimestamp,
  options?: { familyId?: FamilyId },
): EnrollmentTransitionResult {
  if (options?.familyId !== undefined && enrollment.familyId !== options.familyId) {
    return fail('wrong_family');
  }
  if (enrollment.status === 'deleted') {
    return {
      ok: true,
      enrollment: {
        ...enrollment,
        artifactRef: null,
        deletedAt: enrollment.deletedAt ?? at,
      },
    };
  }
  if (!canTransitionEnrollment(enrollment.status, 'deleted')) {
    return fail('illegal_transition');
  }

  return {
    ok: true,
    enrollment: {
      ...enrollment,
      status: 'deleted',
      revokedAt: enrollment.revokedAt ?? at,
      deletedAt: at,
      artifactRef: null,
    },
  };
}
