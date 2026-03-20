-- ============================================================
-- Mysoft Integration Platform — Field Mappings (Phase 2 Sprint 4)
-- ============================================================

-- ============================================================
-- FIELD MAPPINGS
-- Tenant-owned templates that map source CSV columns to Intacct API fields.
-- column_mappings JSONB stores an ordered array of:
--   { id, source_column, target_field, required, transform }
-- ============================================================

create table public.field_mappings (
  id               uuid primary key default uuid_generate_v4(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  name             text not null,
  description      text,
  transaction_type text not null
                     check (transaction_type in (
                       'journal_entry',
                       'ar_invoice',
                       'ap_bill',
                       'expense_report'
                     )),
  is_default       boolean not null default false,
  column_mappings  jsonb not null default '[]'::jsonb,
  created_by       uuid references public.user_profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.field_mappings is
  'Named mapping templates that translate source CSV columns to Intacct API fields.';
comment on column public.field_mappings.column_mappings is
  'JSON array of { id, source_column, target_field, required, transform } objects.';

create trigger set_field_mappings_updated_at
  before update on public.field_mappings
  for each row execute function public.set_updated_at();

create index idx_field_mappings_tenant_id        on public.field_mappings(tenant_id);
create index idx_field_mappings_transaction_type on public.field_mappings(tenant_id, transaction_type);

-- Only one default per (tenant, transaction_type)
create unique index idx_field_mappings_one_default
  on public.field_mappings(tenant_id, transaction_type)
  where is_default = true;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.field_mappings enable row level security;

create policy "Platform admins view all mappings"
  on public.field_mappings for select
  using (public.is_platform_admin());

create policy "Tenant users view own mappings"
  on public.field_mappings for select
  using (tenant_id = public.get_my_tenant_id());

create policy "Tenant admins manage mappings"
  on public.field_mappings for all
  using (
    tenant_id = public.get_my_tenant_id()
    and public.get_my_role() in ('tenant_admin', 'tenant_operator', 'platform_super_admin', 'mysoft_support_admin')
  )
  with check (
    tenant_id = public.get_my_tenant_id()
    and public.get_my_role() in ('tenant_admin', 'tenant_operator', 'platform_super_admin', 'mysoft_support_admin')
  );

create policy "Service role manages all mappings"
  on public.field_mappings for all
  using (true)
  with check (true);
