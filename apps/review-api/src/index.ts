/**
 * Placeholder HTTP server. Does not serve video, embeddings, or secrets.
 *
 * `node --experimental-strip-types` is Node 22+; CI only typechecks this package.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { revokeEnrollmentStub } from './revoke';

const port = Number(process.env.REVIEW_API_PORT ?? 3000);

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function router(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  if (method === 'GET' && url === '/health') {
    json(res, 200, { ok: true, service: 'review-api', ml: false });
    return;
  }

  const approve = url.match(/^\/jobs\/([^/]+)\/approve\/?$/);
  if (method === 'POST' && approve) {
    json(res, 501, {
      error: 'not_implemented',
      jobId: approve[1],
      detail: 'Guardian approval is stubbed. Kids must not see unreviewed output.',
    });
    return;
  }

  const job = url.match(/^\/jobs\/([^/]+)\/?$/);
  if (method === 'GET' && job) {
    json(res, 200, {
      id: job[1],
      kind: 'review',
      status: 'needs_review',
      note: 'Preview bytes are not served by this stub.',
    });
    return;
  }

  const revoke = url.match(/^\/enrollments\/([^/]+)\/revoke\/?$/);
  if (method === 'POST' && revoke) {
    json(res, 200, revokeEnrollmentStub(revoke[1] ?? ''));
    return;
  }

  json(res, 404, { error: 'not_found' });
}

const server = createServer(router);

if (process.argv[1] && process.argv[1].endsWith('index.ts')) {
  server.listen(port, () => {
    process.stdout.write(`review-api stub listening on ${port}\n`);
  });
}

export { router };
