import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { useAppState, useRequiredUser } from '../../state/AppState'
import { Badge } from '../primitives/Badge'
import { Button } from '../primitives/Button'
import { Card } from '../primitives/Card'
import { Modal } from '../primitives/Modal'
import { CreateProjectModal } from './modals/CreateProjectModal'
import { Copy, FolderPlus, LogIn, Music2 } from 'lucide-react'

export function ProjectsPage() {
  const {
    projects,
    projectsLoading,
    getMemberDisplayName,
    createInviteCode,
    joinProject,
    loadSections,
    sections,
    addToast,
  } = useAppState()
  const currentUser = useRequiredUser()
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [joinSectionId, setJoinSectionId] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinError, setJoinError] = useState('')

  useEffect(() => {
    if (joinOpen) {
      loadSections().then((rows) => {
        if (rows.length > 0) {
          setJoinSectionId((prev) => prev || rows[0].id)
        }
      })
    }
  }, [joinOpen, loadSections])

  const latestCommit = (p: (typeof projects)[0]) => p.commits[0]

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="text-xl font-semibold text-slate-950">Projects</div>
          <div className="mt-1 text-sm text-slate-600">
            {projectsLoading ? 'Loading…' : `${projects.length} workspaces`}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setCreateOpen(true)}>
            <FolderPlus className="size-4" />
            Create project
          </Button>
          <Button variant="secondary" onClick={() => setJoinOpen(true)}>
            <LogIn className="size-4" />
            Join by code
          </Button>
        </div>
      </div>

      {!projectsLoading && projects.length === 0 && (
        <Card className="p-6">
          <div className="text-sm font-semibold text-slate-900">尚無專案</div>
          <div className="mt-1 text-sm text-slate-600">
            建立新專案，或使用邀請碼加入既有樂團。
          </div>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {projects.map((p) => {
          const myMember = p.members.find((m) => m.userId === currentUser.id)
          const myRole = myMember?.role ?? (currentUser.role === 'admin' ? 'admin' : '—')
          const mySection = myMember?.sectionName ?? '—'
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
                        Updated {p.updatedAt.slice(0, 10)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm text-slate-600">{p.description}</div>
                  <div className="mt-3 text-xs text-slate-500">
                    {myRole} · {mySection}
                    {p.detailLoaded ? ` · ${p.scores.length} scores` : ''}
                  </div>
                </div>
                {p.detailLoaded && <Badge>{p.members.length} members</Badge>}
              </div>

              {lastCommit && (
                <details className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <summary className="cursor-pointer font-medium text-slate-700">
                    Latest update
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
                  Open project
                </Button>
                {myMember &&
                  (myMember.role === 'concertmaster' || myMember.role === 'principal') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        try {
                          const code = await createInviteCode(p.id)
                          await navigator.clipboard.writeText(code)
                          addToast({ title: '邀請碼已複製', message: '已複製到剪貼簿' })
                        } catch (err) {
                          addToast({
                            title: '無法建立邀請碼',
                            message: err instanceof ApiError ? err.message : '請稍後再試',
                          })
                        }
                      }}
                    >
                      <Copy className="size-4" />
                      Copy invite
                    </Button>
                  )}
              </div>
            </Card>
          )
        })}
      </div>

      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} />

      <Modal
        title="使用邀請碼加入專案"
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setJoinOpen(false)} disabled={joinLoading}>
              Cancel
            </Button>
            <Button
              disabled={joinLoading || !inviteCode.trim() || !joinSectionId}
              onClick={async () => {
                setJoinError('')
                setJoinLoading(true)
                try {
                  await joinProject({
                    inviteCode: inviteCode.trim(),
                    sectionId: joinSectionId,
                  })
                  setJoinOpen(false)
                  setInviteCode('')
                } catch (err) {
                  setJoinError(err instanceof ApiError ? err.message : '加入專案失敗')
                } finally {
                  setJoinLoading(false)
                }
              }}
            >
              {joinLoading ? '加入中…' : 'Join'}
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-600">
          輸入首席或 concertmaster 提供的邀請碼，並選擇你的聲部。
        </div>
        <input
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          placeholder="貼上邀請碼"
          className="mt-3 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
        />
        <select
          value={joinSectionId}
          onChange={(e) => setJoinSectionId(e.target.value)}
          className="mt-3 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
        >
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {joinError && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {joinError}
          </div>
        )}
      </Modal>
    </div>
  )
}
