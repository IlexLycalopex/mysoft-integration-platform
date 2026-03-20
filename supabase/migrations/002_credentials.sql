-- ============================================================
-- Mysoft Integration Platform — Credential Vault (Phase 1 Sprint 2)
-- ============================================================

-- ============================================================
-- TENANT CREDENTIALS
-- Stores AES-256-GCM encrypted integration credentials per tenant.
-- One row per tenant per provider (unique constraint on tenant_id+provider).
-- ============================================================

create table public.tenant_credentials (
  id             uuid primary key default uuid_generate_v4(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  provider       text not null default 'intacct',
  encrypted_data text not null,   -- hex-encoded AES-256-GCM ciphertext
  iv             text not null,   -- hex-encoded 96-bit IV
  auth_tag       text not null,   -- hex-encoded 128-bit GCM auth tag
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique(tenant_id, provider)
);

comment on table public.tenant_credentials is
  'Encrypted integration credentials (e.g. Intacct) per tenant. Never store plaintext.';

create trigger set_tenant_credentials_updated_at
  before update on public.tenant_credentials
  for each row execute function public.set_updated_at();

create index idx_tenant_credentials_tenant_id on public.tenant_credentials(tenant_id);

-- ── RLS ──────────────────────────────────────────────────────

alter table public.tenant_credentials enable row level security;

create policy "Platform admins manage all credentials"
  on public.tenant_credentials for all
  using (public.is_platform_admin());

create policy "Tenant admins read own credentials"
  on public.tenant_credentials for select
  using (
    tenant_id = public.get_my_tenant_id()
    and public.get_my_role() = 'tenant_admin'
  );

create policy "Tenant admins write own credentials"
  on public.tenant_credentials for insert
  with check (
    tenant_id = public.get_my_tenant_id()
    and public.get_my_role() = 'tenant_admin'
  );

create policy "Tenant admins update own credentials"
  on public.tenant_credentials for update
  using (
    tenant_id = public.get_my_tenant_id()
    and public.get_my_role() = 'tenant_admin'
  );
