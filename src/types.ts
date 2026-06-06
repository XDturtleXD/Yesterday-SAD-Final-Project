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
  pieceId?: string
  sectionId: string
  title: string
  storageBucket: string
  storagePath: string
  fileType: string
  originalFilename?: string
  mimeType?: string
  fileSizeBytes?: number
  xmlContent?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type AnnotationScope = 'shared' | 'private'

export type AnnotationType = 'bowing' | 'dynamic' | 'articulation' | 'slur' | 'hairpin' | 'text'

export type ScoreAnnotation = {
  id: string
  projectId: string
  scoreId: string
  ownerUserId: string
  sectionId: string | null
  scope: AnnotationScope
  annotationType: AnnotationType
  targetRef: Record<string, unknown>
  payload: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type CreateScoreAnnotationPayload = {
  scope: AnnotationScope
  annotationType: AnnotationType
  targetRef: Record<string, unknown>
  payload: Record<string, unknown>
  sectionId?: string
}

export type UpdateScoreAnnotationPayload = {
  targetRef?: Record<string, unknown>
  payload?: Record<string, unknown>
}

export type SimilarPassageCandidate = {
  targetScoreId: string
  targetSectionId: string
  targetSectionName: string | null
  startRef: Record<string, unknown>
  endRef: Record<string, unknown>
  startMeasureNumber: number
  endMeasureNumber: number
  similarity: number
  intervalScore: number
  rhythmScore: number
  noteCount: number
}

export type FindSimilarPassagesPayload = {
  sourceRange: {
    startRef: Record<string, unknown>
    endRef: Record<string, unknown>
  }
  threshold?: number
  limit?: number
  targetSectionIds?: string[]
}

export type WholeScoreSimilarityHighlight = {
  sourceScoreId: string
  sourceStartRef: Record<string, unknown>
  sourceEndRef: Record<string, unknown>
  sourceStartMeasureNumber: number
  sourceEndMeasureNumber: number
  targetScoreId: string
  targetSectionId: string | null
  targetSectionName: string | null
  targetStartRef: Record<string, unknown>
  targetEndRef: Record<string, unknown>
  targetStartMeasureNumber: number
  targetEndMeasureNumber: number
  similarity: number
  intervalScore: number
  rhythmScore: number
  noteCount: number
}

export type ScanSimilarPassagesPayload = {
  threshold?: number
  windowSizes?: number[]
  limitPerWindow?: number
  maxHighlights?: number
  targetSectionIds?: string[]
}

export type ScanSimilarPassagesResponse = {
  highlights: WholeScoreSimilarityHighlight[]
}

export type PieceSimilarityHighlight = {
  leftScoreId: string
  leftSectionId: string | null
  leftSectionName: string | null
  leftStartMeasureNumber: number
  leftEndMeasureNumber: number
  leftStartRef: Record<string, unknown>
  leftEndRef: Record<string, unknown>
  rightScoreId: string
  rightSectionId: string | null
  rightSectionName: string | null
  rightStartMeasureNumber: number
  rightEndMeasureNumber: number
  rightStartRef: Record<string, unknown>
  rightEndRef: Record<string, unknown>
  similarity: number
  intervalScore: number
  rhythmScore: number
  noteCount: number
}

export type PieceScanSimilarPassagesResponse = {
  highlights: PieceSimilarityHighlight[]
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
  pieces: Piece[]
  scores: Score[]
  branches: Branch[]
  currentBranchId: string
  currentBranchName: string
  commits: Commit[]
  detailLoaded?: boolean
  detailLoading?: boolean
}

export type Piece = {
  id: string
  projectId: string
  title: string
  composer?: string
  sortOrder: number
  createdAt: string
  source: 'api'
}

export type PieceScoreUpload = {
  id: string
  projectId: string
  pieceId: string
  sectionId: string
  scoreId?: string
  filename: string
  fileType: 'musicxml' | 'xml' | 'mxl'
  fileSizeBytes?: number
  uploadedAt: string
  uploadedByUserId: string
  uploadedByName: string
  source: 'api' | 'frontend-mock'
}

export type MemberInviteDraft = {
  id: string
  projectId: string
  sectionId: string
  sectionName: string
  targetRole: 'principal' | 'member'
  inviteCode: string
  createdByUserId: string
  createdAt: string
  source: 'api-bound-invite'
}
