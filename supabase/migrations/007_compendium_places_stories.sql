-- 007_compendium_places_stories.sql
-- Places (continent/country/city/poi) + Stories (markdown) for Compendium

-- Updated_at helper (shared)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 4.1 places (public read)
create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.places(id) on delete set null,
  kind text not null,
  name text not null,
  slug text not null unique,
  description text,
  lore_md text,
  cover_image_url text,
  map_x numeric,
  map_y numeric,
  status text not null default 'unlocked',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists places_parent_id_idx on public.places(parent_id);
create index if not exists places_kind_idx on public.places(kind);

do $$
begin
  begin
    alter table public.places add constraint places_kind_check check (kind in ('continent','country','city','poi'));
  exception when duplicate_object then
    null;
  end;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_updated_at_places'
  ) then
    create trigger set_updated_at_places
    before update on public.places
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

alter table public.places enable row level security;
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'places'
      and policyname = 'Public read places'
  ) then
    create policy "Public read places"
      on public.places
      for select
      using (true);
  end if;
end $$;

-- 4.2 stories (public read)
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text,
  content_md text,
  cover_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_updated_at_stories'
  ) then
    create trigger set_updated_at_stories
    before update on public.stories
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

alter table public.stories enable row level security;
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stories'
      and policyname = 'Public read stories'
  ) then
    create policy "Public read stories"
      on public.stories
      for select
      using (true);
  end if;
end $$;

-- 4.3 story_characters (public read)
create table if not exists public.story_characters (
  story_id uuid not null references public.stories(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, character_id)
);

create index if not exists story_characters_character_id_idx on public.story_characters(character_id);

alter table public.story_characters enable row level security;
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'story_characters'
      and policyname = 'Public read story_characters'
  ) then
    create policy "Public read story_characters"
      on public.story_characters
      for select
      using (true);
  end if;
end $$;

-- 4.4 story_places (public read)
create table if not exists public.story_places (
  story_id uuid not null references public.stories(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, place_id)
);

create index if not exists story_places_place_id_idx on public.story_places(place_id);

alter table public.story_places enable row level security;
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'story_places'
      and policyname = 'Public read story_places'
  ) then
    create policy "Public read story_places"
      on public.story_places
      for select
      using (true);
  end if;
end $$;

-- 4.5 characters migration: add slug/aliases + switch place foreign keys
alter table public.characters add column if not exists slug text;
alter table public.characters add column if not exists aliases text[];
alter table public.characters add column if not exists current_place_id uuid;
alter table public.characters add column if not exists home_place_id uuid;

-- Seed places from existing locations (treat all legacy locations as poi)
insert into public.places (
  id,
  parent_id,
  kind,
  name,
  slug,
  description,
  lore_md,
  cover_image_url,
  map_x,
  map_y,
  status
)
select
  l.id,
  null,
  'poi',
  l.name,
  case
    when count(*) over (partition by l.name) = 1 then l.name
    else l.name || '-' || substring(l.id::text, 1, 6)
  end,
  l.description,
  l.lore,
  l.image_url,
  l.x,
  l.y,
  l.status
from public.locations l
on conflict (id) do nothing;

-- Backfill character slug + place foreign keys from legacy location columns
with name_counts as (
  select name, count(*) as cnt
  from public.characters
  group by name
)
update public.characters c
set
  slug = case
    when coalesce(c.slug, '') = '' then
      case
        when nc.cnt = 1 then c.name
        else c.name || '-' || substring(c.id::text, 1, 6)
      end
    else c.slug
  end
from name_counts nc
where
  nc.name = c.name
  and coalesce(c.slug, '') = '';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'characters'
      and column_name = 'current_location_id'
  ) then
    update public.characters
    set current_place_id = current_location_id
    where current_place_id is null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'characters'
      and column_name = 'home_location_id'
  ) then
    update public.characters
    set home_place_id = home_location_id
    where home_place_id is null;
  end if;
end $$;

do $$
begin
  -- Ensure unique constraint + not-null on character.slug (after backfill)
  begin
    alter table public.characters alter column slug set not null;
  exception when others then
    null;
  end;

  begin
    alter table public.characters add constraint characters_slug_key unique (slug);
  exception when duplicate_object then
    null;
  end;
end $$;

do $$
begin
  begin
    alter table public.characters alter column current_place_id set not null;
  exception when others then
    null;
  end;
end $$;

do $$
begin
  -- Switch foreign keys to places
  begin
    alter table public.characters add constraint characters_current_place_id_fkey
      foreign key (current_place_id) references public.places(id);
  exception when duplicate_object then
    null;
  end;

  begin
    alter table public.characters add constraint characters_home_place_id_fkey
      foreign key (home_place_id) references public.places(id);
  exception when duplicate_object then
    null;
  end;
end $$;

-- Drop legacy location foreign keys/columns (safe to rerun)
alter table public.characters drop constraint if exists characters_current_location_id_fkey;
alter table public.characters drop constraint if exists characters_home_location_id_fkey;
alter table public.characters drop column if exists current_location_id;
alter table public.characters drop column if exists home_location_id;
