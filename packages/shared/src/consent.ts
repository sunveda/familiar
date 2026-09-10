/**
 * Consent grant / revoke stubs (metadata only).
 *
 * Affirmative `explicit_ui` grant and withdraw. No biometric capture, no
 * enrollment store. Convert still uses canonical `convertJobMayRun`.
 */

import { createAuditEvent } from './audit';
import {
  consentIsActive,
  type AuditEvent,
  type ConsentRecord,
  type FamilyId,
  type IsoTimestamp,
} from './types';

export type ConsentMutationErrorCode = 'wrong_family' | 'missing_required_field';

export type ConsentMutationResult =
  | { ok: true; consent: ConsentRecord; intendedAudit: AuditEvent }
  | { ok: false; errorCode: ConsentMutationErrorCode };

export interface GrantConsentInput {
  id: ConsentRecord['id'];
  familyId: ConsentRecord['familyId'];
  guardianId: ConsentRecord['guardianId'];
  policyVersion: string;
  scopes: ConsentRecord['scopes'];
  at: IsoTimestamp;
}

function fail(errorCode: ConsentMutationErrorCode): ConsentMutationResult {
  return { ok: false, errorCode };
}

/**
 * Persist a new affirmative ConsentRecord. Account creation is not consent —
 * callers must pass `explicit_ui` scopes the guardian actually affirmed.
 */
export function grantConsent(input: GrantConsentInput): ConsentMutationResult {
  const id = input.id?.trim() ?? '';
  const familyId = input.familyId?.trim() ?? '';
  const guardianId = input.guardianId?.trim() ?? '';
  const policyVersion = input.policyVersion?.trim() ?? '';
  if (!id || !familyId || !guardianId || !policyVersion) {
    return fail('missing_required_field');
  }
  if (!Array.isArray(input.scopes) || input.scopes.length === 0) {
    return fail('missing_required_field');
  }

  const consent: ConsentRecord = {
    id,
    familyId,
    guardianId,
    policyVersion,
    grantedAt: input.at,
    revokedAt: null,
    affirmationMethod: 'explicit_ui',
    scopes: [...input.scopes],
  };

  return {
    ok: true,
    consent,
    intendedAudit: createAuditEvent({
      kind: 'consent_granted',
      familyId: consent.familyId,
      actorGuardianId: consent.guardianId,
      at: input.at,
      subjectRef: consent.id,
      metadata: {
        policyVersion: consent.policyVersion,
        scopeCount: consent.scopes.length,
      },
    }),
  };
}

/**
 * Withdraw consent. Idempotent when already revoked. Wrong-family fails closed.
 * Does not mutate enrollments — convert already fails closed on revoked consent.
 */
export function revokeConsent(
  consent: ConsentRecord,
  at: IsoTimestamp,
  options?: { familyId?: FamilyId },
): ConsentMutationResult {
  if (options?.familyId !== undefined && consent.familyId !== options.familyId) {
    return fail('wrong_family');
  }

  const next: ConsentRecord = consentIsActive(consent)
    ? { ...consent, revokedAt: at }
    : { ...consent };

  return {
    ok: true,
    consent: next,
    intendedAudit: createAuditEvent({
      kind: 'consent_revoked',
      familyId: next.familyId,
      actorGuardianId: next.guardianId,
      at: at,
      subjectRef: next.id,
      metadata: {
        alreadyRevoked: !consentIsActive(consent),
      },
    }),
  };
}
