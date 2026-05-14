import { useMemo, useState } from 'react'
import type { Project } from '../../../types'
import { useAppState } from '../../../state/AppState'
import { Badge } from '../../primitives/Badge'
import { Button } from '../../primitives/Button'
import { Card } from '../../primitives/Card'
import { Modal } from '../../primitives/Modal'
import { GitBranch, GitMerge, Repeat2 } from 'lucide-react'

export function BranchesPanel({ project }: { project: Project }) {
  const { currentUser, createBranch, switchBranch, mergeBranch, addToast } = useAppState()
  const [createOpen, setCreateOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [branchName, setBranchName] = useState('new-branch')
  const [mergeFrom, setMergeFrom] = useState(project.branches[0] ?? 'main')
  const [mergeInto, setMergeInto] = useState('main')

  const canMerge = useMemo(() => {
    if (currentUser.role === 'admin') return true
    const me = project.members.find((m) => m.userId === currentUser.id)
    return !!me?.roles.includes('owner')
  }, [currentUser, project.members])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">Branches / Versions</div>
          <div className="mt-1 text-sm text-slate-600">
            Create/switch/merge branches (simulated). Only the project owner can merge.
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
            Your current role cannot merge branches. Switch to “project owner” on the Login page or header role switcher to demo merges.
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Current branch</div>
            <Badge tone="info">{project.currentBranch}</Badge>
          </div>
          <div className="mt-3 space-y-2">
            {project.branches.map((b) => (
              <div
                key={b}
                className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium text-slate-900">{b}</div>
                  {b === 'main' && <Badge>default</Badge>}
                  {b === project.currentBranch && <Badge tone="success">active</Badge>}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    switchBranch(project.id, b)
                    addToast({ title: 'Switched branch (simulated)', message: b })
                  }}
                >
                  <Repeat2 className="size-4" />
                  Switch
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold text-slate-900">Branch graph (mock)</div>
          <div className="mt-1 text-sm text-slate-600">
            Visual placeholder for a Git-like branch graph.
          </div>
          <pre className="mt-4 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-800">
{mockGraph(project.currentBranch)}
          </pre>
        </Card>
      </div>

      <Modal
        title="Create branch (simulated)"
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const name = branchName.trim()
                if (!name) return
                createBranch(project.id, name)
                setCreateOpen(false)
                addToast({ title: 'Branch created (simulated)', message: name })
              }}
            >
              Create
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-600">
          Creating a branch only updates local mock state.
        </div>
        <input
          value={branchName}
          onChange={(e) => setBranchName(e.target.value)}
          className="mt-3 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
          placeholder="e.g. bowing-update"
        />
      </Modal>

      <Modal
        title="Merge branch (simulated)"
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMergeOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!canMerge}
              onClick={() => {
                mergeBranch(project.id, mergeFrom, mergeInto)
                setMergeOpen(false)
                addToast({ title: 'Merged (simulated)', message: `${mergeFrom} → ${mergeInto}` })
              }}
            >
              Confirm merge
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-600">
          Owner-only. This creates a mock merge commit and switches to the target branch.
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-sm font-medium text-slate-800">From</div>
            <select
              value={mergeFrom}
              onChange={(e) => setMergeFrom(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              {project.branches.map((b) => (
                <option key={b} value={b}>
                  {b}
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
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!canMerge && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Permission warning: only the project owner can merge branches.
          </div>
        )}
      </Modal>
    </div>
  )
}

function mockGraph(activeBranch: string) {
  return [
    '*   c3 (main) Merge: violin-section-revision → main',
    '|\\',
    `| * c2 (${activeBranch === 'violin-section-revision' ? activeBranch : 'violin-section-revision'}) "Updated violin bowing for measures 12–18"`,
    '| |',
    `| * c1 (${activeBranch === 'bowing-update' ? activeBranch : 'bowing-update'}) "Adjusted cello fingering in rehearsal section B"`,
    '|/',
    '*   c0 (main) "Synced flute phrasing with conductor notes"',
  ].join('\n')
}
