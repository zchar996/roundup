-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query)
-- before deploying the app.

create table if not exists groups (
  code text primary key,
  name text not null,
  friends jsonb not null default '[]'::jsonb,
  availability jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table groups enable row level security;

-- Since friends join via a group code (not a login), anyone with the code
-- can read/write that group's row. This matches the app's "no sign-up,
-- just the code" design. Do not store sensitive data in group names or
-- friend names.
create policy "Anyone can read groups"
  on groups for select
  using (true);

create policy "Anyone can insert groups"
  on groups for insert
  with check (true);

create policy "Anyone can update groups"
  on groups for update
  using (true);

-- Enable realtime so all devices see updates live without refreshing.
alter publication supabase_realtime add table groups;
