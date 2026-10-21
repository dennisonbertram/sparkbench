// Production server: the built app (dist/) plus the same API the Vite dev server mounts.
// Run: npm run build && npm run server   (PORT defaults to 3000)
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { handleApi } from './api';
import { mode } from './tenancy/context';
import { db } from './db';

const DIST = join(process.cwd(), 'dist');
const PORT = Number(process.env.PORT ?? 3000);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.py': 'text/plain; charset=utf-8',
};

/** The simulator needs SharedArrayBuffer, which needs cross-origin isolation on every response. */
function isolate(res: any) {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

const isAccount = (url: string) => /^\/account(\.html)?(\?|$)/.test(url);

function serveStatic(url: string, res: any) {
  const path = isAccount(url) ? '/account.html' : decodeURIComponent(url.split('?')[0]);
  const file = normalize(join(DIST, path));
  const inside = file === DIST || file.startsWith(DIST + sep);
  const target = inside && existsSync(file) && statSync(file).isFile() ? file : join(DIST, 'index.html'); // single-page app
  res.setHeader('Content-Type', TYPES[extname(target)] ?? 'application/octet-stream');
  // Hashed build assets never change; the page itself must always be fresh.
  res.setHeader('Cache-Control', target.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.end(readFileSync(target));
}

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/ is missing: run `npm run build` first.');
  process.exit(1);
}
if (mode() === 'hosted') {
  for (const k of ['CLERK_SECRET_KEY', 'CLERK_PUBLISHABLE_KEY', 'DATABASE_URL']) if (!process.env[k]) console.warn(`Warning: ${k} is not set (needed in hosted mode).`);
}
await db(); // open and migrate before taking traffic

createServer(async (req, res) => {
  // The account page (Clerk sign-in, organizations) must not be isolated; everything else must be.
  if (!isAccount(req.url ?? '')) isolate(res);
  try {
    if (await handleApi(req as any, res)) return;
    serveStatic(req.url ?? '/', res);
  } catch (e: any) {
    if (!res.headersSent) res.statusCode = 500;
    res.end(String(e?.message ?? e));
  }
}).listen(PORT, () => console.log(`Sparkbench (${mode()} mode) on http://localhost:${PORT}`));
