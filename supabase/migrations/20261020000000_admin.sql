create extension if not exists pgcrypto with schema extensions;

create table if not exists public.admins (
  username            text primary key check (username ~ '^[a-z][a-z0-9_.-]{2,31}$'),
  pw_hash             text not null,
  created_at          timestamptz not null default now(),
  password_changed_at timestamptz not null default now(),
  last_login_at       timestamptz,
  disabled            boolean not null default false
);

create table if not exists public.admin_sessions (
  token_hash text primary key,
  username   text not null references public.admins (username) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);

create table if not exists public.login_throttle (
  username      text primary key,
  failures      int not null default 0,
  first_failure timestamptz,
  locked_until  timestamptz
);

create table if not exists public.audit_log (
  seq       bigint generated always as identity primary key,
  at        timestamptz not null,
  actor     text not null,
  action    text not null,
  target    text,
  ok        boolean not null,
  detail    jsonb not null default '{}'::jsonb,
  prev_hash text not null,
  hash      text not null
);

create table if not exists public.search_log (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  query    text not null check (length(query) between 1 and 500),
  mode     text not null check (mode in ('semantic', 'keyword', 'hybrid')),
  band     text not null check (band in ('strong', 'plausible', 'weak', 'none')),
  top_case text,
  ms       int
);
create index if not exists search_log_at on public.search_log (at desc);
create index if not exists audit_log_action on public.audit_log (action, at desc);

do $$
declare t text;
begin
  foreach t in array array['admins', 'admin_sessions', 'login_throttle', 'audit_log', 'search_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;

create or replace function public.audit_hash(prev text, at timestamptz, actor text, action text, target text, ok boolean, detail jsonb)
returns text
language sql immutable
set search_path = public, extensions
as $$
  select encode(extensions.digest(
    concat_ws('|', prev, to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), actor, action,
              coalesce(target, ''), ok::text, detail::text), 'sha256'), 'hex')
$$;

create or replace function public.write_audit(p_actor text, p_action text, p_target text, p_ok boolean, p_detail jsonb default '{}'::jsonb)
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  prev text;
  ts   timestamptz := clock_timestamp();
begin
  perform pg_advisory_xact_lock(7461);
  select hash into prev from public.audit_log order by seq desc limit 1;
  prev := coalesce(prev, repeat('0', 64));
  insert into public.audit_log (at, actor, action, target, ok, detail, prev_hash, hash)
  values (ts, p_actor, p_action, p_target, p_ok, coalesce(p_detail, '{}'::jsonb), prev,
          public.audit_hash(prev, ts, p_actor, p_action, p_target, p_ok, coalesce(p_detail, '{}'::jsonb)));
end $$;

create or replace function public.verify_audit_chain()
returns jsonb
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare
  r      record;
  prev   text := repeat('0', 64);
  n      int := 0;
begin
  for r in select * from public.audit_log order by seq loop
    if r.prev_hash <> prev or r.hash <> public.audit_hash(prev, r.at, r.actor, r.action, r.target, r.ok, r.detail) then
      return jsonb_build_object('ok', false, 'entries', n, 'broken_at', r.seq);
    end if;
    prev := r.hash;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'entries', n, 'broken_at', null);
end $$;

create or replace function public.password_problems(p text)
returns text[]
language sql immutable
as $$
  select array_remove(array[
    case when length(p) < 12 then 'at least 12 characters' end,
    case when length(p) > 128 then 'at most 128 characters' end,
    case when p !~ '[a-z]' then 'a lowercase letter' end,
    case when p !~ '[A-Z]' then 'an uppercase letter' end,
    case when p !~ '[0-9]' then 'a digit' end,
    case when p !~ '[^A-Za-z0-9]' then 'a symbol' end
  ], null)
$$;

create or replace function public.admin_create(p_username text, p_password text)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  u        text := lower(trim(p_username));
  problems text[] := public.password_problems(p_password);
  existed  boolean;
begin
  if u !~ '^[a-z][a-z0-9_.-]{2,31}$' then
    raise exception 'A username is 3-32 characters: lowercase letters, digits, dot, dash or underscore, starting with a letter.';
  end if;
  if cardinality(problems) > 0 then
    raise exception 'The password needs %.', array_to_string(problems, ', ');
  end if;
  select true into existed from public.admins where username = u;
  insert into public.admins (username, pw_hash)
  values (u, extensions.crypt(p_password, extensions.gen_salt('bf', 10)))
  on conflict (username) do update
    set pw_hash = excluded.pw_hash, password_changed_at = now(), disabled = false;
  delete from public.admin_sessions where username = u;
  delete from public.login_throttle where username = u;
  perform public.write_audit('cli', case when existed then 'admin.reset' else 'admin.create' end, u, true);
  return jsonb_build_object('username', u, 'created', not coalesce(existed, false));
end $$;

create or replace function public.session_user_for(p_token text)
returns text
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  h text;
  u text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  h := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select s.username into u
  from public.admin_sessions s join public.admins a using (username)
  where s.token_hash = h
    and not a.disabled
    and s.last_seen > now() - interval '15 minutes'
    and s.created_at > now() - interval '8 hours';
  if u is null then
    delete from public.admin_sessions where token_hash = h;
    return null;
  end if;
  update public.admin_sessions set last_seen = now() where token_hash = h;
  return u;
end $$;

create or replace function public.admin_login(p_username text, p_password text)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  u     text := lower(trim(coalesce(p_username, '')));
  a     public.admins;
  t     public.login_throttle;
  good  boolean;
  token text;
begin
  if length(u) not between 1 and 64 or p_password is null or length(p_password) > 256 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select * into t from public.login_throttle where username = u for update;
  if t.locked_until is not null and t.locked_until > now() then
    perform public.write_audit(u, 'login.blocked', u, false, jsonb_build_object('until', t.locked_until));
    return jsonb_build_object('ok', false, 'reason', 'locked',
                              'retry_after', ceil(extract(epoch from t.locked_until - now()))::int);
  end if;

  select * into a from public.admins where username = u;
  if a.username is null then
    perform extensions.crypt(p_password, extensions.gen_salt('bf', 10));
    good := false;
  else
    good := not a.disabled and extensions.crypt(p_password, a.pw_hash) = a.pw_hash;
  end if;

  if not good then
    insert into public.login_throttle as lt (username, failures, first_failure)
    values (u, 1, now())
    on conflict (username) do update set
      failures      = case when lt.first_failure < now() - interval '15 minutes' then 1 else lt.failures + 1 end,
      first_failure = case when lt.first_failure < now() - interval '15 minutes' then now() else lt.first_failure end
    returning * into t;
    if t.failures >= 5 then
      update public.login_throttle set locked_until = now() + interval '15 minutes', failures = 0, first_failure = null
      where username = u;
      perform public.write_audit(u, 'login.locked', u, false, jsonb_build_object('minutes', 15));
      return jsonb_build_object('ok', false, 'reason', 'locked', 'retry_after', 900);
    end if;
    perform public.write_audit(u, 'login.failure', u, false, jsonb_build_object('attempt', t.failures));
    return jsonb_build_object('ok', false, 'reason', 'bad', 'remaining', 5 - t.failures);
  end if;

  delete from public.login_throttle where username = u;
  delete from public.admin_sessions
  where last_seen < now() - interval '15 minutes' or created_at < now() - interval '8 hours';
  token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.admin_sessions (token_hash, username) values (encode(extensions.digest(token, 'sha256'), 'hex'), u);
  update public.admins set last_login_at = now() where username = u;
  perform public.write_audit(u, 'login.success', u, true);
  return jsonb_build_object('ok', true, 'token', token, 'username', u);
end $$;

create or replace function public.admin_session(p_token text)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  u text := public.session_user_for(p_token);
begin
  if u is null then
    return null;
  end if;
  return (select jsonb_build_object('username', a.username, 'last_login_at', a.last_login_at,
                                    'password_changed_at', a.password_changed_at)
          from public.admins a where a.username = u);
end $$;

create or replace function public.admin_logout(p_token text)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  u text := public.session_user_for(p_token);
begin
  if u is not null then
    delete from public.admin_sessions where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
    perform public.write_audit(u, 'session.end', u, true);
  end if;
  return jsonb_build_object('ok', u is not null);
end $$;

create or replace function public.admin_change_password(p_token text, p_current text, p_new text)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  u        text := public.session_user_for(p_token);
  a        public.admins;
  problems text[];
begin
  if u is null then
    return jsonb_build_object('ok', false, 'reason', 'signed out');
  end if;
  select * into a from public.admins where username = u;
  if extensions.crypt(coalesce(p_current, ''), a.pw_hash) <> a.pw_hash then
    perform public.write_audit(u, 'password.change', u, false, jsonb_build_object('why', 'wrong current password'));
    return jsonb_build_object('ok', false, 'reason', 'The current password is wrong.');
  end if;
  problems := public.password_problems(coalesce(p_new, ''));
  if cardinality(problems) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'The new password needs ' || array_to_string(problems, ', ') || '.');
  end if;
  if p_new = p_current then
    return jsonb_build_object('ok', false, 'reason', 'The new password must differ from the current one.');
  end if;
  update public.admins
  set pw_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)), password_changed_at = now()
  where username = u;
  delete from public.admin_sessions
  where username = u and token_hash <> encode(extensions.digest(p_token, 'sha256'), 'hex');
  perform public.write_audit(u, 'password.change', u, true);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.log_search(p_query text, p_mode text, p_band text, p_top text, p_ms int)
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  if (select count(*) from public.search_log where at > now() - interval '1 minute') >= 240 then
    return;
  end if;
  insert into public.search_log (query, mode, band, top_case, ms)
  values (left(trim(p_query), 500), p_mode, p_band, left(p_top, 80), least(greatest(p_ms, 0), 600000));
end $$;

create or replace function public.admin_overview(p_token text, p_days int default 7)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  u     text := public.session_user_for(p_token);
  n_days int := least(greatest(coalesce(p_days, 7), 1), 90);
  since timestamptz;
begin
  if u is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;
  since := date_trunc('day', now()) - make_interval(days => n_days - 1);

  return jsonb_build_object(
    'me', u,
    'days', n_days,
    'usage', (
      select jsonb_build_object(
        'searches', count(*),
        'matched', count(*) filter (where band in ('strong', 'plausible')),
        'distinct', count(distinct lower(query)),
        'p50_ms', coalesce(percentile_cont(0.5) within group (order by ms), 0),
        'p95_ms', coalesce(percentile_cont(0.95) within group (order by ms), 0))
      from public.search_log where at >= since),
    'per_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'searches', coalesce(s.n, 0), 'matched', coalesce(s.m, 0)) order by d), '[]'::jsonb)
      from generate_series(since, date_trunc('day', now()), interval '1 day') d
      left join (
        select date_trunc('day', at) as day, count(*) as n, count(*) filter (where band in ('strong', 'plausible')) as m
        from public.search_log where at >= since group by 1
      ) s on s.day = d),
    'by_mode', (
      select coalesce(jsonb_agg(jsonb_build_object('mode', mode, 'searches', n) order by n desc), '[]'::jsonb)
      from (select mode, count(*) as n from public.search_log where at >= since group by mode) x),
    'by_band', (
      select coalesce(jsonb_agg(jsonb_build_object('band', band, 'searches', n) order by n desc), '[]'::jsonb)
      from (select band, count(*) as n from public.search_log where at >= since group by band) x),
    'by_domain', (
      select coalesce(jsonb_agg(jsonb_build_object('domain', domain, 'label', label, 'searches', n) order by n desc), '[]'::jsonb)
      from (
        select c.domain, dm.label, count(*) as n
        from public.search_log l join public.cases c on c.id = l.top_case join public.domains dm on dm.id = c.domain
        where l.at >= since and l.band in ('strong', 'plausible')
        group by c.domain, dm.label
      ) x),
    'top_cases', (
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'searches', n) order by n desc), '[]'::jsonb)
      from (
        select c.id, c.title, count(*) as n
        from public.search_log l join public.cases c on c.id = l.top_case
        where l.at >= since and l.band in ('strong', 'plausible')
        group by c.id, c.title order by n desc limit 6
      ) x),
    'recent', (
      select coalesce(jsonb_agg(jsonb_build_object('at', at, 'query', query, 'mode', mode, 'band', band, 'top_case', top_case, 'ms', ms) order by at desc), '[]'::jsonb)
      from (select * from public.search_log order by at desc limit 12) x),
    'signins', (
      select jsonb_build_object(
        'success', count(*) filter (where action = 'login.success'),
        'failure', count(*) filter (where action = 'login.failure'),
        'locked',  count(*) filter (where action = 'login.locked'),
        'blocked', count(*) filter (where action = 'login.blocked'))
      from public.audit_log where at >= now() - interval '7 days'),
    'audit', (
      select coalesce(jsonb_agg(jsonb_build_object('seq', seq, 'at', at, 'actor', actor, 'action', action, 'target', target, 'ok', ok, 'detail', detail) order by seq desc), '[]'::jsonb)
      from (select * from public.audit_log order by seq desc limit 14) x),
    'chain', public.verify_audit_chain(),
    'admins', (
      select coalesce(jsonb_agg(jsonb_build_object('username', username, 'created_at', created_at, 'last_login_at', last_login_at,
                                                   'password_changed_at', password_changed_at, 'disabled', disabled) order by username), '[]'::jsonb)
      from public.admins),
    'sessions', (select count(*) from public.admin_sessions
                 where last_seen > now() - interval '15 minutes' and created_at > now() - interval '8 hours'),
    'rls', (
      select jsonb_agg(jsonb_build_object('table', relname, 'rls', relrowsecurity) order by relname)
      from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'),
    'corpus', public.corpus_stats()
  );
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.audit_hash(text, timestamptz, text, text, text, boolean, jsonb)',
    'public.write_audit(text, text, text, boolean, jsonb)',
    'public.verify_audit_chain()',
    'public.password_problems(text)',
    'public.admin_create(text, text)',
    'public.session_user_for(text)',
    'public.admin_login(text, text)',
    'public.admin_session(text)',
    'public.admin_logout(text)',
    'public.admin_change_password(text, text, text)',
    'public.log_search(text, text, text, text, int)',
    'public.admin_overview(text, int)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

grant execute on function public.admin_login(text, text)                      to anon, authenticated;
grant execute on function public.admin_session(text)                          to anon, authenticated;
grant execute on function public.admin_logout(text)                           to anon, authenticated;
grant execute on function public.admin_change_password(text, text, text)      to anon, authenticated;
grant execute on function public.admin_overview(text, int)                    to anon, authenticated;
grant execute on function public.log_search(text, text, text, text, int)      to anon, authenticated;
