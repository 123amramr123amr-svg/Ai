create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text,
  prompt text not null,
  status text not null default 'pending' check (status in ('pending','running','completed','failed','cancelled')),
  result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on tasks (user_id, created_at desc);

create table messages (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool','system')),
  content text not null,
  created_at timestamptz not null default now()
);
create index on messages (task_id, created_at);

create table artifacts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete set null,
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('webapp','slide','video','image','doc','other')),
  title text,
  url text,
  created_at timestamptz not null default now()
);
create index on artifacts (user_id, created_at desc);

create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table connectors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,
  status text not null default 'connected' check (status in ('connected','disconnected','error')),
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid not null references connectors(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  created_at timestamptz not null default now()
);

create table automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  schedule text,
  prompt text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  balance_cents integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table team_members (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  primary key (team_id, user_id)
);
