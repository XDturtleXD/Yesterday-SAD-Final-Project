import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState, useRequiredUser } from '../../state/AppState'
import { roleLabel, useTranslation } from '../../i18n'
import { Card } from '../primitives/Card'
import { Button } from '../primitives/Button'
import { Badge } from '../primitives/Badge'
import { FolderKanban, Plus, Music2 } from 'lucide-react'

export function HomePage() {
  const { projects, projectsLoading } = useAppState()
  const currentUser = useRequiredUser()
  const navigate = useNavigate()
  const { language, t } = useTranslation()

  const preview = useMemo(() => projects.slice(0, 3), [projects])

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="grid size-9 place-items-center rounded-md bg-slate-950 text-white">
                <Music2 className="size-4" />
              </div>
              <div>
                <div className="text-2xl font-semibold text-slate-950">Yesterday</div>
                <div className="text-sm text-slate-600">{t('home.description')}</div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate('/projects')}>
              <FolderKanban className="size-4" />
              {t('home.viewProjects')}
            </Button>
            <Button variant="secondary" onClick={() => navigate('/projects/new')}>
              <Plus className="size-4" />
              {t('projects.create')}
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-600">
          <Badge>{projectsLoading ? '...' : projects.length} {t('nav.projects')}</Badge>
          <Badge tone="info">{roleLabel(currentUser.role, language)}</Badge>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">{t('home.recentProjects')}</div>
          <Button size="sm" variant="ghost" onClick={() => navigate('/projects')}>
            {t('home.allProjects')}
          </Button>
        </div>

        {projects.length === 0 && !projectsLoading ? (
          <Card className="p-6">
            <div className="text-sm font-semibold text-slate-900">{t('projects.noProjectsTitle')}</div>
            <div className="mt-1 text-sm text-slate-600">
              {t('projects.noProjectsDescription')}
            </div>
            <div className="mt-4">
              <Button onClick={() => navigate('/projects/new')}>
                <Plus className="size-4" />
                {t('projects.create')}
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {preview.map((p) => (
              <Card key={p.id} className="p-4 transition hover:border-slate-300 hover:shadow-md">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-950">{p.name}</div>
                  <div className="mt-1 line-clamp-2 text-sm text-slate-600">{p.description}</div>
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  {t('common.updated')} {p.updatedAt.slice(0, 10)}
                </div>
                <div className="mt-4">
                  <Button size="sm" onClick={() => navigate(`/projects/${p.id}`)}>
                    {t('common.open')}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

    </div>
  )
}
