import { describe, expect, it, vi } from 'vitest';
import { ApiError, createReviewApiClient } from './client';

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}
const auth = { familyId: 'fam_1', guardianId: 'grd_1' };

describe('review-api client', () => {
  it('sends stub auth headers and lists jobs', async () => {
    const f = mockFetch(200, { familyId: 'fam_1', jobs: [{ id: 'j1' }] });
    const c = createReviewApiClient({ baseUrl: '/api/', auth, fetch: f });
    const jobs = await c.listJobs();
    expect(jobs).toHaveLength(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/families/fam_1/jobs');
    expect(init.headers).toEqual({ 'x-family-id': 'fam_1', 'x-guardian-id': 'grd_1' });
  });

  it('refuses to call without ids (fail closed)', async () => {
    const f = mockFetch(200, {});
    const c = createReviewApiClient({
      baseUrl: '/api',
      auth: { familyId: '', guardianId: 'g' },
      fetch: f,
    });
    await expect(c.listJobs()).rejects.toMatchObject({ status: 401, code: 'missing_auth_headers' });
    expect(f).not.toHaveBeenCalled();
  });

  it('maps server errors to ApiError with code', async () => {
    const c = createReviewApiClient({
      baseUrl: '/api',
      auth,
      fetch: mockFetch(403, { error: 'wrong_family' }),
    });
    const err = await c.getJob('x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 403, code: 'wrong_family' });
  });

  it('treats preview 501 as not available, never as media', async () => {
    const c = createReviewApiClient({
      baseUrl: '/api',
      auth,
      fetch: mockFetch(501, { error: 'not_implemented' }),
    });
    expect(await c.getPreview('j1')).toEqual({ available: false, reason: 'not_implemented' });
  });

  it('url-encodes ids and POSTs approve', async () => {
    const f = mockFetch(200, { job: {}, intendedAudit: {} });
    const c = createReviewApiClient({ baseUrl: '/api', auth, fetch: f });
    await c.approveJob('a/b');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/jobs/a%2Fb/approve');
    expect(init.method).toBe('POST');
  });

  it('reports network failure as ApiError(0)', async () => {
    const c = createReviewApiClient({
      baseUrl: '/api',
      auth,
      fetch: async () => {
        throw new Error('x');
      },
    });
    await expect(c.health()).rejects.toMatchObject({ status: 0, code: 'network_error' });
  });
});
