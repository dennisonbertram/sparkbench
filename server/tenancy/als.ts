// The current request's context, reachable from deep inside the AI helpers (for usage metering)
// without threading it through every function.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestContext } from './context';

export const requestScope = new AsyncLocalStorage<{ ctx: RequestContext; route: string }>();
export const currentRequest = () => requestScope.getStore();
