import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppState } from '../../state/AppState'
import { Badge } from '../primitives/Badge'
import { Button } from '../primitives/Button'
import { Card } from '../primitives/Card'
import { Modal } from '../primitives/Modal'
import { cn } from '../utils/cn'
import { FolderKanban, ShieldPlus, Trash2, UserRoundCog, UsersRound } from 'lucide-react'

type AdminTab = 'projects' | 'users'

export function AdminDashboardPage() {
  const { currentUser, projects, users, deleteProject, deleteUser, addToast } = useAppState()
  const navigate = useNavigate()
  const [tab, setTab] = useState<AdminTab>('projects')

  const [confirmProjectId, setConfirmProjectId] = useState<string | null>(null)
  const [confirmUserId, setConfirmUserId] = useState<string | null>(null)
  const [newAdminOpen, setNewAdminOpen] = useState(false)

  const isAdmin = currentUser.role === 'admin'

  const confirmProject = useMemo(
    () => projects.find((p) => p.id === confirmProjectId) ?? null,
    [projects, confirmProjectId],
  )
  const confirmUser = useMemo(
    () => users.find((u) => u.id === confirmUserId) ?? null,
    [users, confirmUserId],
  )

  if (!isAdmin) {
    return (
      <Card className="p-6">
        <div className="text-sm font-semibold text-slate-900">Admin dashboard (2.0)</div>
        <div className="mt-1 text-sm text-slate-600">
          Permission denied. Switch to the admin mock account to access this page.
        </div>
        <div className="mt-4 flex gap-2">
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white">
              <UserRoundCog className="size-5" />
            </div>
            <div>
              <div className="text-xl font-semibold text-slate-950">Admin dashboard</div>
              <div className="mt-1 text-sm text-slate-600">
                Manage projects and users in the prototype workspace.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setNewAdminOpen(true)}>
              <ShieldPlus className="size-4" />
              Add admin
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
        <button
          className={cn(
            'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition',
            tab === 'projects' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100',
          )}
          onClick={() => setTab('projects')}
        >
          <FolderKanban className="size-4" />
          Project management
        </button>
        <button
          className={cn(
            'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition',
            tab === 'users' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100',
          )}
          onClick={() => setTab('users')}
        >
          <UsersRound className="size-4" />
          User management
        </button>
      </div>

      {tab === 'projects' ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">Members</th>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="border-t border-slate-200">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{p.name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{p.description}</div>
                    </td>
                    <td className="px-4 py-3">{p.members.length}</td>
                    <td className="px-4 py-3">
                      <Badge tone="info">{p.currentBranch}</Badge>
                    </td>
                    <td className="px-4 py-3">{p.lastUpdatedAt}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => navigate(`/projects/${p.id}`)}>
                          Open
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setConfirmProjectId(p.id)}>
                          <Trash2 className="size-4" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">Users</div>
            <div className="text-xs text-slate-500">Search is simulated (not implemented yet).</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-slate-200">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{u.name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{u.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={u.role === 'admin' ? 'warn' : 'neutral'}>{u.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => navigate(`/users/${u.id}`)}>
                          View profile
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={u.id === currentUser.id}
                          onClick={() => setConfirmUserId(u.id)}
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </Button>
                      </div>
                      {u.id === currentUser.id && (
                        <div className="mt-1 text-xs text-slate-500">You cannot delete yourself.</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        title="Delete project (simulated)"
        open={!!confirmProject}
        onClose={() => setConfirmProjectId(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmProjectId(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!confirmProject) return
                deleteProject(confirmProject.id)
                setConfirmProjectId(null)
              }}
            >
              Confirm delete
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-600">This deletion is simulated.</div>
        <div className="mt-2 text-sm font-medium text-slate-900">{confirmProject?.name}</div>
      </Modal>

      <Modal
        title="Delete user (simulated)"
        open={!!confirmUser}
        onClose={() => setConfirmUserId(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmUserId(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!confirmUser) return
                deleteUser(confirmUser.id)
                setConfirmUserId(null)
                addToast({ title: 'User deleted (simulated)' })
              }}
            >
              Confirm delete
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-600">This deletion is simulated.</div>
        <div className="mt-2 text-sm font-medium text-slate-900">{confirmUser?.name}</div>
      </Modal>

      <Modal
        title="Add admin account (simulated)"
        open={newAdminOpen}
        onClose={() => setNewAdminOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setNewAdminOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                addToast({ title: 'Admin account created (simulated)' })
                setNewAdminOpen(false)
              }}
            >
              Create
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-600">
          This shows where admin provisioning would happen. No real accounts are created.
        </div>
        <div className="mt-3 grid gap-3">
          <div>
            <div className="text-sm font-medium text-slate-800">Email</div>
            <input className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" placeholder="admin@example.com" />
          </div>
          <div>
            <div className="text-sm font-medium text-slate-800">Temp password</div>
            <input className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" placeholder="generated-password" />
          </div>
        </div>
        <div className="mt-3 text-xs text-slate-500">
          Tip: You can switch to the admin mock account via <Link className="underline" to="/login">Login</Link>.
        </div>
      </Modal>
    </div>
  )
}
