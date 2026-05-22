import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppState, useRequiredUser } from '../../state/AppState'
import { Badge } from '../primitives/Badge'
import { Avatar } from '../primitives/Avatar'
import { Button } from '../primitives/Button'
import { Card } from '../primitives/Card'
import { FolderKanban, UserRound } from 'lucide-react'

export function UserProfilePage() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { projects, getMemberDisplayName } = useAppState()
  const currentUser = useRequiredUser()

  const profileUser = useMemo(() => {
    if (!userId) return undefined
    if (userId === currentUser.id) return currentUser

    for (const p of projects) {
      const member = p.members.find((m) => m.userId === userId)
      if (member) {
        return {
          id: member.userId,
          name: member.userName,
          role: 'regular' as const,
          intro: member.userEmail,
        }
      }
    }

    const name = getMemberDisplayName(userId)
    if (name !== userId) {
      return { id: userId, name, role: 'regular' as const, intro: '' }
    }

    return undefined
  }, [userId, currentUser, projects, getMemberDisplayName])

  const isSelf = profileUser?.id === currentUser.id

  const participating = useMemo(
    () => projects.filter((p) => p.members.some((m) => m.userId === profileUser?.id)),
    [projects, profileUser?.id],
  )

  if (!profileUser) {
    return (
      <Card className="p-6">
        <div className="text-sm font-semibold text-slate-900">User not found</div>
        <div className="mt-2">
          <Button variant="secondary" onClick={() => navigate('/dashboard')}>
            Back home
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white">
            <UserRound className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xl font-semibold text-slate-950">User profile</div>
            <div className="mt-1 text-sm text-slate-600">
              {isSelf ? '你的個人資料' : '查看其他使用者的公開資訊'}
            </div>
          </div>
        </div>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-3">
          <Avatar name={profileUser.name} size={48} />
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-slate-900">{profileUser.name}</div>
            <div className="mt-1 flex flex-wrap gap-2">
              <Badge tone="info">role: {profileUser.role}</Badge>
            </div>
          </div>
        </div>

        {profileUser.intro && (
          <div className="mt-4">
            <div className="text-sm font-medium text-slate-800">Email</div>
            <div className="mt-1 text-sm text-slate-600">{profileUser.intro}</div>
          </div>
        )}
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
              const m = p.members.find((mm) => mm.userId === profileUser.id)
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
                    <Badge>Role: {m?.role ?? '—'}</Badge>
                    <Badge>Section: {m?.sectionName ?? '—'}</Badge>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </Card>
    </div>
  )
}
