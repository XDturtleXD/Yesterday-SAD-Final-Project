import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import * as authApi from '../api/auth'
import {
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

  const completeAuth = useCallback(
    (payload: AuthPayload) => {
      setStoredToken(payload.token)
      setUser(payload.user)
      applyAuthUser(payload.user)
    },
    [applyAuthUser],
  )

  const logout = useCallback(() => {
    clearStoredToken()
    setUser(null)
    clearAuthUser()
  }, [clearAuthUser])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null)
      clearAuthUser()
    })
  }, [clearAuthUser])

  useEffect(() => {
    const token = getStoredToken()
    if (!token) {
      return
    }

    let cancelled = false

    authApi
      .getMe()
      .then((me) => {
        if (cancelled) return
        setUser(me)
        applyAuthUser(me)
      })
      .catch(() => {
        if (cancelled) return
        clearStoredToken()
        clearAuthUser()
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [applyAuthUser, clearAuthUser])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      login: async (email, password) => {
        const payload = await authApi.login(email, password)
        completeAuth(payload)
      },
      register: async (email, password, name) => {
        await authApi.register(email, password, name)
        const payload = await authApi.login(email, password)
        completeAuth(payload)
      },
      googleLogin: async (idToken) => {
        const payload = await authApi.googleLogin(idToken)
        completeAuth(payload)
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
