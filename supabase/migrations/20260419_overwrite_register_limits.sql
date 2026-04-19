create table if not exists public.overwrite_register_limits (
  email text primary key,
  last_used_at timestamptz not null default now()
);

alter table public.overwrite_register_limits enable row level security;

create index if not exists overwrite_register_limits_last_used_at_idx
on public.overwrite_register_limits(last_used_at);

