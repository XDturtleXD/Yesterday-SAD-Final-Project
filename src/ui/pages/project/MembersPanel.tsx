import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { Project, ProjectMemberRole } from '../../../types'
import { useRequiredUser } from '../../../state/AppState'
import { Badge } from '../../primitives/Badge'
import { Avatar } from '../../primitives/Avatar'
import { Card } from '../../primitives/Card'

const roleLabels: Record<ProjectMemberRole, string> = {
  concertmaster: 'Concertmaster',
  principal: 'Principal',
  member: 'Member',
}

export function MembersPanel({ project }: { project: Project }) {
  const currentUser = useRequiredUser()

  const isLeader = useMemo(() => {
    if (currentUser.role === 'admin') return true
    const me = project.members.find((m) => m.userId === currentUser.id)
    return me?.role === 'concertmaster' || me?.role === 'principal'
  }, [currentUser, project.members])

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold text-slate-900">Members</div>
        <div className="mt-1 text-sm text-slate-600">
          {isLeader
            ? '你是此專案的首席或 concertmaster，可產生邀請碼邀請團員。'
            : '查看專案成員與聲部分配。'}
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Section</th>
              </tr>
            </thead>
            <tbody>
              {project.members.map((m) => {
                const avatarSrc =
                  m.avatarUrl || (m.userId === currentUser.id ? currentUser.avatarUrl : undefined)

                return (
                  <tr key={m.id} className="border-t border-slate-200">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={m.userName} src={avatarSrc} size={36} />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-900">
                            <Link to={`/users/${m.userId}`} className="hover:underline">
                              {m.userName}
                            </Link>
                            {m.userId === currentUser.id && (
                              <span className="ml-2 text-xs text-slate-500">(you)</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">{m.userEmail}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge>{roleLabels[m.role]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="info">{m.sectionName}</Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
