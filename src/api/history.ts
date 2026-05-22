import { apiRequest } from './client'
import type { ApiBranch, ApiCommit } from './types'

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
