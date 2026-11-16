-- CHASE database, milestone 1: player profiles.
-- Run this once in the Supabase dashboard (SQL Editor) after creating the project.
-- Also turn on anonymous sign-ins: Authentication > Sign In / Providers > Anonymous.

create table if not exists public.players (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 16),
  photo_url text,
  games int not null default 0,
  wins int not null default 0,
  catches int not null default 0,
  best_survival_sec int not null default 0,
  created_at timestamptz not null default now()
);

-- Row level security: rules that decide which rows each signed-in phone may touch.
alter table public.players enable row level security;

-- Anyone signed in can see nicknames and photos (needed for lobbies and results).
create policy "players are readable by signed-in users"
  on public.players for select
  to authenticated
  using (true);

-- A phone can only create and change its own profile.
create policy "a player can create their own profile"
  on public.players for insert
  to authenticated
  with check (auth.uid() = id);

create policy "a player can update their own profile"
  on public.players for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Profile photos: a public bucket where each phone may write only its own file.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "a player can upload their own photo"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and name = auth.uid()::text || '.jpg');

create policy "a player can replace their own photo"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and name = auth.uid()::text || '.jpg');
