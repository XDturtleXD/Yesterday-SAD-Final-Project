import { apiRequest } from './client'
import type { ApiBranch, ApiCommit, ApiCommitDetail, ApiCommitDiff } from './types'

export function listBranches(projectId: string) {
  return apiRequest<ApiBranch[]>(`/projects/${projectId}/branches`)
}

export function createBranch(projectId: string, input: { name: string; fromCommitId?: string }) {
  return apiRequest<ApiBranch>(`/projects/${projectId}/branches`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function listBranchCommits(projectId: string, branchId: string) {
  return apiRequest<ApiCommit[]>(`/projects/${projectId}/branches/${branchId}/commits`)
}

export function mergeBranches(
  projectId: string,
  input: { fromBranchId: string; intoBranchId: string; message?: string },
) {
  return apiRequest<ApiCommit>(`/projects/${projectId}/merges`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function getBranch(projectId: string, branchId: string) {
  return apiRequest<ApiBranch>(`/projects/${projectId}/branches/${branchId}`)
}

export function updateBranch(
  projectId: string,
  branchId: string,
  body: { headCommitId?: string | null; name?: string },
) {
  return apiRequest<ApiBranch>(`/projects/${projectId}/branches/${branchId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function deleteBranch(projectId: string, branchId: string) {
  return apiRequest<{ id: string }>(`/projects/${projectId}/branches/${branchId}`, {
    method: 'DELETE',
  })
}

export function getCommit(projectId: string, commitId: string) {
  return apiRequest<ApiCommitDetail>(`/projects/${projectId}/commits/${commitId}`)
}

export function createCommit(
  projectId: string,
  branchId: string,
  body: {
    message: string
    scoreSnapshots: Array<{
      scoreId: string
      storagePath: string
      fileType: string
      storageBucket?: string
      originalFilename?: string
      mimeType?: string
      fileSizeBytes?: number
    }>
  },
) {
  return apiRequest<ApiCommitDetail>(`/projects/${projectId}/branches/${branchId}/commits`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function compareCommits(projectId: string, from: string, to: string) {
  return apiRequest<ApiCommitDiff>(
    `/projects/${projectId}/commits/compare?from=${from}&to=${to}`,
  )
}
