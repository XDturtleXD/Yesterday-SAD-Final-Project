import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { useTranslation } from '../../i18n'
import { Button } from '../primitives/Button'
import { Card } from '../primitives/Card'
import {
  ArrowRight,
  GitBranch,
  Music2,
  Users,
  FolderKanban,
  Sparkles,
} from 'lucide-react'

export function LandingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isAuthenticated } = useAuth()
  const { t } = useTranslation()

  const redirect = searchParams.get('redirect')
  const loginPath = redirect
    ? `/login?redirect=${encodeURIComponent(redirect)}`
    : '/login'
  const features = [
    {
      icon: FolderKanban,
      title: t('landing.featureProjectsTitle'),
      description: t('landing.featureProjectsDescription'),
    },
    {
      icon: Music2,
      title: t('landing.featureScoresTitle'),
      description: t('landing.featureScoresDescription'),
    },
    {
      icon: GitBranch,
      title: t('landing.featureBranchesTitle'),
      description: t('landing.featureBranchesDescription'),
    },
    {
      icon: Sparkles,
      title: t('landing.featurePracticeTitle'),
      description: t('landing.featurePracticeDescription'),
    },
  ]
  const steps = [
    { step: '1', title: t('landing.stepCreateTitle'), description: t('landing.stepCreateDescription') },
    { step: '2', title: t('landing.stepUploadTitle'), description: t('landing.stepUploadDescription') },
    { step: '3', title: t('landing.stepCollaborateTitle'), description: t('landing.stepCollaborateDescription') },
  ]

  return (
    <div className="min-h-dvh">
      {redirect && !isAuthenticated && (
        <div className="border-b border-sky-200 bg-sky-50 px-4 py-2 text-center text-sm text-sky-900">
          {t('landing.signInToContinue')}{' '}
          <Link to={loginPath} className="font-medium underline">
            {t('landing.goToSignIn')}
          </Link>
        </div>
      )}
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-md bg-slate-950 text-white">
              <Music2 className="size-4" />
            </div>
            <span className="text-lg font-semibold text-slate-950">Yesterday</span>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <Button onClick={() => navigate('/dashboard')}>
                {t('landing.enterWorkspace')}
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button onClick={() => navigate(isAuthenticated ? '/dashboard' : loginPath)}>
                {t('landing.signIn')}
              </Button>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm text-sky-800">
            <Users className="size-3.5" />
            {t('landing.badge')}
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            {t('landing.title')}
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            {t('landing.description')}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => navigate(isAuthenticated ? '/dashboard' : loginPath)}>
              {t('landing.getStarted')}
              <ArrowRight className="size-4" />
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              {t('landing.learnMore')}
            </Button>
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-slate-200 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-semibold text-slate-950">{t('landing.features')}</h2>
            <p className="mt-2 text-slate-600">{t('landing.featuresDescription')}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <Card key={feature.title} className="p-5">
                <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-slate-950 text-white">
                  <feature.icon className="size-5" />
                </div>
                <div className="text-sm font-semibold text-slate-950">{feature.title}</div>
                <p className="mt-2 text-sm text-slate-600">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-semibold text-slate-950">{t('landing.workflow')}</h2>
            <p className="mt-2 text-slate-600">{t('landing.workflowDescription')}</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {steps.map((item) => (
              <div key={item.step} className="text-center">
                <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-800">
                  {item.step}
                </div>
                <div className="font-semibold text-slate-950">{item.title}</div>
                <p className="mt-1 text-sm text-slate-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-950 py-16 text-white sm:py-20">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-semibold">{t('landing.ready')}</h2>
          <p className="mt-2 text-slate-300">{t('landing.readyDescription')}</p>
          <div className="mt-6">
            {isAuthenticated ? (
              <Button variant="secondary" onClick={() => navigate('/dashboard')}>
                {t('landing.enterWorkspace')}
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Link to={loginPath}>
                <Button variant="secondary">{t('landing.signUpSignIn')}</Button>
              </Link>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-sm text-slate-500">
        {t('landing.footer')}
      </footer>
    </div>
  )
}
