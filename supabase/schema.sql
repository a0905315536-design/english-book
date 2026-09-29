create table if not exists public.word_garden_store (
  id text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.word_garden_store enable row level security;
revoke all on table public.word_garden_store from anon, authenticated;

