import type { AuthSettings, AuditEventLike, GuardianJobView } from './types';

/** Thrown for any non-2xx response or refused request. `code` mirrors the server `error` field. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: unknown;
  constructor(status: number, code: string, body: unknown) {
    super(`${status} ${code}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  baseUrl: string;
  auth: AuthSettings;
  fetch?: FetchLike;
}

export type PreviewResult = { available: false; reason: 'not_implemented' } | { available: true };

export interface TransitionResult {
  job: GuardianJobView;
  intendedAudit: AuditEventLike;
  note?: string;
}

export interface ReviewApiClient {
  health(): Promise<{ ok: boolean; service: string }>;
  listJobs(): Promise<GuardianJobView[]>;
  getJob(id: string): Promise<GuardianJobView>;
  approveJob(id: string): Promise<TransitionResult>;
  rejectJob(id: string): Promise<TransitionResult>;
  /** Media routes return 501 today; we never fabricate media. */
  getPreview(id: string): Promise<PreviewResult>;
  revokeEnrollment(id: string): Promise<Record<string, unknown>>;
  deleteEnrollment(id: string): Promise<Record<string, unknown>>;
}

function trimBase(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * STUB AUTH: sends x-family-id / x-guardian-id headers, exactly what the
 * server's stub resolver reads. This is not authentication and must be
 * replaced by a real IdP before any real use (docs/auth-tenancy.md).
 */
export function createReviewApiClient(opts: ClientOptions): ReviewApiClient {
  const doFetch: FetchLike = opts.fetch ?? ((i, init) => fetch(i, init));
  const base = trimBase(opts.baseUrl);
  const { familyId, guardianId } = opts.auth;

  async function request(method: 'GET' | 'POST', path: string, allow: number[] = []) {
    if (!familyId.trim() || !guardianId.trim()) {
      // Fail closed on the client too; the server would answer 401 anyway.
      throw new ApiError(401, 'missing_auth_headers', null);
    }
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        headers: { 'x-family-id': familyId, 'x-guardian-id': guardianId },
      });
    } catch {
      throw new ApiError(0, 'network_error', null);
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok && !allow.includes(res.status)) {
      const code =
        body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `http_${res.status}`;
      throw new ApiError(res.status, code, body);
    }
    return { status: res.status, body };
  }

  const enc = encodeURIComponent;
  return {
    async health() {
      const r = await request('GET', '/health');
      return r.body as { ok: boolean; service: string };
    },
    async listJobs() {
      const r = await request('GET', `/families/${enc(familyId)}/jobs`);
      return (r.body as { jobs: GuardianJobView[] }).jobs;
    },
    async getJob(id) {
      const r = await request('GET', `/jobs/${enc(id)}`);
      return r.body as GuardianJobView;
    },
    async approveJob(id) {
      const r = await request('POST', `/jobs/${enc(id)}/approve`);
      return r.body as TransitionResult;
    },
    async rejectJob(id) {
      const r = await request('POST', `/jobs/${enc(id)}/reject`);
      return r.body as TransitionResult;
    },
    async getPreview(id) {
      const r = await request('GET', `/jobs/${enc(id)}/preview`, [501]);
      return r.status === 501
        ? { available: false, reason: 'not_implemented' }
        : { available: true };
    },
    async revokeEnrollment(id) {
      const r = await request('POST', `/enrollments/${enc(id)}/revoke`);
      return r.body as Record<string, unknown>;
    },
    async deleteEnrollment(id) {
      const r = await request('POST', `/enrollments/${enc(id)}/delete`);
      return r.body as Record<string, unknown>;
    },
  };
}
