import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createCompatibilityHandler } from '../../server/compatibilityJobs';
import { compatibilityFixtures } from '../../scripts/compatibility-fixtures';
import type { CompatibilityReport } from '../../src/core/compatibility';

const token = 'synthetic-test-only-token-not-a-secret';
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve) => { s.closeAllConnections(); s.close(() => resolve()); }))); });
async function serve(options: Parameters<typeof createCompatibilityHandler>[0]) {
  const handler = createCompatibilityHandler(options);
  const server = createServer(async (req, res) => { if (!await handler(req, res)) { res.statusCode = 404; res.end(); } });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}/api/compatibility`;
}
const post = (url: string, body: string, auth = token) => fetch(`${url}/jobs`, { method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body });

describe('bounded compatibility jobs', () => {
  it('disables jobs unless explicitly enabled with a strong token', async () => {
    const url = await serve({ enabled: true, token: 'short' });
    expect((await (await fetch(`${url}/status`)).json()).enabled).toBe(false);
    expect((await post(url, '{}')).status).toBe(503);
  });

  it('requires auth for submissions and results, validates bodies and size', async () => {
    const url = await serve({ enabled: true, token });
    expect((await post(url, '{}', 'wrong')).status).toBe(401);
    expect((await fetch(`${url}/jobs/${'a'.repeat(32)}`)).status).toBe(401);
    expect((await post(url, '{}')).status).toBe(400);
    expect((await post(url, 'x'.repeat(2_000_001))).status).toBe(413);
  });

  it('rejects malformed custom metadata before invoking the worker', async () => {
    let runCount = 0;
    const url = await serve({ enabled: true, token, run: async () => {
      runCount++;
      return { status: 'blocked', tool: { name: 'KiCad', version: null } } as CompatibilityReport;
    } });
    const project = structuredClone(compatibilityFixtures[2].project);
    (project.customParts![0] as unknown as Record<string, unknown>).mpn = { malformed: true };

    const response = await post(url, JSON.stringify({ project }));
    expect(response.status).toBe(400);
    expect(runCount).toBe(0);
  });

  it('runs one worker, bounds its queue, and reports results', async () => {
    let active = 0;
    let maxActive = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const url = await serve({ enabled: true, token, run: async () => {
      active++; maxActive = Math.max(active, maxActive);
      await gate;
      active--;
      return { status: 'blocked', tool: { name: 'KiCad', version: null } } as CompatibilityReport;
    } });
    const body = JSON.stringify({ project: compatibilityFixtures[0].project });
    const first = await (await post(url, body)).json();
    for (let i = 0; i < 3; i++) expect((await post(url, body)).status).toBe(202);
    expect((await post(url, body)).status).toBe(429);
    const get = () => fetch(`${url}/jobs/${first.id}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
    expect((await get()).state).toBe('running');
    release();
    await expect.poll(async () => (await get()).state).toBe('finished');
    expect((await get()).report.status).toBe('blocked');
    expect(maxActive).toBe(1);
  });

  it('does not strand the queue when a worker throws', async () => {
    const url = await serve({ enabled: true, token, run: async () => { throw new Error('worker failure'); } });
    const body = JSON.stringify({ project: compatibilityFixtures[0].project });
    for (let i = 0; i < 2; i++) {
      const job = await (await post(url, body)).json();
      await expect.poll(async () => (await (await fetch(`${url}/jobs/${job.id}`, { headers: { Authorization: `Bearer ${token}` } })).json()).state).toBe('failed');
    }
  });
});
