import { API_URL } from '../config/env'
import { apiRequest, ApiError, getStoredToken } from './client'
import type { ApiScore } from './types'

export type ApiConversionStart = {
  jobId: string
  status: string
  originalFilename: string
}

export type ApiConversionStatus = {
  job_id: string
  status: 'queued' | 'processing' | 'done' | 'error'
  message: string
  current_page: number
  total_pages: number
  error_message: string | null
  result_available: boolean
  result_raw_url?: string
  merge_message?: string
  original_filename?: string
}

function authHeaders() {
  const headers = new Headers()
  const token = getStoredToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return headers
}

export function getConversionStatus(jobId: string) {
  return apiRequest<ApiConversionStatus>(`/conversions/${jobId}`)
}

export async function getConversionMusicXml(jobId: string) {
  const response = await fetch(`${API_URL}/conversions/${jobId}/musicxml`, {
    headers: authHeaders(),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new ApiError(text || 'Failed to fetch converted MusicXML', response.status)
  }
  return text
}

export function importConversion(
  projectId: string,
  jobId: string,
  input: {
    title: string
    sectionId: string
    pieceId?: string
    pieceTitle?: string
    pieceComposer?: string
    composer?: string
    sectionTitle?: string
    partName?: string
    originalFilename?: string
  },
) {
  return apiRequest<ApiScore>(`/projects/${projectId}/conversions/${jobId}/import`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
