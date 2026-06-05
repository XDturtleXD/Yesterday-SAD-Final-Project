import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { useAppState, useRequiredUser } from '../../state/AppState'
import { Badge } from '../primitives/Badge'
import { Button } from '../primitives/Button'
import { Card } from '../primitives/Card'
import { Modal } from '../primitives/Modal'
import { roleLabel, useTranslation } from '../../i18n'
import { memberPositionLabel } from '../../utils/sectionLabels'
import { FolderPlus, LogIn, Music2 } from 'lucide-react'

export function ProjectsPage() {
  const {
    projects,
    projectsLoading,
    getMemberDisplayName,
    joinProject,
  } = useAppState()
  const currentUser = useRequiredUser()
  const { language, t } = useTranslation()
  const navigate = useNavigate()
  const [joinOpen, setJoinOpen] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinError, setJoinError] = useState('')

  const latestCommit = (p: (typeof projects)[0]) => p.commits[0]

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="text-xl font-semibold text-slate-950">{t('projects.title')}</div>
          <div className="mt-1 text-sm text-slate-600">
            {projectsLoading ? t('common.loading') : `${projects.length} ${t('projects.workspaces')}`}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/projects/new')}>
            <FolderPlus className="size-4" />
            {t('projects.create')}
          </Button>
          <Button variant="secondary" onClick={() => setJoinOpen(true)}>
            <LogIn className="size-4" />
            {t('projects.joinByCode')}
          </Button>
        </div>
      </div>

      {!projectsLoading && projects.length === 0 && (
        <Card className="p-6">
          <div className="text-sm font-semibold text-slate-900">{t('projects.noProjectsTitle')}</div>
          <div className="mt-1 text-sm text-slate-600">
            {t('projects.noProjectsDescription')}
          </div>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {projects.map((p) => {
          const myMember = p.members.find((m) => m.userId === currentUser.id)
          const myRole = myMember
            ? memberPositionLabel(myMember, language)
            : currentUser.role === 'admin'
              ? roleLabel(currentUser.role, language)
              : '—'
          const lastCommit = latestCommit(p)
          const lastAuthor = lastCommit
            ? getMemberDisplayName(lastCommit.authorUserId)
            : undefined

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
                      <div className="text-xs text-slate-500">
                        {t('common.updated')} {p.updatedAt.slice(0, 10)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm text-slate-600">{p.description}</div>
                  <div className="mt-3 text-xs text-slate-500">
                    {myRole}
                    {p.detailLoaded ? ` · ${p.scores.length} ${t('projects.scores')}` : ''}
                  </div>
                </div>
                {p.detailLoaded && <Badge>{p.members.length} {t('projects.members')}</Badge>}
              </div>

              {lastCommit && (
                <details className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <summary className="cursor-pointer font-medium text-slate-700">
                    {t('projects.latestUpdate')}
                  </summary>
                  <div className="mt-2">
                    <span className="font-medium text-slate-800">{lastCommit.message}</span>
                    {lastAuthor ? ` — ${lastAuthor}` : ''} · {lastCommit.timestamp} ·{' '}
                    {lastCommit.branchName}
                  </div>
                </details>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => navigate(`/projects/${p.id}`)}>
                  {t('projects.openProject')}
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      <Modal
        title={t('projects.joinTitle')}
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setJoinOpen(false)} disabled={joinLoading}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={joinLoading || !inviteCode.trim()}
              onClick={async () => {
                setJoinError('')
                setJoinLoading(true)
                try {
                  await joinProject({
                    inviteCode: inviteCode.trim(),
                  })
                  setJoinOpen(false)
                  setInviteCode('')
                } catch (err) {
                  setJoinError(err instanceof ApiError ? err.message : t('projects.joinFailed'))
                } finally {
                  setJoinLoading(false)
                }
              }}
            >
              {joinLoading ? t('projects.joining') : t('projects.join')}
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-600">
          {t('projects.joinDescription')}
        </div>
        <input
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          placeholder={t('projects.invitePlaceholder')}
          className="mt-3 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
        />
        {joinError && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {joinError}
          </div>
        )}
      </Modal>
    </div>
  )
}
