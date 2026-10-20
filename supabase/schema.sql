-- Run once in a NEW Supabase Free project. No browser role can access these tables.
create table public.comments (
 id text primary key, facility_id text not null, vehicle text not null,
 body text not null, photos text not null default '[]',
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 created_at text not null, reviewed_at text, reviewer text,
 admin_note text not null default '', submission_hash text not null
);
create index comments_facility_status on public.comments(facility_id,status,created_at);
create index comments_review_queue on public.comments(status,created_at);
create table public.submission_limits (key text primary key, "window" bigint not null, count integer not null);
create index submission_limits_window on public.submission_limits("window");
alter table public.comments enable row level security;
alter table public.submission_limits enable row level security;
revoke all on public.comments, public.submission_limits from anon, authenticated;
grant all on public.comments, public.submission_limits to service_role;

-- Atomic limits: five submissions per source per hour, 1000 total per hour.
-- A global limit also bounds abuse when source addresses change.
create function public.tomespot_rate_limit(p_key text,p_window bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare global_count integer; user_count integer;
begin
 delete from public.submission_limits where "window" < p_window - 48;
 insert into public.submission_limits(key,"window",count) values ('global',p_window,1)
 on conflict(key) do update set count=case when submission_limits."window"=excluded."window" then submission_limits.count+1 else 1 end,"window"=excluded."window"
 returning count into global_count;
 if global_count > 1000 then return jsonb_build_object('count',6); end if;
 insert into public.submission_limits(key,"window",count) values (p_key,p_window,1)
 on conflict(key) do update set count=case when submission_limits."window"=excluded."window" then submission_limits.count+1 else 1 end,"window"=excluded."window"
 returning count into user_count;
 return jsonb_build_object('count',user_count);
end $$;
revoke all on function public.tomespot_rate_limit(text,bigint) from public,anon,authenticated;
grant execute on function public.tomespot_rate_limit(text,bigint) to service_role;

-- Private storage: no public or authenticated-user policies are added.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('tomespot-photos','tomespot-photos',false,2097152,array['image/jpeg','image/png','image/webp']);
