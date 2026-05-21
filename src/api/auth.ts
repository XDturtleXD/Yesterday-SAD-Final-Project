import { apiRequest } from './client'
import type { ApiUser, AuthPayload } from './types'

export function login(email: string, password: string) {
  return apiRequest<AuthPayload>(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
    { auth: false },
  )
}

export function register(email: string, password: string, name: string) {
  return apiRequest<ApiUser>(
    '/auth/register',
    {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    },
    { auth: false },
  )
}

export function googleLogin(idToken: string) {
  return apiRequest<AuthPayload>(
    '/auth/google',
    {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    },
    { auth: false },
  )
}

export function getMe() {
  return apiRequest<ApiUser>('/auth/me')
}
