// The database: Postgres when hosted (DATABASE_URL), an embedded Postgres (PGlite) file in
// data/db when running locally, and an in-memory PGlite in tests. Migrations in ./migrations run
// once, in name order, the first time the database is used.
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Db {
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

const MIGRATIONS = join(fileURLToPath(new URL('.', import.meta.url)), 'migrations');
export const dataDir = () => process.env.DATA_DIR ?? join(process.cwd(), 'data');

async function pglite(dir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dir) mkdirSync(dir, { recursive: true });
  const pg = dir ? new PGlite(dir) : new PGlite();
  return {
    query: async (sql, params) => (await pg.query(sql, params as any[])).rows as any[],
    close: () => pg.close(),
  };
}

async function postgres(url: string): Promise<Db> {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  return {
    query: async (sql, params) => (await pool.query(sql, params as any[])).rows,
    close: () => pool.end(),
  };
}

async function migrate(db: Db) {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await db.query<{ name: string }>('SELECT name FROM schema_migrations')).map((r) => r.name));
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    for (const stmt of readFileSync(join(MIGRATIONS, f), 'utf8').split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await db.query(stmt);
    await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
  }
}

let current: Promise<Db> | null = null;

/** The app's database, opened and migrated on first use. */
export function db(): Promise<Db> {
  current ??= (async () => {
    const url = process.env.DATABASE_URL;
    const d = url ? await postgres(url) : await pglite(process.env.SPARKBENCH_DB === 'memory' ? undefined : join(dataDir(), 'db'));
    await migrate(d);
    return d;
  })();
  return current;
}

/** Tests: a fresh in-memory database. */
export async function useMemoryDb(): Promise<Db> {
  if (current) await (await current).close().catch(() => {});
  const d = await pglite();
  await migrate(d);
  current = Promise.resolve(d);
  return d;
}
