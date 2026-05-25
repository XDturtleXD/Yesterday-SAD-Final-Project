import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { useAppState, useRequiredUser } from '../../state/AppState'
import { Badge } from '../primitives/Badge'
import { Button } from '../primitives/Button'
import { Card } from '../primitives/Card'
import { Modal } from '../primitives/Modal'
import { cn } from '../utils/cn'
import { BranchesPanel } from './project/BranchesPanel'
import { FullScorePanel } from './project/FullScorePanel'
import { MembersPanel } from './project/MembersPanel'
import { ScoresPanel } from './project/ScoresPanel'
import { VersionsPanel } from './project/VersionsPanel'
import { ArrowLeft, GitBranch, MailPlus } from 'lucide-react'

type TabKey = 'overview' | 'scores' | 'members' | 'branches' | 'versions' | 'fullscore'

export function ProjectDetailPage() {
  const { projectId } = useParams()
  const { getProject, loadProjectDetail, getMemberDisplayName, createInviteCode, addToast } =
    useAppState()
  const currentUser = useRequiredUser()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const tab = (sp.get('tab') as TabKey) || 'overview'
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
  const myRole = myMember?.role ?? (currentUser.role === 'admin' ? 'admin' : 'viewer')
  const mySection = myMember?.sectionName ?? '—'
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
        <div className="text-sm text-slate-600">Loading project…</div>
      </Card>
    )
  }

  if (!project || accessDenied) {
    return (
      <Card className="p-6">
        <div className="text-sm font-semibold text-slate-900">
          {accessDenied ? '無權存取此專案' : 'Project not found'}
        </div>
        <div className="mt-1 text-sm text-slate-600">
          Go back to the{' '}
          <Link className="underline" to="/projects">
            project list
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
        <div className="text-sm font-semibold text-slate-900">載入專案失敗</div>
        <div className="mt-1 text-sm text-slate-600">無法取得專案詳細資料，請重新整理頁面後再試。</div>
        <div className="mt-3 flex gap-2">
          <Button onClick={() => window.location.reload()}>重新整理</Button>
          <Button variant="secondary" onClick={() => navigate('/projects')}>返回列表</Button>
        </div>
      </Card>
    )
  }

  if (!myMember && currentUser.role !== 'admin') {
    return (
      <Card className="p-6">
        <div className="text-sm font-semibold text-slate-900">你不是此專案的成員</div>
        <div className="mt-1 text-sm text-slate-600">
          Go back to the{' '}
          <Link className="underline" to="/projects">
            project list
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
            {project.members.length} members · {project.scores.length} scores · {myRole}
            {mySection !== '—' ? ` · ${mySection}` : ''}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setInviteOpen(true)} disabled={!canInvite}>
            <MailPlus className="size-4" />
            Invite member
          </Button>
          <Button variant="ghost" onClick={() => navigate('/projects')}>
            <ArrowLeft className="size-4" />
            Projects
          </Button>
        </div>
      </div>

      <Tabs tab={tab} projectId={project.id} />

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-4 lg:col-span-2">
            <div className="text-sm font-semibold text-slate-950">Overview</div>
            {currentCommit && (
              <div className="mt-1 text-sm text-slate-600">Latest: {currentCommit.message}</div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <QuickLink title="Scores" desc="Open parts and MusicXML editing." to={`?tab=scores`} />
              <QuickLink title="Members" desc="Roles and sections." to={`?tab=members`} />
              <QuickLink title="Branches" desc="Switch and merge versions." to={`?tab=branches`} />
              <QuickLink title="Full score" desc="Preview combined parts." to={`?tab=fullscore`} />
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm font-semibold text-slate-950">Recent commits</div>
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
                <div className="text-sm text-slate-500">尚無 commit 紀錄</div>
              )}
            </div>
            <div className="mt-3">
              <Button variant="ghost" onClick={() => navigate(`?tab=versions`)}>
                View version history
              </Button>
            </div>
          </Card>
        </div>
      )}

      {tab === 'scores' && <ScoresPanel project={project} />}
      {tab === 'members' && <MembersPanel project={project} />}
      {tab === 'branches' && <BranchesPanel project={project} />}
      {tab === 'versions' && <VersionsPanel project={project} />}
      {tab === 'fullscore' && <FullScorePanel project={project} />}

      <Modal
        title="邀請成員"
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>
              Close
            </Button>
            <Button
              disabled={inviteLoading || !inviteCode}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(inviteCode)
                  addToast({ title: '邀請碼已複製', message: '分享給團員即可加入' })
                } catch {
                  addToast({ title: '複製失敗', message: '請手動選取邀請碼' })
                }
              }}
            >
              Copy code
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-600">
          將以下邀請碼分享給團員。對方登入後可在 Projects 頁面使用「Join by code」加入。
        </div>
        {inviteLoading ? (
          <div className="mt-3 text-sm text-slate-500">產生邀請碼中…</div>
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
  const items: Array<{ key: TabKey; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'scores', label: 'Scores' },
    { key: 'members', label: 'Members' },
    { key: 'branches', label: 'Branches' },
    { key: 'versions', label: 'Versions' },
    { key: 'fullscore', label: 'Full Score Preview' },
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
