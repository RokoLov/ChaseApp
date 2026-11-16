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

-- ───────────────────────── Milestone 4: playing Battle Royale ─────────────────────────

alter table public.game_players
  add column role text check (role in ('hider', 'hunter')),
  add column hunter_since timestamptz,
  add column hunter_reason text check (hunter_reason in ('start', 'caught', 'zone', 'signal')),
  add column caught_by uuid references public.players (id),
  add column catches int not null default 0,
  add column last_seen timestamptz;

alter table public.games
  add column winners uuid[] not null default '{}',
  add column end_reason text check (end_reason in ('last_hider', 'all_caught', 'time')),
  add column initial_hiders int;

-- Each player's 4-digit catch code. A phone can read only its own.
create table public.catch_codes (
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  code text not null,
  primary key (game_id, player_id),
  unique (game_id, code)
);
alter table public.catch_codes enable row level security;
create policy "a player can read their own catch code"
  on public.catch_codes for select to authenticated
  using (player_id = (select auth.uid()));

-- Each player's latest position. One row per player, overwritten on every update.
create table public.positions (
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy real,
  updated_at timestamptz not null default now(),
  primary key (game_id, player_id)
);
alter table public.positions enable row level security;

-- Hunters may see each other. Nobody else's position is readable directly.
create function public.can_see_position(p_game uuid, p_owner uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.game_players me
    join public.game_players them on them.game_id = me.game_id
    where me.game_id = p_game
      and me.player_id = (select auth.uid())
      and them.player_id = p_owner
      and me.role = 'hunter'
      and them.role = 'hunter'
  );
$$;

create policy "own position, and hunters see hunters"
  on public.positions for select to authenticated
  using (player_id = (select auth.uid()) or public.can_see_position(game_id, player_id));

-- What happened in a game: start, catches, zone exits, lost signal, end.
create table public.events (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  type text not null check (type in ('start', 'caught', 'zone', 'signal', 'end')),
  actor uuid references public.players (id) on delete set null,
  target uuid references public.players (id) on delete set null,
  at timestamptz not null default now()
);
create index events_game_idx on public.events (game_id, id);
alter table public.events enable row level security;
create policy "members can see the events of their game"
  on public.events for select to authenticated
  using (public.is_game_member(game_id));

-- The backend's clock, so every phone counts down from the same time.
create function public.server_now()
returns timestamptz
language sql stable set search_path = ''
as $$ select now(); $$;

-- Distance between two positions in metres.
create function public.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql immutable set search_path = ''
as $$
  select 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

-- End the game when no hider is left, or when one is left out of several.
create function public.finish_if_done(p_game uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_left int;
  v_initial int;
begin
  select count(*) into v_left from public.game_players where game_id = p_game and role = 'hider';
  select initial_hiders into v_initial from public.games where id = p_game and status = 'running';
  if not found then return; end if;
  if v_left = 0 or (v_left = 1 and v_initial >= 2) then
    update public.games set
      status = 'ended',
      ended_at = now(),
      winners = array(select player_id from public.game_players where game_id = p_game and role = 'hider'),
      end_reason = case when v_left = 0 then 'all_caught' else 'last_hider' end
    where id = p_game;
    insert into public.events (game_id, type) values (p_game, 'end');
  end if;
end;
$$;

-- Turn a hider into a hunter, record why, and check whether the game is over.
create function public.make_hunter(p_game uuid, p_player uuid, p_reason text, p_by uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.game_players set
    role = 'hunter', hunter_since = now(), hunter_reason = p_reason, caught_by = p_by
  where game_id = p_game and player_id = p_player and role = 'hider';
  if not found then return; end if;
  insert into public.events (game_id, type, actor, target) values (p_game, p_reason, p_by, p_player);
  perform public.finish_if_done(p_game);
end;
$$;

-- The host starts the game. Hunters are picked at random unless the host names them.
create function public.start_game(p_game uuid, p_hunters uuid[] default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_game public.games%rowtype;
  v_n int;
  v_k int;
begin
  select * into v_game from public.games where id = p_game for update;
  if not found or v_game.host_id <> v_uid or v_game.status <> 'lobby' then
    raise exception 'NOT_HOST';
  end if;
  select count(*) into v_n from public.game_players where game_id = p_game;
  if v_n < 2 then raise exception 'NEED_TWO_PLAYERS'; end if;
  if exists (select 1 from public.game_players where game_id = p_game and not ready) then
    raise exception 'NOT_ALL_READY';
  end if;

  update public.game_players set
    role = 'hider', hunter_since = null, hunter_reason = null, caught_by = null,
    catches = 0, last_seen = now()
  where game_id = p_game;

  if p_hunters is not null and cardinality(p_hunters) > 0 then
    v_k := cardinality(p_hunters);
    if v_k > v_n - 1 or exists (
      select 1 from unnest(p_hunters) h
      where h not in (select player_id from public.game_players where game_id = p_game)
    ) then
      raise exception 'BAD_HUNTERS';
    end if;
    update public.game_players set role = 'hunter', hunter_since = now(), hunter_reason = 'start'
      where game_id = p_game and player_id = any (p_hunters);
  else
    v_k := coalesce(nullif((v_game.settings->>'hunters')::int, 0), case when v_n >= 8 then 2 else 1 end);
    v_k := greatest(1, least(v_k, v_n - 1));
    update public.game_players set role = 'hunter', hunter_since = now(), hunter_reason = 'start'
      where game_id = p_game and player_id in (
        select player_id from public.game_players where game_id = p_game order by random() limit v_k
      );
  end if;

  delete from public.catch_codes where game_id = p_game;
  insert into public.catch_codes (game_id, player_id, code)
  select p_game, pl.player_id, c.code
  from (select player_id, row_number() over () as rn from public.game_players where game_id = p_game) pl
  join (select n::text as code, row_number() over (order by random()) as rn from generate_series(1000, 9999) n) c
    on c.rn = pl.rn;

  delete from public.positions where game_id = p_game;
  delete from public.events where game_id = p_game;
  update public.games set
    status = 'running', started_at = now(), ended_at = null, winners = '{}', end_reason = null,
    initial_hiders = v_n - v_k
  where id = p_game;
  insert into public.events (game_id, type) values (p_game, 'start');
end;
$$;

-- A phone reports that it is still there, and its position when the reading is good enough.
create function public.report_position(p_game uuid, p_lat double precision, p_lng double precision, p_accuracy real)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  update public.game_players set last_seen = now() where game_id = p_game and player_id = v_uid;
  if not found then return; end if;
  if p_lat is not null and p_lng is not null then
    insert into public.positions (game_id, player_id, lat, lng, accuracy, updated_at)
    values (p_game, v_uid, p_lat, p_lng, p_accuracy, now())
    on conflict (game_id, player_id) do update
      set lat = excluded.lat, lng = excluded.lng, accuracy = excluded.accuracy, updated_at = now();
  end if;
end;
$$;

-- A hunter catches a hider by their code. Returns the caught player's id.
create function public.catch_player(p_game uuid, p_code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_game public.games%rowtype;
  v_target uuid;
  v_far boolean;
begin
  select * into v_game from public.games where id = p_game for update;
  if not found or v_game.status <> 'running' then raise exception 'NOT_RUNNING'; end if;
  if not exists (select 1 from public.game_players where game_id = p_game and player_id = v_uid and role = 'hunter') then
    raise exception 'NOT_HUNTER';
  end if;
  if now() < v_game.started_at + make_interval(mins => (v_game.settings->>'hideMin')::int) then
    raise exception 'HIDE_TIME';
  end if;
  select cc.player_id into v_target
  from public.catch_codes cc
  join public.game_players gp on gp.game_id = cc.game_id and gp.player_id = cc.player_id
  where cc.game_id = p_game and cc.code = trim(p_code) and gp.role = 'hider';
  if v_target is null then raise exception 'WRONG_CODE'; end if;

  -- Sanity check: when both phones reported a fresh position, they must be near each other.
  select public.distance_m(a.lat, a.lng, b.lat, b.lng) > 250 into v_far
  from public.positions a, public.positions b
  where a.game_id = p_game and a.player_id = v_uid
    and b.game_id = p_game and b.player_id = v_target
    and a.updated_at > now() - interval '90 seconds'
    and b.updated_at > now() - interval '90 seconds';
  if coalesce(v_far, false) then raise exception 'TOO_FAR'; end if;

  update public.game_players set catches = catches + 1 where game_id = p_game and player_id = v_uid;
  perform public.make_hunter(p_game, v_target, 'caught', v_uid);
  return v_target;
end;
$$;

-- A hider's own phone reports that it stayed outside the zone past the warning.
create function public.zone_out(p_game uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_game public.games%rowtype;
begin
  select * into v_game from public.games where id = p_game for update;
  if not found or v_game.status <> 'running' then return; end if;
  if now() < v_game.started_at + make_interval(mins => (v_game.settings->>'hideMin')::int) then return; end if;
  perform public.make_hunter(p_game, (select auth.uid()), 'zone', null);
end;
$$;

-- Any phone in the game can ask the backend to deal with hiders silent for over 2 minutes.
create function public.sweep_signal(p_game uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_player uuid;
begin
  if not public.is_game_member(p_game) then return; end if;
  select * into v_game from public.games where id = p_game for update;
  if not found or v_game.status <> 'running' then return; end if;
  if now() < v_game.started_at + make_interval(mins => (v_game.settings->>'hideMin')::int) then return; end if;
  for v_player in
    select player_id from public.game_players
    where game_id = p_game and role = 'hider' and last_seen < now() - interval '2 minutes'
  loop
    perform public.make_hunter(p_game, v_player, 'signal', null);
  end loop;
end;
$$;

-- End the game when the timer has run out. Safe to call more than once.
create function public.end_game(p_game uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_game public.games%rowtype;
begin
  if not public.is_game_member(p_game) then return; end if;
  select * into v_game from public.games where id = p_game for update;
  if not found or v_game.status <> 'running' then return; end if;
  if now() < v_game.started_at + make_interval(mins => (v_game.settings->>'gameMin')::int) then return; end if;
  update public.games set
    status = 'ended', ended_at = now(), end_reason = 'time',
    winners = array(select player_id from public.game_players where game_id = p_game and role = 'hider')
  where id = p_game;
  insert into public.events (game_id, type) values (p_game, 'end');
end;
$$;

-- Hunters get the hiders' positions, but only for 20 seconds after each zone shrink.
-- The timing matches src/lib/br.ts.
create function public.get_reveal(p_game uuid)
returns table (player_id uuid, lat double precision, lng double precision)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_hide_end timestamptz;
  v_end timestamptz;
  v_stages int;
  v_step interval;
  v_k int;
begin
  select * into v_game from public.games where id = p_game;
  if not found or v_game.status <> 'running' then return; end if;
  if not coalesce((v_game.settings->>'revealOnShrink')::boolean, true) then return; end if;
  if not exists (
    select 1 from public.game_players gp
    where gp.game_id = p_game and gp.player_id = (select auth.uid()) and gp.role = 'hunter'
  ) then return; end if;
  v_hide_end := v_game.started_at + make_interval(mins => (v_game.settings->>'hideMin')::int);
  v_end := v_game.started_at + make_interval(mins => (v_game.settings->>'gameMin')::int);
  v_stages := (v_game.settings->>'zoneStages')::int;
  v_step := (v_end - v_hide_end) / (v_stages + 1);
  for v_k in 1..v_stages loop
    if now() >= v_hide_end + v_step * v_k and now() < v_hide_end + v_step * v_k + interval '20 seconds' then
      return query
        select p.player_id, p.lat, p.lng
        from public.positions p
        join public.game_players gp on gp.game_id = p.game_id and gp.player_id = p.player_id
        where p.game_id = p_game and gp.role = 'hider';
      return;
    end if;
  end loop;
end;
$$;

-- After a game the host can send everyone back to the lobby for another round.
create function public.reset_game(p_game uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.games set
    status = 'lobby', started_at = null, ended_at = null, winners = '{}', end_reason = null, initial_hiders = null
  where id = p_game and host_id = (select auth.uid()) and status = 'ended';
  if not found then raise exception 'NOT_HOST'; end if;
  update public.game_players set
    ready = false, role = null, hunter_since = null, hunter_reason = null, caught_by = null, catches = 0
  where game_id = p_game;
  delete from public.positions where game_id = p_game;
  delete from public.catch_codes where game_id = p_game;
  delete from public.events where game_id = p_game;
end;
$$;

-- Leaving in the middle of a game can end it (for example when the last hider leaves).
create or replace function public.leave_game(p_game uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_next uuid;
begin
  perform 1 from public.games where id = p_game for update;
  delete from public.game_players where game_id = p_game and player_id = v_uid;
  delete from public.positions where game_id = p_game and player_id = v_uid;
  select player_id into v_next from public.game_players
    where game_id = p_game order by joined_at limit 1;
  if v_next is null then
    delete from public.games where id = p_game;
  else
    update public.games set host_id = v_next where id = p_game and host_id = v_uid;
    perform public.finish_if_done(p_game);
  end if;
end;
$$;

-- Internal helpers are not callable from phones; the rest only by signed-in phones.
revoke execute on function public.finish_if_done(uuid) from public, anon, authenticated;
revoke execute on function public.make_hunter(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.can_see_position(uuid, uuid) from public, anon;
revoke execute on function public.start_game(uuid, uuid[]) from public, anon;
revoke execute on function public.report_position(uuid, double precision, double precision, real) from public, anon;
revoke execute on function public.catch_player(uuid, text) from public, anon;
revoke execute on function public.zone_out(uuid) from public, anon;
revoke execute on function public.sweep_signal(uuid) from public, anon;
revoke execute on function public.end_game(uuid) from public, anon;
revoke execute on function public.get_reveal(uuid) from public, anon;
revoke execute on function public.reset_game(uuid) from public, anon;
revoke execute on function public.server_now() from public, anon;
grant execute on function public.can_see_position(uuid, uuid) to authenticated;
grant execute on function public.start_game(uuid, uuid[]) to authenticated;
grant execute on function public.report_position(uuid, double precision, double precision, real) to authenticated;
grant execute on function public.catch_player(uuid, text) to authenticated;
grant execute on function public.zone_out(uuid) to authenticated;
grant execute on function public.sweep_signal(uuid) to authenticated;
grant execute on function public.end_game(uuid) to authenticated;
grant execute on function public.get_reveal(uuid) to authenticated;
grant execute on function public.reset_game(uuid) to authenticated;
grant execute on function public.server_now() to authenticated;

alter publication supabase_realtime add table public.events;
