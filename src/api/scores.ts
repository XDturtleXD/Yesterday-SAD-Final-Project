import { apiRequest } from './client'
import type { ApiScore } from './types'

export function listProjectScores(projectId: string) {
  return apiRequest<ApiScore[]>(`/projects/${projectId}/scores`)
}

export function getScore(scoreId: string) {
  return apiRequest<ApiScore>(`/scores/${scoreId}`)
}
