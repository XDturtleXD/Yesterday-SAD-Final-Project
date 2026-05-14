import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Instrument, Project, ProjectRole } from '../../../types'
import { useAppState } from '../../../state/AppState'
import { Badge } from '../../primitives/Badge'
import { Avatar } from '../../primitives/Avatar'
import { Button } from '../../primitives/Button'
import { Card } from '../../primitives/Card'
import { Modal } from '../../primitives/Modal'
import { MailPlus, SlidersHorizontal, UserPlus } from 'lucide-react'

const allRoles: ProjectRole[] = ['owner', 'conductor', 'section leader', 'performer', 'editor']
const allInstruments: Instrument[] = ['violin', 'viola', 'cello', 'flute', 'clarinet', 'trumpet', 'piano']

export function MembersPanel({ project }: { project: Project }) {
  const { currentUser, getUser, addToast } = useAppState()
  const [assignOpen, setAssignOpen] = useState<null | { userId: string; mode: 'role' | 'instrument' }>(null)
  const [selection, setSelection] = useState<string[]>([])

  const isOwner = useMemo(() => {
    if (currentUser.role === 'admin') return true
    const me = project.members.find((m) => m.userId === currentUser.id)
    return !!me?.roles.includes('owner')
  }, [currentUser, project.members])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">Members</div>
          <div className="mt-1 text-sm text-slate-600">
            Owner can invite and assign roles/instruments (simulated). Regular users can view only.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!isOwner}
            onClick={() => addToast({ title: 'Invite sent (simulated)', message: 'Invite notification would be triggered here.' })}
          >
            <MailPlus className="size-4" />
            Invite member
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Project role(s)</th>
                <th className="px-4 py-3 font-medium">Instrument(s)</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {project.members.map((m) => {
                const u = getUser(m.userId)
                return (
                  <tr key={m.userId} className="border-t border-slate-200">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar
                          name={u?.name ?? 'Unknown user'}
                          src={u?.avatarUrl}
                          size={36}
                        />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-900">
                            <Link to={`/users/${m.userId}`} className="hover:underline">
                              {u?.name ?? m.userId}
                            </Link>
                          </div>
                          <div className="text-xs text-slate-500">{u?.role ?? '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {m.roles.map((r) => (
                          <Badge key={r}>{r}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {m.instruments.map((i) => (
                          <Badge key={i} tone="info">
                            {i}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!isOwner}
                          onClick={() => {
                            setAssignOpen({ userId: m.userId, mode: 'role' })
                            setSelection(m.roles)
                          }}
                        >
                          <UserPlus className="size-4" />
                          Assign role
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!isOwner}
                          onClick={() => {
                            setAssignOpen({ userId: m.userId, mode: 'instrument' })
                            setSelection(m.instruments)
                          }}
                        >
                          <SlidersHorizontal className="size-4" />
                          Assign instrument
                        </Button>
                      </div>
                      {!isOwner && (
                        <div className="mt-1 text-xs text-slate-500">
                          Owner-only actions
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        title={
          assignOpen?.mode === 'role'
            ? 'Assign project roles (simulated)'
            : 'Assign instruments (simulated)'
        }
        open={!!assignOpen}
        onClose={() => setAssignOpen(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAssignOpen(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                addToast({
                  title: 'Assignment updated (simulated)',
                  message: selection.join(', ') || '—',
                })
                setAssignOpen(null)
              }}
            >
              Save
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-600">
          Prototype-only: this modal demonstrates where assignment UI lives. It does not persist changes yet.
        </div>

        <div className="mt-3 grid gap-2">
          {(assignOpen?.mode === 'role' ? allRoles : allInstruments).map((x) => {
            const key = x as string
            const checked = selection.includes(key)
            return (
              <label key={key} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    setSelection((prev) =>
                      e.target.checked ? [...prev, key] : prev.filter((p) => p !== key),
                    )
                  }}
                />
                <span className="text-slate-800">{key}</span>
              </label>
            )
          })}
        </div>
      </Modal>
    </div>
  )
}
