-- ============================================================
-- Mysoft Integration Platform — Initial Schema (Phase 0)
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

create type user_role as enum (
  'platform_super_admin',
  'mysoft_support_admin',
  'tenant_admin',
  'tenant_operator',
  'tenant_auditor'
);

create type tenant_status as enum (
  'active',
  'suspended',
  'trial',
  'offboarded'
);

create type tenant_region as enum (
  'uk',
  'us',
  'eu'
);

-- ============================================================
-- TENANTS
-- ============================================================

create table public.tenants (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  slug       text not null unique,
  region     tenant_region not null default 'uk',
  status     tenant_status not null default 'trial',
  settings   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tenants is
  'Top-level multi-tenant record. Every tenant-scoped resource references this.';

-- ============================================================
-- USER PROFILES (extends auth.users)
-- ============================================================

create table public.user_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  tenant_id    uuid references public.tenants(id) on delete cascade,
  role         user_role not null default 'tenant_operator',
  first_name   text,
  last_name    text,
  is_active    boolean not null default true,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.user_profiles is
  'Extended profile for every auth user. tenant_id is null for platform-level admins.';

-- ============================================================
-- USER INVITES
-- ============================================================

create table public.user_invites (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  email       text not null,
  role        user_role not null default 'tenant_operator',
  token       text not null unique default encode(gen_random_bytes(32), 'hex'),
  invited_by  uuid references public.user_profiles(id),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);

comment on table public.user_invites is
  'Pending email invitations for new tenant users.';

-- ============================================================
-- AUDIT LOG
-- ============================================================

create table public.audit_log (
  id            uuid primary key default uuid_generate_v4(),
  tenant_id     uuid references public.tenants(id) on delete set null,
  user_id       uuid references public.user_profiles(id) on delete set null,
  operation     text not null,
  resource_type text,
  resource_id   uuid,
  old_values    jsonb,
  new_values    jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);

comment on table public.audit_log is
  'Immutable audit trail. All user actions and system events are written here.';

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_tenants_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

create trigger set_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_user_profiles_tenant_id on public.user_profiles(tenant_id);
create index idx_user_profiles_role      on public.user_profiles(role);
create index idx_user_invites_tenant_id  on public.user_invites(tenant_id);
create index idx_user_invites_email      on public.user_invites(email);
create index idx_audit_log_tenant_id     on public.audit_log(tenant_id);
create index idx_audit_log_user_id       on public.audit_log(user_id);
create index idx_audit_log_created_at    on public.audit_log(created_at desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.tenants      enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_invites  enable row level security;
alter table public.audit_log     enable row level security;

-- Helper: current user's role
create or replace function public.get_my_role()
returns user_role language sql security definer stable as $$
  select role from public.user_profiles where id = auth.uid();
$$;

-- Helper: current user's tenant_id
create or replace function public.get_my_tenant_id()
returns uuid language sql security definer stable as $$
  select tenant_id from public.user_profiles where id = auth.uid();
$$;

-- Helper: is platform admin?
create or replace function public.is_platform_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid()
      and role in ('platform_super_admin', 'mysoft_support_admin')
  );
$$;

-- ── tenants ──────────────────────────────────────────────────
create policy "Platform admins view all tenants"
  on public.tenants for select
  using (public.is_platform_admin());

create policy "Tenant users view own tenant"
  on public.tenants for select
  using (id = public.get_my_tenant_id());

create policy "Super admin creates tenants"
  on public.tenants for insert
  with check (public.get_my_role() = 'platform_super_admin');

create policy "Super admin updates tenants"
  on public.tenants for update
  using (public.get_my_role() = 'platform_super_admin');

-- ── user_profiles ────────────────────────────────────────────
create policy "Platform admins view all profiles"
  on public.user_profiles for select
  using (public.is_platform_admin());

create policy "Tenant admins view own tenant profiles"
  on public.user_profiles for select
  using (tenant_id = public.get_my_tenant_id() and public.get_my_role() = 'tenant_admin');

create policy "Users view own profile"
  on public.user_profiles for select
  using (id = auth.uid());

create policy "Users update own profile"
  on public.user_profiles for update
  using (id = auth.uid());

create policy "Platform admins manage all profiles"
  on public.user_profiles for all
  using (public.is_platform_admin());

create policy "Tenant admins manage own tenant profiles"
  on public.user_profiles for all
  using (tenant_id = public.get_my_tenant_id() and public.get_my_role() = 'tenant_admin');

-- ── user_invites ─────────────────────────────────────────────
create policy "Platform admins manage all invites"
  on public.user_invites for all
  using (public.is_platform_admin());

create policy "Tenant admins manage own tenant invites"
  on public.user_invites for all
  using (tenant_id = public.get_my_tenant_id() and public.get_my_role() = 'tenant_admin');

-- ── audit_log ────────────────────────────────────────────────
create policy "Platform admins view all audit logs"
  on public.audit_log for select
  using (public.is_platform_admin());

create policy "Tenant users view own tenant audit logs"
  on public.audit_log for select
  using (
    tenant_id = public.get_my_tenant_id()
    and public.get_my_role() in ('tenant_admin','tenant_operator','tenant_auditor')
  );

create policy "System inserts audit logs"
  on public.audit_log for insert
  with check (true);
