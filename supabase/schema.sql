-- CHASE database. This file is a copy of what has been applied to the Supabase project,
-- in order. Anonymous sign-ins must also be on:
-- Authentication > Sign In / Providers > Allow anonymous sign-ins.

-- ───────────────────────── Milestone 1: player profiles ─────────────────────────

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

create policy "players are readable by signed-in users"
  on public.players for select to authenticated using (true);

create policy "a player can create their own profile"
  on public.players for insert to authenticated with check (auth.uid() = id);

create policy "a player can update their own profile"
  on public.players for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- Profile photos: a public bucket where each phone may write only its own file.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "a player can upload their own photo"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and name = auth.uid()::text || '.jpg');

create policy "a player can replace their own photo"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and name = auth.uid()::text || '.jpg');

-- ───────────────────────── Milestone 2: games and the lobby ─────────────────────────

create table public.games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host_id uuid not null references public.players (id),
  mode text not null default 'battle_royale'
    check (mode in ('battle_royale', 'sardines', 'cops_robbers')),
  status text not null default 'lobby' check (status in ('lobby', 'running', 'ended')),
  preset text not null default 'classic' check (preset in ('quick', 'classic', 'custom')),
  settings jsonb not null default '{}'::jsonb,
  area jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);

create table public.game_players (
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (game_id, player_id)
);

create index game_players_player_idx on public.game_players (player_id);

alter table public.games enable row level security;
alter table public.game_players enable row level security;

-- Is the signed-in phone a player in this game?
create function public.is_game_member(p_game uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.game_players gp
    where gp.game_id = p_game and gp.player_id = (select auth.uid())
  );
$$;

-- Players can only see games they are in, and the players of those games.
-- All changes go through the functions below, so there are no write policies.
create policy "members can see their game"
  on public.games for select to authenticated
  using (public.is_game_member(id));

create policy "members can see the players of their game"
  on public.game_players for select to authenticated
  using (public.is_game_member(game_id));

-- Create a game and join it as host. Returns the 6-character join code.
create function public.create_game(p_mode text, p_preset text, p_settings jsonb)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_code text;
  v_game uuid;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if v_uid is null or not exists (select 1 from public.players where id = v_uid) then
    raise exception 'NO_PROFILE';
  end if;
  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * 32)::int, 1), '')
      into v_code from generate_series(1, 6);
    exit when not exists (select 1 from public.games where code = v_code);
  end loop;
  insert into public.games (code, host_id, mode, preset, settings)
    values (v_code, v_uid, p_mode, p_preset, coalesce(p_settings, '{}'::jsonb))
    returning id into v_game;
  insert into public.game_players (game_id, player_id) values (v_game, v_uid);
  return v_code;
end;
$$;

-- Join a lobby by code. Safe to call again if already in the game.
create function public.join_game(p_code text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_game public.games%rowtype;
begin
  if v_uid is null or not exists (select 1 from public.players where id = v_uid) then
    raise exception 'NO_PROFILE';
  end if;
  select * into v_game from public.games where code = upper(trim(p_code)) for update;
  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;
  if exists (select 1 from public.game_players where game_id = v_game.id and player_id = v_uid) then
    return v_game.code;
  end if;
  if v_game.status <> 'lobby' then
    raise exception 'GAME_STARTED';
  end if;
  if (select count(*) from public.game_players where game_id = v_game.id) >= 10 then
    raise exception 'GAME_FULL';
  end if;
  insert into public.game_players (game_id, player_id) values (v_game.id, v_uid);
  return v_game.code;
end;
$$;

create function public.set_ready(p_game uuid, p_ready boolean)
returns void
language sql security definer set search_path = ''
as $$
  update public.game_players set ready = p_ready
  where game_id = p_game and player_id = (select auth.uid());
$$;

-- Leave a game. The host role passes to whoever joined next; an empty game is removed.
create function public.leave_game(p_game uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_next uuid;
begin
  perform 1 from public.games where id = p_game for update;
  delete from public.game_players where game_id = p_game and player_id = v_uid;
  select player_id into v_next from public.game_players
    where game_id = p_game order by joined_at limit 1;
  if v_next is null then
    delete from public.games where id = p_game;
  else
    update public.games set host_id = v_next where id = p_game and host_id = v_uid;
  end if;
end;
$$;

-- The host can remove a player while the game is still in the lobby.
create function public.kick_player(p_game uuid, p_player uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.games
    where id = p_game and host_id = (select auth.uid()) and status = 'lobby'
  ) then
    raise exception 'NOT_HOST';
  end if;
  if p_player = (select auth.uid()) then
    raise exception 'CANNOT_KICK_SELF';
  end if;
  delete from public.game_players where game_id = p_game and player_id = p_player;
end;
$$;

-- Only signed-in phones may call the functions.
revoke execute on function public.is_game_member(uuid) from public, anon;
revoke execute on function public.create_game(text, text, jsonb) from public, anon;
revoke execute on function public.join_game(text) from public, anon;
revoke execute on function public.set_ready(uuid, boolean) from public, anon;
revoke execute on function public.leave_game(uuid) from public, anon;
revoke execute on function public.kick_player(uuid, uuid) from public, anon;
grant execute on function public.is_game_member(uuid) to authenticated;
grant execute on function public.create_game(text, text, jsonb) to authenticated;
grant execute on function public.join_game(text) to authenticated;
grant execute on function public.set_ready(uuid, boolean) to authenticated;
grant execute on function public.leave_game(uuid) to authenticated;
grant execute on function public.kick_player(uuid, uuid) to authenticated;

-- Send live updates for these tables to the phones in the game.
alter publication supabase_realtime add table public.games, public.game_players;

-- ───────────────────────── Milestone 3: the play area ─────────────────────────

-- A game is now created together with its play area.
drop function public.create_game(text, text, jsonb);

create function public.create_game(p_mode text, p_preset text, p_settings jsonb, p_area jsonb)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_code text;
  v_game uuid;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if v_uid is null or not exists (select 1 from public.players where id = v_uid) then
    raise exception 'NO_PROFILE';
  end if;
  -- The play area is a circle (centre and radius in metres) or a polygon (3 to 30 corners).
  if p_area is null
     or not (
       (p_area->>'type' = 'circle'
          and jsonb_array_length(p_area->'center') = 2
          and (p_area->>'radiusM')::numeric between 25 and 500)
       or
       (p_area->>'type' = 'polygon'
          and jsonb_array_length(p_area->'points') between 3 and 30)
     ) then
    raise exception 'BAD_AREA';
  end if;
  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * 32)::int, 1), '')
      into v_code from generate_series(1, 6);
    exit when not exists (select 1 from public.games where code = v_code);
  end loop;
  insert into public.games (code, host_id, mode, preset, settings, area)
    values (v_code, v_uid, p_mode, p_preset, coalesce(p_settings, '{}'::jsonb), p_area)
    returning id into v_game;
  insert into public.game_players (game_id, player_id) values (v_game, v_uid);
  return v_code;
end;
$$;

revoke execute on function public.create_game(text, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_game(text, text, jsonb, jsonb) to authenticated;
