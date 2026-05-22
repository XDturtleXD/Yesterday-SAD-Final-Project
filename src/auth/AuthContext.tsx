import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as authApi from '../api/auth'
import {
  ApiError,
  clearStoredToken,
  getStoredToken,
  setStoredToken,
  setUnauthorizedHandler,
} from '../api/client'
import type { ApiUser, AuthPayload } from '../api/types'
import { useAppState } from '../state/AppState'

type AuthContextValue = {
  user: ApiUser | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  googleLogin: (idToken: string) => Promise<void>
  logout: () => void
  isAdmin: boolean
}

const AuthCtx = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { applyAuthUser, clearAuthUser } = useAppState()
  const [user, setUser] = useState<ApiUser | null>(null)
  const [isLoading, setIsLoading] = useState(() => !!getStoredToken())

  const applyAuthUserRef = useRef(applyAuthUser)
  const clearAuthUserRef = useRef(clearAuthUser)
  applyAuthUserRef.current = applyAuthUser
  clearAuthUserRef.current = clearAuthUser

  const completeAuth = useCallback(async (payload: AuthPayload) => {
    setStoredToken(payload.token)
    setUser(payload.user)
    await applyAuthUserRef.current(payload.user)
  }, [])

  const logout = useCallback(() => {
    clearStoredToken()
    setUser(null)
    clearAuthUserRef.current()
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearStoredToken()
      setUser(null)
      clearAuthUserRef.current()
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      const token = getStoredToken()
      if (!token) {
        setIsLoading(false)
        return
      }

      try {
        const me = await authApi.getMe()
        if (cancelled) return
        setUser(me)
        void applyAuthUserRef.current(me).catch(() => {
          // Project loading failure must not invalidate the auth session.
        })
      } catch (error) {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 401) {
          clearStoredToken()
          clearAuthUserRef.current()
          setUser(null)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void restoreSession()

    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      login: async (email, password) => {
        const payload = await authApi.login(email, password)
        await completeAuth(payload)
      },
      register: async (email, password, name) => {
        await authApi.register(email, password, name)
        const payload = await authApi.login(email, password)
        await completeAuth(payload)
      },
      googleLogin: async (idToken) => {
        const payload = await authApi.googleLogin(idToken)
        await completeAuth(payload)
      },
      logout,
      isAdmin: user?.system_role === 'platform_admin',
    }),
    [user, isLoading, completeAuth, logout],
  )

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
