import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState } from '../../state/AppState'
import { Card } from '../primitives/Card'
import { Button } from '../primitives/Button'
import { Badge } from '../primitives/Badge'
import { CreateProjectModal } from './modals/CreateProjectModal'
import { FolderKanban, Plus, Shield, User, Music2 } from 'lucide-react'

export function HomePage() {
  const { currentUser, projects } = useAppState()
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)

  const preview = useMemo(() => projects.slice(0, 3), [projects])
  const scoreCount = useMemo(
    () => projects.reduce((total, project) => total + project.scores.length, 0),
    [projects],
  )

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
                <div className="text-2xl font-semibold text-slate-950">
                  Yesterday
                </div>
                <div className="text-sm text-slate-600">
                  Manage ensemble projects, parts, MusicXML edits, and revisions.
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate('/projects')}>
              <FolderKanban className="size-4" />
              View projects
            </Button>
            <Button variant="secondary" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Create project
            </Button>
            <Button variant="ghost" onClick={() => navigate(`/users/${currentUser.id}`)}>
              <User className="size-4" />
              Profile
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate('/admin')}
              disabled={currentUser.role !== 'admin'}
            >
              <Shield className="size-4" />
              Admin
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Metric label="Projects" value={projects.length} />
          <Metric label="Scores" value={scoreCount} />
          <Metric label="Current role" value={currentUser.role} />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Recent projects</div>
            <div className="text-xs text-slate-500">Open a workspace and continue editing parts.</div>
          </div>
          <Button variant="ghost" onClick={() => navigate('/projects')}>
            Open full list
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {preview.map((p) => (
            <Card key={p.id} className="p-4 transition hover:border-slate-300 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-950">{p.name}</div>
                  <div className="mt-1 text-xs text-slate-500">Updated {p.lastUpdatedAt}</div>
                </div>
                <Badge tone="info">{p.currentBranch}</Badge>
              </div>
              <div className="mt-1 line-clamp-2 text-sm text-slate-600">{p.description}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge>Ensemble: {p.ensembleType}</Badge>
                <Badge>Members: {p.members.length}</Badge>
                <Badge>Scores: {p.scores.length}</Badge>
              </div>
              <div className="mt-4 flex gap-2">
                <Button size="sm" onClick={() => navigate(`/projects/${p.id}`)}>
                  Open
                </Button>
                <Button size="sm" variant="secondary" onClick={() => navigate('/projects')}>
                  More
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-950">{value}</div>
    </div>
  )
}
