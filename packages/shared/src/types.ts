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
export type KidProfileId = string;
export type AuditEventId = string;

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
 *
 * OPEN PRODUCT QUESTION: whether guardian A may run convert targeting
 * guardian B’s enrollment in the same family is undecided. Do not require
 * `requestedByGuardianId === enrollment.guardianId` until product decides.
 * See docs/consent-gate.md.
 *
 * Kids are not enrollment targets in v1 — never set targetEnrollmentId to a
 * KidProfile id.
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

/**
 * Guardian-managed, family-scoped child profile.
 *
 * Kids are **not** enrollment targets in v1 (parent voice+face swap only).
 * Never bind `Job.targetEnrollmentId` to a KidProfile.
 */
export interface KidProfile {
  id: KidProfileId;
  familyId: FamilyId;
  /** Display name only — not an identity enrollment. */
  displayName: string;
  managedByGuardianId: GuardianId;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  status: KidProfileStatus;
}

export type KidProfileStatus = 'active' | 'archived';

/**
 * Metadata-only audit stub. No audit store is implemented in this repo.
 * Do not put samples, embeddings, or secrets in metadata.
 *
 * Intended emit points (see docs/consent-gate.md): consent grant/revoke,
 * enrollment revoke/delete, convert refuse/queue, review approve/reject.
 */
export type AuditEventKind =
  | 'consent_granted'
  | 'consent_revoked'
  | 'enrollment_revoked'
  | 'enrollment_deleted'
  | 'convert_refused'
  | 'convert_queued'
  | 'review_approved'
  | 'review_rejected';

export interface AuditEvent {
  id: AuditEventId;
  familyId: FamilyId;
  actorGuardianId: GuardianId | null;
  kind: AuditEventKind;
  at: IsoTimestamp;
  /** Opaque record id (consent, enrollment, job) — never a file path to biometrics. */
  subjectRef: string | null;
  metadata: Record<string, string | number | boolean | null>;
}

/**
 * Rate-limit / abuse detection hook. Real detection is not implemented.
 * Convert consent must fail closed even if a future hook would allow.
 */
export type ConvertAbuseHookStatus = 'disabled';

export interface ConvertAbuseHook {
  readonly status: ConvertAbuseHookStatus;
}

export const disabledConvertAbuseHook: ConvertAbuseHook = { status: 'disabled' };

export function consentIsActive(consent: ConsentRecord): boolean {
  return consent.revokedAt === null;
}

export function enrollmentAllowsInference(enrollment: Enrollment): boolean {
  return enrollment.status === 'active';
}

/**
 * Canonical fail-closed convert gate. Python `queue_convert_job` is the
 * runtime mirror — keep them aligned via docs/consent-gate.md and
 * packages/shared/fixtures/convert-gate-cases.json.
 *
 * OPEN PRODUCT QUESTION: this function does **not** require
 * `job.requestedByGuardianId === enrollment.guardianId`. Do not add that
 * equality check without a product call.
 *
 * A disabled abuse hook cannot override a false result from this function.
 */
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
