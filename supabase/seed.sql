-- Supabase seed data (reset-friendly for new schema)
-- Includes:
-- - sections
-- - users
-- - 1 test project
-- - project members (1 concertmaster + 4 principals + members)
-- - 2 pieces
-- - 10 scores (2 pieces x 5 sections), each with xml_content
-- - default history branch

begin;

-- ---------------------------------------------------------------------------
-- 1) Sections
-- ---------------------------------------------------------------------------
insert into public.sections (id, code, name, sort_order, created_at)
values
  ('11111111-1111-1111-1111-111111111101', 'first_violin', '小提琴第一部', 1, now()),
  ('11111111-1111-1111-1111-111111111102', 'second_violin', '小提琴第二部', 2, now()),
  ('11111111-1111-1111-1111-111111111103', 'viola', '中提琴', 3, now()),
  ('11111111-1111-1111-1111-111111111104', 'cello', '大提琴', 4, now()),
  ('11111111-1111-1111-1111-111111111105', 'double_bass', '低音提琴', 5, now());

-- ---------------------------------------------------------------------------
-- 2) Users
-- password_hash is bcrypt hash for "password123"
-- ---------------------------------------------------------------------------
insert into public.users (id, email, password_hash, name, system_role, avatar_url, intro, created_at, updated_at)
values
  (
    '22222222-2222-2222-2222-222222222001',
    'admin@orchestra.test',
    '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22',
    '平台管理員',
    'platform_admin',
    null,
    '平台管理員帳號',
    now(),
    now()
  ),
  (
    '22222222-2222-2222-2222-222222222101',
    'concertmaster@orchestra.test',
    '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22',
    '總首席（小提琴一）',
    'user',
    null,
    '第一小提琴首席，同時為 concertmaster',
    now(),
    now()
  ),
  (
    '22222222-2222-2222-2222-222222222102',
    'principal.second.violin@orchestra.test',
    '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22',
    '小提琴二首席',
    'user',
    null,
    '第二小提琴首席',
    now(),
    now()
  ),
  (
    '22222222-2222-2222-2222-222222222103',
    'principal.viola@orchestra.test',
    '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22',
    '中提琴首席',
    'user',
    null,
    '中提琴首席',
    now(),
    now()
  ),
  (
    '22222222-2222-2222-2222-222222222104',
    'principal.cello@orchestra.test',
    '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22',
    '大提琴首席',
    'user',
    null,
    '大提琴首席',
    now(),
    now()
  ),
  (
    '22222222-2222-2222-2222-222222222105',
    'principal.bass@orchestra.test',
    '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22',
    '低音提琴首席',
    'user',
    null,
    '低音提琴首席',
    now(),
    now()
  ),
  ('22222222-2222-2222-2222-222222223101', 'first.violin.member1@orchestra.test', '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22', '小提琴一團員1', 'user', null, null, now(), now()),
  ('22222222-2222-2222-2222-222222223102', 'first.violin.member2@orchestra.test', '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22', '小提琴一團員2', 'user', null, null, now(), now()),
  ('22222222-2222-2222-2222-222222223103', 'first.violin.member3@orchestra.test', '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22', '小提琴一團員3', 'user', null, null, now(), now()),
  ('22222222-2222-2222-2222-222222223104', 'first.violin.member4@orchestra.test', '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22', '小提琴一團員4', 'user', null, null, now(), now()),
  ('22222222-2222-2222-2222-222222223201', 'second.violin.member1@orchestra.test', '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22', '小提琴二團員1', 'user', null, null, now(), now()),
  ('22222222-2222-2222-2222-222222223202', 'second.violin.member2@orchestra.test', '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22', '小提琴二團員2', 'user', null, null, now(), now()),
  ('22222222-2222-2222-2222-222222223203', 'second.violin.member3@orchestra.test', '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22', '小提琴二團員3', 'user', null, null, now(), now()),
  ('22222222-2222-2222-2222-222222223204', 'second.violin.member4@orchestra.test', '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22', '小提琴二團員4', 'user', null, null, now(), now()),
  ('22222222-2222-2222-2222-222222223301', 'viola.member1@orchestra.test', '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22', '中提琴團員1', 'user', null, null, now(), now()),
  ('22222222-2222-2222-2222-222222223302', 'viola.member2@orchestra.test', '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22', '中提琴團員2', 'user', null, null, now(), now()),
  ('22222222-2222-2222-2222-222222223303', 'viola.member3@orchestra.test', '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22', '中提琴團員3', 'user', null, null, now(), now()),
  ('22222222-2222-2222-2222-222222223304', 'viola.member4@orchestra.test', '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22', '中提琴團員4', 'user', null, null, now(), now()),
  ('22222222-2222-2222-2222-222222223401', 'cello.member1@orchestra.test', '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22', '大提琴團員1', 'user', null, null, now(), now()),
  ('22222222-2222-2222-2222-222222223402', 'cello.member2@orchestra.test', '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22', '大提琴團員2', 'user', null, null, now(), now()),
  ('22222222-2222-2222-2222-222222223403', 'cello.member3@orchestra.test', '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22', '大提琴團員3', 'user', null, null, now(), now()),
  ('22222222-2222-2222-2222-222222223404', 'cello.member4@orchestra.test', '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22', '大提琴團員4', 'user', null, null, now(), now()),
  ('22222222-2222-2222-2222-222222223501', 'bass.member1@orchestra.test', '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22', '低音提琴團員1', 'user', null, null, now(), now()),
  ('22222222-2222-2222-2222-222222223502', 'bass.member2@orchestra.test', '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22', '低音提琴團員2', 'user', null, null, now(), now()),
  ('22222222-2222-2222-2222-222222223503', 'bass.member3@orchestra.test', '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22', '低音提琴團員3', 'user', null, null, now(), now()),
  ('22222222-2222-2222-2222-222222223504', 'bass.member4@orchestra.test', '$2b$10$GkorB/m9WkRysPWkCNWcFuLBVEQkQkVv8hz2n/ExWx.JkHvkION22', '低音提琴團員4', 'user', null, null, now(), now());

-- ---------------------------------------------------------------------------
-- 3) Project
-- ---------------------------------------------------------------------------
insert into public.projects (id, name, description, created_by, created_at, updated_at)
values (
  '33333333-3333-3333-3333-333333333001',
  'MVP 測試專案：弦樂團期末音樂會',
  '測試專案，包含五個聲部、成員、曲目與樂譜。',
  '22222222-2222-2222-2222-222222222101',
  now(),
  now()
);

-- ---------------------------------------------------------------------------
-- 4) Members (1 concertmaster + 4 principals + members)
-- ---------------------------------------------------------------------------
insert into public.project_members (id, project_id, user_id, section_id, role, created_at, updated_at)
values
  -- first violin
  ('44444444-4444-4444-4444-444444444001', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222222101', '11111111-1111-1111-1111-111111111101', 'concertmaster', now(), now()),
  ('44444444-4444-4444-4444-444444444002', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222223101', '11111111-1111-1111-1111-111111111101', 'member', now(), now()),
  ('44444444-4444-4444-4444-444444444003', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222223102', '11111111-1111-1111-1111-111111111101', 'member', now(), now()),
  ('44444444-4444-4444-4444-444444444004', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222223103', '11111111-1111-1111-1111-111111111101', 'member', now(), now()),
  ('44444444-4444-4444-4444-444444444005', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222223104', '11111111-1111-1111-1111-111111111101', 'member', now(), now()),
  -- second violin
  ('44444444-4444-4444-4444-444444444006', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222222102', '11111111-1111-1111-1111-111111111102', 'principal', now(), now()),
  ('44444444-4444-4444-4444-444444444007', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222223201', '11111111-1111-1111-1111-111111111102', 'member', now(), now()),
  ('44444444-4444-4444-4444-444444444008', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222223202', '11111111-1111-1111-1111-111111111102', 'member', now(), now()),
  ('44444444-4444-4444-4444-444444444009', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222223203', '11111111-1111-1111-1111-111111111102', 'member', now(), now()),
  ('44444444-4444-4444-4444-444444444010', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222223204', '11111111-1111-1111-1111-111111111102', 'member', now(), now()),
  -- viola
  ('44444444-4444-4444-4444-444444444011', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222222103', '11111111-1111-1111-1111-111111111103', 'principal', now(), now()),
  ('44444444-4444-4444-4444-444444444012', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222223301', '11111111-1111-1111-1111-111111111103', 'member', now(), now()),
  ('44444444-4444-4444-4444-444444444013', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222223302', '11111111-1111-1111-1111-111111111103', 'member', now(), now()),
  ('44444444-4444-4444-4444-444444444014', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222223303', '11111111-1111-1111-1111-111111111103', 'member', now(), now()),
  ('44444444-4444-4444-4444-444444444015', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222223304', '11111111-1111-1111-1111-111111111103', 'member', now(), now()),
  -- cello
  ('44444444-4444-4444-4444-444444444016', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222222104', '11111111-1111-1111-1111-111111111104', 'principal', now(), now()),
  ('44444444-4444-4444-4444-444444444017', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222223401', '11111111-1111-1111-1111-111111111104', 'member', now(), now()),
  ('44444444-4444-4444-4444-444444444018', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222223402', '11111111-1111-1111-1111-111111111104', 'member', now(), now()),
  ('44444444-4444-4444-4444-444444444019', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222223403', '11111111-1111-1111-1111-111111111104', 'member', now(), now()),
  ('44444444-4444-4444-4444-444444444020', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222223404', '11111111-1111-1111-1111-111111111104', 'member', now(), now()),
  -- double bass
  ('44444444-4444-4444-4444-444444444021', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222222105', '11111111-1111-1111-1111-111111111105', 'principal', now(), now()),
  ('44444444-4444-4444-4444-444444444022', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222223501', '11111111-1111-1111-1111-111111111105', 'member', now(), now()),
  ('44444444-4444-4444-4444-444444444023', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222223502', '11111111-1111-1111-1111-111111111105', 'member', now(), now()),
  ('44444444-4444-4444-4444-444444444024', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222223503', '11111111-1111-1111-1111-111111111105', 'member', now(), now()),
  ('44444444-4444-4444-4444-444444444025', '33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222223504', '11111111-1111-1111-1111-111111111105', 'member', now(), now());

-- ---------------------------------------------------------------------------
-- 5) Pieces
-- ---------------------------------------------------------------------------
insert into public.pieces (
  id,
  project_id,
  title,
  composer,
  sort_order,
  created_by,
  created_at,
  updated_at
)
values
  (
    '66666666-6666-6666-6666-666666666101',
    '33333333-3333-3333-3333-333333333001',
    'Beethoven 5th - Movement 1',
    'Ludwig van Beethoven',
    1,
    '22222222-2222-2222-2222-222222222101',
    now(),
    now()
  ),
  (
    '66666666-6666-6666-6666-666666666102',
    '33333333-3333-3333-3333-333333333001',
    'Dvorak 9th - Movement 2',
    'Antonin Dvorak',
    2,
    '22222222-2222-2222-2222-222222222101',
    now(),
    now()
  );

-- ---------------------------------------------------------------------------
-- 6) Scores (2 pieces x 5 sections = 10)
-- ---------------------------------------------------------------------------
insert into public.scores (
  id,
  project_id,
  piece_id,
  section_id,
  title,
  storage_bucket,
  storage_path,
  file_type,
  original_filename,
  mime_type,
  file_size_bytes,
  xml_content,
  created_by,
  created_at,
  updated_at
)
values
  ('55555555-5555-5555-5555-555555555101', '33333333-3333-3333-3333-333333333001', '66666666-6666-6666-6666-666666666101', '11111111-1111-1111-1111-111111111101', '第一小提琴 - Beethoven 5th - Movement 1', 'scores', 'projects/mvp-test/pieces/beethoven_5_m1/first_violin.musicxml', 'musicxml', 'beethoven_5_m1_first_violin.musicxml', 'application/vnd.recordare.musicxml+xml', 182044, '<score-partwise version="4.0"><work><work-title>Beethoven 5 M1</work-title></work><part id="P1"></part></score-partwise>', '22222222-2222-2222-2222-222222222101', now(), now()),
  ('55555555-5555-5555-5555-555555555102', '33333333-3333-3333-3333-333333333001', '66666666-6666-6666-6666-666666666102', '11111111-1111-1111-1111-111111111101', '第一小提琴 - Dvorak 9th - Movement 2', 'scores', 'projects/mvp-test/pieces/dvorak_9_m2/first_violin.musicxml', 'musicxml', 'dvorak_9_m2_first_violin.musicxml', 'application/vnd.recordare.musicxml+xml', 176513, '<score-partwise version="4.0"><work><work-title>Dvorak 9 M2</work-title></work><part id="P1"></part></score-partwise>', '22222222-2222-2222-2222-222222222101', now(), now()),
  ('55555555-5555-5555-5555-555555555201', '33333333-3333-3333-3333-333333333001', '66666666-6666-6666-6666-666666666101', '11111111-1111-1111-1111-111111111102', '第二小提琴 - Beethoven 5th - Movement 1', 'scores', 'projects/mvp-test/pieces/beethoven_5_m1/second_violin.musicxml', 'musicxml', 'beethoven_5_m1_second_violin.musicxml', 'application/vnd.recordare.musicxml+xml', 171090, '<score-partwise version="4.0"><work><work-title>Beethoven 5 M1</work-title></work><part id="P2"></part></score-partwise>', '22222222-2222-2222-2222-222222222102', now(), now()),
  ('55555555-5555-5555-5555-555555555202', '33333333-3333-3333-3333-333333333001', '66666666-6666-6666-6666-666666666102', '11111111-1111-1111-1111-111111111102', '第二小提琴 - Dvorak 9th - Movement 2', 'scores', 'projects/mvp-test/pieces/dvorak_9_m2/second_violin.musicxml', 'musicxml', 'dvorak_9_m2_second_violin.musicxml', 'application/vnd.recordare.musicxml+xml', 168402, '<score-partwise version="4.0"><work><work-title>Dvorak 9 M2</work-title></work><part id="P2"></part></score-partwise>', '22222222-2222-2222-2222-222222222102', now(), now()),
  ('55555555-5555-5555-5555-555555555301', '33333333-3333-3333-3333-333333333001', '66666666-6666-6666-6666-666666666101', '11111111-1111-1111-1111-111111111103', '中提琴 - Beethoven 5th - Movement 1', 'scores', 'projects/mvp-test/pieces/beethoven_5_m1/viola.musicxml', 'musicxml', 'beethoven_5_m1_viola.musicxml', 'application/vnd.recordare.musicxml+xml', 165884, '<score-partwise version="4.0"><work><work-title>Beethoven 5 M1</work-title></work><part id="P3"></part></score-partwise>', '22222222-2222-2222-2222-222222222103', now(), now()),
  ('55555555-5555-5555-5555-555555555302', '33333333-3333-3333-3333-333333333001', '66666666-6666-6666-6666-666666666102', '11111111-1111-1111-1111-111111111103', '中提琴 - Dvorak 9th - Movement 2', 'scores', 'projects/mvp-test/pieces/dvorak_9_m2/viola.musicxml', 'musicxml', 'dvorak_9_m2_viola.musicxml', 'application/vnd.recordare.musicxml+xml', 160441, '<score-partwise version="4.0"><work><work-title>Dvorak 9 M2</work-title></work><part id="P3"></part></score-partwise>', '22222222-2222-2222-2222-222222222103', now(), now()),
  ('55555555-5555-5555-5555-555555555401', '33333333-3333-3333-3333-333333333001', '66666666-6666-6666-6666-666666666101', '11111111-1111-1111-1111-111111111104', '大提琴 - Beethoven 5th - Movement 1', 'scores', 'projects/mvp-test/pieces/beethoven_5_m1/cello.musicxml', 'musicxml', 'beethoven_5_m1_cello.musicxml', 'application/vnd.recordare.musicxml+xml', 158776, '<score-partwise version="4.0"><work><work-title>Beethoven 5 M1</work-title></work><part id="P4"></part></score-partwise>', '22222222-2222-2222-2222-222222222104', now(), now()),
  ('55555555-5555-5555-5555-555555555402', '33333333-3333-3333-3333-333333333001', '66666666-6666-6666-6666-666666666102', '11111111-1111-1111-1111-111111111104', '大提琴 - Dvorak 9th - Movement 2', 'scores', 'projects/mvp-test/pieces/dvorak_9_m2/cello.musicxml', 'musicxml', 'dvorak_9_m2_cello.musicxml', 'application/vnd.recordare.musicxml+xml', 155230, '<score-partwise version="4.0"><work><work-title>Dvorak 9 M2</work-title></work><part id="P4"></part></score-partwise>', '22222222-2222-2222-2222-222222222104', now(), now()),
  ('55555555-5555-5555-5555-555555555501', '33333333-3333-3333-3333-333333333001', '66666666-6666-6666-6666-666666666101', '11111111-1111-1111-1111-111111111105', '低音提琴 - Beethoven 5th - Movement 1', 'scores', 'projects/mvp-test/pieces/beethoven_5_m1/double_bass.musicxml', 'musicxml', 'beethoven_5_m1_double_bass.musicxml', 'application/vnd.recordare.musicxml+xml', 149022, '<score-partwise version="4.0"><work><work-title>Beethoven 5 M1</work-title></work><part id="P5"></part></score-partwise>', '22222222-2222-2222-2222-222222222105', now(), now()),
  ('55555555-5555-5555-5555-555555555502', '33333333-3333-3333-3333-333333333001', '66666666-6666-6666-6666-666666666102', '11111111-1111-1111-1111-111111111105', '低音提琴 - Dvorak 9th - Movement 2', 'scores', 'projects/mvp-test/pieces/dvorak_9_m2/double_bass.musicxml', 'musicxml', 'dvorak_9_m2_double_bass.musicxml', 'application/vnd.recordare.musicxml+xml', 145987, '<score-partwise version="4.0"><work><work-title>Dvorak 9 M2</work-title></work><part id="P5"></part></score-partwise>', '22222222-2222-2222-2222-222222222105', now(), now());

-- ---------------------------------------------------------------------------
-- 7) Default branch for history APIs
-- ---------------------------------------------------------------------------
insert into public.branches (
  id, project_id, name, head_commit_id, is_default, created_by, created_at, updated_at
)
values
  (
    '77777777-7777-7777-7777-777777777001',
    '33333333-3333-3333-3333-333333333001',
    'main',
    null,
    true,
    '22222222-2222-2222-2222-222222222101',
    now(),
    now()
  );

commit;
