-- LOKTRON backend persistence.
-- The Node service is the only database client. These tables intentionally
-- expose no Data API access to anon/authenticated roles.

create table if not exists public.loktron_state (
  key text primary key check (key = 'main'),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.loktron_files (
  name text primary key check (name ~ '^[A-Za-z0-9._-]{1,180}$'),
  mime text not null check (mime in ('image/png', 'image/jpeg', 'image/webp')),
  content_b64 text not null,
  updated_at timestamptz not null default now()
);

alter table public.loktron_state enable row level security;
alter table public.loktron_files enable row level security;

revoke all on table public.loktron_state from anon, authenticated;
revoke all on table public.loktron_files from anon, authenticated;
grant all on table public.loktron_state to service_role;
grant all on table public.loktron_files to service_role;
