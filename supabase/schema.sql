-- DreamApp: схема Supabase (public + storage), выгружено 2026-11-08 через каталоги Postgres. Только структура, без данных.
-- Не запускать как есть на живой базе: это справочная копия для восстановления.

-- Расширения
create extension if not exists "pg_stat_statements" with schema extensions;
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "postgis" with schema extensions;
create extension if not exists "supabase_vault" with schema vault;
create extension if not exists "uuid-ossp" with schema extensions;

-- Типы (enum)

-- Таблицы
create table public.hidden_authors (
  user_id uuid default auth.uid() not null,
  hidden_user_id uuid not null,
  created_at timestamp with time zone default now() not null
);
create table public.likes (
  user_id uuid default auth.uid() not null,
  photo_id uuid not null,
  created_at timestamp with time zone default now() not null
);
create table public.match_confirmations (
  user_id uuid default auth.uid() not null,
  my_photo_id uuid not null,
  other_photo_id uuid not null,
  created_at timestamp with time zone default now() not null
);
create table public.match_dismissals (
  user_id uuid default auth.uid() not null,
  my_photo_id uuid not null,
  other_photo_id uuid not null,
  created_at timestamp with time zone default now() not null
);
create table public.photos (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  storage_path text not null,
  width integer,
  height integer,
  taken_at timestamp with time zone not null,
  lat double precision not null,
  lng double precision not null,
  location geography(Point,4326) default (st_setsrid(st_makepoint(lng, lat), 4326))::geography,
  location_source text default 'exif'::text not null,
  place_name text,
  caption text,
  created_at timestamp with time zone default now() not null,
  like_count integer default 0 not null,
  hidden boolean default false not null,
  private boolean default false not null
);
create table public.profiles (
  id uuid not null,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamp with time zone default now() not null,
  matches_enabled boolean default true not null,
  is_demo boolean default false not null,
  city text
);
create table public.reports (
  id uuid default gen_random_uuid() not null,
  reporter_id uuid default auth.uid() not null,
  photo_id uuid not null,
  reason text not null,
  comment text,
  status text default 'new'::text not null,
  created_at timestamp with time zone default now() not null
);

-- Ограничения
alter table hidden_authors add constraint hidden_authors_pkey PRIMARY KEY (user_id, hidden_user_id);
alter table likes add constraint likes_pkey PRIMARY KEY (user_id, photo_id);
alter table match_confirmations add constraint match_confirmations_pkey PRIMARY KEY (user_id, my_photo_id, other_photo_id);
alter table match_dismissals add constraint match_dismissals_pkey PRIMARY KEY (user_id, my_photo_id, other_photo_id);
alter table photos add constraint photos_pkey PRIMARY KEY (id);
alter table profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table reports add constraint reports_pkey PRIMARY KEY (id);
alter table profiles add constraint profiles_username_key UNIQUE (username);
alter table reports add constraint reports_reporter_id_photo_id_key UNIQUE (reporter_id, photo_id);
alter table hidden_authors add constraint hidden_authors_check CHECK ((user_id <> hidden_user_id));
alter table hidden_authors add constraint hidden_authors_hidden_user_id_fkey FOREIGN KEY (hidden_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table hidden_authors add constraint hidden_authors_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table likes add constraint likes_photo_id_fkey FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE;
alter table likes add constraint likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table match_confirmations add constraint match_confirmations_my_photo_id_fkey FOREIGN KEY (my_photo_id) REFERENCES photos(id) ON DELETE CASCADE;
alter table match_confirmations add constraint match_confirmations_other_photo_id_fkey FOREIGN KEY (other_photo_id) REFERENCES photos(id) ON DELETE CASCADE;
alter table match_confirmations add constraint match_confirmations_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table match_dismissals add constraint match_dismissals_my_photo_id_fkey FOREIGN KEY (my_photo_id) REFERENCES photos(id) ON DELETE CASCADE;
alter table match_dismissals add constraint match_dismissals_other_photo_id_fkey FOREIGN KEY (other_photo_id) REFERENCES photos(id) ON DELETE CASCADE;
alter table match_dismissals add constraint match_dismissals_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table photos add constraint photos_caption_check CHECK ((char_length(caption) <= 500));
alter table photos add constraint photos_lat_check CHECK (((lat >= ('-90'::integer)::double precision) AND (lat <= (90)::double precision)));
alter table photos add constraint photos_lng_check CHECK (((lng >= ('-180'::integer)::double precision) AND (lng <= (180)::double precision)));
alter table photos add constraint photos_location_source_check CHECK ((location_source = ANY (ARRAY['exif'::text, 'device'::text, 'manual'::text])));
alter table photos add constraint photos_place_name_check CHECK ((char_length(place_name) <= 120));
alter table photos add constraint photos_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table profiles add constraint profiles_bio_check CHECK ((char_length(bio) <= 300));
alter table profiles add constraint profiles_city_check CHECK (((city IS NULL) OR (char_length(city) <= 40)));
alter table profiles add constraint profiles_display_name_check CHECK ((char_length(display_name) <= 60));
alter table profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table profiles add constraint profiles_username_check CHECK ((username ~ '^[a-z0-9_.]{3,30}$'::text));
alter table reports add constraint reports_comment_check CHECK ((char_length(comment) <= 500));
alter table reports add constraint reports_photo_id_fkey FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE;
alter table reports add constraint reports_reason_check CHECK ((reason = ANY (ARRAY['face_without_consent'::text, 'inappropriate'::text, 'spam'::text, 'wrong_place_or_time'::text, 'other'::text])));
alter table reports add constraint reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table reports add constraint reports_status_check CHECK ((status = ANY (ARRAY['new'::text, 'reviewed'::text, 'removed'::text, 'rejected'::text])));

-- Индексы
CREATE INDEX hidden_authors_hidden_idx ON public.hidden_authors USING btree (hidden_user_id);
CREATE INDEX likes_photo_idx ON public.likes USING btree (photo_id);
CREATE INDEX match_confirmations_my_photo_idx ON public.match_confirmations USING btree (my_photo_id);
CREATE INDEX match_confirmations_other_photo_idx ON public.match_confirmations USING btree (other_photo_id);
CREATE INDEX match_dismissals_my_idx ON public.match_dismissals USING btree (my_photo_id);
CREATE INDEX match_dismissals_other_idx ON public.match_dismissals USING btree (other_photo_id);
CREATE INDEX photos_location_idx ON public.photos USING gist (location);
CREATE INDEX photos_taken_at_idx ON public.photos USING btree (taken_at);
CREATE INDEX photos_user_idx ON public.photos USING btree (user_id, taken_at DESC);
CREATE INDEX reports_photo_idx ON public.reports USING btree (photo_id);

-- Представления
-- Функции
CREATE OR REPLACE FUNCTION public.auto_hide_reported()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select count(distinct reporter_id) from public.reports where photo_id = new.photo_id) >= 3 then
    update public.photos set hidden = true where id = new.photo_id;
  end if;
  return null;
end; $function$
;

CREATE OR REPLACE FUNCTION public.delete_my_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = uid;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(coalesce(new.email, ''), '@', 1));
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.my_matches(radius_m double precision DEFAULT 100, window_min integer DEFAULT 15, max_rows integer DEFAULT 100)
 RETURNS TABLE(my_photo_id uuid, my_storage_path text, my_taken_at timestamp with time zone, other_photo_id uuid, other_storage_path text, other_taken_at timestamp with time zone, other_user_id uuid, other_username text, other_name text, other_avatar text, place_name text, distance_m double precision, minutes_apart double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select m.id, m.storage_path, m.taken_at,
         o.id, o.storage_path, o.taken_at,
         o.user_id, pr.username, pr.display_name, pr.avatar_url,
         coalesce(o.place_name, m.place_name),
         extensions.st_distance(m.location, o.location),
         abs(extract(epoch from (o.taken_at - m.taken_at))) / 60
  from public.photos m
  join public.photos o
    on o.user_id <> m.user_id
   and not o.hidden
   and o.taken_at between m.taken_at - make_interval(mins => window_min) and m.taken_at + make_interval(mins => window_min)
   and extensions.st_dwithin(m.location, o.location, radius_m)
  join public.profiles pr on pr.id = o.user_id and pr.matches_enabled
  join public.profiles me on me.id = m.user_id and me.matches_enabled
  where m.user_id = (select auth.uid())
    and not exists (select 1 from public.match_dismissals d where d.user_id = m.user_id and d.my_photo_id = m.id and d.other_photo_id = o.id)
    and not exists (select 1 from public.hidden_authors h where h.user_id = m.user_id and h.hidden_user_id = o.user_id)
  order by m.taken_at desc, extensions.st_distance(m.location, o.location)
  limit least(max_rows, 500);
$function$
;

CREATE OR REPLACE FUNCTION public.my_matches_v2(radius_m double precision DEFAULT 100, window_min integer DEFAULT 15, max_rows integer DEFAULT 100)
 RETURNS TABLE(my_photo_id uuid, my_storage_path text, my_taken_at timestamp with time zone, my_lat double precision, my_lng double precision, other_photo_id uuid, other_storage_path text, other_taken_at timestamp with time zone, other_lat double precision, other_lng double precision, other_user_id uuid, other_username text, other_name text, other_avatar text, place_name text, distance_m double precision, minutes_apart double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select m.id, m.storage_path, m.taken_at, m.lat, m.lng,
         o.id, o.storage_path, o.taken_at, o.lat, o.lng,
         o.user_id, pr.username, pr.display_name, pr.avatar_url,
         coalesce(m.place_name, o.place_name),
         extensions.st_distance(m.location, o.location),
         abs(extract(epoch from (o.taken_at - m.taken_at))) / 60
  from public.photos m
  join public.photos o
    on o.user_id <> m.user_id and not o.hidden
   and o.taken_at between m.taken_at - make_interval(mins => window_min) and m.taken_at + make_interval(mins => window_min)
   and extensions.st_dwithin(m.location, o.location, radius_m)
  join public.profiles pr on pr.id = o.user_id and pr.matches_enabled
  join public.profiles me on me.id = m.user_id and me.matches_enabled
  where m.user_id = (select auth.uid()) and not m.hidden
    and not exists (select 1 from public.match_dismissals d where d.user_id = m.user_id and d.my_photo_id = m.id and d.other_photo_id = o.id)
    and not exists (select 1 from public.hidden_authors h where h.user_id = m.user_id and h.hidden_user_id = o.user_id)
  order by m.taken_at desc, extensions.st_distance(m.location, o.location)
  limit least(max_rows, 500);
$function$
;

CREATE OR REPLACE FUNCTION public.photo_count_near(lat double precision, lng double precision, radius_m double precision DEFAULT 150)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select count(*) from public.photos p
  where extensions.st_dwithin(
    p.location,
    extensions.st_setsrid(extensions.st_makepoint(photo_count_near.lng, photo_count_near.lat), 4326)::extensions.geography,
    photo_count_near.radius_m);
$function$
;

CREATE OR REPLACE FUNCTION public.photo_time_buckets(min_lat double precision, min_lng double precision, max_lat double precision, max_lng double precision, from_ts timestamp with time zone, to_ts timestamp with time zone, bucket interval, origin timestamp with time zone)
 RETURNS TABLE(bucket_start timestamp with time zone, photo_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select date_bin(bucket, p.taken_at, origin) as bucket_start, count(*)
  from public.photos p
  where p.location operator(extensions.&&)
        extensions.st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::extensions.geography
    and p.taken_at >= from_ts and p.taken_at < to_ts
  group by 1 order by 1;
$function$
;

CREATE OR REPLACE FUNCTION public.photo_time_histogram(min_lat double precision, min_lng double precision, max_lat double precision, max_lng double precision, from_ts timestamp with time zone, to_ts timestamp with time zone, bucket interval DEFAULT '01:00:00'::interval)
 RETURNS TABLE(bucket_start timestamp with time zone, photo_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select date_bin(bucket, p.taken_at, '2000-01-01'::timestamptz) as bucket_start, count(*)
  from public.photos p
  where p.location operator(extensions.&&)
        extensions.st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::extensions.geography
    and p.taken_at between from_ts and to_ts
  group by 1 order by 1;
$function$
;

CREATE OR REPLACE FUNCTION public.photos_in_view(min_lat double precision, min_lng double precision, max_lat double precision, max_lng double precision, from_ts timestamp with time zone DEFAULT NULL::timestamp with time zone, to_ts timestamp with time zone DEFAULT NULL::timestamp with time zone, max_rows integer DEFAULT 300)
 RETURNS TABLE(id uuid, user_id uuid, storage_path text, width integer, height integer, taken_at timestamp with time zone, lat double precision, lng double precision, place_name text, caption text, author_username text, author_name text, author_avatar text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select p.id, p.user_id, p.storage_path, p.width, p.height, p.taken_at, p.lat, p.lng,
         p.place_name, p.caption, pr.username, pr.display_name, pr.avatar_url
  from public.photos p
  join public.profiles pr on pr.id = p.user_id
  where p.location operator(extensions.&&)
        extensions.st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::extensions.geography
    and (from_ts is null or p.taken_at >= from_ts)
    and (to_ts is null or p.taken_at <= to_ts)
  order by p.taken_at desc
  limit least(max_rows, 1000);
$function$
;

CREATE OR REPLACE FUNCTION public.photos_in_view_v2(min_lat double precision, min_lng double precision, max_lat double precision, max_lng double precision, from_ts timestamp with time zone DEFAULT NULL::timestamp with time zone, to_ts timestamp with time zone DEFAULT NULL::timestamp with time zone, max_rows integer DEFAULT 300)
 RETURNS TABLE(id uuid, user_id uuid, storage_path text, width integer, height integer, taken_at timestamp with time zone, lat double precision, lng double precision, place_name text, caption text, like_count integer, liked_by_me boolean, author_username text, author_name text, author_avatar text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select p.id, p.user_id, p.storage_path, p.width, p.height, p.taken_at, p.lat, p.lng,
         p.place_name, p.caption, p.like_count,
         exists (select 1 from public.likes l where l.photo_id = p.id and l.user_id = (select auth.uid())),
         pr.username, pr.display_name, pr.avatar_url
  from public.photos p
  join public.profiles pr on pr.id = p.user_id
  where not p.hidden
    and p.location operator(extensions.&&)
        extensions.st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::extensions.geography
    and (from_ts is null or p.taken_at >= from_ts)
    and (to_ts is null or p.taken_at <= to_ts)
    and not exists (select 1 from public.hidden_authors h where h.user_id = (select auth.uid()) and h.hidden_user_id = p.user_id)
  order by p.taken_at desc
  limit least(max_rows, 1000);
$function$
;

CREATE OR REPLACE FUNCTION public.popular_places(near_lat double precision, near_lng double precision, radius_m double precision, from_ts timestamp with time zone, to_ts timestamp with time zone, max_rows integer DEFAULT 6)
 RETURNS TABLE(place_name text, lat double precision, lng double precision, photo_count bigint, cover_path text, cover_taken_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with near as (
    select p.* from public.photos p
    where p.place_name is not null
      and p.taken_at >= from_ts and p.taken_at < to_ts
      and extensions.st_dwithin(p.location, extensions.st_setsrid(extensions.st_makepoint(near_lng, near_lat), 4326)::extensions.geography, radius_m)
  ), top as (
    select n.place_name, avg(n.lat) lat, avg(n.lng) lng, count(*) photo_count from near n group by n.place_name
    order by count(*) desc limit least(max_rows, 20)
  )
  select t.place_name, t.lat, t.lng, t.photo_count, c.storage_path, c.taken_at
  from top t
  cross join lateral (
    select n.storage_path, n.taken_at from near n where n.place_name = t.place_name
    order by n.like_count desc nulls last, n.taken_at desc limit 1
  ) c
  order by t.photo_count desc;
$function$
;

CREATE OR REPLACE FUNCTION public.profile_stats(uid uuid)
 RETURNS TABLE(moments bigint, likes bigint, places bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select count(*), coalesce(sum(p.like_count), 0), count(distinct nullif(p.place_name, ''))
  from public.photos p where p.user_id = uid and not p.hidden;
$function$
;

CREATE OR REPLACE FUNCTION public.recent_moments(only_mine boolean DEFAULT false, max_rows integer DEFAULT 8)
 RETURNS TABLE(lat double precision, lng double precision, bucket timestamp with time zone, photo_count integer, place_name text, cover_path text, mine boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  -- момент = одно место за 15 минут: по названию места, а без названия — по клетке ~150 м
  select avg(p.lat), avg(p.lng),
         to_timestamp(floor(extract(epoch from p.taken_at) / 900) * 900),
         count(*)::int,
         (array_agg(p.place_name order by p.taken_at desc) filter (where p.place_name is not null))[1],
         (array_agg(p.storage_path order by p.like_count desc, p.taken_at desc))[1],
         bool_or(p.user_id = (select auth.uid()))
  from public.photos p
  where not p.hidden
    and p.taken_at <= now()
    and not exists (select 1 from public.hidden_authors h where h.user_id = (select auth.uid()) and h.hidden_user_id = p.user_id)
  group by coalesce(p.place_name, floor(p.lat / 0.0014)::text || ':' || floor(p.lng / 0.0028)::text),
           floor(extract(epoch from p.taken_at) / 900)
  having not only_mine or bool_or(p.user_id = (select auth.uid()))
  order by 3 desc
  limit least(max_rows, 50);
$function$
;

CREATE OR REPLACE FUNCTION public.search_places(q text, near_lat double precision, near_lng double precision, max_rows integer DEFAULT 5)
 RETURNS TABLE(place_name text, lat double precision, lng double precision, photo_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select p.place_name, avg(p.lat), avg(p.lng), count(*)
  from public.photos p
  where p.place_name is not null
    and p.place_name ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
  group by p.place_name
  order by count(*) desc,
           min((p.lat - near_lat)^2 + (p.lng - near_lng)^2)
  limit least(max_rows, 20);
$function$
;

CREATE OR REPLACE FUNCTION public.sync_like_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    update public.photos set like_count = like_count + 1 where id = new.photo_id;
  elsif tg_op = 'DELETE' then
    update public.photos set like_count = greatest(like_count - 1, 0) where id = old.photo_id;
  end if;
  return null;
end; $function$
;

-- Триггеры
CREATE TRIGGER likes_count AFTER INSERT OR DELETE ON public.likes FOR EACH ROW EXECUTE FUNCTION sync_like_count();
CREATE TRIGGER reports_auto_hide AFTER INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION auto_hide_reported();

-- Триггеры на auth.users
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- RLS
alter table public.hidden_authors enable row level security;
alter table public.likes enable row level security;
alter table public.match_confirmations enable row level security;
alter table public.match_dismissals enable row level security;
alter table public.photos enable row level security;
alter table public.profiles enable row level security;
alter table public.reports enable row level security;

-- Политики public
create policy "users hide authors" on public.hidden_authors as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "users see own hidden list" on public.hidden_authors as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy "users unhide authors" on public.hidden_authors as PERMISSIVE for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy "likes are public" on public.likes as PERMISSIVE for SELECT to public using (true);
create policy "users like as themselves" on public.likes as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "users unlike own" on public.likes as PERMISSIVE for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy "own confirmations: add" on public.match_confirmations as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "own confirmations: read" on public.match_confirmations as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy "own confirmations: remove" on public.match_confirmations as PERMISSIVE for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy "users dismiss matches" on public.match_dismissals as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "users see own dismissals" on public.match_dismissals as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy "photos are public unless private" on public.photos as PERMISSIVE for SELECT to public using (((NOT private) OR (( SELECT auth.uid() AS uid) = user_id)));
create policy "users delete own photos" on public.photos as PERMISSIVE for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy "users insert own photos" on public.photos as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "users update own photos" on public.photos as PERMISSIVE for UPDATE to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "profiles are public" on public.profiles as PERMISSIVE for SELECT to public using (true);
create policy "users update own profile" on public.profiles as PERMISSIVE for UPDATE to authenticated using ((( SELECT auth.uid() AS uid) = id)) with check ((( SELECT auth.uid() AS uid) = id));
create policy "users report as themselves" on public.reports as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = reporter_id));
create policy "users see own reports" on public.reports as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = reporter_id));

-- Бакеты storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('photos', 'photos', t, 15728640, '{image/jpeg,image/png,image/heic,image/webp}') on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('photos-private', 'photos-private', f, 15728640, '{image/jpeg,image/png,image/heic,image/webp}') on conflict (id) do nothing;

-- Политики storage
create policy "owner moves own files" on storage.objects as PERMISSIVE for UPDATE to authenticated using (((bucket_id = ANY (ARRAY['photos'::text, 'photos-private'::text])) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text))) with check (((bucket_id = ANY (ARRAY['photos'::text, 'photos-private'::text])) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
create policy "private: owner deletes" on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'photos-private'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
create policy "private: owner reads" on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'photos-private'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
create policy "private: owner uploads" on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'photos-private'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
create policy "users delete own files" on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'photos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
create policy "users list own files" on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'photos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
create policy "users upload to own folder" on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'photos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
