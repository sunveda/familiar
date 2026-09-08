import type { EnrollmentStatus } from '../../../packages/shared/src/index';

import { revokeEnrollmentInStore } from './flow';
import type { ReviewStore } from './store';

/**
 * Thin HTTP/helper wrapper around the shared enrollment state machine.
 * Convert jobs that still point at this id must fail closed (`convertJobMayRun`).
 */
export function revokeEnrollmentStub(
  store: ReviewStore,
  enrollmentId: string,
  at: string,
  actorGuardianId: string | null,
  familyId?: string,
): {
  enrollmentId: string;
  status: EnrollmentStatus;
  convertJobs: 'fail_closed';
  convertJobMayRun: boolean;
  errorCode?: string;
} {
  const result = revokeEnrollmentInStore(store, enrollmentId, at, actorGuardianId, familyId);
  if (!result.ok) {
    return {
      enrollmentId,
      status: 'revoked',
      convertJobs: 'fail_closed',
      convertJobMayRun: false,
      errorCode: result.errorCode,
    };
  }
  return {
    enrollmentId: result.value.enrollment.id,
    status: result.value.enrollment.status,
    convertJobs: 'fail_closed',
    convertJobMayRun: result.value.convertJobMayRun,
  };
}
