import { useMemo, useState } from 'react'
import type { Project } from '../../../types'
import { useAppState, useRequiredUser } from '../../../state/AppState'
import { Badge } from '../../primitives/Badge'
import { Button } from '../../primitives/Button'
import { Card } from '../../primitives/Card'
import { Modal } from '../../primitives/Modal'
import { useTranslation } from '../../../i18n'
import { GitBranch, GitMerge, Repeat2, Trash2 } from 'lucide-react'

export function BranchesPanel({ project }: { project: Project }) {
  const { createBranch, switchBranch, deleteBranch, mergeBranch, addToast } = useAppState()
  const currentUser = useRequiredUser()
  const { t } = useTranslation()
  const [createOpen, setCreateOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [branchName, setBranchName] = useState('')
  const [mergeFrom, setMergeFrom] = useState(project.currentBranchId)
  const [mergeInto, setMergeInto] = useState(
    project.branches.find((b) => b.isDefault)?.id ?? project.currentBranchId,
  )
  const [loading, setLoading] = useState(false)
  const [switchingBranchId, setSwitchingBranchId] = useState<string | null>(null)

  const canMerge = useMemo(() => {
    if (currentUser.role === 'admin') return true
    const me = project.members.find((m) => m.userId === currentUser.id)
    return me?.role === 'concertmaster'
  }, [currentUser, project.members])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">{t('branches.title')}</div>
          <div className="mt-1 text-sm text-slate-600">
            {t('branches.description')}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setCreateOpen(true)}>
            <GitBranch className="size-4" />
            {t('branches.createNew')}
          </Button>
          <Button variant="secondary" onClick={() => setMergeOpen(true)} disabled={!canMerge}>
            <GitMerge className="size-4" />
            {t('branches.mergeBranch')}
          </Button>
        </div>
      </div>

      {!canMerge && (
        <Card className="p-4">
          <div className="text-sm font-semibold text-slate-900">{t('branches.mergePermissions')}</div>
          <div className="mt-1 text-sm text-slate-600">
            {t('branches.mergePermissionsDescription')}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">{t('tabs.branches')}</div>
          <Badge tone="info">{project.currentBranchName}</Badge>
        </div>
        <div className="mt-3 space-y-2">
          {project.branches.length === 0 && (
            <div className="text-sm text-slate-500">{t('branches.noBranches')}</div>
          )}
          {project.branches.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium text-slate-900">{b.name}</div>
                {b.isDefault && <Badge>{t('common.default')}</Badge>}
                {b.id === project.currentBranchId && <Badge tone="success">{t('common.active')}</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={switchingBranchId === b.id}
                  onClick={async () => {
                    setSwitchingBranchId(b.id)
                    try {
                      await switchBranch(project.id, b.id)
                      addToast({ title: t('branches.switched'), message: b.name })
                    } catch {
                      addToast({ title: t('branches.switchFailed'), message: b.name })
                    } finally {
                      setSwitchingBranchId(null)
                    }
                  }}
                >
                  <Repeat2 className="size-4" />
                  {switchingBranchId === b.id ? t('common.switching') : t('common.switch')}
                </Button>
                {!b.isDefault && canMerge && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setDeleteTargetId(b.id)}
                  >
                    <Trash2 className="size-4 text-red-500" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Modal
        title={t('branches.createTitle')}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={loading}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={loading || !branchName.trim()}
              onClick={async () => {
                setLoading(true)
                try {
                  await createBranch(project.id, branchName.trim())
                  setCreateOpen(false)
                  addToast({ title: t('branches.created'), message: branchName.trim() })
                } finally {
                  setLoading(false)
                }
              }}
            >
              {t('common.create')}
            </Button>
          </div>
        }
      >
        <input
          value={branchName}
          onChange={(e) => setBranchName(e.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
          placeholder={t('branches.namePlaceholder')}
        />
      </Modal>

      <Modal
        title={t('branches.deleteTitle')}
        open={deleteTargetId !== null}
        onClose={() => setDeleteTargetId(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteTargetId(null)} disabled={loading}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={loading}
              onClick={async () => {
                if (!deleteTargetId) return
                const branchName = project.branches.find((b) => b.id === deleteTargetId)?.name ?? ''
                setLoading(true)
                try {
                  await deleteBranch(project.id, deleteTargetId)
                  setDeleteTargetId(null)
                  addToast({ title: t('branches.deleted'), message: branchName })
                } catch {
                  addToast({ title: t('branches.deleteFailed'), message: branchName })
                } finally {
                  setLoading(false)
                }
              }}
            >
              {t('common.confirmDelete')}
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-700">
          {t('branches.deletePrompt')}{' '}
          <span className="font-semibold">
            {project.branches.find((b) => b.id === deleteTargetId)?.name}
          </span>
          ? {t('branches.deleteWarning')}
        </div>
      </Modal>

      <Modal
        title={t('branches.mergeBranch')}
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMergeOpen(false)} disabled={loading}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!canMerge || loading}
              onClick={async () => {
                setLoading(true)
                try {
                  await mergeBranch(project.id, mergeFrom, mergeInto)
                  setMergeOpen(false)
                  addToast({ title: t('branches.mergeComplete') })
                } finally {
                  setLoading(false)
                }
              }}
            >
              {t('branches.confirmMerge')}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-sm font-medium text-slate-800">{t('common.from')}</div>
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
            <div className="text-sm font-medium text-slate-800">{t('common.into')}</div>
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
