import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState } from '../../state/AppState'
import { Badge } from '../primitives/Badge'
import { Button } from '../primitives/Button'
import { Card } from '../primitives/Card'
import { Modal } from '../primitives/Modal'
import { CreateProjectModal } from './modals/CreateProjectModal'
import { Copy, FolderPlus, LogIn, Music2 } from 'lucide-react'

export function ProjectsPage() {
  const { currentUser, projects, getUser, addToast } = useAppState()
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [inviteCode, setInviteCode] = useState('')

  const visible = useMemo(() => {
    if (currentUser.role === 'admin') return projects
    return projects.filter((p) => p.members.some((m) => m.userId === currentUser.id))
  }, [projects, currentUser])

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="text-xl font-semibold text-slate-950">Projects</div>
          <div className="mt-1 text-sm text-slate-600">
            Showing projects you participate in{currentUser.role === 'admin' ? ' (admin sees all).' : '.'}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setCreateOpen(true)}>
            <FolderPlus className="size-4" />
            Create project
          </Button>
          <Button variant="secondary" onClick={() => setJoinOpen(true)}>
            <LogIn className="size-4" />
            Join by code
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {visible.map((p) => {
          const myMember = p.members.find((m) => m.userId === currentUser.id)
          const myRole = myMember?.roles.join(', ') ?? (currentUser.role === 'admin' ? 'admin' : 'viewer')
          const myInstruments = myMember?.instruments.join(', ') ?? '—'
          const lastCommit = p.commits.find((c) => c.id === p.currentCommitId) ?? p.commits[0]
          const lastAuthor = lastCommit ? getUser(lastCommit.authorUserId)?.name : undefined

          return (
            <Card key={p.id} className="p-4 transition hover:border-slate-300 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="grid size-8 shrink-0 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-700">
                      <Music2 className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-950">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.ensembleType}</div>
                    </div>
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm text-slate-600">{p.description}</div>
                </div>
                <Badge>Members: {p.members.length}</Badge>
              </div>

              <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-xs text-slate-500">Your role</div>
                  <div className="font-medium">{myRole}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-xs text-slate-500">Your instrument(s)</div>
                  <div className="font-medium">{myInstruments}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-xs text-slate-500">Current branch</div>
                  <div className="font-medium">{p.currentBranch}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-xs text-slate-500">Last updated</div>
                  <div className="font-medium">{p.lastUpdatedAt}</div>
                </div>
              </div>

              {lastCommit && (
                <div className="mt-3 text-xs text-slate-500">
                  Latest commit: <span className="font-medium text-slate-700">{lastCommit.message}</span>
                  {lastAuthor ? ` — ${lastAuthor}` : ''} ({lastCommit.timestamp})
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => navigate(`/projects/${p.id}`)}>
                  Open project
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => addToast({ title: 'Invitation copied (simulated)', message: 'Code: YDAY-2026' })}
                >
                  <Copy className="size-4" />
                  Copy invite
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} />

      <Modal
        title="Join project by invitation code (simulated)"
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setJoinOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                addToast({ title: 'Joined project (simulated)', message: inviteCode || 'YDAY-2026' })
                setJoinOpen(false)
                setInviteCode('')
              }}
            >
              Join
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-600">
          Enter any code to simulate joining. No membership changes are persisted beyond this demo toast.
        </div>
        <input
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          placeholder="e.g. YDAY-2026"
          className="mt-3 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
        />
      </Modal>
    </div>
  )
}
