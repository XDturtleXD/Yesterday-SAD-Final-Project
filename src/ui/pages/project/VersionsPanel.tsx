import { useState } from 'react'
import type { Project } from '../../../types'
import * as historyApi from '../../../api/history'
import { mapScoreVersion } from '../../../api/mappers'
import type { ApiCommitDetail } from '../../../api/types'
import { ApiError } from '../../../api/client'
import { useAppState } from '../../../state/AppState'
import { Badge } from '../../primitives/Badge'
import { Button } from '../../primitives/Button'
import { Card } from '../../primitives/Card'
import { Modal } from '../../primitives/Modal'
import { GitCommitHorizontal, GitBranch, Plus } from 'lucide-react'

type CommitDetailState =
  | { status: 'idle' }
  | { status: 'loading'; commitId: string }
  | { status: 'ready'; detail: ApiCommitDetail }
  | { status: 'error'; message: string }

export function VersionsPanel({ project }: { project: Project }) {
  const { getMemberDisplayName, switchBranch, createCommit, addToast } = useAppState()
  const commits = project.commits

  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const [commitDetailState, setCommitDetailState] = useState<CommitDetailState>({ status: 'idle' })
  const [createOpen, setCreateOpen] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleSwitchBranch(branchId: string) {
    if (branchId === project.currentBranchId) return
    setSwitchingId(branchId)
    try {
      await switchBranch(project.id, branchId)
    } finally {
      setSwitchingId(null)
    }
  }

  async function handleOpenCommitDetail(commitId: string) {
    setCommitDetailState({ status: 'loading', commitId })
    try {
      const detail = await historyApi.getCommit(project.id, commitId)
      setCommitDetailState({ status: 'ready', detail })
    } catch (err) {
      setCommitDetailState({
        status: 'error',
        message: err instanceof ApiError ? err.message : '無法載入 commit 詳情',
      })
    }
  }

  async function handleCreateCommit() {
    if (!commitMessage.trim()) return
    setCreating(true)
    try {
      await createCommit(project.id, commitMessage.trim())
      addToast({ title: 'Commit 建立成功', message: commitMessage.trim() })
      setCommitMessage('')
      setCreateOpen(false)
    } catch (err) {
      addToast({
        title: 'Commit 建立失敗',
        message: err instanceof ApiError ? err.message : '請稍後再試',
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">Version history (commits)</div>
          <div className="mt-1 text-sm text-slate-600">專案的 commit 紀錄。點擊列可查看快照詳情。</div>
        </div>
        <Button variant="secondary" onClick={() => setCreateOpen(true)} disabled={!project.currentBranchId}>
          <Plus className="size-4" />
          New commit snapshot
        </Button>
      </div>

      {project.branches.length > 0 && (
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <GitBranch className="size-4 shrink-0 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">Branch：</span>
            {project.branches.map((branch) => (
              <button
                key={branch.id}
                type="button"
                disabled={switchingId !== null}
                onClick={() => handleSwitchBranch(branch.id)}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition ${
                  branch.id === project.currentBranchId
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50'
                }`}
              >
                {branch.name}
                {branch.isDefault && (
                  <span className="ml-0.5 opacity-60">default</span>
                )}
                {switchingId === branch.id && <span className="ml-1 opacity-60">…</span>}
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        {commits.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">尚無 commit 紀錄</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Message</th>
                  <th className="px-4 py-3 font-medium">Author</th>
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Branch</th>
                </tr>
              </thead>
              <tbody>
                {commits.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer border-t border-slate-200 hover:bg-slate-50"
                    onClick={() => handleOpenCommitDetail(c.id)}
                    title="點擊查看此 commit 的快照詳情"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <GitCommitHorizontal className="size-4 shrink-0 text-slate-400" />
                        <span className="font-medium text-slate-900">{c.message}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{getMemberDisplayName(c.authorUserId)}</td>
                    <td className="px-4 py-3 text-slate-600">{c.timestamp}</td>
                    <td className="px-4 py-3">
                      <Badge tone="info">{c.branchName}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        title="建立 Commit Snapshot"
        open={createOpen}
        onClose={() => { if (!creating) { setCreateOpen(false); setCommitMessage('') } }}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setCreateOpen(false); setCommitMessage('') }} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreateCommit} disabled={creating || !commitMessage.trim()}>
              <GitCommitHorizontal className="size-4" />
              {creating ? 'Creating…' : 'Create commit'}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            將快照目前 <strong>{project.scores.length}</strong> 個分譜的儲存路徑，
            記錄至分支 <strong>{project.currentBranchName}</strong> 的新 commit。
          </div>
          <div>
            <label className="text-sm font-medium text-slate-800">Commit message</label>
            <input
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="例：上傳第一版 Violin II 分譜"
              className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-slate-400 focus:outline-none"
            />
          </div>
        </div>
      </Modal>

      <CommitDetailModal
        projectId={project.id}
        state={commitDetailState}
        getScoreName={(scoreId) =>
          project.scores.find((s) => s.id === scoreId)?.title ?? scoreId.slice(0, 8)
        }
        onClose={() => setCommitDetailState({ status: 'idle' })}
      />
    </div>
  )
}

function CommitDetailModal({
  projectId: _projectId,
  state,
  getScoreName,
  onClose,
}: {
  projectId: string
  state: CommitDetailState
  getScoreName: (scoreId: string) => string
  onClose: () => void
}) {
  const isOpen = state.status !== 'idle'

  return (
    <Modal
      title="Commit 詳情"
      open={isOpen}
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      }
    >
      {state.status === 'loading' && (
        <div className="py-6 text-center text-sm text-slate-500">載入中…</div>
      )}
      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </div>
      )}
      {state.status === 'ready' && (
        <div className="grid gap-4">
          <div className="grid gap-1 text-sm">
            <div className="flex gap-2">
              <span className="w-20 shrink-0 font-medium text-slate-500">Message</span>
              <span className="text-slate-900">{state.detail.message}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-20 shrink-0 font-medium text-slate-500">Commit ID</span>
              <span className="font-mono text-xs text-slate-600">{state.detail.id}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-20 shrink-0 font-medium text-slate-500">建立時間</span>
              <span className="text-slate-600">{state.detail.created_at.slice(0, 16).replace('T', ' ')}</span>
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-slate-700">
              Score snapshots（{state.detail.score_versions.length}）
            </div>
            {state.detail.score_versions.length === 0 ? (
              <div className="text-sm text-slate-500">此 commit 無 score 快照</div>
            ) : (
              <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {state.detail.score_versions.map((sv) => {
                  const version = mapScoreVersion(sv)
                  return (
                    <div key={version.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-900">
                          {getScoreName(version.scoreId)}
                        </div>
                        <div className="truncate text-xs text-slate-500">{version.storagePath}</div>
                      </div>
                      <Badge>{version.fileType}</Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
