-- Every row belongs to one workspace: a Clerk organization (org_…), a personal workspace (user_…)
-- or the single local workspace ('local'). Repositories always filter by workspace_id.

CREATE TABLE workspaces (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('org', 'personal', 'local')),
  ai_budget_usd numeric NOT NULL DEFAULT 20,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id text NOT NULL,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  owner_id text NOT NULL,
  name text NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, id)
);
CREATE INDEX projects_recent ON projects (workspace_id, updated_at DESC);

CREATE TABLE project_chats (
  workspace_id text NOT NULL REFERENCES workspaces(id),
  project_id text NOT NULL,
  messages jsonb NOT NULL,
  PRIMARY KEY (workspace_id, project_id)
);

CREATE TABLE workspace_parts (
  workspace_id text NOT NULL REFERENCES workspaces(id),
  type text NOT NULL,
  spec jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, type)
);

CREATE TABLE gallery_entries (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  author_id text NOT NULL,
  visibility text NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('workspace', 'public')),
  entry jsonb NOT NULL,
  project jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gallery_ws ON gallery_entries (workspace_id);
CREATE INDEX gallery_public ON gallery_entries (visibility) WHERE visibility = 'public';

CREATE TABLE gallery_likes (
  entry_id text NOT NULL REFERENCES gallery_entries(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  PRIMARY KEY (entry_id, user_id)
);

CREATE TABLE classes (
  code text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  teacher_id text NOT NULL,
  assignment jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX classes_ws ON classes (workspace_id);

CREATE TABLE class_submissions (
  id text PRIMARY KEY,
  class_code text NOT NULL REFERENCES classes(code) ON DELETE CASCADE,
  student_id text NOT NULL,
  student_name text NOT NULL,
  project jsonb NOT NULL,
  grade jsonb NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX submissions_class ON class_submissions (class_code);

CREATE TABLE rooms (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  project jsonb NOT NULL,
  version integer NOT NULL DEFAULT 0,
  comments jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pcb_jobs (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pcb_jobs_ws ON pcb_jobs (workspace_id);

CREATE TABLE ai_usage (
  workspace_id text NOT NULL REFERENCES workspaces(id),
  user_id text NOT NULL,
  route text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  usd numeric NOT NULL DEFAULT 0,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_month ON ai_usage (workspace_id, at);
