export type ApiResponse<T> = {
  success: boolean
  message: string
  data: T
  error: unknown
}

export type ApiUser = {
  id: string
  email: string
  name: string
  system_role: string
  role?: string
  created_at?: string
  google_sub?: string | null
}

export type AuthPayload = {
  token: string
  user: ApiUser
}
