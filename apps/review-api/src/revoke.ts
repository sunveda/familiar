import type { EnrollmentStatus } from '@familiar/shared';

/**
 * Revoke/delete path for an enrollment. Convert jobs that still point at this
 * id must fail closed (see apps/convert). Artifact deletion is out of process.
 */
export function revokeEnrollmentStub(enrollmentId: string): {
  enrollmentId: string;
  status: EnrollmentStatus;
  convertJobs: 'fail_closed';
} {
  return {
    enrollmentId,
    status: 'revoked',
    convertJobs: 'fail_closed',
  };
}
