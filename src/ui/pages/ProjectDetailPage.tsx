import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAppState } from '../../state/AppState'
import { Badge } from '../primitives/Badge'
import { Button } from '../primitives/Button'
import { Card } from '../primitives/Card'
import { Modal } from '../primitives/Modal'
import { cn } from '../utils/cn'
import { BranchesPanel } from './project/BranchesPanel'
import { FullScorePanel } from './project/FullScorePanel'
import { MembersPanel } from './project/MembersPanel'
import { ScoresPanel } from './project/ScoresPanel'
import { VersionsPanel } from './project/VersionsPanel'
import { ArrowLeft, GitBranch, MailPlus } from 'lucide-react'

type TabKey = 'overview' | 'scores' | 'members' | 'branches' | 'versions' | 'fullscore'

export function ProjectDetailPage() {
  const { projectId } = useParams()
  const { currentUser, getProject, getUser } = useAppState()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const tab = (sp.get('tab') as TabKey) || 'overview'
  const [inviteOpen, setInviteOpen] = useState(false)

  const project = projectId ? getProject(projectId) : undefined

  const myMember = useMemo(
    () => project?.members.find((m) => m.userId === currentUser.id),
    [project, currentUser.id],
  )
  const myRole = myMember?.roles.join(', ') ?? (currentUser.role === 'admin' ? 'admin' : 'viewer')
  const myInstruments = myMember?.instruments.join(', ') ?? '—'
  const currentCommit = project?.commits.find((c) => c.id === project?.currentCommitId)
  const commitAuthor = currentCommit ? getUser(currentCommit.authorUserId)?.name : undefined

  if (!project) {
    return (
      <Card className="p-6">
        <div className="text-sm font-semibold text-slate-900">Project not found</div>
        <div className="mt-1 text-sm text-slate-600">
          Go back to the <Link className="underline" to="/projects">project list</Link>.
        </div>
      </Card>
    )
  }

  const isOwner = currentUser.role === 'owner' || project.members.some((m) => m.userId === currentUser.id && m.roles.includes('owner'))
  const isAdmin = currentUser.role === 'admin'

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-xl font-semibold text-slate-950">{project.name}</div>
            <Badge>Ensemble: {project.ensembleType}</Badge>
            <Badge tone="info">
              <GitBranch className="mr-1 size-3" />
              {project.currentBranch}
            </Badge>
          </div>
          <div className="mt-1 text-sm text-slate-600">{project.description}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge>Your role: {myRole}</Badge>
            <Badge>Your instrument(s): {myInstruments}</Badge>
            <Badge>Members: {project.members.length}</Badge>
            <Badge>Scores: {project.scores.length}</Badge>
          </div>
          {currentCommit && (
            <div className="mt-2 text-xs text-slate-500">
              Current commit: <span className="font-medium text-slate-700">{currentCommit.message}</span>
              {commitAuthor ? ` — ${commitAuthor}` : ''} ({currentCommit.timestamp})
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setInviteOpen(true)} disabled={!isOwner && !isAdmin}>
            <MailPlus className="size-4" />
            Invite member
          </Button>
          <Button variant="ghost" onClick={() => navigate('/projects')}>
            <ArrowLeft className="size-4" />
            Projects
          </Button>
        </div>
      </div>

      <Tabs tab={tab} projectId={project.id} />

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-4 lg:col-span-2">
            <div className="text-sm font-semibold text-slate-950">Overview</div>
            <div className="mt-1 text-sm text-slate-600">
              Project workspace for parts, members, branches, and MusicXML revisions.
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <QuickLink
                title="Scores"
                desc="Open parts, edit (mock), and view version history."
                to={`?tab=scores`}
              />
              <QuickLink
                title="Members"
                desc="View members; owner can assign roles/instruments (mock)."
                to={`?tab=members`}
              />
              <QuickLink
                title="Branches / Versions"
                desc="Create/switch branches, visualize graph, and manage commits (mock)."
                to={`?tab=branches`}
              />
              <QuickLink
                title="Full score preview"
                desc="Simulate combining parts into a full score."
                to={`?tab=fullscore`}
              />
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm font-semibold text-slate-950">Recent commits</div>
            <div className="mt-3 space-y-2">
              {project.commits.slice(0, 5).map((c) => (
                <div key={c.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="text-sm font-medium text-slate-950">{c.message}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {getUser(c.authorUserId)?.name ?? c.authorUserId} · {c.timestamp} · {c.branch}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <Button variant="ghost" onClick={() => navigate(`?tab=versions`)}>
                View version history
              </Button>
            </div>
          </Card>
        </div>
      )}

      {tab === 'scores' && <ScoresPanel project={project} />}
      {tab === 'members' && <MembersPanel project={project} />}
      {tab === 'branches' && <BranchesPanel project={project} />}
      {tab === 'versions' && <VersionsPanel project={project} />}
      {tab === 'fullscore' && <FullScorePanel project={project} />}

      <Modal
        title="Invite member (simulated)"
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setInviteOpen(false)
                // Simulation only: just a toast for clarity
                // Actual membership edits are out of scope for this prototype stage.
              }}
            >
              Send invite
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-600">
          Owner-only action. In the prototype, this only demonstrates where invitations would be triggered.
        </div>
        <input
          placeholder="email@example.com"
          className="mt-3 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
        />
      </Modal>
    </div>
  )
}

function Tabs({ tab, projectId }: { tab: TabKey; projectId: string }) {
  const items: Array<{ key: TabKey; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'scores', label: 'Scores' },
    { key: 'members', label: 'Members' },
    { key: 'branches', label: 'Branches' },
    { key: 'versions', label: 'Versions' },
    { key: 'fullscore', label: 'Full Score Preview' },
  ]

  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {items.map((it) => (
        <Link
          key={it.key}
          to={`/projects/${projectId}?tab=${it.key}`}
          className={cn(
            'rounded-md px-3 py-2 text-sm transition',
            tab === it.key ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100',
          )}
        >
          {it.label}
        </Link>
      ))}
    </div>
  )
}

function QuickLink({ title, desc, to }: { title: string; desc: string; to: string }) {
  return (
    <Link to={to} className="group block rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50">
      <div className="text-sm font-semibold text-slate-950 group-hover:underline">{title}</div>
      <div className="mt-1 text-sm text-slate-600">{desc}</div>
    </Link>
  )
}
