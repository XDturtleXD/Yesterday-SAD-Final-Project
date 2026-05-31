import { useNavigate } from 'react-router-dom'
import { useAppState, useRequiredUser } from '../../state/AppState'
import { Badge } from '../primitives/Badge'
import { Button } from '../primitives/Button'
import { Card } from '../primitives/Card'
import { FolderKanban, UserRoundCog } from 'lucide-react'

export function AdminDashboardPage() {
  const { projects, projectsLoading } = useAppState()
  const currentUser = useRequiredUser()
  const navigate = useNavigate()

  const isAdmin = currentUser.role === 'admin'

  if (!isAdmin) {
    return (
      <Card className="p-6">
        <div className="text-sm font-semibold text-slate-900">Admin dashboard</div>
        <div className="mt-1 text-sm text-slate-600">Permission denied.</div>
        <div className="mt-4">
          <Button variant="secondary" onClick={() => navigate('/dashboard')}>
            Back to dashboard
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white">
            <UserRoundCog className="size-5" />
          </div>
          <div>
            <div className="text-xl font-semibold text-slate-950">Admin dashboard</div>
            <div className="mt-1 text-sm text-slate-600">
              Platform admins can view every project.
            </div>
          </div>
        </div>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <FolderKanban className="size-4 text-slate-500" />
          All projects ({projectsLoading ? '...' : projects.length})
        </div>
        <div className="mt-4 space-y-3">
          {projects.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-4"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">{p.name}</div>
                <div className="mt-1 text-sm text-slate-600">{p.description}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone="info">{p.currentBranchName}</Badge>
                  {p.detailLoaded && <Badge>{p.members.length} members</Badge>}
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => navigate(`/projects/${p.id}`)}>
                Open
              </Button>
            </div>
          ))}
          {!projectsLoading && projects.length === 0 && (
            <div className="text-sm text-slate-500">No projects in the system.</div>
          )}
        </div>
      </Card>
    </div>
  )
}
