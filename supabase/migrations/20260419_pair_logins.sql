create table if not exists public.pair_logins (
  code text primary key,
  status text not null default 'pending',
  access_token text,
  refresh_token text,
  user_id uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists pair_logins_expires_at_idx on public.pair_logins(expires_at);

