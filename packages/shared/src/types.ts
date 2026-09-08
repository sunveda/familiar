/**
 * Domain types for Familiar.
 *
 * These records describe family tenancy, consent, and jobs. They must not
 * hold raw biometric samples, embeddings, or secrets — those live in an
 * external enrollment store referenced by opaque keys.
 */

export type IsoTimestamp = string;

export type FamilyId = string;
export type GuardianId = string;
export type EnrollmentId = string;
export type ConsentRecordId = string;
export type JobId = string;

/** Family space. Jobs, enrollments, and consent are scoped to a family. */
export interface Family {
  id: FamilyId;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  status: FamilyStatus;
}

export type FamilyStatus = 'active' | 'suspended' | 'deleted';

/**
 * Registered caregiver. Inference never targets a Guardian who is not
 * enrolled with unrevoked consent in this family.
 */
export interface Guardian {
  id: GuardianId;
  familyId: FamilyId;
  displayName: string;
  role: GuardianRole;
  createdAt: IsoTimestamp;
  enrollmentStatus: GuardianEnrollmentStatus;
}

export type GuardianRole = 'primary' | 'caregiver';

export type GuardianEnrollmentStatus = 'none' | 'pending_consent' | 'enrolled' | 'revoked';

export type ConsentScope =
  'voice_enrollment' | 'face_enrollment' | 'inference_on_family_content' | 'guardian_preview';

/**
 * Affirmative consent only. Account creation or video upload is not consent.
 */
export interface ConsentRecord {
  id: ConsentRecordId;
  familyId: FamilyId;
  guardianId: GuardianId;
  /** Version of the consent text the guardian affirmed. */
  policyVersion: string;
  grantedAt: IsoTimestamp;
  revokedAt: IsoTimestamp | null;
  affirmationMethod: 'explicit_ui';
  scopes: ConsentScope[];
}

export type EnrollmentModality = 'voice' | 'face' | 'voice_and_face';

export type EnrollmentStatus = 'pending' | 'active' | 'revoked' | 'deleted';

/**
 * Metadata for an enrolled parent identity. Artifact bytes are never stored
 * in git or in this object — only an opaque pointer to encrypted storage.
 */
export interface Enrollment {
  id: EnrollmentId;
  familyId: FamilyId;
  guardianId: GuardianId;
  consentRecordId: ConsentRecordId;
  modality: EnrollmentModality;
  status: EnrollmentStatus;
  artifactRef: EnrollmentArtifactRef | null;
  createdAt: IsoTimestamp;
  revokedAt: IsoTimestamp | null;
}

export interface EnrollmentArtifactRef {
  /** Opaque key in the enrollment store — not a repo path. */
  storageKey: string;
  contentType: string;
  createdAt: IsoTimestamp;
}

export type JobKind = 'ingest' | 'convert' | 'review';

export type JobStatus =
  'queued' | 'running' | 'needs_review' | 'approved' | 'rejected' | 'failed' | 'cancelled';

/**
 * Convert jobs MUST set targetEnrollmentId to an active enrollment in the
 * same family. Missing or revoked enrollment → fail closed.
 */
export interface Job {
  id: JobId;
  familyId: FamilyId;
  requestedByGuardianId: GuardianId;
  kind: JobKind;
  status: JobStatus;
  targetEnrollmentId: EnrollmentId | null;
  sourceRef: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  errorCode: string | null;
}

export function consentIsActive(consent: ConsentRecord): boolean {
  return consent.revokedAt === null;
}

export function enrollmentAllowsInference(enrollment: Enrollment): boolean {
  return enrollment.status === 'active';
}

export function convertJobMayRun(
  job: Job,
  enrollment: Enrollment,
  consent: ConsentRecord,
): boolean {
  if (job.kind !== 'convert') {
    return false;
  }
  if (job.targetEnrollmentId !== enrollment.id) {
    return false;
  }
  if (job.familyId !== enrollment.familyId || job.familyId !== consent.familyId) {
    return false;
  }
  if (enrollment.consentRecordId !== consent.id) {
    return false;
  }
  if (!consentIsActive(consent) || !enrollmentAllowsInference(enrollment)) {
    return false;
  }
  return consent.scopes.includes('inference_on_family_content');
}
