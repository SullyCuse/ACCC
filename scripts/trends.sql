-- Trends page data (applied to Supabase by hand; keep this file in sync).
-- Returns only aggregates. Every component, pairing and country shown must
-- appear in at least MIN_VISITS separate visits, so no single visitor's system
-- can be picked out. Callable by anon because it exposes nothing beyond what
-- the public /trends page shows.

alter table public.analysis_events add column if not exists visit_id text;

create or replace function public.trends_summary(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with params as (select 3 as min_visits),
ev as (
  select e.id, e.source, e.action, e.country, e.created_at,
         -- One "visit" per page load. Rows logged before visit ids existed fall
         -- back to day + country + the set of names, which merges exact repeats.
         coalesce(e.visit_id,
           e.created_at::date || '|' || coalesce(e.country, '') || '|' ||
           (select string_agg(lower(regexp_replace(c->>'name', '[^a-zA-Z0-9]', '', 'g')), ',' order by 1)
              from jsonb_array_elements(e.components) c)) as visit,
         e.components
  from analysis_events e
  where e.created_at >= p_from and e.created_at < p_to
),
comp as (
  select ev.id, ev.visit, ev.source,
         case c->>'category' when 'speaker' then 'speakers' when 'phono' then 'phonopre' else c->>'category' end as category,
         nullif(c->>'db_name', '') as db_name
  from ev, jsonb_array_elements(ev.components) c
),
totals as (
  select jsonb_build_object(
    'analyses',    count(*) filter (where source = 'analyzer'),
    'comparisons', count(*) filter (where source = 'compare'),
    'checks',      count(*) filter (where source = 'checker' and action = 'result'),
    'visits',      count(distinct visit),
    'analyzer_visits', count(distinct visit) filter (where source = 'analyzer')
  ) as j from ev
),
categories as (
  select coalesce(jsonb_agg(jsonb_build_object('category', category, 'visits', n) order by n desc, category), '[]'::jsonb) as j
  from (select category, count(distinct visit) n from comp where source = 'analyzer' and category is not null group by 1) x
),
countries as (
  select coalesce(jsonb_agg(jsonb_build_object('country', country, 'visits', n) order by n desc, country), '[]'::jsonb) as j
  from (select country, count(distinct visit) n from ev where country is not null group by 1) x, params
  where n >= params.min_visits
),
top_components as (
  select coalesce(jsonb_agg(jsonb_build_object('category', category, 'name', db_name, 'visits', n) order by category, n desc, db_name), '[]'::jsonb) as j
  from (
    select category, db_name, n, row_number() over (partition by category order by n desc, db_name) rk
    from (select category, db_name, count(distinct visit) n from comp where db_name is not null group by 1, 2) y
  ) x, params
  where n >= params.min_visits and rk <= 5
),
pairs as (
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'a', a, 'b', b, 'visits', n) order by n desc, kind, a, b), '[]'::jsonb) as j
  from (
    select kind, a, b, count(distinct visit) n from (
      select 'amp-speakers' kind, x.db_name a, y.db_name b, x.visit
        from comp x join comp y on x.id = y.id
       where x.category = 'amp' and y.category = 'speakers' and x.db_name is not null and y.db_name is not null
      union all
      select 'cartridge-turntable', x.db_name, y.db_name, x.visit
        from comp x join comp y on x.id = y.id
       where x.category = 'cartridge' and y.category = 'turntable' and x.db_name is not null and y.db_name is not null
      union all
      select 'cartridge-phonopre', x.db_name, y.db_name, x.visit
        from comp x join comp y on x.id = y.id
       where x.category = 'cartridge' and y.category = 'phonopre' and x.db_name is not null and y.db_name is not null
    ) p group by 1, 2, 3
  ) z, params
  where n >= params.min_visits
),
new_specs as (
  select jsonb_build_object(
    'count', count(*),
    'items', coalesce(jsonb_agg(jsonb_build_object('name', name, 'category', coalesce(category, 'other')) order by coalesce(category, 'other'), name), '[]'::jsonb)
  ) as j
  from component_specs where created_at >= p_from and created_at < p_to
)
select jsonb_build_object(
  'from', p_from, 'to', p_to, 'min_visits', (select min_visits from params),
  'totals', (select j from totals),
  'categories', (select j from categories),
  'countries', (select j from countries),
  'top_components', (select j from top_components),
  'pairs', (select j from pairs),
  'new_specs', (select j from new_specs)
);
$$;

revoke all on function public.trends_summary(timestamptz, timestamptz) from public;
grant execute on function public.trends_summary(timestamptz, timestamptz) to anon, service_role;
