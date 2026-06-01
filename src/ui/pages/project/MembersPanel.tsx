import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { MemberInviteDraft, Project, ProjectMember } from '../../../types'
import { ApiError } from '../../../api/client'
import { useAppState, useRequiredUser } from '../../../state/AppState'
import { Badge } from '../../primitives/Badge'
import { Avatar } from '../../primitives/Avatar'
import { Button } from '../../primitives/Button'
import { Card } from '../../primitives/Card'
import { Modal } from '../../primitives/Modal'
import { inviteRoleLabel, memberRoleLabel, useTranslation } from '../../../i18n'
import { memberSectionLabel, sectionLabel } from '../../../utils/sectionLabels'
import { Copy, MailPlus, Trash2 } from 'lucide-react'

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
  const { language, t } = useTranslation()
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
      setInviteError(t('members.chooseSection'))
      return
    }
    if (!isManager && inviteMode === 'principal') {
      setInviteError(t('members.managerOnlyPrincipalInvite'))
      return
    }

    setInviteLoading(true)
    try {
      const invite = await createMemberInvite(project.id, {
        sectionId: inviteSectionId,
        targetRole: inviteMode,
      })
      setLatestInvite(invite)
      addToast({ title: t('members.inviteCodeGenerated'), message: `${invite.sectionName} · ${inviteRoleLabel(invite.targetRole, language)}` })
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : t('members.inviteGenerateFailed'))
    } finally {
      setInviteLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{t('members.title')}</div>
          <div className="mt-1 text-sm text-slate-600">
            {t('members.description')}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={!isManager} onClick={() => openInvite('principal')}>
            <MailPlus className="size-4" />
            {t('members.invitePrincipal')}
          </Button>
          <Button variant="secondary" disabled={!canInvite} onClick={() => openInvite('member')}>
            <MailPlus className="size-4" />
            {t('members.inviteMember')}
          </Button>
        </div>
      </div>

      {!canInvite && (
        <Card className="p-4">
          <div className="text-sm font-semibold text-slate-900">{t('members.permissionLimits')}</div>
          <div className="mt-1 text-sm text-slate-600">
            {t('members.permissionLimitsDescription')}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">{t('common.user')}</th>
                <th className="px-4 py-3 font-medium">{t('common.role')}</th>
                <th className="px-4 py-3 font-medium">{t('common.section')}</th>
                <th className="px-4 py-3 font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {project.members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  currentUserId={currentUser.id}
                  currentUserAvatarUrl={currentUser.avatarUrl}
                  language={language}
                  t={t}
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
          <div className="text-sm font-semibold text-slate-950">{t('members.invitesThisSession')}</div>
          <div className="mt-3 grid gap-2">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <div className="text-sm text-slate-700">
                  {invite.sectionName} · {inviteRoleLabel(invite.targetRole, language)}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(invite.inviteCode)
                    addToast({ title: t('project.inviteCodeCopied') })
                  }}
                >
                  <Copy className="size-4" />
                  {t('common.copy')}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal
        title={inviteMode === 'principal' ? t('members.inviteSectionPrincipal') : t('members.inviteMember')}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setInviteOpen(false)} disabled={inviteLoading}>
              {t('common.close')}
            </Button>
            <Button disabled={inviteLoading || !inviteSectionId} onClick={submitInvite}>
              {inviteLoading ? t('common.generating') : t('members.generateInvite')}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {/* TODO API contract: POST /api/projects/:projectId/invites request { targetRole, sectionId } response { inviteCode, targetRole, sectionId, expiresAt } */}
            {t('members.inviteBackendNote')}
          </div>
          <div>
            <label className="text-sm font-medium text-slate-800">{t('members.inviteRole')}</label>
            <div className="mt-1 flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900">
              {inviteRoleLabel(inviteMode, language)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {t('members.inviteRoleHelp')}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-800">{t('members.assignedSection')}</label>
            <select
              value={inviteSectionId}
              onChange={(event) => setInviteSectionId(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              {availableInviteSections.map((section) => (
                <option key={section.id} value={section.id}>
                  {sectionLabel(section, language)}
                </option>
              ))}
            </select>
          </div>
          {latestInvite && (
            <div>
              <label className="text-sm font-medium text-slate-800">{t('members.inviteCode')}</label>
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
  language,
  t,
  canRemove,
  onRemove,
}: {
  member: ProjectMember
  currentUserId: string
  currentUserAvatarUrl?: string
  language: ReturnType<typeof useTranslation>['language']
  t: ReturnType<typeof useTranslation>['t']
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
                <span className="ml-2 text-xs text-slate-500">({t('common.you')})</span>
              )}
            </div>
            <div className="text-xs text-slate-500">{member.userEmail}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge>{memberRoleLabel(member.role, language)}</Badge>
      </td>
      <td className="px-4 py-3">
        <Badge tone="info">{memberSectionLabel(member, language)}</Badge>
      </td>
      <td className="px-4 py-3">
        <Button size="sm" variant="danger" disabled={!canRemove} onClick={onRemove}>
          <Trash2 className="size-4" />
          {t('common.remove')}
        </Button>
      </td>
    </tr>
  )
}
