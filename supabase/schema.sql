-- Supabase PostgreSQL schema (reset-friendly)
-- Project: String orchestra score platform
-- Auth is managed by Node.js backend (not Supabase Auth RLS policies).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Drop existing objects (safe reset order)
-- ---------------------------------------------------------------------------
drop view if exists public.score_details;
drop view if exists public.project_member_details;

drop table if exists public.score_versions cascade;
drop table if exists public.commits cascade;
drop table if exists public.branches cascade;
drop table if exists public.project_invites cascade;
drop table if exists public.score_annotations cascade;
drop table if exists public.scores cascade;
drop table if exists public.pieces cascade;
drop table if exists public.project_members cascade;
drop table if exists public.projects cascade;
drop table if exists public.sections cascade;
drop table if exists public.users cascade;

drop function if exists public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Generic updated_at trigger function
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text not null,
  google_sub text unique,
  avatar_url text,
  intro text,
  system_role text not null default 'user' check (system_role in ('user', 'platform_admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sort_order integer not null check (sort_order > 0),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete restrict,
  role text not null check (role in ('concertmaster', 'principal', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_members_project_user_key unique (project_id, user_id)
);

-- A project has many pieces (songs).
create table public.pieces (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  composer text,
  sort_order integer not null default 1 check (sort_order > 0),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pieces_project_title_key unique (project_id, title),
  constraint pieces_project_sort_order_key unique (project_id, sort_order)
);

-- A score belongs to one project, one piece, and one section.
-- XML body is kept in xml_content for frontend rendering convenience.
create table public.scores (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  piece_id uuid not null references public.pieces(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete restrict,
  title text not null,
  storage_bucket text not null default 'scores',
  storage_path text not null,
  file_type text not null default 'musicxml' check (file_type in ('musicxml', 'xml', 'mxl')),
  original_filename text,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  xml_content text check (xml_content is null or length(trim(xml_content)) > 0),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scores_piece_section_unique unique (piece_id, section_id)
);

-- Score annotations are separate from base MusicXML so private/shared markings
-- can later be overlaid without mutating scores.xml_content.
create table public.score_annotations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  score_id uuid not null references public.scores(id) on delete cascade,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  section_id uuid references public.sections(id) on delete restrict,
  scope text not null check (scope in ('shared', 'private')),
  annotation_type text not null check (
    annotation_type in ('bowing', 'dynamic', 'articulation', 'slur', 'hairpin', 'text')
  ),
  target_ref jsonb not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Optional invite tracking table (one-time links).
create table public.project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  target_section_id uuid not null references public.sections(id) on delete restrict,
  target_role text not null check (target_role in ('principal', 'member')),
  token_id text not null unique,
  created_by uuid not null references public.users(id) on delete restrict,
  expires_at timestamptz not null,
  used_by uuid references public.users(id) on delete set null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- History / version-control tables (used by backend history service)
-- ---------------------------------------------------------------------------
create table public.branches (
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

create table public.commits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  parent_commit_id uuid references public.commits(id) on delete set null,
  merge_parent_commit_id uuid references public.commits(id) on delete set null,
  message text not null,
  author_user_id uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.branches
add constraint branches_head_commit_id_fkey
foreign key (head_commit_id) references public.commits(id) on delete set null;

create table public.score_versions (
  id uuid primary key default gen_random_uuid(),
  commit_id uuid not null references public.commits(id) on delete cascade,
  score_id uuid not null references public.scores(id) on delete cascade,
  storage_bucket text not null default 'scores',
  storage_path text not null,
  file_type text not null check (file_type in ('musicxml', 'xml', 'mxl')),
  original_filename text,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  xml_content text check (xml_content is null or length(trim(xml_content)) > 0),
  created_at timestamptz not null default now(),
  constraint score_versions_commit_score_key unique (commit_id, score_id)
);

-- ---------------------------------------------------------------------------
-- Business-rule indexes
-- ---------------------------------------------------------------------------
-- one principal per project section
create unique index project_members_one_principal_per_section_idx
  on public.project_members(project_id, section_id)
  where role = 'principal';

-- one concertmaster per project
create unique index project_members_one_concertmaster_per_project_idx
  on public.project_members(project_id)
  where role = 'concertmaster';

-- one default branch per project
create unique index branches_one_default_per_project_idx
  on public.branches(project_id)
  where is_default = true;

-- ---------------------------------------------------------------------------
-- Query-performance indexes
-- ---------------------------------------------------------------------------
create index idx_users_google_sub on public.users(google_sub) where google_sub is not null;

create index idx_projects_created_by on public.projects(created_by);

create index idx_project_members_project_id on public.project_members(project_id);
create index idx_project_members_user_id on public.project_members(user_id);
create index idx_project_members_section_id on public.project_members(section_id);
create index idx_project_members_project_section on public.project_members(project_id, section_id);

create index idx_pieces_project_id on public.pieces(project_id);
create index idx_pieces_project_sort_order on public.pieces(project_id, sort_order);

create index idx_scores_project_id on public.scores(project_id);
create index idx_scores_piece_id on public.scores(piece_id);
create index idx_scores_section_id on public.scores(section_id);
create index idx_scores_project_piece_section on public.scores(project_id, piece_id, section_id);
create index idx_scores_storage_bucket on public.scores(storage_bucket);
create index idx_scores_storage_path on public.scores(storage_path);

create index idx_score_annotations_score_scope_section
  on public.score_annotations(score_id, scope, section_id);
create index idx_score_annotations_score_owner
  on public.score_annotations(score_id, owner_user_id);
create index idx_score_annotations_project_section
  on public.score_annotations(project_id, section_id);

create index idx_project_invites_project_id on public.project_invites(project_id);
create index idx_project_invites_target_section_id on public.project_invites(target_section_id);
create index idx_project_invites_expires_at on public.project_invites(expires_at);

create index idx_branches_project_id on public.branches(project_id);
create index idx_branches_head_commit_id on public.branches(head_commit_id);

create index idx_commits_project_id on public.commits(project_id);
create index idx_commits_branch_id on public.commits(branch_id);
create index idx_commits_parent_commit_id on public.commits(parent_commit_id);
create index idx_commits_merge_parent_commit_id on public.commits(merge_parent_commit_id);
create index idx_commits_created_at on public.commits(created_at);

create index idx_score_versions_commit_id on public.score_versions(commit_id);
create index idx_score_versions_score_id on public.score_versions(score_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger trg_users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create trigger trg_projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create trigger trg_project_members_set_updated_at
before update on public.project_members
for each row execute function public.set_updated_at();

create trigger trg_pieces_set_updated_at
before update on public.pieces
for each row execute function public.set_updated_at();

create trigger trg_scores_set_updated_at
before update on public.scores
for each row execute function public.set_updated_at();

create trigger trg_score_annotations_set_updated_at
before update on public.score_annotations
for each row execute function public.set_updated_at();

create trigger trg_project_invites_set_updated_at
before update on public.project_invites
for each row execute function public.set_updated_at();

create trigger trg_branches_set_updated_at
before update on public.branches
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Convenience views for backend queries
-- ---------------------------------------------------------------------------
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

create view public.score_details as
select
  sc.id as score_id,
  sc.project_id,
  p.name as project_name,
  sc.piece_id,
  pc.title as piece_title,
  pc.composer as piece_composer,
  pc.sort_order as piece_sort_order,
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
  sc.xml_content,
  sc.created_by,
  u.name as created_by_name,
  sc.created_at,
  sc.updated_at
from public.scores sc
join public.projects p on p.id = sc.project_id
join public.pieces pc on pc.id = sc.piece_id
join public.sections s on s.id = sc.section_id
join public.users u on u.id = sc.created_by;

-- ---------------------------------------------------------------------------
-- Permission notes (enforced in Node.js middleware/service layer)
-- ---------------------------------------------------------------------------
-- 1) platform_admin: can access all projects/scores.
-- 2) concertmaster: can access all sections within a project.
-- 3) principal/member: can access only their own section's scores.
