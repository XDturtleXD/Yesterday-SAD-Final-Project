import { apiRequest } from './client'
import type {
  CreateScoreAnnotationPayload,
  ScoreAnnotation,
  UpdateScoreAnnotationPayload,
} from '../types'

export function listScoreAnnotations(scoreId: string) {
  return apiRequest<ScoreAnnotation[]>(`/scores/${encodeURIComponent(scoreId)}/annotations`)
}

export function createScoreAnnotation(scoreId: string, payload: CreateScoreAnnotationPayload) {
  return apiRequest<ScoreAnnotation>(`/scores/${encodeURIComponent(scoreId)}/annotations`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateScoreAnnotation(
  annotationId: string,
  payload: UpdateScoreAnnotationPayload,
) {
  return apiRequest<ScoreAnnotation>(`/annotations/${encodeURIComponent(annotationId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function deleteScoreAnnotation(annotationId: string) {
  return apiRequest<ScoreAnnotation>(`/annotations/${encodeURIComponent(annotationId)}`, {
    method: 'DELETE',
  })
}
