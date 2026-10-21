// Per-person limits on the expensive routes when hosted (AI, server-side simulation, circuit boards),
// so one account can't monopolise the shared server. A sliding one-minute window, in memory
// (the service runs as a single instance).
import type { RequestContext } from './context';

const LIMITS: [RegExp, number][] = [
  [/^\/api\/pcb\/(start|enclosure)$/, 6],
  [/^\/api\/(ai\/|parts\/fetch$)/, 20],
  [/^\/api\/(tests\/run|power|multimeter|selftest|sourcing|kicad\/render|spice\/run)$/, 30],
];
const hits = new Map<string, number[]>();

export class RateLimitError extends Error {
  status = 429;
}

export function checkRate(ctx: RequestContext, route: string, now = Date.now()) {
  if (ctx.kind === 'local') return;
  const rule = LIMITS.find(([re]) => re.test(route));
  if (!rule) return;
  const key = `${ctx.userId}:${rule[0].source}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= rule[1]) throw new RateLimitError('Too many requests in a minute: wait a moment and try again.');
  recent.push(now);
  hits.set(key, recent);
}
