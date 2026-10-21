// Who is asking, and in which workspace. Every repository call takes a RequestContext, so no query
// can run without a workspace. Local mode (the default) has one implicit workspace and no sign-in;
// hosted mode verifies the Clerk session cookie (or bearer token) on every request.
import type { IncomingMessage } from 'node:http';

export type Mode = 'local' | 'hosted';
export const mode = (): Mode => (process.env.SPARKBENCH_MODE === 'hosted' ? 'hosted' : 'local');

export interface RequestContext {
  userId: string;
  /** `org_…` (a Clerk organization), `user_…` (a personal workspace) or `local`. */
  workspaceId: string;
  kind: 'org' | 'personal' | 'local';
  role: 'admin' | 'member';
}

export const LOCAL_CONTEXT: RequestContext = { userId: 'local', workspaceId: 'local', kind: 'local', role: 'admin' };

export class AuthError extends Error {
  status = 401;
}

/** The claims we need from a verified session, whatever verified it. */
export interface SessionClaims {
  userId: string;
  orgId?: string | null;
  orgRole?: string | null;
}
export type Verifier = (req: IncomingMessage) => Promise<SessionClaims | null>;

let verifier: Verifier | null = null;
/** Tests replace Clerk with their own verifier. */
export function setVerifier(v: Verifier | null) {
  verifier = v;
}

let clerk: any;
async function clerkVerifier(req: IncomingMessage): Promise<SessionClaims | null> {
  if (!process.env.CLERK_SECRET_KEY) throw new Error('CLERK_SECRET_KEY is not set (needed in hosted mode).');
  const { createClerkClient } = await import('@clerk/backend');
  clerk ??= createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY, publishableKey: process.env.CLERK_PUBLISHABLE_KEY });
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'http';
  const url = new URL(req.url ?? '/', `${proto}://${req.headers.host ?? 'localhost'}`);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const state = await clerk.authenticateRequest(new Request(url, { headers }), {
    authorizedParties: process.env.SPARKBENCH_ORIGIN ? [process.env.SPARKBENCH_ORIGIN] : undefined,
  });
  if (!state.isSignedIn) return null;
  const auth = state.toAuth();
  return { userId: auth.userId, orgId: auth.orgId, orgRole: auth.orgRole };
}

/** Builds the context from a verified session; never trusts anything the client says about itself. */
export function contextFromClaims(c: SessionClaims): RequestContext {
  if (c.orgId) return { userId: c.userId, workspaceId: c.orgId, kind: 'org', role: c.orgRole === 'org:admin' ? 'admin' : 'member' };
  return { userId: c.userId, workspaceId: c.userId, kind: 'personal', role: 'admin' };
}

export async function getContext(req: IncomingMessage): Promise<RequestContext> {
  if (mode() === 'local' && !verifier) return LOCAL_CONTEXT;
  const claims = await (verifier ?? clerkVerifier)(req);
  if (!claims) throw new AuthError('Sign in to use Sparkbench.');
  return contextFromClaims(claims);
}
