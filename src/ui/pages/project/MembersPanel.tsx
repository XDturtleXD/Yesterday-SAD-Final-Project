import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { MemberInviteDraft, Project, ProjectMember, ProjectMemberRole } from '../../../types'
import { ApiError } from '../../../api/client'
import { useAppState, useRequiredUser } from '../../../state/AppState'
import { Badge } from '../../primitives/Badge'
import { Avatar } from '../../primitives/Avatar'
import { Button } from '../../primitives/Button'
import { Card } from '../../primitives/Card'
import { Modal } from '../../primitives/Modal'
import { memberSectionLabel, sectionLabel } from '../../../utils/sectionLabels'
import { Copy, MailPlus, Trash2 } from 'lucide-react'

const roleLabels: Record<ProjectMemberRole, string> = {
  concertmaster: 'Manager',
  principal: 'Principal',
  member: 'Member',
}

type InviteMode = 'principal' | 'member'

export function MembersPanel({ project }: { project: Project }) {
  const {
    addToast,
    createMemberInvite,
    getMemberInvites,
    loadSections,
    removeProjectMemberMock,
    sections,
  } = useAppState()
  const currentUser = useRequiredUser()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteMode, setInviteMode] = useState<InviteMode>('member')
  const [inviteSectionId, setInviteSectionId] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [latestInvite, setLatestInvite] = useState<MemberInviteDraft | null>(null)

  const myMember = project.members.find((member) => member.userId === currentUser.id)
  const isManager = currentUser.role === 'admin' || myMember?.role === 'concertmaster'
  const isPrincipal = myMember?.role === 'principal'
  const canInvite = isManager || isPrincipal
  const invites = getMemberInvites(project.id)

  useEffect(() => {
    void loadSections()
  }, [loadSections])

  const availableInviteSections = useMemo(() => {
    if (isManager) return sections
    if (isPrincipal && myMember) return sections.filter((section) => section.id === myMember.sectionId)
    return []
  }, [isManager, isPrincipal, myMember, sections])

  function openInvite(mode: InviteMode) {
    const nextMode = isPrincipal ? 'member' : mode
    setInviteMode(nextMode)
    setInviteSectionId((prev) => prev || availableInviteSections[0]?.id || '')
    setInviteError('')
    setLatestInvite(null)
    setInviteOpen(true)
  }

  async function submitInvite() {
    setInviteError('')
    if (!inviteSectionId) {
      setInviteError('Choose a section')
      return
    }
    if (!isManager && inviteMode === 'principal') {
      setInviteError('Only managers can invite section principals')
      return
    }

    setInviteLoading(true)
    try {
      const invite = await createMemberInvite(project.id, {
        sectionId: inviteSectionId,
        targetRole: inviteMode,
      })
      setLatestInvite(invite)
      addToast({ title: 'Invite code generated', message: `${invite.sectionName} · ${roleLabel(invite.targetRole)}` })
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : 'Failed to generate invite code')
    } finally {
      setInviteLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Members & Invites</div>
          <div className="mt-1 text-sm text-slate-600">
            Managers invite section principals. Principals can invite members for their own section.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={!isManager} onClick={() => openInvite('principal')}>
            <MailPlus className="size-4" />
            Invite principal
          </Button>
          <Button variant="secondary" disabled={!canInvite} onClick={() => openInvite('member')}>
            <MailPlus className="size-4" />
            Invite member
          </Button>
        </div>
      </div>

      {!canInvite && (
        <Card className="p-4">
          <div className="text-sm font-semibold text-slate-900">Permission limits</div>
          <div className="mt-1 text-sm text-slate-600">
            Members can view the member list, but cannot invite or remove members.
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Section</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {project.members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  currentUserId={currentUser.id}
                  currentUserAvatarUrl={currentUser.avatarUrl}
                  canRemove={isManager && member.userId !== currentUser.id}
                  onRemove={() => removeProjectMemberMock(project.id, member.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {invites.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-semibold text-slate-950">Invites generated this session</div>
          <div className="mt-3 grid gap-2">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <div className="text-sm text-slate-700">
                  {invite.sectionName} · {roleLabel(invite.targetRole)}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(invite.inviteCode)
                    addToast({ title: 'Invite code copied' })
                  }}
                >
                  <Copy className="size-4" />
                  Copy
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal
        title={inviteMode === 'principal' ? 'Invite section principal' : 'Invite member'}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setInviteOpen(false)} disabled={inviteLoading}>
              Close
            </Button>
            <Button disabled={inviteLoading || !inviteSectionId} onClick={submitInvite}>
              {inviteLoading ? 'Generating...' : 'Generate invite'}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {/* TODO API contract: POST /api/projects/:projectId/invites request { targetRole, sectionId } response { inviteCode, targetRole, sectionId, expiresAt } */}
            The backend currently creates a generic invite code. Role and section intent are kept in this UI for now.
          </div>
          <div>
            <label className="text-sm font-medium text-slate-800">Invite role</label>
            <div className="mt-1 flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900">
              {roleLabel(inviteMode)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              The role is set by the invite button you chose. Principal invites are always for members.
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-800">Assigned section</label>
            <select
              value={inviteSectionId}
              onChange={(event) => setInviteSectionId(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              {availableInviteSections.map((section) => (
                <option key={section.id} value={section.id}>
                  {sectionLabel(section)}
                </option>
              ))}
            </select>
          </div>
          {latestInvite && (
            <div>
              <label className="text-sm font-medium text-slate-800">Invite code</label>
              <textarea
                readOnly
                rows={4}
                value={latestInvite.inviteCode}
                className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs"
              />
            </div>
          )}
          {inviteError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {inviteError}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

function MemberRow({
  member,
  currentUserId,
  currentUserAvatarUrl,
  canRemove,
  onRemove,
}: {
  member: ProjectMember
  currentUserId: string
  currentUserAvatarUrl?: string
  canRemove: boolean
  onRemove: () => void
}) {
  const avatarSrc =
    member.avatarUrl || (member.userId === currentUserId ? currentUserAvatarUrl : undefined)

  return (
    <tr className="border-t border-slate-200">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={member.userName} src={avatarSrc} size={36} />
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-900">
              <Link to={`/users/${member.userId}`} className="hover:underline">
                {member.userName}
              </Link>
              {member.userId === currentUserId && (
                <span className="ml-2 text-xs text-slate-500">(you)</span>
              )}
            </div>
            <div className="text-xs text-slate-500">{member.userEmail}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge>{roleLabels[member.role]}</Badge>
      </td>
      <td className="px-4 py-3">
        <Badge tone="info">{memberSectionLabel(member)}</Badge>
      </td>
      <td className="px-4 py-3">
        <Button size="sm" variant="danger" disabled={!canRemove} onClick={onRemove}>
          <Trash2 className="size-4" />
          Remove
        </Button>
      </td>
    </tr>
  )
}

function roleLabel(role: InviteMode) {
  return role === 'principal' ? 'Section principal' : 'Member'
}
