-- Add private/shared annotation records for score markings.
create table if not exists public.score_annotations (
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

create index if not exists idx_score_annotations_score_scope_section
  on public.score_annotations(score_id, scope, section_id);

create index if not exists idx_score_annotations_score_owner
  on public.score_annotations(score_id, owner_user_id);

create index if not exists idx_score_annotations_project_section
  on public.score_annotations(project_id, section_id);

drop trigger if exists trg_score_annotations_set_updated_at on public.score_annotations;
create trigger trg_score_annotations_set_updated_at
before update on public.score_annotations
for each row execute function public.set_updated_at();
