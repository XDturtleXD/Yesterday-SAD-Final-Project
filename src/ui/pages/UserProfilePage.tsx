import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAppState } from '../../state/AppState'
import { Badge } from '../primitives/Badge'
import { Avatar } from '../primitives/Avatar'
import { Button } from '../primitives/Button'
import { Card } from '../primitives/Card'
import { Modal } from '../primitives/Modal'
import { Camera, Edit3, FolderKanban, Trash2, UserRound } from 'lucide-react'

export function UserProfilePage() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { currentUser, projects, getUser, addToast, deleteUser } = useAppState()

  const u = userId ? getUser(userId) : undefined
  const isSelf = u?.id === currentUser.id
  const isAdmin = currentUser.role === 'admin'

  const participating = useMemo(
    () =>
      projects.filter((p) => p.members.some((m) => m.userId === u?.id)),
    [projects, u?.id],
  )

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (!u) {
    return (
      <Card className="p-6">
        <div className="text-sm font-semibold text-slate-900">User not found</div>
        <div className="mt-2">
          <Button variant="secondary" onClick={() => navigate('/')}>
            Back home
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white">
              <UserRound className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-semibold text-slate-950">User profile</div>
              <div className="mt-1 text-sm text-slate-600">
                {isSelf ? 'Viewing your own profile.' : 'Viewing another user’s shared projects and account role.'}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isSelf && (
              <Button variant="secondary" onClick={() => setEditOpen(true)}>
                <Edit3 className="size-4" />
                Edit profile
              </Button>
            )}
            {isAdmin && !isSelf && (
              <Button variant="danger" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" />
                Delete user
              </Button>
            )}
          </div>
        </div>
      </div>

      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <Avatar name={u.name} src={u.avatarUrl} size={48} />
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-slate-900">{u.name}</div>
              <div className="mt-1 flex flex-wrap gap-2">
                <Badge tone="info">role: {u.role}</Badge>
                <Badge>id: {u.id}</Badge>
              </div>
            </div>
          </div>
          {isSelf && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => addToast({ title: 'Avatar uploaded (simulated)' })}
              >
                <Camera className="size-4" />
                Upload avatar
              </Button>
            </div>
          )}
        </div>

        <div className="mt-4">
          <div className="text-sm font-medium text-slate-800">Introduction</div>
          <div className="mt-1 text-sm text-slate-600">{u.intro}</div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <FolderKanban className="size-4 text-slate-500" />
          Participating projects
        </div>
        <div className="mt-3 space-y-3">
          {participating.length === 0 ? (
            <div className="text-sm text-slate-500">No projects.</div>
          ) : (
            participating.map((p) => {
              const m = p.members.find((mm) => mm.userId === u.id)
              return (
                <div key={p.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{p.name}</div>
                      <div className="mt-1 text-sm text-slate-600">{p.description}</div>
                    </div>
                    <Button size="sm" onClick={() => navigate(`/projects/${p.id}`)}>
                      Open
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge>Your role: {m?.roles.join(', ') ?? '—'}</Badge>
                    <Badge>Your instrument(s): {m?.instruments.join(', ') ?? '—'}</Badge>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </Card>

      <Modal
        title="Edit profile (simulated)"
        open={editOpen}
        onClose={() => setEditOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                addToast({ title: 'Profile saved (simulated)' })
                setEditOpen(false)
              }}
            >
              Confirm
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-600">
          Editing is simulated for this prototype stage.
        </div>
        <div className="mt-3 grid gap-3">
          <div>
            <div className="text-sm font-medium text-slate-800">Name</div>
            <input
              defaultValue={u.name}
              className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            />
          </div>
          <div>
            <div className="text-sm font-medium text-slate-800">Introduction</div>
            <textarea
              defaultValue={u.intro}
              rows={3}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>
      </Modal>

      <Modal
        title="Delete user (simulated)"
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                deleteUser(u.id)
                setDeleteOpen(false)
                navigate('/admin')
              }}
            >
              Confirm delete
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-600">
          Admin-only action. This removes the user from local mock state.
        </div>
        <div className="mt-2 text-sm font-medium text-slate-900">{u.name}</div>
      </Modal>

      <div className="text-xs text-slate-500">
        Tip: Use <Link className="underline" to="/login">Login</Link> to switch roles for the presentation.
      </div>
    </div>
  )
}
