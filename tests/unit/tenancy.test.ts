// Tenant isolation through the real API handler: two workspaces must never see or change each
// other's projects, gallery entries, classes, rooms, circuit-board jobs or parts.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import { handleApi } from '../../server/api';
import { useMemoryDb, db } from '../../server/db';
import { setVerifier, contextFromClaims } from '../../server/tenancy/context';
import { forgetWorkspaces, recordPcbJob, saveWorkspacePart } from '../../server/tenancy/repo';

interface Who {
  user: string;
  org?: string;
  role?: 'org:admin' | 'org:member';
}
const A: Who = { user: 'user_alice', org: 'org_school_a', role: 'org:member' };
const A_ADMIN: Who = { user: 'user_head', org: 'org_school_a', role: 'org:admin' };
const B: Who = { user: 'user_bob', org: 'org_school_b', role: 'org:admin' };

async function call(method: string, url: string, who: Who | null, payload?: unknown) {
  const req: any = Readable.from(payload === undefined ? [] : [Buffer.from(JSON.stringify(payload))]);
  req.method = method;
  req.url = url;
  req.headers = who ? { 'x-test-user': who.user, 'x-test-org': who.org ?? '', 'x-test-role': who.role ?? '' } : {};
  const out: { status: number; body: any; text: string } = { status: 200, body: null, text: '' };
  await new Promise<void>((resolve) => {
    const res: any = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      setHeader(k: string, v: string) {
        this.headers[k] = v;
      },
      writeHead(code: number) {
        this.statusCode = code;
        resolve();
      },
      write(t: string) {
        out.text += t;
      },
      on() {},
      end(t?: string) {
        if (t) out.text += t;
        resolve();
      },
    };
    handleApi(req, res).then(() => {
      out.status = res.statusCode;
    });
    // writeHead/end resolve; status is read after the microtask below
    setTimeout(() => {
      out.status = res.statusCode;
    }, 0);
  });
  await new Promise((r) => setTimeout(r, 5));
  try {
    out.body = JSON.parse(out.text);
  } catch {}
  return out;
}

const project = (id: string, name = 'Lamp') => ({ id, name, board: 'pico', parts: [], wires: [], files: {}, notes: [], createdAt: 1, updatedAt: 1, version: 1 });

beforeAll(() => {
  process.env.SPARKBENCH_MODE = 'hosted';
  setVerifier(async (req) => {
    const h = req.headers as Record<string, string>;
    return h['x-test-user'] ? { userId: h['x-test-user'], orgId: h['x-test-org'] || null, orgRole: h['x-test-role'] || null } : null;
  });
});
afterAll(() => {
  setVerifier(null);
  delete process.env.SPARKBENCH_MODE;
});
beforeEach(async () => {
  forgetWorkspaces();
  await useMemoryDb();
});

describe('who is asking', () => {
  it('turns verified claims into a workspace, never trusting the client', () => {
    expect(contextFromClaims({ userId: 'user_1', orgId: 'org_1', orgRole: 'org:admin' })).toEqual({ userId: 'user_1', workspaceId: 'org_1', kind: 'org', role: 'admin' });
    expect(contextFromClaims({ userId: 'user_1' })).toEqual({ userId: 'user_1', workspaceId: 'user_1', kind: 'personal', role: 'admin' });
  });
  it('refuses signed-out requests but answers health and config', async () => {
    expect((await call('GET', '/api/projects', null)).status).toBe(401);
    expect((await call('GET', '/api/health', null)).status).toBe(200);
    expect((await call('GET', '/api/config', null)).body.mode).toBe('hosted');
  });
});

describe('projects', () => {
  it('stay inside their workspace', async () => {
    expect((await call('PUT', '/api/projects/p1', A, { project: project('p1') })).status).toBe(200);
    expect((await call('GET', '/api/projects', A)).body.projects.map((p: any) => p.id)).toEqual(['p1']);
    expect((await call('GET', '/api/projects', B)).body.projects).toEqual([]);
    expect((await call('GET', '/api/projects/p1', B)).status).toBe(404);
    expect((await call('DELETE', '/api/projects/p1', B)).status).toBe(404);
    // B saving the same id makes B's own copy; A's is untouched.
    await call('PUT', '/api/projects/p1', B, { project: project('p1', 'Bob lamp') });
    expect((await call('GET', '/api/projects/p1', A)).body.project.name).toBe('Lamp');
  });
  it('separate a person’s personal workspace from their organization', async () => {
    await call('PUT', '/api/projects/p2', A, { project: project('p2') });
    expect((await call('GET', '/api/projects', { user: A.user })).body.projects).toEqual([]);
  });
  it('import only adds, never overwrites', async () => {
    await call('PUT', '/api/projects/p3', A, { project: project('p3', 'Server copy') });
    const r = await call('POST', '/api/projects/import', A, { projects: [project('p3', 'Browser copy'), project('p4')] });
    expect(r.body.imported).toBe(1);
    expect((await call('GET', '/api/projects/p3', A)).body.project.name).toBe('Server copy');
  });
  it('chats are per workspace', async () => {
    await call('PUT', '/api/projects/p1/chat', A, { messages: [{ role: 'user', text: 'hi' }] });
    expect((await call('GET', '/api/projects/p1/chat', A)).body.messages).toHaveLength(1);
    expect((await call('GET', '/api/projects/p1/chat', B)).body.messages).toEqual([]);
  });
});

describe('gallery', () => {
  it('workspace entries are private; public ones are shared; only the author can take them down', async () => {
    const priv = (await call('POST', '/api/gallery', A, { project: project('g1'), author: 'Alice', blurb: 'x' })).body;
    const pub = (await call('POST', '/api/gallery', A, { project: project('g2', 'Public lamp'), author: 'Alice', blurb: 'y', visibility: 'public' })).body;
    const seenByB = (await call('GET', '/api/gallery', B)).body.entries.map((e: any) => e.id);
    expect(seenByB).toContain(pub.id);
    expect(seenByB).not.toContain(priv.id);
    expect((await call('GET', `/api/gallery/${priv.id}`, B)).status).toBe(404);
    expect((await call('POST', `/api/gallery/${pub.id}/delete`, B, {})).status).toBe(403);
    expect((await call('POST', '/api/gallery', B, { project: project('g2'), author: 'Bob', blurb: 'hijack', update: { id: pub.id } })).status).toBe(403);
    // one like per person
    await call('POST', `/api/gallery/${pub.id}/like`, B, {});
    const liked = (await call('POST', `/api/gallery/${pub.id}/like`, B, {})).body;
    expect(liked.likes).toBe(1);
    expect((await call('POST', `/api/gallery/${pub.id}/delete`, A, {})).status).toBe(200);
  });
});

describe('classes', () => {
  it('students in any workspace can join by code; only the class’s teachers see the dashboard', async () => {
    const cls = (await call('POST', '/api/class', A, { title: 'Blink', requirements: ['An LED blinks'] })).body;
    expect((await call('GET', `/api/class/${cls.code}`, B)).status).toBe(200);
    expect((await call('GET', `/api/class/${cls.code}/dashboard`, B)).status).toBe(403);
    expect((await call('GET', `/api/class/${cls.code}/dashboard`, A)).status).toBe(200);
    expect((await call('GET', `/api/class/${cls.code}/dashboard`, A_ADMIN)).status).toBe(200);
    expect((await call('GET', `/api/class/${cls.code}/dashboard`, { user: 'user_carol', org: A.org, role: 'org:member' })).status).toBe(403);
  });
});

describe('live rooms', () => {
  it('only the room’s workspace can follow or change it', async () => {
    const { room } = (await call('POST', '/api/room', A, { project: project('r1') })).body;
    expect((await call('POST', `/api/room/${room}/update`, B, { project: project('r1', 'Hacked'), version: 1, by: 'Bob' })).body.ok).toBe(false);
    expect((await call('POST', `/api/room/${room}/comment`, B, { target: 'D1', text: 'hi', by: 'Bob' })).status).toBe(404);
    expect((await call('GET', `/api/room/${room}/events?name=Bob`, B)).status).toBe(404);
    expect((await call('POST', `/api/room/${room}/update`, A, { project: project('r1', 'Edited'), version: 1, by: 'Alice' })).body.ok).toBe(true);
  });
});

describe('circuit boards and parts', () => {
  it('a board job id grants nothing outside its workspace', async () => {
    const { contextFromClaims: ctxOf } = await import('../../server/tenancy/context');
    await recordPcbJob(ctxOf({ userId: A.user, orgId: A.org, orgRole: A.role }), 'job123');
    expect((await call('GET', '/api/pcb/status?id=job123', B)).status).toBe(404);
  });
  it('parts a workspace adds are only in its own library', async () => {
    const { contextFromClaims: ctxOf } = await import('../../server/tenancy/context');
    await saveWorkspacePart(ctxOf({ userId: A.user, orgId: A.org, orgRole: A.role }), { type: 'custom-secret', mpn: 'SECRET1', name: 'Secret sensor', pins: [], sim: { kind: 'none' } } as any);
    const has = async (w: Who) => (await call('GET', '/api/parts', w)).body.parts.some((p: any) => p.type === 'custom-secret');
    expect(await has(A)).toBe(true);
    expect(await has(B)).toBe(false);
  });
});

describe('limits', () => {
  it('stops AI calls when the workspace allowance is used up', async () => {
    await call('GET', '/api/me', B);
    await (await db()).query("UPDATE workspaces SET ai_budget_usd = 0 WHERE id = 'org_school_b'");
    const r = await call('POST', '/api/ai/explain', B, { project: project('x'), file: 'main.py', line: 1 });
    expect(r.status).toBe(402);
  });
  it('refuses over-the-air pushes from the hosted server', async () => {
    expect((await call('POST', '/api/ota', A, { host: '10.0.0.5', projectId: 'p', files: {} })).status).toBe(400);
  });
});
