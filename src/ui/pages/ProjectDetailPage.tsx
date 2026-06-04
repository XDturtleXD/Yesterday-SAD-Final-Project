import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { useAppState, useRequiredUser } from '../../state/AppState'
import { Badge } from '../primitives/Badge'
import { Button } from '../primitives/Button'
import { Card } from '../primitives/Card'
import { Modal } from '../primitives/Modal'
import { cn } from '../utils/cn'
import { roleLabel, useTranslation } from '../../i18n'
import { memberPositionLabel } from '../../utils/sectionLabels'
import { BranchesPanel } from './project/BranchesPanel'
import { FullScorePanel } from './project/FullScorePanel'
import { MembersPanel } from './project/MembersPanel'
import { PiecesPanel } from './project/PiecesPanel'
import { VersionsPanel } from './project/VersionsPanel'
import { ArrowLeft, Edit3, GitBranch, MailPlus } from 'lucide-react'

type TabKey = 'overview' | 'pieces' | 'members' | 'branches' | 'versions' | 'fullscore'

export function ProjectDetailPage() {
  const { projectId } = useParams()
  const { getProject, loadProjectDetail, getMemberDisplayName, createInviteCode, addToast } =
    useAppState()
  const currentUser = useRequiredUser()
  const { language, t } = useTranslation()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const tabParam = sp.get('tab')
  const tab: TabKey =
    tabParam === 'scores' ? 'pieces' : ((tabParam as TabKey) || 'overview')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [loading, setLoading] = useState(true)

  const project = projectId ? getProject(projectId) : undefined

  useEffect(() => {
    if (!projectId) return
    // Read current project state directly — intentionally not in deps to avoid
    // re-triggering every time `projects` state changes (which would cause a loop).
    const already = getProject(projectId)
    if (already?.detailLoaded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false)
      return
    }
    setLoading(true)
    setAccessDenied(false)
    loadProjectDetail(projectId)
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
          setAccessDenied(true)
        }
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, loadProjectDetail])

  const myMember = useMemo(
    () => project?.members.find((m) => m.userId === currentUser.id),
    [project, currentUser.id],
  )
  const myRole = myMember
    ? memberPositionLabel(myMember, language)
    : currentUser.role === 'admin'
      ? roleLabel(currentUser.role, language)
      : '—'
  const currentCommit = project?.commits.find(
    (c) => c.id === project.branches.find((b) => b.id === project.currentBranchId)?.headCommitId,
  )

  const canInvite =
    currentUser.role === 'admin' ||
    myMember?.role === 'concertmaster' ||
    myMember?.role === 'principal'

  if (loading || project?.detailLoading) {
    return (
      <Card className="p-6">
        <div className="text-sm text-slate-600">{t('project.loading')}</div>
      </Card>
    )
  }

  if (!project || accessDenied) {
    return (
      <Card className="p-6">
        <div className="text-sm font-semibold text-slate-900">
          {accessDenied ? t('project.noAccess') : t('project.notFound')}
        </div>
        <div className="mt-1 text-sm text-slate-600">
          {t('project.goBackTo')}{' '}
          <Link className="underline" to="/projects">
            {t('project.projectList')}
          </Link>
          .
        </div>
      </Card>
    )
  }

  // detailLoaded=false here means the API fetch failed (members would be empty []).
  // Show a retry card rather than the misleading "not a member" message.
  if (!project.detailLoaded) {
    return (
      <Card className="p-6">
        <div className="text-sm font-semibold text-slate-900">{t('project.failedLoad')}</div>
        <div className="mt-1 text-sm text-slate-600">{t('project.failedLoadDescription')}</div>
        <div className="mt-3 flex gap-2">
          <Button onClick={() => window.location.reload()}>{t('project.refresh')}</Button>
          <Button variant="secondary" onClick={() => navigate('/projects')}>{t('project.backToList')}</Button>
        </div>
      </Card>
    )
  }

  if (!myMember && currentUser.role !== 'admin') {
    return (
      <Card className="p-6">
        <div className="text-sm font-semibold text-slate-900">{t('project.notMember')}</div>
        <div className="mt-1 text-sm text-slate-600">
          {t('project.goBackTo')}{' '}
          <Link className="underline" to="/projects">
            {t('project.projectList')}
          </Link>
          .
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-xl font-semibold text-slate-950">{project.name}</div>
            <Badge tone="info">
              <GitBranch className="mr-1 size-3" />
              {project.currentBranchName}
            </Badge>
          </div>
          <div className="mt-1 text-sm text-slate-600">{project.description}</div>
          <div className="mt-2 text-xs text-slate-500">
            {project.members.length} {t('projects.members')} · {project.scores.length} {t('projects.scores')} · {myRole}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => navigate(`/projects/${project.id}/edit`)}>
            <Edit3 className="size-4" />
            {t('common.edit')}
          </Button>
          <Button variant="secondary" onClick={() => setInviteOpen(true)} disabled={!canInvite}>
            <MailPlus className="size-4" />
            {t('project.inviteMember')}
          </Button>
          <Button variant="ghost" onClick={() => navigate('/projects')}>
            <ArrowLeft className="size-4" />
            {t('projects.title')}
          </Button>
        </div>
      </div>

      <Tabs tab={tab} projectId={project.id} />

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-4 lg:col-span-2">
            <div className="text-sm font-semibold text-slate-950">{t('project.overview')}</div>
            {currentCommit && (
              <div className="mt-1 text-sm text-slate-600">{t('project.latest')}: {currentCommit.message}</div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <QuickLink title={t('quick.pieces.title')} desc={t('quick.pieces.desc')} to={`?tab=pieces`} />
              <QuickLink title={t('tabs.members')} desc={t('quick.members.desc')} to={`?tab=members`} />
              <QuickLink title={t('tabs.branches')} desc={t('quick.branches.desc')} to={`?tab=branches`} />
              <QuickLink title={t('quick.fullScore.title')} desc={t('quick.fullScore.desc')} to={`?tab=fullscore`} />
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm font-semibold text-slate-950">{t('project.recentCommits')}</div>
            <div className="mt-3 space-y-2">
              {project.commits.slice(0, 3).map((c) => (
                <div key={c.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-sm font-medium text-slate-950">{c.message}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {getMemberDisplayName(c.authorUserId)} · {c.branchName}
                  </div>
                </div>
              ))}
              {project.commits.length === 0 && (
                <div className="text-sm text-slate-500">{t('project.noCommitHistory')}</div>
              )}
            </div>
            <div className="mt-3">
              <Button variant="ghost" onClick={() => navigate(`?tab=versions`)}>
                {t('project.viewVersionHistory')}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {tab === 'pieces' && <PiecesPanel project={project} />}
      {tab === 'members' && <MembersPanel project={project} />}
      {tab === 'branches' && <BranchesPanel project={project} />}
      {tab === 'versions' && <VersionsPanel project={project} />}
      {tab === 'fullscore' && <FullScorePanel project={project} />}

      <Modal
        title={t('project.inviteMember')}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>
              {t('common.close')}
            </Button>
            <Button
              disabled={inviteLoading || !inviteCode}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(inviteCode)
                  addToast({ title: t('project.inviteCodeCopied'), message: t('project.inviteCodeCopiedMessage') })
                } catch {
                  addToast({ title: t('project.copyFailed'), message: t('project.copyFailedMessage') })
                }
              }}
            >
              {t('common.copyCode')}
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-600">
          {t('project.inviteDescription')}
        </div>
        {inviteLoading ? (
          <div className="mt-3 text-sm text-slate-500">{t('project.generatingInvite')}</div>
        ) : (
          <textarea
            readOnly
            value={inviteCode}
            rows={4}
            className="mt-3 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs"
          />
        )}
      </Modal>

      {inviteOpen && !inviteCode && !inviteLoading && (
        <InviteCodeLoader
          projectId={project.id}
          createInviteCode={createInviteCode}
          onLoaded={setInviteCode}
          onLoading={setInviteLoading}
        />
      )}
    </div>
  )
}

function InviteCodeLoader({
  projectId,
  createInviteCode,
  onLoaded,
  onLoading,
}: {
  projectId: string
  createInviteCode: (id: string) => Promise<string>
  onLoaded: (code: string) => void
  onLoading: (v: boolean) => void
}) {
  useEffect(() => {
    onLoading(true)
    createInviteCode(projectId)
      .then(onLoaded)
      .finally(() => onLoading(false))
  }, [projectId, createInviteCode, onLoaded, onLoading])

  return null
}

function Tabs({ tab, projectId }: { tab: TabKey; projectId: string }) {
  const { t } = useTranslation()
  const items: Array<{ key: TabKey; label: string }> = [
    { key: 'overview', label: t('tabs.overview') },
    { key: 'pieces', label: t('tabs.pieces') },
    { key: 'members', label: t('tabs.members') },
    { key: 'branches', label: t('tabs.branches') },
    { key: 'versions', label: t('tabs.versions') },
    { key: 'fullscore', label: t('tabs.fullScore') },
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
    <Link
      to={to}
      className="group block rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50"
    >
      <div className="text-sm font-semibold text-slate-950 group-hover:underline">{title}</div>
      <div className="mt-1 text-sm text-slate-600">{desc}</div>
    </Link>
  )
}
