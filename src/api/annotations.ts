import { API_URL } from '../config/env'
import { apiRequest, clearStoredToken, getStoredToken } from './client'
import type { ApiResponse } from './types'
import type {
  CreateScoreAnnotationPayload,
  ScoreAnnotation,
  UpdateScoreAnnotationPayload,
} from '../types'

export class AnnotationApiError extends Error {
  status: number
  details: unknown

  constructor(message: string, status: number, details: unknown = null) {
    super(message)
    this.name = 'AnnotationApiError'
    this.status = status
    this.details = details
  }
}

async function annotationRequest<T>(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')

  const token = getStoredToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  })

  let body: ApiResponse<T> | null = null
  try {
    body = (await response.json()) as ApiResponse<T>
  } catch {
    throw new AnnotationApiError('Unexpected server response', response.status)
  }

  if (!response.ok || !body?.success) {
    if (response.status === 401) {
      clearStoredToken()
    }
    throw new AnnotationApiError(
      body?.message || 'Annotation request failed',
      response.status,
      body?.error ?? null,
    )
  }

  return body.data
}

export function listScoreAnnotations(scoreId: string) {
  return annotationRequest<ScoreAnnotation[]>(`/scores/${encodeURIComponent(scoreId)}/annotations`)
}

export function createScoreAnnotation(scoreId: string, payload: CreateScoreAnnotationPayload) {
  return annotationRequest<ScoreAnnotation>(`/scores/${encodeURIComponent(scoreId)}/annotations`, {
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
