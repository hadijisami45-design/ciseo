create extension if not exists pgcrypto;
create extension if not exists btree_gist;
create schema if not exists private;

create type public.salon_role as enum ('owner','manager','employee');
create type public.appointment_status as enum ('pending','confirmed','completed','cancelled','no_show');
create type public.payment_method as enum ('cash','card','other');

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 first_name text, last_name text, phone text, created_at timestamptz not null default now()
);
create table public.salons (
 id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users(id),
 name text not null check(length(trim(name)) between 2 and 120),
 slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 phone text, email text, address text, city text,
 country char(2) not null default 'FR', currency char(3) not null default 'EUR',
 timezone text not null default 'Europe/Paris', booking_enabled boolean not null default true,
 booking_notice_minutes int not null default 60 check(booking_notice_minutes >= 0),
 created_at timestamptz not null default now(), unique(id,owner_user_id)
);
create table public.salon_members (
 salon_id uuid not null references public.salons(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role public.salon_role not null, created_at timestamptz not null default now(),
 primary key(salon_id,user_id)
);
create index on public.salon_members(user_id);
create table public.platform_admins (user_id uuid primary key references auth.users(id) on delete cascade);
create table public.staff (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id) on delete cascade,
 user_id uuid references auth.users(id) on delete set null, display_name text not null,
 email text, phone text, color text not null default '#0f6e56',
 active boolean not null default true, bookable_online boolean not null default true,
 unique(id,salon_id), unique(salon_id,user_id)
);
create table public.services (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id) on delete cascade,
 name text not null, description text, duration_minutes int not null check(duration_minutes between 5 and 480),
 price_cents int not null check(price_cents >= 0), product_cost_cents int not null default 0 check(product_cost_cents >= 0),
 active boolean not null default true, bookable_online boolean not null default true, unique(id,salon_id)
);
create table public.staff_services (
 salon_id uuid not null references public.salons(id) on delete cascade,
 staff_id uuid not null, service_id uuid not null,
 primary key(staff_id,service_id),
 foreign key(staff_id,salon_id) references public.staff(id,salon_id) on delete cascade,
 foreign key(service_id,salon_id) references public.services(id,salon_id) on delete cascade
);
create table public.clients (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id) on delete cascade,
 first_name text not null, last_name text, phone text, email text, notes text, allergies text, color_formula text,
 marketing_email_consent boolean not null default false, marketing_sms_consent boolean not null default false,
 created_at timestamptz not null default now(), deleted_at timestamptz, unique(id,salon_id)
);
create index on public.clients(salon_id,phone);
create table public.business_hours (
 salon_id uuid not null references public.salons(id) on delete cascade,
 weekday int not null check(weekday between 0 and 6), open_time time, close_time time,
 is_closed boolean not null default false,
 check(is_closed or (open_time is not null and close_time > open_time)), primary key(salon_id,weekday)
);
create table public.staff_working_hours (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id) on delete cascade,
 staff_id uuid not null, weekday int not null check(weekday between 0 and 6),
 start_time time not null, end_time time not null check(end_time > start_time),
 foreign key(staff_id,salon_id) references public.staff(id,salon_id) on delete cascade
);
create table public.time_off (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id) on delete cascade,
 staff_id uuid, starts_at timestamptz not null, ends_at timestamptz not null check(ends_at > starts_at), reason text,
 foreign key(staff_id,salon_id) references public.staff(id,salon_id) on delete cascade
);
create table public.appointments (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id) on delete cascade,
 client_id uuid, staff_id uuid not null, starts_at timestamptz not null, ends_at timestamptz not null,
 status public.appointment_status not null default 'pending', source text not null default 'dashboard', notes text,
 total_cents int not null default 0 check(total_cents >= 0), product_cost_cents int not null default 0 check(product_cost_cents >= 0),
 created_at timestamptz not null default now(), check(ends_at > starts_at),
 unique(id,salon_id), foreign key(client_id,salon_id) references public.clients(id,salon_id),
 foreign key(staff_id,salon_id) references public.staff(id,salon_id)
);
alter table public.appointments add constraint appointments_no_overlap
 exclude using gist(staff_id with =, tstzrange(starts_at,ends_at,'[)') with &&)
 where(status in ('pending','confirmed'));
create index on public.appointments(salon_id,starts_at);
create table public.appointment_services (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id) on delete cascade,
 appointment_id uuid not null, service_id uuid, service_name_snapshot text not null,
 duration_minutes int not null check(duration_minutes > 0), price_cents int not null check(price_cents >= 0),
 product_cost_cents int not null default 0 check(product_cost_cents >= 0),
 foreign key(appointment_id,salon_id) references public.appointments(id,salon_id) on delete cascade,
 foreign key(service_id,salon_id) references public.services(id,salon_id) on delete set null (service_id)
);
create table public.payments (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id) on delete cascade,
 appointment_id uuid, amount_cents int not null check(amount_cents > 0), method public.payment_method not null,
 status text not null default 'paid' check(status in ('paid','refunded')),
 paid_at timestamptz not null default now(),
 foreign key(appointment_id,salon_id) references public.appointments(id,salon_id)
);
create table public.expenses (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id) on delete cascade,
 label text not null, category text, amount_cents int not null check(amount_cents > 0),
 expense_date date not null default current_date, notes text
);
create table public.subscriptions (
 salon_id uuid primary key references public.salons(id) on delete cascade,
 plan text not null default 'beta', status text not null default 'free'
 check(status in ('trial','active','past_due','cancelled','suspended','free')),
 amount_cents int, currency char(3), current_period_end timestamptz
);
create table private.booking_attempts (
 fingerprint text not null, attempted_at timestamptz not null default now()
);
create index on private.booking_attempts(fingerprint,attempted_at);

create function private.member_of(s uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.salon_members where salon_id=s and user_id=(select auth.uid()))
$$;
create function private.manager_of(s uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.salon_members where salon_id=s and user_id=(select auth.uid()) and role in ('owner','manager'))
$$;
create function private.owner_of(s uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.salon_members where salon_id=s and user_id=(select auth.uid()) and role='owner')
$$;
create function private.is_platform_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.platform_admins where user_id=(select auth.uid()))
$$;
grant usage on schema private to authenticated;
grant execute on function private.member_of(uuid),private.manager_of(uuid),private.owner_of(uuid),private.is_platform_admin() to authenticated;

create function private.new_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,first_name) values(new.id,new.raw_user_meta_data->>'first_name');
 return new;
end $$;
create trigger auth_user_profile after insert on auth.users for each row execute function private.new_profile();

-- Atomic owner onboarding; callable only with the server-side service role.
create function public.create_owner_salon(p_user uuid,p_name text,p_slug text,p_city text,p_country char(2))
returns uuid language plpgsql security definer set search_path = '' as $$
declare s uuid; cur char(3); zone text;
begin
 if p_country not in ('FR','TN') or length(trim(p_name)) not between 2 and 120
 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Salon invalide'; end if;
 if exists(select 1 from public.salon_members where user_id=p_user) then raise exception 'Compte déjà associé à un salon'; end if;
 cur:=case when p_country='TN' then 'TND' else 'EUR' end;
 zone:=case when p_country='TN' then 'Africa/Tunis' else 'Europe/Paris' end;
 insert into public.salons(owner_user_id,name,slug,city,country,currency,timezone)
 values(p_user,p_name,p_slug,p_city,p_country,cur,zone) returning id into s;
 insert into public.salon_members(salon_id,user_id,role) values(s,p_user,'owner');
 insert into public.subscriptions(salon_id,status,plan,currency) values(s,'free','beta',cur);
 insert into public.business_hours(salon_id,weekday,open_time,close_time,is_closed)
 select s,d,'09:00'::time,'18:00'::time,d=0 from generate_series(0,6) d;
 return s;
end $$;
revoke all on function public.create_owner_salon(uuid,text,text,text,char(2)) from public,anon,authenticated;
grant execute on function public.create_owner_salon(uuid,text,text,text,char(2)) to service_role;

-- Every exposed table uses RLS. Mutations are performed by server actions after explicit role checks.
do $$ declare t text; begin
 foreach t in array array['profiles','salons','salon_members','platform_admins','staff','services','staff_services','clients',
 'business_hours','staff_working_hours','time_off','appointments','appointment_services','payments','expenses','subscriptions'] loop
 execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;
create policy profiles_select on public.profiles for select to authenticated using(id=auth.uid());
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy salons_select on public.salons for select to authenticated using(private.member_of(id) or private.is_platform_admin());
create policy members_select on public.salon_members for select to authenticated using(private.member_of(salon_id) or private.is_platform_admin());
create policy admins_select on public.platform_admins for select to authenticated using(user_id=auth.uid());
create policy subscriptions_select on public.subscriptions for select to authenticated using(private.owner_of(salon_id) or private.is_platform_admin());
do $$ declare t text; begin
 foreach t in array array['staff','services','staff_services','clients','business_hours','staff_working_hours','time_off',
 'appointments','appointment_services'] loop
 execute format('create policy %I on public.%I for select to authenticated using(private.member_of(salon_id) or private.is_platform_admin())', t||'_select',t);
 end loop;
 foreach t in array array['payments','expenses'] loop
 execute format('create policy %I on public.%I for select to authenticated using(private.manager_of(salon_id) or private.is_platform_admin())', t||'_select',t);
 end loop;
end $$;

-- All write operations below are server-only, using a service-role key after getUser() and authorization checks.
-- Public reads are intentionally limited to an RPC returning safe fields.
create function public.public_salon(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
 select jsonb_build_object('id',s.id,'name',s.name,'city',s.city,'currency',s.currency,'timezone',s.timezone,
   'services',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'description',v.description,
      'duration_minutes',v.duration_minutes,'price_cents',v.price_cents) order by v.name)
     from public.services v where v.salon_id=s.id and v.active and v.bookable_online),'[]'::jsonb),
   'staff',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',e.display_name,'service_ids',
      coalesce((select jsonb_agg(ss.service_id) from public.staff_services ss where ss.staff_id=e.id),'[]'::jsonb)) order by e.display_name)
     from public.staff e where e.salon_id=s.id and e.active and e.bookable_online),'[]'::jsonb)) into result
 from public.salons s where s.slug=p_slug and s.booking_enabled;
 return result;
end $$;
revoke all on function public.public_salon(text) from public;
grant execute on function public.public_salon(text) to anon,authenticated,service_role;

-- A transactional public booking with DB-level conflict enforcement and rate limit.
create function public.create_public_booking(p_slug text,p_staff uuid,p_services uuid[],p_start timestamptz,
 p_first_name text,p_last_name text,p_phone text,p_email text,p_fingerprint text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.salons%rowtype; v_duration int; v_total int; v_cost int; v_count int; c uuid; a uuid;
begin
 if length(trim(p_first_name)) not between 2 and 80 or length(trim(p_phone)) not between 6 and 24
   or cardinality(p_services) not between 1 and 8 or p_start is null or length(p_fingerprint) != 64 then
   raise exception 'Données de réservation invalides'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_fingerprint,0));
 if (select count(*) from private.booking_attempts where fingerprint=p_fingerprint and attempted_at > now()-interval '1 hour') >= 8 then
   raise exception 'Trop de tentatives. Réessayez plus tard'; end if;
 insert into private.booking_attempts(fingerprint) values(p_fingerprint);
 select * into s from public.salons where slug=p_slug and booking_enabled;
 if not found then raise exception 'Salon indisponible'; end if;
 if p_start < now()+s.booking_notice_minutes*interval '1 minute' or p_start > now()+interval '90 days' then
   raise exception 'Créneau hors période de réservation'; end if;
 if not exists(select 1 from public.staff where id=p_staff and salon_id=s.id and active and bookable_online) then
   raise exception 'Collaborateur indisponible'; end if;
 if cardinality(p_services) != (select count(distinct x) from unnest(p_services) x) then
   raise exception 'Prestations en double'; end if;
 select count(*),coalesce(sum(duration_minutes),0),coalesce(sum(price_cents),0),coalesce(sum(product_cost_cents),0)
 into v_count,v_duration,v_total,v_cost from public.services
 where id=any(p_services) and salon_id=s.id and active and bookable_online
 and exists(select 1 from public.staff_services where staff_id=p_staff and service_id=services.id);
 if v_count != cardinality(p_services) then raise exception 'Prestation indisponible'; end if;
 if (p_start at time zone s.timezone)::date != ((p_start+v_duration*interval '1 minute') at time zone s.timezone)::date then
   raise exception 'Créneau hors horaires'; end if;
 if not exists(select 1 from public.business_hours h where h.salon_id=s.id
   and h.weekday=extract(dow from p_start at time zone s.timezone)::int and not h.is_closed
   and (p_start at time zone s.timezone)::time >= h.open_time
   and ((p_start+v_duration*interval '1 minute') at time zone s.timezone)::time <= h.close_time) then
   raise exception 'Salon fermé à cet horaire'; end if;
 if not exists(select 1 from public.staff_working_hours h where h.staff_id=p_staff
   and h.weekday=extract(dow from p_start at time zone s.timezone)::int
   and (p_start at time zone s.timezone)::time >= h.start_time
   and ((p_start+v_duration*interval '1 minute') at time zone s.timezone)::time <= h.end_time) then
   raise exception 'Collaborateur indisponible à cet horaire'; end if;
 if exists(select 1 from public.time_off t where t.salon_id=s.id and (t.staff_id is null or t.staff_id=p_staff)
   and tstzrange(t.starts_at,t.ends_at,'[)') && tstzrange(p_start,p_start+v_duration*interval '1 minute','[)')) then
   raise exception 'Créneau indisponible'; end if;
 insert into public.clients(salon_id,first_name,last_name,phone,email)
 values(s.id,trim(p_first_name),nullif(trim(p_last_name),''),trim(p_phone),nullif(trim(p_email),'')) returning id into c;
 insert into public.appointments(salon_id,client_id,staff_id,starts_at,ends_at,status,source,total_cents,product_cost_cents)
 values(s.id,c,p_staff,p_start,p_start+v_duration*interval '1 minute','pending','online_booking',v_total,v_cost) returning id into a;
 insert into public.appointment_services(salon_id,appointment_id,service_id,service_name_snapshot,duration_minutes,price_cents,product_cost_cents)
 select s.id,a,id,name,duration_minutes,price_cents,product_cost_cents from public.services where id=any(p_services);
 return a;
end $$;
revoke all on function public.create_public_booking(text,uuid,uuid[],timestamptz,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_public_booking(text,uuid,uuid[],timestamptz,text,text,text,text,text) to service_role;
