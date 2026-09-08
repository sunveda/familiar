/**
 * Placeholder HTTP server. Does not serve video, embeddings, or secrets.
 *
 * `node --experimental-strip-types` is Node 22+; CI typechecks and unit-tests
 * this package. Tenancy uses the shared stub (mode: stub). Production auth is
 * blocked — not an IdP/OIDC/JWT verifier. Family isolation: assertSameFamily.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import {
  assertSameFamily,
  httpStatusForAuthError,
  resolveAuthContextFromHeaders,
  type AuthContext,
} from '../../../packages/shared/src/index';

import {
  approveJob,
  deleteEnrollmentInStore,
  getFamilyJob,
  listFamilyJobs,
  mediaNotServedBody,
  rejectJob,
  revokeEnrollmentInStore,
} from './flow';
import { createMemoryStore, type ReviewStore } from './store';

const port = Number(process.env.REVIEW_API_PORT ?? 3000);

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function pathname(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : (url.slice(0, q) ?? url);
}

function nowIso(): string {
  return new Date().toISOString();
}

function statusForFlowError(code: string): number {
  switch (code) {
    case 'not_found':
      return 404;
    case 'wrong_family':
      return 403;
    case 'missing_guardian':
    case 'missing_family':
      return 401;
    case 'illegal_job_status':
    case 'illegal_transition':
    case 'already_deleted':
      return 409;
    default:
      return 400;
  }
}

function requireStubAuth(req: IncomingMessage, res: ServerResponse): AuthContext | null {
  // Claimed headers only. No JWT/OIDC verification (production auth is blocked).
  const result = resolveAuthContextFromHeaders(req.headers);
  if (!result.ok) {
    json(res, httpStatusForAuthError(result.errorCode), {
      error: result.errorCode,
    });
    return null;
  }
  return result.context;
}

function refuseWrongFamily(res: ServerResponse, extra: Record<string, string>): boolean {
  json(res, 403, { error: 'wrong_family', ...extra });
  return true;
}

export function createRouter(
  store: ReviewStore,
): (req: IncomingMessage, res: ServerResponse) => void {
  return function router(req: IncomingMessage, res: ServerResponse): void {
    const url = pathname(req.url ?? '/');
    const method = req.method ?? 'GET';

    if (method === 'GET' && url === '/health') {
      json(res, 200, { ok: true, service: 'review-api', ml: false, media: 'not_served' });
      return;
    }

    const media = url.match(/^\/jobs\/([^/]+)\/(media|preview)\/?$/);
    if (method === 'GET' && media) {
      json(res, 501, { ...mediaNotServedBody, jobId: media[1] });
      return;
    }

    const ctx = requireStubAuth(req, res);
    if (!ctx) {
      return;
    }

    const familyJobs = url.match(/^\/families\/([^/]+)\/jobs\/?$/);
    if (method === 'GET' && familyJobs) {
      const id = familyJobs[1] ?? '';
      const same = assertSameFamily(ctx, id);
      if (!same.ok) {
        refuseWrongFamily(res, { familyId: id });
        return;
      }
      json(res, 200, { familyId: ctx.familyId, jobs: listFamilyJobs(store, ctx.familyId) });
      return;
    }

    const approve = url.match(/^\/jobs\/([^/]+)\/approve\/?$/);
    if (method === 'POST' && approve) {
      const result = approveJob(store, approve[1] ?? '', nowIso(), ctx.guardianId, ctx.familyId);
      if (!result.ok) {
        json(res, statusForFlowError(result.errorCode), {
          error: result.errorCode,
          jobId: approve[1],
        });
        return;
      }
      json(res, 200, {
        job: result.value.job,
        intendedAudit: result.value.intendedAudit,
        note: 'Kids must not see output until status is approved.',
      });
      return;
    }

    const reject = url.match(/^\/jobs\/([^/]+)\/reject\/?$/);
    if (method === 'POST' && reject) {
      const result = rejectJob(store, reject[1] ?? '', nowIso(), ctx.guardianId, ctx.familyId);
      if (!result.ok) {
        json(res, statusForFlowError(result.errorCode), {
          error: result.errorCode,
          jobId: reject[1],
        });
        return;
      }
      json(res, 200, {
        job: result.value.job,
        intendedAudit: result.value.intendedAudit,
      });
      return;
    }

    const job = url.match(/^\/jobs\/([^/]+)\/?$/);
    if (method === 'GET' && job) {
      const result = getFamilyJob(store, job[1] ?? '', ctx.familyId);
      if (!result.ok) {
        json(res, statusForFlowError(result.errorCode), { error: result.errorCode, jobId: job[1] });
        return;
      }
      json(res, 200, result.value);
      return;
    }

    const revoke = url.match(/^\/enrollments\/([^/]+)\/revoke\/?$/);
    if (method === 'POST' && revoke) {
      const result = revokeEnrollmentInStore(
        store,
        revoke[1] ?? '',
        nowIso(),
        ctx.guardianId,
        ctx.familyId,
      );
      if (!result.ok) {
        json(res, statusForFlowError(result.errorCode), {
          error: result.errorCode,
          enrollmentId: revoke[1],
          convertJobs: 'fail_closed',
        });
        return;
      }
      json(res, 200, {
        enrollmentId: result.value.enrollment.id,
        status: result.value.enrollment.status,
        revokedAt: result.value.enrollment.revokedAt,
        intendedAudit: result.value.intendedAudit,
        convertJobs: result.value.convertJobs,
        convertJobMayRun: result.value.convertJobMayRun,
      });
      return;
    }

    const del = url.match(/^\/enrollments\/([^/]+)\/delete\/?$/);
    if (method === 'POST' && del) {
      const result = deleteEnrollmentInStore(
        store,
        del[1] ?? '',
        nowIso(),
        ctx.guardianId,
        ctx.familyId,
      );
      if (!result.ok) {
        json(res, statusForFlowError(result.errorCode), {
          error: result.errorCode,
          enrollmentId: del[1],
          convertJobs: 'fail_closed',
        });
        return;
      }
      json(res, 200, {
        enrollmentId: result.value.enrollment.id,
        status: result.value.enrollment.status,
        deletedAt: result.value.enrollment.deletedAt,
        artifactRef: result.value.enrollment.artifactRef,
        intendedAudit: result.value.intendedAudit,
        convertJobs: result.value.convertJobs,
        convertJobMayRun: result.value.convertJobMayRun,
      });
      return;
    }

    json(res, 404, { error: 'not_found' });
  };
}

const defaultStore = createMemoryStore();
const router = createRouter(defaultStore);

const server = createServer(router);

if (process.argv[1] && process.argv[1].endsWith('index.ts')) {
  server.listen(port, () => {
    process.stdout.write(`review-api stub listening on ${port}\n`);
  });
}

export { router };
export { createMemoryStore };
