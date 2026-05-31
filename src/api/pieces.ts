import { apiRequest } from './client'
import type { ApiPiece } from './types'

export function listProjectPieces(projectId: string) {
  return apiRequest<ApiPiece[]>(`/projects/${projectId}/pieces`)
}

export function createProjectPiece(
  projectId: string,
  input: { title: string; composer?: string; sortOrder?: number },
) {
  return apiRequest<ApiPiece>(`/projects/${projectId}/pieces`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function deleteProjectPiece(projectId: string, pieceId: string) {
  return apiRequest<{ id: string }>(`/projects/${projectId}/pieces/${pieceId}`, {
    method: 'DELETE',
  })
}

export function reorderProjectPieces(projectId: string, orderedPieceIds: string[]) {
  return apiRequest<ApiPiece[]>(`/projects/${projectId}/pieces/reorder`, {
    method: 'PATCH',
    body: JSON.stringify({ orderedPieceIds }),
  })
}
