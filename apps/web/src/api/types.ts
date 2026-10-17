/**
 * Wire types for the review-api contract (docs/api-contracts.md).
 * Kept local so the web bundle never pulls in Node-only code from packages/shared.
 * The server stays authoritative: the consent gate is never evaluated here.
 */
export type JobKind = 'ingest' | 'convert';
export type JobStatus =
  | 'queued'
  | 'staged'
  | 'running'
  | 'needs_review'
  | 'approved'
  | 'rejected'
  | 'failed'
  | 'cancelled';

export interface GuardianJobView {
  id: string;
  familyId: string;
  requestedByGuardianId: string;
  kind: JobKind;
  status: JobStatus;
  targetEnrollmentId: string | null;
  sourceRef: string | null;
  createdAt: string;
  updatedAt: string;
  errorCode: string | null;
  previewReady: boolean;
  media: 'not_served';
}

export interface AuditEventLike {
  id: string;
  familyId: string;
  actorGuardianId: string | null;
  kind: string;
  at: string;
  subjectRef: string | null;
  metadata: Record<string, string | number | boolean | null>;
}

export type EnrollmentStatus = 'pending' | 'active' | 'revoked' | 'deleted';
export type EnrollmentModality = 'voice' | 'face' | 'voice_and_face';

export interface EnrollmentView {
  id: string;
  familyId: string;
  guardianId: string;
  consentRecordId: string;
  modality: EnrollmentModality;
  status: EnrollmentStatus;
  createdAt: string;
  revokedAt: string | null;
  deletedAt: string | null;
}

export interface KidProfileView {
  id: string;
  familyId: string;
  displayName: string;
  managedByGuardianId: string;
}

export type ConsentScope =
  'voice_enrollment' | 'face_enrollment' | 'inference_on_family_content' | 'guardian_preview';

export interface ConsentRecordView {
  id: string;
  familyId: string;
  guardianId: string;
  policyVersion: string;
  grantedAt: string;
  revokedAt: string | null;
  affirmationMethod: 'explicit_ui';
  scopes: ConsentScope[];
}

export interface AuthSettings {
  familyId: string;
  guardianId: string;
}

export interface ClientSettings extends AuthSettings {
  baseUrl: string;
}
