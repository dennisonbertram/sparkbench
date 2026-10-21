# Multitenant Sparkbench (Clerk + Railway)

Status: built on branch `multitenancy` (server, client, Docker/Railway); a live Clerk sign-in test is pending keys.

## Goals

- People sign in with Clerk and work inside a **workspace**: a Clerk Organization (a school, team or company) or their own personal workspace.
- Everything a person makes (projects, chats, parts they add, gallery entries, classes, live rooms, circuit-board jobs, AI usage) belongs to exactly one workspace, and no request can read or change another workspace's data.
- The whole app runs as one service on Railway with Railway Postgres, including the KiCad/Freerouting circuit-board pipeline.
- Running locally stays exactly as it is today (no sign-in, browser storage, Claude CLI), so development, the test suites and the parts pipeline keep working.

## Non-goals (for this phase)

- Billing and paid plans (we only meter AI use and enforce a per-workspace monthly cap).
- Contributing parts to the shared public library (designed below as phase 2; not built now).
- Horizontal scaling to several app instances (one instance; see "Scaling later").

## Today

| Area | Where it lives today | Problem when shared |
|---|---|---|
| Projects + chat | browser `localStorage` | lost across devices; no ownership |
| Gallery, classes, rooms | JSON files in `data/` via `server/community.ts` | global to everyone; ownership by secret edit keys |
| Parts added with "Add any component" | written into `.claude/skills/part-*` on the server | one workspace's parts appear for everyone |
| Checked parts library (572) | `.claude/skills/part-*` in the repo | fine: read-only, shared by all |
| Circuit-board jobs | in-memory map + `$TMPDIR/sparkbench-pcb` | any job id is readable by anyone |
| AI | `claude -p` CLI or `ANTHROPIC_API_KEY` | CLI uses a personal subscription; no cost control |
| OTA push to a board | server calls `http://<board-ip>` | from the cloud this reaches the server's network, not the user's (SSRF) |
| Server | Vite dev-server plugin only (`server/api.ts`) | no production server exists |

## Architecture

```
Browser (React + Clerk)  ──cookie __session──▶  Node server (one Railway service, Docker)
                                                 ├─ static dist/ with COOP/COEP headers
                                                 ├─ /api/* handler (same code as the Vite plugin)
                                                 │    └─ auth: Clerk → RequestContext {userId, workspaceId, role}
                                                 ├─ repositories (every query takes the context)
                                                 ├─ PCB worker (KiCad, Freerouting, Java in the image)
                                                 └─ volume /data (PCB job files)
                                          ──────▶ Railway Postgres
                                          ──────▶ Anthropic API (server key, metered per workspace)
```

- **One handler, two hosts.** `server/api.ts` becomes a plain `(req, res) => Promise<boolean>` handler. The Vite plugin mounts it in development; a new `server/index.ts` mounts it in production beside the built `dist/`, adding the cross-origin-isolation headers the simulator needs.
- **Modes.** `SPARKBENCH_MODE=local` (default): no auth, a single implicit workspace `local`, browser storage, file-based community data (today's behaviour). `SPARKBENCH_MODE=hosted`: Clerk required, Postgres required, API-key AI only, server-side OTA disabled.

## Identity and tenancy

- **Clerk** handles sign-up, sign-in and organizations. The browser sends Clerk's `__session` cookie on every same-origin request (including `EventSource`), so most `fetch` calls don't change.
- The server verifies the session with `@clerk/backend` (`authenticateRequest`, networkless JWT verification) and builds a `RequestContext`:
  - `userId`: the Clerk user id.
  - `workspaceId`: `org_…` (the active organization) or `user_…` (the personal workspace when no org is active).
  - `role`: `admin` (Clerk `org:admin`, or the owner of a personal workspace) or `member`.
- **Every repository function takes the context first** and always filters by `workspace_id`. There is no query path without a context, and a test suite proves workspace A can't see or change workspace B's rows through any API route.
- Workspace rows are created lazily on first request (`workspaces(id, kind, name, created_at, ai_budget_usd)`).

## Data model (Postgres)

All tables carry `workspace_id text not null` and are indexed on it.

| Table | Key columns | Notes |
|---|---|---|
| `workspaces` | `id`, `kind` (org/personal), `name`, `ai_budget_usd` | created on first use |
| `projects` | `id`, `workspace_id`, `owner_id`, `name`, `data jsonb`, `updated_at` | `data` is the whole `Project` (it already embeds its custom parts) |
| `project_chats` | `project_id`, `workspace_id`, `messages jsonb` | last 60 messages, as today |
| `workspace_parts` | `workspace_id`, `type`, `spec jsonb`, `skill text`, `created_by` | parts from "Add any component"; unique `(workspace_id, type)` |
| `gallery_entries` | `id`, `workspace_id`, `author_id`, `author_name`, `visibility` (`workspace`/`public`), `entry jsonb`, `project jsonb`, `likes` | publishing is owner-only; public entries are readable by anyone signed in |
| `gallery_likes` | `entry_id`, `user_id` | one like per person (replaces the anonymous counter) |
| `classes` | `code`, `workspace_id`, `teacher_id`, `assignment jsonb` | created by workspace admins or members |
| `class_submissions` | `id`, `class_code`, `student_id`, `student_name`, `project jsonb`, `grade jsonb` | students join by code from any workspace; only the class's workspace sees the dashboard |
| `rooms` | `id`, `workspace_id`, `project jsonb`, `version`, `comments jsonb` | live editing; only members of the room's workspace may join |
| `pcb_jobs` | `id`, `workspace_id`, `user_id`, `status`, `log jsonb`, `result jsonb`, `dir` | files on the `/data` volume under `pcb/<workspace>/<job>` |
| `ai_usage` | `workspace_id`, `user_id`, `route`, `input_tokens`, `output_tokens`, `usd`, `at` | monthly sum checked before each AI call |

Teacher keys and gallery edit keys go away in hosted mode: ownership is the signed-in user.

Migrations are plain SQL files in `server/db/migrations/`, applied at startup. Tests run against **PGlite** (in-process Postgres), so no database server is needed for `npm test`.

## API changes

- Every `/api/*` route runs through `withContext`. Unauthenticated hosted requests get `401` (except `/api/status` and `/api/health`).
- New routes: `GET/PUT/DELETE /api/projects[/:id]`, `GET/PUT /api/projects/:id/chat`, `POST /api/projects/import` (bulk import from browser storage), `GET /api/me` (user, workspace, role, AI budget left).
- `GET /api/parts` returns the shared checked library **plus** the workspace's own parts. `POST /api/parts/fetch` stores the new part in `workspace_parts` (hosted) instead of writing a skill folder.
- PCB routes check the job's workspace; job ids alone grant nothing.
- `POST /api/ota` returns `400 "Over-the-air updates need the desktop app"` in hosted mode (the cloud can't reach a board on the user's Wi-Fi, and allowing arbitrary hosts would be a server-side request forgery hole).
- AI routes call `ai_usage.assertBudget(ctx)` first and record usage after; over budget returns `402` with a clear message.

## Client changes

- `ClerkProvider` at the root, with **clerk-js bundled** rather than loaded from Clerk's CDN, because the app is cross-origin isolated (COEP `require-corp`) and cross-origin scripts without CORP headers are blocked. Avatars from `img.clerk.com` may be blocked for the same reason; the header uses initials if so.
- Header: `OrganizationSwitcher` (with personal workspace) and `UserButton`. Switching workspace reloads the project list.
- Storage: `store.ts` persistence goes through a small `storage` interface with two implementations, `localStorage` (local mode) and the API (hosted mode). The editor keeps working offline-tolerant: saves are debounced and retried.
- First sign-in in a browser that has local projects: "Import 12 projects saved in this browser into <workspace>?" (calls `/api/projects/import`).
- Community UI: name fields are prefilled from Clerk; teacher keys disappear in hosted mode.

## Library contributions

- **Now:** parts a person adds are private to their workspace (`workspace_parts`). The 572 checked parts ship in the image and are shared read-only.
- **Phase 2 (designed, not built):** a "Submit to the public library" action queues the part; a worker runs the same gate as the overnight waves (part check on both boards, blind second datasheet reading, quote-checked resolution) and a maintainer approves before it joins the shared library. A "this part is wrong on real hardware" report attaches to any library part.

## AI in hosted mode

- Only the Anthropic API backend (`ANTHROPIC_API_KEY`); the CLI backend is refused in hosted mode.
- Per-workspace monthly budget (default USD 20, set per workspace in the table), metered from token usage reported by the API.

## Deployment (Railway)

- `Dockerfile`: Node 22 on Debian; KiCad 9 (`kicad-cli`, Python bindings), OpenJDK + Freerouting 2.5.0, ngspice; `npm ci && npm run build`; `CMD node server/index.ts`.
- Railway: one service from the Dockerfile, a Postgres plugin (`DATABASE_URL`), a volume at `/data`, a health check on `/api/health`.
- Environment: `SPARKBENCH_MODE=hosted`, `CLERK_PUBLISHABLE_KEY` (also exposed as `VITE_CLERK_PUBLISHABLE_KEY` at build time), `CLERK_SECRET_KEY`, `DATABASE_URL`, `ANTHROPIC_API_KEY`, `DATA_DIR=/data`.

## Security checklist

- Tenant isolation enforced in repositories, plus a cross-tenant test for every route.
- No secrets in the client bundle (only the Clerk publishable key).
- Request body size limit; JSON parsing errors return 400.
- Rate limit AI and PCB routes per user.
- OTA disabled server-side in hosted mode.
- Job files are only served after a workspace check, with path traversal guarded as today.

## Scaling later

Live rooms keep their connections in process, so the service runs as a single instance. Moving rooms to Postgres `LISTEN/NOTIFY` (or Redis) and PCB jobs to a separate worker would allow more instances.

## Build plan

1. Refactor the API into a host-agnostic handler; add `server/index.ts` (production server) and `/api/health`.
2. Auth: `RequestContext`, local mode stub, Clerk verification in hosted mode.
3. Database: migrations, PGlite in tests, repositories with mandatory context.
4. Move projects/chats, workspace parts, community (gallery, classes, rooms), PCB job ownership and AI metering onto the repositories.
5. Client: Clerk provider and header, API-backed storage, import from browser storage.
6. Dockerfile and `railway.json`.
7. Tests: unit (repositories, isolation, context), existing suites in local mode, a hosted-mode smoke test (server + PGlite + a test Clerk token verifier).
