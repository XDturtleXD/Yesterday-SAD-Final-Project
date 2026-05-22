-- Supabase PostgreSQL schema for string orchestra score viewer MVP
-- This SQL is designed to run in Supabase SQL Editor.
-- It uses application-managed auth (Node.js + Express), not Supabase Auth users.

create extension if not exists pgcrypto;

-- Compatibility cleanup for previously generated schema versions.
drop view if exists public.score_details;
drop view if exists public.project_member_details;
drop table if exists public.score_annotations;

-- Generic updated_at trigger function.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text not null,
  google_sub text unique,
  system_role text not null default 'user' check (system_role in ('user', 'platform_admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users add column if not exists google_sub text;
create unique index if not exists users_google_sub_key on public.users(google_sub) where google_sub is not null;

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sort_order integer not null check (sort_order > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete restrict,
  role text not null check (role in ('concertmaster', 'principal', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_members_project_user_key unique (project_id, user_id)
);

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete restrict,
  title text not null,
  storage_bucket text not null default 'scores',
  storage_path text not null,
  file_type text not null default 'musicxml' check (file_type in ('musicxml', 'xml', 'mxl')),
  original_filename text,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backward-compatible column migration for older scores schema.
alter table public.scores add column if not exists storage_bucket text;
alter table public.scores add column if not exists storage_path text;
alter table public.scores add column if not exists original_filename text;
alter table public.scores add column if not exists mime_type text;
alter table public.scores add column if not exists file_size_bytes bigint;

update public.scores
set storage_bucket = 'scores'
where storage_bucket is null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'scores'
      and column_name = 'file_url'
  ) then
    execute $sql$
      update public.scores
      set storage_path = file_url
      where storage_path is null and file_url is not null
    $sql$;
  end if;
end $$;

alter table public.scores
alter column storage_bucket set default 'scores',
alter column storage_bucket set not null;

alter table public.scores
alter column file_type set default 'musicxml';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scores_file_type_check'
      and conrelid = 'public.scores'::regclass
  ) then
    alter table public.scores
    add constraint scores_file_type_check
    check (file_type in ('musicxml', 'xml', 'mxl'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scores_file_size_bytes_check'
      and conrelid = 'public.scores'::regclass
  ) then
    alter table public.scores
    add constraint scores_file_size_bytes_check
    check (file_size_bytes is null or file_size_bytes >= 0);
  end if;
end $$;

alter table public.scores
alter column storage_path set not null;

alter table public.scores
drop column if exists file_url;

-- Not needed in current MVP phase:
-- - score_annotations
-- - score_versions

-- Business-rule uniqueness constraints for project roles.
-- 1) one principal per project section.
create unique index if not exists project_members_one_principal_per_section_idx
  on public.project_members(project_id, section_id)
  where role = 'principal';

-- 2) one concertmaster per project.
create unique index if not exists project_members_one_concertmaster_per_project_idx
  on public.project_members(project_id)
  where role = 'concertmaster';

-- Query-performance indexes.
create index if not exists idx_project_members_project_id on public.project_members(project_id);
create index if not exists idx_project_members_user_id on public.project_members(user_id);
create index if not exists idx_project_members_section_id on public.project_members(section_id);
create index if not exists idx_project_members_project_section on public.project_members(project_id, section_id);

create index if not exists idx_projects_created_by on public.projects(created_by);

create index if not exists idx_scores_project_id on public.scores(project_id);
create index if not exists idx_scores_section_id on public.scores(section_id);
create index if not exists idx_scores_project_section on public.scores(project_id, section_id);
create index if not exists idx_scores_storage_bucket on public.scores(storage_bucket);
create index if not exists idx_scores_storage_path on public.scores(storage_path);

-- updated_at triggers
drop trigger if exists trg_users_set_updated_at on public.users;
create trigger trg_users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists trg_projects_set_updated_at on public.projects;
create trigger trg_projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists trg_project_members_set_updated_at on public.project_members;
create trigger trg_project_members_set_updated_at
before update on public.project_members
for each row execute function public.set_updated_at();

drop trigger if exists trg_scores_set_updated_at on public.scores;
create trigger trg_scores_set_updated_at
before update on public.scores
for each row execute function public.set_updated_at();

-- ================================================================
-- Application permission rules (enforced by Node.js middleware)
-- ================================================================
-- 1. concertmaster can view all scores in the project.
-- 2. principal can view scores in their own section.
-- 3. member can view scores in their own section.
-- 4. platform_admin can manage all data.
--
-- Notes:
-- - These rules are documented here for consistency and backend reference.
-- - Actual authorization logic is handled in Express middleware/services.

drop view if exists public.project_member_details;
create view public.project_member_details as
select
  pm.id as project_member_id,
  pm.project_id,
  p.name as project_name,
  pm.user_id,
  u.name as user_name,
  u.email as user_email,
  pm.section_id,
  s.code as section_code,
  s.name as section_name,
  pm.role,
  pm.created_at,
  pm.updated_at
from public.project_members pm
join public.projects p on p.id = pm.project_id
join public.users u on u.id = pm.user_id
join public.sections s on s.id = pm.section_id;

drop view if exists public.score_details;
create view public.score_details as
select
  sc.id as score_id,
  sc.project_id,
  p.name as project_name,
  sc.section_id,
  s.code as section_code,
  s.name as section_name,
  sc.title,
  sc.storage_bucket,
  sc.storage_path,
  sc.file_type,
  sc.original_filename,
  sc.mime_type,
  sc.file_size_bytes,
  sc.created_by,
  u.name as created_by_name,
  sc.created_at,
  sc.updated_at
from public.scores sc
join public.projects p on p.id = sc.project_id
join public.sections s on s.id = sc.section_id
join public.users u on u.id = sc.created_by;

-- ================================================================
-- Version control (git-like history)
-- ================================================================
-- Tables:
--   branches        : per-project named pointers to a head commit
--   commits         : append-only history; one parent (or two on merge)
--   score_versions  : snapshot of every score's Storage metadata at a commit
--
-- Application-enforced rules (in Node service layer):
--   - Only concertmaster or platform_admin can merge branches.
--   - Only concertmaster, principal, or platform_admin can create commits.
--   - principal can only commit changes for scores in their own section_id.
--   - Default branch (is_default = true) cannot be deleted; one per project.

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  head_commit_id uuid,
  is_default boolean not null default false,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branches_project_name_key unique (project_id, name)
);

create table if not exists public.commits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  parent_commit_id uuid references public.commits(id) on delete set null,
  merge_parent_commit_id uuid references public.commits(id) on delete set null,
  message text not null,
  author_user_id uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- branches.head_commit_id references commits.id; add the FK after both tables
-- exist to avoid circular-create issues.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'branches_head_commit_id_fkey'
      and conrelid = 'public.branches'::regclass
  ) then
    alter table public.branches
      add constraint branches_head_commit_id_fkey
      foreign key (head_commit_id) references public.commits(id) on delete set null;
  end if;
end $$;

create table if not exists public.score_versions (
  id uuid primary key default gen_random_uuid(),
  commit_id uuid not null references public.commits(id) on delete cascade,
  score_id uuid not null references public.scores(id) on delete cascade,
  storage_bucket text not null default 'scores',
  storage_path text not null,
  file_type text not null check (file_type in ('musicxml', 'xml', 'mxl')),
  original_filename text,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  created_at timestamptz not null default now(),
  constraint score_versions_commit_score_key unique (commit_id, score_id)
);

-- At most one default branch per project.
create unique index if not exists branches_one_default_per_project_idx
  on public.branches(project_id)
  where is_default = true;

create index if not exists idx_branches_project_id on public.branches(project_id);
create index if not exists idx_branches_head_commit_id on public.branches(head_commit_id);

create index if not exists idx_commits_project_id on public.commits(project_id);
create index if not exists idx_commits_branch_id on public.commits(branch_id);
create index if not exists idx_commits_parent_commit_id on public.commits(parent_commit_id);
create index if not exists idx_commits_merge_parent_commit_id on public.commits(merge_parent_commit_id);
create index if not exists idx_commits_created_at on public.commits(created_at);

create index if not exists idx_score_versions_commit_id on public.score_versions(commit_id);
create index if not exists idx_score_versions_score_id on public.score_versions(score_id);

drop trigger if exists trg_branches_set_updated_at on public.branches;
create trigger trg_branches_set_updated_at
before update on public.branches
for each row execute function public.set_updated_at();
