import { apiRequest } from './client'
import type { ApiProject, ApiProjectMember, ApiProjectMemberRecord } from './types'

export function listProjects() {
  return apiRequest<ApiProject[]>('/projects')
}

export function getProject(projectId: string) {
  return apiRequest<ApiProject>(`/projects/${projectId}`)
}

export function listProjectMembers(projectId: string) {
  return apiRequest<ApiProjectMemberRecord[]>(`/projects/${projectId}/members`)
}

export function createProject(input: {
  name: string
  description?: string
  sectionId: string
}) {
  return apiRequest<ApiProject>('/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function createInviteCode(projectId: string) {
  return apiRequest<{ inviteCode: string }>(`/projects/${projectId}/invite-code`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function joinByInviteCode(input: { inviteCode: string; sectionId: string }) {
  return apiRequest<ApiProjectMember>(`/projects/join-by-code`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
