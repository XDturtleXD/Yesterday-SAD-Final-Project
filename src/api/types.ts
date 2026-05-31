export type ApiResponse<T> = {
  success: boolean
  message: string
  data: T
  error: unknown
}

export type ApiUser = {
  id: string
  email: string
  name: string
  system_role: string
  role?: string
  avatar_url?: string | null
  intro?: string | null
  created_at?: string
  google_sub?: string | null
}

export type AuthPayload = {
  token: string
  user: ApiUser
}

export type ApiSection = {
  id: string
  code: string
  name: string
  sort_order: number
  created_at?: string
}

export type ApiProject = {
  id: string
  name: string
  description: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export type ApiProjectMemberRecord = {
  project_member_id: string
  project_id: string
  user_id: string
  user_name: string
  user_email: string
  user_avatar_url?: string | null
  section_id: string
  section_code: string
  section_name: string
  role: 'concertmaster' | 'principal' | 'member'
  created_at: string
  updated_at: string
}

export type ApiProjectMember = {
  id: string
  project_id: string
  user_id: string
  section_id: string
  role: 'concertmaster' | 'principal' | 'member'
  created_at: string
  updated_at: string
}

export type ApiPiece = {
  id: string
  project_id: string
  title: string
  composer: string | null
  sort_order: number
  created_by: string
  created_at: string
  updated_at: string
}

export type ApiScore = {
  id: string
  project_id: string
  piece_id?: string
  section_id: string
  title: string
  storage_bucket: string
  storage_path: string
  file_type: string
  original_filename: string | null
  mime_type: string | null
  file_size_bytes: number | null
  xml_content?: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export type ApiBranch = {
  id: string
  project_id: string
  name: string
  head_commit_id: string | null
  is_default: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export type ApiCommit = {
  id: string
  project_id: string
  branch_id: string
  parent_commit_id: string | null
  merge_parent_commit_id: string | null
  message: string
  author_user_id: string
  created_at: string
}

export type ApiScoreVersion = {
  id: string
  commit_id: string
  score_id: string
  storage_bucket: string
  storage_path: string
  file_type: string
  original_filename: string | null
  mime_type: string | null
  file_size_bytes: number | null
  created_at: string
}

export type ApiCommitDetail = ApiCommit & { score_versions: ApiScoreVersion[] }

export type ApiCommitDiff = {
  from: ApiCommit
  to: ApiCommit
  added: { score_id: string; from: null; to: ApiScoreVersion }[]
  removed: { score_id: string; from: ApiScoreVersion; to: null }[]
  modified: { score_id: string; from: ApiScoreVersion; to: ApiScoreVersion }[]
  unchanged: { score_id: string; from: ApiScoreVersion; to: ApiScoreVersion }[]
}
