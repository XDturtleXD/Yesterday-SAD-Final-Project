import type {
  ApiBranch,
  ApiCommit,
  ApiProject,
  ApiProjectMemberRecord,
  ApiScore,
  ApiScoreVersion,
  ApiSection,
} from './types'
import type { Branch, Commit, Project, ProjectMember, Score, ScoreVersion, Section } from '../types'

export function mapSection(s: ApiSection): Section {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    sortOrder: s.sort_order,
  }
}

export function mapProjectMember(m: ApiProjectMemberRecord): ProjectMember {
  return {
    id: m.project_member_id,
    userId: m.user_id,
    userName: m.user_name,
    userEmail: m.user_email,
    sectionId: m.section_id,
    sectionCode: m.section_code,
    sectionName: m.section_name,
    role: m.role,
  }
}

export function mapScore(s: ApiScore): Score {
  return {
    id: s.id,
    projectId: s.project_id,
    sectionId: s.section_id,
    title: s.title,
    storageBucket: s.storage_bucket,
    storagePath: s.storage_path,
    fileType: s.file_type,
    originalFilename: s.original_filename ?? undefined,
    mimeType: s.mime_type ?? undefined,
    fileSizeBytes: s.file_size_bytes ?? undefined,
    createdBy: s.created_by,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  }
}

export function mapScoreVersion(v: ApiScoreVersion): ScoreVersion {
  return {
    id: v.id,
    commitId: v.commit_id,
    scoreId: v.score_id,
    storageBucket: v.storage_bucket,
    storagePath: v.storage_path,
    fileType: v.file_type,
    originalFilename: v.original_filename ?? undefined,
    mimeType: v.mime_type ?? undefined,
    fileSizeBytes: v.file_size_bytes ?? undefined,
    createdAt: v.created_at,
  }
}

export function mapBranch(b: ApiBranch): Branch {
  return {
    id: b.id,
    projectId: b.project_id,
    name: b.name,
    headCommitId: b.head_commit_id,
    isDefault: b.is_default,
    createdAt: b.created_at,
  }
}

export function mapCommit(c: ApiCommit, branchName: string): Commit {
  return {
    id: c.id,
    projectId: c.project_id,
    branchId: c.branch_id,
    branchName,
    parentCommitId: c.parent_commit_id,
    mergeParentCommitId: c.merge_parent_commit_id,
    message: c.message,
    authorUserId: c.author_user_id,
    timestamp: formatTimestamp(c.created_at),
    createdAt: c.created_at,
  }
}

export function mapProjectSummary(p: ApiProject): Project {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? '',
    createdBy: p.created_by,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    members: [],
    scores: [],
    branches: [],
    currentBranchId: '',
    currentBranchName: 'main',
    commits: [],
  }
}

function formatTimestamp(iso: string) {
  return iso.slice(0, 16).replace('T', ' ')
}
