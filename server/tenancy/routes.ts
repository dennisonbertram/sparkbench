// Project storage and "who am I" routes. Everything is scoped to the request's workspace.
import type { IncomingMessage } from 'node:http';
import type { RequestContext } from './context';
import { mode } from './context';
import * as repo from './repo';
import type { Project } from '../../src/core/types';

type Send = (res: any, status: number, data: unknown) => void;
type Body = (req: IncomingMessage) => Promise<any>;

const MAX_IMPORT = 500;

/** Returns true when it handled the request. */
export async function projectRoutes(req: IncomingMessage, res: any, ctx: RequestContext, route: string, body: Body, send: Send): Promise<boolean> {
  if (route === '/api/me' && req.method === 'GET') {
    const [spent, budget] = await Promise.all([repo.aiSpentThisMonth(ctx), repo.aiBudget(ctx)]);
    send(res, 200, { mode: mode(), userId: ctx.userId, workspaceId: ctx.workspaceId, kind: ctx.kind, role: ctx.role, ai: { spentUsd: spent, budgetUsd: budget } });
    return true;
  }
  if (route === '/api/projects' && req.method === 'GET') {
    send(res, 200, { projects: await repo.listProjects(ctx) });
    return true;
  }
  if (route === '/api/projects/import' && req.method === 'POST') {
    const { projects } = await body(req);
    if (!Array.isArray(projects)) return (send(res, 400, { error: 'Send { projects: [...] }.' }), true);
    let n = 0;
    for (const p of projects.slice(0, MAX_IMPORT) as Project[]) {
      if (!p?.id || (await repo.getProject(ctx, p.id))) continue; // never overwrite what's already in the workspace
      await repo.saveProject(ctx, p);
      n++;
    }
    send(res, 200, { imported: n });
    return true;
  }
  const m = /^\/api\/projects\/([\w-]{1,100})(\/chat)?$/.exec(route);
  if (!m) return false;
  const [, id, chat] = m;
  if (chat) {
    if (req.method === 'GET') send(res, 200, { messages: await repo.getChat(ctx, id) });
    else if (req.method === 'PUT') {
      const { messages } = await body(req);
      await repo.saveChat(ctx, id, Array.isArray(messages) ? messages : []);
      send(res, 200, { ok: true });
    } else send(res, 405, { error: 'method not allowed' });
    return true;
  }
  if (req.method === 'GET') {
    const p = await repo.getProject(ctx, id);
    p ? send(res, 200, { project: p }) : send(res, 404, { error: 'not found' });
  } else if (req.method === 'PUT') {
    const { project } = await body(req);
    if (!project || project.id !== id) return (send(res, 400, { error: 'The project id must match the address.' }), true);
    await repo.saveProject(ctx, project);
    send(res, 200, { ok: true });
  } else if (req.method === 'DELETE') {
    (await repo.deleteProject(ctx, id)) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'not found' });
  } else send(res, 405, { error: 'method not allowed' });
  return true;
}
