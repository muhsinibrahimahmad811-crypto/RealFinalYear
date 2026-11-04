create type public.app_role as enum ('staff', 'administrator');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

create policy "Users can view their own role"
  on public.user_roles
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  original_user_id bigint,
  full_name text not null,
  employee_id text not null unique,
  department text not null,
  face_model text not null default 'facenet128',
  face_template text,
  biometric_consent_at timestamptz,
  face_verified_at timestamptz,
  created_at timestamptz not null default now()
);

grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create table public.attendance_records (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  sign_in_at timestamptz not null default now(),
  sign_out_at timestamptz
);

create index ix_attendance_user_sign_in on public.attendance_records (user_id, sign_in_at);
create index ix_attendance_open_session on public.attendance_records (user_id, sign_out_at);

grant select, insert, update on public.attendance_records to authenticated;
grant all on public.attendance_records to service_role;

alter table public.attendance_records enable row level security;

create policy "Staff can view their own attendance"
  on public.attendance_records
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Administrators can view all attendance"
  on public.attendance_records
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'administrator'));
