import { useMemo, useState } from 'react'
import type { Project } from '../../../types'
import { useAppState, useRequiredUser } from '../../../state/AppState'
import { Badge } from '../../primitives/Badge'
import { Button } from '../../primitives/Button'
import { Card } from '../../primitives/Card'
import { Modal } from '../../primitives/Modal'
import { GitBranch, GitMerge, Repeat2 } from 'lucide-react'

export function BranchesPanel({ project }: { project: Project }) {
  const { createBranch, switchBranch, mergeBranch, addToast } = useAppState()
  const currentUser = useRequiredUser()
  const [createOpen, setCreateOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [branchName, setBranchName] = useState('')
  const [mergeFrom, setMergeFrom] = useState(project.currentBranchId)
  const [mergeInto, setMergeInto] = useState(
    project.branches.find((b) => b.isDefault)?.id ?? project.currentBranchId,
  )
  const [loading, setLoading] = useState(false)

  const canMerge = useMemo(() => {
    if (currentUser.role === 'admin') return true
    const me = project.members.find((m) => m.userId === currentUser.id)
    return me?.role === 'concertmaster'
  }, [currentUser, project.members])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">Branches / Versions</div>
          <div className="mt-1 text-sm text-slate-600">
            建立、切換與合併分支。僅 concertmaster 可合併。
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setCreateOpen(true)}>
            <GitBranch className="size-4" />
            Create new branch
          </Button>
          <Button variant="secondary" onClick={() => setMergeOpen(true)} disabled={!canMerge}>
            <GitMerge className="size-4" />
            Merge branch
          </Button>
        </div>
      </div>

      {!canMerge && (
        <Card className="p-4">
          <div className="text-sm font-semibold text-slate-900">Merge permissions</div>
          <div className="mt-1 text-sm text-slate-600">
            你的角色無法合併分支。僅 concertmaster 或平台管理員可合併。
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Branches</div>
          <Badge tone="info">{project.currentBranchName}</Badge>
        </div>
        <div className="mt-3 space-y-2">
          {project.branches.length === 0 && (
            <div className="text-sm text-slate-500">尚無分支。建立第一個 commit 後會自動產生 default branch。</div>
          )}
          {project.branches.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium text-slate-900">{b.name}</div>
                {b.isDefault && <Badge>default</Badge>}
                {b.id === project.currentBranchId && <Badge tone="success">active</Badge>}
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  switchBranch(project.id, b.id)
                  addToast({ title: '已切換分支', message: b.name })
                }}
              >
                <Repeat2 className="size-4" />
                Switch
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Modal
        title="Create branch"
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              disabled={loading || !branchName.trim()}
              onClick={async () => {
                setLoading(true)
                try {
                  await createBranch(project.id, branchName.trim())
                  setCreateOpen(false)
                  addToast({ title: '分支已建立', message: branchName.trim() })
                } finally {
                  setLoading(false)
                }
              }}
            >
              Create
            </Button>
          </div>
        }
      >
        <input
          value={branchName}
          onChange={(e) => setBranchName(e.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
          placeholder="e.g. bowing-update"
        />
      </Modal>

      <Modal
        title="Merge branch"
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMergeOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              disabled={!canMerge || loading}
              onClick={async () => {
                setLoading(true)
                try {
                  await mergeBranch(project.id, mergeFrom, mergeInto)
                  setMergeOpen(false)
                  addToast({ title: '合併完成' })
                } finally {
                  setLoading(false)
                }
              }}
            >
              Confirm merge
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-sm font-medium text-slate-800">From</div>
            <select
              value={mergeFrom}
              onChange={(e) => setMergeFrom(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              {project.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-sm font-medium text-slate-800">Into</div>
            <select
              value={mergeInto}
              onChange={(e) => setMergeInto(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              {project.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  )
}
