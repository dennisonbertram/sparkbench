// Workspace-scoped data access. Every function takes the RequestContext first and filters by its
// workspace, so a caller can't read or change another workspace's rows.
import { db } from '../db';
import type { RequestContext } from './context';
import type { Project } from '../../src/core/types';
import type { CustomPartSpec } from '../../src/core/customParts';

const known = new Set<string>();
/** Creates the workspace row the first time it's seen. */
export async function ensureWorkspace(ctx: RequestContext) {
  if (known.has(ctx.workspaceId)) return;
  await (await db()).query('INSERT INTO workspaces (id, kind) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [ctx.workspaceId, ctx.kind]);
  known.add(ctx.workspaceId);
}
/** Tests reset the database between cases. */
export function forgetWorkspaces() {
  known.clear();
}

async function q<T = any>(ctx: RequestContext, sql: string, params: unknown[] = []): Promise<T[]> {
  await ensureWorkspace(ctx);
  return (await db()).query<T>(sql, params);
}

// ------------------------------------------------------------------ projects
export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
}

export async function listProjects(ctx: RequestContext): Promise<Project[]> {
  const rows = await q<{ data: Project }>(ctx, 'SELECT data FROM projects WHERE workspace_id = $1 ORDER BY updated_at DESC', [ctx.workspaceId]);
  return rows.map((r) => r.data);
}

export async function getProject(ctx: RequestContext, id: string): Promise<Project | null> {
  const rows = await q<{ data: Project }>(ctx, 'SELECT data FROM projects WHERE workspace_id = $1 AND id = $2', [ctx.workspaceId, id]);
  return rows[0]?.data ?? null;
}

export async function saveProject(ctx: RequestContext, p: Project): Promise<void> {
  if (!p?.id || typeof p.id !== 'string' || p.id.length > 100) throw new Error('A project needs an id.');
  await q(
    ctx,
    `INSERT INTO projects (id, workspace_id, owner_id, name, data, updated_at) VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (workspace_id, id) DO UPDATE SET name = EXCLUDED.name, data = EXCLUDED.data, updated_at = now()`,
    [p.id, ctx.workspaceId, ctx.userId, String(p.name ?? 'Untitled').slice(0, 200), JSON.stringify(p)],
  );
}

export async function deleteProject(ctx: RequestContext, id: string): Promise<boolean> {
  const rows = await q(ctx, 'DELETE FROM projects WHERE workspace_id = $1 AND id = $2 RETURNING id', [ctx.workspaceId, id]);
  await q(ctx, 'DELETE FROM project_chats WHERE workspace_id = $1 AND project_id = $2', [ctx.workspaceId, id]);
  return rows.length > 0;
}

export async function getChat(ctx: RequestContext, projectId: string): Promise<unknown[]> {
  const rows = await q<{ messages: unknown[] }>(ctx, 'SELECT messages FROM project_chats WHERE workspace_id = $1 AND project_id = $2', [ctx.workspaceId, projectId]);
  return rows[0]?.messages ?? [];
}

export async function saveChat(ctx: RequestContext, projectId: string, messages: unknown[]): Promise<void> {
  await q(
    ctx,
    `INSERT INTO project_chats (workspace_id, project_id, messages) VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, project_id) DO UPDATE SET messages = EXCLUDED.messages`,
    [ctx.workspaceId, projectId, JSON.stringify((messages ?? []).slice(-60))],
  );
}

// ------------------------------------------------------------------ parts added by this workspace
export async function listWorkspaceParts(ctx: RequestContext): Promise<CustomPartSpec[]> {
  const rows = await q<{ spec: CustomPartSpec }>(ctx, 'SELECT spec FROM workspace_parts WHERE workspace_id = $1 ORDER BY created_at', [ctx.workspaceId]);
  return rows.map((r) => r.spec);
}

export async function saveWorkspacePart(ctx: RequestContext, spec: CustomPartSpec): Promise<void> {
  await q(
    ctx,
    `INSERT INTO workspace_parts (workspace_id, type, spec, created_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (workspace_id, type) DO UPDATE SET spec = EXCLUDED.spec`,
    [ctx.workspaceId, spec.type, JSON.stringify(spec), ctx.userId],
  );
}

// ------------------------------------------------------------------ circuit-board jobs
export async function recordPcbJob(ctx: RequestContext, id: string): Promise<void> {
  await q(ctx, 'INSERT INTO pcb_jobs (id, workspace_id, user_id) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING', [id, ctx.workspaceId, ctx.userId]);
}

/** A job id only grants access inside the workspace that started it. */
export async function ownsPcbJob(ctx: RequestContext, id: string): Promise<boolean> {
  const rows = await q(ctx, 'SELECT 1 FROM pcb_jobs WHERE id = $1 AND workspace_id = $2', [id, ctx.workspaceId]);
  return rows.length > 0;
}

// ------------------------------------------------------------------ AI usage and budget
/** USD per million tokens used for metering (set AI_PRICE_INPUT / AI_PRICE_OUTPUT to the model's real prices). */
export const PRICE_PER_MTOK = { input: Number(process.env.AI_PRICE_INPUT ?? 5), output: Number(process.env.AI_PRICE_OUTPUT ?? 25) };

export async function aiSpentThisMonth(ctx: RequestContext): Promise<number> {
  const rows = await q<{ usd: string | null }>(ctx, "SELECT sum(usd) AS usd FROM ai_usage WHERE workspace_id = $1 AND at >= date_trunc('month', now())", [ctx.workspaceId]);
  return Number(rows[0]?.usd ?? 0);
}

export async function aiBudget(ctx: RequestContext): Promise<number> {
  const rows = await q<{ ai_budget_usd: string }>(ctx, 'SELECT ai_budget_usd FROM workspaces WHERE id = $1', [ctx.workspaceId]);
  return Number(rows[0]?.ai_budget_usd ?? 0);
}

export class BudgetError extends Error {
  status = 402;
}

export async function assertAiBudget(ctx: RequestContext): Promise<void> {
  if (ctx.kind === 'local') return;
  const [spent, budget] = await Promise.all([aiSpentThisMonth(ctx), aiBudget(ctx)]);
  if (spent >= budget) throw new BudgetError(`This workspace has used its AI allowance for the month ($${budget.toFixed(2)}). An admin can raise it.`);
}

export async function recordAiUsage(ctx: RequestContext, route: string, input: number, output: number): Promise<void> {
  const usd = (input * PRICE_PER_MTOK.input + output * PRICE_PER_MTOK.output) / 1e6;
  await q(ctx, 'INSERT INTO ai_usage (workspace_id, user_id, route, input_tokens, output_tokens, usd) VALUES ($1, $2, $3, $4, $5, $6)', [ctx.workspaceId, ctx.userId, route, input, output, usd]);
}
