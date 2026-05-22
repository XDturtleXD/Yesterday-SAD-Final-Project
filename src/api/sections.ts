import { apiRequest } from './client'
import type { ApiSection } from './types'

export function listSections() {
  return apiRequest<ApiSection[]>('/sections')
}
