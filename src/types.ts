export type UserRole = 'regular' | 'admin'

export type User = {
  id: string
  name: string
  role: UserRole
  intro: string
  avatarUrl?: string
}

export type Section = {
  id: string
  code: string
  name: string
  sortOrder: number
}

export type ProjectMemberRole = 'concertmaster' | 'principal' | 'member'

export type ProjectMember = {
  id: string
  userId: string
  userName: string
  userEmail: string
  avatarUrl?: string
  sectionId: string
  sectionCode: string
  sectionName: string
  role: ProjectMemberRole
}

export type Score = {
  id: string
  projectId: string
  sectionId: string
  title: string
  storageBucket: string
  storagePath: string
  fileType: string
  originalFilename?: string
  mimeType?: string
  fileSizeBytes?: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type Branch = {
  id: string
  projectId: string
  name: string
  headCommitId: string | null
  isDefault: boolean
  createdAt: string
}

export type Commit = {
  id: string
  projectId: string
  branchId: string
  branchName: string
  parentCommitId: string | null
  mergeParentCommitId: string | null
  message: string
  authorUserId: string
  timestamp: string
  createdAt: string
}

export type ScoreVersion = {
  id: string
  commitId: string
  scoreId: string
  storageBucket: string
  storagePath: string
  fileType: string
  originalFilename?: string
  mimeType?: string
  fileSizeBytes?: number
  createdAt: string
}

export type Project = {
  id: string
  name: string
  description: string
  createdBy: string
  createdAt: string
  updatedAt: string
  members: ProjectMember[]
  scores: Score[]
  branches: Branch[]
  currentBranchId: string
  currentBranchName: string
  commits: Commit[]
  detailLoaded?: boolean
  detailLoading?: boolean
}
