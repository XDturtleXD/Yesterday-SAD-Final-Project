import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { ApiError } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { GOOGLE_CLIENT_ID } from '../../config/env'
import { useAppState } from '../../state/AppState'
import { useTranslation } from '../../i18n'
import { Card } from '../primitives/Card'
import { Button } from '../primitives/Button'
import { LogIn, Music2, UserPlus } from 'lucide-react'

type AuthTab = 'login' | 'register'

const inputClassName =
  'mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100'

export function LoginPage() {
  const { login, register, googleLogin } = useAuth()
  const { addToast } = useAppState()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect') || '/dashboard'

  const [tab, setTab] = useState<AuthTab>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const handleSuccess = () => {
    addToast({ title: t('auth.signedIn'), message: t('auth.welcomeBack') })
    navigate(decodeURIComponent(redirect), { replace: true })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError(t('auth.emailPasswordRequired'))
      return
    }

    if (tab === 'register') {
      if (!name.trim()) {
        setError(t('auth.nameRequired'))
        return
      }
      if (password !== confirmPassword) {
        setError(t('auth.passwordMismatch'))
        return
      }
      if (password.length < 6) {
        setError(t('auth.passwordTooShort'))
        return
      }
    }

    setLoading(true)
    try {
      if (tab === 'login') {
        await login(email.trim(), password)
      } else {
        await register(email.trim(), password, name.trim())
      }
      handleSuccess()
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : tab === 'login'
            ? t('auth.signInFailed')
            : t('auth.signUpFailed')
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) {
      setError(t('auth.googleNoCredential'))
      return
    }

    setError('')
    setLoading(true)
    try {
      await googleLogin(response.credential)
      handleSuccess()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.googleFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <Link to="/" className="inline-flex items-center gap-2 text-slate-950">
          <div className="grid size-9 place-items-center rounded-md bg-slate-950 text-white">
            <Music2 className="size-4" />
          </div>
          <span className="text-lg font-semibold">Yesterday</span>
        </Link>
      </div>

      <Card className="p-6">
        <div className="mb-6 flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => {
              setTab('login')
              setError('')
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
              tab === 'login'
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            <LogIn className="size-4" />
            {t('auth.logIn')}
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('register')
              setError('')
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
              tab === 'register'
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            <UserPlus className="size-4" />
            {t('auth.signUp')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'register' && (
            <div>
              <label className="text-sm font-medium text-slate-800">{t('auth.name')}</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Chen"
                className={inputClassName}
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-slate-800">{t('auth.email')}</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              type="email"
              className={inputClassName}
              autoComplete="email"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-800">{t('auth.password')}</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type="password"
              className={inputClassName}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {tab === 'register' && (
            <div>
              <label className="text-sm font-medium text-slate-800">{t('auth.confirmPassword')}</label>
              <input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                type="password"
                className={inputClassName}
                autoComplete="new-password"
              />
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t('auth.working') : tab === 'login' ? t('auth.logIn') : t('auth.createAccount')}
          </Button>
        </form>

        {GOOGLE_CLIENT_ID && (
          <div className="mt-6">
            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-slate-500">{t('auth.or')}</span>
              </div>
            </div>
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setError(t('auth.googleFailedShort'))}
                theme="outline"
                size="large"
                text={tab === 'login' ? 'signin_with' : 'signup_with'}
                shape="rectangular"
                width="320"
              />
            </div>
          </div>
        )}
      </Card>

      <p className="mt-4 text-center text-sm text-slate-600">
        <Link to="/" className="text-sky-700 hover:underline">
          {t('common.backHome')}
        </Link>
      </p>
    </div>
  )
}
