import { apiRequest, getStoredToken, ApiError } from './client'
import { API_URL } from '../config/env'
import type { ApiConversionStart } from './conversions'
import type { ApiScore } from './types'

export function listProjectScores(projectId: string) {
  return apiRequest<ApiScore[]>(`/projects/${projectId}/scores`)
}

export function getScore(scoreId: string) {
  return apiRequest<ApiScore>(`/scores/${scoreId}`)
}

export function deleteScore(scoreId: string) {
  return apiRequest<ApiScore>(`/scores/${scoreId}`, {
    method: 'DELETE',
  })
}

export async function uploadProjectScoreFile(
  projectId: string,
  input: {
    file: File
    title: string
    pieceTitle: string
    pieceComposer?: string
    sectionId: string
    preprocessMode?: string
  },
): Promise<ApiScore | ApiConversionStart> {
  const form = new FormData()
  form.set('file', input.file)
  form.set('title', input.title)
  form.set('pieceTitle', input.pieceTitle)
  if (input.pieceComposer) form.set('pieceComposer', input.pieceComposer)
  form.set('sectionId', input.sectionId)
  if (input.preprocessMode) form.set('preprocessMode', input.preprocessMode)

  const headers = new Headers()
  const token = getStoredToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_URL}/projects/${projectId}/scores/upload`, {
    method: 'POST',
    headers,
    body: form,
  })

  let body: { success: boolean; message: string; data: ApiScore | ApiConversionStart } | null = null
  try {
    body = (await response.json()) as {
      success: boolean
      message: string
      data: ApiScore | ApiConversionStart
    }
  } catch {
    throw new ApiError('Unexpected server response', response.status)
  }

  if (!response.ok || !body?.success) {
    throw new ApiError(body?.message || 'Upload failed', response.status)
  }

  return body.data
}
