import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
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

const features = [
  {
    icon: FolderKanban,
    title: 'Project and member management',
    description: 'Create ensemble projects, invite teammates, and assign roles, sections, and permissions.',
  },
  {
    icon: Music2,
    title: 'Score viewing and editing',
    description: 'Open MusicXML scores in the browser with a live viewing and editing workflow.',
  },
  {
    icon: GitBranch,
    title: 'Branch-based collaboration',
    description: 'Manage rehearsal versions with branches, track changes, and merge updates. Beta.',
  },
  {
    icon: Sparkles,
    title: 'Practice progress tracking',
    description: 'Mark practiced passages and keep individual and ensemble progress visible.',
  },
]

const steps = [
  { step: '1', title: 'Create a project', description: 'Set up the ensemble workspace and invite members.' },
  { step: '2', title: 'Upload scores', description: 'Import MusicXML or PDF part files.' },
  { step: '3', title: 'Collaborate', description: 'Edit on branches, merge changes, and stay in sync.' },
]

export function LandingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isAuthenticated } = useAuth()

  const redirect = searchParams.get('redirect')
  const loginPath = redirect
    ? `/login?redirect=${encodeURIComponent(redirect)}`
    : '/login'

  return (
    <div className="min-h-dvh">
      {redirect && !isAuthenticated && (
        <div className="border-b border-sky-200 bg-sky-50 px-4 py-2 text-center text-sm text-sky-900">
          Sign in to continue to your workspace.{' '}
          <Link to={loginPath} className="font-medium underline">
            Go to sign in
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
                Enter workspace
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button onClick={() => navigate(isAuthenticated ? '/dashboard' : loginPath)}>
                Sign in
              </Button>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm text-sky-800">
            <Users className="size-3.5" />
            Ensemble score collaboration workspace
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            Make ensemble score management simpler
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Yesterday is a score collaboration platform for ensembles. Manage parts, track versions, and coordinate members so every rehearsal runs smoother.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => navigate(isAuthenticated ? '/dashboard' : loginPath)}>
              Get started
              <ArrowRight className="size-4" />
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              Learn more
            </Button>
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-slate-200 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-semibold text-slate-950">Features</h2>
            <p className="mt-2 text-slate-600">Everything from project setup to score collaboration in one place.</p>
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
            <h2 className="text-2xl font-semibold text-slate-950">Workflow</h2>
            <p className="mt-2 text-slate-600">Start an ensemble project in three steps.</p>
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
          <h2 className="text-2xl font-semibold">Ready to begin?</h2>
          <p className="mt-2 text-slate-300">Create an account and start using the Yesterday workspace.</p>
          <div className="mt-6">
            {isAuthenticated ? (
              <Button variant="secondary" onClick={() => navigate('/dashboard')}>
                Enter workspace
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Link to={loginPath}>
                <Button variant="secondary">Sign up / Sign in</Button>
              </Link>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-sm text-slate-500">
        Yesterday — Ensemble score workspace
      </footer>
    </div>
  )
}
