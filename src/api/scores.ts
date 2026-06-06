import { apiRequest, getStoredToken, ApiError } from './client'
import { API_URL } from '../config/env'
import type { ApiConversionStart } from './conversions'
import type { ApiScore } from './types'
import type {
  FindSimilarPassagesPayload,
  PieceScanSimilarPassagesResponse,
  ScanSimilarPassagesPayload,
  ScanSimilarPassagesResponse,
  SimilarPassageCandidate,
} from '../types'

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

export function saveScoreMusicXml(scoreId: string, xmlContent: string) {
  return apiRequest<ApiScore>(`/scores/${encodeURIComponent(scoreId)}/musicxml`, {
    method: 'PATCH',
    body: JSON.stringify({ xmlContent }),
  })
}

export function findSimilarPassages(scoreId: string, payload: FindSimilarPassagesPayload) {
  return apiRequest<SimilarPassageCandidate[]>(
    `/scores/${encodeURIComponent(scoreId)}/similar-passages`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
}

export function scanSimilarPassages(scoreId: string, payload: ScanSimilarPassagesPayload) {
  return apiRequest<ScanSimilarPassagesResponse>(
    `/scores/${encodeURIComponent(scoreId)}/similar-passages/scan`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
}

export function scanPieceSimilarPassages(
  projectId: string,
  pieceId: string,
  payload: ScanSimilarPassagesPayload,
) {
  return apiRequest<PieceScanSimilarPassagesResponse>(
    `/projects/${encodeURIComponent(projectId)}/pieces/${encodeURIComponent(pieceId)}/similar-passages/scan`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
}

/** Multipart upload — supports PDF (triggers OMR conversion) and MusicXML/XML */
export async function uploadProjectScoreFile(
  projectId: string,
  input: {
    file: File
    title: string
    sectionId: string
    pieceId?: string
    pieceTitle?: string
    pieceComposer?: string
    preprocessMode?: string
  },
): Promise<ApiScore | ApiConversionStart> {
  const form = new FormData()
  form.set('file', input.file)
  form.set('title', input.title)
  form.set('sectionId', input.sectionId)
  if (input.pieceId) {
    form.set('pieceId', input.pieceId)
  } else {
    form.set('pieceTitle', input.pieceTitle ?? '')
    if (input.pieceComposer) form.set('pieceComposer', input.pieceComposer)
  }
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

/** JSON upload — inline xmlContent or storagePath (no PDF conversion) */
export function uploadProjectScore(
  projectId: string,
  input: {
    pieceId?: string
    piece?: {
      title: string
      composer?: string
    }
    sectionId: string
    title: string
    fileType: 'musicxml' | 'xml' | 'mxl'
    xmlContent?: string
    storagePath?: string
    storageBucket?: string
    originalFilename?: string
    mimeType?: string
    fileSizeBytes?: number
  },
) {
  return apiRequest<ApiScore>(`/projects/${projectId}/scores`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
