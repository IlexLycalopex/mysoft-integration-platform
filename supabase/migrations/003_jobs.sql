-- ============================================================
-- Mysoft Integration Platform — Upload Jobs (Phase 2 Sprint 3)
-- ============================================================

-- ============================================================
-- UPLOAD JOBS
-- One record per file upload. Status tracks the processing lifecycle.
-- ============================================================

create table public.upload_jobs (
  id              uuid primary key default uuid_generate_v4(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  created_by      uuid references public.user_profiles(id) on delete set null,
  filename        text not null,
  storage_path    text not null,          -- path within the 'uploads' storage bucket
  file_size       bigint,                 -- bytes
  mime_type       text,
  status          text not null default 'pending'
                    check (status in ('pending','processing','completed','failed','cancelled')),
  row_count       int,                    -- total data rows detected in file
  processed_count int not null default 0, -- rows successfully submitted
  error_count     int not null default 0, -- rows that failed
  mapping_id      uuid,                   -- FK to field_mappings (set before processing)
  started_at      timestamptz,
  completed_at    timestamptz,
  error_message   text,                   -- file-level error (e.g. "Cannot parse XLSX")
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.upload_jobs is
  'Tracks every file upload and its processing lifecycle.';

create trigger set_upload_jobs_updated_at
  before update on public.upload_jobs
  for each row execute function public.set_updated_at();

create index idx_upload_jobs_tenant_id  on public.upload_jobs(tenant_id);
create index idx_upload_jobs_created_by on public.upload_jobs(created_by);
create index idx_upload_jobs_status     on public.upload_jobs(status);
create index idx_upload_jobs_created_at on public.upload_jobs(created_at desc);

-- ============================================================
-- JOB ERRORS
-- Row-level errors produced during processing.
-- ============================================================

create table public.job_errors (
  id            uuid primary key default uuid_generate_v4(),
  job_id        uuid not null references public.upload_jobs(id) on delete cascade,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  row_number    int,
  field_name    text,
  error_code    text,
  error_message text not null,
  raw_data      jsonb,                   -- source row for debugging
  created_at    timestamptz not null default now()
);

comment on table public.job_errors is
  'Row-level processing errors for upload jobs.';

create index idx_job_errors_job_id    on public.job_errors(job_id);
create index idx_job_errors_tenant_id on public.job_errors(tenant_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.upload_jobs enable row level security;
alter table public.job_errors  enable row level security;

-- upload_jobs
create policy "Platform admins view all jobs"
  on public.upload_jobs for select
  using (public.is_platform_admin());

create policy "Tenant users view own tenant jobs"
  on public.upload_jobs for select
  using (tenant_id = public.get_my_tenant_id());

create policy "Tenant operators+ create jobs"
  on public.upload_jobs for insert
  with check (
    tenant_id = public.get_my_tenant_id()
    and public.get_my_role() in ('tenant_admin','tenant_operator','platform_super_admin','mysoft_support_admin')
  );

create policy "Service role manages all jobs"
  on public.upload_jobs for all
  using (true)
  with check (true);

-- job_errors
create policy "Platform admins view all errors"
  on public.job_errors for select
  using (public.is_platform_admin());

create policy "Tenant users view own tenant errors"
  on public.job_errors for select
  using (tenant_id = public.get_my_tenant_id());

create policy "Service role manages all errors"
  on public.job_errors for all
  using (true)
  with check (true);

-- ============================================================
-- STORAGE BUCKET
-- The 'uploads' bucket stores raw uploaded files.
-- Files are scoped to tenant/{job_id}/{filename}.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uploads',
  'uploads',
  false,
  52428800,  -- 50 MB per file
  array['text/csv','application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain']
)
on conflict (id) do nothing;

-- Storage RLS: users can upload to their own tenant folder
create policy "Tenant users can upload files"
  on storage.objects for insert
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = public.get_my_tenant_id()::text
  );

create policy "Tenant users can read own files"
  on storage.objects for select
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = public.get_my_tenant_id()::text
  );

create policy "Platform admins read all files"
  on storage.objects for select
  using (
    bucket_id = 'uploads'
    and public.is_platform_admin()
  );
