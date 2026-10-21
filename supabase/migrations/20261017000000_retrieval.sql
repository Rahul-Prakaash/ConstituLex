create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create or replace function public.fold(t text) returns text
language sql immutable strict parallel safe
set search_path = public, extensions
as $$ select lower(extensions.unaccent('extensions.unaccent'::regdictionary, t)) $$;

create or replace function public.join_text(parts text[]) returns text
language sql immutable parallel safe
as $$ select coalesce(array_to_string(parts, ' '), '') $$;

create table if not exists public.domains (
  id    text primary key,
  label text not null
);

create table if not exists public.org_types (
  id    text primary key,
  label text not null
);

create table if not exists public.articles (
  id      text primary key,
  number  int,
  label   text not null,
  title   text,
  body    text,
  part    text,
  kind    text,
  ik_doc  int
);

create table if not exists public.cases (
  id              text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title           text not null check (length(title) >= 5),
  citation        text not null,
  court           text not null,
  year            int  not null check (year between 1950 and 2100),
  domain          text not null references public.domains (id),
  org_type        text not null references public.org_types (id),
  summary         text not null,
  excerpts        text[] not null default '{}',
  keywords        text[] not null default '{}',
  source_url      text not null check (source_url ~ '^https?://'),
  bench           text,
  judgment_date   date,
  outcome         jsonb,
  parties         jsonb,
  statutes        jsonb not null default '[]',
  pdf_path        text,
  pdf_pages       int,
  embedding       extensions.vector(384) not null,
  embedding_model text not null,
  search          tsvector generated always as (
                    setweight(to_tsvector('english', public.fold(title)), 'A') ||
                    setweight(to_tsvector('english', public.fold(summary)), 'B') ||
                    setweight(to_tsvector('english', public.fold(public.join_text(excerpts))), 'C') ||
                    setweight(to_tsvector('english', public.fold(public.join_text(keywords))), 'D')
                  ) stored
);

create table if not exists public.case_articles (
  case_id    text not null references public.cases (id) on delete cascade,
  article_id text not null references public.articles (id),
  primary key (case_id, article_id)
);

create index if not exists cases_embedding_hnsw on public.cases
  using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists cases_search_gin on public.cases using gin (search);
create index if not exists cases_title_trgm on public.cases
  using gin (public.fold(title) extensions.gin_trgm_ops);
create index if not exists cases_domain_year on public.cases (domain, year desc);
create index if not exists case_articles_article on public.case_articles (article_id);

create or replace view public.case_cards with (security_invoker = true) as
select c.id, c.title, c.citation, c.court, c.year, c.domain, d.label as domain_label,
       c.org_type, o.label as org_label, c.summary, c.excerpts, c.outcome, c.parties,
       c.statutes, c.pdf_path,
       coalesce((select array_agg(ca.article_id order by a.number nulls last, ca.article_id)
                 from public.case_articles ca join public.articles a on a.id = ca.article_id
                 where ca.case_id = c.id), '{}') as articles
from public.cases c
join public.domains d on d.id = c.domain
join public.org_types o on o.id = c.org_type;

alter table public.domains       enable row level security;
alter table public.org_types     enable row level security;
alter table public.articles      enable row level security;
alter table public.cases         enable row level security;
alter table public.case_articles enable row level security;

do $$
declare t text;
begin
  foreach t in array array['domains', 'org_types', 'articles', 'cases', 'case_articles'] loop
    if not exists (select from pg_policies where schemaname = 'public' and tablename = t and policyname = 'public read') then
      execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
    end if;
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;

grant select on public.case_cards to anon, authenticated;

create or replace function public.match_cases(
  query_embedding extensions.vector(384),
  match_count     int  default 5,
  filter_domain   text default null
)
returns table (id text, similarity double precision)
language sql stable
set search_path = public, extensions
as $$
  select c.id, greatest(0, 1 - (c.embedding <=> query_embedding))::float8
  from public.cases c
  where filter_domain is null or c.domain = filter_domain
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 50);
$$;

create or replace function public.keyword_cases(
  query_text    text,
  match_count   int  default 5,
  filter_domain text default null
)
returns table (id text, score double precision, rank real, snippet text, matched_by text)
language plpgsql stable
set search_path = public, extensions
as $$
declare
  q tsquery := nullif(replace(websearch_to_tsquery('english', public.fold(coalesce(query_text, '')))::text, ' & ', ' | '), '')::tsquery;
  lim int := least(greatest(match_count, 1), 50);
begin
  if q is not null then
    return query
      with hits as (
        select c.id, ts_rank_cd('{0.1, 0.3, 0.5, 1.0}', c.search, q) as r, c.summary
        from public.cases c
        where c.search @@ q and (filter_domain is null or c.domain = filter_domain)
        order by r desc, c.id
        limit lim
      )
      select h.id, (h.r / nullif(max(h.r) over (), 0))::float8, h.r,
             ts_headline('english', h.summary, q,
                         'StartSel=«, StopSel=», MaxWords=30, MinWords=14, MaxFragments=1'),
             'full text'
      from hits h
      order by h.r desc, h.id;
    if found then
      return;
    end if;
  end if;

  return query
    select c.id, extensions.word_similarity(public.fold(query_text), public.fold(c.title))::float8,
           0::real, left(c.summary, 220), 'trigram'
    from public.cases c
    where extensions.word_similarity(public.fold(query_text), public.fold(c.title)) >= 0.35
      and (filter_domain is null or c.domain = filter_domain)
    order by 2 desc, c.id
    limit lim;
end;
$$;

create or replace function public.hybrid_cases(
  query_text      text,
  query_embedding extensions.vector(384),
  match_count     int  default 5,
  rrf_k           int  default 60,
  filter_domain   text default null
)
returns table (id text, score double precision, similarity double precision,
               semantic_rank int, keyword_rank int)
language sql stable
set search_path = public, extensions
as $$
  with sem as (
    select m.id, m.similarity, row_number() over (order by m.similarity desc)::int as r
    from public.match_cases(query_embedding, 20, filter_domain) m
  ),
  kw as (
    select k.id, row_number() over (order by k.score desc)::int as r
    from public.keyword_cases(query_text, 20, filter_domain) k
  )
  select coalesce(sem.id, kw.id),
         (coalesce(1.0 / (rrf_k + sem.r), 0) + coalesce(1.0 / (rrf_k + kw.r), 0))::float8,
         coalesce(sem.similarity,
                  greatest(0, 1 - ((select c.embedding from public.cases c where c.id = kw.id) <=> query_embedding)))::float8,
         sem.r, kw.r
  from sem full join kw on kw.id = sem.id
  order by 2 desc, 3 desc
  limit least(greatest(match_count, 1), 50);
$$;

create or replace function public.related_cases(case_id text, max_count int default 6)
returns table (id text, title text, year int, domain text, shared_articles text[], same_org boolean)
language sql stable
set search_path = public, extensions
as $$
  select o.id, o.title, o.year, o.domain, coalesce(s.shared, '{}'), o.org_type = c.org_type
  from public.cases c
  join public.cases o on o.id <> c.id
  left join lateral (
    select array_agg(b.article_id order by b.article_id) as shared
    from public.case_articles a
    join public.case_articles b on b.article_id = a.article_id
    where a.case_id = c.id and b.case_id = o.id
  ) s on true
  where c.id = related_cases.case_id and (s.shared is not null or o.org_type = c.org_type)
  order by cardinality(coalesce(s.shared, '{}')) desc, (o.org_type = c.org_type) desc, o.year desc, o.id
  limit least(greatest(max_count, 1), 30);
$$;

create or replace function public.cases_by_ids(ids text[])
returns setof public.case_cards
language sql stable
set search_path = public, extensions
as $$ select * from public.case_cards where id = any(ids) $$;

create or replace function public.case_detail(case_id text)
returns jsonb
language sql stable
set search_path = public, extensions
as $$
  select to_jsonb(cc)
         || jsonb_build_object(
              'bench', c.bench,
              'judgment_date', c.judgment_date,
              'source_url', c.source_url,
              'pdf_pages', c.pdf_pages,
              'keywords', c.keywords,
              'article_text', coalesce((
                select jsonb_agg(jsonb_build_object('id', a.id, 'label', a.label, 'title', a.title,
                                                    'body', a.body, 'ik_doc', a.ik_doc)
                                 order by a.number nulls last, a.id)
                from public.case_articles ca join public.articles a on a.id = ca.article_id
                where ca.case_id = c.id), '[]'),
              'related', coalesce((select jsonb_agg(to_jsonb(r)) from public.related_cases(c.id, 6) r), '[]'))
  from public.cases c
  join public.case_cards cc on cc.id = c.id
  where c.id = case_detail.case_id;
$$;

create or replace function public.corpus_stats()
returns jsonb
language sql stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'cases',    (select count(*) from public.cases),
    'articles', (select count(*) from public.articles),
    'cited',    (select count(distinct article_id) from public.case_articles),
    'years',    (select jsonb_build_array(min(year), max(year)) from public.cases),
    'domains',  coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'label', d.label, 'cases', n) order by n desc, d.id)
                 from (select d.id, d.label, count(c.id) as n
                       from public.domains d left join public.cases c on c.domain = d.id
                       group by d.id, d.label) d), '[]'),
    'top_articles', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label, 'title', t.title, 'cases', t.n) order by t.n desc, t.id)
                 from (select a.id, a.label, a.title, count(*) as n
                       from public.case_articles ca join public.articles a on a.id = ca.article_id
                       group by a.id, a.label, a.title
                       order by n desc, a.id
                       limit 8) t), '[]')
  );
$$;

grant execute on function public.match_cases(extensions.vector, int, text)       to anon, authenticated;
grant execute on function public.keyword_cases(text, int, text)                     to anon, authenticated;
grant execute on function public.hybrid_cases(text, extensions.vector, int, int, text) to anon, authenticated;
grant execute on function public.related_cases(text, int)                           to anon, authenticated;
grant execute on function public.cases_by_ids(text[])                               to anon, authenticated;
grant execute on function public.case_detail(text)                                  to anon, authenticated;
grant execute on function public.corpus_stats()                                     to anon, authenticated;
